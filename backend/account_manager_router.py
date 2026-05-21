"""
Account Manager + Brand Financials Router
─────────────────────────────────────────
Locofast-side Account Managers (AMs) are admin users with `is_account_manager=true`
and a `managed_brand_ids` list (max 3 brands per AM, max 1 AM per brand).

This module adds:
  • AM-brand mapping endpoints (admin-only setup)
  • Brand financial documents — Invoices, Credit Notes, Payments — that the
    assigned AM (or any super-admin) can create/edit/delete on behalf of the brand
  • Brand-side read endpoint that surfaces a unified ledger combining
    invoices + credit-notes + payments + the existing credit-line allocations
    + sample-credit movements.
"""
import os
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

import auth_helpers

logger = logging.getLogger(__name__)
router = APIRouter(tags=["account-manager"])
db = None

MAX_BRANDS_PER_AM = 3
CN_REASONS = {"short_delivery", "defective", "return", "discount", "quality_issue", "other"}
DN_REASONS = {"late_payment", "additional_logistics", "tax_correction", "other"}
PAYMENT_MODES = {"NEFT", "RTGS", "UPI", "CHEQUE", "CASH", "OTHER"}


def set_db(database):
    global db
    db = database


# ════════════════════════════════════════════════════════════════════
# AUTH HELPERS — AM-or-admin permission gate
# ════════════════════════════════════════════════════════════════════
async def _require_am_for_brand(admin: dict, brand_id: str):
    """An admin can act on this brand if they're a regular admin, OR
    if they're an Account Manager whose `managed_brand_ids` includes
    `brand_id` (or the brand's `parent_brand_id`, since brand+factories
    are managed together as a group). Plain admins (no AM flag) are super-users."""
    if admin.get("is_account_manager"):
        managed = set(admin.get("managed_brand_ids") or [])
        if brand_id in managed:
            return
        # If the target is a factory, allow access when the AM manages its parent
        target = await db.brands.find_one({"id": brand_id}, {"_id": 0, "parent_brand_id": 1, "type": 1})
        parent = (target or {}).get("parent_brand_id")
        if parent and parent in managed:
            return
        raise HTTPException(status_code=403, detail="You are not assigned as the Account Manager for this brand")
    # else: regular admin — has access to all brands


# ════════════════════════════════════════════════════════════════════
# ADMIN — Account Manager management
# ════════════════════════════════════════════════════════════════════
class AmAssignment(BaseModel):
    brand_ids: List[str]


class AmFlagUpdate(BaseModel):
    is_account_manager: bool


@router.put("/admin/users/{admin_id}/account-manager")
async def admin_set_am_flag(admin_id: str, data: AmFlagUpdate, _admin=Depends(auth_helpers.get_current_admin)):
    """Promote/demote an admin user as Account Manager. When unflagged we
    also clear their brand assignments."""
    target = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin user not found")
    update = {"is_account_manager": bool(data.is_account_manager)}
    if not data.is_account_manager:
        update["managed_brand_ids"] = []
    await db.admins.update_one({"id": admin_id}, {"$set": update})
    return {"message": "Updated", "is_account_manager": bool(data.is_account_manager)}


