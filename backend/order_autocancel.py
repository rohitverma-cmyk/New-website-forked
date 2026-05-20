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
