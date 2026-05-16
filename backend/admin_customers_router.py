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



class AdminEmailChangePayload(BaseModel):
    new_email: EmailStr
    reason: str = ""


@router.put("/{customer_id}/email")
async def admin_change_customer_email(
    customer_id: str,
    payload: AdminEmailChangePayload,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Admin-only — change a customer's login email instantly.

    Side-effects mirror the customer-side OTP flow:
      • Hard-block on duplicate (another customer already owns the email)
      • Propagate to orders.customer.email, customer_queries.email,
        brand_invoices.customer_email, shared_carts.customer_email
      • Append-only audit on `customers.email_change_history[]`
      • Courtesy email to the OLD address so the customer knows

    NOTE: The customer's existing JWTs become invalid since the email
    they encode no longer matches the customer's record. They will be
    bounced to login next time they hit an authed endpoint.
    """
    new_email = str(payload.new_email).strip().lower()

    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    old_email = (customer.get("email") or "").lower()
    if old_email == new_email:
        raise HTTPException(status_code=400, detail="That's already this customer's email")

    # Hard block on duplicate
    other = await db.customers.find_one({"email": new_email}, {"_id": 0, "id": 1})
    if other and other.get("id") != customer_id:
        raise HTTPException(status_code=409, detail="This email is already linked to another customer")

    now = datetime.now(timezone.utc)
    audit_entry = {
        "from": old_email,
        "to": new_email,
        "at": now.isoformat(),
        "by_admin": admin.get("email", ""),
        "reason": payload.reason or "",
    }

    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "email": new_email,
                "updated_at": now.isoformat(),
            },
            "$push": {
                "email_change_history": audit_entry,
                "previous_emails": old_email,
            },
        },
    )

    # Propagate to denormalised email refs across collections
    await db.orders.update_many(
        {"customer.email": old_email},
        {"$set": {"customer.email": new_email, "updated_at": now.isoformat()}},
    )
    collection_names = await db.list_collection_names()
    if "customer_queries" in collection_names:
        await db.customer_queries.update_many(
            {"email": old_email},
            {"$set": {"email": new_email}},
        )
    if "brand_invoices" in collection_names:
        await db.brand_invoices.update_many(
            {"customer_email": old_email},
            {"$set": {"customer_email": new_email}},
        )
    if "shared_carts" in collection_names:
        await db.shared_carts.update_many(
            {"customer_email": old_email},
            {"$set": {"customer_email": new_email}},
        )

    # Courtesy email to old address (best-effort, never blocks)
    try:
        import os
        import resend  # type: ignore
        api_key = os.environ.get("RESEND_API_KEY")
        if api_key:
            resend.api_key = api_key
            sender = os.environ.get("SENDER_EMAIL", "noreply@locofast.com")
            resend.Emails.send({
                "from": f"Locofast <{sender}>",
                "to": [old_email],
                "subject": "Your Locofast login email has been updated",
                "html": (
                    f"<div style='font-family:Inter,sans-serif;max-width:480px;margin:auto;padding:32px'>"
                    f"<h2 style='font-size:20px;font-weight:600;margin:0 0 8px'>Your login email was updated</h2>"
                    f"<p style='color:#475569'>Your Locofast account login email has been changed to <strong>{new_email}</strong> by Locofast support.</p>"
                    f"<p style='color:#475569'>If this wasn't expected, please reply to this email immediately.</p>"
                    f"</div>"
                ),
            })
    except Exception:
        pass

    fresh = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return {"success": True, "customer": fresh, "audit": audit_entry}
