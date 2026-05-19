"""Internal Mail Chain — Separate event-driven email pipeline.

Every order-state change fires a SEPARATE internal-only email to a fixed
list of stakeholders (Deepak / Ankush / Accounts / Animesh). These emails
are **never** sent to customers and **never** CC the customer.

Why a separate module:
  • Hard isolation from customer-facing email_router so a stakeholder
    address can never leak into a customer `to:` accidentally.
  • Single place to add a new event hook (just register an EventSpec).

Usage:
    from internal_events import fire_internal_event, OrderEvent
    await fire_internal_event(OrderEvent.ORDER_CONFIRMED, order, extra={...})
"""
from __future__ import annotations

import os
import asyncio
import logging
import resend
from datetime import datetime, timezone
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)

# ─── Config ─────────────────────────────────────────────────────
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("INTERNAL_SENDER_EMAIL") or os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# Internal stakeholders. Env-overridable via comma-separated list so the
# list can be tuned per-environment (staging vs prod) without code change.
DEFAULT_INTERNAL_CC = [
    "Deepak@locofast.com",
    "ankush.mehandiratta@locofast.com",
    "accounts@locofast.com",
    "animesh.sharma@locofast.com",
]
_INTERNAL_CC_ENV = os.environ.get("INTERNAL_ORDER_CC", "").strip()
INTERNAL_RECIPIENTS = (
    [e.strip() for e in _INTERNAL_CC_ENV.split(",") if e.strip()]
    if _INTERNAL_CC_ENV else DEFAULT_INTERNAL_CC
)

# DB handle injected by server bootstrap (see set_db()).
db = None


def set_db(database):
    global db
    db = database


class OrderEvent(str, Enum):
    ORDER_PLACED = "order_placed"             # Cart accepted, advance Razorpay order minted
    ADVANCE_PAID = "advance_paid"             # 10% advance captured (provisional)
    PAYMENT_CAPTURED = "payment_captured"     # Full payment captured (non-provisional)
    GOODS_READY = "goods_ready"               # Vendor marked goods ready
    ORDER_CONFIRMED = "order_confirmed"       # Balance captured, order fully paid
    ORDER_DISPATCHED = "order_dispatched"     # Shiprocket AWB generated
    ORDER_CANCELLED = "order_cancelled"       # Cancelled (admin/vendor/auto)
    VENDOR_ACCEPTED = "vendor_accepted"       # Vendor accepted within 24h
    VENDOR_REJECTED = "vendor_rejected"       # Vendor explicitly rejected
    VENDOR_AUTO_CANCELLED = "vendor_auto_cancelled"  # 24h SLA missed
    VENDOR_PAYOUT_PAID = "vendor_payout_paid"        # Accounts marked UTR


_SUBJECT_LABELS = {
    OrderEvent.ORDER_PLACED: "Order Placed",
    OrderEvent.ADVANCE_PAID: "Advance Payment Captured",
    OrderEvent.PAYMENT_CAPTURED: "Payment Captured",
    OrderEvent.GOODS_READY: "Order Marked Ready",
    OrderEvent.ORDER_CONFIRMED: "Order Confirmed",
    OrderEvent.ORDER_DISPATCHED: "Order Dispatched",
    OrderEvent.ORDER_CANCELLED: "Order Cancelled",
    OrderEvent.VENDOR_ACCEPTED: "Vendor Accepted Order",
    OrderEvent.VENDOR_REJECTED: "Vendor Rejected Order",
    OrderEvent.VENDOR_AUTO_CANCELLED: "Order Auto-Cancelled (Vendor SLA missed)",
    OrderEvent.VENDOR_PAYOUT_PAID: "Vendor Payout Paid",
}


def _money(amount) -> str:
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        return "₹0"
    return "₹" + f"{n:,.2f}"


def _row(label: str, value) -> str:
    return (
        f'<tr><td style="padding:6px 12px;color:#666;font-size:13px;'
        f'border-bottom:1px solid #f0f0f0;">{label}</td>'
        f'<td style="padding:6px 12px;font-size:13px;font-weight:600;'
        f'border-bottom:1px solid #f0f0f0;">{value}</td></tr>'
    )


