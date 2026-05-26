"""
Notifications Router
─────────────────────
Lightweight in-app notification system for internal users (admins,
accounts and vendors). Each notification is a row in `db.notifications`:

  {
    id, user_id, user_kind, title, body, link, kind, read, created_at
  }

Three audience-specific endpoint groups using the existing auth helpers:
  • /api/notifications/admin      → admin or accounts users
  • /api/notifications/vendor     → vendor (seller) users

In-app only (no Web Push). Web Push can be layered later on the same
publish() event hook.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

import auth_helpers

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])
db = None


def set_db(database):
    global db
    db = database


UserKind = Literal["admin", "accounts", "vendor", "supplier_manager"]


class NotificationOut(BaseModel):
    id: str
    title: str
    body: Optional[str] = ""
    link: Optional[str] = ""
    kind: Optional[str] = ""
    read: bool = False
    created_at: str


# ════════════════════════════════════════════════════════════════════
# PUBLISH (called from other routers via `from notifications_router
# import publish`).
# ════════════════════════════════════════════════════════════════════
async def publish(
    user_id: str,
    user_kind: UserKind,
    title: str,
    body: str = "",
    link: str = "",
    kind: str = "info",
) -> None:
    """Insert a notification row. Best-effort — never raises."""
    if db is None or not user_id:
        return
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_kind": user_kind,
            "title": title[:240],
            "body": (body or "")[:1200],
            "link": (link or "")[:500],
            "kind": kind[:60],
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.notifications.insert_one(doc.copy())
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[notifications.publish] {user_kind}/{user_id} failed: {e}")


async def broadcast_to_admins(title: str, body: str = "", link: str = "", kind: str = "info") -> int:
    """Send to every active admin + accounts user."""
    if db is None:
        return 0
    cursor = db.admins.find(
        {"$or": [{"active": True}, {"active": {"$exists": False}}]},
        {"_id": 0, "id": 1, "role": 1},
    )
    count = 0
    async for u in cursor:
        await publish(
            user_id=u.get("id"),
            user_kind="accounts" if u.get("role") == "accounts" else "admin",
            title=title, body=body, link=link, kind=kind,
        )
        count += 1
    return count


async def notify_vendor(seller_id: str, title: str, body: str = "", link: str = "", kind: str = "info") -> None:
    """Convenience wrapper to send a notification to a single vendor."""
    if not seller_id:
        return
    await publish(seller_id, "vendor", title, body, link, kind)


# ════════════════════════════════════════════════════════════════════
# Generic list helper
# ════════════════════════════════════════════════════════════════════
async def _list_for(user_id: str, user_kind: str, limit: int, unread_only: bool) -> dict:
    q: dict = {"user_id": user_id, "user_kind": user_kind}
    if unread_only:
        q["read"] = False
    rows = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user_id, "user_kind": user_kind, "read": False})
    return {"items": rows, "unread_count": unread}


# ════════════════════════════════════════════════════════════════════
# ADMIN / ACCOUNTS — uses existing auth_helpers.get_current_admin
# ════════════════════════════════════════════════════════════════════
@router.get("/admin")
async def list_admin_notifications(
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
    admin=Depends(auth_helpers.get_current_admin),
):
    kind = "accounts" if admin.get("role") == "accounts" else "admin"
    return await _list_for(admin["id"], kind, limit, unread_only)


@router.post("/admin/{notification_id}/read")
async def admin_mark_read(notification_id: str, admin=Depends(auth_helpers.get_current_admin)):
    kind = "accounts" if admin.get("role") == "accounts" else "admin"
    await db.notifications.update_one(
        {"id": notification_id, "user_id": admin["id"], "user_kind": kind},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}


@router.post("/admin/mark-all-read")
async def admin_mark_all_read(admin=Depends(auth_helpers.get_current_admin)):
    kind = "accounts" if admin.get("role") == "accounts" else "admin"
    r = await db.notifications.update_many(
        {"user_id": admin["id"], "user_kind": kind, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "marked": r.modified_count}


# ════════════════════════════════════════════════════════════════════
# VENDOR — re-implement the auth check inline to dodge circular import
# ════════════════════════════════════════════════════════════════════
from fastapi import Request


async def _current_vendor_id(request: Request) -> str:
    """Inline copy of vendor auth: reads bearer token, decodes JWT, looks
    up the seller row, returns its id. Keeps this module free of imports
    from vendor_router (which itself imports auth_helpers)."""
    import os as _os
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth.split(" ", 1)[1]
    try:
        import jwt as _jwt
        payload = _jwt.decode(token, _os.environ.get("JWT_SECRET", ""), algorithms=["HS256"])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="No sub claim")
    seller = await db.sellers.find_one({"id": sub}, {"_id": 0, "id": 1})
    if not seller:
        raise HTTPException(status_code=401, detail="Vendor not found")
    return seller["id"]


@router.get("/vendor")
async def list_vendor_notifications(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
):
    vid = await _current_vendor_id(request)
    return await _list_for(vid, "vendor", limit, unread_only)


@router.post("/vendor/{notification_id}/read")
async def vendor_mark_read(notification_id: str, request: Request):
    vid = await _current_vendor_id(request)
    await db.notifications.update_one(
        {"id": notification_id, "user_id": vid, "user_kind": "vendor"},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}


@router.post("/vendor/mark-all-read")
async def vendor_mark_all_read(request: Request):
    vid = await _current_vendor_id(request)
    r = await db.notifications.update_many(
        {"user_id": vid, "user_kind": "vendor", "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "marked": r.modified_count}