@router.put("/admin/users/{admin_id}/managed-brands")
async def admin_assign_brands_to_am(admin_id: str, data: AmAssignment, _admin=Depends(auth_helpers.get_current_admin)):
    """Replace an AM's managed brand list. Enforces:
       - User must already have is_account_manager=true
       - Max 3 brands per AM
       - Each brand can have at most 1 AM (rejects clash unless reassigning)
    """
    am = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not am:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if not am.get("is_account_manager"):
        raise HTTPException(status_code=400, detail="User is not flagged as Account Manager — promote first")

    new_brands = list(dict.fromkeys(data.brand_ids or []))  # de-dupe, preserve order
    if len(new_brands) > MAX_BRANDS_PER_AM:
        raise HTTPException(status_code=400, detail=f"An Account Manager can manage at most {MAX_BRANDS_PER_AM} brands")
    # Validate brand existence
    valid = await db.brands.find({"id": {"$in": new_brands}}, {"_id": 0, "id": 1}).to_list(length=10)
    valid_ids = {b["id"] for b in valid}
    invalid = [b for b in new_brands if b not in valid_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Brands not found: {invalid}")
    # Detect clashes (some brand in new_brands already managed by another AM)
    clash = await db.admins.find_one({
        "is_account_manager": True,
        "id": {"$ne": admin_id},
        "managed_brand_ids": {"$in": new_brands},
    }, {"_id": 0, "id": 1, "email": 1, "managed_brand_ids": 1})
    if clash:
        overlapping = [b for b in (clash.get("managed_brand_ids") or []) if b in new_brands]
        raise HTTPException(status_code=400, detail=f"Brand(s) {overlapping} already managed by {clash.get('email', clash.get('id'))}")

    await db.admins.update_one({"id": admin_id}, {"$set": {"managed_brand_ids": new_brands}})
    return {"message": "Brand assignments updated", "managed_brand_ids": new_brands}


@router.get("/admin/account-managers")
async def list_account_managers(_admin=Depends(auth_helpers.get_current_admin)):
    """List all AMs with their assigned brand-groups (parent brand + nested
    linked factories) and capacity. Group-level model: a 'brand group' = a
    parent brand together with all its linked factories, OR a standalone
    factory. AMs always store parent-level ids in `managed_brand_ids`.
    Each managed brand row exposes a `factories: []` array so the UI can
    render the group as a single card."""
    ams = await db.admins.find({"is_account_manager": True}, {"_id": 0, "password": 0}).to_list(length=200)
    all_brand_ids = []
    for a in ams:
        all_brand_ids.extend(a.get("managed_brand_ids") or [])
    brand_map = {}
    if all_brand_ids:
        cursor = db.brands.find({"id": {"$in": all_brand_ids}}, {"_id": 0, "id": 1, "name": 1, "type": 1, "parent_brand_id": 1})
        async for b in cursor:
            brand_map[b["id"]] = {
                "id": b["id"], "name": b.get("name", ""),
                "type": b.get("type", "brand"),
                "parent_brand_id": b.get("parent_brand_id"),
                "factories": [],
            }
        # Resolve linked factories for each brand-type entry
        parent_ids = [bid for bid, e in brand_map.items() if e["type"] != "factory"]
        if parent_ids:
            fcursor = db.brands.find(
                {"parent_brand_id": {"$in": parent_ids}, "type": "factory"},
                {"_id": 0, "id": 1, "name": 1, "parent_brand_id": 1, "gst": 1},
            )
            async for f in fcursor:
                par = brand_map.get(f["parent_brand_id"])
                if par:
                    par["factories"].append({"id": f["id"], "name": f.get("name", ""), "gst": f.get("gst", "")})
    out = []
    for a in ams:
        groups = [brand_map[bid] for bid in (a.get("managed_brand_ids") or []) if bid in brand_map]
        out.append({
            "id": a["id"], "email": a.get("email", ""), "name": a.get("name", ""),
            "managed_brands": groups,
            "capacity_remaining": MAX_BRANDS_PER_AM - len(groups),
        })
    return out


@router.get("/admin/brands/{brand_id}/account-manager")
async def get_brand_account_manager(brand_id: str, _admin=Depends(auth_helpers.get_current_admin)):
    """Return the AM (if any) currently mapped to this brand."""
    am = await db.admins.find_one(
        {"is_account_manager": True, "managed_brand_ids": brand_id},
        {"_id": 0, "password": 0},
    )
    if not am:
        return {"account_manager": None}
    return {"account_manager": {"id": am["id"], "email": am.get("email", ""), "name": am.get("name", "")}}


@router.get("/admin/users")
async def list_admin_users(_admin=Depends(auth_helpers.get_current_admin)):
    """Surface admin users (without passwords) so the AM-mapping UI can pick from them."""
    rows = await db.admins.find({}, {"_id": 0, "password": 0}).sort("created_at", 1).to_list(length=200)
    return rows


# ════════════════════════════════════════════════════════════════════
# BRAND FINANCIAL DOCUMENTS — Invoices / Credit Notes / Debit Notes / Payments
# All endpoints are admin-or-AM gated. Brands themselves get a read-only
# unified view via /api/brand/financials below.
# ════════════════════════════════════════════════════════════════════
class InvoiceCreate(BaseModel):
    invoice_number: str = Field(..., min_length=1, max_length=80)
    order_id: Optional[str] = None  # link to a brand order (optional but strongly encouraged)
    invoice_date: Optional[str] = None  # ISO date
    due_date: Optional[str] = None  # ISO date — credit period end
    subtotal: float = 0.0
    gst: float = 0.0
    other_charges: float = 0.0
    amount: float  # total invoice amount (incl. GST + charges)
    credit_period_days: Optional[int] = 0
    file_url: Optional[str] = ""
    # E-way bill (separate doc accompanying the invoice for goods movement)
    eway_bill_number: Optional[str] = ""
    eway_bill_url: Optional[str] = ""
    notes: Optional[str] = ""


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    order_id: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    subtotal: Optional[float] = None
    gst: Optional[float] = None
    other_charges: Optional[float] = None
    amount: Optional[float] = None
    credit_period_days: Optional[int] = None
    file_url: Optional[str] = None
    eway_bill_number: Optional[str] = None
    eway_bill_url: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["unpaid", "partially_paid", "paid", "cancelled"]] = None


