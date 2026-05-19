"""
Vendor Payouts module — calculates, tracks and pays out vendor dues.

Workflow:
  1. Every paid order item is owed to its seller (qty × rate − commission − advances).
  2. Background materialization creates one `vendor_payouts` row per
     order-item-vendor when an order is marked paid.
  3. Accounts users see a dashboard at /admin/payouts grouped by vendor.
  4. They mark items "Paid" with a UTR + paid_at; that fires email + WA notifications.

Accounts user permissions (role="accounts"):
  • Read all orders, sellers, payouts
  • Mark payouts paid; record UTR
  • Edit ONLY bank/PAN/payment_terms fields on a vendor (no other vendor fields)
  • Create vendor advances (always linked to a specific order)
  • Cannot create/edit fabrics, customers, brands, etc.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import os
import re
import jwt

import auth_helpers
from auth_helpers import (
    db,
    JWT_SECRET,
    JWT_ALGORITHM,
    create_token,
    verify_password,
    security,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────
# Auth — accounts users get a JWT identical to admin but with role
# ─────────────────────────────────────────────────────────────────
async def get_current_accounts_or_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Allow both admin and accounts roles. Accounts users have a
    restricted feature surface (enforced at endpoint level via
    `require_accounts_or_admin` checks)."""
    from auth_helpers import db as _db
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        admin_id = payload.get("sub")
        admin = await _db.admins.find_one({"id": admin_id}, {"_id": 0})
        if not admin:
            raise HTTPException(status_code=401, detail="Invalid token")
        return admin
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _is_accounts_role(user: dict) -> bool:
    return (user or {}).get("role") == "accounts"


def _is_super_admin(user: dict) -> bool:
    # Anyone who is NOT explicitly "accounts" is treated as a full admin
    # (matches the existing platform pattern where role is optional).
    return not _is_accounts_role(user) and (user or {}).get("role") not in (None, "")  # leave room for future roles


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────
async def _resolve_commission(seller_id: str, fabric_id: str, category_id: str = "", category_name: str = "", pattern: str = "") -> float:
    """Look up the CURRENT commission % for a fabric/seller/category.

    Resolution order (most-specific wins) — must mirror the checkout-time
    calculator in `commission_router.calculate_commission`:
      1. Vendor rule (rule_type=vendor, vendor_id matches seller_id)
      2. Category + Pattern (rule_type=category_pattern)
      3. Category (rule_type=category)
      4. Platform default (5%)

    If `category_name` / `pattern` weren't stamped on the order item
    (common for agent-created carts / RFQ accepts / brand-credit orders),
    we lazy-load the fabric document and read them from there. Without
    this lookup, category-level rules silently never match.
    """
    from auth_helpers import db as _db

    # Backfill category_name + pattern from the fabric doc when missing.
    if (not category_name or not pattern) and fabric_id:
        fab = await _db.fabrics.find_one(
            {"id": fabric_id},
            {"_id": 0, "category_name": 1, "category": 1, "pattern": 1, "design_pattern": 1},
        )
        if fab:
            if not category_name:
                category_name = (fab.get("category_name") or fab.get("category") or "").strip()
            if not pattern:
                pattern = (fab.get("pattern") or fab.get("design_pattern") or "").strip()

    # 1. Vendor-specific
    # Only run this lookup when we have an actual seller_id — otherwise
    # a missing seller_id could accidentally match a malformed rule with
    # `vendor_id: null` / `vendor_id: ""` and short-circuit the chain.
    if seller_id:
        rule = await _db.commission_rules.find_one(
            {"rule_type": "vendor", "vendor_id": seller_id, "is_active": True},
            {"_id": 0, "commission_pct": 1},
        )
        if rule:
            return float(rule["commission_pct"])

    # 2. Category + Pattern (case-insensitive)
    if category_name and pattern:
        rule = await _db.commission_rules.find_one(
            {
                "rule_type": "category_pattern",
                "category_name": {"$regex": f"^{re.escape(category_name)}$", "$options": "i"},
                "pattern": {"$regex": f"^{re.escape(pattern)}$", "$options": "i"},
                "is_active": True,
            },
            {"_id": 0, "commission_pct": 1},
        )
        if rule:
            return float(rule["commission_pct"])

    # 3. Category-specific
    if category_name:
        rule = await _db.commission_rules.find_one(
            {
                "rule_type": "category",
                "category_name": {"$regex": f"^{re.escape(category_name)}$", "$options": "i"},
                "is_active": True,
            },
            {"_id": 0, "commission_pct": 1},
        )
        if rule:
            return float(rule["commission_pct"])

    return 5.0  # platform default


def _gst_rates() -> tuple[float, float]:
    """Return (goods GST %, commission GST %) read from env, with safe defaults."""
    try:
        goods = float(os.environ.get("PAYOUT_GOODS_GST_PCT", "5") or 5)
    except Exception:
        goods = 5.0
    try:
        comm = float(os.environ.get("PAYOUT_COMMISSION_GST_PCT", "18") or 18)
    except Exception:
        comm = 18.0
    return goods, comm


