"""
Orders Router - Handles order creation, payment, and management
Phase 1: Razorpay Integration + Order Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query, Body
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import razorpay
import hmac
import hashlib
import uuid
import os
import asyncio
import logging
import io
import jwt

from email_router import send_order_notification_emails
import auth_helpers

JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret')
JWT_ALGORITHM = 'HS256'

# PDF Generation imports
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/orders", tags=["orders"])

# MongoDB connection (will be set from main server)
db = None

# Razorpay client
razorpay_client = None

def init_razorpay():
    """Initialize Razorpay client"""
    global razorpay_client
    key_id = os.environ.get('RAZORPAY_KEY_ID')
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET')
    
    if key_id and key_secret:
        razorpay_client = razorpay.Client(auth=(key_id, key_secret))
        logger.info("Razorpay client initialized successfully")
    else:
        logger.warning("Razorpay credentials not found - payment features will be disabled")

def set_db(database):
    """Set database reference from main server"""
    global db
    db = database

# ==================== MODELS ====================

class OrderItem(BaseModel):
    fabric_id: str
    fabric_name: str
    fabric_code: str = ""
    category_name: str = ""
    pattern: str = ""  # used by category+pattern commission rule
    seller_company: str = ""
    seller_id: str = ""
    quantity: int  # in meters
    price_per_meter: float
    order_type: str = "bulk"  # "sample" or "bulk"
    image_url: str = ""
    hsn_code: str = ""
    dispatch_timeline: str = ""
    # Buyer-selected color variant (for multi-color SKUs)
    color_name: str = ""
    color_hex: str = ""
    # Unit of sale — "m" (default) or "kg" for knitted (non-denim)
    # fabrics. Determined at cart-add time from fabric.fabric_type.
    unit: str = ""
    # Provisional flag set by the Agent on the shared cart. When
    # "provisional" → triggers the 10% advance flow at checkout.
    # When "actual" or empty → full payment upfront (legacy).
    qty_type: str = ""

class CustomerInfo(BaseModel):
    name: str
    email: EmailStr
    phone: str
    company: str = ""
    gst_number: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""

class ShipTo(BaseModel):
    """Optional shipping address — different from the customer's billing
    address. When provided, the order's GST/IGST calculation and the
    "Place of Supply" on the tax invoice are driven by this address's
    state code (not the buyer's billing GST). This matches the Indian
    GST rule that POS = location of delivery for goods supply.
    """
    name: str = ""
    company: str = ""
    gst_number: str = ""  # 15-char GSTIN of the consignee (recommended for B2B)
    address: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    phone: str = ""

class ShippingInfo(BaseModel):
    courier_id: Optional[int] = None
    courier_name: Optional[str] = None
    rate: Optional[float] = None
    estimated_delivery_days: Optional[str] = None

class CouponInfo(BaseModel):
    code: str = ""
    discount_type: str = ""
    discount_value: float = 0
    discount_amount: float = 0

class OrderCreate(BaseModel):
    items: List[OrderItem]
    customer: CustomerInfo
    ship_to: Optional[ShipTo] = None
    notes: str = ""
    coupon: Optional[CouponInfo] = None
    discount: float = 0
    logistics_charge: float = 0
    packaging_charge: float = 0
    logistics_only_charge: float = 0
    payment_method: str = "razorpay"  # "razorpay" or "credit"
    # Agent-assisted booking fields
    agent_id: str = ""
    agent_email: str = ""
    agent_name: str = ""
    shared_cart_token: str = ""
    # Provisional bulk-order flow.
    # When `is_provisional` is True the customer pays only `advance_pct`
    # of the total upfront. Order moves to status `provisional` after
    # advance is paid. Supplier marks goods-ready with the actual quantity
    # which triggers a balance invoice. We push to Shiprocket only after
    # the balance payment is received (or finance marks it paid).
    # Sample orders ignore this flag — they always pay 100% upfront.
    is_provisional: bool = False
    advance_pct: float = 0  # 0 = inherit platform default at create-time

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: str  # Human readable order number like ORD-XXXXX
    items: List[OrderItem]
    customer: CustomerInfo
    subtotal: float
    tax: float = 0
    discount: float = 0
    coupon: Optional[dict] = None
    total: float
    currency: str = "INR"
    status: str = "pending"  # pending, payment_pending, paid, confirmed, processing, shipped, delivered, cancelled
    payment_status: str = "pending"  # pending, initiated, paid, failed, refunded
    razorpay_order_id: str = ""
    razorpay_payment_id: str = ""
    razorpay_signature: str = ""
    notes: str = ""
    created_at: str
    updated_at: str = ""
    paid_at: str = ""

class PaymentVerification(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

# ==================== HELPER FUNCTIONS ====================

async def generate_order_number() -> str:
    """Generate sequential invoice number like LF/ORD/001"""
    counter = await db.counters.find_one_and_update(
        {'_id': 'invoice_number'},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    seq = counter.get('seq', 1)
    return f'LF/ORD/{seq:03d}'

def calculate_totals(items: List[OrderItem], logistics_charge: float = 0, packaging_charge: float = 0, logistics_only_charge: float = 0) -> dict:
    """Calculate order totals.

    GST treatment (per Schedule II of the CGST Act): packaging and
    logistics charged by the supplier are part of the value of supply
    and are taxable at the same rate as the principal goods (5% for
    fabric here). So our taxable value is:
        goods_subtotal + packaging + logistics

    Old orders (pre-Feb 2026) were charged tax only on goods; they keep
    their stored `tax`/`total` values and the PDF renderer detects that
    via the `tax_on_charges_v2` flag (absent = legacy presentation).
    """
    goods_subtotal = sum(item.quantity * item.price_per_meter for item in items)
    # Normalize the two ways `logistics` can come in:
    #   • Bulk orders split it into `packaging_charge` + `logistics_only_charge`
    #   • Simpler orders use the single `logistics_charge`
    if packaging_charge > 0 or logistics_only_charge > 0:
        eff_packaging = packaging_charge
        eff_logistics = logistics_only_charge
    else:
        eff_packaging = 0.0
        eff_logistics = logistics_charge
    taxable_value = round(goods_subtotal + eff_packaging + eff_logistics, 2)
    tax = round(taxable_value * 0.05, 2)
    total = round(taxable_value + tax, 2)
    return {
        "subtotal": round(goods_subtotal, 2),
        "tax": tax,
        "logistics_charge": round(eff_logistics, 2),
        "packaging_charge": round(eff_packaging, 2),
        "logistics_only_charge": round(eff_logistics if eff_packaging > 0 else 0.0, 2),
        "taxable_value": taxable_value,
        "tax_on_charges_v2": True,
        "total": total,
    }

def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Verify Razorpay payment signature"""
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '')
    
    # Create signature verification string
    msg = f"{order_id}|{payment_id}"
    
    # Generate expected signature
    expected_signature = hmac.new(
        key_secret.encode('utf-8'),
        msg.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


# ════════════════════════════════════════════════════════════════════
#  Multi-vendor order splitting
# ════════════════════════════════════════════════════════════════════
# When a single checkout contains items from multiple sellers, we keep
# the original `orders` document as the "parent" (customer-facing
# financial record) and create one "child" order per seller. Children
# inherit the customer + payment metadata but carry only that seller's
# line items + a proportional share of logistics/tax. This lets:
#   • each vendor see ONLY their items in /vendor/orders (filter by
#     `seller_id` on child docs — parents are tagged is_parent_order=True
#     and skipped from the vendor view)
#   • Shiprocket gets one shipment per vendor pickup origin (correct
#     real-world behavior)
#   • the customer's orders page shows each shipment as a separate row
#     so they can track each leg independently.
# ════════════════════════════════════════════════════════════════════
async def split_order_into_child_orders(parent_order: dict) -> List[dict]:
    """Group parent_order.items by seller_id and persist one child per
    seller. Returns the list of child docs created (or [] if there's
    only one seller — in which case the parent already does the job).
    Idempotent: calling twice on the same parent is a no-op.
    """
    items = parent_order.get("items") or []
    if not items:
        return []

    # Group by seller_id (treating empty/missing as a single "house" bucket)
    by_seller: dict[str, list] = {}
    for it in items:
        sid = (it.get("seller_id") or "").strip()
        by_seller.setdefault(sid, []).append(it)

    # Single-vendor order → no split needed
    if len(by_seller) <= 1:
        return []

    # Idempotency: if children already exist for this parent, skip
    existing = await db.orders.count_documents({"parent_order_id": parent_order["id"]})
    if existing:
        return []

    parent_subtotal = sum(
        (it.get("quantity", 0) * it.get("price_per_meter", 0)) for it in items
    ) or 1.0  # avoid div-zero
    parent_logistics = float(parent_order.get("logistics_charge", 0) or 0)
    parent_packaging = float(parent_order.get("packaging_charge", 0) or 0)
    parent_tax_rate = 0.05  # 5% GST — same rate as calculate_totals()
    parent_total = float(parent_order.get("total", 0) or 0)
    now = datetime.now(timezone.utc).isoformat()

    child_docs = []
    child_ids = []
    child_numbers = []
    suffix_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for idx, (sid, sub_items) in enumerate(by_seller.items()):
        child_subtotal = sum(it["quantity"] * it["price_per_meter"] for it in sub_items)
        share = child_subtotal / parent_subtotal if parent_subtotal > 0 else 0
        child_logistics = round(parent_logistics * share, 2)
        child_packaging = round(parent_packaging * share, 2)
        child_tax = round(child_subtotal * parent_tax_rate, 2)
        child_total = round(child_subtotal + child_tax + child_logistics + child_packaging, 2)
        child_total_share = round(parent_total * share, 2)  # what they actually paid for this vendor's portion

        suffix = suffix_letters[idx] if idx < len(suffix_letters) else f"{idx + 1}"
        child_id = str(uuid.uuid4())
        child_number = f"{parent_order['order_number']}-{suffix}"
        seller_company = sub_items[0].get("seller_company", "") if sub_items else ""

        child_doc = {
            "id": child_id,
            "order_number": child_number,
            "parent_order_id": parent_order["id"],
            "parent_order_number": parent_order["order_number"],
            "is_parent_order": False,
            "items": sub_items,
            "customer": parent_order.get("customer", {}),
            "seller_id": sid,
            "seller_company": seller_company,
            "subtotal": round(child_subtotal, 2),
            "tax": child_tax,
            "logistics_charge": child_logistics,
            "packaging_charge": child_packaging,
            "total": child_total,
            "total_paid_share": child_total_share,
            "currency": parent_order.get("currency", "INR"),
            "status": parent_order.get("status", "confirmed"),
            "payment_status": parent_order.get("payment_status", "paid"),
            "payment_method": parent_order.get("payment_method", ""),
            "booking_type": parent_order.get("booking_type", "online"),
            "agent_id": parent_order.get("agent_id", ""),
            "agent_email": parent_order.get("agent_email", ""),
            "agent_name": parent_order.get("agent_name", ""),
            # Commission: pro-rata of parent commission for this vendor's share
            "commission_pct": parent_order.get("commission_pct", 0),
            "commission_amount": round(float(parent_order.get("commission_amount", 0) or 0) * share, 2),
            "seller_payout": round(child_subtotal - (float(parent_order.get("commission_amount", 0) or 0) * share), 2),
            # Each child gets its OWN Shiprocket shipment (different pickup origin)
            "shiprocket_order_id": None,
            "shiprocket_shipment_id": None,
            "awb_code": None,
            "courier_name": None,
            "notes": parent_order.get("notes", ""),
            "created_at": now,
            "updated_at": now,
            "paid_at": parent_order.get("paid_at", now),
        }
        child_docs.append(child_doc)
        child_ids.append(child_id)
        child_numbers.append(child_number)

    # Insert children + tag the parent as such
    await db.orders.insert_many(child_docs)
    await db.orders.update_one(
        {"id": parent_order["id"]},
        {"$set": {
            "is_parent_order": True,
            "child_order_ids": child_ids,
            "child_order_numbers": child_numbers,
            "vendor_count": len(child_docs),
            "updated_at": now,
        }},
    )
    logger.info(
        f"[order-split] parent={parent_order['order_number']} → "
        f"{len(child_docs)} children: {', '.join(child_numbers)}"
    )
    return child_docs


@router.get("/payment-status")
async def get_payment_status():
    """Check if payment service is configured (for debugging)"""
    key_id = os.environ.get('RAZORPAY_KEY_ID', '')
    has_secret = bool(os.environ.get('RAZORPAY_KEY_SECRET', ''))
    
    return {
        "razorpay_configured": razorpay_client is not None,
        "key_id_present": bool(key_id),
        "key_id_prefix": key_id[:10] + "..." if len(key_id) > 10 else key_id,
        "secret_present": has_secret
    }

# ==================== ORDER ENDPOINTS ====================

@router.post("/create", response_model=dict)
async def create_order(order_data: OrderCreate):
    """Create a new order and initiate payment (Razorpay or Credit)"""
    if not order_data.items or len(order_data.items) == 0:
        raise HTTPException(status_code=400, detail="No items in order")

    # Customer-initiated samples must be at least 5 m. Agent-assisted
    # carts (where `agent_id` or `shared_cart_token` is set) keep the
    # 1 m floor so the field team can request fabric swatches for
    # client previews.
    is_agent_assisted = bool(order_data.agent_id or order_data.shared_cart_token)
    if not is_agent_assisted:
        for it in order_data.items:
            if (it.order_type or "bulk") == "sample" and (it.quantity or 0) < 5:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sample orders on the website require a minimum of 5 metres. '{it.fabric_name or it.fabric_id}' has {it.quantity}.",
                )
    
    # Calculate totals
    totals = calculate_totals(order_data.items, order_data.logistics_charge, order_data.packaging_charge, order_data.logistics_only_charge)
    discount = order_data.discount or 0
    final_total = max(0, totals["total"] - discount)
    
    # Calculate commission
    from commission_router import calculate_commission
    # Enrich each item with the fabric's pattern + category_name from DB so
    # the category+pattern commission rule can fire even if the cart-side
    # client didn't pass them. We do this for commission calc only — the
    # order document itself uses whatever the buyer submitted.
    items_for_commission = [item.model_dump() for item in order_data.items]
    fabric_ids = list({i.get("fabric_id") for i in items_for_commission if i.get("fabric_id")})
    if fabric_ids:
        fabric_meta = await db.fabrics.find(
            {"id": {"$in": fabric_ids}},
            {"_id": 0, "id": 1, "pattern": 1, "category_id": 1},
        ).to_list(length=len(fabric_ids))
        meta_map = {f["id"]: f for f in fabric_meta}
        cat_ids = list({m.get("category_id") for m in fabric_meta if m.get("category_id")})
        cat_map = {}
        if cat_ids:
            cats = await db.categories.find({"id": {"$in": cat_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(length=len(cat_ids))
            cat_map = {c["id"]: c["name"] for c in cats}
        for item in items_for_commission:
            m = meta_map.get(item.get("fabric_id"), {})
            if not item.get("pattern") and m.get("pattern"):
                item["pattern"] = m["pattern"]
            if not item.get("category_name") and m.get("category_id"):
                item["category_name"] = cat_map.get(m["category_id"], "")
    commission_info = await calculate_commission(
        order_data.model_dump(),
        items_for_commission,
    )
    
    if final_total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")
    
    # Generate order ID and number
    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    now = datetime.now(timezone.utc).isoformat()

    # Credit payment path — wallets are mapped to a business GSTIN, not a
    # personal email. Customer must supply gst_number on the order. We look
    # up exclusively by GST so multiple users from the same brand share a
    # single corporate credit line. Additionally, the buyer's email MUST
    # match the wallet's authorized email — corporate credit lines are
    # bound to the registered buyer.
    credit_charge = 0.0
    credit_period_days = 0
    if order_data.payment_method == "credit":
        gstin = (order_data.customer.gst_number or "").strip().upper()
        if not gstin:
            raise HTTPException(status_code=400, detail="GST number is required for credit payment")
        wallet = await db.credit_wallets.find_one({'gst_number': gstin}, {'_id': 0})
        if not wallet:
            raise HTTPException(status_code=400, detail="No credit line found for this GST")

        # Authorized-buyer check — the email on the order must match the
        # email registered against this GSTIN's credit line.
        wallet_email = (wallet.get('email') or "").strip().lower()
        order_email = (order_data.customer.email or "").strip().lower()
        if wallet_email and order_email != wallet_email:
            raise HTTPException(
                status_code=403,
                detail="This GST's credit line is registered to a different email. Please sign in as the authorized buyer to pay via credit."
            )

        # ── Credit charges: 1.5% per month × (period / 30 days) ──────
        # Surcharge is computed on the pre-credit-charge order total
        # (subtotal + tax + logistics − discount). Cash/Razorpay orders
        # are charge-free; only credit-paid orders attract this fee.
        credit_period_days = int(wallet.get('credit_period_days', 30) or 30)
        months = credit_period_days / 30.0
        credit_charge = round(final_total * 0.015 * months, 2)
        chargeable_total = round(final_total + credit_charge, 2)

        if wallet.get('balance', 0) < chargeable_total:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient credit balance. Required ₹{chargeable_total:,.2f} (incl. ₹{credit_charge:,.2f} credit charges for {credit_period_days} days), available ₹{wallet.get('balance', 0):,.2f}"
            )
        # Override final_total so subsequent code (deduct + transaction
        # log) uses the surcharge-inclusive amount.
        final_total = chargeable_total

        # Deduct from wallet
        new_balance = wallet['balance'] - final_total
        await db.credit_wallets.update_one(
            {'gst_number': gstin},
            {'$set': {'balance': new_balance, 'updated_at': now}}
        )

        # Log transaction (keyed on GST; email kept for trace only)
        await db.credit_transactions.insert_one({
            'id': str(uuid.uuid4()),
            'gst_number': gstin,
            'email': order_data.customer.email,
            'order_id': order_id,
            'order_number': order_number,
            'type': 'debit',
            'amount': final_total,
            'credit_charge': credit_charge,
            'credit_period_days': credit_period_days,
            'balance_after': new_balance,
            'created_at': now
        })
        
        # Create order as paid
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [item.model_dump() for item in order_data.items],
            "customer": order_data.customer.model_dump(),
            "ship_to": order_data.ship_to.model_dump() if order_data.ship_to else None,
            "subtotal": totals["subtotal"],
            "tax": totals["tax"],
            "logistics_charge": totals["logistics_charge"],
            "packaging_charge": totals["packaging_charge"],
            "logistics_only_charge": totals["logistics_only_charge"],
            "taxable_value": totals["taxable_value"],
            "tax_on_charges_v2": True,
            "discount": discount,
            "coupon": order_data.coupon.model_dump() if order_data.coupon else None,
            "total": final_total,
            "credit_charge": credit_charge,
            "credit_period_days": credit_period_days,
            "currency": "INR",
            "status": "confirmed",
            "payment_status": "paid",
            "payment_method": "credit",
            "booking_type": "assisted_online" if order_data.agent_id else "online",
            "agent_id": order_data.agent_id,
            "agent_email": order_data.agent_email,
            "agent_name": order_data.agent_name,
            "commission_pct": commission_info["commission_pct"],
            "commission_amount": commission_info["commission_amount"],
            "commission_rule": commission_info["rule_applied"],
            "seller_payout": round(totals["subtotal"] - commission_info["commission_amount"], 2),
            "razorpay_order_id": "",
            "razorpay_payment_id": "",
            "razorpay_signature": "",
            "awb_code": None,
            "notes": order_data.notes,
            "created_at": now,
            "updated_at": now,
            "paid_at": now
        }
        await db.orders.insert_one(order_doc)
        
        # Mark shared cart as completed if this was an assisted booking
        if order_data.shared_cart_token:
            await db.shared_carts.update_one(
                {'token': order_data.shared_cart_token},
                {'$set': {'status': 'completed', 'order_id': order_id, 'updated_at': now}}
            )
        
        # Multi-vendor split: if items are from multiple sellers, create one
        # child order per seller for vendor-side visibility, Shiprocket
        # shipments, and customer tracking.
        child_orders = []
        try:
            child_orders = await split_order_into_child_orders(order_doc)
        except Exception as e:
            logger.warning(f"Failed to split multi-vendor order {order_number}: {e}")

        # Materialize vendor payouts (one per seller in the order)
        try:
            from payouts_router import materialize_payouts_for_order
            # When split, payouts attach to the child orders; otherwise to parent
            for o in (child_orders or [order_doc]):
                await materialize_payouts_for_order(o)
        except Exception as e:
            logger.warning(f"Failed to materialize payouts for {order_number}: {e}")

        # Send confirmation emails
        try:
            await send_order_notification_emails(db, order_doc)
        except Exception as e:
            logger.warning(f"Failed to send order emails: {e}")

        # Fire Shiprocket pushes — one per child (or per parent if no split)
        targets = child_orders or [order_doc]
        for tgt in targets:
            asyncio.create_task(_push_to_shiprocket_safe(tgt))
        
        return {
            "order_id": order_id,
            "order_number": order_number,
            "payment_method": "credit",
            "amount": final_total,
            "currency": "INR",
            "status": "confirmed",
            "customer": order_data.customer.model_dump(),
            "child_orders": [
                {"id": c["id"], "order_number": c["order_number"], "seller_id": c["seller_id"], "seller_company": c.get("seller_company", ""), "total": c["total"]}
                for c in child_orders
            ],
        }
    
    # Razorpay payment path
    if not razorpay_client:
        logger.error("Razorpay client not initialized")
        raise HTTPException(status_code=503, detail="Payment service not configured. Please contact support.")

    # Provisional bulk-order: now driven by the AGENT'S choice (per-item
    # qty_type="provisional") rather than blanket "all bulk = provisional".
    # An order is provisional iff ANY item carries qty_type="provisional".
    # The `is_provisional` flag on the request acts as a hard-override
    # (e.g. for legacy callers / Bangladesh PI flow).
    from provisional_orders import resolve_advance_pct, split_amounts
    items_raw = [i.model_dump() for i in order_data.items]
    has_provisional_item = any(
        ((it.get("qty_type") or "").lower() == "provisional")
        and ((it.get("order_type") or "bulk") == "bulk")
        for it in items_raw
    )
    use_provisional = order_data.is_provisional or has_provisional_item
    if use_provisional:
        advance_pct = resolve_advance_pct(order_data.advance_pct)
        advance_amount, balance_amount = split_amounts(final_total, advance_pct)
        rzp_amount_paise = int(round(advance_amount * 100))
    else:
        advance_pct = 100.0
        advance_amount = final_total
        balance_amount = 0.0
        rzp_amount_paise = int(round(final_total * 100))

    # Create Razorpay order (for the ADVANCE amount on provisional orders)
    try:
        razorpay_order = razorpay_client.order.create({
            "amount": rzp_amount_paise,
            "currency": "INR",
            "receipt": order_number,
            "notes": {
                "order_id": order_id,
                "customer_email": order_data.customer.email,
                "customer_name": order_data.customer.name,
                "payment_stage": "advance" if use_provisional else "full",
            }
        })
    except Exception as e:
        logger.error(f"Failed to create Razorpay order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment initialization failed: {str(e)}")
    
    # Create order document
    now = datetime.now(timezone.utc).isoformat()
    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "items": [item.model_dump() for item in order_data.items],
        "customer": order_data.customer.model_dump(),
        "ship_to": order_data.ship_to.model_dump() if order_data.ship_to else None,
        "subtotal": totals["subtotal"],
        "tax": totals["tax"],
        "logistics_charge": totals["logistics_charge"],
        "packaging_charge": totals["packaging_charge"],
        "logistics_only_charge": totals["logistics_only_charge"],
        "taxable_value": totals["taxable_value"],
        "tax_on_charges_v2": True,
        "discount": discount,
        "coupon": order_data.coupon.model_dump() if order_data.coupon else None,
        "total": final_total,
        "currency": "INR",
        "status": "payment_pending",
        # On provisional orders payment moves: pending_advance → advance_paid
        # → balance_pending → paid. Legacy single-stage flow stays on the
        # original `initiated → paid` cycle.
        "payment_status": "pending_advance" if use_provisional else "initiated",
        "is_provisional": use_provisional,
        "advance_pct": advance_pct,
        "advance_amount": advance_amount,
        "balance_amount": balance_amount,
        "advance_paid_at": "",
        "balance_paid_at": "",
        "goods_ready_at": "",
        "payment_method": "razorpay",
        "booking_type": "assisted_online" if order_data.agent_id else "online",
        "agent_id": order_data.agent_id,
        "agent_email": order_data.agent_email,
        "agent_name": order_data.agent_name,
        "commission_pct": commission_info["commission_pct"],
        "commission_amount": commission_info["commission_amount"],
        "commission_rule": commission_info["rule_applied"],
        "seller_payout": round(totals["subtotal"] - commission_info["commission_amount"], 2),
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_payment_id": "",
        "razorpay_signature": "",
        "awb_code": None,
        "notes": order_data.notes,
        "created_at": now,
        "updated_at": now,
        "paid_at": ""
    }
    
    await db.orders.insert_one(order_doc)
    
    # Mark shared cart as completed if this was an assisted booking
    if order_data.shared_cart_token:
        await db.shared_carts.update_one(
            {'token': order_data.shared_cart_token},
            {'$set': {'status': 'completed', 'order_id': order_id, 'updated_at': now}}
        )
    
    # Return order details with Razorpay info for frontend
    return {
        "order_id": order_id,
        "order_number": order_number,
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_key_id": os.environ.get('RAZORPAY_KEY_ID'),
        # `amount` is what the customer pays NOW (advance on provisional,
        # full on non-provisional). `total` / `balance_amount` describe
        # the full obligation so the frontend can render "₹X now · ₹Y later".
        "amount": advance_amount if use_provisional else final_total,
        "amount_paise": rzp_amount_paise,
        "total": final_total,
        "is_provisional": use_provisional,
        "advance_pct": advance_pct,
        "advance_amount": advance_amount,
        "balance_amount": balance_amount,
        "currency": "INR",
        "customer": order_data.customer.model_dump()
    }

