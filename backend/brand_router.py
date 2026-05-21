"""
Brand Router — B2B Brand portal (enterprise customers aged 10-100Cr).
Slice 1 (this file at launch): Brands, Brand Users, Filtered Catalog, Auth.
Slice 2 (to come): Credit lines (multi-lender + OTP), payments, FIFO order-debit, ledger.
Slice 3 (to come): Sample credits + Razorpay self-serve top-up.
"""
import os
import secrets
import string
import logging
import asyncio
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
import resend
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from pymongo import ReturnDocument
import auth_helpers  # for get_current_admin
import uuid

router = APIRouter(tags=["brand"])
db = None
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 1 week

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
SITE_URL = os.environ.get("SITE_URL", "https://locofast.com")
# Fixed ops inbox for sensitive admin OTPs (credit-line / sample-credit adjustments).
# Decoupled from the logged-in admin's email so the same inbox can be monitored
# centrally regardless of which admin user triggers the action.
BRAND_OTP_INBOX = os.environ.get("BRAND_OTP_INBOX", "mail@locofast.com")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def set_db(database):
    global db
    db = database


# ───── Pydantic models ─────
class BrandCreate(BaseModel):
    name: str
    gst: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    logo_url: Optional[str] = ""
    allowed_category_ids: List[str] = []
    # V2: Factory vs Brand differentiator. Factories mirror brand flow but
    # serve a single parent brand — they receive design allocations, upload
    # POs/tech-packs and place orders on their own credit line.
    type: str = "brand"  # "brand" | "factory"
    parent_brand_id: Optional[str] = None  # required when type == "factory"
    # Initial admin user for the enterprise
    admin_user_email: EmailStr
    admin_user_name: str
    admin_user_designation: Optional[str] = "Management"


class BrandUpdate(BaseModel):
    name: Optional[str] = None
    gst: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    logo_url: Optional[str] = None
    allowed_category_ids: Optional[List[str]] = None
    status: Optional[str] = None
    type: Optional[str] = None
    parent_brand_id: Optional[str] = None
    # Credit period in days (30 / 60 / 90). Drives the 1.5%/month
    # surcharge applied at order time when the brand pays via Locofast
    # credit. Single value drives all credit lines pooled under this GST.
    credit_period_days: Optional[int] = None


# Job titles surfaced in the invite-user dropdown. Permission level is still
# controlled by `role` (brand_admin | brand_user) — designation is display-only.
BRAND_DESIGNATIONS = [
    "Management",
    "Procurement Manager",
    "Fabric Merchandiser",
    "Merchandiser",
]


class BrandUserCreate(BaseModel):
    email: EmailStr
    name: str
    role: str = "brand_user"  # brand_admin | brand_user
    designation: Optional[str] = "Merchandiser"
    # Admin-only: set a specific initial password. If omitted, one is auto-generated.
    password: Optional[str] = None


class BrandLoginRequest(BaseModel):
    email: EmailStr
    password: str


class BrandPasswordReset(BaseModel):
    current_password: str
    new_password: str