async def materialize_payouts_for_order(order: dict) -> List[dict]:
    """Idempotently create one `vendor_payouts` row per (seller × order).

    Called from:
      • Razorpay verify-payment success
      • Brand credit-paid order creation
      • Admin "Mark Paid" action
    Returns the list of payout docs that exist for this order (new + pre-existing).
    """
    from auth_helpers import db as _db
    order_id = order.get("id")
    if not order_id:
        return []
    if order.get("payment_status") != "paid":
        return []

    # Group items by seller_id
    by_seller: dict[str, list] = {}
    for it in (order.get("items") or []):
        sid = (it.get("seller_id") or "").strip()
        if not sid:
            continue
        by_seller.setdefault(sid, []).append(it)
    if not by_seller:
        return []

    existing = {}
    async for p in _db.vendor_payouts.find({"order_id": order_id}, {"_id": 0}):
        existing[p["seller_id"]] = p

    now = datetime.now(timezone.utc).isoformat()
    results: List[dict] = []

    # Source-of-truth commission %: prefer the value stamped on the order
    # at checkout time (so payout matches the booking confirmation the
    # customer saw). Only fall back to per-item / resolver lookups when
    # the order doesn't have one stamped (very old orders).
    order_commission_pct = order.get("commission_pct")
    try:
        order_commission_pct = float(order_commission_pct) if order_commission_pct is not None else None
    except (TypeError, ValueError):
        order_commission_pct = None

    for sid, items in by_seller.items():
        if sid in existing:
            results.append(existing[sid])
            continue
        # Compute gross/commission per item using CURRENT rules.
        # For provisional bulk orders we use `actual_quantity` (the qty
        # the vendor actually packed) so the payout matches what they
        # really dispatched — not what the customer originally ordered.
        line_breakdown = []
        gross_subtotal = 0.0
        commission_total = 0.0
        for it in items:
            qty = float(
                it.get("actual_quantity") if it.get("actual_quantity") is not None
                else (it.get("quantity") or 0)
            )
            rate = float(it.get("price_per_meter", 0) or 0)
            line_gross = qty * rate
            # Resolution priority (most-trusted first):
            #  1. Per-item stamp (item.commission_pct) — future-proof
            #  2. Order-level stamp (set by commission_router at checkout)
            #  3. Live rule resolver against db.commission_rules
            item_pct = it.get("commission_pct")
            try:
                item_pct = float(item_pct) if item_pct is not None else None
            except (TypeError, ValueError):
                item_pct = None
            if item_pct is not None:
                comm_pct = item_pct
            elif order_commission_pct is not None:
                comm_pct = order_commission_pct
            else:
                comm_pct = await _resolve_commission(
                    sid,
                    it.get("fabric_id", ""),
                    it.get("category_id", ""),
                    it.get("category_name", ""),
                    it.get("pattern", ""),
                )
            line_comm = round(line_gross * comm_pct / 100.0, 2)
            line_breakdown.append({
                "fabric_id": it.get("fabric_id", ""),
                "fabric_name": it.get("fabric_name", ""),
                "fabric_code": it.get("fabric_code", ""),
                "quantity": qty,
                "rate": rate,
                "gross": round(line_gross, 2),
                "commission_pct": comm_pct,
                "commission_amount": line_comm,
                "net": round(line_gross - line_comm, 2),
            })
            gross_subtotal += line_gross
            commission_total += line_comm

        seller = await _db.sellers.find_one(
            {"id": sid},
            {"_id": 0, "id": 1, "company_name": 1, "name": 1, "contact_email": 1, "contact_phone": 1, "payment_terms": 1},
        ) or {}

        goods_gst_pct, comm_gst_pct = _gst_rates()
        gst_on_goods = round(gross_subtotal * goods_gst_pct / 100.0, 2)
        supplier_invoice_value = round(gross_subtotal + gst_on_goods, 2)
        gst_on_commission = round(commission_total * comm_gst_pct / 100.0, 2)

        # Pull vendor invoice uploaded at Mark-Goods-Ready time (provisional
        # bulk orders) so the payout already carries the invoice and the
        # vendor doesn't need to re-upload from My Payouts.
        vendor_inv = None
        for inv in (order.get("vendor_invoices") or []):
            if (inv.get("seller_id") or "") == sid:
                vendor_inv = inv
                break

        payout_doc = {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "order_number": order.get("order_number", ""),
            "seller_id": sid,
            "seller_company": seller.get("company_name") or seller.get("name") or "",
            "seller_email": seller.get("contact_email", ""),
            "seller_phone": seller.get("contact_phone", ""),
            "items": line_breakdown,
            "gross_subtotal": round(gross_subtotal, 2),
            # GST on goods (added to supplier's invoice)
            "goods_gst_pct": goods_gst_pct,
            "gst_on_goods": gst_on_goods,
            "supplier_invoice_value": supplier_invoice_value,
            # Commission + GST on commission (deducted from payout)
            "commission_total": round(commission_total, 2),
            "commission_gst_pct": comm_gst_pct,
            "gst_on_commission": gst_on_commission,
            "advances_applied": 0.0,
            "advance_ids": [],
            "net_payable": round(supplier_invoice_value - commission_total - gst_on_commission, 2),
            "payment_terms_snapshot": seller.get("payment_terms", ""),
            "status": "pending",
            "paid_at": None,
            "utr": "",
            "paid_via": "",
            "notes": "",
            "order_paid_at": order.get("paid_at", order.get("created_at", now)),
            "order_currency": order.get("currency", "INR"),
            "created_at": now,
            "updated_at": now,
        }
        if vendor_inv:
            payout_doc.update({
                "vendor_invoice_url": vendor_inv.get("url", ""),
                "vendor_invoice_filename": vendor_inv.get("filename", ""),
                "vendor_invoice_number": vendor_inv.get("invoice_number", ""),
                "vendor_invoice_date": vendor_inv.get("invoice_date", ""),
                "vendor_invoice_amount": vendor_inv.get("amount"),
                "vendor_invoice_status": "uploaded",
                "vendor_invoice_uploaded_at": vendor_inv.get("uploaded_at", now),
                "vendor_invoice_source": "mark_goods_ready",
            })
        # Auto-apply any orphan advances linked to this order/vendor
        async for adv in _db.vendor_advances.find(
            {"seller_id": sid, "order_id": order_id, "status": "active"},
            {"_id": 0, "id": 1, "amount": 1},
        ):
            payout_doc["advance_ids"].append(adv["id"])
            payout_doc["advances_applied"] += float(adv.get("amount", 0) or 0)
        payout_doc["advances_applied"] = round(payout_doc["advances_applied"], 2)
        payout_doc["net_payable"] = round(payout_doc["net_payable"] - payout_doc["advances_applied"], 2)

        await _db.vendor_payouts.insert_one(payout_doc.copy())
        results.append(payout_doc)
        logger.info(
            f"[payout] materialized {payout_doc['order_number']} → {payout_doc['seller_company']} "
            f"gross=₹{payout_doc['gross_subtotal']} +gst@{goods_gst_pct}%=₹{payout_doc['gst_on_goods']} "
            f"invoice=₹{payout_doc['supplier_invoice_value']} comm=₹{payout_doc['commission_total']} "
            f"commGst@{comm_gst_pct}%=₹{payout_doc['gst_on_commission']} "
            f"adv=₹{payout_doc['advances_applied']} net=₹{payout_doc['net_payable']}"
        )
    return results


