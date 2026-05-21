"""
Shared GST verification helper using Sandbox.co.in API.
Used by /api/gst/verify (public lookup) and /api/customer/profile (server-side verify on save).
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)


async def verify_gstin(gstin: str) -> dict:
    """
    Verify a GSTIN against Sandbox.co.in.
    Returns dict with `valid` bool + company details on success.
    Raises ValueError for client-side failures (bad gstin, invalid).
    Raises RuntimeError for upstream/service failures.
    """
    gstin = (gstin or "").strip().upper()
    if not gstin or len(gstin) != 15:
        raise ValueError("Invalid GSTIN — must be 15 characters")

    sandbox_key = os.environ.get("SANDBOX_API_KEY")
    sandbox_secret = os.environ.get("SANDBOX_API_SECRET")
    if not sandbox_key or not sandbox_secret:
        raise RuntimeError("GST verification service not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        auth_resp = await client.post(
            "https://api.sandbox.co.in/authenticate",
            headers={
                "x-api-key": sandbox_key,
                "x-api-secret": sandbox_secret,
            },
        )
        token = (auth_resp.json() or {}).get("access_token", "")
        if not token:
            raise RuntimeError("Failed to authenticate with GST service")

        gst_resp = await client.post(
            "https://api.sandbox.co.in/gst/compliance/public/gstin/search",
            headers={
                "Authorization": token,
                "x-api-key": sandbox_key,
                "Content-Type": "application/json",
            },
            json={"gstin": gstin},
        )
        gst_data = gst_resp.json() or {}

        if gst_data.get("code") != 200:
            return {
                "valid": False,
                "message": gst_data.get("message", "GST verification failed"),
                "gstin": gstin,
            }

        info = gst_data.get("data", {}).get("data", {})
        addr = info.get("pradr", {}).get("addr", {})

        return {
            "valid": True,
            "gstin": gstin,
            "legal_name": info.get("lgnm", ""),
            "trade_name": info.get("tradeNam", ""),
            "business_type": info.get("ctb", ""),
            "gst_status": info.get("sts", ""),
            "registration_date": info.get("rgdt", ""),
            "city": addr.get("dst", ""),
            "state": addr.get("stcd", ""),
            "pincode": addr.get("pncd", ""),
            "address": f"{addr.get('bno', '')} {addr.get('flno', '')} {addr.get('st', '')} {addr.get('loc', '')}".strip(),
        }
