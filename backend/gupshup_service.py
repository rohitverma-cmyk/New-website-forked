"""
Gupshup WhatsApp OTP service — Enterprise Gateway flow.

Uses Gupshup's classic Enterprise Gateway (mediaapi.smsgupshup.com) which
the user's account is configured to deliver WhatsApp messages through.
Auth is userid + password (form-urlencoded), not the modern api.gupshup.io
apikey header.

Env keys (set in /app/backend/.env):
  GUPSHUP_USERID    — Numeric userid from Gupshup dashboard (e.g. 2000213118)
  GUPSHUP_PASSWORD  — Password for the gateway user
"""
import os
import re
import logging
import httpx

logger = logging.getLogger(__name__)

GUPSHUP_GATEWAY_URL = "https://mediaapi.smsgupshup.com/GatewayAPI/rest"


def normalize_indian_phone(raw: str) -> tuple[bool, str | None]:
    """
    Validate + normalize an Indian phone number to E.164 without '+'.

    Accepts: '9876543210', '+919876543210', '919876543210', '91 98765 43210'
    Returns (is_valid, '919876543210') or (False, None).

    Indian mobile numbers must start with 6, 7, 8, or 9 after the country code.
    """
    if not raw:
        return False, None
    digits = re.sub(r"\D", "", str(raw))

    if len(digits) == 10:
        if digits[0] not in "6789":
            return False, None
        return True, "91" + digits

    if len(digits) == 12 and digits.startswith("91"):
        if digits[2] not in "6789":
            return False, None
        return True, digits

    return False, None


def _build_otp_message(otp_code: str) -> str:
    """Locofast-branded OTP body. Multi-line preserved via real newlines —
    httpx will URL-encode them correctly when posted as form data."""
    return (
        f"Hi,\n\n"
        f"Your Locofast reference number is {otp_code}.\n\n"
        f"Thanks,\nTeam Locofast"
    )


async def send_whatsapp_otp(destination_phone_e164: str, otp_code: str) -> dict:
    """
    Send a 6-digit OTP via Gupshup Enterprise Gateway (WhatsApp channel
    on this account).

    `destination_phone_e164` must be E.164 without leading '+', e.g. 918130087033.
    Gupshup's gateway accepts `+91...` or `91...` for `send_to`; we send the
    `+`-prefixed form per the user's verified curl.

    Returns dict with `success: bool`, `message_id: str|None`, `error: str|None`.
    """
    userid = os.environ.get("GUPSHUP_USERID", "").strip()
    password = os.environ.get("GUPSHUP_PASSWORD", "")  # don't strip — pwd may contain leading/trailing quirks

    if not userid or not password:
        return {"success": False, "error": "Gupshup credentials not configured"}

    send_to = destination_phone_e164 if destination_phone_e164.startswith("+") else "+" + destination_phone_e164

    payload = {
        "userid": userid,
        "password": password,
        "method": "SendMessage",
        "send_to": send_to,
        "msg_type": "TEXT",
        "v": "1.1",
        "format": "json",
        "msg": _build_otp_message(otp_code),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                GUPSHUP_GATEWAY_URL,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=payload,
            )

        # Gupshup gateway returns either JSON (when format=json) or text fallback.
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}

        # Gupshup Enterprise success shape:
        #   {"response": {"id": "<msgId>", "phone": "+91...", "details": "Message sent successfully", "status": "success"}}
        # Failure shape:
        #   {"response": {"status": "error", "details": "<reason>", "id": null, "phone": "+91..."}}
        resp = (body.get("response") or {}) if isinstance(body, dict) else {}
        status_str = str(resp.get("status", "")).lower()
        msg_id = resp.get("id")
        details = resp.get("details") or ""

        if r.status_code in range(200, 300) and status_str == "success" and msg_id:
            logger.info(f"Gupshup OTP sent → {send_to}: id={msg_id}")
            return {"success": True, "message_id": msg_id, "raw": body}

        # Surface the most actionable error string we can find
        err_msg = details or body.get("message") or f"Gupshup error (HTTP {r.status_code})"
        logger.error(f"Gupshup send failed (status={r.status_code}): {body}")
        return {"success": False, "error": err_msg, "raw": body}

    except httpx.TimeoutException:
        return {"success": False, "error": "Gupshup request timed out"}
    except Exception as e:  # noqa: BLE001 — boundary
        logger.error(f"Gupshup send exception: {e}")
        return {"success": False, "error": str(e)}