# ─────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────
@router.get("/payouts/dashboard")
async def payouts_dashboard(
    status: Optional[str] = None,
    seller_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    user=Depends(get_current_accounts_or_admin),
):
    """List vendor payouts with filters. Returns tiles + paginated rows.
    Default order: oldest pending first (so accounts pays in FIFO).
    """
    from auth_helpers import db as _db
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if seller_id:
        q["seller_id"] = seller_id

    # Tiles — counts and amounts by status (ignores filters intentionally)
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "amount": {"$sum": "$net_payable"},
        }}
    ]
    tiles = {"pending": {"count": 0, "amount": 0}, "processing": {"count": 0, "amount": 0}, "paid": {"count": 0, "amount": 0}}
    async for row in _db.vendor_payouts.aggregate(pipeline):
        st = row.get("_id") or "pending"
        if st in tiles:
            tiles[st]["count"] = row["count"]
            tiles[st]["amount"] = round(float(row["amount"] or 0), 2)

    cursor = (
        _db.vendor_payouts.find(q, {"_id": 0})
        .sort("created_at", 1)
        .skip(max(0, (page - 1) * page_size))
        .limit(page_size)
    )
    rows = []
    async for p in cursor:
        rows.append(p)
    total = await _db.vendor_payouts.count_documents(q)

    return {
        "tiles": tiles,
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "viewer_role": "accounts" if _is_accounts_role(user) else "admin",
    }


@router.post("/payouts/materialize-all")
async def materialize_all_pending(user=Depends(get_current_accounts_or_admin)):
    """Scan every paid order and materialize missing payout rows.

    Useful right after deploy / for backfilling. Idempotent — safe to
    re-run any time.
    """
    from auth_helpers import db as _db
    total_orders = 0
    total_payouts_created = 0
    async for o in _db.orders.find(
        {"payment_status": "paid", "is_parent_order": {"$ne": True}},
        {"_id": 0},
    ):
        total_orders += 1
        before = await _db.vendor_payouts.count_documents({"order_id": o["id"]})
        await materialize_payouts_for_order(o)
        after = await _db.vendor_payouts.count_documents({"order_id": o["id"]})
        total_payouts_created += (after - before)
    return {
        "orders_scanned": total_orders,
        "payouts_created": total_payouts_created,
    }


class MarkPaidPayload(BaseModel):
    utr: str = Field(..., min_length=4)
    paid_via: str = "NEFT"  # NEFT | RTGS | IMPS | UPI | OTHER
    paid_at: Optional[str] = None  # ISO timestamp, defaults to now
    notes: str = ""


@router.post("/payouts/{payout_id}/mark-paid")
async def mark_payout_paid(
    payout_id: str,
    payload: MarkPaidPayload,
    user=Depends(get_current_accounts_or_admin),
):
    from auth_helpers import db as _db
    payout = await _db.vendor_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout.get("status") == "paid":
        return {"success": True, "already_paid": True, "payout": payout}

    # Mandatory: vendor must have uploaded their tax invoice (and it
    # must not be in a rejected state) before Accounts can release funds.
    inv_status = payout.get("vendor_invoice_status", "not_uploaded")
    if inv_status != "uploaded" or not payout.get("vendor_invoice_url"):
        raise HTTPException(
            status_code=400,
            detail="Vendor invoice not uploaded. The vendor must upload their tax invoice for this order before payout can be released.",
        )

    paid_at = payload.paid_at or datetime.now(timezone.utc).isoformat()
    update = {
        "status": "paid",
        "paid_at": paid_at,
        "utr": payload.utr.strip(),
        "paid_via": payload.paid_via,
        "notes": payload.notes,
        "paid_by_email": user.get("email", ""),
        "updated_at": paid_at,
    }
    await _db.vendor_payouts.update_one({"id": payout_id}, {"$set": update})
    # Mark linked advances as consumed
    if payout.get("advance_ids"):
        await _db.vendor_advances.update_many(
            {"id": {"$in": payout["advance_ids"]}},
            {"$set": {"status": "consumed", "consumed_at": paid_at, "consumed_by_payout": payout_id}},
        )

    # Notify vendor (email + WhatsApp) — fire-and-forget
    final = {**payout, **update}
    try:
        import asyncio as _aio
        _aio.create_task(_notify_vendor_payout(final))
    except Exception as e:
        logger.warning(f"[payout-notify] schedule failed: {e}")

    return {"success": True, "payout": final}


@router.get("/orders/{order_id}/seller-commissions")
async def get_order_seller_commissions(order_id: str):
    """Return per-seller commission + payout breakdown for an order.
    Used by the Admin order detail panel to show commission split when
    an order has items from multiple suppliers.

    Pulls from `vendor_payouts` (materialized when payment_status flips
    to paid). For unpaid orders we compute a preview on-the-fly using
    current commission rules, so admin sees what each supplier WILL
    earn before money moves.
    """
    from auth_helpers import db as _db
    order = await _db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    rows = []
    # Materialized rows first (most accurate — locked-in at payment time)
    async for p in _db.vendor_payouts.find({"order_id": order["id"]}, {"_id": 0}):
        rows.append({
            "seller_id": p.get("seller_id", ""),
            "seller_company": p.get("seller_company", ""),
            "items_count": len(p.get("items", [])),
            "gross_subtotal": p.get("gross_subtotal", 0),
            "commission_pct_weighted": _weighted_pct(p),
            "commission_total": p.get("commission_total", 0),
            "gst_on_commission": p.get("gst_on_commission", 0),
            "commission_gst_pct": p.get("commission_gst_pct", 18),
            "net_payable": p.get("net_payable", 0),
            "status": p.get("status", "pending"),
            "source": "materialized",
        })
    if rows:
        return {"order_number": order.get("order_number"), "paid": order.get("payment_status") == "paid", "sellers": rows}

    # Preview path — order isn't paid yet, compute live.
    by_seller: dict = {}
    for it in (order.get("items") or []):
        sid = (it.get("seller_id") or "").strip()
        if not sid:
            continue
        by_seller.setdefault(sid, []).append(it)
    goods_gst_pct, comm_gst_pct = _gst_rates()
    for sid, items in by_seller.items():
        seller = await _db.sellers.find_one({"id": sid}, {"_id": 0, "company_name": 1, "name": 1}) or {}
        gross = 0.0
        comm_total = 0.0
        for it in items:
            qty = float(it.get("quantity", 0) or 0)
            rate = float(it.get("price_per_meter", 0) or 0)
            line_gross = qty * rate
            pct = await _resolve_commission(sid, it.get("fabric_id", ""), it.get("category_id", ""))
            comm_total += round(line_gross * pct / 100.0, 2)
            gross += line_gross
        gst_on_comm = round(comm_total * comm_gst_pct / 100.0, 2)
        invoice_value = round(gross * (1 + goods_gst_pct / 100.0), 2)
        weighted = round((comm_total / gross * 100.0), 2) if gross else 0
        rows.append({
            "seller_id": sid,
            "seller_company": seller.get("company_name") or seller.get("name") or "—",
            "items_count": len(items),
            "gross_subtotal": round(gross, 2),
            "commission_pct_weighted": weighted,
            "commission_total": round(comm_total, 2),
            "gst_on_commission": gst_on_comm,
            "commission_gst_pct": comm_gst_pct,
            "net_payable": round(invoice_value - comm_total - gst_on_comm, 2),
            "status": "preview",
            "source": "preview",
        })
    return {"order_number": order.get("order_number"), "paid": False, "sellers": rows}


