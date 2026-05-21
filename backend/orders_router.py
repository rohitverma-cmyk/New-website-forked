"""
Orders Router - Handles order creation, payment, and management
Phase 1: Razorpay Integration + Order Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
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

from email_router import send_order_notification_emails
import auth_helpers

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
    
    # Create Razorpay order
    try:
        razorpay_order = razorpay_client.order.create({
            "amount": int(final_total * 100),  # Amount in paise
            "currency": "INR",
            "receipt": order_number,
            "notes": {
                "order_id": order_id,
                "customer_email": order_data.customer.email,
                "customer_name": order_data.customer.name
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
        "payment_status": "initiated",
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
        "amount": final_total,
        "amount_paise": int(final_total * 100),
        "currency": "INR",
        "customer": order_data.customer.model_dump()
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
    
    # Update order as paid
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"razorpay_order_id": verification.razorpay_order_id},
        {"$set": {
            "razorpay_payment_id": verification.razorpay_payment_id,
            "razorpay_signature": verification.razorpay_signature,
            "payment_status": "paid",
            "status": "confirmed",
            "updated_at": now,
            "paid_at": now
        }}
    )
    
    # Deduct inventory (best effort)
    try:
        for item in order["items"]:
            await db.fabrics.update_one(
                {"id": item["fabric_id"], "quantity_available": {"$gte": item["quantity"]}},
                {"$inc": {"quantity_available": -item["quantity"]}}
            )
    except Exception as e:
        logger.error(f"Failed to update inventory: {str(e)}")
    
    # Create Shiprocket shipment (best effort, non-blocking)
    # First, split into child orders if multi-vendor
    child_orders = []
    try:
        child_orders = await split_order_into_child_orders(order)
    except Exception as e:
        logger.warning(f"Failed to split multi-vendor order {order.get('order_number')}: {e}")

    # Fire Shiprocket pushes — one per child (or parent if no split)
    shiprocket_targets = child_orders or [order]
    for tgt in shiprocket_targets:
        try:
            shiprocket_result = await create_shiprocket_shipment(tgt)
            if shiprocket_result.get("success"):
                await db.orders.update_one(
                    {"id": tgt["id"]},
                    {"$set": {
                        "shiprocket_order_id": str(shiprocket_result.get("order_id") or shiprocket_result.get("shiprocket_order_id") or ""),
                        "shiprocket_shipment_id": shiprocket_result.get("shipment_id"),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                logger.info(f"Shiprocket shipment created for {tgt['order_number']}")
        except Exception as e:
            logger.error(f"Failed to create Shiprocket shipment for {tgt.get('order_number')}: {str(e)}")

    # Materialize vendor payouts (one per seller in the order)
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
    """
    try:
        result = await create_shiprocket_shipment(order)
        if not result.get("success"):
            logger.warning(f"[shiprocket-auto] {order.get('order_number')} failed: {result.get('error')}")
            return
        sr_order_id = result.get("order_id") or result.get("shiprocket_order_id")
        update = {
            "shiprocket_order_id": str(sr_order_id) if sr_order_id is not None else None,
            "shiprocket_shipment_id": result.get("shipment_id"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if result.get("awb_code"):
            update["awb_code"] = result["awb_code"]
        if result.get("courier_name"):
            update["courier_name"] = result["courier_name"]
        await db.orders.update_one({"id": order["id"]}, {"$set": update})
        logger.info(f"[shiprocket-auto] {order.get('order_number')} pushed · sr={sr_order_id}")
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


async def create_shiprocket_shipment(order: dict) -> dict:
    """Create a shipment in Shiprocket after payment is confirmed.

    Routing rule (per business spec):
      • Bulk order (all items have order_type == "production")
            → push to Shiprocket Cargo (B2B / LTL freight).
      • Sample or mixed order
            → push to Shiprocket Courier (B2C / standard parcels) — existing flow.

    Cargo and Courier responses are normalized into the same envelope
    on the order doc so downstream UI/PDF/payouts code doesn't care
    which vertical handled the shipment.
    """
    try:
        # ── Vertical routing — Cargo for bulk, Courier for everything else ──
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
        items = order.get("items", [])
        ship_to = order.get("ship_to") or {}

        if not customer or not items:
            return {"success": False, "error": "Missing customer or items"}

        # ── Resolve vendor pickup (Ship-From) ──
        # Resolution order:
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
        seller_id = (order.get("seller_id") or seller_id_from_items or "").strip()
        seller_doc = await db.sellers.find_one({"id": seller_id}, {"_id": 0}) if seller_id else None
        pickup_nickname = None
        if seller_doc:
            sel_addresses = seller_doc.get("pickup_addresses", []) or []
            chosen = None
            order_addr_id = order.get("pickup_address_id")
            if order_addr_id:
                chosen = next((a for a in sel_addresses if a.get("id") == order_addr_id), None)
            if not chosen:
                chosen = next((a for a in sel_addresses if a.get("is_primary")), None) or (sel_addresses[0] if sel_addresses else None)
            if chosen and chosen.get("shiprocket_nickname"):
                pickup_nickname = chosen["shiprocket_nickname"]
        if not pickup_nickname:
            pickup_nickname = await _ensure_vendor_pickup_nickname(seller_doc or {})

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

        req = CreateOrderRequest(
            order_id=order.get("order_number", order.get("id")),
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
            sub_total=float(order.get("subtotal", 0)),
        )

        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            service = OrderService(client, headers)
            result = await service.create_order(req)

        return {"success": True, **result}

    except Exception as e:
        logger.error(f"Error creating Shiprocket shipment: {str(e)}")
        return {"success": False, "error": str(e)}


# ────────────────────────────────────────────────────────────────────
#  ADMIN — Manual "Push to Shiprocket" for orders that didn't auto-push
#  (e.g. older orders created before the auth bug fix, credit-paid B2C
#  orders that aren't on the auto-push path, etc.)
# ────────────────────────────────────────────────────────────────────
@router.post("/admin/{order_id}/push-to-shiprocket")
async def admin_push_to_shiprocket(order_id: str, force: bool = False):
    """Admin-only — manually push an order to Shiprocket. Idempotent by
    default: re-pushing an already-pushed order returns the existing
    Shiprocket IDs unless `force=true` is passed (which creates a new SR
    shipment — useful only if the original SR record was deleted).

    Matches the auth pattern of /status and /cancel endpoints in this
    router — frontend admin layout is route-protected.
    """
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Short-circuit if already pushed
    if not force and order.get("shiprocket_order_id"):
        return {
            "success": True,
            "already_pushed": True,
            "shiprocket_order_id": order.get("shiprocket_order_id"),
            "shipment_id": order.get("shiprocket_shipment_id"),
            "message": "Order is already in Shiprocket",
        }

    result = await create_shiprocket_shipment(order)
    if not result.get("success"):
        # Surface the underlying error so the admin can fix the order
        # (e.g. missing pincode, address too short, etc.) and retry.
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or "Shiprocket push failed",
        )

    # Persist the new SR identifiers on the order doc so future webhooks
    # can match this order back.
    sr_order_id = result.get("order_id") or result.get("shiprocket_order_id")
    shipment_id = result.get("shipment_id")
    set_fields = {
        "shiprocket_order_id": str(sr_order_id) if sr_order_id is not None else None,
        "shiprocket_shipment_id": shipment_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if result.get("awb_code"):
        set_fields["awb_code"] = result["awb_code"]
    if result.get("courier_name"):
        set_fields["courier_name"] = result["courier_name"]

    await db.orders.update_one({"id": order["id"]}, {"$set": set_fields})
    logger.info(f"[shiprocket] manual push ok · order={order.get('order_number')} sr={sr_order_id} shipment={shipment_id}")

    return {
        "success": True,
        "already_pushed": False,
        "shiprocket_order_id": str(sr_order_id) if sr_order_id is not None else None,
        "shipment_id": shipment_id,
        "awb_code": result.get("awb_code") or "",
        "courier_name": result.get("courier_name") or "",
        "message": "Order pushed to Shiprocket successfully",
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
#  ADMIN — Edit Order
# ────────────────────────────────────────────────────────────────────
class OrderEditPayload(BaseModel):
    """Partial edit payload. Any field omitted is left unchanged.
    Per business rules:
      • Item prices are NOT auto-repriced when the vendor changes —
        admin's responsibility to update separately if needed.
      • Recompute totals after edits (since ship_to state may have
        flipped IGST↔CGST+SGST).
      • Recompute commission + seller_payout after vendor changes —
        new vendor may attract a different commission rule.
      • If the order was already pushed to Shiprocket, cancel the old
        shipment and create a new one (with the new vendor's pickup
        address + new shipping address).
    """
    items: Optional[List[OrderItem]] = None
    customer: Optional[CustomerInfo] = None
    ship_to: Optional[ShipTo] = None
    seller_id: Optional[str] = None
    seller_company: Optional[str] = None
    # Pickup-address selector: must be one of the seller's saved
    # `pickup_addresses[].id`. Set to "" to fall back to the seller's
    # primary. Free-form addresses are no longer supported here.
    pickup_address_id: Optional[str] = None
    notes: Optional[str] = None
    repush_shiprocket: bool = True  # set False to skip the Shiprocket re-push


def _compute_totals_from_items(items: List[dict], gst_rate: float = 0.05) -> dict:
    """Mirror of the order-creation totals math so edits don't drift."""
    subtotal = 0.0
    for it in items:
        try:
            subtotal += float(it.get("price_per_meter") or 0) * float(it.get("quantity") or 0)
        except (TypeError, ValueError):
            pass
    tax = round(subtotal * gst_rate, 2)
    total = round(subtotal + tax, 2)
    return {"subtotal": round(subtotal, 2), "tax": tax, "total": total}


@router.patch("/{order_id}/edit")
async def admin_edit_order(
    order_id: str,
    payload: OrderEditPayload,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Admin: edit an existing order. Tracks a full diff in `order_edits`.

    If the order's status is `delivered` or `cancelled`, edits are
    rejected to preserve audit integrity. All other statuses can be
    edited — when the order has already been pushed to Shiprocket and
    Shiprocket-impacting fields change (items, ship_to, vendor), the old
    SR shipment is cancelled and a new one is created against the
    (possibly new) vendor's pickup address.
    """
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("status") in ("delivered", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit a {order['status']} order. Reopen or cancel-and-recreate instead.",
        )

    update: dict = {}
    changed: dict = {}  # before/after diff for the audit trail
    now = datetime.now(timezone.utc).isoformat()

    if payload.items is not None:
        new_items = [it.model_dump() for it in payload.items]
        if new_items != order.get("items"):
            update["items"] = new_items
            changed["items"] = {"before": order.get("items", []), "after": new_items}

    if payload.customer is not None:
        new_customer = payload.customer.model_dump()
        if new_customer != order.get("customer"):
            update["customer"] = new_customer
            changed["customer"] = {"before": order.get("customer", {}), "after": new_customer}

    if payload.ship_to is not None:
        new_ship_to = payload.ship_to.model_dump()
        if all(not (v or "").strip() for v in new_ship_to.values() if isinstance(v, str)):
            new_ship_to = None
        if new_ship_to != order.get("ship_to"):
            update["ship_to"] = new_ship_to
            changed["ship_to"] = {"before": order.get("ship_to"), "after": new_ship_to}

    vendor_changed = False
    if payload.seller_id is not None and payload.seller_id != (order.get("seller_id") or ""):
        # Look up the target vendor — accept active OR inactive (admin
        # may legitimately want to reassign to a soft-disabled vendor
        # for back-office corrections). Frontend lists active only.
        new_seller = await db.sellers.find_one({"id": payload.seller_id}, {"_id": 0})
        if not new_seller:
            # Defensive: also try matching by `_id` (legacy / Mongo ObjectId
            # string) so a frontend cache miss doesn't silently 404.
            from bson import ObjectId  # local import — never used elsewhere in this hot path
            try:
                new_seller = await db.sellers.find_one({"_id": ObjectId(payload.seller_id)}, {"_id": 0})
            except Exception:
                new_seller = None
        if not new_seller:
            raise HTTPException(
                status_code=404,
                detail=f"Target vendor not found (id={payload.seller_id}). "
                       f"It may have been deleted or is missing from the sellers collection.",
            )
        update["seller_id"] = payload.seller_id
        update["seller_company"] = new_seller.get("company_name") or payload.seller_company or ""
        changed["seller_id"] = {"before": order.get("seller_id", ""), "after": payload.seller_id}
        changed["seller_company"] = {
            "before": order.get("seller_company", ""),
            "after": update["seller_company"],
        }
        # Stamp seller_id onto every item. Prices stay per business rule.
        items_now = update.get("items") or order.get("items", [])
        items_now = [
            {**it, "seller_id": payload.seller_id, "seller_company": update["seller_company"]}
            for it in items_now
        ]
        update["items"] = items_now
        if "items" in changed:
            changed["items"]["after"] = items_now
        vendor_changed = True

    if payload.notes is not None and payload.notes != order.get("notes", ""):
        update["notes"] = payload.notes
        changed["notes"] = {"before": order.get("notes", ""), "after": payload.notes}

    # Pickup-address selector — must reference one of the SELLER's
    # saved pickup_addresses (after any seller_id change above).
    # Empty string clears the per-order override, falling back to the
    # seller's Primary.
    if payload.pickup_address_id is not None and payload.pickup_address_id != order.get("pickup_address_id", ""):
        new_pid = (payload.pickup_address_id or "").strip()
        if new_pid:
            # Determine effective seller (post-edit)
            effective_seller_id = update.get("seller_id") or order.get("seller_id") or ""
            if not effective_seller_id:
                raise HTTPException(400, "Order has no seller — cannot set pickup address")
            seller = await db.sellers.find_one({"id": effective_seller_id}, {"_id": 0})
            if not seller:
                raise HTTPException(404, "Seller not found")
            addrs = seller.get("pickup_addresses", []) or []
            if not any(a.get("id") == new_pid for a in addrs):
                raise HTTPException(
                    400,
                    "Pickup address not found on this seller. Add it under Sellers → Pickup Addresses first.",
                )
        update["pickup_address_id"] = new_pid
        changed["pickup_address_id"] = {
            "before": order.get("pickup_address_id", ""),
            "after": new_pid,
        }

    if not changed:
        return {"success": True, "no_changes": True, "order": order}

    # Recompute totals after the edits
    items_for_totals = update.get("items") or order.get("items", [])
    totals = _compute_totals_from_items(items_for_totals)
    if (
        totals["subtotal"] != order.get("subtotal")
        or totals["tax"] != order.get("tax")
        or totals["total"] != order.get("total")
    ):
        update.update(totals)
        changed["totals"] = {
            "before": {k: order.get(k) for k in ("subtotal", "tax", "total")},
            "after": totals,
        }

    # Recompute commission + seller_payout when items OR vendor change.
    # A new vendor may attract a vendor-specific commission rule, and
    # quantity/price edits change the commission base — keeping the
    # stale values would show wrong payouts in the order detail panel.
    if changed.get("items") or vendor_changed:
        try:
            from commission_router import calculate_commission
            commission_info = await calculate_commission(
                {"source": order.get("source", "")},
                items_for_totals,
            )
            new_subtotal = update.get("subtotal", order.get("subtotal", 0))
            new_commission_pct = commission_info["commission_pct"]
            new_commission_amount = commission_info["commission_amount"]
            new_rule = commission_info["rule_applied"]
            new_seller_payout = round(new_subtotal - new_commission_amount, 2)
            commission_diff = {
                "before": {
                    "commission_pct": order.get("commission_pct"),
                    "commission_amount": order.get("commission_amount"),
                    "commission_rule": order.get("commission_rule"),
                    "seller_payout": order.get("seller_payout"),
                },
                "after": {
                    "commission_pct": new_commission_pct,
                    "commission_amount": new_commission_amount,
                    "commission_rule": new_rule,
                    "seller_payout": new_seller_payout,
                },
            }
            # Only persist when at least one field actually changed
            if commission_diff["before"] != commission_diff["after"]:
                update["commission_pct"] = new_commission_pct
                update["commission_amount"] = new_commission_amount
                update["commission_rule"] = new_rule
                update["seller_payout"] = new_seller_payout
                changed["commission"] = commission_diff
        except Exception as e:
            logger.warning(f"[order-edit] commission recompute failed for {order.get('order_number')}: {e}")

    update["updated_at"] = now
    update["last_edited_by"] = admin.get("email", "")
    update["last_edited_at"] = now

    await db.orders.update_one({"id": order["id"]}, {"$set": update})

    audit = {
        "id": str(uuid.uuid4()),
        "order_id": order["id"],
        "order_number": order.get("order_number", ""),
        "edited_by": admin.get("email", ""),
        "edited_at": now,
        "changed_fields": list(changed.keys()),
        "diff": changed,
    }
    await db.order_edits.insert_one(audit.copy())
    audit.pop("_id", None)

    sr_result = None
    sr_impacting = bool(
        changed.get("items") or changed.get("ship_to") or changed.get("seller_id")
        or changed.get("customer")
    )
    if payload.repush_shiprocket and sr_impacting:
        existing_sr = order.get("shiprocket_order_id")
        if existing_sr:
            cancel_res = await _cancel_shiprocket_order_safe(existing_sr)
            logger.info(f"[order-edit] cancel old SR for {order.get('order_number')}: {cancel_res}")
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {
                    "shiprocket_order_id": None,
                    "shiprocket_shipment_id": None,
                    "awb_code": "",
                    "courier_name": "",
                }},
            )
        fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        push_res = await create_shiprocket_shipment(fresh)
        sr_result = push_res
        if push_res.get("success"):
            sr_order_id = push_res.get("order_id") or push_res.get("shiprocket_order_id")
            sr_update = {
                "shiprocket_order_id": str(sr_order_id) if sr_order_id is not None else None,
                "shiprocket_shipment_id": push_res.get("shipment_id"),
            }
            if push_res.get("awb_code"):
                sr_update["awb_code"] = push_res["awb_code"]
            if push_res.get("courier_name"):
                sr_update["courier_name"] = push_res["courier_name"]
            await db.orders.update_one({"id": order["id"]}, {"$set": sr_update})

    if vendor_changed:
        old_payouts = await db.vendor_payouts.find(
            {"order_id": order["id"]}, {"_id": 0}
        ).to_list(10)
        for op in old_payouts:
            if op.get("status") == "paid":
                logger.warning(
                    f"[order-edit] vendor changed but payout {op['id']} is already PAID — flagged for manual review"
                )
                await db.vendor_payouts.update_one(
                    {"id": op["id"]},
                    {"$set": {
                        "needs_review": True,
                        "review_reason": f"Vendor changed by {admin.get('email','')} after payout was paid",
                        "updated_at": now,
                    }},
                )
            else:
                await db.vendor_payouts.update_one(
                    {"id": op["id"]},
                    {"$set": {
                        "status": "cancelled",
                        "cancelled_reason": "Vendor reassigned via order edit",
                        "cancelled_at": now,
                        "cancelled_by": admin.get("email", ""),
                    }},
                )

    fresh_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return {
        "success": True,
        "order": fresh_order,
        "audit": audit,
        "shiprocket": sr_result,
        "vendor_changed": vendor_changed,
    }


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
    
    return {"success": True, "message": f"Order cancelled: {reason_labels.get(reason, reason)}"}

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
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, alignment=TA_CENTER, spaceAfter=2*mm, textColor=colors.HexColor(BRAND_BLUE), fontName='Helvetica-Bold')
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=11, spaceBefore=3*mm, spaceAfter=2*mm, textColor=colors.HexColor(BRAND_BLUE), fontName='Helvetica-Bold')
    normal_style = ParagraphStyle('CustomNormal', parent=styles['Normal'], fontSize=9, leading=12)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=11)
    bold_style = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=9, leading=12, fontName='Helvetica-Bold')
    
    # Header
    elements.append(Paragraph("LOCOFAST", title_style))
    elements.append(Paragraph("B2B Fabric Sourcing Platform", ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#64748b'))))
    elements.append(Spacer(1, 4*mm))
    
    # Tax Invoice Banner
    elements.append(Paragraph("TAX INVOICE", ParagraphStyle('InvoiceTitle', parent=styles['Heading1'], fontSize=13, alignment=TA_CENTER, textColor=colors.white, backColor=colors.HexColor(BRAND_BLUE), borderPadding=5, spaceBefore=2*mm, spaceAfter=5*mm, fontName='Helvetica-Bold')))
    
    # Invoice Details
    customer = order.get('customer', {})
    invoice_date = order.get('paid_at') or order.get('created_at', '')
    if invoice_date:
        try:
            invoice_date = invoice_date[:10]
        except:
            invoice_date = datetime.now().strftime('%Y-%m-%d')
    
    inv_number = order.get('order_number', 'N/A')
    
    invoice_details = [
        ['Invoice No:', inv_number, 'Invoice Date:', invoice_date],
        ['Payment Method:', (order.get('payment_method', 'razorpay')).title(), 'Payment Status:', order.get('payment_status', 'N/A').upper()],
    ]
    
    invoice_table = Table(invoice_details, colWidths=[28*mm, 52*mm, 30*mm, 50*mm])
    invoice_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor(BRAND_BLUE)),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor(BRAND_BLUE)),
    ]))
    elements.append(invoice_table)
    elements.append(Spacer(1, 5*mm))
    
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

    buyer_info = f"""<b>Bill To:</b><br/>
    {customer.get('name', 'N/A')}<br/>
    {customer.get('company', '') + '<br/>' if customer.get('company') else ''}
    {gst_line}{customer.get('address', 'N/A')}<br/>
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
        ship_company = ship_to.get('company', '')
        ship_info = f"""<b>Ship To:</b><br/>
        {ship_to.get('name') or customer.get('name', 'N/A')}<br/>
        {(ship_company + '<br/>') if ship_company else ''}{ship_gst_line}{ship_addr}<br/>
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
    
    items_data = [['#', 'Description', 'HSN Code', 'Qty (m)', 'Rate (₹/m)', 'Lead Time', 'Amount (₹)']]
    
    items = order.get('items', [])
    has_bulk_items = False
    
    for idx, item in enumerate(items, 1):
        qty = item.get('quantity', 0)
        rate = item.get('price_per_meter', 0)
        amount = qty * rate
        order_type = item.get('order_type', '').lower()
        
        description = f"{item.get('fabric_name', 'Fabric')}"
        if item.get('fabric_code'):
            description += f"\nCode: {item.get('fabric_code')}"
        if item.get('color_name'):
            description += f"\nColor: {item.get('color_name')}"
        if order_type:
            description += f"\nType: {order_type.title()}"
        
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
            Paragraph(description, small_style),
            hsn,
            str(qty),
            f"Rs {rate:,.2f}",
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
        # Goods subtotal first, then charges, then taxable value, then GST.
        totals_data.append(['Goods Subtotal:', f"Rs {subtotal:,.2f}"])
        if packaging > 0:
            totals_data.append(['Packaging Charge:', f"Rs {packaging:,.2f}"])
        eff_log = logistics_only if (logistics_only > 0) else logistics
        if eff_log > 0:
            totals_data.append(['Logistics Charge:', f"Rs {eff_log:,.2f}"])
        taxable_value = order.get('taxable_value') or round(subtotal + packaging + eff_log, 2)
        totals_data.append(['Taxable Value:', f"Rs {taxable_value:,.2f}"])
        if is_interstate:
            totals_data.append(['IGST (5%):', f"Rs {tax:,.2f}"])
        else:
            cgst = round(tax / 2, 2)
            sgst = round(tax - cgst, 2)
            totals_data.append(['CGST (2.5%):', f"Rs {cgst:,.2f}"])
            totals_data.append(['SGST (2.5%):', f"Rs {sgst:,.2f}"])
    else:
        # Legacy presentation — preserves exactly what these old orders
        # were charged at checkout (packaging/logistics were NOT taxed).
        totals_data.append(['Subtotal:', f"Rs {subtotal:,.2f}"])
        if is_interstate:
            totals_data.append(['IGST (5%):', f"Rs {tax:,.2f}"])
        else:
            cgst = tax / 2
            sgst = tax / 2
            totals_data.append(['CGST (2.5%):', f"Rs {cgst:,.2f}"])
            totals_data.append(['SGST (2.5%):', f"Rs {sgst:,.2f}"])
        if packaging > 0 and logistics_only > 0:
            totals_data.append(['Packaging:', f"Rs {packaging:,.2f}"])
            totals_data.append(['Logistics:', f"Rs {logistics_only:,.2f}"])
        elif logistics > 0:
            totals_data.append(['Logistics:', f"Rs {logistics:,.2f}"])
        else:
            totals_data.append(['Logistics:', 'FREE (Included)'])

    if discount > 0:
        coupon = order.get('coupon', {})
        coupon_code = coupon.get('code', 'DISCOUNT') if coupon else 'DISCOUNT'
        totals_data.append([f'Coupon ({coupon_code}):', f"-Rs {discount:,.2f}"])

    totals_data.append(['TOTAL:', f"Rs {total:,.2f}"])
    
    totals_table = Table(totals_data, colWidths=[130*mm, 46*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor(BRAND_BLUE)),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor(BRAND_BLUE)),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 3*mm))
    
    # Amount in Words (paise-aware)
    amount_words = number_to_words(total)
    elements.append(Paragraph(
        f"<b>Amount in Words:</b> {amount_words}",
        ParagraphStyle('AmountWords', parent=styles['Normal'], fontSize=9, backColor=colors.HexColor(LIGHT_BG), borderPadding=5)
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

    # Bill To / Ship To
    customer = order.get('customer', {})
    bill_ship = [
        [Paragraph("<b>Bill To</b>", header_style), Paragraph("<b>Ship To</b>", header_style)],
        [Paragraph(f"{customer.get('name', '')}<br/>{customer.get('company', '')}<br/>{customer.get('address', '')}<br/>{customer.get('city', '')}, {customer.get('state', '')}<br/>{customer.get('email', '')}", small_style),
         Paragraph(f"{customer.get('shipping_name', customer.get('name', ''))}<br/>{customer.get('shipping_address', customer.get('address', ''))}<br/>{customer.get('shipping_city', customer.get('city', ''))}, {customer.get('shipping_state', customer.get('state', ''))}", small_style)],
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
