"""
Admin User Management Router
─────────────────────────────
Super-admin-only CRUD for the `db.admins` collection. Lets a single
super-admin (default: admin@locofast.com — configurable via the
SUPER_ADMIN_EMAIL env var) create new internal users, reset their
passwords inline, toggle active state, and update role/AM flag without
touching the database directly.

Roles supported (stored on `db.admins`):
  • admin            — full access (default)
  • accounts         — finance / credit-operations focused nav
  • account_manager  — handled via the `is_account_manager` flag, not role

Supplier-Managers live in a separate collection (`db.supplier_managers`)
and have their own page at `/admin/supplier-managers`; this router does
NOT touch that collection.

All endpoints are gated by the `_require_super_admin` dependency.
"""
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, EmailStr

import auth_helpers

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/manage-users", tags=["admin-user-management"])
db = None


def set_db(database):
    global db
    db = database


SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "admin@locofast.com").lower().strip()

ALLOWED_ROLES = {"admin", "accounts"}  # role stored on db.admins
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


async def _require_super_admin(admin=Depends(auth_helpers.get_current_admin)):
    """Only the super-admin email can manage admin users."""
    email = (admin.get("email") or "").lower().strip()
    if email != SUPER_ADMIN_EMAIL:
        raise HTTPException(
            status_code=403,
            detail=f"Only {SUPER_ADMIN_EMAIL} can manage admin users",
        )
    return admin


# ════════════════════════════════════════════════════════════════════
# MODELS
# ════════════════════════════════════════════════════════════════════
class AdminUserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = "admin"  # admin | accounts
    is_account_manager: bool = False


class PasswordReset(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_account_manager: Optional[bool] = None
    active: Optional[bool] = None


# ════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════
@router.get("")
async def list_admin_users(_super=Depends(_require_super_admin)):
    """List every admin user with their role, AM flag, active state,
    and managed brands (if any). Password hashes are stripped."""
    rows = await db.admins.find({}, {"_id": 0, "password": 0}).sort("created_at", 1).to_list(length=500)
    # Default active=True for legacy records without the field
    for r in rows:
        if "active" not in r:
            r["active"] = True
    return {"users": rows, "super_admin_email": SUPER_ADMIN_EMAIL}


@router.post("")
async def create_admin_user(data: AdminUserCreate, super_admin=Depends(_require_super_admin)):
    email = data.email.lower().strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if data.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {sorted(ALLOWED_ROLES)}")
    if await db.admins.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An admin with this email already exists")

    admin_id = str(uuid.uuid4())
    doc = {
        "id": admin_id,
        "email": email,
        "name": data.name.strip(),
        "password": auth_helpers.hash_password(data.password),
        "role": data.role,
        "is_account_manager": bool(data.is_account_manager),
        "managed_brand_ids": [],
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": super_admin.get("email", ""),
    }
    await db.admins.insert_one(doc.copy())
    doc.pop("password", None)
    logger.info(f"[admin-users] {super_admin.get('email')} created admin {email} (role={data.role}, am={data.is_account_manager})")
    return {"success": True, "user": doc}


@router.post("/{admin_id}/reset-password")
async def reset_admin_password(admin_id: str, data: PasswordReset, super_admin=Depends(_require_super_admin)):
    target = await db.admins.find_one({"id": admin_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Admin user not found")
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "password": auth_helpers.hash_password(data.password),
            "password_updated_at": datetime.now(timezone.utc).isoformat(),
            "password_updated_by": super_admin.get("email", ""),
        }},
    )
    logger.info(f"[admin-users] {super_admin.get('email')} reset password for {target.get('email')}")
    return {"success": True, "message": f"Password updated for {target.get('email')}"}


@router.patch("/{admin_id}")
async def update_admin_user(admin_id: str, data: AdminUserUpdate, super_admin=Depends(_require_super_admin)):
    target = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin user not found")

    # Block self-deactivation to avoid lockout
    if data.active is False and (target.get("email") or "").lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="Super-admin account cannot be deactivated")

    update: dict = {}
    if data.name is not None:
        update["name"] = data.name.strip()
    if data.role is not None:
        if data.role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {sorted(ALLOWED_ROLES)}")
        update["role"] = data.role
    if data.is_account_manager is not None:
        update["is_account_manager"] = bool(data.is_account_manager)
        if not data.is_account_manager:
            update["managed_brand_ids"] = []
    if data.active is not None:
        update["active"] = bool(data.active)

    if not update:
        raise HTTPException(status_code=400, detail="No changes")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = super_admin.get("email", "")
    await db.admins.update_one({"id": admin_id}, {"$set": update})
    fresh = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password": 0})
    if "active" not in fresh:
        fresh["active"] = True
    logger.info(f"[admin-users] {super_admin.get('email')} updated {target.get('email')}: {list(update.keys())}")
    return {"success": True, "user": fresh}


@router.delete("/{admin_id}")
async def delete_admin_user(admin_id: str, super_admin=Depends(_require_super_admin)):
    """Soft-delete by setting active=false. Hard-delete is intentionally
    not supported to preserve audit trails (created_by references etc.)."""
    target = await db.admins.find_one({"id": admin_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if (target.get("email") or "").lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="Super-admin account cannot be deactivated")
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "active": False,
            "deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deactivated_by": super_admin.get("email", ""),
        }},
    )
    logger.info(f"[admin-users] {super_admin.get('email')} deactivated {target.get('email')}")
    return {"success": True, "message": f"Deactivated {target.get('email')}"}