def _weighted_pct(payout: dict) -> float:
    """Weighted commission % across items in a materialized payout."""
    gross = float(payout.get("gross_subtotal", 0) or 0)
    comm = float(payout.get("commission_total", 0) or 0)
    if not gross:
        return 0.0
    return round(comm / gross * 100.0, 2)


@router.post("/orders/{order_id}/resync-commission")
async def resync_order_commission(
    order_id: str,
    user=Depends(get_current_accounts_or_admin),
):
    """Per-order commission resync.

    For every PENDING vendor_payout linked to this order, recompute
    commission + GST + net_payable **in place** using the new resolution
    chain (item stamp → order stamp → live rules). Paid payouts are
    skipped. If no payouts exist yet (and the order is paid), we
    materialize fresh ones.

    Used from the "Commission & Seller Payout" card on /admin/orders so
    the admin can fix individual orders without nuking the row.
    """
    from auth_helpers import db as _db
    order = await _db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    payouts = await _db.vendor_payouts.find({"order_id": order_id}, {"_id": 0}).to_list(50)

    # No payouts yet — try to materialize fresh (only succeeds if order is paid).
    if not payouts:
        fresh = await materialize_payouts_for_order(order)
        return {
            "success": True,
            "updated": len(fresh),
            "skipped_paid": 0,
            "materialized_fresh": True,
            "payouts": fresh,
        }

    goods_gst_pct, comm_gst_pct = _gst_rates()

    skipped_paid = 0
    updated_payouts: List[dict] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for p in payouts:
        if p.get("status") == "paid":
            skipped_paid += 1
            continue

        sid = p["seller_id"]
        order_items = [it for it in (order.get("items") or []) if (it.get("seller_id") or "") == sid]
        if not order_items:
            order_items = p.get("items") or []

        new_lines = []
        new_gross = 0.0
        new_comm = 0.0
        for it in order_items:
            qty = float(it.get("quantity", 0) or 0)
            rate = float(it.get("price_per_meter", it.get("rate", 0)) or 0)
            line_gross = qty * rate
            # Resync intentionally bypasses the stale `order.commission_pct`
            # stamp (which may have been written by the broken pre-fix
            # calculator) and re-resolves from the live rules table. Only
            # honour an explicit per-item stamp if present.
            item_pct_raw = it.get("commission_pct")
            try:
                item_pct = float(item_pct_raw) if item_pct_raw is not None else None
            except (TypeError, ValueError):
                item_pct = None
            if item_pct is not None:
                comm_pct = item_pct
            else:
                comm_pct = await _resolve_commission(
                    sid,
                    it.get("fabric_id", ""),
                    it.get("category_id", ""),
                    it.get("category_name", ""),
                    it.get("pattern", ""),
                )
            line_comm = round(line_gross * comm_pct / 100.0, 2)
            new_lines.append({
                "fabric_id": it.get("fabric_id", ""),
                "fabric_name": it.get("fabric_name", ""),
                "fabric_code": it.get("fabric_code", ""),
                "quantity": qty,
                "rate": rate,
                "gross": round(line_gross, 2),
                "commission_pct": comm_pct,
                "commission_amount": line_comm,
                "net": round(line_gross - line_comm, 2),
            })
            new_gross += line_gross
            new_comm += line_comm

        new_gross = round(new_gross, 2)
        new_comm = round(new_comm, 2)
        gst_on_goods = round(new_gross * goods_gst_pct / 100.0, 2)
        supplier_invoice_value = round(new_gross + gst_on_goods, 2)
        gst_on_commission = round(new_comm * comm_gst_pct / 100.0, 2)
        advances = float(p.get("advances_applied", 0) or 0)
        net_payable = round(supplier_invoice_value - new_comm - gst_on_commission - advances, 2)

        await _db.vendor_payouts.update_one(
            {"id": p["id"]},
            {"$set": {
                "items": new_lines,
                "gross_subtotal": new_gross,
                "commission_total": new_comm,
                "commission_gst_pct": comm_gst_pct,
                "gst_on_commission": gst_on_commission,
                "goods_gst_pct": goods_gst_pct,
                "gst_on_goods": gst_on_goods,
                "supplier_invoice_value": supplier_invoice_value,
                "net_payable": net_payable,
                "updated_at": now_iso,
            }},
        )
        fresh = await _db.vendor_payouts.find_one({"id": p["id"]}, {"_id": 0})
        updated_payouts.append(fresh)

    return {
        "success": True,
        "updated": len(updated_payouts),
        "skipped_paid": skipped_paid,
        "payouts": updated_payouts,
    }


