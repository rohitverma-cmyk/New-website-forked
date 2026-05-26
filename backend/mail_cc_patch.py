"""
Outbound-mail CC monkey-patch
─────────────────────────────
At app startup we wrap `resend.Emails.send` so every outbound email
automatically lands in the ops inbox (`mail@locofast.com`) via CC,
without touching the 30+ existing send call sites.

Behaviour:
  • CC value comes from the `OPS_CC_EMAIL` env var (default
    `mail@locofast.com`). Set it to empty string to disable globally.
  • Skipped when the CC address is already the sole recipient (avoids
    self-CC loops where ops emails ops).
  • Skipped when the caller already passed an explicit `cc` that
    contains the address (don't duplicate).
  • Passing `params["skip_ops_cc"] = True` opts a single send out
    (used by purely-internal sends that don't need a copy — e.g.
    daily-summary emails that already go to mail@locofast.com).
  • Idempotent — `install()` only patches once.

This module is imported and `install()` called from server.py at boot.
"""
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

_INSTALLED = False
_ORIGINAL_SEND = None


def _normalize(addr: Any) -> list:
    """Coerce a Resend `to`/`cc` field (str | list | None) into a list."""
    if not addr:
        return []
    if isinstance(addr, str):
        return [addr.strip()] if addr.strip() else []
    if isinstance(addr, list):
        return [str(a).strip() for a in addr if str(a).strip()]
    return []


def _patched_send(params: dict):
    """Wrapper that injects `mail@locofast.com` as CC on every send."""
    ops_cc = (os.environ.get("OPS_CC_EMAIL", "mail@locofast.com") or "").strip().lower()
    if not ops_cc:
        return _ORIGINAL_SEND(params)

    # Per-call opt-out for purely-internal sends that already go to ops.
    if params.pop("skip_ops_cc", False):
        return _ORIGINAL_SEND(params)

    to_list = [a.lower() for a in _normalize(params.get("to"))]
    cc_list = _normalize(params.get("cc"))
    cc_lower = [a.lower() for a in cc_list]

    # Don't self-CC when ops is the only recipient.
    if to_list == [ops_cc]:
        return _ORIGINAL_SEND(params)

    if ops_cc not in cc_lower and ops_cc not in to_list:
        cc_list.append("mail@locofast.com")  # preserve display casing
        params["cc"] = cc_list

    return _ORIGINAL_SEND(params)


def install():
    """Idempotent install. Called once from server.py at boot."""
    global _INSTALLED, _ORIGINAL_SEND
    if _INSTALLED:
        return
    try:
        import resend  # type: ignore
    except ImportError:
        logger.warning("[mail-cc-patch] resend SDK not installed — skipping")
        return
    if _ORIGINAL_SEND is None:
        _ORIGINAL_SEND = resend.Emails.send
    resend.Emails.send = _patched_send  # type: ignore[assignment]
    _INSTALLED = True
    logger.info("[mail-cc-patch] installed · all outbound mail auto-CC's mail@locofast.com")
