"""
checkout_dropoff_notifier.py
─────────────────────────────
Scans `orders` for customers who reached the address/payment-details
step but never paid, and pings the Locofast agent team so they can
phone the buyer and rescue the deal.

Trigger conditions (all must hold):
  • `payment_status` ∈ {pending, initiated, pending_advance}
  • `status` is NOT cancelled  (auto-cancel poller handles those)
  • `created_at` is older than DROPOFF_THRESHOLD_MINUTES (default 15)
  • `dropoff_email_sent` is not True  (one-shot — never re-email)
  • `customer.email` is present  (without it there's nothing to share)

Runs every DROPOFF_POLL_INTERVAL_SECONDS (default 300 = 5 min).

Email goes to DROPOFF_NOTIFY_EMAIL (default mail@locofast.com).
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("checkout_dropoff")

# ── Tunables (env-overridable) ──────────────────────────────────────
DROPOFF_THRESHOLD_MINUTES = int(os.environ.get("CHECKOUT_DROPOFF_MINUTES", "15"))
DROPOFF_POLL_INTERVAL_SECONDS = int(os.environ.get("CHECKOUT_DROPOFF_POLL_SECONDS", "300"))
DROPOFF_NOTIFY_EMAIL = os.environ.get("CHECKOUT_DROPOFF_NOTIFY_EMAIL", "mail@locofast.com")

UNPAID_STATUSES = {"pending", "initiated", "pending_advance"}


def _build_dropoff_html(order: dict) -> str:
    """Concise email body: customer contact card + cart line-items so
    the agent can call/WhatsApp with full context."""
    cust = order.get("customer") or {}
    items = order.get("items") or []
    rows = "".join(
        f"<tr>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #eee;'>"
        f"<strong>{(it.get('fabric_name') or 'Fabric')}</strong><br>"
        f"<span style='font-size:12px;color:#64748b;'>Code: {it.get('fabric_code') or '—'}</span>"
        f"</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #eee;text-align:center;'>{it.get('quantity') or 0}m</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #eee;text-align:right;'>"
        f"₹{float(it.get('price_per_meter') or 0):,.2f}/m</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;'>"
        f"₹{float(it.get('quantity') or 0) * float(it.get('price_per_meter') or 0):,.2f}</td>"
        f"</tr>"
        for it in items
    )
    total = float(order.get("total") or 0)
    addr_parts = [cust.get("address"), cust.get("city"), cust.get("state"), cust.get("pincode")]
    addr = ", ".join(p for p in addr_parts if p)
    created = order.get("created_at") or ""
    return f"""
    <div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <div style="background:#dc2626;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:18px;">Customer dropped on last step</h2>
        <p style="margin:6px 0 0;font-size:12px;opacity:0.9;">
          Address/payment page reached at {created[:19] if created else '—'} — no payment received in {DROPOFF_THRESHOLD_MINUTES} minutes
        </p>
      </div>
      <div style="padding:22px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;background:#fff;">
        <h3 style="margin:0 0 10px;font-size:14px;color:#334155;">Customer details</h3>
        <table style="width:100%;font-size:13px;color:#475569;margin-bottom:18px;">
          <tr><td style="padding:4px 0;width:120px;color:#94a3b8;">Name:</td><td style="font-weight:600;color:#0f172a;">{cust.get('name') or '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Company:</td><td>{cust.get('company') or '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Email:</td><td><a href="mailto:{cust.get('email','')}" style="color:#2563EB;">{cust.get('email') or '—'}</a></td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Phone:</td><td><a href="tel:{cust.get('phone','')}" style="color:#2563EB;">{cust.get('phone') or '—'}</a></td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">GSTIN:</td><td>{cust.get('gst_number') or '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Ship to:</td><td>{addr or '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Order ref:</td><td><strong>{order.get('order_number') or order.get('id','')}</strong></td></tr>
        </table>
        <h3 style="margin:0 0 10px;font-size:14px;color:#334155;">Cart at drop-off</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;color:#475569;text-align:left;">
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">Item</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">Qty</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">Rate</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:10px;text-align:right;font-weight:600;color:#0f172a;">Total cart value:</td>
              <td style="padding:10px;text-align:right;font-weight:700;color:#dc2626;">₹{total:,.2f}</td>
            </tr>
          </tfoot>
        </table>
        <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 14px;margin-top:18px;font-size:13px;color:#7f1d1d;line-height:1.55;">
          <strong>Recommended action:</strong> Call the customer within the next hour. Offer help with payment, sample swap, or pricing if cart value is high enough to justify a custom quote.
        </div>
      </div>
    </div>
    """


async def _send_dropoff_email(order: dict) -> bool:
    """Fire the email via the same `resend` SDK used by email_router.
    Returns True on success so the caller can stamp `dropoff_email_sent`."""
    try:
        from email_router import RESEND_API_KEY, SENDER_EMAIL
        import resend  # noqa: F401 — initialised by email_router import side-effect
    except Exception as e:
        logger.warning(f"Resend not importable, dropoff email skipped: {e}")
        return False
    if not RESEND_API_KEY:
        logger.info("RESEND_API_KEY missing — dropoff email skipped")
        return False
    import resend as _resend
    try:
        subject = f"Customer dropped on last step — {order.get('order_number') or order.get('id','')[:8]}"
        html = _build_dropoff_html(order)
        await asyncio.to_thread(
            _resend.Emails.send,
            {"from": SENDER_EMAIL, "to": [DROPOFF_NOTIFY_EMAIL], "subject": subject, "html": html}
        )
        return True
    except Exception as e:
        logger.error(f"Dropoff email send failed: {e}")
        return False


async def scan_once(db) -> dict:
    """One sweep — find expired unpaid orders and email each one once."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DROPOFF_THRESHOLD_MINUTES)
    cutoff_iso = cutoff.isoformat()
    # `created_at` is stored as ISO string in this codebase — string
    # comparison is lexicographic-safe for ISO-8601 with timezone.
    q = {
        "payment_status": {"$in": list(UNPAID_STATUSES)},
        "status": {"$ne": "cancelled"},
        "dropoff_email_sent": {"$ne": True},
        "created_at": {"$lt": cutoff_iso},
        "customer.email": {"$exists": True, "$nin": [None, ""]},
        "is_parent_order": {"$ne": True},
    }
    proj = {"_id": 0}
    sent = 0
    skipped = 0
    async for order in db.orders.find(q, proj):
        ok = await _send_dropoff_email(order)
        if ok:
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {
                    "dropoff_email_sent": True,
                    "dropoff_email_sent_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            sent += 1
        else:
            skipped += 1
    return {"sent": sent, "skipped": skipped, "cutoff": cutoff_iso}


async def start_dropoff_poller(db):
    """Boot-time poller — wait 90s on cold start (let services warm up)
    then sweep every DROPOFF_POLL_INTERVAL_SECONDS (default 5 min)."""
    await asyncio.sleep(90)
    logger.info(
        "checkout_dropoff_notifier: started "
        f"(threshold={DROPOFF_THRESHOLD_MINUTES}m, interval={DROPOFF_POLL_INTERVAL_SECONDS}s, "
        f"recipient={DROPOFF_NOTIFY_EMAIL})"
    )
    while True:
        try:
            result = await scan_once(db)
            if result["sent"] or result["skipped"]:
                logger.info(f"checkout_dropoff sweep: {result}")
        except Exception as e:
            logger.error(f"checkout_dropoff sweep failed: {e}")
        await asyncio.sleep(DROPOFF_POLL_INTERVAL_SECONDS)
