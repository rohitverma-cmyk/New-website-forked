"""
Admin Customers — list, search, drill-down view of registered customers.

Aggregates RFQ counts, order counts, and lifetime spend per customer so
the admin can quickly see who the heavy hitters are vs cold leads.
"""
from datetime import datetime, timezone
from typing import Optional
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, field_validator

import auth_helpers

router = APIRouter(prefix="/api/admin/customers", tags=["Admin · Customers"])

GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

db = None


def set_db(database):
    global db
    db = database


def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10 and digits[0] in "6789":
        return "91" + digits
    return digits


class AdminCreateCustomer(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=15)
    company: Optional[str] = Field("", max_length=200)
    gstin: Optional[str] = Field("", max_length=15)
    address: Optional[str] = Field("", max_length=500)
    city: Optional[str] = Field("", max_length=100)
    state: Optional[str] = Field("", max_length=100)
    pincode: Optional[str] = Field("", max_length=10)
    notes: Optional[str] = Field("", max_length=1000)

    @field_validator("gstin")
    @classmethod
    def _gst(cls, v):
        if not v:
            return ""
        v = v.strip().upper()
        if not GSTIN_REGEX.match(v):
            raise ValueError("gstin must be a valid 15-character GSTIN")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        if not v:
            return None
        digits = re.sub(r"\D", "", v)
        if len(digits) == 10 and digits[0] not in "6789":
            raise ValueError("phone must be a valid Indian mobile (10 digits starting 6/7/8/9)")
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("phone must be 10-digit Indian or full E.164")
        return v


@router.get("/")
async def list_customers(
    q: Optional[str] = Query(None, description="Search across name, email, phone, company"),
    source: Optional[str] = Query(None, description="Filter by created_via (e.g. external_api, whatsapp_otp)"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Paginated customer list with RFQ/order aggregates."""
    query: dict = {}
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"name": regex},
            {"email": regex},
            {"phone": regex},
            {"company": regex},
            {"gstin": regex},
        ]
    if source:
        query["created_via"] = source

    total = await db.customers.count_documents(query)

    cursor = db.customers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    customers = await cursor.to_list(length=limit)

    # Enrich with RFQ + order counts (single aggregation per page is cheap;
    # we don't precompute since totals are tiny here)
    for c in customers:
        cid = c.get("id")
        email = c.get("email")
        c["rfq_count"] = await db.rfq_submissions.count_documents(
            {"$or": [{"customer_id": cid}, {"email": email}]}
        )
        c["order_count"] = await db.orders.count_documents(
            {"$or": [{"customer_id": cid}, {"customer_email": email}]}
        )

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "customers": customers,
    }


@router.get("/stats")
async def customer_stats(admin=Depends(auth_helpers.get_current_admin)):
    """Top-line counts for the customer page header."""
    total = await db.customers.count_documents({})
    via_external_api = await db.customers.count_documents({"created_via": "external_api"})
    via_whatsapp = await db.customers.count_documents({"created_via": "whatsapp_otp"})
    via_email = await db.customers.count_documents({"created_via": "email_otp"})
    via_admin = await db.customers.count_documents({"created_via": "admin_manual"})
    with_gst = await db.customers.count_documents({"gstin": {"$nin": [None, ""]}})
    return {
        "total": total,
        "via_external_api": via_external_api,
        "via_whatsapp_otp": via_whatsapp,
        "via_email_otp": via_email,
        "via_admin_manual": via_admin,
        "with_gst": with_gst,
    }


@router.get("/{customer_id}")
async def get_customer_detail(
    customer_id: str,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Full customer profile + linked RFQs + linked orders."""
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    email = customer.get("email") or ""
    rfqs = await db.rfq_submissions.find(
        {"$or": [{"customer_id": customer_id}, {"email": email}]},
        {"_id": 0, "rfq_number": 1, "category": 1, "status": 1, "lead_source": 1,
         "ingested_via": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(length=200)

    orders = await db.orders.find(
        {"$or": [{"customer_id": customer_id}, {"customer_email": email}]},
        {"_id": 0, "order_number": 1, "status": 1, "total_amount": 1,
         "currency": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(length=200)

    return {"customer": customer, "rfqs": rfqs, "orders": orders}


@router.post("/")
async def create_customer(
    data: AdminCreateCustomer,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Admin-initiated customer creation. Validates uniqueness on email
    and (when provided) phone. Returns the existing customer on conflict
    so the admin can decide to update instead of duplicate."""
    email = data.email.lower().strip()
    phone_e164 = _normalize_phone(data.phone) if data.phone else ""

    # Conflict check — email is canonical, phone is secondary
    conflict = await db.customers.find_one(
        {"$or": [{"email": email}] + ([{"phone": phone_e164}] if phone_e164 else [])},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "phone": 1},
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A customer with this email or phone already exists",
                "existing_customer": conflict,
            },
        )

    new_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": new_id,
        "email": email,
        "name": data.name,
        "phone": phone_e164 or (data.phone or ""),
        "phone_verified": False,
        "company": data.company or "",
        "gstin": data.gstin or "",
        "gst_verified": False,
        "address": data.address or "",
        "city": data.city or "",
        "state": data.state or "",
        "pincode": data.pincode or "",
        "notes": data.notes or "",
        "created_via": "admin_manual",
        "created_by_admin_id": admin.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "customer_id": new_id, "customer": doc}