@router.post("/{order_id}/retry-payment")
async def retry_payment(order_id: str, request: Request):
    """Create a fresh Razorpay order for an existing 'initiated' order.

    Used by the mobile/desktop "Pay" button on `Awaiting payment` orders
    so customers can complete payment after closing the original modal.
    Refuses if the order is already paid or cancelled.
    """
    # Reuse customer_router's auth helper. Returns the customer dict
    # or raises HTTPException — same envelope used by every other
    # customer-side endpoint, so the JWT/cookie contract is identical.
    from customer_router import get_current_customer as _get_current_customer
    customer = _get_current_customer(request)
    order = await db.orders.find_one({"id": order_id, "customer.email": customer["email"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order has been cancelled — cannot re-pay. Please place a new order.")
    if order.get("payment_method") == "credit":
        raise HTTPException(status_code=400, detail="Credit orders cannot be retried via Razorpay.")

    total_paise = int(round(float(order.get("total", 0)) * 100))
    if total_paise <= 0:
        raise HTTPException(status_code=400, detail="Order total is invalid.")

    try:
        rzp = razorpay_client.order.create({
            "amount": total_paise,
            "currency": "INR",
            "receipt": order.get("order_number") or order_id[:36],
            "notes": {"order_id": order_id, "retry": "true"},
        })
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "razorpay_order_id": rzp["id"],
            "payment_status": "initiated",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {
        "razorpay_order_id": rzp["id"],
        "amount": rzp["amount"],
        "currency": rzp["currency"],
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
    }


@router.post("/verify-payment")
async def verify_payment(verification: PaymentVerification):
    """Verify Razorpay payment and update order status"""
    # Find order by Razorpay order ID
    order = await db.orders.find_one(
        {"razorpay_order_id": verification.razorpay_order_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verify signature
    is_valid = verify_razorpay_signature(
        verification.razorpay_order_id,
        verification.razorpay_payment_id,
        verification.razorpay_signature
    )
    
    if not is_valid:
        # Update order as failed
        await db.orders.update_one(
            {"razorpay_order_id": verification.razorpay_order_id},
            {"$set": {
                "payment_status": "failed",
                "status": "payment_failed",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        raise HTTPException(status_code=400, detail="Payment verification failed")
    
    # Update order as paid. For provisional orders this is the ADVANCE
    # leg (advance_paid → wait for goods-ready). The balance leg comes
    # in through `/orders/{id}/balance-paid` once supplier reports actual
    # quantity. Non-provisional orders move straight to paid + confirmed.
    now = datetime.now(timezone.utc).isoformat()
    is_provisional = bool(order.get("is_provisional"))
    payment_stage = "advance" if is_provisional else "full"
    if is_provisional and order.get("payment_status") == "balance_pending":
        # This payment is for the BALANCE leg (re-payment endpoint flips
        # razorpay_order_id but keeps `payment_status: balance_pending`).
        payment_stage = "balance"

    update_doc = {
        "razorpay_payment_id": verification.razorpay_payment_id,
        "razorpay_signature": verification.razorpay_signature,
        "updated_at": now,
    }
    if payment_stage == "advance":
        update_doc["payment_status"] = "advance_paid"
        update_doc["status"] = "provisional"
        update_doc["advance_paid_at"] = now
        # Provisional advance triggers vendor 24h Accept/Cancel window.
        # Each item's seller must accept; until then `vendor_acceptance_status`
        # is `pending`. Auto-cancel sweep enforces SLA.
        update_doc["vendor_acceptance_status"] = "pending"
        update_doc["vendor_action_deadline"] = (
            datetime.now(timezone.utc) + timedelta(hours=24)
        ).isoformat()
    else:
        update_doc["payment_status"] = "paid"
        update_doc["status"] = "confirmed"
        update_doc["paid_at"] = now
        if payment_stage == "balance":
            update_doc["balance_paid_at"] = now
        # Non-provisional or balance payment — also opens vendor SLA
        # window if first payment, but only when fresh order (not balance).
        if payment_stage == "full":
            update_doc["vendor_acceptance_status"] = "pending"
            update_doc["vendor_action_deadline"] = (
                datetime.now(timezone.utc) + timedelta(hours=24)
            ).isoformat()

    await db.orders.update_one(
        {"razorpay_order_id": verification.razorpay_order_id},
        {"$set": update_doc},
    )
    # Refresh the in-memory order doc with the values we just persisted
    # so downstream branches (inventory, payouts, Shiprocket) read the
    # right state.
    order.update(update_doc)
    
    # Deduct inventory + push to Shiprocket only when the order is FULLY
    # paid. On the advance leg of a provisional order, we just confirm
    # the booking and wait for the supplier to mark goods-ready (which
    # then unlocks the balance invoice).
    fully_paid = payment_stage != "advance"

    if fully_paid:
        # Deduct inventory (best effort)
        try:
            for item in order["items"]:
                await db.fabrics.update_one(
                    {"id": item["fabric_id"], "quantity_available": {"$gte": item["quantity"]}},
                    {"$inc": {"quantity_available": -item["quantity"]}}
                )
        except Exception as e:
            logger.error(f"Failed to update inventory: {str(e)}")

    # Auto-record into credit_payments ledger (best-effort, non-blocking)
    if fully_paid:
        try:
            import credit_ledger_router as _clr
            await _clr.record_razorpay_payment(order, verification.razorpay_payment_id)
        except Exception as _e:
            logger.warning(f"credit_ledger auto-record skipped: {_e}")

    # Create Shiprocket shipment (best effort, non-blocking) — only on full pay
    child_orders = []
    if fully_paid:
        try:
            child_orders = await split_order_into_child_orders(order)
        except Exception as e:
            logger.warning(f"Failed to split multi-vendor order {order.get('order_number')}: {e}")

    # Fire Shiprocket pushes — one per child (or parent if no split).
    # Skipped on advance leg (provisional booking) — we push after the
    # supplier marks goods-ready AND balance is paid.
    if fully_paid:
        shiprocket_targets = child_orders or [order]
        parent_shipments: list = []  # collected so the parent's
                                     # `shiprocket_shipments[]` stays in
                                     # sync with each child push — this
                                     # prevents a second admin click on
                                     # the parent from re-pushing and
                                     # creating duplicate SR# on Shiprocket.
        for tgt in shiprocket_targets:
            try:
                shiprocket_result = await create_shiprocket_shipment(tgt)
                if shiprocket_result.get("success"):
                    sr_order_id = str(shiprocket_result.get("order_id") or shiprocket_result.get("shiprocket_order_id") or "")
                    sr_ship_id = shiprocket_result.get("shipment_id")
                    await db.orders.update_one(
                        {"id": tgt["id"]},
                        {"$set": {
                            "shiprocket_order_id": sr_order_id,
                            "shiprocket_shipment_id": sr_ship_id,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    logger.info(f"Shiprocket shipment created for {tgt['order_number']}")
                    if child_orders:  # mirror onto parent.shiprocket_shipments
                        parent_shipments.append({
                            "seller_id": tgt.get("seller_id", ""),
                            "seller_company": tgt.get("seller_company", ""),
                            "items_count": len(tgt.get("items") or []),
                            "success": True,
                            "order_id": sr_order_id,
                            "shipment_id": sr_ship_id,
                            "awb_code": shiprocket_result.get("awb_code", ""),
                            "courier_name": shiprocket_result.get("courier_name", ""),
                            "child_order_id": tgt.get("id"),
                            "child_order_number": tgt.get("order_number"),
                            "pushed_at": datetime.now(timezone.utc).isoformat(),
                        })
                    try:
                        from internal_events import fire_internal_event as _fire, OrderEvent as _OE
                        await _fire(_OE.ORDER_DISPATCHED, tgt, extra={
                            "shiprocket_order_id": sr_order_id,
                            "shipment_id": sr_ship_id,
                            "awb_code": shiprocket_result.get("awb_code", ""),
                        })
                    except Exception:
                        pass
                elif child_orders:
                    # Capture the failure so the admin can see WHY and
                    # decide to re-push that supplier from the picker.
                    parent_shipments.append({
                        "seller_id": tgt.get("seller_id", ""),
                        "seller_company": tgt.get("seller_company", ""),
                        "items_count": len(tgt.get("items") or []),
                        "success": False,
                        "error": shiprocket_result.get("error") or shiprocket_result.get("message") or "Shiprocket push failed",
                        "child_order_id": tgt.get("id"),
                        "child_order_number": tgt.get("order_number"),
                        "pushed_at": datetime.now(timezone.utc).isoformat(),
                    })
            except Exception as e:
                logger.error(f"Failed to create Shiprocket shipment for {tgt.get('order_number')}: {str(e)}")
                if child_orders:
                    parent_shipments.append({
                        "seller_id": tgt.get("seller_id", ""),
                        "seller_company": tgt.get("seller_company", ""),
                        "items_count": len(tgt.get("items") or []),
                        "success": False,
                        "error": str(e),
                        "child_order_id": tgt.get("id"),
                        "child_order_number": tgt.get("order_number"),
                        "pushed_at": datetime.now(timezone.utc).isoformat(),
                    })

        # Persist the aggregated map on the parent so subsequent admin
        # actions are idempotent (admin_push_to_shiprocket short-circuits
        # when shiprocket_shipments is populated).
        if child_orders and parent_shipments:
            first_ok = next((s for s in parent_shipments if s.get("success")), parent_shipments[0])
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {
                    "shiprocket_shipments": parent_shipments,
                    "shiprocket_pushed": True,
                    "shiprocket_pushed_at": datetime.now(timezone.utc).isoformat(),
                    "shiprocket_order_id": first_ok.get("order_id") or None,
                    "shiprocket_shipment_id": first_ok.get("shipment_id"),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }}
            )

    # Materialize vendor payouts — also wait until full payment so the
    # payout reflects the actual quantity (not the booked quantity).
    if fully_paid:
        try:
            from payouts_router import materialize_payouts_for_order
            for tgt in (child_orders or [order]):
                await materialize_payouts_for_order(tgt)
        except Exception as e:
            logger.warning(f"Failed to materialize payouts for {order.get('order_number')}: {e}")
    
    # Get updated order
    updated_order = await db.orders.find_one(
        {"razorpay_order_id": verification.razorpay_order_id},
        {"_id": 0}
    )
    
    # Auto-send notification emails (best effort, non-blocking)
    try:
        email_results = await send_order_notification_emails(updated_order, order_db=db)
        logger.info(f"Order {order['order_number']} email notifications: {email_results}")
    except Exception as e:
        logger.error(f"Failed to send order notification emails: {str(e)}")

    # ── Internal mail chain (separate from customer emails) ─────────
    try:
        from internal_events import fire_internal_event, OrderEvent
        if payment_stage == "advance":
            await fire_internal_event(OrderEvent.ADVANCE_PAID, updated_order, extra={
                "advance_amount": updated_order.get("advance_amount"),
                "balance_amount": updated_order.get("balance_amount"),
                "vendor_action_deadline": updated_order.get("vendor_action_deadline"),
            })
            await fire_internal_event(OrderEvent.ORDER_PLACED, updated_order)
        elif payment_stage == "balance":
            await fire_internal_event(OrderEvent.ORDER_CONFIRMED, updated_order, extra={
                "balance_amount": updated_order.get("balance_amount"),
            })
            await fire_internal_event(OrderEvent.PAYMENT_CAPTURED, updated_order)
        else:
            await fire_internal_event(OrderEvent.PAYMENT_CAPTURED, updated_order)
            await fire_internal_event(OrderEvent.ORDER_CONFIRMED, updated_order)
    except Exception as e:
        logger.warning(f"Internal event email failed: {e}")
    
    # Note: Orders are NOT sent to Zapier - only general enquiries are
    
    return {
        "success": True,
        "message": "Payment verified successfully",
        "order": updated_order,
        "child_orders": [
            {"id": c["id"], "order_number": c["order_number"], "seller_id": c.get("seller_id", ""), "seller_company": c.get("seller_company", ""), "total": c["total"]}
            for c in child_orders
        ],
    }


async def _push_to_shiprocket_safe(order: dict) -> None:
    """Fire-and-forget Shiprocket push that persists the returned SR ids
    back onto the order doc. Used by the auto-create path after order
    creation; errors are logged but never raised so the order flow
    completes regardless of Shiprocket availability.

    Multi-supplier orders create one Shiprocket shipment per seller.
    """
    try:
        multi = await create_shiprocket_shipments_multi(order)
        if not multi.get("success"):
            logger.warning(f"[shiprocket-auto] {order.get('order_number')} failed: {multi.get('error')}")
            return
        shipments = multi["shipments"]
        first_ok = next((s for s in shipments if s["success"]), shipments[0])
        update = {
            "shiprocket_shipments": shipments,
            "shiprocket_pushed": True,
            "shiprocket_pushed_at": datetime.now(timezone.utc).isoformat(),
            "shiprocket_order_id": first_ok.get("order_id") or None,
            "shiprocket_shipment_id": first_ok.get("shipment_id"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if first_ok.get("awb_code"):
            update["awb_code"] = first_ok["awb_code"]
        if first_ok.get("courier_name"):
            update["courier_name"] = first_ok["courier_name"]
        await db.orders.update_one({"id": order["id"]}, {"$set": update})
        logger.info(
            f"[shiprocket-auto] {order.get('order_number')} pushed · "
            f"shipments={multi['count']} ok={sum(1 for s in shipments if s['success'])}"
        )
    except Exception as e:
        logger.warning(f"[shiprocket-auto] {order.get('order_number')} exception: {e}")


async def _ensure_vendor_pickup_nickname(seller: dict) -> str:
    """Returns the Shiprocket pickup nickname for a vendor. If the seller
    doesn't have one stored, auto-registers a new pickup location in
    Shiprocket using their address fields, persists the nickname, and
    returns it. Falls back to "Primary" (the legacy Locofast warehouse)
    if registration fails or address fields are missing.

    Idempotent — safe to call before every shipment push.
    """
    nickname = (seller or {}).get("shiprocket_pickup_nickname", "").strip()
    if nickname:
        return nickname

    # Need at minimum a name + address + city + state + pincode to register
    sname = (seller.get("company_name") or seller.get("name") or "").strip()
    addr = (seller.get("pickup_address") or "").strip()
    city = (seller.get("pickup_city") or seller.get("city") or "").strip()
    state = (seller.get("pickup_state") or seller.get("state") or "").strip()
    pin = (seller.get("pickup_pincode") or "").strip()
    contact = (seller.get("pickup_contact_name") or seller.get("name") or "").strip()
    phone = (seller.get("pickup_contact_phone") or seller.get("contact_phone") or "").strip()
    email = (seller.get("contact_email") or "").strip()

    if not (sname and addr and city and state and pin):
        logger.warning(
            f"[shiprocket-pickup] vendor {seller.get('id')} missing pickup address fields — falling back to 'Primary'"
        )
        return "Primary"

    # Shiprocket nicknames must be unique account-wide. Derive a stable
    # one from the seller_code (or first 8 chars of id) so re-runs hit the
    # same nickname idempotently.
    base = (seller.get("seller_code") or seller.get("id") or "VND")[:24]
    candidate_nickname = f"VND-{base}".replace(" ", "")[:36]

    try:
        import httpx
        from shiprocket.services.auth import auth_service
        from shiprocket.services.pickup import PickupService
        from shiprocket.schemas.pickup import AddPickupLocationRequest

        req = AddPickupLocationRequest(
            pickup_location=candidate_nickname,
            name=contact or sname,
            email=email or "noreply@locofast.com",
            phone=phone or "0000000000",
            address=addr,
            city=city,
            state=state,
            country="India",
            pin_code=pin,
        )
        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            svc = PickupService(client, headers)
            result = await svc.add_pickup_location(req)
        # Shiprocket returns either {success:true} on fresh add or an error
        # if nickname is already taken — both are fine for our flow.
        logger.info(f"[shiprocket-pickup] registered '{candidate_nickname}' for vendor {seller.get('id')}: {result}")
    except Exception as e:
        # Most common error here is "Nickname already exists" — that's
        # OK, we just want to use the nickname going forward.
        logger.info(f"[shiprocket-pickup] add_pickup_location skipped for {candidate_nickname}: {e}")

    # Persist the nickname so subsequent shipments skip the register step.
    try:
        await db.sellers.update_one(
            {"id": seller.get("id")},
            {"$set": {"shiprocket_pickup_nickname": candidate_nickname}},
        )
    except Exception as e:
        logger.warning(f"[shiprocket-pickup] persist nickname failed: {e}")

    return candidate_nickname


async def _register_order_pickup_override(order: dict, override: dict) -> str:
    """Register a one-off Shiprocket pickup location keyed to the order
    number. Returns the SR nickname to use for the shipment push.

    Falls back to "Primary" if registration fails so the shipment can
    still go through (Locofast warehouse).
    """
    order_num = (order.get("order_number") or order.get("id") or "")[:24]
    base = "".join(ch for ch in order_num if ch.isalnum() or ch in "-_")[:24] or "ORDER"
    nickname = f"ORD-{base}"[:36]

    addr = (override.get("address") or "").strip()
    city = (override.get("city") or "").strip()
    state = (override.get("state") or "").strip()
    pin = (override.get("pincode") or "").strip()
    name = (override.get("name") or override.get("company") or "Pickup").strip()
    phone = (override.get("phone") or "0000000000").strip()
    email = (override.get("email") or "noreply@locofast.com").strip()

    if not (addr and city and state and pin):
        logger.warning(
            f"[shiprocket-pickup-override] {order.get('order_number')} override missing required fields — falling back to Primary"
        )
        return "Primary"

    try:
        import httpx
        from shiprocket.services.auth import auth_service
        from shiprocket.services.pickup import PickupService
        from shiprocket.schemas.pickup import AddPickupLocationRequest

        req = AddPickupLocationRequest(
            pickup_location=nickname,
            name=name,
            email=email,
            phone=phone,
            address=addr,
            city=city,
            state=state,
            country="India",
            pin_code=pin,
        )
        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            svc = PickupService(client, headers)
            await svc.add_pickup_location(req)
        logger.info(
            f"[shiprocket-pickup-override] registered '{nickname}' for {order.get('order_number')}"
        )
    except Exception as e:
        # "Nickname already exists" is a benign re-run — keep going.
        logger.info(
            f"[shiprocket-pickup-override] add_pickup_location skipped for {nickname}: {e}"
        )
    return nickname


async def _cancel_shiprocket_order_safe(sr_order_id: str) -> dict:
    """Cancel an existing Shiprocket order. Best-effort; returns
    {success, error?} but never raises so the caller can proceed even if
    cancellation fails."""
    try:
        import httpx
        from shiprocket.services.auth import auth_service
        from shiprocket.services.orders import OrderService
        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            svc = OrderService(client, headers)
            result = await svc.cancel_order([int(sr_order_id)])
        return {"success": True, "result": result}
    except Exception as e:
        logger.warning(f"[shiprocket-cancel] failed for {sr_order_id}: {e}")
        return {"success": False, "error": str(e)}


async def create_shiprocket_shipment(order: dict, items_override: Optional[List[dict]] = None, seller_override: Optional[str] = None, order_id_suffix: str = "") -> dict:
    """Create a shipment in Shiprocket after payment is confirmed.

    Routing rule (per business spec):
      • Bulk order (all items have order_type == "production")
            → push to Shiprocket Cargo (B2B / LTL freight).
      • Sample or mixed order
            → push to Shiprocket Courier (B2C / standard parcels) — existing flow.

    Cargo and Courier responses are normalized into the same envelope
    on the order doc so downstream UI/PDF/payouts code doesn't care
    which vertical handled the shipment.

    Multi-supplier support:
      • Pass `items_override` to push only a subset of the order's items
        (used when splitting one order into N shipments — one per seller).
      • Pass `seller_override` to lock the pickup-address resolution to
        a specific seller_id (even if the order doc has another at the
        top level).
      • Pass `order_id_suffix` to append a short tag to the SR order_id
        (e.g. `-A`, `-B`) so each split shipment has a unique reference
        Shiprocket-side.
    """
    try:
        # ── Use override items if provided (multi-supplier split path) ──
        if items_override is not None:
            items_for_routing = items_override
        else:
            items_for_routing = order.get("items", []) or []
        is_bulk = bool(items_for_routing) and all(
            (it.get("order_type") or "").lower() == "production" for it in items_for_routing
        )

        if is_bulk:
            try:
                from shiprocket.cargo_service import is_enabled as cargo_enabled, create_cargo_shipment
                if cargo_enabled():
                    logger.info(f"[shiprocket-route] {order.get('order_number')} → CARGO (B2B/LTL)")
                    cargo = await create_cargo_shipment(order, db)
                    # Persist the cargo response onto the order doc so we
                    # don't lose it if the caller forgets to.
                    await db.orders.update_one(
                        {"id": order["id"]},
                        {"$set": {
                            "shiprocket_vertical": "cargo",
                            "shiprocket_pushed": True,
                            "shiprocket_pushed_at": datetime.now(timezone.utc).isoformat(),
                            "shiprocket_shipment_id": cargo.get("shipment_id"),
                            "shiprocket_order_id": cargo.get("order_id"),
                            "shiprocket_waybill_no": cargo.get("waybill_no"),
                            "shiprocket_lrn": cargo.get("lrn"),
                            "shiprocket_label_url": cargo.get("label_url"),
                            "shiprocket_courier_name": cargo.get("delivery_partner_name", "Cargo"),
                            "shiprocket_meta": {
                                "transporter_id": cargo.get("transporter_id"),
                                "mode": cargo.get("mode"),
                            },
                        }},
                    )
                    return {"success": True, "vertical": "cargo", **cargo}
                else:
                    logger.warning(
                        f"[shiprocket-route] {order.get('order_number')} is BULK but Cargo is not enabled — "
                        f"falling back to Courier"
                    )
            except Exception as cargo_err:
                logger.error(f"[shiprocket-route] Cargo push failed for {order.get('order_number')}: {cargo_err} — falling back to Courier")

        # ── Courier (B2C) path ── (default / fallback)
        logger.info(f"[shiprocket-route] {order.get('order_number')} → COURIER (B2C)")
        import httpx
        from shiprocket.services.auth import auth_service
        from shiprocket.services.orders import OrderService
        from shiprocket.schemas.orders import CreateOrderRequest, OrderItemSchema

        customer = order.get("customer", {})
        items = items_override if items_override is not None else order.get("items", [])
        ship_to = order.get("ship_to") or {}

        if not customer or not items:
            return {"success": False, "error": "Missing customer or items"}

        # ── Resolve vendor pickup (Ship-From) ──
        # Resolution order:
        #   0. seller_override (multi-supplier split path) — highest priority
        #   1. order.pickup_address_id  →  pick from seller's saved addresses
        #   2. seller's PRIMARY pickup address
        #   3. legacy `_ensure_vendor_pickup_nickname` fallback
        # Free-form pickup overrides are NO LONGER supported — admins
        # must define addresses on the seller first.
        seller_id_from_items = ""
        for it in items:
            if (it.get("seller_id") or "").strip():
                seller_id_from_items = it["seller_id"].strip()
                break
        seller_id = (seller_override or order.get("seller_id") or seller_id_from_items or "").strip()
        seller_doc = await db.sellers.find_one({"id": seller_id}, {"_id": 0}) if seller_id else None
        pickup_nickname = None
        if seller_doc:
            sel_addresses = seller_doc.get("pickup_addresses", []) or []
            chosen = None
            order_addr_id = order.get("pickup_address_id")
            # Fabric-level pickup: if every item in the order shares the same
            # fabric.pickup_address_id, honor it. Inventory is defined at the
            # supplier pickup-location level (one SKU = one location).
            if not order_addr_id and items:
                fabric_ids = [it.get("fabric_id") for it in items if it.get("fabric_id")]
                if fabric_ids:
                    pickup_ids_seen = set()
                    async for f in db.fabrics.find(
                        {"id": {"$in": fabric_ids}},
                        {"_id": 0, "pickup_address_id": 1},
                    ):
                        pickup_ids_seen.add((f.get("pickup_address_id") or "").strip())
                    pickup_ids_seen.discard("")
                    if len(pickup_ids_seen) == 1:
                        order_addr_id = pickup_ids_seen.pop()
            if order_addr_id:
                chosen = next((a for a in sel_addresses if a.get("id") == order_addr_id), None)
            if not chosen:
                chosen = next((a for a in sel_addresses if a.get("is_primary")), None) or (sel_addresses[0] if sel_addresses else None)
            if chosen and chosen.get("shiprocket_nickname"):
                pickup_nickname = chosen["shiprocket_nickname"]
        if not pickup_nickname:
            pickup_nickname = await _ensure_vendor_pickup_nickname(seller_doc or {})

        # ── Validate pickup nickname against Shiprocket's actual list ──
        # SR happily returns 200 with `order_id: null` when the nickname doesn't
        # match any registered pickup location (case-sensitive, whitespace
        # sensitive). Pre-flight the call so admins get a precise error
        # ("you sent X, here are the N options actually registered") instead
        # of the cryptic "SR# null" loop.
        try:
            from shiprocket.services.pickup import PickupService  # type: ignore
            headers_for_list = await auth_service.get_auth_headers_async()
            async with httpx.AsyncClient(timeout=20) as client:
                pl_service = PickupService(client, headers_for_list)
                pl_response = await pl_service.get_pickup_locations()
            sr_addrs = (pl_response or {}).get("data", {}).get("shipping_address", []) or []
            sr_nicknames = [str(a.get("pickup_location") or "").strip() for a in sr_addrs]
            sr_nicknames_norm = {n.lower(): n for n in sr_nicknames if n}
            sent_norm = (pickup_nickname or "").strip().lower()
            if sr_nicknames_norm and sent_norm not in sr_nicknames_norm:
                # See if a near-match exists (case/whitespace insensitive)
                close = next((n for k, n in sr_nicknames_norm.items() if k.replace(" ", "") == sent_norm.replace(" ", "")), None)
                hint = (
                    f"\n→ Closest registered match in Shiprocket: '{close}'. Use exactly this string on the seller's pickup_addresses[].shiprocket_nickname."
                    if close else
                    f"\n→ Available nicknames in your Shiprocket account ({len(sr_nicknames)}): {', '.join(sr_nicknames[:8])}{('...' if len(sr_nicknames) > 8 else '')}"
                )
                err = (
                    f"Pickup nickname '{pickup_nickname}' is NOT registered in Shiprocket for "
                    f"seller_id={seller_id or '(none)'}. Shiprocket nicknames are case + whitespace sensitive.{hint}"
                )
                logger.error(f"[shiprocket] pickup mismatch for {order.get('order_number')}: sent='{pickup_nickname}' available={sr_nicknames[:10]}")
                return {"success": False, "error": err, "available_pickup_nicknames": sr_nicknames}
            # Use the SR-side casing if there's a case-only diff
            if sent_norm in sr_nicknames_norm and sr_nicknames_norm[sent_norm] != pickup_nickname:
                logger.info(f"[shiprocket] using SR-side cased nickname '{sr_nicknames_norm[sent_norm]}' (was '{pickup_nickname}')")
                pickup_nickname = sr_nicknames_norm[sent_norm]
        except Exception as e:
            # If the pre-flight fails for any reason (network, auth), don't
            # block the push — fall through and let SR itself handle it.
            logger.warning(f"[shiprocket] pickup list pre-flight failed (non-fatal): {e}")

        # ── Resolve shipping address (Ship-To) ──
        # Use the explicit ship_to when present, else fall back to billing.
        ship_name = ship_to.get("name") or customer.get("name", "") or "Customer"
        ship_phone = ship_to.get("phone") or customer.get("phone", "") or "0000000000"
        ship_addr = ship_to.get("address") or customer.get("address", "") or "Address line"
        ship_city = ship_to.get("city") or customer.get("city", "") or "City"
        ship_state = ship_to.get("state") or customer.get("state", "") or "State"
        ship_pin = (ship_to.get("pincode") or customer.get("pincode") or "000000")[:6]

        # Prepare order items for Shiprocket
        sr_items = []
        total_quantity = 0
        for item in items:
            sr_items.append(OrderItemSchema(
                name=item.get("fabric_name", "Fabric"),
                sku=(item.get("fabric_code") or item.get("fabric_id", ""))[:64] or "FABRIC",
                units=1,
                selling_price=float(item.get("price_per_meter", 0)) * float(item.get("quantity", 1)),
                hsn_code="5407",
            ))
            total_quantity += item.get("quantity", 1)

        # Calculate weight (0.3 kg per meter, min 0.5 kg)
        weight_kg = max(0.5, total_quantity * 0.3)

        # Per-split subtotal — when this shipment is one supplier's slice
        # of a multi-supplier order, the value Shiprocket charges insurance
        # against should be that supplier's slice, not the full order.
        per_shipment_subtotal = sum(
            float(it.get("price_per_meter", 0)) * float(it.get("quantity", 1))
            for it in items
        )

        # Append the suffix to order_id so each split shipment is a unique
        # reference in Shiprocket (e.g. LF/ORD/057-A, -B). When pushing the
        # whole order as a single shipment the suffix is "".
        sr_order_ref = order.get("order_number", order.get("id"))
        if order_id_suffix:
            sr_order_ref = f"{sr_order_ref}-{order_id_suffix}"

        req = CreateOrderRequest(
            order_id=sr_order_ref,
            order_date=datetime.now(timezone.utc),
            pickup_location=pickup_nickname,
            billing_customer_name=customer.get("name", "") or "Customer",
            billing_email=customer.get("email", ""),
            billing_phone=customer.get("phone", "") or "0000000000",
            billing_address=customer.get("address", "") or "Address line",
            billing_city=customer.get("city", "") or "City",
            billing_state=customer.get("state", "") or "State",
            billing_pincode=(customer.get("pincode") or "000000")[:6],
            shipping_is_billing=not bool(ship_to.get("address")),
            shipping_customer_name=ship_name if ship_to.get("address") else None,
            shipping_phone=ship_phone if ship_to.get("address") else None,
            shipping_address=ship_addr if ship_to.get("address") else None,
            shipping_city=ship_city if ship_to.get("address") else None,
            shipping_state=ship_state if ship_to.get("address") else None,
            shipping_pincode=ship_pin if ship_to.get("address") else None,
            order_items=sr_items,
            weight=weight_kg,
            length=40,
            breadth=30,
            height=15,
            payment_method="Prepaid",
            sub_total=round(per_shipment_subtotal, 2),
        )

        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            service = OrderService(client, headers)
            result = await service.create_order(req)

        # Shiprocket sometimes returns 200 OK with `order_id: null` when
        # the pickup nickname doesn't match any saved pickup location in
        # their portal. Treat that as a failure so the admin sees a clear
        # error instead of a row that says "SR# null".
        sr_oid = result.get("order_id") or result.get("shiprocket_order_id")
        sr_sid = result.get("shipment_id")
        if sr_oid in (None, "", "null", "None") or sr_sid in (None, "", "null", "None"):
            # Pickup nickname pre-flight passed (it matched Shiprocket's list)
            # yet SR returned blank. Other root causes at this point:
            #   • pincode/serviceability — destination not reachable
            #   • billing/shipping payload validation (e.g. missing phone)
            #   • the seller's pickup is registered but not VERIFIED in SR
            err = (
                f"Shiprocket accepted the request but returned a blank shipment for pickup '{pickup_nickname}'. "
                f"Possible causes: (1) the destination pincode {ship_pin or '?'} isn't serviceable, "
                f"(2) the pickup is registered but not VERIFIED in your Shiprocket panel (open SR → Settings → Pickup → confirm 'Verified' badge), "
                f"(3) a missing required field in the order. seller_id={seller_id or '(none)'}."
            )
            logger.error(f"[shiprocket] blank shipment despite valid pickup for {order.get('order_number')} pickup={pickup_nickname}: raw={result}")
            return {"success": False, "error": err, **result}

        return {"success": True, **result}

    except Exception as e:
        logger.error(f"Error creating Shiprocket shipment: {str(e)}")
        return {"success": False, "error": str(e)}


async def create_shiprocket_shipments_multi(order: dict, only_seller_ids: Optional[List[str]] = None) -> dict:
    """Split an order into per-supplier shipments and push each one to
    Shiprocket independently. Returns a normalized envelope.

    `only_seller_ids` (optional): if provided, ONLY these suppliers'
    shipments are pushed. Everything else is left alone. Used by the
    admin picker UI so the operator chooses which slices to push.
    """
    items = order.get("items", []) or []
    if not items:
        return {"success": False, "error": "Order has no items"}

    # Normalize filter — empty/None means "no filter, push everything"
    filter_ids = None
    if only_seller_ids is not None:
        filter_ids = {str(s).strip() for s in only_seller_ids if str(s).strip()}
        if not filter_ids:
            return {"success": False, "error": "No suppliers selected"}

    # Group items by seller_id (preserving insertion order for stable suffixes)
    seller_groups: dict = {}
    seller_order: list = []
    for it in items:
        sid = (it.get("seller_id") or "").strip() or "_unknown"
        if sid not in seller_groups:
            seller_groups[sid] = []
            seller_order.append(sid)
        seller_groups[sid].append(it)

    # Apply selection filter
    if filter_ids is not None:
        seller_order = [sid for sid in seller_order if sid in filter_ids]
        if not seller_order:
            return {"success": False, "error": "Selected suppliers not found on this order"}

    # Single-supplier short-circuit (only when there's truly one supplier overall,
    # NOT when the filter narrows to one — picker-driven push always uses suffixes
    # so existing SR records keep their unique reference IDs).
    use_legacy_single = (filter_ids is None and len(seller_order) == 1)
    if use_legacy_single:
        only_sid = seller_order[0]
        seller_doc = None
        if only_sid and only_sid != "_unknown":
            seller_doc = await db.sellers.find_one({"id": only_sid}, {"_id": 0, "company_name": 1, "name": 1}) or {}
        result = await create_shiprocket_shipment(order)
        single = {
            "seller_id": only_sid if only_sid != "_unknown" else "",
            "seller_company": (seller_doc or {}).get("company_name") or (seller_doc or {}).get("name") or "",
            "items_count": len(items),
            "subtotal": round(sum(float(i.get("price_per_meter", 0)) * float(i.get("quantity", 1)) for i in items), 2),
            "success": bool(result.get("success")),
            "order_id": str(result.get("order_id") or "") if result.get("order_id") is not None else "",
            "shipment_id": result.get("shipment_id"),
            "awb_code": result.get("awb_code", ""),
            "courier_name": result.get("courier_name", ""),
            "vertical": result.get("vertical", "courier"),
            "error": result.get("error", ""),
            "pushed_at": datetime.now(timezone.utc).isoformat(),
        }
        return {"success": single["success"], "count": 1, "shipments": [single]}

    # Multi-supplier — one shipment per seller.
    logger.info(f"[shiprocket-multi] order={order.get('order_number')} splitting into {len(seller_order)} supplier shipments")
    suffixes = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    shipments: list = []
    any_success = False
    for idx, sid in enumerate(seller_order):
        seller_items = seller_groups[sid]
        seller_doc = None
        if sid and sid != "_unknown":
            seller_doc = await db.sellers.find_one({"id": sid}, {"_id": 0, "company_name": 1, "name": 1}) or {}
        suffix = suffixes[idx] if idx < len(suffixes) else f"{idx + 1}"
        subtotal = round(sum(float(i.get("price_per_meter", 0)) * float(i.get("quantity", 1)) for i in seller_items), 2)
        try:
            res = await create_shiprocket_shipment(
                order,
                items_override=seller_items,
                seller_override=sid if sid != "_unknown" else None,
                order_id_suffix=suffix,
            )
        except Exception as e:
            logger.exception(f"[shiprocket-multi] supplier {sid} push raised: {e}")
            res = {"success": False, "error": str(e)}
        shipment = {
            "seller_id": sid if sid != "_unknown" else "",
            "seller_company": (seller_doc or {}).get("company_name") or (seller_doc or {}).get("name") or "",
            "suffix": suffix,
            "items_count": len(seller_items),
            "subtotal": subtotal,
            "success": bool(res.get("success")),
            "order_id": str(res.get("order_id") or "") if res.get("order_id") is not None else "",
            "shipment_id": res.get("shipment_id"),
            "awb_code": res.get("awb_code", ""),
            "courier_name": res.get("courier_name", ""),
            "vertical": res.get("vertical", "courier"),
            "error": res.get("error", ""),
            "pushed_at": datetime.now(timezone.utc).isoformat(),
        }
        shipments.append(shipment)
        if shipment["success"]:
            any_success = True

    return {
        "success": any_success,
        "count": len(shipments),
        "shipments": shipments,
        "error": "" if any_success else "; ".join(s.get("error", "") for s in shipments if not s["success"]),
    }


# ────────────────────────────────────────────────────────────────────
#  ADMIN — Manual "Push to Shiprocket" for orders that didn't auto-push
#  (e.g. older orders created before the auth bug fix, credit-paid B2C
#  orders that aren't on the auto-push path, etc.)
# ────────────────────────────────────────────────────────────────────
@router.post("/admin/{order_id}/push-to-shiprocket")
async def admin_push_to_shiprocket(
    order_id: str,
    force: bool = False,
    payload: Optional[dict] = Body(default=None),
):
    """Admin-only — manually push an order to Shiprocket.

    Body (optional):
      {
        "seller_ids": ["...", "..."]   // only push these supplier shipments
      }

    Behavior:
      • Idempotent by default: re-pushing returns the existing Shiprocket
        IDs UNLESS `force=true` is passed.
      • If `seller_ids` is provided, ONLY those supplier shipments are
        pushed. Already-pushed shipments in the same order remain
        untouched in `shiprocket_shipments[]` (we merge by seller_id).
      • Multi-supplier orders without `seller_ids` push every supplier
        in one go (legacy behaviour).
    """
    selected_seller_ids: Optional[List[str]] = None
    if payload and isinstance(payload, dict):
        raw = payload.get("seller_ids")
        if isinstance(raw, list):
            selected_seller_ids = [str(s).strip() for s in raw if str(s).strip()]
            if not selected_seller_ids:
                raise HTTPException(status_code=400, detail="seller_ids is empty")

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    existing_shipments = order.get("shiprocket_shipments") or []

    # Short-circuit ONLY if no picker and not forcing:
    # - selected_seller_ids = None means "push all suppliers" — the picker
    #   case always wants to attempt the named suppliers regardless.
    if not force and selected_seller_ids is None and (existing_shipments or order.get("shiprocket_order_id")):
        return {
            "success": True,
            "already_pushed": True,
            "count": len(existing_shipments) or 1,
            "shipments": existing_shipments,
            "shiprocket_order_id": order.get("shiprocket_order_id"),
            "shipment_id": order.get("shiprocket_shipment_id"),
            "message": "Order is already in Shiprocket",
        }

    # Block re-pushing already-pushed suppliers unless force=true
    if selected_seller_ids and not force and existing_shipments:
        already_ok = {s.get("seller_id") for s in existing_shipments if s.get("success")}
        blocked = [sid for sid in selected_seller_ids if sid in already_ok]
        if blocked:
            raise HTTPException(
                status_code=400,
                detail=f"{len(blocked)} supplier(s) already pushed — toggle 'force re-push' to create duplicates",
            )

    multi_result = await create_shiprocket_shipments_multi(order, only_seller_ids=selected_seller_ids)
    if not multi_result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=multi_result.get("error") or "Shiprocket push failed",
        )

    new_shipments = multi_result["shipments"]

    # MERGE new shipments into existing ones (by seller_id) so the picker
    # path doesn't wipe out previously successful supplier shipments.
    merged_by_sid: dict = {s.get("seller_id", ""): s for s in existing_shipments}
    for s in new_shipments:
        merged_by_sid[s.get("seller_id", "")] = s  # overwrite — newer push wins
    shipments = list(merged_by_sid.values())

    first_ok = next((s for s in shipments if s.get("success")), shipments[0])

    set_fields = {
        "shiprocket_shipments": shipments,
        "shiprocket_pushed": True,
        "shiprocket_pushed_at": datetime.now(timezone.utc).isoformat(),
        # Backward-compat: mirror the first successful shipment's IDs onto
        # the legacy single-shipment fields so existing UI/webhook code
        # continues to work for single-supplier orders unchanged.
        "shiprocket_order_id": first_ok.get("order_id") or None,
        "shiprocket_shipment_id": first_ok.get("shipment_id"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if first_ok.get("awb_code"):
        set_fields["awb_code"] = first_ok["awb_code"]
    if first_ok.get("courier_name"):
        set_fields["courier_name"] = first_ok["courier_name"]

    await db.orders.update_one({"id": order["id"]}, {"$set": set_fields})
    new_ok = sum(1 for s in new_shipments if s["success"])
    logger.info(
        f"[shiprocket] manual push · order={order.get('order_number')} "
        f"requested={len(new_shipments)} new_ok={new_ok} "
        f"{'picker' if selected_seller_ids else 'all'} force={force}"
    )

    return {
        "success": True,
        "already_pushed": False,
        "count": len(new_shipments),
        "shipments": shipments,  # full merged list — UI shows the complete picture
        "pushed_in_this_call": new_shipments,
        "shiprocket_order_id": first_ok.get("order_id"),
        "shipment_id": first_ok.get("shipment_id"),
        "awb_code": first_ok.get("awb_code") or "",
        "courier_name": first_ok.get("courier_name") or "",
        "message": f"Pushed {new_ok}/{len(new_shipments)} shipment{'s' if len(new_shipments) > 1 else ''}",
    }


@router.get("/{order_id}")
async def get_order(order_id: str):
    """Get order by ID or order number"""
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return order


# ────────────────────────────────────────────────────────────────────
#  ADMIN — Edit Order (DEPRECATED — orders are read-only online)
# ────────────────────────────────────────────────────────────────────
@router.patch("/{order_id}/edit")
async def admin_edit_order(order_id: str):
    """DEPRECATED — Edit Order is disabled. Orders are read-only online.
    Returns HTTP 405 for any caller."""
    raise HTTPException(
        status_code=405,
        detail="Order editing has been disabled. Orders cannot be edited online.",
    )


@router.get("/{order_id}/edits")
async def list_order_edits(
    order_id: str,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Admin: return the audit trail for an order, newest first."""
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0, "id": 1, "order_number": 1},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    rows = []
    async for r in db.order_edits.find({"order_id": order["id"]}, {"_id": 0}).sort("edited_at", -1):
        rows.append(r)
    return {"edits": rows, "total": len(rows)}



@router.get("/by-razorpay/{razorpay_order_id}")
async def get_order_by_razorpay_id(razorpay_order_id: str):
    """Get order by Razorpay order ID"""
    order = await db.orders.find_one(
        {"razorpay_order_id": razorpay_order_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return order

@router.get("")
async def list_orders(
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """List all orders (admin endpoint)"""
    query = {}
    if status:
        query["status"] = status
    if payment_status:
        query["payment_status"] = payment_status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)

    # Join linked brand_invoices so the admin order detail can render an
    # "E-way Bill" download button when the AM has uploaded one.
    brand_order_ids = [o["id"] for o in orders if o.get("brand_id") and o.get("id")]
    if brand_order_ids:
        cursor = db.brand_invoices.find(
            {"order_id": {"$in": brand_order_ids}},
            {"_id": 0, "order_id": 1, "id": 1, "invoice_number": 1, "file_url": 1,
             "eway_bill_number": 1, "eway_bill_url": 1, "status": 1},
        )
        inv_by_order = {}
        async for inv in cursor:
            inv_by_order[inv["order_id"]] = inv
        for o in orders:
            o["linked_invoice"] = inv_by_order.get(o["id"])

    return {
        "orders": orders,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.put("/{order_id}/status")
async def update_order_status(order_id: str, status: str):
    """Update order status (admin endpoint)"""
    valid_statuses = ["pending", "payment_pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.orders.update_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Send status email for shipped/delivered
    if status in ('shipped', 'delivered'):
        order = await db.orders.find_one(
            {"$or": [{"id": order_id}, {"order_number": order_id}]},
            {'_id': 0}
        )
        if order:
            from email_router import send_order_status_email
            try:
                await send_order_status_email(order, status)
            except Exception as e:
                logger.warning(f"Status email failed for {order_id}: {e}")
    
    return {"success": True, "message": f"Order status updated to {status}"}

@router.put("/{order_id}/payment-status")
async def update_payment_status(order_id: str, payload: dict):
    """Admin-only manual payment-status override. Useful for offline
    payments (NEFT, RTGS, cheque, credit-line release) where the
    customer paid through a channel the gateway can't auto-confirm.

    Body:
      {
        "payment_status": "paid" | "pending" | "failed" | "refunded",
        "payment_method": "neft" | "rtgs" | "cheque" | "credit" | "razorpay" | ...   (optional)
        "utr": "...",                                                                 (optional, recommended for paid)
        "notes": "human note for the audit trail"                                     (optional)
      }

    Side-effects when status flips to `paid`:
      • `order.status` is bumped from `payment_pending`→`pending` so it
        shows up in fulfillment queues (no auto-bump if already past).
      • `paid_at` timestamp recorded.
      • Order confirmation email is fired off (idempotent on our side —
        safe if already sent).
      • Vendor payouts are materialized.
    """
    valid_statuses = ["pending", "initiated", "paid", "failed", "refunded"]
    new_status = (payload.get("payment_status") or "").strip().lower()
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"payment_status must be one of {valid_statuses}")

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    previous = order.get("payment_status", "")
    set_fields = {
        "payment_status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.get("payment_method"):
        set_fields["payment_method"] = payload["payment_method"]
    if payload.get("utr"):
        set_fields["utr"] = payload["utr"].strip()
    if payload.get("notes"):
        set_fields["payment_status_notes"] = payload["notes"]

    if new_status == "paid":
        set_fields["paid_at"] = datetime.now(timezone.utc).isoformat()
        # Bump fulfillment status only if still in the pre-pay limbo
        if order.get("status") in ("payment_pending", "pending"):
            set_fields["status"] = "pending"

    # Audit trail (append-only)
    audit = {
        "from": previous,
        "to": new_status,
        "at": datetime.now(timezone.utc).isoformat(),
        "method": payload.get("payment_method") or order.get("payment_method", ""),
        "utr": payload.get("utr", ""),
        "notes": payload.get("notes", ""),
        "actor": "admin",
    }

    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": set_fields, "$push": {"payment_status_history": audit}},
    )

    # Re-fetch for side-effects
    if new_status == "paid" and previous != "paid":
        fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        # Send order confirmation email + materialize payouts (best-effort)
        try:
            await send_order_notification_emails(fresh)
        except Exception as e:
            logger.warning(f"[manual-paid] email failed for {order['id']}: {e}")
        try:
            from payouts_router import materialize_payouts_for_order
            await materialize_payouts_for_order(fresh)
        except Exception as e:
            logger.warning(f"[manual-paid] payout materialize failed for {order['id']}: {e}")
        logger.info(f"[admin] payment_status: {order.get('order_number')} {previous} → {new_status}")

    return {"success": True, "previous": previous, "current": new_status}


@router.post("/{order_id}/mark-goods-ready")
async def mark_goods_ready(order_id: str, data: dict, request: Request):
    """Supplier reports actual quantity they've packed/dispatched.

    Body: `{ items: [{ fabric_id: str, actual_quantity: float }] }`

    The endpoint accepts vendor JWT (supplier marks their OWN items) or
    admin/agent JWT (can override on the vendor's behalf). The order
    must be `advance_paid` (provisional). On success we:
      • stamp `actual_quantity` on each item the caller controls
      • recompute subtotal/tax/total → save as `actual_total`
      • set `balance_amount = actual_total - advance_amount`
      • flip `payment_status: balance_pending`, `status: goods_ready`
      • stamp `goods_ready_at`
      • fire an email to the customer with a "Pay balance" link
    Variance outside ±10 % requires admin role to proceed.
    """
    from provisional_orders import within_variance, recalc_item_total, VARIANCE_PCT, resolve_category_variance

    # Caller resolution — vendor, admin, or agent
    caller_seller_id = None
    caller_role = "unknown"
    
    # Extract Authorization header manually for auth check
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            import jwt
            JWT_SECRET = os.environ.get("JWT_SECRET", "")
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            
            if payload.get("type") == "vendor":
                # Vendor token
                seller_id = payload.get("seller_id")
                seller = await db.sellers.find_one({"id": seller_id, "is_active": True}, {"_id": 0})
                if seller:
                    caller_seller_id = seller.get("id")
                    caller_role = "vendor"
            else:
                # Admin token (no type field or type != vendor)
                admin_id = payload.get("sub")
                if admin_id:
                    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
                    if admin:
                        caller_role = "admin"
        except Exception:
            pass  # Invalid token
    
    if caller_role == "unknown":
        raise HTTPException(status_code=401, detail="Vendor or admin auth required")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    is_prov = bool(order.get("is_provisional"))
    if is_prov:
        if order.get("payment_status") not in ("advance_paid", "balance_pending"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot mark goods-ready in payment_status={order.get('payment_status')}",
            )
    else:
        # Non-provisional (full-payment) orders — supplier still uploads
        # rolls + invoice and we flip status → goods_ready. No balance
        # recompute since the customer already paid in full.
        if order.get("status") not in ("confirmed", "processing", "goods_ready"):
            raise HTTPException(
                status_code=400,
                detail=f"Order must be confirmed before marking goods ready (current: {order.get('status')})",
            )

    # Build per-fabric payload map. Each entry may carry actual_quantity,
    # an optional `rolls` breakdown ([{count:int, length:float}, ...]) and
    # an optional `dispatch_note`. The latter two are recorded verbatim
    # for traceability — they don't influence totals.
    payload_by_fabric: dict[str, dict] = {}
    for it in (data.get("items") or []):
        fid = (it.get("fabric_id") or "").strip()
        if not fid:
            continue
        rolls = []
        for r in (it.get("rolls") or []):
            try:
                cnt = int(r.get("count") or 0)
                ln = float(r.get("length") or 0)
            except (TypeError, ValueError):
                continue
            if cnt > 0 and ln > 0:
                rolls.append({"count": cnt, "length": round(ln, 2)})
        # Derive actual_quantity from rolls when caller didn't send it.
        derived = sum(r["count"] * r["length"] for r in rolls)
        try:
            qty_payload = float(it.get("actual_quantity")) if it.get("actual_quantity") is not None else 0.0
        except (TypeError, ValueError):
            qty_payload = 0.0
        actual_qty = qty_payload if qty_payload > 0 else derived
        payload_by_fabric[fid] = {
            "actual_quantity": actual_qty,
            "rolls": rolls,
            "dispatch_note": (it.get("dispatch_note") or "").strip(),
        }

    if not payload_by_fabric:
        raise HTTPException(status_code=400, detail="No items provided")

    # Resolve category-level variance bands for all items in one fabric lookup
    fabric_ids = list({(it.get("fabric_id") or "") for it in (order.get("items") or []) if it.get("fabric_id")})
    cat_by_fabric: dict[str, str] = {}
    if fabric_ids:
        async for f in db.fabrics.find({"id": {"$in": fabric_ids}}, {"_id": 0, "id": 1, "category_id": 1}):
            if f.get("category_id"):
                cat_by_fabric[f["id"]] = f["category_id"]

    # Stamp actual_quantity on the matching items. Vendors can only
    # update their own items; admins can update all.
    new_items = []
    out_of_band = []
    for it in (order.get("items") or []):
        fid = it.get("fabric_id") or ""
        if fid in payload_by_fabric:
            if caller_role == "vendor":
                if (it.get("seller_id") or "") != caller_seller_id:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Item {it.get('fabric_name','?')} is not assigned to this vendor",
                    )
            p = payload_by_fabric[fid]
            actual_qty = float(p["actual_quantity"] or 0)
            if actual_qty <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Quantity is required for {it.get('fabric_name') or fid}",
                )
            # Per-category variance % (falls back to platform default
            # when the category record doesn't override it).
            cat_id = it.get("category_id") or cat_by_fabric.get(it.get("fabric_id") or "")
            item_variance = await resolve_category_variance(db, cat_id)
            if not within_variance(float(it.get("quantity") or 0), actual_qty, item_variance):
                out_of_band.append({
                    "name": it.get("fabric_name") or fid,
                    "pct": item_variance,
                })
            stamped = recalc_item_total(it, actual_qty)
            if p["rolls"]:
                stamped["dispatch_rolls"] = p["rolls"]
            if p["dispatch_note"]:
                stamped["dispatch_note"] = p["dispatch_note"]
            new_items.append(stamped)
        else:
            # Preserve existing actual_quantity stamp (set by a prior
            # vendor in a multi-supplier order) or leave unset.
            new_items.append(it)

    if out_of_band and caller_role != "admin":
        # `out_of_band` is a list of {name, pct} dicts so we can surface
        # the exact category band that was breached.
        details = ", ".join(f"{o['name']} (±{o['pct']:.1f}%)" for o in out_of_band)
        raise HTTPException(
            status_code=400,
            detail=f"Actual quantity outside variance band for: {details}. Admin approval required.",
        )

    # Per-vendor invoice: required when a vendor (or SM impersonating one)
    # marks goods ready, since the payout will be drawn against this
    # invoice. Admins overriding on behalf of a vendor can skip it
    # (uploading later via the legacy Payouts page).
    inv_payload = data.get("vendor_invoice") or {}
    inv_url = (inv_payload.get("url") or "").strip()
    inv_no = (inv_payload.get("invoice_number") or "").strip()
    inv_date = (inv_payload.get("invoice_date") or "").strip()
    inv_filename = (inv_payload.get("filename") or "").strip()
    try:
        inv_amount = float(inv_payload.get("amount") or 0) or None
    except (TypeError, ValueError):
        inv_amount = None

    if caller_role == "vendor":
        if not inv_url or not inv_no or not inv_date:
            raise HTTPException(
                status_code=400,
                detail="Tax invoice file, invoice number and invoice date are required when marking goods ready.",
            )

    # Check ALL items now have actual_quantity. If not, the supplier is
    # mid-update (multi-vendor split where Vendor A reported, Vendor B
    # hasn't yet) — we stamp progress but DON'T move to balance_pending.
    all_ready = all(it.get("actual_quantity") is not None for it in new_items)

    update_doc = {
        "items": new_items,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Persist per-vendor invoice on the order (keyed by seller_id) so the
    # payout materializer can pull it without a second upload step.
    if inv_url and caller_seller_id:
        existing_invoices = [
            v for v in (order.get("vendor_invoices") or [])
            if (v.get("seller_id") or "") != caller_seller_id
        ]
        existing_invoices.append({
            "seller_id": caller_seller_id,
            "url": inv_url,
            "filename": inv_filename,
            "invoice_number": inv_no,
            "invoice_date": inv_date,
            "amount": inv_amount,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        })
        update_doc["vendor_invoices"] = existing_invoices

    if all_ready:
        if is_prov:
            # Recompute totals using actual_total per item (keeps tax /
            # logistics / packaging proportional to the original booking).
            actual_subtotal = sum(float(it.get("actual_total") or 0) for it in new_items)
            booked_subtotal = float(order.get("subtotal") or 0)
            ratio = (actual_subtotal / booked_subtotal) if booked_subtotal > 0 else 1.0
            packaging = round(float(order.get("packaging_charge") or 0) * ratio, 2)
            logistics = round(float(order.get("logistics_only_charge") or order.get("logistics_charge") or 0) * ratio, 2)
            tax = round((actual_subtotal + packaging + logistics) * 0.05, 2)  # 5 % GST
            discount = float(order.get("discount") or 0)
            actual_total = round(actual_subtotal + packaging + logistics + tax - discount, 2)
            advance_amount = float(order.get("advance_amount") or 0)
            balance_amount = max(round(actual_total - advance_amount, 2), 0.0)

            update_doc.update({
                "actual_subtotal": round(actual_subtotal, 2),
                "actual_packaging_charge": packaging,
                "actual_logistics_charge": logistics,
                "actual_tax": tax,
                "actual_total": actual_total,
                "balance_amount": balance_amount,
                "payment_status": "balance_pending",
                "status": "goods_ready",
                "goods_ready_at": datetime.now(timezone.utc).isoformat(),
                "goods_ready_by": caller_seller_id or caller_role,
            })
        else:
            # Non-provisional: customer paid 100% upfront on the ordered
            # qty. When the vendor reports a *different* actual qty we now
            # also recompute order-level `actual_*` totals — proportional
            # to the booking — so finance can:
            #   • Charge the customer the *extra* balance if actual > ordered
            #   • Surface a `refund_amount` if actual < ordered
            # If actual qty exactly matches ordered, nothing financial
            # changes and we just stamp the goods-ready flag.
            actual_subtotal = sum(float(it.get("actual_total") or 0) for it in new_items)
            booked_subtotal = float(order.get("subtotal") or 0)
            ratio = (actual_subtotal / booked_subtotal) if booked_subtotal > 0 else 1.0
            packaging = round(float(order.get("packaging_charge") or 0) * ratio, 2)
            logistics = round(float(order.get("logistics_only_charge") or order.get("logistics_charge") or 0) * ratio, 2)
            tax = round((actual_subtotal + packaging + logistics) * 0.05, 2)  # 5 % GST
            discount = float(order.get("discount") or 0)
            actual_total = round(actual_subtotal + packaging + logistics + tax - discount, 2)
            # Customer has already paid `order.total` (100 % upfront).
            paid_amount = float(order.get("total") or 0)
            delta = round(actual_total - paid_amount, 2)
            balance_amount = max(delta, 0.0)
            refund_amount = max(-delta, 0.0)

            update_doc.update({
                "actual_subtotal": round(actual_subtotal, 2),
                "actual_packaging_charge": packaging,
                "actual_logistics_charge": logistics,
                "actual_tax": tax,
                "actual_total": actual_total,
                "balance_amount": balance_amount,
                "refund_amount": refund_amount,
                "status": "goods_ready",
                "goods_ready_at": datetime.now(timezone.utc).isoformat(),
                "goods_ready_by": caller_seller_id or caller_role,
            })
            # Only flip payment_status when there's an actual balance owed
            # by the customer — refunds/no-change stay as 'paid' since
            # logistics + payouts can still proceed.
            if balance_amount > 0.005:
                update_doc["payment_status"] = "balance_pending"

    await db.orders.update_one({"id": order_id}, {"$set": update_doc})

    # Notify the customer (best-effort) only when the whole order is ready.
    if all_ready:
        if is_prov:
            try:
                fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
                from email_router import send_balance_payment_due_email
                await send_balance_payment_due_email(fresh)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"balance-due email skipped: {e}")
        # Internal mail chain (fires for both provisional and non-provisional)
        try:
            from internal_events import fire_internal_event, OrderEvent
            fresh = fresh if 'fresh' in locals() else await db.orders.find_one({"id": order_id}, {"_id": 0})
            await fire_internal_event(OrderEvent.GOODS_READY, fresh, extra={
                "actual_subtotal": fresh.get("actual_subtotal"),
                "balance_amount": fresh.get("balance_amount"),
                "marked_by": caller_role,
                "is_provisional": is_prov,
            })
        except Exception as e:  # noqa: BLE001
            logger.warning(f"internal goods_ready event failed: {e}")

        # Resync vendor payouts to use the freshly-stamped `actual_quantity`.
        # The original payout was materialized at payment-capture time using
        # the *ordered* qty; without this resync, vendors get paid on the
        # wrong basis. Paid payouts are skipped — only PENDING rows update.
        try:
            from payouts_router import resync_payouts_for_actual_qty
            fresh2 = await db.orders.find_one({"id": order_id}, {"_id": 0})
            resync_summary = await resync_payouts_for_actual_qty(fresh2)
            if resync_summary.get("updated", 0) > 0:
                logger.info(
                    f"[mark-ready] vendor-payout resync · order={order_id} "
                    f"updated={resync_summary.get('updated')} skipped_paid={resync_summary.get('skipped_paid', 0)}"
                )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[mark-ready] vendor-payout resync failed: {e}")

    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return {"success": True, "all_ready": all_ready, "order": fresh}


@router.post("/{order_id}/recompute-actuals")
async def recompute_order_actuals(order_id: str, admin=Depends(auth_helpers.get_current_admin)):
    """Retroactive fix for orders that were marked goods-ready BEFORE the
    actual-qty recompute logic landed (Feb 2026). Idempotent — recomputes
    `actual_subtotal / packaging / logistics / tax / total / balance /
    refund` from the per-item `actual_quantity` stamps and resyncs vendor
    payouts. Only acts on orders that have at least one item where
    `actual_quantity != quantity`. Returns the updated order.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("goods_ready_at"):
        raise HTTPException(status_code=400, detail="Order is not marked goods-ready yet")

    items = order.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="Order has no items")

    # Detect if at least one item has an actual qty that differs from
    # ordered — if everything matches, nothing to recompute.
    has_diff = any(
        it.get("actual_quantity") is not None
        and float(it.get("actual_quantity") or 0) != float(it.get("quantity") or 0)
        for it in items
    )
    if not has_diff and order.get("actual_total") is not None:
        return {"success": True, "no_change": True, "order": order}

    # Stamp per-item actual_total if missing (uses actual_quantity || quantity)
    new_items = []
    for it in items:
        clone = dict(it)
        qty = float(clone.get("actual_quantity") if clone.get("actual_quantity") is not None else (clone.get("quantity") or 0))
        rate = float(clone.get("price_per_meter") or 0)
        clone["actual_total"] = round(qty * rate, 2)
        new_items.append(clone)

    actual_subtotal = sum(float(it.get("actual_total") or 0) for it in new_items)
    booked_subtotal = float(order.get("subtotal") or 0)
    ratio = (actual_subtotal / booked_subtotal) if booked_subtotal > 0 else 1.0
    packaging = round(float(order.get("packaging_charge") or 0) * ratio, 2)
    logistics = round(float(order.get("logistics_only_charge") or order.get("logistics_charge") or 0) * ratio, 2)
    tax = round((actual_subtotal + packaging + logistics) * 0.05, 2)
    discount = float(order.get("discount") or 0)
    actual_total = round(actual_subtotal + packaging + logistics + tax - discount, 2)

    update: dict = {
        "items": new_items,
        "actual_subtotal": round(actual_subtotal, 2),
        "actual_packaging_charge": packaging,
        "actual_logistics_charge": logistics,
        "actual_tax": tax,
        "actual_total": actual_total,
        "actuals_recomputed_at": datetime.now(timezone.utc).isoformat(),
        "actuals_recomputed_by": admin.get("email", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if order.get("is_provisional"):
        # Provisional: customer paid the advance. Balance = actual - advance.
        advance_amount = float(order.get("advance_amount") or 0)
        balance_amount = max(round(actual_total - advance_amount, 2), 0.0)
        update["balance_amount"] = balance_amount
        # Preserve existing payment_status if already moved past
        # balance_pending; else set it.
        if order.get("payment_status") not in ("paid",):
            update["payment_status"] = "balance_pending"
    else:
        # Non-provisional: customer paid 100% of original `total`. Delta
        # is now the additional balance (or refund).
        paid_amount = float(order.get("total") or 0)
        delta = round(actual_total - paid_amount, 2)
        update["balance_amount"] = max(delta, 0.0)
        update["refund_amount"] = max(-delta, 0.0)
        # Only mark balance_pending if customer actually owes something.
        if delta > 0.005:
            update["payment_status"] = "balance_pending"

    await db.orders.update_one({"id": order_id}, {"$set": update})

    # Resync vendor payouts to the recomputed basis.
    try:
        from payouts_router import resync_payouts_for_actual_qty
        fresh_for_resync = await db.orders.find_one({"id": order_id}, {"_id": 0})
        summary = await resync_payouts_for_actual_qty(fresh_for_resync)
        logger.info(f"[recompute-actuals] order={order_id} payout-resync={summary}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[recompute-actuals] payout resync failed: {e}")

    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return {
        "success": True,
        "no_change": False,
        "actual_total": actual_total,
        "balance_amount": fresh.get("balance_amount"),
        "refund_amount": fresh.get("refund_amount"),
        "payment_status": fresh.get("payment_status"),
        "order": fresh,
    }



# ─── Vendor 24h Accept / Cancel window ─────────────────────────
async def _resolve_vendor_caller(request: Request) -> tuple[str, str]:
    """Returns (caller_role, caller_seller_id). caller_role in
    {"vendor","admin"}. Raises 401 if neither auth succeeds."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Vendor or admin auth required")
    
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Check if vendor token
        if payload.get("type") == "vendor":
            seller_id = payload.get("seller_id", "")
            # Verify seller is active
            seller = await db.sellers.find_one({"id": seller_id, "is_active": True}, {"_id": 0})
            if seller:
                return "vendor", seller_id
        
        # Check if admin token
        admin_id = payload.get("sub")
        if admin_id:
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
            if admin:
                return "admin", ""
        
    except jwt.PyJWTError:
        pass
    
    raise HTTPException(status_code=401, detail="Vendor or admin auth required")


@router.post("/{order_id}/vendor-accept")
async def vendor_accept_order(order_id: str, request: Request):
    """Vendor confirms they will fulfil the order. Closes the 24h SLA
    window. Multi-vendor orders: every vendor must accept independently;
    the order remains `pending` until ALL vendors have accepted, then
    flips to `accepted`."""
    caller_role, caller_sid = await _resolve_vendor_caller(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order is cancelled")
    if order.get("vendor_acceptance_status") in ("auto_cancelled", "cancelled"):
        raise HTTPException(status_code=400, detail="Order was already cancelled by vendor/SLA")

    # Determine the seller(s) the caller is responsible for.
    item_sids = {(it.get("seller_id") or "").strip() for it in (order.get("items") or [])}
    item_sids.discard("")
    if caller_role == "vendor":
        if caller_sid not in item_sids:
            raise HTTPException(status_code=403, detail="You are not assigned to this order")
        target_sids = {caller_sid}
    else:
        target_sids = item_sids  # admin override accepts on behalf of all

    now_iso = datetime.now(timezone.utc).isoformat()
    acceptances = dict(order.get("vendor_acceptances") or {})
    for sid in target_sids:
        acceptances[sid] = {"status": "accepted", "at": now_iso, "by": caller_role}

    # If every vendor has accepted → close the window.
    all_accepted = all(acceptances.get(sid, {}).get("status") == "accepted" for sid in item_sids)
    update_doc = {"vendor_acceptances": acceptances, "updated_at": now_iso}
    if all_accepted:
        update_doc["vendor_acceptance_status"] = "accepted"
        update_doc["vendor_accepted_at"] = now_iso
    await db.orders.update_one({"id": order_id}, {"$set": update_doc})

    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        from internal_events import fire_internal_event, OrderEvent
        await fire_internal_event(OrderEvent.VENDOR_ACCEPTED, fresh, extra={
            "vendor_seller_id": caller_sid or "admin_override",
            "all_vendors_accepted": all_accepted,
        })
    except Exception:
        pass
    return {"success": True, "all_accepted": all_accepted, "order": fresh}


@router.post("/{order_id}/vendor-cancel")
async def vendor_cancel_order(order_id: str, data: dict, request: Request):
    """Vendor declines the order. Any cancellation cancels the WHOLE order
    (single payment can't be split per-vendor)."""
    caller_role, caller_sid = await _resolve_vendor_caller(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "cancelled":
        return {"success": True, "order": order, "already_cancelled": True}

    if caller_role == "vendor":
        item_sids = {(it.get("seller_id") or "").strip() for it in (order.get("items") or [])}
        if caller_sid not in item_sids:
            raise HTTPException(status_code=403, detail="You are not assigned to this order")

    reason = (data.get("reason") or "Vendor declined the order").strip() or "Vendor declined the order"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "cancelled",
            "vendor_acceptance_status": "cancelled",
            "cancellation_reason": "vendor_cancelled",
            "vendor_cancel_reason": reason,
            "vendor_cancelled_by": caller_sid or "admin",
            "cancelled_at": now_iso,
            "updated_at": now_iso,
        }},
    )
    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Customer-facing cancellation email
    try:
        from email_router import send_order_cancellation_email
        await send_order_cancellation_email(fresh, reason=reason)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[vendor-cancel] customer email failed: {e}")

    # Internal mail chain
    try:
        from internal_events import fire_internal_event, OrderEvent
        await fire_internal_event(OrderEvent.VENDOR_REJECTED, fresh, extra={
            "vendor_seller_id": caller_sid or "admin_override",
            "reason": reason,
        })
        await fire_internal_event(OrderEvent.ORDER_CANCELLED, fresh, extra={
            "reason": reason,
            "cancelled_by": "vendor",
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[vendor-cancel] internal event failed: {e}")

    return {"success": True, "order": fresh}


@router.post("/{order_id}/balance-pay")
async def start_balance_payment(order_id: str, request: Request):
    """Customer-side endpoint: mint a Razorpay order for the BALANCE
    amount of a provisional order. The frontend opens the Razorpay
    modal with this id; verify-payment handles the success leg."""
    from customer_router import get_current_customer as _get_current_customer
    customer = _get_current_customer(request)
    order = await db.orders.find_one(
        {"id": order_id, "customer.email": customer["email"]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") != "balance_pending":
        raise HTTPException(
            status_code=400,
            detail="Balance payment is not yet due — waiting for the supplier to mark goods ready.",
        )
    if order.get("payment_method") == "credit":
        raise HTTPException(status_code=400, detail="Credit orders use the credit-ops balance flow.")

    balance_paise = int(round(float(order.get("balance_amount") or 0) * 100))
    if balance_paise <= 0:
        raise HTTPException(status_code=400, detail="No balance due — order may already be settled.")

    try:
        rzp = razorpay_client.order.create({
            "amount": balance_paise,
            "currency": "INR",
            "receipt": f"{order.get('order_number') or order_id[:10]}-bal",
            "notes": {"order_id": order_id, "payment_stage": "balance"},
        })
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "razorpay_order_id": rzp["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {
        "razorpay_order_id": rzp["id"],
        "amount": rzp["amount"],
        "currency": rzp["currency"],
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "balance_amount": float(order.get("balance_amount") or 0),
    }


# ─── Shareable balance-pay link ─────────────────────────────────
# Agents (and admins) can mint a one-off URL that lets the customer pay
# the balance WITHOUT logging in. The token is stored on the order, so
# revoking it = deleting the token.
import hashlib  # noqa: E402


def _make_balance_token(order_id: str) -> str:
    secret = os.environ.get("BALANCE_LINK_SECRET", "lf_balance_secret")
    raw = f"{order_id}:{secret}:{datetime.now(timezone.utc).date().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


@router.post("/{order_id}/balance-share-link")
async def mint_balance_share_link(order_id: str, request: Request):
    """Agent/Admin only. Generates a public balance-pay URL the agent can
    forward to the customer (WhatsApp, email, anywhere)."""
    # Accept either admin or agent by manually parsing the token
    is_admin = False
    is_agent = False
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            # Check if admin
            admin_id = payload.get("sub")
            if admin_id:
                admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
                if admin:
                    is_admin = True
            # Check if agent
            if not is_admin and payload.get("type") == "agent":
                is_agent = True
        except jwt.PyJWTError:
            pass
    if not (is_admin or is_agent):
        raise HTTPException(status_code=401, detail="Agent or admin auth required")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") != "balance_pending":
        raise HTTPException(status_code=400, detail="Balance link only available for orders awaiting balance payment")

    token = order.get("balance_share_token") or _make_balance_token(order_id)
    await db.orders.update_one({"id": order_id}, {"$set": {
        "balance_share_token": token,
        "balance_share_token_at": datetime.now(timezone.utc).isoformat(),
    }})
    base = os.environ.get("SITE_URL", "https://locofast.com").rstrip("/")
    return {
        "token": token,
        "url": f"{base}/pay-balance/{order_id}/{token}",
        "order_number": order.get("order_number"),
        "balance_amount": float(order.get("balance_amount") or 0),
    }


@router.get("/balance-share/{order_id}/{token}")
async def resolve_balance_share_link(order_id: str, token: str):
    """Public: customer (or anyone with the link) sees order summary."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("balance_share_token") != token:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    if order.get("payment_status") == "paid":
        return {"status": "already_paid", "order_number": order.get("order_number")}
    return {
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "customer_name": (order.get("customer") or {}).get("name", ""),
        "balance_amount": float(order.get("balance_amount") or 0),
        "advance_amount": float(order.get("advance_amount") or 0),
        "total": float(order.get("actual_total") or order.get("total") or 0),
        "items_count": len(order.get("items") or []),
        "items": [
            {
                "fabric_name": it.get("fabric_name", ""),
                "fabric_code": it.get("fabric_code", ""),
                "quantity": it.get("actual_quantity") or it.get("quantity"),
                "price_per_meter": it.get("price_per_meter", 0),
            }
            for it in (order.get("items") or [])
        ],
        "payment_status": order.get("payment_status"),
    }


@router.post("/balance-share/{order_id}/{token}/pay")
async def start_balance_payment_via_share(order_id: str, token: str):
    """Public: mint a Razorpay order for the balance using the share token
    (no customer login required). Same as /balance-pay but token-gated."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("balance_share_token") != token:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    if order.get("payment_status") != "balance_pending":
        raise HTTPException(status_code=400, detail="Balance is not currently due")
    if order.get("payment_method") == "credit":
        raise HTTPException(status_code=400, detail="Credit orders use the credit-ops balance flow.")
    balance_paise = int(round(float(order.get("balance_amount") or 0) * 100))
    if balance_paise <= 0:
        raise HTTPException(status_code=400, detail="No balance due")
    try:
        rzp = razorpay_client.order.create({
            "amount": balance_paise,
            "currency": "INR",
            "receipt": f"{order.get('order_number') or order_id[:10]}-bal-share",
            "notes": {"order_id": order_id, "payment_stage": "balance", "via": "share_link"},
        })
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"razorpay_order_id": rzp["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {
        "razorpay_order_id": rzp["id"],
        "amount": rzp["amount"],
        "currency": rzp["currency"],
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "balance_amount": float(order.get("balance_amount") or 0),
    }


@router.post("/{order_id}/mark-balance-paid")
async def admin_mark_balance_paid(
    order_id: str,
    payload: dict = Body(default={}),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Finance-only manual marker — same effect as a successful Razorpay
    balance payment. Triggers inventory deduction + payout materialization
    + Shiprocket push.

    Optional body fields (recorded for audit):
      • payment_method: neft | rtgs | imps | upi | cheque | cash | razorpay
      • utr: bank UTR / reference number
      • notes: free-form note from the finance team
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") != "balance_pending":
        raise HTTPException(status_code=400, detail="Balance is not pending — nothing to mark.")

    now = datetime.now(timezone.utc).isoformat()
    method = (payload.get("payment_method") or "").strip().lower() or None
    utr = (payload.get("utr") or "").strip() or None
    notes = (payload.get("notes") or "").strip() or None

    set_doc = {
        "payment_status": "paid",
        "status": "confirmed",
        "balance_paid_at": now,
        "paid_at": now,
        "balance_paid_manually": True,
        "balance_paid_by": admin.get("email", "admin"),
        "balance_paid_method": method,
        "balance_paid_utr": utr,
        "balance_paid_notes": notes,
        "updated_at": now,
    }
    await db.orders.update_one({"id": order_id}, {"$set": set_doc})

    # Inventory + payouts + Shiprocket (same trio as the auto-flow).
    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        for item in fresh["items"]:
            qty = float(item.get("actual_quantity") or item.get("quantity") or 0)
            await db.fabrics.update_one(
                {"id": item["fabric_id"], "quantity_available": {"$gte": qty}},
                {"$inc": {"quantity_available": -qty}},
            )
    except Exception as e:
        logger.warning(f"Inventory deduct failed: {e}")

    try:
        from payouts_router import materialize_payouts_for_order
        await materialize_payouts_for_order(fresh)
    except Exception as e:
        logger.warning(f"Payout materialize failed: {e}")

    try:
        sr = await create_shiprocket_shipment(fresh)
        if sr.get("success"):
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "shiprocket_order_id": str(sr.get("order_id") or ""),
                    "shiprocket_shipment_id": sr.get("shipment_id"),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            try:
                from internal_events import fire_internal_event as _fire2, OrderEvent as _OE2
                await _fire2(_OE2.ORDER_DISPATCHED, fresh, extra={
                    "shiprocket_order_id": str(sr.get("order_id") or ""),
                    "marked_via": "admin_balance_paid",
                })
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Shiprocket push failed: {e}")

    # Internal mail chain for confirmation
    try:
        from internal_events import fire_internal_event, OrderEvent
        await fire_internal_event(OrderEvent.ORDER_CONFIRMED, fresh, extra={
            "balance_marked_by": admin.get("email", "admin"),
            "method": "manual_balance_paid",
        })
        await fire_internal_event(OrderEvent.PAYMENT_CAPTURED, fresh)
    except Exception as e:
        logger.warning(f"internal confirmed event failed: {e}")

    return {"success": True, "order": await db.orders.find_one({"id": order_id}, {"_id": 0})}


@router.post("/admin/auto-cancel-stale")
async def trigger_autocancel_sweep(admin=Depends(auth_helpers.get_current_admin)):
    """Manually run the stale-order sweep. Useful for admins who want to
    flush expired carts without waiting for the next hourly poll. Returns
    the same shape as the background sweep."""
    from order_autocancel import cancel_stale_orders
    return await cancel_stale_orders(db)


@router.put("/{order_id}/cancel")
async def cancel_order(order_id: str, data: dict):
    """Cancel an order with reason (stock out or credit limit). Refunds credit if paid via credit."""
    reason = data.get('reason', '')
    if reason not in ['stock_out', 'credit_limit', 'customer_request', 'other']:
        raise HTTPException(status_code=400, detail="Reason must be: stock_out, credit_limit, customer_request, or other")
    
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {'_id': 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # If paid via credit, refund the balance to the GST-keyed wallet
    if order.get('payment_method') == 'credit' and order.get('payment_status') == 'paid':
        gstin = (order.get('customer', {}).get('gst_number') or '').strip().upper()
        if gstin:
            wallet = await db.credit_wallets.find_one({'gst_number': gstin})
            if wallet:
                new_balance = wallet.get('balance', 0) + order.get('total', 0)
                await db.credit_wallets.update_one(
                    {'gst_number': gstin},
                    {'$set': {'balance': new_balance, 'updated_at': now}}
                )
                await db.credit_transactions.insert_one({
                    'id': str(uuid.uuid4()),
                    'gst_number': gstin,
                    'email': order.get('customer', {}).get('email', ''),
                    'order_id': order['id'],
                    'order_number': order['order_number'],
                    'type': 'refund',
                    'amount': order['total'],
                    'balance_after': new_balance,
                    'reason': reason,
                    'created_at': now
                })
    
    await db.orders.update_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"$set": {
            "status": "cancelled",
            "cancellation_reason": reason,
            "cancellation_notes": (data.get('notes') or '').strip(),
            "cancelled_by": "admin",
            "cancelled_at": now,
            "updated_at": now
        }}
    )
    
    reason_labels = {
        'stock_out': 'Stock Out',
        'credit_limit': 'Lack of Credit Limit',
        'customer_request': 'Customer Request',
        'other': 'Other'
    }
    label = reason_labels.get(reason, reason)
    notes = (data.get('notes') or '').strip()
    human_reason = f"{label}: {notes}" if notes else label

    # Notify customer + Locofast internal stakeholders (best-effort)
    fresh = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0}
    )
    try:
        from email_router import send_order_cancellation_email
        await send_order_cancellation_email(fresh, reason=human_reason)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[admin-cancel] customer email failed: {e}")
    try:
        from internal_events import fire_internal_event, OrderEvent
        await fire_internal_event(OrderEvent.ORDER_CANCELLED, fresh, extra={
            "reason_code": reason,
            "reason": human_reason,
            "cancelled_by": "admin",
            "notes": notes,
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[admin-cancel] internal event failed: {e}")

    return {"success": True, "message": f"Order cancelled: {label}"}

# ==================== CREDIT MANAGEMENT ENDPOINTS ====================

@router.get("/credit/wallets")
async def list_credit_wallets():
    """Admin: list all credit wallets with balances."""
    wallets = await db.credit_wallets.find({}, {'_id': 0}).to_list(1000)
    return wallets

@router.put("/credit/wallets/{gst_number}/edit")
async def edit_credit_wallet(gst_number: str, data: dict):
    """Admin: edit credit limit/balance for a business GSTIN. Password protected (0905)."""
    password = data.get('password', '')
    if password != '0905':
        raise HTTPException(status_code=403, detail="Invalid password")
    gstin = (gst_number or "").strip().upper()

    credit_limit = data.get('credit_limit')
    balance = data.get('balance')
    period_days = data.get('credit_period_days')
    
    update = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if credit_limit is not None:
        update['credit_limit'] = credit_limit
    if balance is not None:
        update['balance'] = balance
    if period_days is not None:
        try:
            p = int(period_days)
            update['credit_period_days'] = p if p in (30, 60, 90) else 30
        except (TypeError, ValueError):
            pass
    
    result = await db.credit_wallets.update_one({'gst_number': gstin}, {'$set': update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wallet not found for this GSTIN")
    
    return {"success": True, "message": f"Credit updated for {gstin}"}

@router.post("/credit/wallets/upsert")
async def upsert_credit_wallet(data: dict):
    """Admin: create or update a credit wallet for a single GSTIN.

    Used by the Credit Management UI's "Set Credit Limit by GST" flow —
    one-at-a-time alternative to the bulk CSV upload. Idempotent on GSTIN.

    Body:
      {
        password: "0905"             # same password gate as edit endpoint
        gst_number: "27AABCB1234C1Z5"
        credit_limit: 500000          # required, ≥ 0
        balance: 500000               # optional. defaults to credit_limit on create,
                                      #           OR keeps existing used-credit on update
        mode: "replace" | "topup"     # only matters when wallet exists. default "replace"
        company, name, email, lender, credit_period_days: optional metadata
      }

    Modes (when wallet already exists):
      - replace (default): credit_limit ← uploaded amount; balance ← uploaded amount
                           (resets used credit to 0 — Accounts override)
      - topup:             credit_limit ← old + uploaded; balance ← old_balance + uploaded
                           (preserves used credit — vendor extension)
    """
    if (data.get('password') or '').strip() != '0905':
        raise HTTPException(status_code=403, detail="Invalid password")

    gstin = (data.get('gst_number') or '').strip().upper().replace(' ', '')
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="GSTIN must be 15 characters")

    try:
        limit = float(data.get('credit_limit'))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="credit_limit must be a number")
    if limit < 0:
        raise HTTPException(status_code=400, detail="credit_limit must be ≥ 0")

    mode = (data.get('mode') or 'replace').strip().lower()
    if mode not in ('replace', 'topup'):
        raise HTTPException(status_code=400, detail="mode must be 'replace' or 'topup'")

    # credit_period_days: 30/60/90 — soft validation, default 30
    try:
        period_raw = int(data.get('credit_period_days') or 30)
    except (TypeError, ValueError):
        period_raw = 30
    period_days = period_raw if period_raw in (30, 60, 90) else 30

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.credit_wallets.find_one({'gst_number': gstin}, {'_id': 0})

    if existing:
        if mode == 'topup':
            new_limit = (existing.get('credit_limit') or 0) + limit
            new_balance = (existing.get('balance') or 0) + limit
        else:  # replace — Accounts override
            new_limit = limit
            # If admin explicitly passed `balance`, honour it; else reset.
            new_balance = float(data['balance']) if data.get('balance') is not None else limit

        update = {
            'credit_limit': new_limit,
            'balance': new_balance,
            'credit_period_days': period_days,
            'updated_at': now,
        }
        # Optional metadata — only overwrite if the caller actually sent it
        for k in ('company', 'name', 'email', 'lender'):
            if data.get(k):
                update[k] = (data[k] or '').strip().lower() if k == 'email' else (data[k] or '').strip()
        await db.credit_wallets.update_one({'gst_number': gstin}, {'$set': update})
        wallet = await db.credit_wallets.find_one({'gst_number': gstin}, {'_id': 0})
        return {"success": True, "created": False, "updated": True, "mode": mode, "wallet": wallet}

    # Create new wallet
    doc = {
        'gst_number': gstin,
        'email': (data.get('email') or '').strip().lower(),
        'name': (data.get('name') or '').strip(),
        'company': (data.get('company') or '').strip(),
        'credit_limit': limit,
        'balance': float(data['balance']) if data.get('balance') is not None else limit,
        'lender': (data.get('lender') or '').strip(),
        'credit_period_days': period_days,
        'created_at': now,
        'updated_at': now,
    }
    await db.credit_wallets.insert_one(doc.copy())
    doc.pop('_id', None)
    return {"success": True, "created": True, "updated": False, "mode": mode, "wallet": doc}


@router.get("/credit/wallets/lookup")
async def lookup_credit_wallet(gst_number: str = Query(...)):
    """Admin: lookup a single credit wallet by GSTIN. Returns wallet or
    {found: False} so the UI can decide whether to render an update or
    create form."""
    gstin = (gst_number or "").strip().upper().replace(' ', '')
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="GSTIN must be 15 characters")
    wallet = await db.credit_wallets.find_one({'gst_number': gstin}, {'_id': 0})
    if not wallet:
        return {"found": False, "gst_number": gstin}
    return {"found": True, "wallet": wallet}


@router.post("/credit/wallets/bulk-upload")
async def bulk_upload_credit_wallets(data: dict):
    """Admin: bulk upload credit wallets — GSTIN is the unique key.

    Body: { wallets: [{gst_number, name, company, email, credit_limit, lender}], mode: "replace" | "topup" }

    Modes:
      - "replace" (default): For new rows, create wallet with balance = credit_limit.
        For existing rows (matched on GSTIN), overwrite credit_limit and reset balance to that limit.
      - "topup": For new rows, create wallet with balance = credit_limit. For existing
        rows, ADD the uploaded credit_limit to the existing limit AND balance, preserving
        any used credit.
    """
    wallets = data.get('wallets', [])
    mode = (data.get('mode') or 'replace').strip().lower()
    if mode not in ('replace', 'topup'):
        raise HTTPException(status_code=400, detail="mode must be 'replace' or 'topup'")
    if not wallets:
        raise HTTPException(status_code=400, detail="No wallets provided")

    now = datetime.now(timezone.utc).isoformat()
    created = 0
    updated = 0
    skipped = []  # rows we couldn't ingest, with reason

    for idx, w in enumerate(wallets):
        gstin = (w.get('gst_number') or '').strip().upper()
        if len(gstin) != 15:
            skipped.append({'row': idx + 1, 'gst_number': gstin, 'reason': 'GSTIN must be 15 characters'})
            continue
        try:
            limit = float(w.get('credit_limit') or 0)
        except (TypeError, ValueError):
            skipped.append({'row': idx + 1, 'gst_number': gstin, 'reason': 'credit_limit not a number'})
            continue
        if limit < 0:
            skipped.append({'row': idx + 1, 'gst_number': gstin, 'reason': 'credit_limit must be ≥ 0'})
            continue

        # credit_period_days: 30/60/90 only. Defaults to 30 if missing or invalid.
        try:
            period_raw = int(w.get('credit_period_days') or 30)
        except (TypeError, ValueError):
            period_raw = 30
        period_days = period_raw if period_raw in (30, 60, 90) else 30

        existing = await db.credit_wallets.find_one({'gst_number': gstin})
        if existing:
            if mode == 'topup':
                new_limit = (existing.get('credit_limit') or 0) + limit
                new_balance = (existing.get('balance') or 0) + limit
            else:  # replace
                new_limit = limit
                new_balance = limit
            await db.credit_wallets.update_one(
                {'gst_number': gstin},
                {'$set': {
                    'credit_limit': new_limit,
                    'balance': new_balance,
                    'lender': w.get('lender') or existing.get('lender', ''),
                    'name': w.get('name') or existing.get('name', ''),
                    'company': w.get('company') or existing.get('company', ''),
                    'email': w.get('email') or existing.get('email', ''),
                    'credit_period_days': period_days,
                    'updated_at': now,
                }}
            )
            updated += 1
        else:
            await db.credit_wallets.insert_one({
                'gst_number': gstin,
                'email': (w.get('email') or '').strip().lower(),
                'name': w.get('name', '') or '',
                'company': w.get('company', '') or '',
                'credit_limit': limit,
                'balance': limit,
                'lender': w.get('lender', '') or '',
                'credit_period_days': period_days,
                'updated_at': now,
            })
            created += 1

    return {
        "success": True,
        "mode": mode,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total": created + updated,
    }



@router.get("/stats/summary")
async def get_order_stats():
    """Get order statistics"""
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": "payment_pending"})
    paid_orders = await db.orders.count_documents({"payment_status": "paid"})
    confirmed_orders = await db.orders.count_documents({"status": "confirmed"})
    shipped_orders = await db.orders.count_documents({"status": "shipped"})
    delivered_orders = await db.orders.count_documents({"status": "delivered"})
    
    # Calculate total revenue
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$total"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total_revenue"] if revenue_result else 0
    
    return {
        "total_orders": total_orders,
        "pending_payment": pending_orders,
        "paid": paid_orders,
        "confirmed": confirmed_orders,
        "shipped": shipped_orders,
        "delivered": delivered_orders,
        "total_revenue": round(total_revenue, 2)
    }

# ==================== WEBHOOK ENDPOINT ====================

@router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhook events"""
    try:
        payload = await request.body()
        signature = request.headers.get('X-Razorpay-Signature', '')
        webhook_secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
        
        # Verify webhook signature if secret is configured
        if webhook_secret:
            expected_signature = hmac.new(
                webhook_secret.encode('utf-8'),
                payload,
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(expected_signature, signature):
                logger.warning("Invalid webhook signature")
                raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Parse payload
        import json
        data = json.loads(payload)
        event = data.get('event', '')
        
        if event == 'payment.captured':
            payment = data.get('payload', {}).get('payment', {}).get('entity', {})
            razorpay_order_id = payment.get('order_id')
            razorpay_payment_id = payment.get('id')
            
            if razorpay_order_id:
                await db.orders.update_one(
                    {"razorpay_order_id": razorpay_order_id},
                    {"$set": {
                        "razorpay_payment_id": razorpay_payment_id,
                        "payment_status": "paid",
                        "status": "confirmed",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "paid_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                logger.info(f"Order {razorpay_order_id} marked as paid via webhook")
        
        elif event == 'payment.failed':
            payment = data.get('payload', {}).get('payment', {}).get('entity', {})
            razorpay_order_id = payment.get('order_id')
            
            if razorpay_order_id:
                await db.orders.update_one(
                    {"razorpay_order_id": razorpay_order_id},
                    {"$set": {
                        "payment_status": "failed",
                        "status": "payment_failed",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                logger.info(f"Order {razorpay_order_id} marked as failed via webhook")
        
        return {"status": "ok"}
    
    except Exception as e:
        logger.error(f"Webhook processing error: {str(e)}")
        return JSONResponse(status_code=200, content={"status": "error", "message": str(e)})

# ==================== INVOICE GENERATION ====================

# Authoritative state code → name map. Used to derive Place of Supply
# from the buyer's GSTIN first 2 digits (most reliable signal) or from
# the customer.state free-text as a fallback. Names match the official
# GST portal so the buyer's reconciliation will not flag mismatches.
GST_STATE_CODES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
    '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli',
    '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka',
    '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
    '37': 'Andhra Pradesh (New)', '38': 'Ladakh', '97': 'Other Territory',
    '99': 'Centre Jurisdiction',
}

# Locofast's seller GSTIN — used to compare against the buyer's state for
# the IGST vs CGST+SGST decision. Sourced from env so multi-state
# warehouses can be added later by storing per-order seller GSTIN on the
# order doc.
SELLER_GSTIN_DEFAULT = os.environ.get('LOCOFAST_SELLER_GSTIN', '07AADCL8794N1ZM')
SELLER_STATE_CODE_DEFAULT = SELLER_GSTIN_DEFAULT[:2] if SELLER_GSTIN_DEFAULT else '07'


def _state_code_from_state_text(state: str) -> str:
    """Reverse-lookup the 2-digit state code from the buyer's state name."""
    if not state:
        return ''
    s = state.strip().lower()
    for code, name in GST_STATE_CODES.items():
        if name.lower() == s:
            return code
    return ''


def _resolve_buyer_state(customer: dict) -> tuple[str, str]:
    """Return (state_code, state_name) for the buyer (billing).

    Kept for callers that only have customer info (no shipping address).

    Priority:
      1. GSTIN first 2 digits (most reliable — set by the GST portal)
      2. Customer.state free-text → reverse-lookup
      3. Empty fallback (caller must handle)
    """
    gst = (customer or {}).get('gst_number') or ''
    if gst and len(gst) >= 2 and gst[:2].isdigit():
        code = gst[:2]
        return code, GST_STATE_CODES.get(code, customer.get('state', '') or '')
    state_text = (customer or {}).get('state', '') or ''
    code = _state_code_from_state_text(state_text)
    return code, state_text


def _resolve_pos_state(order: dict, customer: dict) -> tuple[str, str]:
    """Return (state_code, state_name) for the Place of Supply.

    Indian GST rule (CGST Section 10): for goods supply, the Place of
    Supply is the LOCATION OF DELIVERY — i.e. the shipping address, not
    the buyer's billing address. So CGST+SGST vs IGST is decided by the
    shipping state, not by the buyer's billing GST.

    Resolution priority (most reliable first):
      1. ship_to.gst_number  → first 2 digits = state code
      2. ship_to.state       → reverse-lookup
      3. customer.gst_number → first 2 digits (fallback when no ship_to)
      4. customer.state      → reverse-lookup
      5. Empty (caller must handle)
    """
    ship_to = (order or {}).get('ship_to') or {}
    # 1) Ship-to GSTIN
    ship_gst = (ship_to.get('gst_number') or '').strip().upper()
    if ship_gst and len(ship_gst) >= 2 and ship_gst[:2].isdigit():
        code = ship_gst[:2]
        return code, GST_STATE_CODES.get(code, ship_to.get('state', '') or '')
    # 2) Ship-to state text
    ship_state = (ship_to.get('state') or '').strip()
    if ship_state:
        code = _state_code_from_state_text(ship_state)
        if code:
            return code, ship_state
    # 3 + 4) Fall back to billing
    return _resolve_buyer_state(customer)


def number_to_words(num: float) -> str:
    """Convert a rupee amount to Indian-format words.

    GST tax invoices MUST spell out the paise portion when present, so a
    value like ₹887.50 becomes "Eight Hundred Eighty Seven Rupees and
    Fifty Paise Only" — NOT "Eight Hundred and Eighty Eight Rupees Only"
    which is what `round()`-based legacy logic produced (causing buyer
    accounts-payable teams to reject invoices).
    """
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

    def _words_under_100(n):
        if n < 20:
            return ones[n]
        return tens[n // 10] + ('' if n % 10 == 0 else ' ' + ones[n % 10])

    def _words_under_1000(n):
        if n < 100:
            return _words_under_100(n)
        return ones[n // 100] + ' Hundred' + ('' if n % 100 == 0 else ' and ' + _words_under_100(n % 100))

    def _indian_words(n: int) -> str:
        """Convert a non-negative integer using the Indian numbering system."""
        if n == 0:
            return 'Zero'
        parts = []
        if n >= 10000000:
            parts.append(_words_under_100(n // 10000000) + ' Crore')
            n %= 10000000
        if n >= 100000:
            parts.append(_words_under_100(n // 100000) + ' Lakh')
            n %= 100000
        if n >= 1000:
            parts.append(_words_under_100(n // 1000) + ' Thousand')
            n %= 1000
        if n > 0:
            parts.append(_words_under_1000(n))
        return ' '.join(parts)

    if num is None:
        return 'Zero Rupees Only'
    # Split into integer rupees + integer paise WITHOUT rounding the
    # rupee portion (a 0.50 amount must NOT become 1).
    total_paise = int(round(float(num) * 100))
    rupees = total_paise // 100
    paise = total_paise % 100
    rupees_words = _indian_words(rupees) if rupees > 0 else 'Zero'
    rupee_unit = 'Rupee' if rupees == 1 else 'Rupees'
    paise_unit = 'Paisa' if paise == 1 else 'Paise'
    if paise > 0:
        return f"{rupees_words} {rupee_unit} and {_words_under_100(paise)} {paise_unit} Only"
    return f"{rupees_words} {rupee_unit} Only"

def generate_invoice_pdf(order: dict) -> io.BytesIO:
    """Generate a GST-compliant invoice PDF in Locofast brand style"""
    buffer = io.BytesIO()
    
    BRAND_BLUE = '#2563EB'
    BRAND_DARK = '#1e3a5f'
    LIGHT_BG = '#f0f5ff'
    
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=15*mm, leftMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, alignment=TA_LEFT, spaceAfter=0*mm, textColor=colors.HexColor(BRAND_BLUE), fontName='Helvetica-Bold')
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=11, spaceBefore=3*mm, spaceAfter=2*mm, textColor=colors.HexColor(BRAND_BLUE), fontName='Helvetica-Bold')
    normal_style = ParagraphStyle('CustomNormal', parent=styles['Normal'], fontSize=9, leading=12)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=11)
    bold_style = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=9, leading=12, fontName='Helvetica-Bold')

    # Resolve invoice date + number early so the header meta-block can use them.
    customer = order.get('customer', {})
    invoice_date_raw = order.get('paid_at') or order.get('created_at', '')
    invoice_date = ''
    if invoice_date_raw:
        try:
            invoice_date = invoice_date_raw[:10]
        except Exception:
            invoice_date = datetime.now().strftime('%Y-%m-%d')
    inv_number = order.get('order_number', 'N/A')
    pay_method = (order.get('payment_method', 'razorpay')).title()
    pay_status = (order.get('payment_status', 'N/A')).upper()

    # Header — logo + tagline LEFT, invoice meta block RIGHT with PAID badge
    paid_badge = (
        '<font color="#15803d" size="8"><b>● PAID</b></font>'
        if pay_status == 'PAID' else
        f'<font color="#b45309" size="8"><b>● {pay_status}</b></font>'
    )
    left_brand = (
        f'<font color="{BRAND_BLUE}" size="20"><b>LOCOFAST</b></font><br/>'
        f'<font color="#64748b" size="9">B2B Fabric Sourcing Platform</font>'
    )
    right_meta = (
        f'<font color="#64748b" size="8">INVOICE DATE</font><br/>'
        f'<font size="10"><b>{invoice_date}</b></font><br/>'
        f'<font color="#64748b" size="8">INVOICE NO</font><br/>'
        f'<font size="10"><b>{inv_number}</b></font><br/>'
        f'<font color="#64748b" size="8">PAYMENT</font><br/>'
        f'<font size="10"><b>{pay_method}</b></font> &nbsp; {paid_badge}'
    )
    header_tbl = Table(
        [[Paragraph(left_brand, ParagraphStyle('lb', parent=styles['Normal'], fontSize=10, leading=14)),
          Paragraph(right_meta, ParagraphStyle('rm', parent=styles['Normal'], fontSize=9, leading=13, alignment=TA_RIGHT))]],
        colWidths=[110*mm, 70*mm]
    )
    header_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 5*mm))
    
    # Tax Invoice Banner
    elements.append(Paragraph("TAX INVOICE", ParagraphStyle('InvoiceTitle', parent=styles['Heading1'], fontSize=13, alignment=TA_CENTER, textColor=colors.white, backColor=colors.HexColor(BRAND_BLUE), borderPadding=5, spaceBefore=2*mm, spaceAfter=5*mm, fontName='Helvetica-Bold')))
    
    # Invoice details now appear in the top-right meta block of the
    # header. We resolve POS state here for the items / tax breakdown.
    
    # Resolve PLACE OF SUPPLY (drives IGST vs CGST+SGST and the POS line).
    # Per CGST Section 10, POS for goods = shipping state, not the buyer's
    # billing state. So we look at ship_to first, falling back to billing.
    buyer_state_code, buyer_state_name = _resolve_pos_state(order, customer)
    is_interstate = bool(buyer_state_code) and buyer_state_code != SELLER_STATE_CODE_DEFAULT
    pos_label = (
        f"{buyer_state_name} ({buyer_state_code})" if buyer_state_code
        else (customer.get('state') or 'Not specified')
    )

    # Seller and Buyer Details
    seller_info = f"""<b>Sold By:</b><br/>
    LOCOFAST ONLINE SERVICES PRIVATE LIMITED<br/>
    First Floor, Khasra No 385, Deskconnect<br/>
    100 Feet Road, Opp. Corporation Bank<br/>
    Ghitorni, New Delhi - 110030<br/>
    <b>State Code:</b> {SELLER_STATE_CODE_DEFAULT} ({GST_STATE_CODES.get(SELLER_STATE_CODE_DEFAULT, 'Delhi')})<br/>
    <b>GSTIN:</b> {SELLER_GSTIN_DEFAULT}<br/>
    <b>Email:</b> mail@locofast.com<br/>
    <b>Phone:</b> +91-8920392418"""

    gst_line = ''
    cust_gst = customer.get('gst_number', '')
    if cust_gst:
        gst_line = f'<b>GSTIN:</b> {cust_gst}<br/>'

    # Bill-To shows the BILLING state derived purely from the buyer's
    # billing GST/state (independent of where goods are shipped).
    bill_state_code, bill_state_name = _resolve_buyer_state(customer)
    bill_state_line = (
        f'<b>State Code:</b> {bill_state_code} ({bill_state_name})<br/>' if bill_state_code else ''
    )

    # Bill To — print the TRADE NAME (company, populated from GST trade
    # name) as the primary line on the invoice; fall back to contact name
    # when there's no company on file (rare — pre-GST verification orders).
    # The customer's contact name is added as "Attn:" so the document
    # still names a real person.
    bill_company = (customer.get('company') or '').strip()
    bill_contact = (customer.get('name') or '').strip()
    bill_primary = bill_company or bill_contact or 'N/A'
    bill_attn_line = (
        f"Attn: {bill_contact}<br/>"
        if bill_company and bill_contact and bill_contact.lower() != bill_company.lower()
        else ''
    )
    buyer_info = f"""<b>Bill To:</b><br/>
    {bill_primary}<br/>
    {bill_attn_line}{gst_line}{customer.get('address', 'N/A')}<br/>
    {customer.get('city', '')}, {customer.get('state', '')}<br/>
    PIN: {customer.get('pincode', 'N/A')}<br/>
    {bill_state_line}<b>Phone:</b> {customer.get('phone', 'N/A')}<br/>
    <b>Email:</b> {customer.get('email', 'N/A')}"""

    # Ship-To block — only included when different from billing. Most B2C
    # orders only have one address; multi-address brand checkouts pass
    # `ship_to_*` keys on the order doc.
    ship_to = order.get('ship_to') or {}
    ship_addr = ship_to.get('address') or order.get('ship_to_address') or ''
    if ship_addr and ship_addr.strip() != (customer.get('address') or '').strip():
        ship_gst_line = f"<b>GSTIN:</b> {ship_to.get('gst_number')}<br/>" if ship_to.get('gst_number') else ''
        # POS state-code line for the ship-to block — this is the state
        # that drives CGST vs IGST on this invoice (per CGST §10 — goods
        # supply POS = location of delivery).
        ship_state_line = (
            f"<b>State Code:</b> {buyer_state_code} ({buyer_state_name})<br/>"
            if buyer_state_code else ''
        )
        # Ship To — same convention as Bill To: company (trade name)
        # leads, contact name appears as "Attn:" line.
        ship_company = (ship_to.get('company') or '').strip()
        ship_contact = (ship_to.get('name') or customer.get('name') or '').strip()
        ship_primary = ship_company or ship_contact or 'N/A'
        ship_attn_line = (
            f"Attn: {ship_contact}<br/>"
            if ship_company and ship_contact and ship_contact.lower() != ship_company.lower()
            else ''
        )
        ship_info = f"""<b>Ship To:</b><br/>
        {ship_primary}<br/>
        {ship_attn_line}{ship_gst_line}{ship_addr}<br/>
        {ship_to.get('city') or order.get('ship_to_city', '')}, {ship_to.get('state') or order.get('ship_to_state', '')}<br/>
        PIN: {ship_to.get('pincode') or order.get('ship_to_pincode', '')}<br/>
        {ship_state_line}"""
        address_table = Table([
            [Paragraph(seller_info, small_style), Paragraph(buyer_info, small_style), Paragraph(ship_info, small_style)]
        ], colWidths=[60*mm, 60*mm, 60*mm])
    else:
        address_table = Table([
            [Paragraph(seller_info, small_style), Paragraph(buyer_info, small_style)]
        ], colWidths=[90*mm, 90*mm])
    address_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#dbeafe')),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#dbeafe')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(LIGHT_BG)),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(address_table)
    elements.append(Spacer(1, 3*mm))

    # Mandatory GST invoice metadata — Place of Supply + Reverse Charge.
    # Both are required on every Indian tax invoice (Rule 46 of CGST Rules).
    meta_table = Table([[
        Paragraph(f"<b>Place of Supply:</b> {pos_label}", small_style),
        Paragraph("<b>Reverse Charge:</b> No", small_style),
        Paragraph(f"<b>Tax Type:</b> {'IGST (Inter-state)' if is_interstate else 'CGST + SGST (Intra-state)'}", small_style),
    ]], colWidths=[80*mm, 40*mm, 60*mm])
    meta_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#dbeafe')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 5*mm))
    
    # Items Table
    elements.append(Paragraph("Order Items", heading_style))
    
    items_data = [['#', 'Description', 'HSN', 'Qty', 'Rate (₹)', 'Delivery', 'Amount (₹)']]
    
    items = order.get('items', [])
    has_bulk_items = False
    
    for idx, item in enumerate(items, 1):
        qty = item.get('quantity', 0)
        rate = item.get('price_per_meter', 0)
        amount = qty * rate
        order_type = item.get('order_type', '').lower()
        unit = item.get('unit') or 'm'
        
        # Description with SKU + Type sublines (matches the desired layout)
        desc_main = f"<b>{item.get('fabric_name', 'Fabric')}</b>"
        meta_bits = []
        if item.get('fabric_code'):
            meta_bits.append(f"SKU: {item.get('fabric_code')}")
        if item.get('color_name'):
            meta_bits.append(f"Color: {item.get('color_name')}")
        if order_type:
            meta_bits.append(f"Type: {order_type.title()}")
        sub = f"<br/><font size='7' color='#64748b'>{' · '.join(meta_bits)}</font>" if meta_bits else ""
        description = Paragraph(desc_main + sub, small_style)
        
        # HSN code: use item-specific if set, fallback to a category-aware
        # default. 540799 ONLY applies to synthetic-filament woven fabrics —
        # using it as a global default caused buyer-side HSN mismatches.
        # We now infer a safer default from the item's name; sellers should
        # still set the precise HSN on each fabric (validated on the seller
        # form).
        hsn = item.get('hsn_code', '')
        if not hsn:
            name = (item.get('fabric_name') or '').lower()
            if 'cotton' in name:
                hsn = '5208'   # Woven cotton fabrics (most common default for this catalog)
            elif 'denim' in name:
                hsn = '5209'   # Cotton denim
            elif 'linen' in name:
                hsn = '5309'   # Woven linen
            elif 'silk' in name:
                hsn = '5007'   # Woven silk
            elif 'wool' in name:
                hsn = '5111'   # Woven wool
            elif 'poly' in name or 'synth' in name:
                hsn = '5407'   # Synthetic filament woven
            else:
                hsn = '5208'   # Default to cotton (catalog is cotton-heavy)
        
        if order_type == 'sample':
            lead_time = "Ready Stock"
        else:
            has_bulk_items = True
            lead_time = item.get('dispatch_timeline') or "15-20 days"
        
        items_data.append([
            str(idx),
            description,
            hsn,
            f"{qty}{unit}",
            f"Rs {rate:,.2f}/{unit}",
            lead_time,
            f"Rs {amount:,.2f}"
        ])
    
    items_table = Table(items_data, colWidths=[8*mm, 54*mm, 18*mm, 18*mm, 24*mm, 25*mm, 28*mm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(BRAND_BLUE)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),
        ('ALIGN', (2, 1), (2, -1), 'CENTER'),
        ('ALIGN', (3, 1), (3, -1), 'CENTER'),
        ('ALIGN', (4, 1), (4, -1), 'RIGHT'),
        ('ALIGN', (5, 1), (5, -1), 'CENTER'),
        ('ALIGN', (6, 1), (6, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dbeafe')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(LIGHT_BG)]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 3*mm))
    
    if has_bulk_items:
        bulk_note = """<b>Dispatch commitments:</b> In-stock bulk orders are packaged &amp; dispatched within 24–48 hours.
        Manufactured-to-order items typically dispatch within ~30 days of order confirmation &amp; payment.
        You will receive tracking details once the order leaves our warehouse."""
        elements.append(Paragraph(bulk_note, ParagraphStyle('BulkNote', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#b45309'), backColor=colors.HexColor('#fef3c7'), borderPadding=5, leading=9)))
        elements.append(Spacer(1, 3*mm))
    
    elements.append(Spacer(1, 2*mm))
    
    # Totals
    subtotal = order.get('subtotal', 0)
    tax = order.get('tax', 0)
    discount = order.get('discount', 0)
    logistics = order.get('logistics_charge', 0)
    packaging = order.get('packaging_charge', 0)
    logistics_only = order.get('logistics_only_charge', 0)
    total = order.get('total', 0)

    # ── v2 ordering rule (Feb 2026+): packaging + logistics are part of
    # the taxable value (Schedule II of CGST Act — bundled supply).
    # Legacy orders (no flag) keep the historical presentation so we
    # don't lie about what was actually charged.
    is_v2 = bool(order.get('tax_on_charges_v2'))
    totals_data = []

    if is_v2:
        # New presentation: Order Value → Packaging → Logistics → Gross
        # Value → GST → Total Invoice Value. Packaging/logistics are part
        # of the taxable supply per Schedule II of the CGST Act.
        totals_data.append(['Order Value:', f"Rs {subtotal:,.2f}"])
        if packaging > 0:
            totals_data.append(['Packaging:', f"Rs {packaging:,.2f}"])
        eff_log = logistics_only if (logistics_only > 0) else logistics
        if eff_log > 0:
            totals_data.append(['Logistics:', f"Rs {eff_log:,.2f}"])
        taxable_value = order.get('taxable_value') or round(subtotal + packaging + eff_log, 2)
        totals_data.append(['Gross Value:', f"Rs {taxable_value:,.2f}"])
        if is_interstate:
            totals_data.append(['IGST (5%):', f"Rs {tax:,.2f}"])
        else:
            cgst = round(tax / 2, 2)
            sgst = round(tax - cgst, 2)
            totals_data.append(['CGST (2.5%):', f"Rs {cgst:,.2f}"])
            totals_data.append(['SGST (2.5%):', f"Rs {sgst:,.2f}"])
    else:
        # Legacy orders — same visual sequence so the invoice format is
        # consistent across vintages, but the math note remains that
        # packaging/logistics were NOT part of the taxable value on
        # these historical invoices.
        totals_data.append(['Order Value:', f"Rs {subtotal:,.2f}"])
        if packaging > 0 and logistics_only > 0:
            totals_data.append(['Packaging:', f"Rs {packaging:,.2f}"])
            totals_data.append(['Logistics:', f"Rs {logistics_only:,.2f}"])
        elif logistics > 0:
            totals_data.append(['Logistics:', f"Rs {logistics:,.2f}"])
        else:
            totals_data.append(['Logistics:', 'FREE (Included)'])
        # Gross value here = subtotal + charges (charges weren't taxed
        # in legacy, so this row is for readability only).
        legacy_gross = round(subtotal + packaging + (logistics_only if logistics_only > 0 else logistics), 2)
        totals_data.append(['Gross Value:', f"Rs {legacy_gross:,.2f}"])
        if is_interstate:
            totals_data.append(['IGST (5%):', f"Rs {tax:,.2f}"])
        else:
            cgst = tax / 2
            sgst = tax / 2
            totals_data.append(['CGST (2.5%):', f"Rs {cgst:,.2f}"])
            totals_data.append(['SGST (2.5%):', f"Rs {sgst:,.2f}"])

    if discount > 0:
        coupon = order.get('coupon', {})
        coupon_code = coupon.get('code', 'DISCOUNT') if coupon else 'DISCOUNT'
        totals_data.append([f'Coupon ({coupon_code}):', f"-Rs {discount:,.2f}"])

    totals_data.append(['Total Invoice Value:', f"Rs {total:,.2f}"])
    
    totals_table = Table(totals_data, colWidths=[44*mm, 36*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        # All rows in brand blue — matches the desired mockup. Total row
        # stays bolder so the eye lands on it.
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor(BRAND_BLUE)),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 10),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor(BRAND_BLUE)),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))

    # Authorised signatory (left) + totals stack (right), like the mockup.
    signatory = Paragraph(
        '<font size="9"><b>For LOCOFAST ONLINE SERVICES PRIVATE LIMITED</b></font><br/><br/><br/>'
        '<font size="9" color="#64748b">_________________________</font><br/>'
        '<font size="9"><b>Authorised Signatory</b></font>',
        ParagraphStyle('Sig', parent=styles['Normal'], fontSize=9, leading=12, alignment=TA_LEFT)
    )
    sig_and_totals = Table([[signatory, totals_table]], colWidths=[100*mm, 80*mm])
    sig_and_totals.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(sig_and_totals)
    elements.append(Spacer(1, 4*mm))
    
    # Amount in Words — boxed for emphasis
    amount_words = number_to_words(total)
    elements.append(Paragraph(
        f"<b>Amount in Words:</b> {amount_words}",
        ParagraphStyle('AmountWords', parent=styles['Normal'], fontSize=9, backColor=colors.HexColor(LIGHT_BG), borderColor=colors.HexColor('#dbeafe'), borderWidth=0.5, borderPadding=6, leading=12)
    ))
    elements.append(Spacer(1, 5*mm))
    
    # Terms and Conditions
    elements.append(Paragraph("Terms &amp; Conditions", heading_style))
    terms = """
    i) Goods once sold will not be taken back or exchanged.<br/>
    ii) Orders once placed cannot be cancelled.<br/>
    iii) As per industry standards, L99 is acceptable quantity and hence no refunds will be issued in such cases.<br/>
    iv) For finished goods, upto 2 inch width short each side is in the acceptable range and no debit will be accepted.<br/>
    v) All disputes are subject to Delhi jurisdiction only.<br/>
    vi) Payment must be made in full before dispatch of goods.<br/>
    vii) Delivery timelines are estimates and may vary based on availability.<br/>
    viii) E&amp;OE (Errors and Omissions Excepted).<br/>
    ix) This is a computer-generated invoice and does not require a physical signature.<br/><br/>
    <b>For any queries, contact us at:</b><br/>
    Email: mail@locofast.com | Phone: +91-8920392418
    """
    elements.append(Paragraph(terms, ParagraphStyle('Terms', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#64748b'), leading=10)))
    
    elements.append(Spacer(1, 10*mm))
    
    # Footer
    elements.append(Paragraph(
        "Thank you for your business! | www.locofast.com | mail@locofast.com | +91-8920392418",
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#94a3b8'))
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

@router.get("/{order_id}/invoice")
async def get_invoice(order_id: str):
    """Generate and download invoice PDF for an order. `order_id` accepts
    either the UUID `id` or the human-readable `order_number` (URL-encoded
    if it contains slashes — e.g. `LF%2FORD%2F014`)."""
    # Find order — match by UUID, plain order_number, or URL-decoded variant
    decoded = order_id.replace("%2F", "/").replace("%2f", "/")
    order = await db.orders.find_one(
        {"$or": [
            {"id": order_id},
            {"order_number": order_id},
            {"order_number": decoded},
        ]},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Only allow invoice for paid orders
    if order.get('payment_status') != 'paid':
        raise HTTPException(status_code=400, detail="Invoice available only for paid orders")
    
    # Generate PDF
    try:
        pdf_buffer = generate_invoice_pdf(order)
        
        # Return as downloadable file
        filename = f"Invoice_{order.get('order_number', order_id)}.pdf"
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "application/pdf"
            }
        )
    except Exception as e:
        logger.error(f"Failed to generate invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice: {str(e)}")


@router.get("/{order_id}/packing-slip")
async def download_packing_slip(order_id: str, request: Request):
    """Vendor / Admin: download a PDF packing slip listing every roll
    individually. Vendors see only their own items; admins see all.
    Available once at least one item has been marked goods-ready."""
    caller_role, caller_sid = await _resolve_vendor_caller(request)
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validate caller has at least one item on this order
    if caller_role == "vendor":
        item_sids = {(it.get("seller_id") or "") for it in (order.get("items") or [])}
        if caller_sid not in item_sids:
            raise HTTPException(status_code=403, detail="You have no items on this order")

    # Need *something* to render — either rolls or actual quantity. We
    # allow generation even before goods-ready so vendors can pre-print,
    # but warn the caller via response header.
    has_ready_data = any(
        (it.get("dispatch_rolls") or it.get("actual_quantity") is not None or it.get("quantity"))
        for it in (order.get("items") or [])
    )
    if not has_ready_data:
        raise HTTPException(status_code=400, detail="No quantity data on this order yet")

    from packing_slip import generate_packing_slip_pdf
    try:
        pdf = generate_packing_slip_pdf(order, seller_id=(caller_sid or None) if caller_role == "vendor" else None)
    except Exception as e:  # noqa: BLE001
        logger.error(f"Packing slip generation failed for {order_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate packing slip")

    filename = f"PackingSlip_{order.get('order_number', order_id)}.pdf"
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "application/pdf",
        },
    )


# ==================== PROFORMA INVOICE (Bangladesh/Export) ====================

async def generate_pi_number() -> str:
    """Generate PI number in format LF/EX/PI/25-26/XXX"""
    year_now = datetime.now(timezone.utc).year
    fy = f"{str(year_now)[-2:]}-{str(year_now + 1)[-2:]}"
    count = await db.orders.count_documents({"dispatch_country": "bangladesh"})
    return f"LF/EX/PI/{fy}/{count + 1:03d}"


def generate_pi_pdf(order: dict) -> io.BytesIO:
    """Generate Proforma Invoice PDF for Bangladesh/export orders."""
    buffer = io.BytesIO()

    BRAND_BLUE = '#2563EB'

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=12*mm, leftMargin=12*mm,
        topMargin=12*mm, bottomMargin=12*mm
    )

    elements = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('PITitle', parent=styles['Heading1'], fontSize=16, alignment=TA_CENTER, spaceAfter=2*mm, textColor=colors.HexColor(BRAND_BLUE), fontName='Helvetica-Bold')
    normal = ParagraphStyle('PIBody', parent=styles['Normal'], fontSize=8, leading=11)
    bold_style = ParagraphStyle('PIBold', parent=styles['Normal'], fontSize=8, leading=11, fontName='Helvetica-Bold')
    small_style = ParagraphStyle('PISmall', parent=styles['Normal'], fontSize=7, leading=9)
    header_style = ParagraphStyle('PIHeader', parent=styles['Normal'], fontSize=9, leading=12, fontName='Helvetica-Bold', textColor=colors.HexColor('#1e3a5f'))

    # Header
    elements.append(Paragraph("PROFORMA INVOICE", title_style))
    elements.append(Spacer(1, 2*mm))

    # Company + PI Info
    pi_number = order.get('pi_number', '')
    pi_date = order.get('created_at', '')
    if isinstance(pi_date, str):
        try:
            pi_date = datetime.fromisoformat(pi_date.replace('Z', '+00:00')).strftime('%d/%m/%Y')
        except Exception:
            pi_date = datetime.now().strftime('%d/%m/%Y')
    else:
        pi_date = pi_date.strftime('%d/%m/%Y') if pi_date else datetime.now().strftime('%d/%m/%Y')

    company_info = [
        [Paragraph("<b>Locofast Online Services Pvt Ltd</b>", bold_style),
         Paragraph(f"<b>PI No:</b> {pi_number}", normal)],
        [Paragraph("First Floor, Khasra No 385, Deskconnect<br/>100 Feet Road, Opp. Corporation Bank, Ghitorni,<br/>New Delhi, Delhi - 110030, India<br/>GSTIN: 07AADCL8794N1ZM<br/>Email: creditoperations@locofast.com", small_style),
         Paragraph(f"<b>Date:</b> {pi_date}<br/><b>Payment:</b> LC 90 days from date of LR<br/><b>Validity:</b> 15 Days From PI Date", normal)],
    ]
    company_table = Table(company_info, colWidths=[100*mm, 70*mm])
    company_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(company_table)
    elements.append(Spacer(1, 4*mm))

    # Bill To / Ship To — trade name (company) leads, contact as "Attn:".
    customer = order.get('customer', {})
    pi_company = (customer.get('company') or '').strip()
    pi_contact = (customer.get('name') or '').strip()
    pi_bill_primary = pi_company or pi_contact
    pi_bill_attn = f"Attn: {pi_contact}<br/>" if pi_company and pi_contact and pi_contact.lower() != pi_company.lower() else ""
    pi_ship_contact = (customer.get('shipping_name') or customer.get('name') or '').strip()
    pi_ship_primary = pi_company or pi_ship_contact
    pi_ship_attn = f"Attn: {pi_ship_contact}<br/>" if pi_company and pi_ship_contact and pi_ship_contact.lower() != pi_company.lower() else ""
    bill_ship = [
        [Paragraph("<b>Bill To</b>", header_style), Paragraph("<b>Ship To</b>", header_style)],
        [Paragraph(f"{pi_bill_primary}<br/>{pi_bill_attn}{customer.get('address', '')}<br/>{customer.get('city', '')}, {customer.get('state', '')}<br/>{customer.get('email', '')}", small_style),
         Paragraph(f"{pi_ship_primary}<br/>{pi_ship_attn}{customer.get('shipping_address', customer.get('address', ''))}<br/>{customer.get('shipping_city', customer.get('city', ''))}, {customer.get('shipping_state', customer.get('state', ''))}", small_style)],
    ]
    bill_table = Table(bill_ship, colWidths=[85*mm, 85*mm])
    bill_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f5ff')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(bill_table)
    elements.append(Spacer(1, 4*mm))

    # Items table
    usd_rate = order.get('usd_rate', 0.0119)
    items = order.get('items', [])
    METERS_TO_YARDS = 1.0936

    table_header = ['Item & Description', 'HSN/SAC', 'Qty (Yards)', 'Rate (USD/Yard)', 'Amount (USD)']
    table_data = [table_header]

    total_usd = 0
    for item in items:
        qty_m = item.get('quantity', 0)
        price_inr = item.get('price_per_meter', 0)
        qty_yards = round(qty_m * METERS_TO_YARDS, 2)
        rate_usd_yard = round(price_inr * usd_rate / METERS_TO_YARDS, 4)
        amount_usd = round(qty_yards * rate_usd_yard, 2)
        total_usd += amount_usd

        # Build color suffix if present (multi-color SKU selections)
        _color_suffix = f" | Color: {item.get('color_name')}" if item.get('color_name') else ""
        table_data.append([
            Paragraph(f"{item.get('fabric_name', '')}<br/><font size='6' color='#64748b'>{item.get('category_name', '')} | {item.get('fabric_code', '')}{_color_suffix}</font>", small_style),
            item.get('hsn_code', ''),
            f"{qty_yards:,.2f}",
            f"${rate_usd_yard:,.4f}",
            f"${amount_usd:,.2f}",
        ])

    items_table = Table(table_data, colWidths=[65*mm, 20*mm, 25*mm, 30*mm, 30*mm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(BRAND_BLUE)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 3*mm))

    # Bangladesh charges
    bd = order.get('bangladesh_charges') or {}
    border = bd.get('border_logistics', 0)
    export_doc = bd.get('export_documentation', 0)
    customs = bd.get('custom_clearance', 0)
    border_usd = round(border * usd_rate, 2) if border else 0
    export_doc_usd = round(export_doc * usd_rate, 2) if export_doc else 0
    customs_usd = round(customs * usd_rate, 2) if customs else 0

    grand_total_usd = round(total_usd + border_usd + export_doc_usd + customs_usd, 2)

    totals_data = [
        ['Subtotal (Fabric)', f'${total_usd:,.2f}'],
        ['Border Logistics (1%)', f'${border_usd:,.2f}'],
        ['Export Documentation (0.40%)', f'${export_doc_usd:,.2f}'],
        ['Custom Clearance (1.05%)', f'${customs_usd:,.2f}'],
        ['IGST (0%)', '$0.00'],
    ]
    totals_data.append(['GRAND TOTAL (USD)', f'${grand_total_usd:,.2f}'])

    totals_table = Table(totals_data, colWidths=[130*mm, 40*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor(BRAND_BLUE)),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor(BRAND_BLUE)),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 3*mm))

    # Shipment Notes
    notes = [
        "Goods country of origin - India",
        "ETD Mill - (30) Days from the Date of LC Issue",
        "Port of Loading - Petrapole, India",
        "Port of Discharge - Benapole, Bangladesh",
        "ETA Benapole - (45) Days from the Date of LC Issue",
        "Incoterms 2020 - CPT Benapole",
        "Production will start after receiving of Confirm LC from buyer",
        "All quantities are in Yards and all amounts are in USD",
        "Tolerance acceptable - (\u00b1) 5% in quantity and amount",
    ]
    elements.append(Paragraph("<b>Shipment Details</b>", header_style))
    for n in notes:
        elements.append(Paragraph(f"• {n}", small_style))
    elements.append(Spacer(1, 3*mm))

    # Bank Details
    elements.append(Paragraph("<b>Bank Details</b>", header_style))
    bank_info = "Standard Chartered Bank | SWIFT: SCBLINBBXXX | A/c No: 53005089578 | IFSC: SCBL0036024"
    elements.append(Paragraph(bank_info, small_style))
    elements.append(Spacer(1, 3*mm))

    # Terms
    tc_items = [
        "Delivery timelines are strictly linked to the date of LC/TT or client's Purchase Order or Locofast's Proforma Invoice, whichever is later",
        "In case of any fabric anomaly or quality issue, report in writing via email within 15 days of shipment date else it will be deemed that the goods have been accepted by the Buyer.",
        "Locofast reserves the right to reject any debit request received for any consignment that is not returned in its original state/packing.",
        "Advance received is non-refundable.",
        "Usance interest - In case of delayed payment beyond the maturity date, LC applicant / beneficiary bank shall be liable to pay interest at a rate of 18% per annum on the outstanding amount or 250 USD whichever is higher",
        "A tolerance of upto 5% in terms of wastage should be acceptable as processing is a value addition job & there are chances of shrinkage that may lead to wastage",
        "LC or TT once generated cannot be cancelled and goods once sold will not be taken back.",
        "Risk of damage to or loss of the Goods shall pass to the client in accordance with the relevant provision of Incoterms",
        "All required testing parameters must be verified at the FOB/sampling stage. Any deficiencies in testing will not be accepted once the final goods are delivered",
    ]
    elements.append(Paragraph("<b>Terms & Conditions</b>", header_style))
    for i, tc in enumerate(tc_items, 1):
        elements.append(Paragraph(f"{i}. {tc}", small_style))

    elements.append(Spacer(1, 5*mm))

    # Authorized Signature
    sig_style = ParagraphStyle('SigLabel', parent=small_style, alignment=2, fontSize=8)  # RIGHT aligned
    elements.append(Paragraph("For Locofast Online Services Private Limited", sig_style))
    elements.append(Spacer(1, 2*mm))

    # Add signature image
    import os
    sig_path = os.path.join(os.path.dirname(__file__), 'assets', 'signature.png')
    if os.path.exists(sig_path):
        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import Image as RLImage
        sig_img = RLImage(sig_path, width=40*mm, height=20*mm)
        sig_img.hAlign = 'RIGHT'
        elements.append(sig_img)
    elements.append(Spacer(1, 1*mm))
    elements.append(Paragraph("Director", sig_style))
    elements.append(Paragraph("Authorized Signature", ParagraphStyle('AuthSig', parent=small_style, alignment=2, fontSize=7, fontName='Helvetica-Bold')))

    doc.build(elements)
    buffer.seek(0)
    return buffer


@router.post("/confirm-export")
async def confirm_export_order(order_data: OrderCreate, request: Request):
    """Create a Bangladesh/export order — no payment, generates PI. Customer confirms and downloads PI."""

    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    pi_number = await generate_pi_number()
    order_number = pi_number

    totals = calculate_totals(order_data.items, order_data.logistics_charge, order_data.packaging_charge, order_data.logistics_only_charge)
    discount = order_data.discount or 0
    final_total = max(0, totals["total"] - discount)

    # Get Bangladesh charges from shared cart if available
    bangladesh_charges = None
    usd_rate = None
    if order_data.shared_cart_token:
        cart = await db.shared_carts.find_one({'token': order_data.shared_cart_token}, {'_id': 0})
        if cart:
            bangladesh_charges = cart.get('bangladesh_charges')
            usd_rate = cart.get('usd_rate')

    if not usd_rate:
        from agent_router import get_usd_rate
        usd_rate = await get_usd_rate()

    # Calculate Bangladesh charges if not from shared cart
    if not bangladesh_charges:
        subtotal = totals["subtotal"]
        border_logistics = round(subtotal * 0.01, 2)
        export_documentation = round(subtotal * 0.004, 2)
        custom_clearance = round(subtotal * 0.0105, 2)
        bangladesh_charges = {
            "border_logistics_pct": 1.0, "border_logistics": border_logistics,
            "export_documentation_pct": 0.40, "export_documentation": export_documentation,
            "custom_clearance_pct": 1.05, "custom_clearance": custom_clearance,
            "total_extra_charges": round(border_logistics + export_documentation + custom_clearance, 2),
            "inr_to_usd_rate": usd_rate, "subtotal_inr": subtotal,
            "subtotal_usd": round(subtotal * usd_rate, 2),
        }

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "pi_number": pi_number,
        "items": [item.model_dump() for item in order_data.items],
        "customer": order_data.customer.model_dump(),
        "subtotal": totals["subtotal"],
        "tax": 0,
        "logistics_charge": totals["logistics_charge"],
        "packaging_charge": totals["packaging_charge"],
        "logistics_only_charge": totals["logistics_only_charge"],
        "discount": discount,
        "total": final_total,
        "currency": "USD",
        "dispatch_country": "bangladesh",
        "bangladesh_charges": bangladesh_charges,
        "usd_rate": usd_rate,
        "status": "pi_issued",
        "payment_status": "pending_lc",
        "payment_method": "lc_90_days",
        "booking_type": "assisted_online" if order_data.agent_id else "online",
        "agent_id": order_data.agent_id,
        "agent_email": order_data.agent_email,
        "agent_name": order_data.agent_name,
        "razorpay_order_id": "",
        "razorpay_payment_id": "",
        "razorpay_signature": "",
        "awb_code": None,
        "notes": order_data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "paid_at": ""
    }

    await db.orders.insert_one(order_doc)

    # Mark shared cart as completed
    if order_data.shared_cart_token:
        await db.shared_carts.update_one(
            {'token': order_data.shared_cart_token},
            {'$set': {'status': 'completed', 'order_id': order_id, 'updated_at': now.isoformat()}}
        )

    return {
        "order_id": order_id,
        "order_number": order_number,
        "pi_number": pi_number,
        "status": "pi_issued",
        "dispatch_country": "bangladesh",
    }


@router.get("/{order_id}/proforma-invoice")
async def get_proforma_invoice(order_id: str):
    """Download Proforma Invoice PDF for an export order."""
    order = await db.orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get('dispatch_country') != 'bangladesh':
        raise HTTPException(status_code=400, detail="Proforma Invoice only available for export orders")

    pdf_buffer = generate_pi_pdf(order)
    pi_num = order.get('pi_number', order_id).replace('/', '-')
    filename = f"PI_{pi_num}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "application/pdf"
        }
    )