@router.post("/payouts/{payout_id}/recalculate")
async def recalculate_payout(
    payout_id: str,
    user=Depends(get_current_accounts_or_admin),
):
    """Re-runs commission lookup against CURRENT rules. Useful after a
    commission rule change. Refuses to recalculate a paid payout.

    Delegates to the per-order resync endpoint logic so we stay on the
    safe in-place update path — never delete-and-recreate (that can lose
    the row if the parent order's payment_status isn't paid).
    """
    from auth_helpers import db as _db
    payout = await _db.vendor_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout["status"] == "paid":
        raise HTTPException(status_code=400, detail="Cannot recalc a paid payout")
    order = await _db.orders.find_one({"id": payout["order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Reuse the order-level resync (it handles in-place update + GST recompute).
    result = await resync_order_commission(order["id"], user=user)
    seller_payout = next((p for p in result.get("payouts") or [] if p["seller_id"] == payout["seller_id"]), None)
    return {"success": True, "payout": seller_payout}


@router.post("/payouts/backfill-commission")
async def backfill_pending_payouts_commission(user=Depends(get_current_accounts_or_admin)):
    """One-shot backfill: recompute commission + net_payable on every
    PENDING vendor_payout using the new resolution chain (item stamp →
    order stamp → live rules). Paid payouts are skipped.

    Idempotent — safe to re-run. Returns per-payout diff so the user can
    audit which rows changed.
    """
    from auth_helpers import db as _db
    goods_gst_pct, comm_gst_pct = _gst_rates()

    updated = 0
    unchanged = 0
    skipped_paid = 0
    skipped_no_order = 0
    diffs: List[dict] = []

    async for p in _db.vendor_payouts.find({}, {"_id": 0}):
        if p.get("status") == "paid":
            skipped_paid += 1
            continue
        order = await _db.orders.find_one({"id": p["order_id"]}, {"_id": 0})
        if not order:
            skipped_no_order += 1
            continue

        # Resync bypasses the stale order stamp — re-resolves from live rules.
        sid = p["seller_id"]
        order_items = [it for it in (order.get("items") or []) if (it.get("seller_id") or "") == sid]
        # Fall back to the items snapshot stored on the payout if the
        # parent order's items list was groomed/migrated.
        if not order_items:
            order_items = p.get("items") or []

        new_lines = []
        new_gross = 0.0
        new_comm = 0.0
        for it in order_items:
            qty = float(it.get("quantity", 0) or 0)
            rate = float(it.get("price_per_meter", it.get("rate", 0)) or 0)
            line_gross = qty * rate
            # Resync intentionally bypasses the stale `order.commission_pct`
            # stamp (which may have been written by the broken pre-fix
            # calculator) and re-resolves from the live rules table. Only
            # honour an explicit per-item stamp if present.
            item_pct_raw = it.get("commission_pct")
            try:
                item_pct = float(item_pct_raw) if item_pct_raw is not None else None
            except (TypeError, ValueError):
                item_pct = None
            if item_pct is not None:
                comm_pct = item_pct
            else:
                comm_pct = await _resolve_commission(
                    sid,
                    it.get("fabric_id", ""),
                    it.get("category_id", ""),
                    it.get("category_name", ""),
                    it.get("pattern", ""),
                )
            line_comm = round(line_gross * comm_pct / 100.0, 2)
            new_lines.append({
                "fabric_id": it.get("fabric_id", ""),
                "fabric_name": it.get("fabric_name", ""),
                "fabric_code": it.get("fabric_code", ""),
                "quantity": qty,
                "rate": rate,
                "gross": round(line_gross, 2),
                "commission_pct": comm_pct,
                "commission_amount": line_comm,
                "net": round(line_gross - line_comm, 2),
            })
            new_gross += line_gross
            new_comm += line_comm

        new_gross = round(new_gross, 2)
        new_comm = round(new_comm, 2)
        gst_on_goods = round(new_gross * goods_gst_pct / 100.0, 2)
        supplier_invoice_value = round(new_gross + gst_on_goods, 2)
        gst_on_commission = round(new_comm * comm_gst_pct / 100.0, 2)
        advances = float(p.get("advances_applied", 0) or 0)
        net_payable = round(supplier_invoice_value - new_comm - gst_on_commission - advances, 2)

        old_comm = float(p.get("commission_total", 0) or 0)
        changed = abs(old_comm - new_comm) > 0.01

        if changed:
            await _db.vendor_payouts.update_one(
                {"id": p["id"]},
                {"$set": {
                    "items": new_lines,
                    "gross_subtotal": new_gross,
                    "commission_total": new_comm,
                    "commission_gst_pct": comm_gst_pct,
                    "gst_on_commission": gst_on_commission,
                    "goods_gst_pct": goods_gst_pct,
                    "gst_on_goods": gst_on_goods,
                    "supplier_invoice_value": supplier_invoice_value,
                    "net_payable": net_payable,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            updated += 1
            diffs.append({
                "payout_id": p["id"],
                "order_number": p.get("order_number", ""),
                "seller_company": p.get("seller_company", ""),
                "old_commission": old_comm,
                "new_commission": new_comm,
                "old_net_payable": float(p.get("net_payable", 0) or 0),
                "new_net_payable": net_payable,
            })
        else:
            unchanged += 1

    return {
        "success": True,
        "updated": updated,
        "unchanged": unchanged,
        "skipped_paid": skipped_paid,
        "skipped_no_order": skipped_no_order,
        "diffs": diffs[:200],  # cap response size for huge backfills
    }


@router.post("/payouts/recalculate-unpaid-gst")
async def recalculate_unpaid_payouts_gst(user=Depends(get_current_accounts_or_admin)):
    """Backfill GST fields (goods GST + commission GST) on all UNPAID payouts.
    Paid payouts are left untouched. Returns counts.
    Idempotent — re-running is safe.
    """
    from auth_helpers import db as _db
    goods_gst_pct, comm_gst_pct = _gst_rates()
    updated = 0
    skipped_paid = 0
    async for p in _db.vendor_payouts.find({}, {"_id": 0}):
        if p.get("status") == "paid":
            skipped_paid += 1
            continue
        gross = float(p.get("gross_subtotal", 0) or 0)
        commission = float(p.get("commission_total", 0) or 0)
        advances = float(p.get("advances_applied", 0) or 0)
        gst_on_goods = round(gross * goods_gst_pct / 100.0, 2)
        supplier_invoice_value = round(gross + gst_on_goods, 2)
        gst_on_commission = round(commission * comm_gst_pct / 100.0, 2)
        net_payable = round(supplier_invoice_value - commission - gst_on_commission - advances, 2)
        await _db.vendor_payouts.update_one(
            {"id": p["id"]},
            {"$set": {
                "goods_gst_pct": goods_gst_pct,
                "gst_on_goods": gst_on_goods,
                "supplier_invoice_value": supplier_invoice_value,
                "commission_gst_pct": comm_gst_pct,
                "gst_on_commission": gst_on_commission,
                "net_payable": net_payable,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        updated += 1
    return {
        "success": True,
        "updated": updated,
        "skipped_paid": skipped_paid,
        "goods_gst_pct": goods_gst_pct,
        "commission_gst_pct": comm_gst_pct,
    }


# ── Advances ─────────────────────────────────────────────────────
class CreateAdvancePayload(BaseModel):
    seller_id: str
    order_id: str  # tied to a specific order (per business rule)
    amount: float
    paid_at: Optional[str] = None
    utr: str = ""
    paid_via: str = "NEFT"
    notes: str = ""


@router.post("/payouts/advances")
async def create_advance(
    payload: CreateAdvancePayload,
    user=Depends(get_current_accounts_or_admin),
):
    """Create an advance. Validates that the vendor's payment_terms
    actually allow advances (otherwise rejected — per business rule
    'advance only when configured at vendor level')."""
    from auth_helpers import db as _db
    seller = await _db.sellers.find_one(
        {"id": payload.seller_id}, {"_id": 0, "payment_terms": 1, "company_name": 1, "contact_email": 1}
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Vendor not found")
    terms = (seller.get("payment_terms") or "").lower()
    if "advance" not in terms:
        raise HTTPException(
            status_code=400,
            detail=f"Vendor's payment terms ({seller.get('payment_terms') or 'unset'}) do not allow advances. Update vendor profile first."
        )
    order = await _db.orders.find_one({"id": payload.order_id}, {"_id": 0, "order_number": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    now = datetime.now(timezone.utc).isoformat()
    adv = {
        "id": str(uuid.uuid4()),
        "seller_id": payload.seller_id,
        "seller_company": seller.get("company_name", ""),
        "order_id": payload.order_id,
        "order_number": order.get("order_number", ""),
        "amount": round(float(payload.amount), 2),
        "paid_at": payload.paid_at or now,
        "utr": payload.utr.strip(),
        "paid_via": payload.paid_via,
        "notes": payload.notes,
        "created_by_email": user.get("email", ""),
        "status": "active",  # active | consumed | cancelled
        "created_at": now,
    }
    await _db.vendor_advances.insert_one(adv.copy())
    return {"success": True, "advance": adv}


@router.get("/payouts/advances")
async def list_advances(
    seller_id: Optional[str] = None,
    status: Optional[str] = None,
    user=Depends(get_current_accounts_or_admin),
):
    from auth_helpers import db as _db
    q: dict = {}
    if seller_id:
        q["seller_id"] = seller_id
    if status:
        q["status"] = status
    rows = []
    async for a in _db.vendor_advances.find(q, {"_id": 0}).sort("paid_at", -1):
        rows.append(a)
    return {"advances": rows, "total": len(rows)}


# ── Vendor bank/payment-term updates (accounts-allowed) ─────────
class UpdateVendorFinancePayload(BaseModel):
    payment_terms: Optional[str] = None  # "Advance 50% + 50% on dispatch", "Net 30", etc.
    advance_pct: Optional[float] = None  # 0-100
    bank_account_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    pan_number: Optional[str] = None


@router.put("/payouts/vendors/{vendor_id}/finance")
async def update_vendor_finance(
    vendor_id: str,
    payload: UpdateVendorFinancePayload,
    user=Depends(get_current_accounts_or_admin),
):
    """Allows accounts AND admin to edit financial fields ONLY. Other
    vendor fields (name, address, GST, etc.) are untouched."""
    from auth_helpers import db as _db
    seller = await _db.sellers.find_one({"id": vendor_id}, {"_id": 0, "id": 1})
    if not seller:
        raise HTTPException(status_code=404, detail="Vendor not found")
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["finance_updated_at"] = datetime.now(timezone.utc).isoformat()
    update["finance_updated_by"] = user.get("email", "")
    await _db.sellers.update_one({"id": vendor_id}, {"$set": update})
    return {"success": True, "updated_fields": list(update.keys())}


# ─────────────────────────────────────────────────────────────────
# Notifications
# ─────────────────────────────────────────────────────────────────
async def _notify_vendor_payout(payout: dict):
    """Email + WhatsApp/SMS notification when a payout is marked paid."""
    try:
        import asyncio as _aio
        import resend  # already configured at import time in email_router
        seller_email = payout.get("seller_email", "")
        if not seller_email:
            logger.info(f"[payout-notify] {payout.get('order_number')}: no seller_email, skipping")
            return
        subject = f"Payout received: {payout['order_number']} — ₹{payout['net_payable']:,.2f}"
        body = _build_payout_email_html(payout)
        params = {
            "from": os.environ.get("RESEND_FROM_EMAIL", "Locofast Accounts <creditoperations@locofast.com>"),
            "to": [seller_email],
            "subject": subject,
            "html": body,
            "reply_to": "creditoperations@locofast.com",
        }
        await _aio.to_thread(resend.Emails.send, params)
        logger.info(f"[payout-notify] email sent to {seller_email}")
    except Exception as e:
        logger.warning(f"[payout-notify] email failed: {e}")

    # WhatsApp via Gupshup (best effort)
    try:
        phone = payout.get("seller_phone", "")
        if not phone:
            return
        from gupshup_router import send_whatsapp_template  # type: ignore
        msg = (
            f"Locofast payout completed: ₹{payout['net_payable']:,.2f} "
            f"for order {payout['order_number']}. UTR: {payout.get('utr','')}. "
            f"Paid on {payout.get('paid_at','')[:10]} via {payout.get('paid_via','')}."
        )
        await send_whatsapp_template(phone, msg)
    except Exception as e:
        logger.info(f"[payout-notify] WhatsApp skipped: {e}")


def _build_payout_email_html(payout: dict) -> str:
    rows = ""
    for ln in payout.get("items", []):
        rows += (
            f"<tr>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb'>{ln.get('fabric_name','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right'>{ln.get('quantity','')}m</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right'>₹{ln.get('rate',0):,.2f}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right'>₹{ln.get('gross',0):,.2f}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right'>{ln.get('commission_pct',0)}%</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right'>₹{ln.get('net',0):,.2f}</td>"
            f"</tr>"
        )
    return f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
  <div style="background:#2563EB;color:white;padding:18px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Payout received</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.9">{payout.get('seller_company','')}</p>
  </div>
  <div style="padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
    <p>Hello,</p>
    <p>Locofast has settled your dues for order
    <strong>{payout.get('order_number','')}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 10px;text-align:left">Item</th>
        <th style="padding:8px 10px;text-align:right">Qty</th>
        <th style="padding:8px 10px;text-align:right">Rate</th>
        <th style="padding:8px 10px;text-align:right">Gross</th>
        <th style="padding:8px 10px;text-align:right">Comm %</th>
        <th style="padding:8px 10px;text-align:right">Net</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      <tr><td>Gross subtotal</td><td style="text-align:right">₹{payout['gross_subtotal']:,.2f}</td></tr>
      <tr><td>Commission</td><td style="text-align:right;color:#dc2626">−₹{payout['commission_total']:,.2f}</td></tr>
      <tr><td>Advances already paid</td><td style="text-align:right;color:#dc2626">−₹{payout['advances_applied']:,.2f}</td></tr>
      <tr style="font-weight:700;border-top:1px solid #111827"><td style="padding-top:6px">Net paid to you</td><td style="text-align:right;padding-top:6px">₹{payout['net_payable']:,.2f}</td></tr>
    </table>
    <div style="margin-top:14px;background:#f0f9ff;border:1px solid #bae6fd;padding:12px 14px;border-radius:6px">
      <p style="margin:0"><strong>UTR / Reference:</strong> {payout.get('utr','—')}</p>
      <p style="margin:4px 0 0"><strong>Paid on:</strong> {payout.get('paid_at','')[:19].replace('T',' ')}</p>
      <p style="margin:4px 0 0"><strong>Mode:</strong> {payout.get('paid_via','')}</p>
    </div>
    {f'<p style="margin-top:14px;color:#6b7280;font-size:12px">Notes: {payout["notes"]}</p>' if payout.get('notes') else ''}
    <p style="margin-top:18px">If anything looks off, reply to this email and we'll fix it.</p>
    <p>— Locofast Accounts<br/>creditoperations@locofast.com</p>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────
# Vendor Invoice Upload  (prerequisite for payout release)
# ─────────────────────────────────────────────────────────────────
class UploadVendorInvoicePayload(BaseModel):
    invoice_url: str = Field(..., min_length=8)
    filename: str = ""
    invoice_number: str = ""
    invoice_date: str = ""  # ISO date, optional
    amount: Optional[float] = None  # what vendor is claiming, optional


async def _get_current_vendor_local(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Local copy of vendor JWT verification to avoid circular import.
    Mirrors `vendor_router.get_current_vendor` exactly."""
    from auth_helpers import db as _db
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "vendor":
            raise HTTPException(status_code=401, detail="Invalid token type")
        seller_id = payload.get("seller_id")
        seller = await _db.sellers.find_one(
            {"id": seller_id, "is_active": True},
            {"_id": 0, "password_hash": 0},
        )
        if not seller:
            raise HTTPException(status_code=401, detail="Vendor not found or inactive")
        return seller
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/vendor/payouts")
async def vendor_list_my_payouts(vendor=Depends(_get_current_vendor_local)):
    """List all payouts owed to the calling vendor (newest first)."""
    from auth_helpers import db as _db
    rows = []
    async for p in _db.vendor_payouts.find(
        {"seller_id": vendor["id"]}, {"_id": 0}
    ).sort("created_at", -1):
        rows.append(p)
    return {"payouts": rows, "total": len(rows)}


@router.post("/vendor/payouts/{payout_id}/upload-invoice")
async def vendor_upload_invoice(
    payout_id: str,
    payload: UploadVendorInvoicePayload,
    vendor=Depends(_get_current_vendor_local),
):
    """Vendor uploads (or re-uploads after rejection) their tax invoice
    for this payout. After upload:
      • status flips to `uploaded` (locked — no further uploads until Accounts rejects)
      • email goes to creditoperations@locofast.com (via ACCOUNTS_NOTIFY_EMAIL env)
    """
    from auth_helpers import db as _db
    payout = await _db.vendor_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout["seller_id"] != vendor["id"]:
        raise HTTPException(status_code=403, detail="Not your payout")
    if payout.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Payout already paid — cannot modify invoice")

    current = payout.get("vendor_invoice_status", "not_uploaded")
    # Allow upload when nothing has been submitted or when Accounts has rejected.
    if current == "uploaded":
        raise HTTPException(
            status_code=400,
            detail="Invoice already submitted. Accounts must reject the current invoice before you can re-upload.",
        )

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "vendor_invoice_url": payload.invoice_url.strip(),
        "vendor_invoice_filename": payload.filename.strip(),
        "vendor_invoice_number": payload.invoice_number.strip(),
        "vendor_invoice_date": payload.invoice_date.strip(),
        "vendor_invoice_amount": float(payload.amount) if payload.amount is not None else None,
        "vendor_invoice_status": "uploaded",
        "vendor_invoice_uploaded_at": now,
        "vendor_invoice_rejection_reason": "",
        "updated_at": now,
    }
    await _db.vendor_payouts.update_one({"id": payout_id}, {"$set": update})
    final = {**payout, **update}

    # Fire-and-forget notify accounts
    try:
        import asyncio as _aio
        _aio.create_task(_notify_accounts_invoice_uploaded(final))
    except Exception as e:
        logger.warning(f"[invoice-notify] schedule failed: {e}")

    return {"success": True, "payout": final}


class RejectInvoicePayload(BaseModel):
    reason: str = Field(..., min_length=3)


@router.post("/payouts/{payout_id}/reject-invoice")
async def reject_vendor_invoice(
    payout_id: str,
    payload: RejectInvoicePayload,
    user=Depends(get_current_accounts_or_admin),
):
    """Accounts rejects a vendor's uploaded invoice with a reason. This
    unlocks the upload slot so the vendor can submit a corrected invoice.
    An email is sent to the vendor with the reason.
    """
    from auth_helpers import db as _db
    payout = await _db.vendor_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Payout already paid — cannot reject invoice")
    if payout.get("vendor_invoice_status") != "uploaded":
        raise HTTPException(status_code=400, detail="No invoice uploaded to reject")

    now = datetime.now(timezone.utc).isoformat()
    # Snapshot the rejected invoice for audit, then clear it so vendor can re-upload.
    history_entry = {
        "url": payout.get("vendor_invoice_url", ""),
        "filename": payout.get("vendor_invoice_filename", ""),
        "invoice_number": payout.get("vendor_invoice_number", ""),
        "amount": payout.get("vendor_invoice_amount"),
        "uploaded_at": payout.get("vendor_invoice_uploaded_at", ""),
        "rejected_at": now,
        "rejected_by": user.get("email", ""),
        "reason": payload.reason.strip(),
    }
    update = {
        "vendor_invoice_status": "rejected",
        "vendor_invoice_url": "",
        "vendor_invoice_rejection_reason": payload.reason.strip(),
        "vendor_invoice_rejected_at": now,
        "vendor_invoice_rejected_by": user.get("email", ""),
        "updated_at": now,
    }
    await _db.vendor_payouts.update_one(
        {"id": payout_id},
        {"$set": update, "$push": {"vendor_invoice_history": history_entry}},
    )
    final = {**payout, **update}

    try:
        import asyncio as _aio
        _aio.create_task(_notify_vendor_invoice_rejected(final, payload.reason.strip()))
    except Exception as e:
        logger.warning(f"[invoice-reject-notify] schedule failed: {e}")

    return {"success": True, "payout": final}


# ─────────────────────────────────────────────────────────────────
# Email notifications for vendor invoice flow
# ─────────────────────────────────────────────────────────────────
def _build_accounts_invoice_email_html(payout: dict) -> str:
    inv_url = payout.get("vendor_invoice_url", "")
    inv_num = payout.get("vendor_invoice_number", "—")
    inv_date = payout.get("vendor_invoice_date", "—")
    amt = payout.get("vendor_invoice_amount")
    amt_str = f"₹{amt:,.2f}" if amt is not None else "—"
    return f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
  <div style="background:#0f766e;color:white;padding:18px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">New vendor invoice uploaded</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.9">Awaiting payout release</p>
  </div>
  <div style="padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi Accounts team,</p>
    <p><strong>{payout.get('seller_company','—')}</strong> has uploaded their tax invoice for order
    <strong>{payout.get('order_number','')}</strong> and is ready for payout.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
      <tr><td style="padding:6px 0;color:#6b7280">Vendor</td><td style="padding:6px 0;text-align:right">{payout.get('seller_company','')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Order</td><td style="padding:6px 0;text-align:right">{payout.get('order_number','')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Net payable</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#047857">₹{payout.get('net_payable',0):,.2f}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Vendor invoice #</td><td style="padding:6px 0;text-align:right">{inv_num}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Invoice date</td><td style="padding:6px 0;text-align:right">{inv_date}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Claimed amount</td><td style="padding:6px 0;text-align:right">{amt_str}</td></tr>
    </table>
    <div style="margin-top:14px;text-align:center">
      <a href="{inv_url}" target="_blank"
         style="display:inline-block;background:#0f766e;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
        View vendor invoice
      </a>
    </div>
    <p style="margin-top:18px;font-size:12px;color:#6b7280">
      Open the Payouts dashboard → find this order → verify the invoice matches the platform calculation → click "Mark Paid" once UTR is processed.<br/>
      If the invoice has errors, use the "Reject Invoice" button to send the vendor a reason and unlock re-upload.
    </p>
  </div>
</div>"""


def _build_vendor_invoice_rejected_email_html(payout: dict, reason: str) -> str:
    return f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
  <div style="background:#b91c1c;color:white;padding:18px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Invoice rejected — please re-upload</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.9">Order {payout.get('order_number','')}</p>
  </div>
  <div style="padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi {payout.get('seller_company','')},</p>
    <p>Our Accounts team reviewed the tax invoice you uploaded for order
    <strong>{payout.get('order_number','')}</strong> and could not process it.</p>
    <div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;padding:12px 14px;border-radius:6px">
      <p style="margin:0;font-weight:600;color:#991b1b">Reason</p>
      <p style="margin:6px 0 0">{reason}</p>
    </div>
    <p style="margin-top:14px">Please log in to your Vendor Portal → <strong>My Payouts</strong> → and re-upload a corrected invoice. Payout will be released as soon as the corrected invoice is accepted.</p>
    <p style="margin-top:18px;color:#6b7280;font-size:12px">If you need help, reply to this email and our Accounts team will assist.</p>
    <p>— Locofast Accounts<br/>creditoperations@locofast.com</p>
  </div>
</div>"""


async def _notify_accounts_invoice_uploaded(payout: dict):
    try:
        import asyncio as _aio
        import resend
        to_email = os.environ.get("ACCOUNTS_NOTIFY_EMAIL", "creditoperations@locofast.com")
        subject = f"New vendor invoice: {payout.get('seller_company','')} → {payout.get('order_number','')} (₹{payout.get('net_payable',0):,.2f})"
        params = {
            "from": os.environ.get("RESEND_FROM_EMAIL", "Locofast Accounts <creditoperations@locofast.com>"),
            "to": [to_email],
            "subject": subject,
            "html": _build_accounts_invoice_email_html(payout),
            "reply_to": payout.get("seller_email", "creditoperations@locofast.com"),
        }
        await _aio.to_thread(resend.Emails.send, params)
        logger.info(f"[invoice-notify] accounts email sent for {payout.get('order_number')}")
    except Exception as e:
        logger.warning(f"[invoice-notify] accounts email failed: {e}")


async def _notify_vendor_invoice_rejected(payout: dict, reason: str):
    try:
        import asyncio as _aio
        import resend
        to_email = payout.get("seller_email", "")
        if not to_email:
            logger.info(f"[invoice-reject-notify] no seller_email for {payout.get('order_number')}")
            return
        subject = f"Invoice rejected for order {payout.get('order_number','')} — action required"
        params = {
            "from": os.environ.get("RESEND_FROM_EMAIL", "Locofast Accounts <creditoperations@locofast.com>"),
            "to": [to_email],
            "subject": subject,
            "html": _build_vendor_invoice_rejected_email_html(payout, reason),
            "reply_to": "creditoperations@locofast.com",
        }
        await _aio.to_thread(resend.Emails.send, params)
        logger.info(f"[invoice-reject-notify] vendor email sent to {to_email}")
    except Exception as e:
        logger.warning(f"[invoice-reject-notify] vendor email failed: {e}")
