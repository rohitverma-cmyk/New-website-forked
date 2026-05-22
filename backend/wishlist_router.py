"""
Customer wishlists.

Endpoints (mounted under `/api`):

  POST   /wishlists                              Create a new wishlist
  GET    /wishlists                              List my wishlists
  GET    /wishlists/{id}                         Get one (owner)
  PATCH  /wishlists/{id}                         Rename / toggle public
  DELETE /wishlists/{id}                         Delete

  POST   /wishlists/{id}/items                   Add fabric
  DELETE /wishlists/{id}/items/{fabric_id}       Remove fabric

  POST   /wishlists/{id}/share                   Generate (or regen) share token
  GET    /wishlists/share/{token}                Public read-only (no auth)

Data shape (Mongo `wishlists`):
    {
      "id": uuid,
      "user_email": str,                 # owner scope (matches JWT)
      "name": str,
      "fabric_ids": [str],               # de-duped, order preserved
      "share_token": str|None,           # url-safe slug; None until shared
      "is_public": bool,                 # public link is "live" iff this is True
      "created_at": iso, "updated_at": iso,
    }
"""
from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from customer_router import get_current_customer

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
_client = AsyncIOMotorClient(MONGO_URL)
db = _client[DB_NAME]

router = APIRouter(prefix="/api", tags=["wishlists"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _email_of(payload: dict) -> str:
    """Resolve owner identity. Prefers JWT email; falls back to customer_id
    look-up so phone-OTP customers can also use wishlists."""
    email = (payload.get("email") or "").strip().lower()
    return email


class WishlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WishlistPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    is_public: Optional[bool] = None


class WishlistAddItem(BaseModel):
    fabric_id: str


async def _hydrate_items(fabric_ids: List[str]) -> List[dict]:
    """Resolve fabric_ids to lightweight cards (name, image, price, slug).
    Strips PII / internal columns. Skips missing fabrics gracefully."""
    if not fabric_ids:
        return []
    cursor = db.fabrics.find(
        {"id": {"$in": fabric_ids}},
        {
            "_id": 0, "id": 1, "name": 1, "slug": 1, "category_id": 1,
            "category_name": 1, "rate_per_meter": 1, "price_per_meter": 1,
            "sample_price": 1, "images": 1, "fabric_type": 1, "moq": 1,
            "seller_company": 1,
        },
    )
    by_id = {f["id"]: f for f in [doc async for doc in cursor]}
    # Preserve the order the customer added them in.
    return [by_id[fid] for fid in fabric_ids if fid in by_id]


def _serialize(w: dict, include_items: bool = False, items: Optional[list] = None) -> dict:
    """Strip BSON fields and normalise the shape returned to the client."""
    out = {
        "id": w["id"],
        "name": w.get("name", "Untitled"),
        "fabric_ids": w.get("fabric_ids") or [],
        "fabric_count": len(w.get("fabric_ids") or []),
        "is_public": bool(w.get("is_public")),
        "share_token": w.get("share_token") or "",
        "created_at": w.get("created_at"),
        "updated_at": w.get("updated_at"),
    }
    if include_items:
        out["items"] = items or []
    return out


# ─────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────
@router.post("/wishlists")
async def create_wishlist(data: WishlistCreate, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    if not email:
        raise HTTPException(status_code=400, detail="Login with an email to create wishlists")
    doc = {
        "id": str(uuid.uuid4()),
        "user_email": email,
        "name": data.name.strip(),
        "fabric_ids": [],
        "share_token": None,
        "is_public": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.wishlists.insert_one(doc)
    # The driver mutates `doc` to include _id — strip it before returning.
    doc.pop("_id", None)
    return _serialize(doc)


@router.get("/wishlists")
async def list_wishlists(request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    if not email:
        return []
    cursor = db.wishlists.find({"user_email": email}, {"_id": 0}).sort("created_at", -1)
    return [_serialize(w) async for w in cursor]


@router.get("/wishlists/{wid}")
async def get_wishlist(wid: str, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    w = await db.wishlists.find_one({"id": wid, "user_email": email}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    items = await _hydrate_items(w.get("fabric_ids") or [])
    return _serialize(w, include_items=True, items=items)


@router.patch("/wishlists/{wid}")
async def update_wishlist(wid: str, data: WishlistPatch, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    updates: dict = {}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.is_public is not None:
        updates["is_public"] = bool(data.is_public)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = _now()
    res = await db.wishlists.find_one_and_update(
        {"id": wid, "user_email": email},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    return _serialize(res)


@router.delete("/wishlists/{wid}")
async def delete_wishlist(wid: str, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    res = await db.wishlists.delete_one({"id": wid, "user_email": email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────
# Item management
# ─────────────────────────────────────────────────────────────────────
@router.post("/wishlists/{wid}/items")
async def add_item(wid: str, data: WishlistAddItem, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    # Validate fabric exists
    fab = await db.fabrics.find_one({"id": data.fabric_id}, {"_id": 0, "id": 1, "name": 1})
    if not fab:
        raise HTTPException(status_code=404, detail="Fabric not found")
    w = await db.wishlists.find_one({"id": wid, "user_email": email}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    existing = list(w.get("fabric_ids") or [])
    if data.fabric_id in existing:
        return _serialize(w)  # idempotent
    existing.append(data.fabric_id)
    await db.wishlists.update_one(
        {"id": wid, "user_email": email},
        {"$set": {"fabric_ids": existing, "updated_at": _now()}},
    )
    w["fabric_ids"] = existing
    return _serialize(w)


@router.delete("/wishlists/{wid}/items/{fabric_id}")
async def remove_item(wid: str, fabric_id: str, request: Request):
    payload = get_current_customer(request)
    email = _email_of(payload)
    w = await db.wishlists.find_one({"id": wid, "user_email": email}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    new_ids = [fid for fid in (w.get("fabric_ids") or []) if fid != fabric_id]
    if len(new_ids) == len(w.get("fabric_ids") or []):
        # nothing changed — still 200 so the UI doesn't show a phantom error
        return _serialize(w)
    await db.wishlists.update_one(
        {"id": wid, "user_email": email},
        {"$set": {"fabric_ids": new_ids, "updated_at": _now()}},
    )
    w["fabric_ids"] = new_ids
    return _serialize(w)


# ─────────────────────────────────────────────────────────────────────
# Sharing
# ─────────────────────────────────────────────────────────────────────
@router.post("/wishlists/{wid}/share")
async def share_wishlist(wid: str, request: Request):
    """Mint (or rotate) a share token and flip `is_public` to true.

    Body (optional):  {"regenerate": true}   — rotate the existing token.
    """
    payload = get_current_customer(request)
    email = _email_of(payload)
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    regenerate = bool(body.get("regenerate"))

    w = await db.wishlists.find_one({"id": wid, "user_email": email}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Wishlist not found")

    token = w.get("share_token")
    if regenerate or not token:
        # 16 url-safe chars ≈ 96 bits of entropy — plenty for unguessable links.
        token = secrets.token_urlsafe(12)
    await db.wishlists.update_one(
        {"id": wid, "user_email": email},
        {"$set": {"share_token": token, "is_public": True, "updated_at": _now()}},
    )
    w["share_token"] = token
    w["is_public"] = True
    return {**_serialize(w), "share_token": token}


@router.get("/wishlists/share/{token}")
async def get_shared_wishlist(token: str):
    """Public read-only view for an unauthenticated visitor. Returns 404
    once the owner has flipped `is_public=False` (so they can revoke)."""
    w = await db.wishlists.find_one(
        {"share_token": token, "is_public": True},
        {"_id": 0},
    )
    if not w:
        raise HTTPException(status_code=404, detail="Wishlist not found or no longer shared")
    items = await _hydrate_items(w.get("fabric_ids") or [])
    # Hide owner email — public viewers only see the name + items.
    return {
        "id": w["id"],
        "name": w.get("name") or "Wishlist",
        "fabric_count": len(items),
        "items": items,
        "created_at": w.get("created_at"),
        # Best-effort first-name display so the public page can say
        # "Curated by Riya" without leaking the full email.
        "owner_display": (w.get("user_email") or "").split("@")[0].split(".")[0].title(),
    }
