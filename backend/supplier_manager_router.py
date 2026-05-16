"""
Supplier Manager Router

A Supplier Manager (SM) is an internal Locofast user who is mapped to
one or more vendors (sellers) and can perform every action the vendor
themselves can — inventory, RFQ quoting, orders, invoice uploads, etc.

The SM logs in via the same `/vendor/login` endpoint (it falls through
to this router if the email isn't a vendor). On login the SM receives:
  • `sm_token` — short JWT identifying the SM
  • `vendors`  — list of mapped vendors

To act on behalf of a vendor, the SM calls
`POST /api/supplier-manager/impersonate/{seller_id}` which mints a
regular vendor JWT (so all existing vendor endpoints keep working
unchanged). The vendor JWT carries an `acting_as_sm` claim so the UI
can show a "Acting as <vendor>" banner.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os
import uuid
import bcrypt
import jwt
import logging
from motor.motor_asyncio import AsyncIOMotorClient

from auth_helpers import JWT_SECRET, JWT_ALGORITHM, security, get_current_admin

# Standalone Mongo handle (mirrors other routers — auth_helpers.db is
# initialised by server.py after import, too early for our top-level use).
_mongo_url = os.environ.get("MONGO_URL")
_db_name = os.environ.get("DB_NAME", "test_database")
if _db_name and _db_name.startswith('"') and _db_name.endswith('"'):
    _db_name = _db_name[1:-1]
db = AsyncIOMotorClient(_mongo_url)[_db_name]

router = APIRouter(prefix="/api/supplier-manager", tags=["supplier-manager"])
logger = logging.getLogger(__name__)


# ─── Models ────────────────────────────────────────────────────────
class SMLogin(BaseModel):
    email: EmailStr
    password: str


class SMCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    contact_phone: str = ""
    vendor_ids: List[str] = []


class SMUpdate(BaseModel):
    name: Optional[str] = None
    contact_phone: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    vendor_ids: Optional[List[str]] = None


# ─── JWT helpers ────────────────────────────────────────────────────
def create_sm_token(sm_id: str, email: str) -> str:
    return jwt.encode(
        {
            "sm_id": sm_id,
            "email": email,
            "type": "supplier_manager",
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )


def create_vendor_token_for_sm(seller_id: str, vendor_email: str, sm_id: str, sm_email: str) -> str:
    """Vendor-shape JWT but tagged with `acting_as_sm` so audit/UI knows."""
    return jwt.encode(
        {
            "seller_id": seller_id,
            "email": vendor_email,
            "type": "vendor",
            "acting_as_sm": sm_id,
            "acting_as_sm_email": sm_email,
            "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        },
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )


async def get_current_sm(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency: return the SM dict for the current `supplier_manager` JWT."""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "supplier_manager":
            raise HTTPException(status_code=401, detail="Invalid token type")
        sm = await db.supplier_managers.find_one(
            {"id": payload["sm_id"], "is_active": True},
            {"_id": 0, "password_hash": 0},
        )
        if not sm:
            raise HTTPException(status_code=401, detail="SM account not found or disabled")
        return sm
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Helpers for vendor login fallback ──────────────────────────────
async def try_supplier_manager_login(email: str, password: str) -> Optional[dict]:
    """Called by vendor_router.vendor_login when the email isn't a seller.
    Returns the standard SM login payload, or None if the email/password
    isn't a valid SM either.
    """
    sm = await db.supplier_managers.find_one(
        {"email": email.lower().strip(), "is_active": True}
    )
    if not sm:
        return None
    pw_hash = sm.get("password_hash", "")
    if not pw_hash or not bcrypt.checkpw(password.encode("utf-8"), pw_hash.encode("utf-8")):
        return None
    # Resolve mapped vendors (filter out inactive/missing)
    vendor_ids = sm.get("vendor_ids", []) or []
    vendors = []
    async for s in db.sellers.find(
        {"id": {"$in": vendor_ids}, "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1, "name": 1, "seller_code": 1, "contact_email": 1, "city": 1, "state": 1},
    ):
        vendors.append(s)
    token = create_sm_token(sm["id"], sm["email"])
    return {
        "role": "supplier_manager",
        "token": token,
        "supplier_manager": {
            "id": sm["id"],
            "name": sm.get("name", ""),
            "email": sm["email"],
            "contact_phone": sm.get("contact_phone", ""),
        },
        "vendors": vendors,
    }


# ─── SM endpoints ───────────────────────────────────────────────────
@router.get("/me")
async def sm_me(sm=Depends(get_current_sm)):
    return sm


@router.get("/vendors")
async def list_mapped_vendors(sm=Depends(get_current_sm)):
    """List the vendors this SM is allowed to act on behalf of."""
    vendor_ids = sm.get("vendor_ids", []) or []
    rows = []
    async for s in db.sellers.find(
        {"id": {"$in": vendor_ids}, "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1, "name": 1, "seller_code": 1, "contact_email": 1, "city": 1, "state": 1, "logo_url": 1},
    ):
        rows.append(s)
    return {"vendors": rows, "total": len(rows)}


@router.post("/impersonate/{seller_id}")
async def impersonate_vendor(seller_id: str, sm=Depends(get_current_sm)):
    """Mint a vendor JWT scoped to one of the SM's mapped vendors.
    The frontend stores this token in `vendor_token` and from that point
    onward calls vendor endpoints normally.
    """
    if seller_id not in (sm.get("vendor_ids", []) or []):
        raise HTTPException(status_code=403, detail="This vendor is not mapped to your account")
    seller = await db.sellers.find_one(
        {"id": seller_id, "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1, "name": 1, "contact_email": 1, "contact_phone": 1, "city": 1, "state": 1, "seller_code": 1},
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Vendor not found or inactive")
    vt = create_vendor_token_for_sm(seller["id"], seller.get("contact_email", ""), sm["id"], sm["email"])
    logger.info(f"[sm-impersonate] sm={sm['email']} → vendor={seller.get('company_name')}")
    return {
        "vendor_token": vt,
        "vendor": seller,
        "acting_as_sm": {"id": sm["id"], "email": sm["email"], "name": sm.get("name", "")},
    }


# ─── Admin CRUD ─────────────────────────────────────────────────────
@router.get("")
async def list_supplier_managers(admin=Depends(get_current_admin)):
    rows = []
    async for sm in db.supplier_managers.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1):
        # Expand mapped vendor display names for the table view
        vids = sm.get("vendor_ids", []) or []
        sm["vendors"] = []
        if vids:
            async for s in db.sellers.find(
                {"id": {"$in": vids}},
                {"_id": 0, "id": 1, "company_name": 1, "seller_code": 1, "contact_email": 1},
            ):
                sm["vendors"].append(s)
        rows.append(sm)
    return {"supplier_managers": rows, "total": len(rows)}


@router.post("")
async def create_supplier_manager(payload: SMCreate, admin=Depends(get_current_admin)):
    email = payload.email.lower().strip()
    if await db.supplier_managers.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A supplier manager with this email already exists")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    pw_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    # Validate vendor_ids exist
    if payload.vendor_ids:
        n_existing = await db.sellers.count_documents({"id": {"$in": payload.vendor_ids}})
        if n_existing != len(set(payload.vendor_ids)):
            raise HTTPException(status_code=400, detail="One or more vendor_ids are invalid")
    sm_doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "email": email,
        "password_hash": pw_hash,
        "contact_phone": payload.contact_phone,
        "vendor_ids": list(dict.fromkeys(payload.vendor_ids)),  # dedupe, preserve order
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_admin": admin.get("email", ""),
    }
    await db.supplier_managers.insert_one(sm_doc.copy())
    sm_doc.pop("password_hash", None)
    return {"success": True, "supplier_manager": sm_doc}


@router.put("/{sm_id}")
async def update_supplier_manager(sm_id: str, payload: SMUpdate, admin=Depends(get_current_admin)):
    existing = await db.supplier_managers.find_one({"id": sm_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Supplier manager not found")
    update: dict = {}
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.contact_phone is not None:
        update["contact_phone"] = payload.contact_phone.strip()
    if payload.is_active is not None:
        update["is_active"] = bool(payload.is_active)
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        update["password_hash"] = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    if payload.vendor_ids is not None:
        if payload.vendor_ids:
            n_existing = await db.sellers.count_documents({"id": {"$in": payload.vendor_ids}})
            if n_existing != len(set(payload.vendor_ids)):
                raise HTTPException(status_code=400, detail="One or more vendor_ids are invalid")
        update["vendor_ids"] = list(dict.fromkeys(payload.vendor_ids))
    if not update:
        raise HTTPException(status_code=400, detail="No changes")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by_admin"] = admin.get("email", "")
    await db.supplier_managers.update_one({"id": sm_id}, {"$set": update})
    fresh = await db.supplier_managers.find_one({"id": sm_id}, {"_id": 0, "password_hash": 0})
    return {"success": True, "supplier_manager": fresh}


@router.delete("/{sm_id}")
async def delete_supplier_manager(sm_id: str, admin=Depends(get_current_admin)):
    res = await db.supplier_managers.delete_one({"id": sm_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier manager not found")
    return {"success": True}
