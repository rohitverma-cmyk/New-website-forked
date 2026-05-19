"""
Auto-cancel stale orders.

Background poller that runs every hour and cancels orders whose payment
never completed. Two cutoffs:

  - Razorpay orders (payment_method != "credit"): cancel if
    `payment_status == "initiated"` and `created_at` > AUTOCANCEL_CUTOFF_HOURS_RAZORPAY (default 72h).
  - Credit-line orders (payment_method == "credit"): cancel if
    `payment_status == "initiated"` and `created_at` > AUTOCANCEL_CUTOFF_HOURS_CREDIT (default 168h = 7d).

Cancellation is intentionally silent (no customer email, no agent email)
per the product spec. The order doc gets `status: "cancelled"`,
`cancellation_reason: "auto_cancelled_payment_timeout"`, and an
`auto_cancelled_at` timestamp so reporting can distinguish these from
manual cancellations.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = int(os.environ.get("AUTOCANCEL_POLL_INTERVAL_SECONDS", "3600"))
CUTOFF_HOURS_RAZORPAY = int(os.environ.get("AUTOCANCEL_CUTOFF_HOURS_RAZORPAY", "72"))
CUTOFF_HOURS_CREDIT = int(os.environ.get("AUTOCANCEL_CUTOFF_HOURS_CREDIT", "168"))  # 7 days
# Vendor must accept/cancel an assigned order within this many hours.
# After the deadline the order is auto-cancelled (refund initiated for
# any advance), customer + internal stakeholders notified.
VENDOR_SLA_HOURS = int(os.environ.get("VENDOR_ACCEPT_SLA_HOURS", "24"))


def _iso_minus_hours(hours: int) -> str:
    """Compute the cutoff timestamp in ISO format. We use string compare
    because `created_at` is stored as an ISO string throughout the codebase
    — using `datetime` would require migrating every write site."""
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


async def cancel_stale_orders(db) -> dict:
    """Single sweep. Returns counts of what was cancelled."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # Razorpay (and any non-credit) cohort
    rzp_cutoff = _iso_minus_hours(CUTOFF_HOURS_RAZORPAY)
    rzp_query = {
        "payment_status": "initiated",
        "payment_method": {"$ne": "credit"},
        "status": {"$ne": "cancelled"},
        "created_at": {"$lt": rzp_cutoff},
    }
    rzp_set = {
        "$set": {
            "status": "cancelled",
            "payment_status": "expired",
            "cancellation_reason": "auto_cancelled_payment_timeout",
            "cancelled_at": now_iso,
            "auto_cancelled_at": now_iso,
            "updated_at": now_iso,
        }
    }
    rzp_res = await db.orders.update_many(rzp_query, rzp_set)

    # Credit cohort
    cr_cutoff = _iso_minus_hours(CUTOFF_HOURS_CREDIT)
    cr_query = {
        "payment_status": "initiated",
        "payment_method": "credit",
        "status": {"$ne": "cancelled"},
        "created_at": {"$lt": cr_cutoff},
    }
    cr_set = {
        "$set": {
            "status": "cancelled",
            "payment_status": "expired",
            "cancellation_reason": "auto_cancelled_credit_timeout",
            "cancelled_at": now_iso,
            "auto_cancelled_at": now_iso,
            "updated_at": now_iso,
        }
    }
    cr_res = await db.orders.update_many(cr_query, cr_set)

    return {
        "razorpay_cancelled": rzp_res.modified_count,
        "credit_cancelled": cr_res.modified_count,
        "razorpay_cutoff_hours": CUTOFF_HOURS_RAZORPAY,
        "credit_cutoff_hours": CUTOFF_HOURS_CREDIT,
        "swept_at": now_iso,
    }


async def cancel_stale_vendor_orders(db) -> dict:
    """Vendor 24h SLA sweep. An order with `vendor_acceptance_status: pending`
    and `vendor_action_deadline` past now is auto-cancelled the same way a
    vendor-cancellation would: order.status → cancelled, customer email,
    internal mail chain. Multi-vendor orders are cancelled in full (single
    payment makes per-vendor partial cancel non-trivial; sales ops can
    re-place the order against another vendor)."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    sla_cutoff = now_iso
    query = {
        "vendor_acceptance_status": "pending",
        "vendor_action_deadline": {"$lt": sla_cutoff},
        "status": {"$nin": ["cancelled", "delivered"]},
    }
    cancelled_orders = []
    async for o in db.orders.find(query, {"_id": 0}):
        cancelled_orders.append(o)

    if not cancelled_orders:
        return {"vendor_auto_cancelled": 0, "swept_at": now_iso}

    for o in cancelled_orders:
        await db.orders.update_one(
            {"id": o["id"]},
            {"$set": {
                "status": "cancelled",
                "vendor_acceptance_status": "auto_cancelled",
                "cancellation_reason": "vendor_sla_missed",
                "cancelled_at": now_iso,
                "auto_cancelled_at": now_iso,
                "updated_at": now_iso,
            }}
        )
        # Notify customer + internal stakeholders. Best-effort.
        try:
            from email_router import send_order_cancellation_email  # type: ignore
            await send_order_cancellation_email(o, reason="The supplier did not confirm within 24 hours. Your advance will be refunded shortly.")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[vendor-sla] customer cancel email failed for {o.get('order_number')}: {e}")
        try:
            from internal_events import fire_internal_event, OrderEvent
            await fire_internal_event(OrderEvent.VENDOR_AUTO_CANCELLED, o, extra={
                "reason": "Vendor did not accept within 24h SLA",
                "deadline": o.get("vendor_action_deadline"),
            })
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[vendor-sla] internal event failed for {o.get('order_number')}: {e}")
        logger.info(f"[vendor-sla] auto-cancelled {o.get('order_number')}")

    return {"vendor_auto_cancelled": len(cancelled_orders), "swept_at": now_iso}


async def start_autocancel_poller(db):
    """Long-running task. Wait one minute after boot so the app is fully
    ready, then sweep every `POLL_INTERVAL_SECONDS` (default hourly)."""
    await asyncio.sleep(60)
    logger.info(
        "Auto-cancel poller online · rzp=%dh credit=%dh interval=%ds",
        CUTOFF_HOURS_RAZORPAY, CUTOFF_HOURS_CREDIT, POLL_INTERVAL_SECONDS,
    )
    while True:
        try:
            result = await cancel_stale_orders(db)
            if result["razorpay_cancelled"] or result["credit_cancelled"]:
                logger.info(
                    "Auto-cancel sweep · razorpay=%d credit=%d",
                    result["razorpay_cancelled"], result["credit_cancelled"],
                )
            v_result = await cancel_stale_vendor_orders(db)
            if v_result.get("vendor_auto_cancelled"):
                logger.info("Vendor SLA sweep · cancelled=%d", v_result["vendor_auto_cancelled"])
        except Exception as e:  # noqa: BLE001
            logger.error(f"Auto-cancel sweep failed: {e}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
