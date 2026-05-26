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
# Customer must pay the balance invoice within this many hours of the
# vendor marking goods ready. Default 48h.
BALANCE_PAYMENT_TIMEOUT_HOURS = int(os.environ.get("BALANCE_PAYMENT_TIMEOUT_HOURS", "48"))


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


async def cancel_stale_balance_orders(db) -> dict:
    """Cancel orders whose balance invoice has been unpaid past the
    BALANCE_PAYMENT_TIMEOUT_HOURS window (default 48h) since goods were
    marked ready.

    Eligible orders:
      - balance_due_at exists and is in the past
      - payment_status ∈ {"balance_pending", "advance_paid"}
      - status NOT IN {"cancelled", "delivered"}

    Cancellation stamps `cancellation_reason="balance_payment_timeout"`
    and fires a best-effort customer + ops email so finance can chase or
    initiate the advance refund.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    query = {
        "balance_due_at": {"$lt": now_iso, "$exists": True, "$ne": ""},
        "payment_status": {"$in": ["balance_pending", "advance_paid"]},
        "status": {"$nin": ["cancelled", "delivered"]},
    }
    set_doc = {
        "$set": {
            "status": "cancelled",
            "cancellation_reason": "balance_payment_timeout",
            "cancelled_at": now_iso,
            "auto_cancelled_at": now_iso,
            "updated_at": now_iso,
        }
    }
    targets = []
    async for o in db.orders.find(query, {"_id": 0, "id": 1, "order_number": 1,
                                          "customer": 1, "advance_amount": 1, "balance_amount": 1}):
        targets.append(o)
    if not targets:
        return {"balance_cancelled": 0, "swept_at": now_iso, "cutoff_hours": BALANCE_PAYMENT_TIMEOUT_HOURS}

    res = await db.orders.update_many(query, set_doc)

    # Best-effort notifications — never let a failed email break the sweep.
    for t in targets:
        try:
            from internal_events import fire_internal_event, OrderEvent
            await fire_internal_event(
                OrderEvent.ORDER_CANCELLED, t,
                extra={"reason": "balance_payment_timeout"},
            )
        except Exception:  # noqa: BLE001
            pass

    return {
        "balance_cancelled": res.modified_count,
        "swept_at": now_iso,
        "cutoff_hours": BALANCE_PAYMENT_TIMEOUT_HOURS,
    }



async def cancel_stale_vendor_orders(db) -> dict:
    """DEPRECATED (Feb 2026): vendor 24h Accept/Cancel SLA was removed
    per product decision — orders are auto-confirmed at payment capture
    and the vendor goes straight to "Mark Ready". This sweep is now a
    no-op. Kept around so the scheduler still picks it up without
    blowing up, but it returns 0 every time."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return {"vendor_auto_cancelled": 0, "swept_at": now_iso, "deprecated": True}

    # ─── Legacy implementation (kept commented for audit, dead code) ───
    # query = {  # noqa: F841
    #     "vendor_acceptance_status": "pending",
    #     "vendor_action_deadline": {"$lt": now_iso},
    #     "status": {"$nin": ["cancelled", "delivered"]},
    # }


async def start_autocancel_poller(db):
    """Long-running task. Wait one minute after boot so the app is fully
    ready, then sweep every `POLL_INTERVAL_SECONDS` (default hourly)."""
    await asyncio.sleep(60)
    # Soft-backfill: stamp `balance_due_at` on any historical goods_ready
    # order that's still pending balance payment but missing the new field.
    # We anchor it off `goods_ready_at` + BALANCE_PAYMENT_TIMEOUT_HOURS.
    try:
        cursor = db.orders.find(
            {
                "status": {"$nin": ["cancelled", "delivered"]},
                "payment_status": {"$in": ["balance_pending", "advance_paid"]},
                "goods_ready_at": {"$exists": True, "$ne": ""},
                "$or": [{"balance_due_at": {"$exists": False}}, {"balance_due_at": ""}],
            },
            {"_id": 0, "id": 1, "goods_ready_at": 1},
        )
        backfilled = 0
        async for o in cursor:
            try:
                gr = datetime.fromisoformat(o["goods_ready_at"].replace("Z", "+00:00"))
                due = (gr + timedelta(hours=BALANCE_PAYMENT_TIMEOUT_HOURS)).isoformat()
                await db.orders.update_one(
                    {"id": o["id"]},
                    {"$set": {"balance_due_at": due}},
                )
                backfilled += 1
            except Exception:  # noqa: BLE001
                pass
        if backfilled:
            logger.info("Balance-due backfill stamped %d orders", backfilled)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Balance-due backfill skipped: {e}")

    logger.info(
        "Auto-cancel poller online · rzp=%dh credit=%dh balance=%dh interval=%ds",
        CUTOFF_HOURS_RAZORPAY, CUTOFF_HOURS_CREDIT, BALANCE_PAYMENT_TIMEOUT_HOURS, POLL_INTERVAL_SECONDS,
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
            b_result = await cancel_stale_balance_orders(db)
            if b_result.get("balance_cancelled"):
                logger.info(
                    "Balance-payment-timeout sweep · cancelled=%d (cutoff=%dh)",
                    b_result["balance_cancelled"], b_result.get("cutoff_hours", 48),
                )
        except Exception as e:  # noqa: BLE001
            logger.error(f"Auto-cancel sweep failed: {e}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
