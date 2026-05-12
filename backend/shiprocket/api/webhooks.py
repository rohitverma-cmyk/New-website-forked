"""
Webhooks API Router for Shiprocket Integration

Receives real-time tracking + order-status updates from Shiprocket and
fans them into the application's `orders` collection so the customer
order-detail timeline (Payment → Paid → Processing → Shipped → Delivered)
auto-advances without admin intervention.

Webhook configuration (set in Shiprocket dashboard → Settings → Webhooks):
  • Tracking updates    → POST /api/shiprocket/webhooks/tracking
  • Order status updates → POST /api/shiprocket/webhooks/order-status
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Request

from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["Shiprocket Webhooks"])

# In-memory ring buffer for /events debug endpoint.
# 200 most-recent events kept; older entries dropped automatically.
_webhook_events: list[dict] = []
_MAX_EVENTS = 200

# Database reference — wired in by main.py at startup via set_db()
db = None


def set_db(database):
    """Wire the Mongo handle so webhook handlers can update `orders`."""
    global db
    db = database


# ──────────────────────────────────────────────────────────────────────────
# Status mapping  Shiprocket "current_status" / status_code → our 5-stage
# canonical order status. Shiprocket status codes reference:
#   https://apidocs.shiprocket.in/#tag/Webhooks
# We collapse fine-grained statuses (PICKED UP, IN TRANSIT, OFD) onto our
# coarser stages because the customer-facing timeline only has 5 dots.
# ──────────────────────────────────────────────────────────────────────────
_STATUS_MAP = {
    # delivered → terminal
    "delivered": "delivered",
    # in transit → "shipped" (already moving)
    "shipped": "shipped",
    "picked up": "shipped",
    "in transit": "shipped",
    "out for delivery": "shipped",
    "ofd": "shipped",
    "reached destination": "shipped",
    # processing/pickup-scheduled → "processing"
    "pickup scheduled": "processing",
    "ready to ship": "processing",
    "manifested": "processing",
    "pickup queued": "processing",
    "pickup generated": "processing",
    # exceptions
    "cancelled": "cancelled",
    "rto initiated": "cancelled",
    "rto delivered": "cancelled",
    "rto in transit": "cancelled",
    "lost": "cancelled",
}


def _map_status(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return _STATUS_MAP.get(raw.strip().lower())


# Promotion guard — never regress a delivered order back to processing
# (Shiprocket occasionally sends out-of-order events).
_STATUS_RANK = {
    "payment_pending": 0,
    "paid": 1,
    "confirmed": 2,
    "processing": 3,
    "shipped": 4,
    "delivered": 5,
    "cancelled": 99,
}


async def _apply_tracking_update(
    awb_code: Optional[str],
    shiprocket_shipment_id: Optional[int],
    shiprocket_order_id: Optional[str],
    raw_status: Optional[str],
    courier_name: Optional[str],
    event_time: datetime,
    location: Optional[str] = None,
    activity: Optional[str] = None,
):
    """Update the matching order in the local DB with the new tracking event."""
    if db is None:
        logger.warning("Shiprocket webhook arrived but db not initialised — skipping")
        return

    # Find the order — try every identifier Shiprocket might send.
    query = {"$or": []}
    if awb_code:
        query["$or"].append({"awb_code": awb_code})
    if shiprocket_shipment_id is not None:
        query["$or"].append({"shiprocket_shipment_id": shiprocket_shipment_id})
        query["$or"].append({"shiprocket_shipment_id": str(shiprocket_shipment_id)})
    if shiprocket_order_id:
        query["$or"].append({"shiprocket_order_id": shiprocket_order_id})
        query["$or"].append({"shiprocket_order_id": str(shiprocket_order_id)})
        # Shiprocket echoes back our internal order_number as `order_id`
        query["$or"].append({"order_number": shiprocket_order_id})

    if not query["$or"]:
        logger.warning("Shiprocket webhook lacked any usable order identifier")
        return

    order = await db.orders.find_one(query, {"_id": 0, "id": 1, "status": 1, "order_number": 1})
    if not order:
        logger.warning(f"Shiprocket webhook: no matching order for AWB={awb_code} "
                       f"shipment={shiprocket_shipment_id} order={shiprocket_order_id}")
        return

    new_stage = _map_status(raw_status)
    set_fields = {
        "shiprocket_last_event": (raw_status or "").strip(),
        "shiprocket_last_event_at": event_time.isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if awb_code:
        set_fields["awb_code"] = awb_code
    if courier_name:
        set_fields["courier_name"] = courier_name

    # Only flip status forward — never regress past a higher rank.
    current_rank = _STATUS_RANK.get(order.get("status", ""), 0)
    if new_stage and _STATUS_RANK.get(new_stage, 0) > current_rank:
        set_fields["status"] = new_stage
        if new_stage == "delivered":
            set_fields["delivered_at"] = event_time.isoformat()
        elif new_stage == "shipped":
            set_fields["shipped_at"] = event_time.isoformat()

    await db.orders.update_one({"id": order["id"]}, {"$set": set_fields})

    # Also append to a per-order tracking timeline collection for audit.
    await db.shiprocket_events.insert_one({
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "awb_code": awb_code,
        "raw_status": raw_status,
        "mapped_status": new_stage,
        "courier_name": courier_name,
        "location": location,
        "activity": activity,
        "event_time": event_time.isoformat(),
        "received_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(f"Shiprocket → order {order.get('order_number')} | "
                f"raw='{raw_status}' → stage='{new_stage or 'unchanged'}'")


def _push_event(payload: dict):
    """Append to the in-memory ring buffer (oldest dropped)."""
    _webhook_events.append(payload)
    if len(_webhook_events) > _MAX_EVENTS:
        del _webhook_events[: len(_webhook_events) - _MAX_EVENTS]


def _parse_event_time(raw) -> datetime:
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.now(timezone.utc)


@router.post("/tracking", response_model=APIResponse)
async def handle_tracking_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive a Shiprocket tracking event and propagate to local order."""
    try:
        body = await request.json()
        logger.info(f"Shiprocket tracking webhook payload: {body}")

        # Shiprocket's payload shape varies by event type — we accept either
        # flat fields or a nested `data` envelope.
        data = body.get("data") if isinstance(body.get("data"), dict) else body

        awb_code = (
            body.get("awb") or body.get("awb_code")
            or data.get("awb") or data.get("awb_code")
        )
        shipment_id = (
            body.get("shipment_id") or data.get("shipment_id")
        )
        sr_order_id = (
            body.get("order_id") or data.get("order_id")
        )
        raw_status = (
            body.get("current_status") or body.get("status")
            or data.get("current_status") or data.get("status")
        )
        courier_name = (
            body.get("courier_name") or data.get("courier_name")
            or body.get("courier") or data.get("courier")
        )
        # Shiprocket scan-event payloads include a location/city + an
        # activity string ("Bag Received", "Pickup Successful", etc.).
        location = (
            body.get("location") or data.get("location")
            or body.get("scan_location") or data.get("scan_location")
            or body.get("city") or data.get("city")
        )
        activity = (
            body.get("activity") or data.get("activity")
            or body.get("scan_remarks") or data.get("scan_remarks")
        )
        event_time = _parse_event_time(
            body.get("timestamp") or body.get("date") or data.get("timestamp") or data.get("date")
        )

        _push_event({
            "type": "tracking",
            "awb": awb_code,
            "status": raw_status,
            "location": location,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "raw": body,
        })

        # Dispatch heavy work to background — return 200 to Shiprocket fast.
        background_tasks.add_task(
            _apply_tracking_update,
            awb_code,
            shipment_id,
            str(sr_order_id) if sr_order_id is not None else None,
            raw_status,
            courier_name,
            event_time,
            location,
            activity,
        )

        return APIResponse(
            success=True,
            message="Webhook received",
            data={"awb": awb_code, "status": raw_status},
        )
    except Exception as e:
        logger.error(f"Shiprocket tracking webhook error: {e}")
        # Always 200 so Shiprocket doesn't retry-storm us.
        return APIResponse(success=False, message=f"Webhook accepted; processing failed: {e}", errors=[str(e)])