class CreditNoteCreate(BaseModel):
    cn_number: str = Field(..., min_length=1, max_length=80)
    invoice_id: Optional[str] = None  # link to invoice it adjusts
    cn_date: Optional[str] = None
    amount: float
    reason: str  # one of CN_REASONS
    notes: Optional[str] = ""
    file_url: Optional[str] = ""


class DebitNoteCreate(BaseModel):
    dn_number: str = Field(..., min_length=1, max_length=80)
    invoice_id: Optional[str] = None
    dn_date: Optional[str] = None
    amount: float
    reason: str  # one of DN_REASONS
    notes: Optional[str] = ""
    file_url: Optional[str] = ""


class PaymentAllocation(BaseModel):
    invoice_id: str
    amount: float


class PaymentCreate(BaseModel):
    payment_date: Optional[str] = None
    amount: float
    mode: str  # NEFT/RTGS/UPI/...
    reference: Optional[str] = ""  # transaction ref / UTR
    allocations: List[PaymentAllocation] = []  # links payment → specific invoices
    notes: Optional[str] = ""
    file_url: Optional[str] = ""


def _ensure_iso(date_str: Optional[str]) -> str:
    if not date_str:
        return datetime.now(timezone.utc).date().isoformat()
    return date_str.strip()


# ───────── Invoices ─────────
@router.post("/admin/brands/{brand_id}/invoices")
async def create_invoice(brand_id: str, data: InvoiceCreate, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0, "id": 1})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await _require_am_for_brand(admin, brand_id)

    # Reject duplicate invoice number for this brand
    dup = await db.brand_invoices.find_one({"brand_id": brand_id, "invoice_number": data.invoice_number}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(status_code=400, detail=f"Invoice number {data.invoice_number} already exists for this brand")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice amount must be positive")

    inv_id = str(uuid.uuid4())
    doc = {
        "id": inv_id,
        "brand_id": brand_id,
        "invoice_number": data.invoice_number.strip(),
        "order_id": (data.order_id or "").strip() or None,
        "invoice_date": _ensure_iso(data.invoice_date),
        "due_date": (data.due_date or "").strip() or None,
        "subtotal": float(data.subtotal or 0),
        "gst": float(data.gst or 0),
        "other_charges": float(data.other_charges or 0),
        "amount": round(float(data.amount), 2),
        "amount_paid": 0.0,
        "credit_period_days": int(data.credit_period_days or 0),
        "file_url": (data.file_url or "").strip(),
        "eway_bill_number": (data.eway_bill_number or "").strip(),
        "eway_bill_url": (data.eway_bill_url or "").strip(),
        "notes": (data.notes or "").strip(),
        "status": "unpaid",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "created_by_email": admin.get("email", ""),
    }
    await db.brand_invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/admin/brands/{brand_id}/invoices")
async def list_invoices(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    rows = await db.brand_invoices.find({"brand_id": brand_id}, {"_id": 0}).sort("invoice_date", -1).to_list(length=500)
    return rows


@router.put("/admin/brands/{brand_id}/invoices/{invoice_id}")
async def update_invoice(brand_id: str, invoice_id: str, data: InvoiceUpdate, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.brand_invoices.update_one({"id": invoice_id, "brand_id": brand_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice updated"}


@router.delete("/admin/brands/{brand_id}/invoices/{invoice_id}")
async def delete_invoice(brand_id: str, invoice_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    # Block delete if any payments have been allocated
    has_payment = await db.brand_payments.find_one({"brand_id": brand_id, "allocations.invoice_id": invoice_id}, {"_id": 0, "id": 1})
    if has_payment:
        raise HTTPException(status_code=400, detail="Cannot delete invoice — payments are allocated to it. Cancel the payment first.")
    res = await db.brand_invoices.delete_one({"id": invoice_id, "brand_id": brand_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice deleted"}


# ───────── Credit Notes ─────────
@router.post("/admin/brands/{brand_id}/credit-notes")
async def create_credit_note(brand_id: str, data: CreditNoteCreate, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0, "id": 1})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await _require_am_for_brand(admin, brand_id)
    if data.reason not in CN_REASONS:
        raise HTTPException(status_code=400, detail=f"reason must be one of {sorted(CN_REASONS)}")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Credit note amount must be positive")
    if data.invoice_id:
        inv = await db.brand_invoices.find_one({"id": data.invoice_id, "brand_id": brand_id}, {"_id": 0, "id": 1})
        if not inv:
            raise HTTPException(status_code=400, detail="Linked invoice not found for this brand")

    doc = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "cn_number": data.cn_number.strip(),
        "invoice_id": data.invoice_id or None,
        "cn_date": _ensure_iso(data.cn_date),
        "amount": round(float(data.amount), 2),
        "reason": data.reason,
        "notes": (data.notes or "").strip(),
        "file_url": (data.file_url or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "created_by_email": admin.get("email", ""),
    }
    await db.brand_credit_notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/admin/brands/{brand_id}/credit-notes")
async def list_credit_notes(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    rows = await db.brand_credit_notes.find({"brand_id": brand_id}, {"_id": 0}).sort("cn_date", -1).to_list(length=500)
    return rows


@router.delete("/admin/brands/{brand_id}/credit-notes/{cn_id}")
async def delete_credit_note(brand_id: str, cn_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    res = await db.brand_credit_notes.delete_one({"id": cn_id, "brand_id": brand_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return {"message": "Credit note deleted"}


# ───────── Debit Notes ─────────
@router.post("/admin/brands/{brand_id}/debit-notes")
async def create_debit_note(brand_id: str, data: DebitNoteCreate, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0, "id": 1})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await _require_am_for_brand(admin, brand_id)
    if data.reason not in DN_REASONS:
        raise HTTPException(status_code=400, detail=f"reason must be one of {sorted(DN_REASONS)}")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Debit note amount must be positive")
    doc = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "dn_number": data.dn_number.strip(),
        "invoice_id": data.invoice_id or None,
        "dn_date": _ensure_iso(data.dn_date),
        "amount": round(float(data.amount), 2),
        "reason": data.reason,
        "notes": (data.notes or "").strip(),
        "file_url": (data.file_url or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "created_by_email": admin.get("email", ""),
    }
    await db.brand_debit_notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/admin/brands/{brand_id}/debit-notes")
async def list_debit_notes(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    rows = await db.brand_debit_notes.find({"brand_id": brand_id}, {"_id": 0}).sort("dn_date", -1).to_list(length=500)
    return rows


# ───────── Payments + Invoice allocation ─────────
@router.post("/admin/brands/{brand_id}/payments")
async def create_payment(brand_id: str, data: PaymentCreate, admin=Depends(auth_helpers.get_current_admin)):
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0, "id": 1})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await _require_am_for_brand(admin, brand_id)
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    if data.mode not in PAYMENT_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(PAYMENT_MODES)}")
    # Validate allocations sum ≤ amount and invoice ownership
    alloc_total = sum(float(a.amount) for a in (data.allocations or []))
    if alloc_total - 0.01 > float(data.amount):
        raise HTTPException(status_code=400, detail=f"Allocated total ₹{alloc_total:.2f} exceeds payment ₹{data.amount:.2f}")
    inv_ids = [a.invoice_id for a in (data.allocations or [])]
    invoices_by_id = {}
    if inv_ids:
        cursor = db.brand_invoices.find({"id": {"$in": inv_ids}, "brand_id": brand_id}, {"_id": 0})
        async for inv in cursor:
            invoices_by_id[inv["id"]] = inv
        missing = set(inv_ids) - set(invoices_by_id.keys())
        if missing:
            raise HTTPException(status_code=400, detail=f"Invoice(s) not found for this brand: {sorted(missing)}")
        # Validate each allocation doesn't push amount_paid > amount
        for a in data.allocations:
            inv = invoices_by_id[a.invoice_id]
            balance = float(inv.get("amount", 0)) - float(inv.get("amount_paid", 0))
            if a.amount - 0.01 > balance:
                raise HTTPException(status_code=400, detail=f"Allocation ₹{a.amount:.2f} exceeds outstanding balance ₹{balance:.2f} on invoice {inv.get('invoice_number')}")

    payment_id = str(uuid.uuid4())
    doc = {
        "id": payment_id,
        "brand_id": brand_id,
        "payment_date": _ensure_iso(data.payment_date),
        "amount": round(float(data.amount), 2),
        "mode": data.mode,
        "reference": (data.reference or "").strip(),
        "allocations": [
            {"invoice_id": a.invoice_id, "amount": round(float(a.amount), 2),
             "invoice_number": invoices_by_id.get(a.invoice_id, {}).get("invoice_number", "")}
            for a in (data.allocations or [])
        ],
        "unallocated": round(float(data.amount) - alloc_total, 2),
        "notes": (data.notes or "").strip(),
        "file_url": (data.file_url or "").strip(),
        "status": "received",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id"),
        "created_by_email": admin.get("email", ""),
    }
    await db.brand_payments.insert_one(doc)

    # Update each invoice's amount_paid + status
    for a in (data.allocations or []):
        inv = invoices_by_id.get(a.invoice_id)
        new_paid = round(float(inv.get("amount_paid", 0)) + float(a.amount), 2)
        new_status = "paid" if new_paid + 0.01 >= float(inv.get("amount", 0)) else "partially_paid"
        await db.brand_invoices.update_one(
            {"id": a.invoice_id},
            {"$set": {"amount_paid": new_paid, "status": new_status}},
        )

    doc.pop("_id", None)
    return doc


@router.get("/admin/brands/{brand_id}/payments")
async def list_payments(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    rows = await db.brand_payments.find({"brand_id": brand_id}, {"_id": 0}).sort("payment_date", -1).to_list(length=500)
    return rows


@router.delete("/admin/brands/{brand_id}/payments/{payment_id}")
async def delete_payment(brand_id: str, payment_id: str, admin=Depends(auth_helpers.get_current_admin)):
    await _require_am_for_brand(admin, brand_id)
    pay = await db.brand_payments.find_one({"id": payment_id, "brand_id": brand_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    # Reverse the allocations on each invoice
    for a in (pay.get("allocations") or []):
        inv = await db.brand_invoices.find_one({"id": a["invoice_id"]}, {"_id": 0})
        if inv:
            new_paid = max(0.0, round(float(inv.get("amount_paid", 0)) - float(a.get("amount", 0)), 2))
            new_status = "paid" if new_paid + 0.01 >= float(inv.get("amount", 0)) else ("partially_paid" if new_paid > 0 else "unpaid")
            await db.brand_invoices.update_one({"id": a["invoice_id"]}, {"$set": {"amount_paid": new_paid, "status": new_status}})
    await db.brand_payments.delete_one({"id": payment_id})
    return {"message": "Payment cancelled, invoice balances reversed"}


# ════════════════════════════════════════════════════════════════════
# UNIFIED FINANCIAL VIEW — admin and brand
# ════════════════════════════════════════════════════════════════════
async def _build_financial_summary(brand_id: str) -> dict:
    """Combine invoices + credit/debit notes + payments + credit lines into
    a single timeline + summary metrics. Used by both the admin and the
    brand-side views (brand version filters out internal-only fields)."""
    invs, cns, dns, pays, lines, ledger, brand = await _gather_financial_docs(brand_id)
    timeline: list = []

    for inv in invs:
        timeline.append({
            "type": "invoice",
            "id": inv["id"],
            "date": inv.get("invoice_date") or inv.get("created_at", ""),
            "number": inv.get("invoice_number", ""),
            "amount": float(inv.get("amount", 0)),
            "balance": round(float(inv.get("amount", 0)) - float(inv.get("amount_paid", 0)), 2),
            "status": inv.get("status", "unpaid"),
            "due_date": inv.get("due_date"),
            "order_id": inv.get("order_id"),
            "file_url": inv.get("file_url", ""),
            "notes": inv.get("notes", ""),
        })
    for cn in cns:
        timeline.append({
            "type": "credit_note",
            "id": cn["id"],
            "date": cn.get("cn_date") or cn.get("created_at", ""),
            "number": cn.get("cn_number", ""),
            "amount": float(cn.get("amount", 0)),
            "reason": cn.get("reason", ""),
            "linked_invoice_id": cn.get("invoice_id"),
            "file_url": cn.get("file_url", ""),
            "notes": cn.get("notes", ""),
        })
    for dn in dns:
        timeline.append({
            "type": "debit_note",
            "id": dn["id"],
            "date": dn.get("dn_date") or dn.get("created_at", ""),
            "number": dn.get("dn_number", ""),
            "amount": float(dn.get("amount", 0)),
            "reason": dn.get("reason", ""),
            "linked_invoice_id": dn.get("invoice_id"),
            "file_url": dn.get("file_url", ""),
            "notes": dn.get("notes", ""),
        })
    for p in pays:
        timeline.append({
            "type": "payment",
            "id": p["id"],
            "date": p.get("payment_date") or p.get("created_at", ""),
            "amount": float(p.get("amount", 0)),
            "mode": p.get("mode", ""),
            "reference": p.get("reference", ""),
            "allocations": p.get("allocations", []),
            "file_url": p.get("file_url", ""),
            "notes": p.get("notes", ""),
        })
    timeline.sort(key=lambda x: x.get("date", ""), reverse=True)

    invoiced = round(sum(float(i.get("amount", 0)) for i in invs), 2)
    paid = round(sum(float(i.get("amount_paid", 0)) for i in invs), 2)
    cn_total = round(sum(float(c.get("amount", 0)) for c in cns), 2)
    dn_total = round(sum(float(d.get("amount", 0)) for d in dns), 2)
    outstanding = round(invoiced - paid - cn_total + dn_total, 2)

    return {
        "summary": {
            "invoiced_total": invoiced,
            "payments_received": paid,
            "credit_notes_total": cn_total,
            "debit_notes_total": dn_total,
            "outstanding": outstanding,
        },
        "credit_lines": lines,
        "credit_ledger": ledger,
        "invoices": invs,
        "credit_notes": cns,
        "debit_notes": dns,
        "payments": pays,
        "timeline": timeline,
    }


async def _gather_financial_docs(brand_id: str):
    """One-shot fetch of all financial collections for a brand."""
    invs = await db.brand_invoices.find({"brand_id": brand_id}, {"_id": 0}).sort("invoice_date", -1).to_list(length=2000)
    cns = await db.brand_credit_notes.find({"brand_id": brand_id}, {"_id": 0}).sort("cn_date", -1).to_list(length=2000)
    dns = await db.brand_debit_notes.find({"brand_id": brand_id}, {"_id": 0}).sort("dn_date", -1).to_list(length=2000)
    pays = await db.brand_payments.find({"brand_id": brand_id}, {"_id": 0}).sort("payment_date", -1).to_list(length=2000)
    lines = await db.brand_credit_lines.find({"brand_id": brand_id}, {"_id": 0}).sort("created_at", 1).to_list(length=200)
    ledger = await db.brand_credit_ledger.find({"brand_id": brand_id}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    brand = await db.brands.find_one({"id": brand_id}, {"_id": 0})
    return invs, cns, dns, pays, lines, ledger, brand


@router.get("/admin/brands/{brand_id}/financials")
async def admin_brand_financials(brand_id: str, admin=Depends(auth_helpers.get_current_admin)):
    """Full financial view (every doc + ledger + summary). Admin/AM only."""
    await _require_am_for_brand(admin, brand_id)
    return await _build_financial_summary(brand_id)


# ════════════════════════════════════════════════════════════════════
# BRAND-SIDE — read-only unified financials
# ════════════════════════════════════════════════════════════════════
def _set_brand_router(brand_router_module):
    """Re-export the brand auth dependency so we don't double-import jwt logic."""
    pass


@router.get("/brand/financials")
async def brand_financials():
    """Placeholder — replaced via dependency injection in server startup
    to share the brand auth helper from brand_router."""
    raise HTTPException(status_code=501, detail="Not wired")


# We attach the actual implementation in server.py because the brand auth
# dependency lives in brand_router.