# ───── Helpers ─────
def _gen_password(length: int = 12) -> str:
    """Cryptographically random alphanumeric password (no ambiguous chars)."""
    alphabet = string.ascii_letters.replace("l", "").replace("O", "").replace("I", "") + "23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _brand_user_token(user: dict) -> str:
    payload = {
        "brand_user_id": user["id"],
        "brand_id": user["brand_id"],
        "email": user["email"],
        "role": user.get("role", "brand_user"),
        "type": "brand",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_brand_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "brand":
            raise HTTPException(status_code=401, detail="Invalid brand token")
        user = await db.brand_users.find_one({"id": payload.get("brand_user_id"), "status": "active"}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Brand user not found or inactive")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _build_welcome_email(brand_name: str, user_name: str, email: str, password: str, login_url: str) -> str:
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background:#fff;">
      <div style="background: #059669; color: #fff; padding: 24px 28px; border-radius: 10px 10px 0 0;">
        <h2 style="margin:0; font-size: 20px;">Welcome to Locofast, {user_name}</h2>
        <p style="margin: 6px 0 0 0; opacity: 0.9;">Your <strong>{brand_name}</strong> account is ready.</p>
      </div>
      <div style="padding: 28px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size:15px; color:#334155; margin: 0 0 18px 0;">
          You've been invited to source fabric on Locofast's brand portal. Use the credentials below to sign in.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0; background: #f8fafc; border-radius: 6px;">
          <tr><td style="padding: 12px 14px; color: #64748b; width: 130px; font-size: 13px;">Login URL</td><td style="padding: 12px 14px; color: #0f172a; font-size: 13px;"><a href="{login_url}" style="color: #2563eb;">{login_url}</a></td></tr>
          <tr><td style="padding: 12px 14px; color: #64748b; font-size: 13px;">Email</td><td style="padding: 12px 14px; color: #0f172a; font-size: 14px;"><strong>{email}</strong></td></tr>
          <tr><td style="padding: 12px 14px; color: #64748b; font-size: 13px;">Temporary Password</td><td style="padding: 12px 14px; color: #0f172a; font-size: 14px; font-family: monospace; background: #fff; border-left: 3px solid #059669;"><strong>{password}</strong></td></tr>
        </table>
        <p style="font-size: 13px; color: #64748b; margin: 0;">
          For security, you'll be asked to reset your password on first login. This email contains your only copy of the temporary password — save it now.
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin: 22px 0 0 0;">
          Didn't expect this email? Reply and let us know — we'll disable the account immediately.
        </p>
      </div>
    </div>
    """


async def _send_welcome_email(brand_name: str, user_name: str, email: str, password: str):
    if not RESEND_API_KEY:
        logging.warning(f"RESEND_API_KEY not set — welcome email to {email} skipped. Temp password: {password}")
        return
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [email],
            "subject": f"Your Locofast Brand Portal Account — {brand_name}",
            "html": _build_welcome_email(brand_name, user_name, email, password, f"{SITE_URL}/brand/login"),
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Welcome email sent to {email}")
    except Exception as e:
        logging.error(f"Failed to send welcome email to {email}: {e}")


# ───── ADMIN ENDPOINTS — Brand CRUD ─────
@router.post("/admin/brands")
async def create_brand(data: BrandCreate, admin=Depends(auth_helpers.get_current_admin)):
    # Ensure initial admin user's email is not already used
    existing = await db.brand_users.find_one({"email": data.admin_user_email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail=f"Email {data.admin_user_email} is already registered")

    # Validate factory ↔ parent_brand link
    entity_type = (data.type or "brand").strip().lower()
    if entity_type not in ("brand", "factory"):
        raise HTTPException(status_code=400, detail="type must be 'brand' or 'factory'")
    parent_brand_id = (data.parent_brand_id or "").strip() or None
    if entity_type == "factory" and parent_brand_id:
        # Standalone factories (no parent) are allowed — they buy for themselves.
        # Only validate the link if a parent_brand_id was actually supplied.
        parent = await db.brands.find_one({"id": parent_brand_id, "$or": [{"type": "brand"}, {"type": {"$exists": False}}]}, {"_id": 0, "id": 1})
        if not parent:
            raise HTTPException(status_code=400, detail="parent_brand_id does not refer to an active brand")
    elif entity_type == "brand":
        parent_brand_id = None

    brand_id = str(uuid.uuid4())
    brand_doc = {
        "id": brand_id,
        "name": data.name,
        "gst": data.gst or "",
        "address": data.address or "",
        "phone": data.phone or "",
        "logo_url": data.logo_url or "",
        "allowed_category_ids": data.allowed_category_ids or [],
        "type": entity_type,
        "parent_brand_id": parent_brand_id,
        "status": "active",
        # Factories invited by a brand admin default to "unverified" until Locofast ops reviews.
        # Admin-created enterprises are "verified" by default.
        "verification_status": "verified",
        "sample_credits_total": 0,
        "sample_credits_used": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
    }
    await db.brands.insert_one(brand_doc)

    # Create the first brand_admin user
    temp_pw = _gen_password()
    user_doc = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "email": data.admin_user_email.lower(),
        "name": data.admin_user_name,
        "designation": data.admin_user_designation or "Management",
        "password_hash": _hash(temp_pw),
        "role": "brand_admin",
        "status": "active",
        "must_reset_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "last_login": None,
    }
    await db.brand_users.insert_one(user_doc)

    # Send welcome email with temporary password (async, best-effort)
    asyncio.create_task(_send_welcome_email(data.name, data.admin_user_name, data.admin_user_email, temp_pw))

    return {
        "id": brand_id,
        "message": "Brand created. Welcome email sent to brand admin.",
        "admin_user_id": user_doc["id"],
        # Return temp password in response ONLY so admin can copy if email fails
        "temporary_password_for_reference": temp_pw,
    }


@router.get("/admin/brands")
async def list_brands(admin=Depends(auth_helpers.get_current_admin)):
    brands = await db.brands.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    # Build a quick lookup for parent brand names (factories only)
    brand_name_by_id = {b["id"]: b.get("name", "") for b in brands}
    # Attach user count + parent brand label per enterprise
    for b in brands:
        b["user_count"] = await db.brand_users.count_documents({"brand_id": b["id"]})
        # Default legacy docs (no `type` field) to "brand"
        b.setdefault("type", "brand")
        if b.get("type") == "factory" and b.get("parent_brand_id"):
            b["parent_brand_name"] = brand_name_by_id.get(b["parent_brand_id"], "")
    return brands


@router.get("/admin/brands/{brand_id}")
async def get_brand(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    users = await db.brand_users.find({"brand_id": brand_id}, {"_id": 0, "password_hash": 0}).to_list(length=200)
    return {"brand": brand, "users": users}


@router.put("/admin/brands/{brand_id}")
async def update_brand(brand_id: str, data: BrandUpdate, admin=Depends(auth_helpers.get_current_admin)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "credit_period_days" in updates:
        try:
            p = int(updates["credit_period_days"])
            if p not in (30, 60, 90):
                raise HTTPException(status_code=400, detail="credit_period_days must be 30, 60, or 90")
            updates["credit_period_days"] = p
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="credit_period_days must be an integer")
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.brands.update_one({"id": brand_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"message": "Brand updated"}


@router.delete("/admin/brands/{brand_id}")
async def delete_brand(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    # Soft-delete the brand + suspend all its users. Preserves audit/ledger data.
    await db.brands.update_one({"id": brand_id}, {"$set": {"status": "deleted"}})
    await db.brand_users.update_many({"brand_id": brand_id}, {"$set": {"status": "suspended"}})
    return {"message": "Brand soft-deleted and users suspended"}


# ───── ADMIN ENDPOINTS — Brand Users ─────
@router.post("/admin/brands/{brand_id}/users")
async def admin_add_brand_user(brand_id: str, data: BrandUserCreate, admin=Depends(auth_helpers.get_current_admin)):
    return await _add_brand_user_internal(brand_id, data, actor_id=admin.get("id"))


@router.delete("/admin/brands/{brand_id}/users/{user_id}")
async def admin_remove_brand_user(
    brand_id: str,
    user_id: str,
    hard: bool = False,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Suspend (default) or hard-delete a brand user.
    - `hard=false` (default) → flips status to `suspended`. Reversible via /reactivate.
    - `hard=true` → removes the row entirely. Irreversible. Use only for wrong-email typos.
    """
    if hard:
        res = await db.brand_users.delete_one({"id": user_id, "brand_id": brand_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted"}
    res = await db.brand_users.update_one({"id": user_id, "brand_id": brand_id}, {"$set": {"status": "suspended"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User suspended"}


@router.post("/admin/brands/{brand_id}/users/{user_id}/reactivate")
async def admin_reactivate_brand_user(brand_id: str, user_id: str, admin=Depends(auth_helpers.get_current_admin)):
    res = await db.brand_users.update_one(
        {"id": user_id, "brand_id": brand_id},
        {"$set": {"status": "active"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User reactivated"}


class AdminPasswordReset(BaseModel):
    send_email: bool = True
    new_password: Optional[str] = None  # if empty, auto-generate


@router.post("/admin/brands/{brand_id}/users/{user_id}/reset-password")
async def admin_reset_brand_user_password(
    brand_id: str,
    user_id: str,
    data: AdminPasswordReset,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Admin-driven password reset. Generates a temp password (or uses a provided one),
    forces the user to reset it on next login, optionally emails them.
    Returns the new password so the admin can WhatsApp/share it if email is off.
    """
    user = await db.brand_users.find_one({"id": user_id, "brand_id": brand_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0, "name": 1})

    new_pw = (data.new_password or "").strip() or _gen_password()
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    await db.brand_users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": _hash(new_pw),
            "must_reset_password": True,
            "status": "active",  # unsuspend if the admin is resetting for a returning user
        }},
    )
    if data.send_email and brand:
        asyncio.create_task(_send_welcome_email(brand.get("name", "your enterprise"), user.get("name", ""), user.get("email", ""), new_pw))
    return {
        "message": "Password reset",
        "temporary_password_for_reference": new_pw,
        "email_sent": bool(data.send_email and brand),
    }


async def _add_brand_user_internal(brand_id: str, data: BrandUserCreate, actor_id: str):
    brand = await db.brands.find_one({"id": brand_id, "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found or inactive")

    existing = await db.brand_users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail=f"Email {data.email} is already registered")

    if data.role not in ("brand_admin", "brand_user"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if data.designation and data.designation not in BRAND_DESIGNATIONS:
        raise HTTPException(status_code=400, detail=f"Invalid designation. Must be one of {BRAND_DESIGNATIONS}")

    temp_pw = (data.password or "").strip() or _gen_password()
    if len(temp_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user_doc = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "email": data.email.lower(),
        "name": data.name,
        "designation": data.designation or "Merchandiser",
        "password_hash": _hash(temp_pw),
        "role": data.role,
        "status": "active",
        "must_reset_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": actor_id,
        "last_login": None,
    }
    await db.brand_users.insert_one(user_doc)
    asyncio.create_task(_send_welcome_email(brand["name"], data.name, data.email, temp_pw))
    return {
        "id": user_doc["id"],
        "message": "User created. Welcome email sent.",
        "temporary_password_for_reference": temp_pw,
    }


# ───── BRAND AUTH ─────
@router.post("/brand/login")
async def brand_login(data: BrandLoginRequest):
    user = await db.brand_users.find_one({"email": data.email.lower(), "status": "active"}, {"_id": 0})
    if not user or not _verify(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    brand = await db.brands.find_one({"id": user["brand_id"], "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=403, detail="Your brand account is inactive. Contact Locofast support.")

    token = _brand_user_token(user)
    await db.brand_users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "designation": user.get("designation", ""),
            "brand_id": user["brand_id"],
            "brand_name": brand["name"],
            "brand_logo_url": brand.get("logo_url", ""),
            "brand_type": brand.get("type") or "brand",
            "verification_status": brand.get("verification_status") or "verified",
            "must_reset_password": user.get("must_reset_password", False),
        },
    }


@router.post("/brand/reset-password")
async def brand_reset_password(data: BrandPasswordReset, user=Depends(get_current_brand_user)):
    full_user = await db.brand_users.find_one({"id": user["id"]}, {"_id": 0})
    if not _verify(data.current_password, full_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.brand_users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": _hash(data.new_password), "must_reset_password": False}},
    )
    return {"message": "Password updated"}


@router.get("/brand/me")
async def brand_me(user=Depends(get_current_brand_user)):
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    # Defaults for legacy docs that predate these fields
    brand.setdefault("type", "brand")
    brand.setdefault("verification_status", "verified")
    return {"user": user, "brand": brand}


class BrandProfileUpdate(BaseModel):
    name: Optional[str] = None
    gst: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None


@router.put("/brand/profile")
async def brand_update_profile(data: BrandProfileUpdate, user=Depends(get_current_brand_user)):
    """Brand admin edits the enterprise profile (name/phone/GST/address/logo).
    Other brand_users can view but not edit. GST is uppercased and lightly
    validated for length/format (15 alphanumeric chars)."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can edit the profile")
    updates = {}
    if data.name is not None:
        clean = (data.name or "").strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = clean[:200]
    if data.phone is not None:
        updates["phone"] = (data.phone or "").strip()[:20]
    if data.address is not None:
        updates["address"] = (data.address or "").strip()[:500]
    if data.logo_url is not None:
        updates["logo_url"] = (data.logo_url or "").strip()[:500]
    if data.gst is not None:
        gst = (data.gst or "").strip().upper()
        if gst and len(gst) != 15:
            raise HTTPException(status_code=400, detail="GST must be 15 characters")
        updates["gst"] = gst
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.brands.update_one({"id": user["brand_id"]}, {"$set": updates})
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    return {"message": "Profile updated", "brand": brand}


@router.post("/brand/default-ship-to")
async def brand_save_default_ship_to(data: dict, user=Depends(get_current_brand_user)):
    """Persist this address as the brand's default shipping destination."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can save defaults")
    address = {
        "name": (data.get("name") or "")[:100],
        "phone": (data.get("phone") or "")[:20],
        "address": (data.get("address") or "")[:500],
        "city": (data.get("city") or "")[:100],
        "state": (data.get("state") or "")[:100],
        "pincode": (data.get("pincode") or "")[:10],
    }
    await db.brands.update_one({"id": user["brand_id"]}, {"$set": {"default_ship_to": address}})
    return {"message": "Default shipping address saved"}


# ==================== BRAND ADDRESS BOOK ============================
# A brand can save multiple shipping addresses (factory office, warehouse,
# regional hubs) in their address book. The first address is auto-seeded
# from GST registry the first time the brand opens their account so that
# checkout works out-of-the-box without re-typing.
async def _ensure_address_book_seeded(brand: dict) -> list:
    """Lazy-seed address_book from GST data when the brand first hits the
    address API. Idempotent — if `address_book` already exists, returns it."""
    if isinstance(brand.get("address_book"), list) and brand.get("address_book"):
        return brand["address_book"]

    # Seed sources: prefer existing default_ship_to, else GST-verified data.
    seed = None
    if brand.get("default_ship_to") and (brand["default_ship_to"].get("address") or brand["default_ship_to"].get("city")):
        d = brand["default_ship_to"]
        seed = {
            "id": str(uuid.uuid4()),
            "label": "Registered Office (GST)",
            "name": d.get("name", "") or brand.get("name", ""),
            "phone": d.get("phone", ""),
            "address": d.get("address", ""),
            "city": d.get("city", ""),
            "state": d.get("state", ""),
            "pincode": d.get("pincode", ""),
            "is_default": True,
            "source": "gst",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    elif brand.get("gst_verified_address"):
        gst = brand["gst_verified_address"]
        seed = {
            "id": str(uuid.uuid4()),
            "label": "Registered Office (GST)",
            "name": brand.get("name", ""),
            "phone": "",
            "address": gst.get("address", ""),
            "city": gst.get("city", ""),
            "state": gst.get("state", ""),
            "pincode": gst.get("pincode", ""),
            "is_default": True,
            "source": "gst",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    book = [seed] if seed else []
    await db.brands.update_one({"id": brand["id"]}, {"$set": {"address_book": book}})
    return book


@router.get("/brand/addresses")
async def brand_list_addresses(user=Depends(get_current_brand_user)):
    """Return the brand's address book. Auto-seeds from GST data on first hit.
    For brand-type enterprises, also merges in every linked factory's GST +
    manual address entries (read-only on the brand side, tagged with
    `source: 'factory'` and `factory_name`)."""
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    book = await _ensure_address_book_seeded(brand)

    # Merge factory addresses for parent brands
    if brand.get("type") in ("brand", None) or not brand.get("type"):
        factories = await db.brands.find(
            {"parent_brand_id": user["brand_id"], "type": "factory"},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(length=100)
        for f in factories:
            f_brand = await db.brands.find_one({"id": f["id"]}, {"_id": 0})
            if f_brand:
                f_book = await _ensure_address_book_seeded(f_brand)
                for a in f_book or []:
                    book.append({
                        **a,
                        "id": f"factory-{f['id']}-{a.get('id', '')}",
                        "source": "factory",
                        "factory_id": f["id"],
                        "factory_name": f.get("name", ""),
                        "is_default": False,  # factory defaults aren't brand defaults
                        "read_only": True,
                    })
    return {"addresses": book}


@router.post("/brand/addresses")
async def brand_add_address(data: dict, user=Depends(get_current_brand_user)):
    """Append a new address to the brand's address book.

    Optional flags:
      - `set_default`: also flip is_default to True on this entry (others
        get is_default=False).
    """
    if user["role"] not in ("brand_admin", "brand_user"):
        raise HTTPException(status_code=403, detail="Forbidden")
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    book = await _ensure_address_book_seeded(brand) or []
    new = {
        "id": str(uuid.uuid4()),
        "label": (data.get("label") or "Other Address")[:80],
        "name": (data.get("name") or "")[:100],
        "phone": (data.get("phone") or "")[:20],
        "address": (data.get("address") or "")[:500],
        "city": (data.get("city") or "")[:100],
        "state": (data.get("state") or "")[:100],
        "pincode": (data.get("pincode") or "")[:10],
        "is_default": False,
        "source": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    set_default = bool(data.get("set_default")) or len(book) == 0
    if set_default:
        for a in book:
            a["is_default"] = False
        new["is_default"] = True
    book.append(new)
    await db.brands.update_one({"id": brand["id"]}, {"$set": {"address_book": book}})
    return {"address": new, "addresses": book}


@router.put("/brand/addresses/{address_id}/default")
async def brand_set_default_address(address_id: str, user=Depends(get_current_brand_user)):
    """Mark an existing address as the brand default."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can change the default")
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    book = brand.get("address_book") or []
    found = False
    for a in book:
        if a.get("id") == address_id:
            a["is_default"] = True
            found = True
        else:
            a["is_default"] = False
    if not found:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.brands.update_one({"id": brand["id"]}, {"$set": {"address_book": book}})
    return {"addresses": book}


@router.delete("/brand/addresses/{address_id}")
async def brand_delete_address(address_id: str, user=Depends(get_current_brand_user)):
    """Remove an address (cannot delete the only address)."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can delete addresses")
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    book = brand.get("address_book") or []
    if len(book) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining address")
    target = next((a for a in book if a.get("id") == address_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Address not found")
    new_book = [a for a in book if a.get("id") != address_id]
    if target.get("is_default") and new_book:
        # Promote the first remaining address to default
        new_book[0]["is_default"] = True
    await db.brands.update_one({"id": brand["id"]}, {"$set": {"address_book": new_book}})
    return {"addresses": new_book}


# ==================== BRAND → FACTORY INVITE (self-serve) ====================
class FactoryInvite(BaseModel):
    name: str
    admin_user_email: EmailStr
    admin_user_name: str
    admin_user_designation: Optional[str] = "Management"
    gst: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    # Brand picks at invite time which of its allowed categories to share
    # with the factory. Empty list = share nothing (ops can allocate later).
    allowed_category_ids: List[str] = []
    # Optional pre-seeded credit line (₹). Still needs Locofast ops approval
    # because credit disbursal touches lender APIs — so we just record the
    # request; admin reviews in /admin/brands/{id}/credit-lines.
    requested_credit_limit: float = 0.0


@router.get("/brand/factories")
async def list_brand_factories(user=Depends(get_current_brand_user)):
    """List factories invited by this brand. brand_admin only."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can view factories")
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0, "type": 1})
    if (brand or {}).get("type", "brand") != "brand":
        raise HTTPException(status_code=400, detail="Only brand-type enterprises can have factories")
    factories = await db.brands.find(
        {"parent_brand_id": user["brand_id"], "type": "factory"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    for f in factories:
        f["user_count"] = await db.brand_users.count_documents({"brand_id": f["id"]})
    return factories


@router.post("/brand/factories")
async def invite_factory(data: FactoryInvite, user=Depends(get_current_brand_user)):
    """Brand-admin invites a factory. Factory is auto-activated but flagged
    as `verification_status="unverified"` until Locofast admin reviews.
    Credit allocation is recorded as a *request* — ops approves manually.
    """
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can invite factories")

    parent_brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not parent_brand:
        raise HTTPException(status_code=404, detail="Parent brand not found")
    if parent_brand.get("type", "brand") != "brand":
        raise HTTPException(status_code=400, detail="Only brands can invite factories (not other factories)")

    # Guard: brand can only share categories it actually has access to
    parent_allowed = set(parent_brand.get("allowed_category_ids", []))
    requested = set(data.allowed_category_ids or [])
    if not requested.issubset(parent_allowed):
        stray = requested - parent_allowed
        raise HTTPException(
            status_code=400,
            detail=f"Cannot share categories you don't have access to: {list(stray)}",
        )

    # Reject duplicate factory email (global on brand_users)
    existing_user = await db.brand_users.find_one({"email": data.admin_user_email.lower()}, {"_id": 0, "id": 1})
    if existing_user:
        raise HTTPException(status_code=400, detail="A user with this email already exists on the platform")

    factory_id = str(uuid.uuid4())
    factory_doc = {
        "id": factory_id,
        "name": data.name,
        "gst": data.gst or "",
        "address": data.address or "",
        "phone": data.phone or "",
        "logo_url": "",
        "allowed_category_ids": list(requested),
        "type": "factory",
        "parent_brand_id": user["brand_id"],
        "status": "active",
        # Invited via brand → unverified until Locofast ops reviews
        "verification_status": "unverified",
        "sample_credits_total": 0,
        "sample_credits_used": 0,
        "requested_credit_limit": max(0.0, float(data.requested_credit_limit or 0)),
        "invited_by_brand_user_id": user["id"],
        "invited_by_brand_user_email": user.get("email", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.brands.insert_one(factory_doc)

    # First factory admin
    temp_pw = _gen_password()
    factory_admin = {
        "id": str(uuid.uuid4()),
        "brand_id": factory_id,
        "email": data.admin_user_email.lower(),
        "name": data.admin_user_name,
        "designation": data.admin_user_designation or "Management",
        "password_hash": _hash(temp_pw),
        "role": "brand_admin",
        "status": "active",
        "must_reset_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
        "last_login": None,
    }
    await db.brand_users.insert_one(factory_admin)

    asyncio.create_task(
        _send_welcome_email(
            f"{data.name} (factory of {parent_brand.get('name', '')})",
            data.admin_user_name,
            data.admin_user_email,
            temp_pw,
        )
    )

    return {
        "id": factory_id,
        "message": "Factory invited. Welcome email sent to factory admin.",
        "admin_user_id": factory_admin["id"],
        "temporary_password_for_reference": temp_pw,
        "verification_status": "unverified",
    }


@router.post("/admin/brands/{factory_id}/verify")
async def admin_verify_factory(factory_id: str, admin=Depends(auth_helpers.get_current_admin)):
    """Locofast ops marks a brand-invited factory as verified after review."""
    res = await db.brands.update_one(
        {"id": factory_id, "type": "factory"},
        {"$set": {"verification_status": "verified"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Factory not found")
    return {"message": "Factory verified"}


@router.post("/brand/upload-attachment")
async def brand_upload_attachment(file: UploadFile = File(...), user=Depends(get_current_brand_user)):
    """Upload a PDF/image (tech pack, PO) to Cloudinary and return the public URL.
    Factory-only use-case in V1 but available to all brand users.
    Max 15MB. Allowed types: application/pdf, image/*.
    """
    import cloudinary
    import cloudinary.uploader

    allowed_prefixes = ("application/pdf", "image/")
    if not any((file.content_type or "").startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=400, detail="Only PDF or image files are accepted")

    # Read & size check
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 15MB limit")

    try:
        # `resource_type=auto` handles both PDF (raw) and image variants
        result = cloudinary.uploader.upload(
            raw,
            folder=f"enterprise_attachments/{user['brand_id']}",
            resource_type="auto",
            use_filename=True,
            unique_filename=True,
        )
        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "bytes": result.get("bytes"),
            "format": result.get("format"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ───── BRAND-FACING — Users (brand_admin can manage) ─────
@router.get("/brand/users")
async def brand_list_users(user=Depends(get_current_brand_user)):
    users = await db.brand_users.find({"brand_id": user["brand_id"], "status": {"$ne": "deleted"}}, {"_id": 0, "password_hash": 0}).to_list(length=200)
    return users


@router.post("/brand/users")
async def brand_add_user(data: BrandUserCreate, user=Depends(get_current_brand_user)):
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can add users")
    return await _add_brand_user_internal(user["brand_id"], data, actor_id=user["id"])


@router.delete("/brand/users/{user_id}")
async def brand_remove_user(user_id: str, user=Depends(get_current_brand_user)):
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can remove users")
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    res = await db.brand_users.update_one(
        {"id": user_id, "brand_id": user["brand_id"]},
        {"$set": {"status": "suspended"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User suspended"}


@router.get("/brand/designations")
async def brand_list_designations():
    return {"options": list(BRAND_DESIGNATIONS)}


@router.get("/brand/support")
async def brand_support_contact():
    """Support contact placeholder surfaced in the brand portal footer/help widget."""
    return {
        "email": os.environ.get("LOCOFAST_SUPPORT_EMAIL", "support@locofast.com"),
        "phone": os.environ.get("LOCOFAST_SUPPORT_PHONE", "+91 120 4938200"),
        "hours": "Mon–Sat, 9:30 AM – 7:00 PM IST",
        "escalation_email": os.environ.get("LOCOFAST_OPS_INBOX", "orders@locofast.com"),
    }


# ───── BRAND-FACING — Filtered Catalog ─────
@router.get("/brand/fabrics")
async def brand_list_fabrics(
    user=Depends(get_current_brand_user),
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    fabric_type: Optional[str] = None,
    composition: Optional[str] = None,
    pattern: Optional[str] = None,
    color: Optional[str] = None,
    width: Optional[str] = None,
    gsm_min: Optional[int] = None,
    gsm_max: Optional[int] = None,
    oz_min: Optional[float] = None,
    oz_max: Optional[float] = None,
    availability: Optional[str] = None,  # bookable | sample | instant | enquiry
    certifications: Optional[str] = None,
):
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    allowed = brand.get("allowed_category_ids") or []
    if not allowed:
        return []  # No categories unlocked yet

    # Build filter: scope ALWAYS stays inside brand's allowed categories
    scope_cat_ids = allowed
    if category_id and category_id in allowed:
        scope_cat_ids = [category_id]

    query = {"category_id": {"$in": scope_cat_ids}, "status": {"$ne": "draft"}}
    cert_list = [c.strip() for c in (certifications or "").split(",") if c.strip()]
    if cert_list:
        query["certifications"] = {"$all": cert_list}
    if fabric_type:
        query["fabric_type"] = fabric_type
    if pattern:
        query["pattern"] = pattern
    if color:
        query["color"] = {"$regex": f"^{color}$", "$options": "i"}
    if width:
        query["width"] = width
    if gsm_min is not None or gsm_max is not None:
        gsm_q = {}
        if gsm_min is not None:
            gsm_q["$gte"] = gsm_min
        if gsm_max is not None:
            gsm_q["$lte"] = gsm_max
        query["gsm"] = gsm_q
    # Denim is weighed in ounces; some sellers store the value under
    # `ounce` while others use `weight_oz`. Even within `ounce`, values are
    # stored inconsistently — sometimes as a number, sometimes as a string
    # like "11" or "6.50 OZ". We compute ranges by matching the leading
    # numeric prefix of the string, falling back to numeric direct match.
    if oz_min is not None or oz_max is not None:
        # Build a regex that matches strings whose leading number falls in
        # range. Cheap and works on existing data without a migration.
        # We keep an integer fallback so future docs that store oz as a
        # number still match cleanly.
        lo = float(oz_min) if oz_min is not None else 0.0
        hi = float(oz_max) if oz_max is not None else 99.0
        # Build set of integer-or-half allowed values (0.25 step covers all
        # sensible denim weights without an explosion of regex alternates).
        allowed = []
        v = lo
        while v <= hi + 1e-9:
            # Match "11", "11.0", "11.25", "11.5", "11.75"; the regex allows
            # any non-digit suffix so "11oz" / "11 OZ" / "11.5oz" all work.
            txt = (f"{v:g}").replace(".", r"\.")
            allowed.append(txt)
            v = round(v + 0.25, 2)
        oz_regex = {"$regex": rf"^\s*({'|'.join(allowed)})(\D|$)"}
        oz_numeric = {}
        if oz_min is not None:
            oz_numeric["$gte"] = lo
        if oz_max is not None:
            oz_numeric["$lte"] = hi
        query["$or"] = (query.get("$or") or []) + [
            {"ounce": oz_regex},
            {"weight_oz": oz_regex},
            {"ounce": oz_numeric},
            {"weight_oz": oz_numeric},
        ]
    if composition:
        query["composition.material"] = composition
    if search:
        safe = search.replace("\\", "\\\\").replace(".", "\\.").replace("*", "\\*")
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"fabric_code": {"$regex": safe, "$options": "i"}},
        ]
    if availability == "bookable":
        query["is_bookable"] = True
        query["quantity_available"] = {"$gt": 0}
    elif availability == "sample":
        query["sample_price"] = {"$gt": 0}
    elif availability == "instant":
        query["is_bookable"] = True
        query["quantity_available"] = {"$gt": 0}
        query["sample_price"] = {"$gt": 0}
    elif availability == "enquiry":
        # "Order Sample or Enquiry" = no inventory uploaded yet, so buyer can
        # only request a swatch or raise a quote. Mirrors the public-site logic
        # in fabric_router._build_fabric_query.
        query["$or"] = [
            {"is_bookable": {"$ne": True}},
            {"$and": [
                {"sample_price": {"$in": [None, 0]}},
                {"rate_per_meter": {"$in": [None, 0]}},
                {"quantity_available": {"$in": [None, 0]}},
            ]},
        ]

    fabrics = await db.fabrics.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=1000)

    # Attach category names
    cats = await db.categories.find({"id": {"$in": allowed}}, {"_id": 0}).to_list(length=50)
    cat_map = {c["id"]: c["name"] for c in cats}
    # Brand portal: vendor identity is hidden — same policy as B2C.
    # Resolve seller_code (LS-XXXXX) so admins can corroborate offline, but
    # never expose seller_name/seller_company to the brand.
    seller_ids = list({f.get("seller_id") for f in fabrics if f.get("seller_id")})
    sellers = await db.sellers.find({"id": {"$in": seller_ids}}, {"_id": 0, "id": 1, "seller_code": 1}).to_list(length=200) if seller_ids else []
    code_map = {s["id"]: s.get("seller_code", "") for s in sellers}
    for f in fabrics:
        f["category_name"] = cat_map.get(f.get("category_id"), "")
        f["seller_name"] = ""
        f["seller_company"] = ""
        f["seller_code"] = code_map.get(f.get("seller_id", ""), "")
    return fabrics


@router.get("/brand/fabrics/filter-options")
async def brand_filter_options(user=Depends(get_current_brand_user)):
    """Categories + filter facets scoped to the brand's allowed catalog."""
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    allowed = brand.get("allowed_category_ids") or []
    if not allowed:
        return {"categories": [], "colors": [], "patterns": [], "widths": [], "compositions": [], "fabric_types": []}

    cats = await db.categories.find({"id": {"$in": allowed}}, {"_id": 0, "id": 1, "name": 1, "slug": 1}).to_list(length=50)
    fabrics = await db.fabrics.find(
        {"category_id": {"$in": allowed}, "status": {"$ne": "draft"}},
        {"_id": 0, "color": 1, "pattern": 1, "width": 1, "composition": 1, "fabric_type": 1},
    ).to_list(length=2000)

    from composition_utils import CANONICAL_COMPOSITIONS, normalize_material
    colors, patterns, widths, compositions, fabric_types = set(), set(), set(), set(), set()
    for f in fabrics:
        if f.get("color"):
            colors.add(str(f["color"]).strip())
        if f.get("pattern"):
            patterns.add(str(f["pattern"]).strip())
        if f.get("width"):
            widths.add(str(f["width"]).strip())
        if f.get("fabric_type"):
            fabric_types.add(str(f["fabric_type"]).strip())
        comp = f.get("composition")
        if isinstance(comp, list):
            for item in comp:
                mat = (item.get("material") or "").strip()
                if mat:
                    compositions.add(normalize_material(mat))

    canon = set(CANONICAL_COMPOSITIONS)
    compositions = {c for c in compositions if c in canon}

    return {
        "categories": cats,
        "colors": sorted(colors, key=str.lower),
        "patterns": sorted(patterns, key=str.lower),
        "widths": sorted(widths, key=str.lower),
        "compositions": sorted(compositions, key=str.lower),
        "fabric_types": sorted(fabric_types, key=str.lower),
    }


@router.get("/brand/fabrics/{fabric_id_or_slug}")
async def brand_get_fabric(fabric_id_or_slug: str, user=Depends(get_current_brand_user)):
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    allowed = brand.get("allowed_category_ids") or []
    f = await db.fabrics.find_one({"$or": [{"id": fabric_id_or_slug}, {"slug": fabric_id_or_slug}]}, {"_id": 0})
    if not f or f.get("category_id") not in allowed:
        raise HTTPException(status_code=404, detail="Fabric not available for your brand")
    # Attach category name
    cat = await db.categories.find_one({"id": f.get("category_id")}, {"_id": 0, "name": 1})
    if cat:
        f["category_name"] = cat.get("name", "")
    # Brand portal: hide vendor identity (same policy as B2C). Only seller_code
    # is exposed so admins/agents can corroborate offline.
    if f.get("seller_id"):
        s = await db.sellers.find_one({"id": f["seller_id"]}, {"_id": 0, "seller_code": 1})
        f["seller_code"] = (s or {}).get("seller_code", "")
    f["seller_name"] = ""
    f["seller_company"] = ""
    return f


# ════════════════════════════════════════════════════════════════════
# SLICE 2 — Credit Lines (multi-lender), OTP, Ledger, FIFO Debit
# SLICE 3 — Sample Credits + Razorpay Top-up
# ════════════════════════════════════════════════════════════════════

LENDER_OPTIONS = {"Stride", "Muthoot", "Mintifi"}


class BrandCreditOtpRequest(BaseModel):
    lender_name: str
    amount_inr: float
    note: Optional[str] = ""


class BrandCreditLineCreate(BaseModel):
    otp_request_id: str
    otp_code: str
    lender_name: str
    amount_inr: float
    screenshot_url: Optional[str] = ""
    note: Optional[str] = ""


class SampleCreditOtpRequest(BaseModel):
    delta: int
    note: Optional[str] = ""


class SampleCreditAdjust(BaseModel):
    otp_request_id: str
    otp_code: str
    delta: int
    note: Optional[str] = ""


class BrandOrderItemIn(BaseModel):
    fabric_id: str
    quantity: int
    color_name: Optional[str] = ""
    color_hex: Optional[str] = ""


class BrandOrderCreate(BaseModel):
    items: List[BrandOrderItemIn]
    order_type: str  # "sample" | "bulk"
    notes: Optional[str] = ""
    ship_to_address: Optional[str] = ""
    ship_to_city: Optional[str] = ""
    ship_to_state: Optional[str] = ""
    ship_to_pincode: Optional[str] = ""
    # Factory-only fields (ignored when placed by a regular brand user).
    # For V1: plain Cloudinary URLs (upload handled via the same /api/cloudinary
    # upload endpoint used by Admin) + free-text qty × color × size matrix.
    po_file_url: Optional[str] = ""
    tech_pack_url: Optional[str] = ""
    qty_color_matrix: Optional[str] = ""
    # Payment path:
    #   "credit"   — default; debit brand credit line (bulk) or sample credits (sample)
    #   "razorpay" — for bulk orders when credit is exhausted, verify these
    #                fields were signed by Razorpay and skip the credit debit
    payment_method: Optional[str] = "credit"
    razorpay_order_id: Optional[str] = ""
    razorpay_payment_id: Optional[str] = ""
    razorpay_signature: Optional[str] = ""


class BrandTopupCreate(BaseModel):
    amount_inr: int  # must be whole rupees (1 rupee = 1 credit)


class BrandTopupVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ───── Helpers ─────
async def _write_ledger(brand_id: str, entry_type: str, amount: float, actor_id: str, **extra):
    doc = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "type": entry_type,
        "amount": round(float(amount), 2),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": actor_id,
        **extra,
    }
    await db.brand_credit_ledger.insert_one(doc)
    return doc


def _send_otp_email_sync(to_email: str, code: str, brand_name: str, amount_inr: float, lender_name: str):
    if not RESEND_API_KEY:
        logging.warning(f"RESEND_API_KEY missing — OTP for {to_email}: {code}")
        return
    html = f"""
      <div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
          <h2 style="margin:0;font-size:18px;">Confirm credit line payment upload</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
          <p style="color:#374151;font-size:14px;margin:0 0 16px 0;">
            You're recording a <strong>₹{amount_inr:,.2f}</strong> payment from <strong>{lender_name}</strong> to brand <strong>{brand_name}</strong>.
          </p>
          <p style="font-size:13px;color:#64748b;margin:0 0 8px 0;">Enter this OTP to confirm:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#059669;background:#ecfdf5;padding:14px 0;text-align:center;border-radius:8px;font-family:monospace;">
            {code}
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:16px 0 0 0;">
            This code expires in 10 minutes. If you didn't initiate this, ignore the email and report it to security@locofast.com.
          </p>
        </div>
      </div>
    """
    try:
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": f"OTP: Confirm ₹{amount_inr:,.0f} credit line for {brand_name}",
            "html": html,
        })
    except Exception as e:
        logging.error(f"OTP email failed to {to_email}: {e}")


# ───── ADMIN — Credit Line OTP + Upload ─────
@router.post("/admin/brands/{brand_id}/credit-lines/otp")
async def request_credit_line_otp(brand_id: str, data: BrandCreditOtpRequest, admin=Depends(auth_helpers.get_current_admin)):
    if data.lender_name not in LENDER_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Lender must be one of {sorted(LENDER_OPTIONS)}")
    if data.amount_inr <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    brand = await db.brands.find_one({"id": brand_id, "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found or inactive")

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    otp_id = str(uuid.uuid4())
    otp_doc = {
        "id": otp_id,
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email"),
        "purpose": "brand_credit_upload",
        "brand_id": brand_id,
        "lender_name": data.lender_name,
        "amount_inr": float(data.amount_inr),
        "code_hash": _hash(code),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "consumed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_otps.insert_one(otp_doc)
    await asyncio.to_thread(_send_otp_email_sync, BRAND_OTP_INBOX, code, brand["name"], data.amount_inr, data.lender_name)
    return {"otp_request_id": otp_id, "sent_to": BRAND_OTP_INBOX, "expires_in_minutes": 10}


@router.post("/admin/brands/{brand_id}/credit-lines")
async def create_credit_line(brand_id: str, data: BrandCreditLineCreate, admin=Depends(auth_helpers.get_current_admin)):
    if data.lender_name not in LENDER_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Lender must be one of {sorted(LENDER_OPTIONS)}")
    if data.amount_inr <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    otp = await db.admin_otps.find_one({
        "id": data.otp_request_id,
        "admin_id": admin.get("id"),
        "purpose": "brand_credit_upload",
        "brand_id": brand_id,
        "consumed": False,
    }, {"_id": 0})
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP request")
    if datetime.now(timezone.utc) > datetime.fromisoformat(otp["expires_at"]):
        raise HTTPException(status_code=400, detail="OTP expired — request a new one")
    if abs(float(otp["amount_inr"]) - float(data.amount_inr)) > 0.01 or otp["lender_name"] != data.lender_name:
        raise HTTPException(status_code=400, detail="OTP does not match this lender/amount — request a new one")
    if not _verify(data.otp_code, otp["code_hash"]):
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    line_id = str(uuid.uuid4())
    line_doc = {
        "id": line_id,
        "brand_id": brand_id,
        "lender_name": data.lender_name,
        "amount_inr": round(float(data.amount_inr), 2),
        "utilized_inr": 0.0,
        "status": "active",
        "screenshot_url": data.screenshot_url or "",
        "note": data.note or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "created_by_email": admin.get("email"),
    }
    await db.brand_credit_lines.insert_one(line_doc)
    await db.admin_otps.update_one({"id": otp["id"]}, {"$set": {"consumed": True, "consumed_at": datetime.now(timezone.utc).isoformat()}})
    await _write_ledger(
        brand_id, "credit_allocated", data.amount_inr, admin.get("id"),
        line_id=line_id, lender_name=data.lender_name, screenshot_url=data.screenshot_url or "", note=data.note or "",
    )
    return {"id": line_id, "message": "Credit line created"}


@router.get("/admin/brands/{brand_id}/credit-lines")
async def list_credit_lines(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    lines = await db.brand_credit_lines.find({"brand_id": brand_id}, {"_id": 0}).sort("created_at", 1).to_list(length=200)
    return lines


@router.get("/admin/brands/{brand_id}/ledger")
async def admin_list_ledger(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    entries = await db.brand_credit_ledger.find({"brand_id": brand_id}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return entries


@router.post("/admin/brands/{brand_id}/sample-credits/otp")
async def request_sample_credit_otp(brand_id: str, data: SampleCreditOtpRequest, admin=Depends(auth_helpers.get_current_admin)):
    if data.delta == 0:
        raise HTTPException(status_code=400, detail="Delta must be non-zero")
    brand = await db.brands.find_one({"id": brand_id, "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    otp_id = str(uuid.uuid4())
    otp_doc = {
        "id": otp_id,
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email"),
        "purpose": "brand_sample_credit_adjust",
        "brand_id": brand_id,
        "delta": int(data.delta),
        "code_hash": _hash(code),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "consumed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_otps.insert_one(otp_doc)

    # Reuse the credit-line OTP email helper with sample-specific messaging
    try:
        if RESEND_API_KEY:
            action = "add" if data.delta > 0 else "remove"
            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": [BRAND_OTP_INBOX],
                "subject": f"OTP: Confirm {action} {abs(data.delta)} sample credits for {brand['name']}",
                "html": f"""
                  <div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
                    <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
                      <h2 style="margin:0;font-size:18px;">Confirm sample-credit adjustment</h2>
                    </div>
                    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
                      <p style="color:#374151;font-size:14px;margin:0 0 16px 0;">
                        You're about to <strong>{action} {abs(data.delta)}</strong> sample credits for brand <strong>{brand['name']}</strong>.
                      </p>
                      <p style="font-size:13px;color:#64748b;margin:0 0 8px 0;">Enter this OTP to confirm:</p>
                      <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#d97706;background:#fef3c7;padding:14px 0;text-align:center;border-radius:8px;font-family:monospace;">
                        {code}
                      </div>
                      <p style="font-size:12px;color:#94a3b8;margin:16px 0 0 0;">This code expires in 10 minutes.</p>
                    </div>
                  </div>
                """,
            })
    except Exception as e:
        logging.error(f"Sample OTP email failed: {e}")

    return {"otp_request_id": otp_id, "sent_to": BRAND_OTP_INBOX, "expires_in_minutes": 10}


@router.post("/admin/brands/{brand_id}/sample-credits")
async def admin_adjust_sample_credits(brand_id: str, data: SampleCreditAdjust, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    otp = await db.admin_otps.find_one({
        "id": data.otp_request_id,
        "admin_id": admin.get("id"),
        "purpose": "brand_sample_credit_adjust",
        "brand_id": brand_id,
        "consumed": False,
    }, {"_id": 0})
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP request")
    if datetime.now(timezone.utc) > datetime.fromisoformat(otp["expires_at"]):
        raise HTTPException(status_code=400, detail="OTP expired — request a new one")
    if int(otp.get("delta", 0)) != int(data.delta):
        raise HTTPException(status_code=400, detail="OTP delta does not match — request a new one")
    if not _verify(data.otp_code, otp["code_hash"]):
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    new_total = int(brand.get("sample_credits_total", 0)) + int(data.delta)
    if new_total < int(brand.get("sample_credits_used", 0)):
        raise HTTPException(status_code=400, detail="Cannot reduce below already-used credits")
    await db.brands.update_one({"id": brand_id}, {"$set": {"sample_credits_total": new_total}})
    await db.admin_otps.update_one({"id": otp["id"]}, {"$set": {"consumed": True, "consumed_at": datetime.now(timezone.utc).isoformat()}})
    await _write_ledger(
        brand_id,
        "sample_credit_added" if data.delta >= 0 else "sample_credit_removed",
        abs(int(data.delta)), admin.get("id"),
        note=data.note or "Admin adjustment",
    )
    return {"sample_credits_total": new_total}


# ───── BRAND — Credit Summary + Ledger ─────
@router.get("/brand/credit-summary")
async def brand_credit_summary(user=Depends(get_current_brand_user)):
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    lines = await db.brand_credit_lines.find({"brand_id": user["brand_id"], "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(length=200)
    total_allocated = sum(float(l.get("amount_inr", 0)) for l in lines)
    total_utilized = sum(float(l.get("utilized_inr", 0)) for l in lines)
    available = round(total_allocated - total_utilized, 2)
    sample_total = int(brand.get("sample_credits_total", 0))
    sample_used = int(brand.get("sample_credits_used", 0))
    # Credit period drives the 1.5%/month surcharge in the cart UI
    credit_period_days = int(brand.get("credit_period_days") or 30)
    if credit_period_days not in (30, 60, 90):
        credit_period_days = 30
    return {
        "credit": {
            "total_allocated": round(total_allocated, 2),
            "total_utilized": round(total_utilized, 2),
            "available": available,
            "lines": lines,
            "credit_period_days": credit_period_days,
        },
        "sample_credits": {
            "total": sample_total,
            "used": sample_used,
            "available": sample_total - sample_used,
        },
    }


@router.get("/brand/ledger")
async def brand_ledger(user=Depends(get_current_brand_user)):
    """Returns the brand's credit/sample-credit ledger sorted newest-first.
    For entries with `order_id`, we join the orders collection so the UI can
    render the full product names and a link back to the order detail page.
    """
    entries = await db.brand_credit_ledger.find(
        {"brand_id": user["brand_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=500)

    # Bulk-fetch the related orders in one round-trip
    order_ids = list({e["order_id"] for e in entries if e.get("order_id")})
    orders_map = {}
    if order_ids:
        cursor = db.orders.find(
            {"id": {"$in": order_ids}},
            {"_id": 0, "id": 1, "order_number": 1, "order_type": 1, "items": 1, "total": 1, "status": 1},
        )
        async for o in cursor:
            items = o.get("items") or []
            orders_map[o["id"]] = {
                "order_number": o.get("order_number", ""),
                "order_type": o.get("order_type", ""),
                "status": o.get("status", ""),
                "total": o.get("total", 0),
                # Surface a compact product list (first 3) for ledger card display
                "products": [
                    {
                        "fabric_id": it.get("fabric_id", ""),
                        "fabric_name": it.get("fabric_name", ""),
                        "fabric_code": it.get("fabric_code", ""),
                        "category_name": it.get("category_name", ""),
                        "quantity": it.get("quantity", 0),
                        "unit": it.get("unit", "m"),
                        "color_name": it.get("color_name", ""),
                        # Internal-only PDP URL — frontend resolves /enterprise/fabrics/<id>
                        "pdp_url": f"/enterprise/fabrics/{it.get('fabric_id', '')}" if it.get("fabric_id") else "",
                    }
                    for it in items[:5]
                ],
                "items_total": len(items),
            }
    for e in entries:
        if e.get("order_id") and e["order_id"] in orders_map:
            e["order"] = orders_map[e["order_id"]]
    return entries


# ───── BRAND — Order Placement with FIFO debit ─────
async def _debit_credit_fifo(brand_id: str, amount: float, order_id: str, actor_id: str):
    """Debit brand's credit lines FIFO (oldest first). Raises if insufficient."""
    lines = await db.brand_credit_lines.find({"brand_id": brand_id, "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(length=200)
    total_avail = sum(float(l.get("amount_inr", 0)) - float(l.get("utilized_inr", 0)) for l in lines)
    if total_avail + 0.01 < amount:
        raise HTTPException(status_code=400, detail=f"Insufficient credit: available ₹{total_avail:,.2f}, required ₹{amount:,.2f}")
    remaining = float(amount)
    debits = []
    for line in lines:
        if remaining <= 0.001:
            break
        avail = float(line["amount_inr"]) - float(line["utilized_inr"])
        if avail <= 0:
            continue
        take = round(min(avail, remaining), 2)
        await db.brand_credit_lines.update_one({"id": line["id"]}, {"$inc": {"utilized_inr": take}})
        debits.append({"line_id": line["id"], "lender_name": line["lender_name"], "amount": take})
        remaining = round(remaining - take, 2)
    await _write_ledger(
        brand_id, "debit_order", amount, actor_id,
        order_id=order_id, debits=debits,
    )
    return debits


async def _debit_sample_credits(brand_id: str, amount: int, order_id: str, actor_id: str):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0})
    avail = int(brand.get("sample_credits_total", 0)) - int(brand.get("sample_credits_used", 0))
    if avail < amount:
        raise HTTPException(status_code=400, detail=f"Insufficient sample credits: available {avail}, required {amount}")
    await db.brands.update_one({"id": brand_id}, {"$inc": {"sample_credits_used": int(amount)}})
    await _write_ledger(
        brand_id, "sample_credit_used", amount, actor_id,
        order_id=order_id,
    )


@router.post("/brand/orders")
async def brand_create_order(data: BrandOrderCreate, user=Depends(get_current_brand_user)):
    if data.order_type not in ("sample", "bulk"):
        raise HTTPException(status_code=400, detail="order_type must be 'sample' or 'bulk'")
    if not data.items:
        raise HTTPException(status_code=400, detail="No items")

    brand = await db.brands.find_one({"id": user["brand_id"], "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=403, detail="Brand inactive")
    allowed = brand.get("allowed_category_ids") or []

    # Load fabrics + validate catalogue rules
    priced_items = []
    subtotal = 0.0
    for it in data.items:
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be > 0")
        f = await db.fabrics.find_one({"id": it.fabric_id}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail=f"Fabric {it.fabric_id} not found")
        if f.get("category_id") not in allowed:
            raise HTTPException(status_code=403, detail=f"Fabric '{f.get('name')}' not available for your brand")
        if data.order_type == "sample":
            # Sample orders are capped at 5 meters per line (industry swatch norm)
            if it.quantity > 5:
                raise HTTPException(status_code=400, detail=f"Sample orders are limited to 5 meters per line (requested {it.quantity} for '{f.get('name')}')")
            sample_price = float(f.get("sample_price") or 100)
            line_total = sample_price * it.quantity
            price_per_unit = sample_price
        else:
            rate = float(f.get("rate_per_meter") or f.get("price_per_meter") or 0)
            if rate <= 0:
                raise HTTPException(status_code=400, detail=f"Fabric '{f.get('name')}' has no price")
            # MOQ can be an int or a string like "500 meters" / "1500MTR" — extract leading digits
            moq_raw = f.get("moq")
            moq = 1
            if isinstance(moq_raw, (int, float)):
                moq = int(moq_raw)
            elif isinstance(moq_raw, str):
                import re as _re
                m = _re.match(r"\s*(\d+)", moq_raw)
                if m:
                    moq = int(m.group(1))
            if it.quantity < moq:
                raise HTTPException(status_code=400, detail=f"{f.get('name')}: qty {it.quantity} below MOQ {moq}")
            # Defence-in-depth: stock cap. If the fabric has a recorded
            # quantity_available > 0, refuse any bulk line that exceeds it.
            stock_q = int(f.get("quantity_available") or 0)
            if stock_q > 0 and it.quantity > stock_q:
                raise HTTPException(
                    status_code=400,
                    detail=f"{f.get('name')}: only {stock_q} available — use Request a Quote for larger volumes."
                )
            line_total = rate * it.quantity
            price_per_unit = rate
        subtotal += line_total
        priced_items.append({
            "fabric_id": it.fabric_id,
            "fabric_name": f.get("name", ""),
            "fabric_code": f.get("fabric_code", ""),
            "category_name": f.get("category_name", ""),
            "seller_company": f.get("seller_company", ""),
            "seller_id": f.get("seller_id", ""),
            "quantity": it.quantity,
            "price_per_meter": price_per_unit,
            "order_type": data.order_type,
            "image_url": (f.get("images") or [""])[0] if f.get("images") else "",
            "hsn_code": f.get("hsn_code", ""),
            "color_name": it.color_name or "",
            "color_hex": it.color_hex or "",
            "line_total": round(line_total, 2),
        })

    # Charges
    tax = round(subtotal * 0.05, 2)
    if data.order_type == "bulk":
        packaging_charge = sum(it["quantity"] * 1 for it in priced_items)  # ₹1/m
        logistics_total = max(round(subtotal * 0.03, 2), 3000.0)
        logistics_only = round(logistics_total - packaging_charge, 2)
        if logistics_only < 0:
            logistics_only = 0
            logistics_total = packaging_charge
    else:
        packaging_charge = 0
        logistics_only = 0
        logistics_total = 100.0  # flat ₹100 for samples
    pre_credit_total = round(subtotal + tax + logistics_total, 2)

    # Credit charges (1.5% per month × period/30) — only when paying via
    # Locofast credit line. Cash/Razorpay orders are charge-free. Period
    # is read off the brand profile (single value drives all credit lines
    # for this GSTIN's lender pool).
    credit_charge = 0.0
    credit_period_days = 0
    if data.order_type != "sample" and data.payment_method != "razorpay":
        brand_doc = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0, "credit_period_days": 1}) or {}
        credit_period_days = int(brand_doc.get("credit_period_days") or 30)
        if credit_period_days not in (30, 60, 90):
            credit_period_days = 30
        months = credit_period_days / 30.0
        credit_charge = round(pre_credit_total * 0.015 * months, 2)
    total = round(pre_credit_total + credit_charge, 2)

    # Debit BEFORE creating order; on failure nothing is committed
    order_id = str(uuid.uuid4())
    payment_method = "credit"
    if data.order_type == "sample":
        # Samples always use sample credits — no Razorpay path for samples yet.
        await _debit_sample_credits(user["brand_id"], int(round(total)), order_id, user["id"])
        payment_method = "sample_credit"
    else:
        # Bulk: either debit credit line (default) OR verify Razorpay signature
        if data.payment_method == "razorpay":
            if not (data.razorpay_order_id and data.razorpay_payment_id and data.razorpay_signature):
                raise HTTPException(status_code=400, detail="Razorpay fields missing")
            key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
            if not key_secret:
                raise HTTPException(status_code=500, detail="Razorpay not configured")
            expected = hmac.new(
                key_secret.encode(),
                f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(expected, data.razorpay_signature):
                raise HTTPException(status_code=400, detail="Invalid Razorpay signature")
            # Confirm the captured amount matches our computed total (paise)
            client = _razorpay_client()
            try:
                rp_order = await asyncio.to_thread(client.order.fetch, data.razorpay_order_id)
                paid_amount_inr = (rp_order.get("amount_paid") or 0) / 100
                if abs(paid_amount_inr - total) > 1.0:  # allow 1 INR rounding
                    raise HTTPException(
                        status_code=400,
                        detail=f"Amount mismatch: paid ₹{paid_amount_inr}, order total ₹{total}"
                    )
            except HTTPException:
                raise
            except Exception as e:
                logging.error(f"Razorpay order verification failed: {e}")
                raise HTTPException(status_code=400, detail="Could not verify Razorpay order")
            payment_method = "razorpay"
        else:
            await _debit_credit_fifo(user["brand_id"], total, order_id, user["id"])
            payment_method = "brand_credit"

    # Order number
    counter = await db.counters.find_one_and_update(
        {"_id": "invoice_number"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    seq = counter.get("seq", 1)
    order_number = f"LF/ORD/{seq:03d}"

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "items": priced_items,
        "customer": {
            "name": user["name"],
            "email": user["email"],
            "phone": brand.get("phone", ""),
            "company": brand["name"],
            "gst_number": brand.get("gst", ""),
            "address": data.ship_to_address or brand.get("address", ""),
            "city": data.ship_to_city or "",
            "state": data.ship_to_state or "",
            "pincode": data.ship_to_pincode or "",
        },
        "subtotal": round(subtotal, 2),
        "tax": tax,
        "discount": 0,
        "credit_charge": credit_charge,
        "credit_period_days": credit_period_days,
        "total": total,
        "currency": "INR",
        "logistics_charge": logistics_total,
        "packaging_charge": packaging_charge,
        "logistics_only_charge": logistics_only,
        "status": "paid",
        "payment_status": "paid",
        "payment_method": payment_method,
        "razorpay_order_id": data.razorpay_order_id or None,
        "razorpay_payment_id": data.razorpay_payment_id or None,
        "booking_type": "brand",
        "brand_id": user["brand_id"],
        "brand_name": brand["name"],
        "brand_user_id": user["id"],
        "brand_user_email": user["email"],
        "order_type": data.order_type,
        "notes": data.notes or "",
        # Factory-only optional attachments (blank for regular brand orders)
        "enterprise_type": brand.get("type", "brand"),
        "po_file_url": (data.po_file_url or "").strip(),
        "tech_pack_url": (data.tech_pack_url or "").strip(),
        "qty_color_matrix": (data.qty_color_matrix or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "paid_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order_doc)
    order_doc.pop("_id", None)

    # Email fanout — fire-and-forget so slow Resend doesn't block checkout
    asyncio.create_task(_notify_order_recipients(order_doc))

    # Auto-create Shiprocket shipment for both samples and bulk so the
    # order automatically lands on the courier's pickup queue. Best-effort
    # and non-blocking — checkout doesn't fail if Shiprocket is down.
    asyncio.create_task(_create_shiprocket_shipment_for_brand_order(order_doc))

    return {
        "id": order_id,
        "order_number": order_number,
        "total": total,
        "message": "Order placed via brand credit",
    }


async def _create_shiprocket_shipment_for_brand_order(order_doc: dict):
    """Mirror the B2C verify_payment path — calls orders_router.create_shiprocket_shipment
    and writes back the courier ids on the order."""
    try:
        from orders_router import create_shiprocket_shipment
        result = await create_shiprocket_shipment(order_doc)
        if result.get("success"):
            await db.orders.update_one(
                {"id": order_doc["id"]},
                {"$set": {
                    "shiprocket_order_id": result.get("shiprocket_order_id"),
                    "shiprocket_shipment_id": result.get("shipment_id"),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            logging.info(f"[shiprocket] brand order {order_doc.get('order_number')} created · sr_order={result.get('shiprocket_order_id')}")
        else:
            logging.error(f"[shiprocket] brand order {order_doc.get('order_number')} failed: {result.get('error')}")
    except Exception as e:
        logging.error(f"[shiprocket] brand order shipment exception: {e}")


# ────────────────────────────────────────────────────────────────
#  Email fanout on brand order placement
# ────────────────────────────────────────────────────────────────
SUPPORT_EMAIL = os.environ.get("LOCOFAST_SUPPORT_EMAIL", "support@locofast.com")
OPS_INBOX = os.environ.get("LOCOFAST_OPS_INBOX", "orders@locofast.com")
# Additional internal stakeholders CC'd on every brand order so they can
# coordinate delivery directly with the customer.
ORDER_DELIVERY_CC = [e.strip() for e in os.environ.get(
    "LOCOFAST_ORDER_DELIVERY_CC", "ashish.katiyar@locofast.com,creditoperations@locofast.com"
).split(",") if e.strip()]


def _order_items_html(order):
    rows = []
    for it in order.get("items", []):
        fabric_ref = it.get("fabric_slug") or it.get("fabric_id", "")
        fabric_url = f"{SITE_URL}/fabrics/{fabric_ref}" if fabric_ref else ""
        name_cell = (
            f"<a href='{fabric_url}' style='color:#2563EB;text-decoration:underline;font-weight:600;'>{it.get('fabric_name', '')}</a>"
            if fabric_url else (it.get("fabric_name", "") or "")
        )
        rows.append(
            f"<tr><td style='padding:8px 12px;border-bottom:1px solid #eef2f7;'>{name_cell}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #eef2f7;'>{it.get('fabric_code', '')}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #eef2f7;text-align:right;'>{it.get('quantity', 0)}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #eef2f7;text-align:right;'>₹{it.get('line_total', 0):,.2f}</td></tr>"
        )
    return (
        "<table style='width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;border:1px solid #eef2f7;border-radius:6px;overflow:hidden;'>"
        "<thead style='background:#f9fafb;text-align:left;'><tr>"
        "<th style='padding:8px 12px;'>Fabric</th><th style='padding:8px 12px;'>Code</th>"
        "<th style='padding:8px 12px;text-align:right;'>Qty</th><th style='padding:8px 12px;text-align:right;'>Amount</th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
    )


def _order_email_html(order, audience_line, cta_html=""):
    c = order.get("customer", {})
    addr_parts = [c.get("address", ""), c.get("city", ""), c.get("state", ""), c.get("pincode", "")]
    addr = ", ".join(p for p in addr_parts if p)
    return f"""
      <div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
        <div style="background:#059669;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
          <h2 style="margin:0;font-size:18px;">{"Sample" if order.get("order_type") == "sample" else "Bulk"} Order · {order.get("order_number")}</h2>
          <p style="margin:4px 0 0 0;font-size:12px;opacity:0.9;">{audience_line}</p>
        </div>
        <div style="padding:22px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;background:#fff;">
          <p style="font-size:14px;color:#334155;margin:0 0 8px 0;">
            <strong>{c.get("company", "")}</strong> placed a {"sample" if order.get("order_type") == "sample" else "bulk"} order on Locofast.
          </p>
          <div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:6px;padding:12px 14px;font-size:13px;color:#475569;margin:12px 0;">
            <div><strong>Placed by:</strong> {c.get("name", "")} ({c.get("email", "")})</div>
            <div><strong>Phone:</strong> {c.get("phone", "—")}</div>
            {f"<div><strong>Ship to:</strong> {addr}</div>" if addr else ""}
          </div>
          {_order_items_html(order)}
          <table style="width:100%;font-size:13px;color:#475569;">
            <tr><td>Subtotal</td><td style="text-align:right;">₹{order.get("subtotal", 0):,.2f}</td></tr>
            <tr><td>Tax (5%)</td><td style="text-align:right;">₹{order.get("tax", 0):,.2f}</td></tr>
            <tr><td>Logistics</td><td style="text-align:right;">₹{order.get("logistics_charge", 0):,.2f}</td></tr>
            <tr><td style="padding-top:10px;font-weight:700;color:#0f172a;">Total</td><td style="padding-top:10px;text-align:right;font-weight:700;color:#059669;">₹{order.get("total", 0):,.2f}</td></tr>
          </table>
          <p style="font-size:12px;color:#94a3b8;margin:18px 0 0 0;">Payment method: {order.get("payment_method", "")}. Any questions? Reply to this email or write to {SUPPORT_EMAIL}.</p>
          <div style="background:#fff7ed;border-left:3px solid #fb923c;border-radius:6px;padding:10px 14px;margin-top:14px;font-size:12px;color:#9a3412;line-height:1.55;">
            <strong>Dispatch commitments</strong><br>
            {"• Samples dispatched in 24–48 hours" if order.get("order_type") == "sample" else "• Bulk: 24–48 hours for packaging &amp; dispatch (in-stock items)<br>• Manufactured-to-order items typically dispatch within ~30 days of confirmation"}
          </div>
          {cta_html}
        </div>
      </div>
    """


def _send_email_sync(to_list, subject, html):
    if not RESEND_API_KEY or not to_list:
        logging.info(f"[email skipped] to={to_list} subject={subject}")
        return
    try:
        resend.Emails.send({"from": SENDER_EMAIL, "to": to_list, "subject": subject, "html": html})
    except Exception as e:
        logging.error(f"Email failed to {to_list}: {e}")


async def _notify_order_recipients(order):
    """Send 4 targeted emails per new brand order: buyer, brand admins, sellers, ops.
    Each attempt is persisted to `email_logs` for Admin audit trail."""
    from email_router import log_email as _audit_log
    try:
        brand_id = order.get("brand_id")
        order_id = order.get("id")
        order_no = order.get("order_number", "")
        o_type = order.get("order_type", "bulk")
        subject_prefix = f"[Locofast] {o_type.title()} Order {order_no}"

        async def _send_and_log(kind, recipients, subject, html, meta=None):
            if not recipients:
                return
            # Inner try/except so one failing send doesn't abort the rest
            try:
                if not RESEND_API_KEY:
                    await _audit_log(kind=kind, recipients=recipients, subject=subject, html=html, status="skipped",
                                     error="RESEND_API_KEY not configured",
                                     order_id=order_id, order_number=order_no, brand_id=brand_id, meta=meta or {})
                    return
                await asyncio.to_thread(resend.Emails.send, {"from": SENDER_EMAIL, "to": recipients, "subject": subject, "html": html})
                await _audit_log(kind=kind, recipients=recipients, subject=subject, html=html, status="sent",
                                 order_id=order_id, order_number=order_no, brand_id=brand_id, meta=meta or {})
            except Exception as ex:
                logging.error(f"Email failed ({kind}) to {recipients}: {ex}")
                await _audit_log(kind=kind, recipients=recipients, subject=subject, html=html, status="failed",
                                 error=str(ex),
                                 order_id=order_id, order_number=order_no, brand_id=brand_id, meta=meta or {})

        # 1) Placer (brand user who checked out)
        placer = order.get("brand_user_email")
        if placer:
            html = _order_email_html(order, "Your order has been placed successfully.")
            await _send_and_log(f"brand_order_{o_type}_buyer", [placer], f"{subject_prefix} — Confirmation", html)

        # 2) Brand admins for visibility
        admin_emails = []
        async for u in db.brand_users.find({"brand_id": brand_id, "role": "brand_admin", "status": "active"}, {"_id": 0, "email": 1}):
            if u.get("email") and u["email"] != placer:
                admin_emails.append(u["email"])
        if admin_emails:
            html = _order_email_html(order, f"New order by {order.get('customer', {}).get('name', 'a team member')}.")
            await _send_and_log(f"brand_order_{o_type}_admins", admin_emails, f"{subject_prefix} — New team order", html)

        # 3) Sellers of each item (deduped)
        seller_ids = list({(it.get("seller_id") or "") for it in order.get("items", []) if it.get("seller_id")})
        if seller_ids:
            seller_emails = []
            async for s in db.sellers.find({"id": {"$in": seller_ids}}, {"_id": 0, "email": 1, "contact_email": 1}):
                e = s.get("email") or s.get("contact_email")
                if e:
                    seller_emails.append(e)
            if seller_emails:
                html = _order_email_html(order, "A new order has been placed for your SKU(s). Please prepare dispatch.")
                await _send_and_log(f"brand_order_{o_type}_sellers", seller_emails, f"{subject_prefix} — Action required", html,
                                    meta={"seller_ids": seller_ids})

        # 4) Internal Locofast ops + delivery coordinators (Ashish etc.)
        html = _order_email_html(order, "Internal notification — route for fulfilment.")
        ops_recipients = [OPS_INBOX] + [e for e in ORDER_DELIVERY_CC if e and e != OPS_INBOX]
        await _send_and_log(f"brand_order_{o_type}_ops", ops_recipients, f"{subject_prefix} — Ops handoff", html)
    except Exception as e:
        logging.error(f"_notify_order_recipients failed: {e}")


@router.get("/brand/orders")
async def brand_list_orders(user=Depends(get_current_brand_user)):
    orders = await db.orders.find(
        {"brand_id": user["brand_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(length=200)
    await _attach_invoice_links(orders, user["brand_id"])
    return orders


@router.get("/brand/orders/{order_id}/emails")
async def brand_order_emails(order_id: str, user=Depends(get_current_brand_user)):
    """Return the email audit trail for one of the brand's own orders.
    Brand admins can see which stakeholders were notified (status + timestamp).
    HTML bodies are stripped from list view to keep payload small."""
    order = await db.orders.find_one({"id": order_id, "brand_id": user["brand_id"]}, {"_id": 0, "id": 1, "order_number": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    logs = await db.email_logs.find(
        {"order_id": order_id},
        {"_id": 0, "html": 0},  # hide bodies from brand view
    ).sort("created_at", -1).to_list(length=100)
    return logs


# ───── BRAND — Razorpay sample-credit top-up (Slice 3) ─────
def _razorpay_client():
    try:
        import razorpay
        key_id = os.environ.get("RAZORPAY_KEY_ID")
        key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
        if not key_id or not key_secret:
            return None
        return razorpay.Client(auth=(key_id, key_secret))
    except Exception:
        return None


@router.post("/brand/sample-credits/topup/create-order")
async def brand_sample_topup_create(data: BrandTopupCreate, user=Depends(get_current_brand_user)):
    if data.amount_inr < 100:
        raise HTTPException(status_code=400, detail="Minimum top-up is ₹100")
    client = _razorpay_client()
    if not client:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")
    rp_order = await asyncio.to_thread(client.order.create, {
        "amount": int(data.amount_inr) * 100,
        "currency": "INR",
        "notes": {
            "brand_id": user["brand_id"],
            "brand_user_id": user["id"],
            "purpose": "sample_credit_topup",
        },
    })
    return {
        "razorpay_order_id": rp_order["id"],
        "amount_inr": int(data.amount_inr),
        "amount_paise": int(data.amount_inr) * 100,
        "currency": "INR",
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
    }


@router.post("/brand/sample-credits/topup/verify")
async def brand_sample_topup_verify(data: BrandTopupVerify, user=Depends(get_current_brand_user)):
    # Verify signature
    import hmac, hashlib
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    expected = hmac.new(key_secret.encode(), f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    client = _razorpay_client()
    if not client:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")
    rp_order = await asyncio.to_thread(client.order.fetch, data.razorpay_order_id)
    if rp_order.get("notes", {}).get("brand_id") != user["brand_id"]:
        raise HTTPException(status_code=403, detail="Order does not belong to your brand")
    credits = int(rp_order["amount"]) // 100  # ₹1 = 1 credit
    await db.brands.update_one({"id": user["brand_id"]}, {"$inc": {"sample_credits_total": credits}})
    await _write_ledger(
        user["brand_id"], "sample_credit_added", credits, user["id"],
        razorpay_order_id=data.razorpay_order_id,
        razorpay_payment_id=data.razorpay_payment_id,
        note="Self-serve Razorpay top-up",
    )
    return {"message": f"Added {credits} sample credits", "credits": credits}


@router.post("/brand/orders/razorpay/create")
async def brand_bulk_razorpay_create(data: BrandOrderCreate, user=Depends(get_current_brand_user)):
    """Create a Razorpay order for a brand BULK cart when credit is
    unavailable or insufficient. Returns the RP order id + amount so the
    frontend can launch the checkout modal. After payment succeeds, the
    frontend replays `POST /brand/orders` with payment_method=razorpay and
    the rp_order_id / payment_id / signature for server-side verification.

    We intentionally DO NOT debit credit here, nor validate stock (that's
    re-done atomically in `brand_create_order`). This endpoint only computes
    the authoritative total and opens a Razorpay order so the client can
    charge the brand's card / UPI / netbanking.
    """
    if data.order_type != "bulk":
        raise HTTPException(status_code=400, detail="Razorpay path only supports bulk orders")
    if not data.items:
        raise HTTPException(status_code=400, detail="No items")

    brand = await db.brands.find_one({"id": user["brand_id"], "status": "active"}, {"_id": 0})
    if not brand:
        raise HTTPException(status_code=403, detail="Brand inactive")
    allowed = brand.get("allowed_category_ids") or []

    subtotal = 0.0
    for it in data.items:
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be > 0")
        f = await db.fabrics.find_one({"id": it.fabric_id}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail=f"Fabric {it.fabric_id} not found")
        if f.get("category_id") not in allowed:
            raise HTTPException(status_code=403, detail=f"Fabric '{f.get('name')}' not available for your brand")
        rate = float(f.get("rate_per_meter") or f.get("price_per_meter") or 0)
        if rate <= 0:
            raise HTTPException(status_code=400, detail=f"Fabric '{f.get('name')}' has no price")
        subtotal += rate * it.quantity

    tax = round(subtotal * 0.05, 2)
    # Match the same logistics/packaging math used by brand_create_order so
    # the RP amount equals the final order total to the rupee.
    packaging_charge = sum(int(it.quantity) * 1 for it in data.items)
    logistics_total = max(round(subtotal * 0.03, 2), float(packaging_charge), 3000.0)
    total = round(subtotal + tax + logistics_total, 2)

    client = _razorpay_client()
    if not client:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")
    rp_order = await asyncio.to_thread(client.order.create, {
        "amount": int(round(total * 100)),
        "currency": "INR",
        "notes": {
            "brand_id": user["brand_id"],
            "brand_user_id": user["id"],
            "purpose": "brand_bulk_order",
        },
    })
    return {
        "razorpay_order_id": rp_order["id"],
        "amount_inr": float(total),
        "amount_paise": int(round(total * 100)),
        "currency": "INR",
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
    }


# =================== FACTORY CART HANDOFFS (Brand → Factory SKU allocation) ===================
#
# Brand admins build a cart and "Send to factory"; the factory user sees the
# handoff on their Allocations tab and can Accept (items queued into their
# cart, ready to check out against their own credit line) or Reject.
#
# Financial model is preserved: the factory still places the order, pays with
# its own credit line, and receives its own invoice. The brand only *drives*
# SKU selection — it does not pay for the factory.

class HandoffItem(BaseModel):
    fabric_id: str
    fabric_name: str = ""
    fabric_code: str = ""
    category_name: str = ""
    image_url: str = ""
    quantity: float
    unit: str = "m"                      # "m" | "oz" etc. — display only
    color_name: str = ""
    color_hex: str = ""
    order_type: str                      # "sample" | "bulk"
    price_per_unit: Optional[float] = None
    moq: Optional[str] = ""
    seller_company: Optional[str] = ""


class HandoffCreate(BaseModel):
    factory_id: str
    items: List[HandoffItem]
    note: Optional[str] = ""


def _serialize_handoff(h: dict) -> dict:
    """Strip Mongo _id and return a plain dict safe for JSON."""
    if not h:
        return h
    out = {k: v for k, v in h.items() if k != "_id"}
    return out


@router.post("/brand/factory-handoffs")
async def create_factory_handoff(data: HandoffCreate, user=Depends(get_current_brand_user)):
    """Any brand user can send a prepared cart to one of the brand's invited
    factories. Brand admins are notified by email when an allocation is sent,
    so they can monitor what their team is delegating.

    Validates that:
      - the factory exists and is a child of the caller's brand
      - all items have a positive quantity + valid order_type
    """
    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    # Confirm factory is a child of caller's brand
    factory = await db.brands.find_one(
        {"id": data.factory_id, "type": "factory", "parent_brand_id": user["brand_id"]},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found under your brand")

    # Validate items
    clean_items = []
    for it in data.items:
        if it.quantity is None or it.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid quantity for fabric {it.fabric_id}")
        if it.order_type not in ("sample", "bulk"):
            raise HTTPException(status_code=400, detail=f"Invalid order_type for fabric {it.fabric_id}")
        clean_items.append(it.model_dump())

    handoff_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    handoff_doc = {
        "id": handoff_id,
        "brand_id": user["brand_id"],
        "brand_user_id": user["id"],
        "brand_user_name": user.get("name", ""),
        "brand_user_email": user.get("email", ""),
        "factory_id": data.factory_id,
        "factory_name": factory.get("name", ""),
        "items": clean_items,
        "note": data.note or "",
        "status": "pending",                # pending | accepted | rejected
        "created_at": now_iso,
        "updated_at": now_iso,
        "accepted_at": None,
        "rejected_at": None,
        "responded_by_user_id": None,
    }
    await db.factory_handoffs.insert_one(handoff_doc)
    handoff_doc.pop("_id", None)

    # Fire-and-forget email notifications. We run them inside a try so the
    # API response isn't blocked on an email failure — admins can still see
    # the allocation in the dashboard.
    try:
        await _notify_handoff_created(handoff_doc)
    except Exception as e:
        logging.error(f"Handoff email notification failed: {e}")

    return _serialize_handoff(handoff_doc)


async def _notify_handoff_created(handoff: dict):
    """Email brand admins (+ factory admin) when a new SKU allocation is sent.

    Recipients:
      • All brand_admin users of the parent brand (so the team knows what
        teammates are delegating — addresses the "by whom" audit question)
      • The factory's admin users (so they can action it quickly)
    Copy is kept concise with a manifest of items and a deep-link to the
    Allocations page.
    """
    if not RESEND_API_KEY:
        return  # Email dispatch disabled in this env

    # Admins of the brand (sender side)
    brand_admins = await db.brand_users.find(
        {"brand_id": handoff["brand_id"], "role": "brand_admin", "status": "active"},
        {"_id": 0, "email": 1, "name": 1},
    ).to_list(20)

    # Admins of the factory (receiver side)
    factory_admins = await db.brand_users.find(
        {"brand_id": handoff["factory_id"], "role": "brand_admin", "status": "active"},
        {"_id": 0, "email": 1, "name": 1},
    ).to_list(20)

    item_rows = "".join(
        f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'>{it.get('fabric_name','')}"
        f"{(' · ' + it.get('color_name','')) if it.get('color_name') else ''}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right'>{it.get('quantity','')}{it.get('unit','m')}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right;text-transform:capitalize'>{it.get('order_type','')}</td></tr>"
        for it in handoff.get("items", [])[:30]
    )
    note_html = (
        f"<p style='margin:12px 0 0;color:#475569;font-style:italic;'>\"{handoff.get('note','')}\"</p>"
        if handoff.get("note") else ""
    )

    link = f"{SITE_URL}/enterprise/allocations"
    subject_brand = f"[Locofast] {handoff['brand_user_name']} allocated {len(handoff['items'])} SKU(s) to {handoff['factory_name']}"
    subject_factory = f"[Locofast] New allocation from {handoff['brand_user_name']} · {len(handoff['items'])} SKU(s) to action"

    def _build_html(is_factory_side: bool) -> str:
        headline = (
            f"{handoff['brand_user_name']} has allocated {len(handoff['items'])} SKU(s) to <b>{handoff['factory_name']}</b>."
            if not is_factory_side else
            f"You have a new SKU allocation from <b>{handoff['brand_user_name']}</b> ({handoff['brand_user_email']})."
        )
        cta = "Review in dashboard" if not is_factory_side else "Accept or Reject"
        return f"""
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#0f172a;">
  <h2 style="margin:0 0 8px;font-size:18px;">SKU Allocation</h2>
  <p style="margin:0 0 12px;color:#334155;">{headline}</p>
  {note_html}
  <table style="margin-top:14px;border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;">
    <thead><tr style="background:#f8fafc;">
      <th style="padding:8px 10px;text-align:left;color:#64748b;">SKU</th>
      <th style="padding:8px 10px;text-align:right;color:#64748b;">Qty</th>
      <th style="padding:8px 10px;text-align:right;color:#64748b;">Type</th>
    </tr></thead>
    <tbody>{item_rows}</tbody>
  </table>
  <p style="margin:16px 0 0;">
    <a href="{link}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">{cta} →</a>
  </p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;">
    Sent by {handoff['brand_user_name']} ({handoff['brand_user_email']}) · {handoff['created_at'][:19].replace('T',' ')} UTC
  </p>
</div>
        """

    # Brand admins — skip the sender so they don't email themselves
    brand_recipients = [a["email"] for a in brand_admins if a["email"] != handoff.get("brand_user_email")]
    if brand_recipients:
        try:
            await asyncio.to_thread(
                resend.Emails.send,
                {"from": SENDER_EMAIL, "to": brand_recipients, "subject": subject_brand, "html": _build_html(False)},
            )
        except Exception as e:
            logging.error(f"Brand-admin notification failed: {e}")

    factory_recipients = [a["email"] for a in factory_admins]
    if factory_recipients:
        try:
            await asyncio.to_thread(
                resend.Emails.send,
                {"from": SENDER_EMAIL, "to": factory_recipients, "subject": subject_factory, "html": _build_html(True)},
            )
        except Exception as e:
            logging.error(f"Factory-admin notification failed: {e}")


@router.get("/brand/factory-handoffs")
async def list_brand_sent_handoffs(user=Depends(get_current_brand_user)):
    """List handoffs sent by anyone in this brand's team. All brand users can
    view — the Allocations page gives visibility across the team."""
    rows = await db.factory_handoffs.find(
        {"brand_id": user["brand_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


@router.get("/brand/factory-handoffs/incoming")
async def list_incoming_handoffs(user=Depends(get_current_brand_user)):
    """Factory user — list allocations my parent brand has pushed to me."""
    me_brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0, "type": 1})
    if (me_brand or {}).get("type") != "factory":
        # Returning [] instead of 403 keeps the UI simple — brand-side users
        # simply don't see the Allocations tab, so this is defence-in-depth.
        return []
    rows = await db.factory_handoffs.find(
        {"factory_id": user["brand_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


@router.post("/brand/factory-handoffs/{handoff_id}/accept")
async def accept_handoff(handoff_id: str, user=Depends(get_current_brand_user)):
    """Factory accepts the allocation. We only mark it accepted; the factory
    frontend is responsible for merging items into the local cart (the cart
    is client-side today, see BrandCartContext)."""
    handoff = await db.factory_handoffs.find_one({"id": handoff_id}, {"_id": 0})
    if not handoff:
        raise HTTPException(status_code=404, detail="Allocation not found")
    if handoff.get("factory_id") != user["brand_id"]:
        raise HTTPException(status_code=403, detail="This allocation was not sent to your factory")
    if handoff.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Allocation already {handoff.get('status')}")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.factory_handoffs.update_one(
        {"id": handoff_id},
        {"$set": {
            "status": "accepted",
            "accepted_at": now_iso,
            "updated_at": now_iso,
            "responded_by_user_id": user["id"],
        }},
    )
    handoff.update({"status": "accepted", "accepted_at": now_iso})
    return _serialize_handoff(handoff)


@router.post("/brand/factory-handoffs/{handoff_id}/reject")
async def reject_handoff(handoff_id: str, user=Depends(get_current_brand_user)):
    """Factory rejects the allocation."""
    handoff = await db.factory_handoffs.find_one({"id": handoff_id}, {"_id": 0})
    if not handoff:
        raise HTTPException(status_code=404, detail="Allocation not found")
    if handoff.get("factory_id") != user["brand_id"]:
        raise HTTPException(status_code=403, detail="This allocation was not sent to your factory")
    if handoff.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Allocation already {handoff.get('status')}")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.factory_handoffs.update_one(
        {"id": handoff_id},
        {"$set": {
            "status": "rejected",
            "rejected_at": now_iso,
            "updated_at": now_iso,
            "responded_by_user_id": user["id"],
        }},
    )
    handoff.update({"status": "rejected", "rejected_at": now_iso})
    return _serialize_handoff(handoff)


# ════════════════════════════════════════════════════════════════════
# BRAND RFQ / QUERIES PORTAL (#7)
# Brand users see their submitted RFQs and the vendor quotes received.
# Reuses logic from customer_queries_router but scoped by brand_id.
# ════════════════════════════════════════════════════════════════════
def _brand_quantity_label(rfq: dict) -> str:
    qv = rfq.get("quantity_value")
    qu = (rfq.get("quantity_unit") or "").lower()
    if qv and qu:
        try:
            n = float(qv)
            n_str = str(int(n)) if n.is_integer() else str(n)
            return f"{n_str} {qu}"
        except (TypeError, ValueError):
            pass
    cat = (rfq.get("category") or "").lower()
    is_kg = cat == "knits"
    raw = rfq.get("quantity_kg", "") if is_kg else rfq.get("quantity_meters", "")
    if not raw:
        raw = rfq.get("quantity_meters") or rfq.get("quantity_kg") or ""
    if not raw:
        return ""
    label = raw.replace("_", " – ")
    return f"{label} {'kg' if is_kg else 'm'}"


async def _brand_attach_quotes(rfq: dict) -> dict:
    quotes = await db.vendor_quotes.find(
        {"rfq_id": rfq["id"], "status": "submitted"}, {"_id": 0}
    ).sort("price_per_meter", 1).to_list(50)
    rfq["quotes_count"] = len(quotes)
    rfq["best_quote"] = quotes[0] if quotes else None
    rfq["quantity_label"] = _brand_quantity_label(rfq)
    return rfq


@router.get("/brand/queries")
async def brand_list_queries(
    user=Depends(get_current_brand_user),
    status: str = "received",
    limit: int = 50,
    skip: int = 0,
):
    """List RFQs filed by anyone in the brand. Buckets:
       - received: RFQs that have at least 1 vendor quote
       - not_received: RFQs that have 0 quotes yet
       - closed: status in {closed, won, lost}
    """
    base = {"brand_id": user["brand_id"]}
    if status == "closed":
        base["status"] = {"$in": ["closed", "won", "lost"]}
    rfqs = await db.rfq_submissions.find(base, {"_id": 0}).sort("created_at", -1).to_list(2000)

    out = []
    for r in rfqs:
        await _brand_attach_quotes(r)
        if status == "received" and r["quotes_count"] == 0:
            continue
        if status == "not_received" and r["quotes_count"] > 0:
            continue
        out.append(r)
    return {"queries": out[skip: skip + limit], "total": len(out), "skip": skip, "limit": limit}


@router.get("/brand/queries/{rfq_id}")
async def brand_get_query(rfq_id: str, user=Depends(get_current_brand_user)):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id, "brand_id": user["brand_id"]}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="Query not found")

    if rfq.get("status") == "won":
        quotes = await db.vendor_quotes.find(
            {"rfq_id": rfq_id, "status": {"$in": ["submitted", "won", "lost"]}}, {"_id": 0}
        ).sort("price_per_meter", 1).to_list(50)
    else:
        quotes = await db.vendor_quotes.find(
            {"rfq_id": rfq_id, "status": "submitted"}, {"_id": 0}
        ).sort("price_per_meter", 1).to_list(50)

    if quotes:
        quotes[0]["is_best_price"] = True

    rfq["quotes"] = quotes
    rfq["quantity_label"] = _brand_quantity_label(rfq)
    return rfq


# ════════════════════════════════════════════════════════════════════
# BRAND FINANCIALS (read-only) — unified invoices + CN/DN + payments
# ════════════════════════════════════════════════════════════════════
@router.get("/brand/financials")
async def brand_financial_view(user=Depends(get_current_brand_user)):
    """Full unified financials for the brand: outstanding balance, invoices,
    credit notes, debit notes, payments, credit lines and the chronological
    timeline. Read-only — only the assigned Account Manager (or any admin)
    can mutate via the admin endpoints."""
    from account_manager_router import _build_financial_summary
    summary = await _build_financial_summary(user["brand_id"])
    # Also surface the AM contact so the brand knows who to escalate to
    am = await db.admins.find_one(
        {"is_account_manager": True, "managed_brand_ids": user["brand_id"]},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    )
    summary["account_manager"] = (
        {"id": am["id"], "email": am.get("email", ""), "name": am.get("name", "")}
        if am else None
    )
    return summary


# ════════════════════════════════════════════════════════════════════
# FACTORY CREDIT VISIBILITY (#2) — brand admins see linked factories'
# credit summaries inline alongside their own.
# ════════════════════════════════════════════════════════════════════
@router.get("/brand/factory-credit-summaries")
async def list_factory_credit_summaries(user=Depends(get_current_brand_user)):
    """For each factory linked to this brand, return a compact credit summary
    (lines + total/utilized/available + sample credits + outstanding). Empty
    arrays mean the factory hasn't been onboarded for credit yet — UI shows
    'Credit limit not opened' + 'Apply for credit' CTA."""
    if user["role"] != "brand_admin":
        raise HTTPException(status_code=403, detail="Only brand admins can view factory credit")
    brand = await db.brands.find_one({"id": user["brand_id"]}, {"_id": 0})
    if not brand or brand.get("type") not in ("brand", None):
        return []  # factories themselves don't have sub-factories
    factories = await db.brands.find(
        {"parent_brand_id": user["brand_id"], "type": "factory"},
        {"_id": 0, "id": 1, "name": 1, "gst": 1, "sample_credits_total": 1, "sample_credits_used": 1},
    ).to_list(length=100)
    out = []
    for f in factories:
        lines = await db.brand_credit_lines.find(
            {"brand_id": f["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(length=50)
        total = sum(float(l.get("amount_inr", 0)) for l in lines)
        used = sum(float(l.get("utilized_inr", 0)) for l in lines)
        # Outstanding from financials (invoiced - paid - cn + dn)
        invs = await db.brand_invoices.find({"brand_id": f["id"]}, {"_id": 0}).to_list(length=500)
        cns = await db.brand_credit_notes.find({"brand_id": f["id"]}, {"_id": 0}).to_list(length=500)
        dns = await db.brand_debit_notes.find({"brand_id": f["id"]}, {"_id": 0}).to_list(length=500)
        invoiced = sum(float(i.get("amount", 0)) for i in invs)
        paid = sum(float(i.get("amount_paid", 0)) for i in invs)
        cn_total = sum(float(c.get("amount", 0)) for c in cns)
        dn_total = sum(float(d.get("amount", 0)) for d in dns)
        out.append({
            "factory_id": f["id"],
            "factory_name": f.get("name", ""),
            "gst": f.get("gst", ""),
            "credit_lines": lines,
            "credit_allocated": round(total, 2),
            "credit_utilized": round(used, 2),
            "credit_available": round(total - used, 2),
            "sample_credits_total": int(f.get("sample_credits_total", 0)),
            "sample_credits_used": int(f.get("sample_credits_used", 0)),
            "outstanding": round(invoiced - paid - cn_total + dn_total, 2),
            "has_credit": len(lines) > 0,
        })
    return out


class CreditApplication(BaseModel):
    entity_id: Optional[str] = None  # brand or factory id; defaults to logged-in brand
    requested_amount_inr: Optional[float] = None
    use_case: Optional[str] = ""
    contact_name: Optional[str] = ""
    contact_phone: Optional[str] = ""
    supporting_doc_url: Optional[str] = ""


@router.post("/brand/credit-application")
async def submit_credit_application(data: CreditApplication, user=Depends(get_current_brand_user)):
    """Send a 'Apply for Credit' email to creditops@locofast.com with the
    brand/factory + requestor details. Persisted to `credit_applications`
    so the AM can track progress."""
    target_id = data.entity_id or user["brand_id"]
    target = await db.brands.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Entity not found")
    # Permission: brand admin can apply for self or for any of their factories
    if target_id != user["brand_id"]:
        if user["role"] != "brand_admin":
            raise HTTPException(status_code=403, detail="Only brand admins can apply on behalf of factories")
        if target.get("parent_brand_id") != user["brand_id"]:
            raise HTTPException(status_code=403, detail="That factory is not linked to your brand")

    # Find the assigned AM (if any) so we can BCC them
    am_doc = await db.admins.find_one(
        {"is_account_manager": True, "managed_brand_ids": target_id},
        {"_id": 0, "email": 1, "name": 1},
    )

    requested_inr = data.requested_amount_inr or 0
    parent = None
    if target.get("type") == "factory" and target.get("parent_brand_id"):
        parent = await db.brands.find_one({"id": target["parent_brand_id"]}, {"_id": 0, "name": 1, "gst": 1})

    app_doc = {
        "id": str(uuid.uuid4()),
        "brand_id": target_id,
        "brand_name": target.get("name", ""),
        "brand_type": target.get("type", "brand"),
        "parent_brand_id": target.get("parent_brand_id"),
        "parent_brand_name": (parent or {}).get("name", "") if parent else "",
        "gst": target.get("gst", ""),
        "requested_amount_inr": float(requested_inr),
        "use_case": (data.use_case or "").strip()[:1000],
        "contact_name": (data.contact_name or user.get("name") or "").strip(),
        "contact_email": user.get("email", ""),
        "contact_phone": (data.contact_phone or "").strip(),
        "supporting_doc_url": (data.supporting_doc_url or "").strip(),
        "submitted_by_user_id": user.get("id"),
        "status": "submitted",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.credit_applications.insert_one(app_doc)
    app_doc.pop("_id", None)

    # Fire email — fire-and-forget, audit-logged
    asyncio.create_task(_email_credit_application(app_doc, am_doc))
    return {"message": "Credit application submitted. Locofast Credit Ops will reach out soon.", "application": app_doc}


async def _email_credit_application(app_doc: dict, am_doc: Optional[dict]):
    """Send the application email to creditops@locofast.com (and BCC the AM)."""
    from email_router import log_email as _audit_log
    creditops = os.environ.get("LOCOFAST_CREDITOPS_INBOX", "creditops@locofast.com")
    am_email = (am_doc or {}).get("email")
    to = [creditops]
    if am_email and am_email != creditops:
        to.append(am_email)
    parent_line = f"<p><strong>Parent Brand:</strong> {app_doc.get('parent_brand_name', '—')}</p>" if app_doc.get("brand_type") == "factory" else ""
    amount_line = f"<p><strong>Requested Amount:</strong> ₹{app_doc.get('requested_amount_inr', 0):,.0f}</p>" if app_doc.get("requested_amount_inr") else ""
    use_case_line = f"<p><strong>Use Case:</strong> {app_doc.get('use_case')}</p>" if app_doc.get("use_case") else ""
    doc_line = (
        f'<p><strong>Supporting Document:</strong> <a href="{app_doc.get("supporting_doc_url")}">View attached</a></p>'
        if app_doc.get("supporting_doc_url") else ""
    )
    html = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px">
      <h2 style="margin:0 0 12px">New Credit Application</h2>
      <p><strong>Entity:</strong> {app_doc.get('brand_name', '')} ({app_doc.get('brand_type', 'brand').title()})</p>
      {parent_line}
      <p><strong>GSTIN:</strong> {app_doc.get('gst') or '—'}</p>
      {amount_line}
      {use_case_line}
      {doc_line}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">
      <p style="margin:4px 0"><strong>Requested by:</strong> {app_doc.get('contact_name', '')}</p>
      <p style="margin:4px 0">{app_doc.get('contact_email', '')}{(' · ' + app_doc.get('contact_phone')) if app_doc.get('contact_phone') else ''}</p>
      <p style="font-size:12px;color:#6b7280;margin-top:18px">Application ID: <code>{app_doc.get('id')}</code></p>
    </div>"""
    subject = f"[Credit App] {app_doc.get('brand_name', '')} — request submitted"
    try:
        if RESEND_API_KEY:
            await asyncio.to_thread(resend.Emails.send, {"from": SENDER_EMAIL, "to": to, "subject": subject, "html": html})
            await _audit_log(kind="credit_application", recipients=to, subject=subject, html=html, status="sent",
                             brand_id=app_doc.get("brand_id"), meta={"application_id": app_doc.get("id")})
        else:
            await _audit_log(kind="credit_application", recipients=to, subject=subject, html=html, status="skipped",
                             error="RESEND_API_KEY missing",
                             brand_id=app_doc.get("brand_id"), meta={"application_id": app_doc.get("id")})
    except Exception as e:
        logging.error(f"Credit-application email failed: {e}")
        await _audit_log(kind="credit_application", recipients=to, subject=subject, html=html, status="failed",
                         error=str(e),
                         brand_id=app_doc.get("brand_id"), meta={"application_id": app_doc.get("id")})


# ════════════════════════════════════════════════════════════════════
# Brand orders enriched with linked invoice (file_url + e-way bill) so
# the orders list can render Invoice + E-way Bill download buttons.
# ════════════════════════════════════════════════════════════════════
async def _attach_invoice_links(orders: list, brand_id: str) -> list:
    """For every order, if a brand_invoice with order_id == order.id exists,
    attach `invoice` { invoice_number, file_url, eway_bill_number, eway_bill_url }."""
    if not orders:
        return orders
    order_ids = [o["id"] for o in orders if o.get("id")]
    invs_by_order = {}
    if order_ids:
        cursor = db.brand_invoices.find(
            {"brand_id": brand_id, "order_id": {"$in": order_ids}},
            {"_id": 0, "id": 1, "order_id": 1, "invoice_number": 1, "file_url": 1, "eway_bill_number": 1, "eway_bill_url": 1, "status": 1},
        )
        async for inv in cursor:
            invs_by_order[inv["order_id"]] = {
                "id": inv["id"],
                "invoice_number": inv.get("invoice_number", ""),
                "file_url": inv.get("file_url", ""),
                "eway_bill_number": inv.get("eway_bill_number", ""),
                "eway_bill_url": inv.get("eway_bill_url", ""),
                "status": inv.get("status", ""),
            }
    for o in orders:
        o["invoice"] = invs_by_order.get(o["id"])
    return orders


# ════════════════════════════════════════════════════════════════════
# BRAND NOTIFICATIONS — bell-icon + dropdown
# Pushed by email_router._notify_brand_on_quote when a vendor submits
# a quote on one of the brand's RFQs.
# ════════════════════════════════════════════════════════════════════
@router.get("/brand/notifications")
async def brand_list_notifications(
    user=Depends(get_current_brand_user),
    unread_only: bool = False,
    limit: int = 30,
):
    """Return the latest notifications for the logged-in brand user. Bell-
    icon dropdown calls this with limit=10. Notifications page calls with
    limit=30."""
    q = {"brand_id": user["brand_id"], "brand_user_id": user["id"]}
    if unread_only:
        q["read"] = False
    rows = await db.brand_notifications.find(
        q, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(int(limit or 30), 100))).to_list(length=limit)
    unread = await db.brand_notifications.count_documents({**q, "read": False} if not unread_only else q)
    return {"notifications": rows, "unread_count": unread}


@router.get("/brand/notifications/unread-count")
async def brand_unread_count(user=Depends(get_current_brand_user)):
    """Lightweight endpoint polled by the bell icon every ~30s."""
    n = await db.brand_notifications.count_documents({
        "brand_id": user["brand_id"], "brand_user_id": user["id"], "read": False,
    })
    return {"unread_count": n}


@router.post("/brand/notifications/{notif_id}/read")
async def brand_mark_notification_read(notif_id: str, user=Depends(get_current_brand_user)):
    res = await db.brand_notifications.update_one(
        {"id": notif_id, "brand_user_id": user["id"]},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked read"}


@router.post("/brand/notifications/read-all")
async def brand_mark_all_read(user=Depends(get_current_brand_user)):
    res = await db.brand_notifications.update_many(
        {"brand_id": user["brand_id"], "brand_user_id": user["id"], "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": f"Marked {res.modified_count} read", "modified": res.modified_count}