def _build_html(event: OrderEvent, order: dict, extra: Optional[dict] = None) -> tuple[str, str]:
    extra = extra or {}
    order_number = order.get("order_number") or order.get("id", "")[:8]
    label = _SUBJECT_LABELS.get(event, event.value)
    subject = f"[Locofast Internal] {label} · {order_number}"

    customer = order.get("customer", {}) or {}
    items = order.get("items") or []
    qty_total = sum(float(i.get("actual_quantity") or i.get("quantity") or 0) for i in items)

    items_html = ""
    for it in items:
        q = it.get("actual_quantity") if it.get("actual_quantity") is not None else it.get("quantity", 0)
        items_html += (
            f'<tr><td style="padding:6px 8px;font-size:12px;border-bottom:1px solid #f5f5f5;">'
            f'<strong>{it.get("fabric_name","")}</strong>'
            f'<br><span style="color:#888;font-size:11px;">{it.get("fabric_code","")} · '
            f'Seller: {it.get("seller_company","")}</span></td>'
            f'<td style="padding:6px 8px;text-align:right;font-size:12px;'
            f'border-bottom:1px solid #f5f5f5;">{q}m</td>'
            f'<td style="padding:6px 8px;text-align:right;font-size:12px;'
            f'border-bottom:1px solid #f5f5f5;">₹{it.get("price_per_meter",0)}/m</td></tr>'
        )

    rows = [
        _row("Order #", order_number),
        _row("Customer", f"{customer.get('name','')} ({customer.get('email','')})"),
        _row("Company", customer.get("company", "—")),
        _row("Phone", customer.get("phone", "—")),
        _row("Total", _money(order.get("total") or order.get("actual_total"))),
    ]
    if order.get("is_provisional"):
        rows.append(_row("Advance", _money(order.get("advance_amount"))))
        rows.append(_row("Balance", _money(order.get("balance_amount"))))
    rows.append(_row("Payment Status", order.get("payment_status", "—")))
    rows.append(_row("Status", order.get("status", "—")))

    # Per-event extras
    extra_html = ""
    if extra:
        extra_rows = "".join(_row(k.replace("_", " ").title(), v) for k, v in extra.items() if v not in (None, ""))
        if extra_rows:
            extra_html = (
                f'<h3 style="color:#111;font-size:14px;margin:18px 0 6px;">Event Details</h3>'
                f'<table style="width:100%;border-collapse:collapse;background:#fff;'
                f'border:1px solid #eee;border-radius:6px;">{extra_rows}</table>'
            )

    html = f"""
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:#f5f7fb;margin:0;padding:24px;color:#222;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;
              border:1px solid #e6e6ef;overflow:hidden;">
    <div style="background:#0F172A;color:#fff;padding:14px 20px;">
      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#94a3b8;">LOCOFAST · INTERNAL</p>
      <h2 style="margin:4px 0 0;font-size:18px;">{label}</h2>
    </div>
    <div style="padding:20px;">
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:6px;">
        {''.join(rows)}
      </table>
      {extra_html}
      <h3 style="color:#111;font-size:14px;margin:18px 0 6px;">Items ({len(items)} · {qty_total:.0f}m)</h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;
                    border:1px solid #eee;border-radius:6px;">
        {items_html}
      </table>
      <p style="margin:18px 0 0;color:#888;font-size:11px;">
        Fired at {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")} ·
        Event: <code>{event.value}</code>. This is an internal-only notification —
        the customer has NOT been CC'd on this email.
      </p>
    </div>
  </div>
</body></html>"""
    return subject, html


async def fire_internal_event(
    event: OrderEvent,
    order: dict,
    extra: Optional[dict] = None,
) -> None:
    """Send one internal email per event. Best-effort. Always logs to
    `email_logs` (kind=`internal_<event>`) for audit. Never raises."""
    if not RESEND_API_KEY:
        logger.warning(f"[internal-events] {event.value} skipped — RESEND_API_KEY not set")
        return
    if not INTERNAL_RECIPIENTS:
        logger.warning(f"[internal-events] {event.value} skipped — no recipients configured")
        return

    try:
        subject, html = _build_html(event, order, extra)
        params = {
            "from": SENDER_EMAIL,
            "to": INTERNAL_RECIPIENTS,
            "subject": subject,
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"[internal-events] sent {event.value} · {order.get('order_number')}")
        await _log(event, order, subject, html, "sent", None, extra)
    except Exception as e:  # noqa: BLE001
        logger.error(f"[internal-events] {event.value} failed: {e}")
        try:
            await _log(event, order, subject if "subject" in locals() else event.value,
                       html if "html" in locals() else "", "failed", str(e), extra)
        except Exception:
            pass


async def _log(event: OrderEvent, order: dict, subject: str, html: str,
               status: str, error: Optional[str], extra: Optional[dict]) -> None:
    if db is None:
        return
    try:
        import uuid
        await db.email_logs.insert_one({
            "id": str(uuid.uuid4()),
            "kind": f"internal_{event.value}",
            "recipients": INTERNAL_RECIPIENTS,
            "subject": subject,
            "html": html,
            "status": status,
            "error": error,
            "order_id": order.get("id"),
            "order_number": order.get("order_number"),
            "meta": extra or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[internal-events] log insert failed: {e}")
