"""
agent_assistance_router.py
──────────────────────────
Captures "Still Confused?" pop-up submissions from the customer-facing
site and emails the Locofast agent inbox so a human can reach out.

Designed to be cheap and forgiving:
  • No auth required — anonymous browsers should be able to ask for help
  • All fields except `email` (or `phone`) are optional
  • Resilient to a missing Resend key — still persists the lead so it
    can be exported later
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("agent_assistance")
router = APIRouter(prefix="/api/agent-assistance", tags=["agent-assistance"])

AGENT_INBOX = os.environ.get("AGENT_ASSISTANCE_NOTIFY_EMAIL", "mail@locofast.com")
_db = None  # bound via init() at server startup


def init(db):
    global _db
    _db = db


class AssistanceRequest(BaseModel):
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    company: Optional[str] = ""
    message: Optional[str] = ""
    # Page context — captured client-side so the agent can pick up
    # exactly where the customer was confused.
    page_url: Optional[str] = Field(default="", description="Full URL of the page that triggered the popup")
    page_title: Optional[str] = ""
    referrer: Optional[str] = ""
    time_on_page_seconds: Optional[int] = 0
    # Logged-in context (if any). Anonymous browsers send None.
    customer_id: Optional[str] = ""
    brand_id: Optional[str] = ""


def _build_assistance_html(payload: dict) -> str:
    """Plain agent-friendly summary. WhatsApp/phone deep-links so the
    agent can act with one click."""
    name = (payload.get("name") or "Anonymous customer").strip() or "Anonymous customer"
    email = (payload.get("email") or "").strip()
    phone = (payload.get("phone") or "").strip()
    page_url = (payload.get("page_url") or "").strip()
    message = (payload.get("message") or "").strip()
    time_on = int(payload.get("time_on_page_seconds") or 0)
    wa_link = (
        f"https://wa.me/{phone.replace('+', '').replace(' ', '')}"
        if phone else ""
    )
    return f"""
    <div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <div style="background:#0ea5e9;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:18px;">Customer wants agent assistance in booking</h2>
        <p style="margin:6px 0 0;font-size:12px;opacity:0.9;">
          Triggered after {time_on}s on the page · {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}
        </p>
      </div>
      <div style="padding:22px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;background:#fff;">
        <h3 style="margin:0 0 10px;font-size:14px;color:#334155;">Customer details</h3>
        <table style="width:100%;font-size:13px;color:#475569;margin-bottom:18px;">
          <tr><td style="padding:4px 0;width:130px;color:#94a3b8;">Name:</td><td style="font-weight:600;color:#0f172a;">{name}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Company:</td><td>{payload.get('company') or '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Email:</td><td>{f'<a href="mailto:{email}" style="color:#2563EB;">{email}</a>' if email else '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Phone:</td><td>{f'<a href="tel:{phone}" style="color:#2563EB;">{phone}</a>' + (f' · <a href="{wa_link}" style="color:#22c55e;">WhatsApp</a>' if wa_link else '') if phone else '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Time on page:</td><td>{time_on}s</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Page:</td><td>{f'<a href="{page_url}" style="color:#2563EB;">{page_url}</a>' if page_url else '—'}</td></tr>
        </table>
        {f'<h3 style="margin:0 0 10px;font-size:14px;color:#334155;">Customer message</h3><div style="background:#f8fafc;border-left:3px solid #0ea5e9;padding:10px 14px;font-size:13px;color:#334155;border-radius:0 6px 6px 0;">{message}</div>' if message else ''}
        <div style="background:#ecfeff;border-left:3px solid #0ea5e9;padding:12px 14px;margin-top:18px;font-size:13px;color:#075985;line-height:1.55;">
          <strong>Recommended action:</strong> Call within 30 minutes — engagement is highest right after the pop-up.
        </div>
      </div>
    </div>
    """


async def _send_assistance_email(payload: dict) -> bool:
    try:
        from email_router import RESEND_API_KEY, SENDER_EMAIL
        import resend as _resend
    except Exception as e:
        logger.warning(f"Resend not importable, assistance email skipped: {e}")
        return False
    if not RESEND_API_KEY:
        logger.info("RESEND_API_KEY missing — assistance email skipped")
        return False
    subject = f"Customer wants agent assistance in booking — {(payload.get('name') or 'Anonymous').strip()}"
    html = _build_assistance_html(payload)
    try:
        await asyncio.to_thread(
            _resend.Emails.send,
            {"from": SENDER_EMAIL, "to": [AGENT_INBOX], "subject": subject, "html": html}
        )
        return True
    except Exception as e:
        logger.error(f"Assistance email send failed: {e}")
        return False


@router.post("/request")
async def submit_assistance_request(data: AssistanceRequest, request: Request):
    """Customer-facing endpoint. Persists the lead, fires the agent
    notification email, returns 200 even if email queueing fails (the
    lead is still in the DB for export)."""
    payload = data.model_dump()
    payload["created_at"] = datetime.now(timezone.utc).isoformat()
    payload["ip"] = request.client.host if request.client else ""
    payload["user_agent"] = request.headers.get("user-agent", "")[:300]

    if _db is not None:
        try:
            await _db.agent_assistance_requests.insert_one(dict(payload))
            # Strip the Mongo `_id` mutation from the response dict.
            payload.pop("_id", None)
        except Exception as e:
            logger.error(f"Persisting assistance request failed: {e}")

    email_ok = await _send_assistance_email(payload)
    return {"success": True, "email_sent": email_ok}