@router.post("/order-status", response_model=APIResponse)
async def handle_order_status_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive a Shiprocket order-status event and propagate to local order."""
    try:
        body = await request.json()
        logger.info(f"Shiprocket order-status webhook payload: {body}")

        data = body.get("data") if isinstance(body.get("data"), dict) else body
        awb_code = body.get("awb_code") or data.get("awb_code")
        shipment_id = body.get("shipment_id") or data.get("shipment_id")
        sr_order_id = body.get("order_id") or data.get("order_id")
        raw_status = body.get("status") or data.get("status")
        courier_name = body.get("courier_name") or data.get("courier_name")
        location = body.get("location") or data.get("location") or body.get("city") or data.get("city")
        activity = body.get("activity") or data.get("activity")
        event_time = _parse_event_time(body.get("timestamp") or data.get("timestamp"))

        _push_event({
            "type": "order_status",
            "status": raw_status,
            "location": location,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "raw": body,
        })

        background_tasks.add_task(
            _apply_tracking_update,
            awb_code,
            shipment_id,
            str(sr_order_id) if sr_order_id is not None else None,
            raw_status,
            courier_name,
            event_time,
            location,
            activity,
        )

        return APIResponse(success=True, message="Order-status webhook received")
    except Exception as e:
        logger.error(f"Shiprocket order-status webhook error: {e}")
        return APIResponse(success=False, message=f"Webhook accepted; processing failed: {e}", errors=[str(e)])


@router.get("/events", response_model=APIResponse)
async def get_recent_webhook_events(limit: int = 50):
    """Debug helper — returns the most recent webhook events from RAM."""
    recent = _webhook_events[-limit:] if _webhook_events else []
    return APIResponse(
        success=True,
        message=f"Retrieved {len(recent)} recent webhook events",
        data={"events": recent, "total": len(_webhook_events)},
    )
