"""
Orders Router - Handles order creation, payment, and management
Phase 1: Razorpay Integration + Order Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
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

from shiprocket_service import shiprocket_service
from email_router import send_order_notification_emails

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
    """Calculate order totals"""
    subtotal = sum(item.quantity * item.price_per_meter for item in items)
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax + logistics_charge, 2)
    return {
        "subtotal": round(subtotal, 2),
        "tax": tax,
        "logistics_charge": round(logistics_charge, 2),
        "packaging_charge": round(packaging_charge, 2),
        "logistics_only_charge": round(logistics_only_charge, 2),
        "total": total
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

    # Credit payment path
    if order_data.payment_method == "credit":
        wallet = await db.credit_wallets.find_one({'email': order_data.customer.email}, {'_id': 0})
        if not wallet or wallet.get('balance', 0) < final_total:
            raise HTTPException(status_code=400, detail="Insufficient credit balance")
        
        # Deduct from wallet
        new_balance = wallet['balance'] - final_total
        await db.credit_wallets.update_one(
            {'email': order_data.customer.email},
            {'$set': {'balance': new_balance, 'updated_at': now}}
        )
        
        # Log transaction
        await db.credit_transactions.insert_one({
            'id': str(uuid.uuid4()),
            'email': order_data.customer.email,
            'order_id': order_id,
            'order_number': order_number,
            'type': 'debit',
            'amount': final_total,
            'balance_after': new_balance,
            'created_at': now
        })
        
        # Create order as paid
        order_doc = {
            "id": order_id,
            "order_number": order_number,
            "items": [item.model_dump() for item in order_data.items],
            "customer": order_data.customer.model_dump(),
            "subtotal": totals["subtotal"],
            "tax": totals["tax"],
            "logistics_charge": totals["logistics_charge"],
            "packaging_charge": totals["packaging_charge"],
            "logistics_only_charge": totals["logistics_only_charge"],
            "discount": discount,
            "coupon": order_data.coupon.model_dump() if order_data.coupon else None,
            "total": final_total,
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
        
        # Send confirmation emails
        try:
            await send_order_notification_emails(db, order_doc)
        except Exception as e:
            logger.warning(f"Failed to send order emails: {e}")
        
        return {
            "order_id": order_id,
            "order_number": order_number,
            "payment_method": "credit",
            "amount": final_total,
            "currency": "INR",
            "status": "confirmed",
            "customer": order_data.customer.model_dump()
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
        "subtotal": totals["subtotal"],
        "tax": totals["tax"],
        "logistics_charge": totals["logistics_charge"],
        "packaging_charge": totals["packaging_charge"],
        "logistics_only_charge": totals["logistics_only_charge"],
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
    try:
        shiprocket_result = await create_shiprocket_shipment(order)
        if shiprocket_result.get("success"):
            await db.orders.update_one(
                {"razorpay_order_id": verification.razorpay_order_id},
                {"$set": {
                    "shiprocket_order_id": shiprocket_result.get("shiprocket_order_id"),
                    "shiprocket_shipment_id": shiprocket_result.get("shipment_id"),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            logger.info(f"Shiprocket shipment created for order {order['order_number']}")
    except Exception as e:
        logger.error(f"Failed to create Shiprocket shipment: {str(e)}")
    
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
        "order": updated_order
    }


async def create_shiprocket_shipment(order: dict) -> dict:
    """Create a shipment in Shiprocket after payment is confirmed"""
    try:
        customer = order.get("customer", {})
        items = order.get("items", [])
        
        if not customer or not items:
            return {"success": False, "error": "Missing customer or items"}
        
        # Prepare order items for Shiprocket
        shiprocket_items = []
        total_quantity = 0
        for item in items:
            shiprocket_items.append({
                "name": item.get("fabric_name", "Fabric"),
                "sku": item.get("fabric_code") or item.get("fabric_id", "")[:8],
                "units": 1,  # Each order item is 1 unit
                "selling_price": item.get("price_per_meter", 0) * item.get("quantity", 1),
                "hsn": "5407"  # HSN code for fabrics
            })
            total_quantity += item.get("quantity", 1)
        
        # Calculate weight (0.3 kg per meter, min 0.5 kg)
        weight_kg = max(0.5, total_quantity * 0.3)
        
        # Get pickup location from shipping info or default
        pickup_location = "Primary"  # Default pickup location name in Shiprocket
        
        result = await shiprocket_service.create_order(
            order_id=order.get("order_number", order.get("id")),
            order_date=datetime.now().strftime("%Y-%m-%d %H:%M"),
            pickup_location=pickup_location,
            billing_customer_name=customer.get("name", ""),
            billing_phone=customer.get("phone", ""),
            billing_address=customer.get("address", ""),
            billing_city=customer.get("city", ""),
            billing_state=customer.get("state", ""),
            billing_pincode=customer.get("pincode", ""),
            billing_email=customer.get("email", ""),
            shipping_customer_name=customer.get("name", ""),
            shipping_phone=customer.get("phone", ""),
            shipping_address=customer.get("address", ""),
            shipping_city=customer.get("city", ""),
            shipping_state=customer.get("state", ""),
            shipping_pincode=customer.get("pincode", ""),
            order_items=shiprocket_items,
            payment_method="Prepaid",  # Always prepaid since Razorpay handles payment
            sub_total=order.get("subtotal", 0),
            length=40,  # Default package dimensions for fabric
            breadth=30,
            height=15,
            weight=weight_kg
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error creating Shiprocket shipment: {str(e)}")
        return {"success": False, "error": str(e)}

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
    
    # If paid via credit, refund the balance
    if order.get('payment_method') == 'credit' and order.get('payment_status') == 'paid':
        email = order.get('customer', {}).get('email', '')
        if email:
            wallet = await db.credit_wallets.find_one({'email': email})
            if wallet:
                new_balance = wallet.get('balance', 0) + order.get('total', 0)
                await db.credit_wallets.update_one(
                    {'email': email},
                    {'$set': {'balance': new_balance, 'updated_at': now}}
                )
                await db.credit_transactions.insert_one({
                    'id': str(uuid.uuid4()),
                    'email': email,
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

@router.put("/credit/wallets/{email}/edit")
async def edit_credit_wallet(email: str, data: dict):
    """Admin: edit credit limit for a customer. Password protected (0905)."""
    password = data.get('password', '')
    if password != '0905':
        raise HTTPException(status_code=403, detail="Invalid password")
    
    credit_limit = data.get('credit_limit')
    balance = data.get('balance')
    
    update = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if credit_limit is not None:
        update['credit_limit'] = credit_limit
    if balance is not None:
        update['balance'] = balance
    
    result = await db.credit_wallets.update_one({'email': email}, {'$set': update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    return {"success": True, "message": f"Credit updated for {email}"}

@router.post("/credit/wallets/bulk-upload")
async def bulk_upload_credit_wallets(data: dict):
    """Admin: bulk upload credit wallets.

    Body: { wallets: [{email, name, company, credit_limit, lender}], mode: "replace" | "topup" }

    Modes:
      - "replace" (default): For new rows, create wallet with balance = credit_limit.
        For existing rows, overwrite credit_limit and reset balance to that limit
        (this is the legacy behaviour — useful when admin uploads a fresh truth table).
      - "topup": For new rows, create wallet with balance = credit_limit. For existing
        rows, ADD the uploaded credit_limit to the existing limit AND balance, preserving
        any used credit. Useful for monthly top-ups from lenders.
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
        email = (w.get('email') or '').strip().lower()
        if not email or '@' not in email:
            skipped.append({'row': idx + 1, 'email': email, 'reason': 'invalid email'})
            continue
        try:
            limit = float(w.get('credit_limit') or 0)
        except (TypeError, ValueError):
            skipped.append({'row': idx + 1, 'email': email, 'reason': 'credit_limit not a number'})
            continue
        if limit < 0:
            skipped.append({'row': idx + 1, 'email': email, 'reason': 'credit_limit must be ≥ 0'})
            continue

        existing = await db.credit_wallets.find_one({'email': email})
        if existing:
            if mode == 'topup':
                new_limit = (existing.get('credit_limit') or 0) + limit
                new_balance = (existing.get('balance') or 0) + limit
            else:  # replace
                new_limit = limit
                new_balance = limit
            await db.credit_wallets.update_one(
                {'email': email},
                {'$set': {
                    'credit_limit': new_limit,
                    'balance': new_balance,
                    'lender': w.get('lender') or existing.get('lender', ''),
                    'name': w.get('name') or existing.get('name', ''),
                    'company': w.get('company') or existing.get('company', ''),
                    'updated_at': now,
                }}
            )
            updated += 1
        else:
            await db.credit_wallets.insert_one({
                'email': email,
                'name': w.get('name', '') or '',
                'company': w.get('company', '') or '',
                'credit_limit': limit,
                'balance': limit,
                'lender': w.get('lender', '') or '',
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

def number_to_words(num: float) -> str:
    """Convert number to words (Indian format)"""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    if num == 0:
        return 'Zero'
    
    num = int(round(num))
    
    def words_under_100(n):
        if n < 20:
            return ones[n]
        return tens[n // 10] + ('' if n % 10 == 0 else ' ' + ones[n % 10])
    
    def words_under_1000(n):
        if n < 100:
            return words_under_100(n)
        return ones[n // 100] + ' Hundred' + ('' if n % 100 == 0 else ' and ' + words_under_100(n % 100))
    
    # Indian numbering: Crores, Lakhs, Thousands, Hundreds
    if num >= 10000000:  # Crores
        crores = num // 10000000
        remainder = num % 10000000
        result = words_under_100(crores) + ' Crore'
        if remainder:
            result += ' ' + number_to_words(remainder)
        return result
    elif num >= 100000:  # Lakhs
        lakhs = num // 100000
        remainder = num % 100000
        result = words_under_100(lakhs) + ' Lakh'
        if remainder:
            result += ' ' + number_to_words(remainder)
        return result
    elif num >= 1000:  # Thousands
        thousands = num // 1000
        remainder = num % 1000
        result = words_under_100(thousands) + ' Thousand'
        if remainder:
            result += ' ' + words_under_1000(remainder)
        return result
    else:
        return words_under_1000(num)

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
    
    # Seller and Buyer Details
    seller_info = """<b>Sold By:</b><br/>
    LOCOFAST ONLINE SERVICES PRIVATE LIMITED<br/>
    First Floor, Khasra No 385, Deskconnect<br/>
    100 Feet Road, Opp. Corporation Bank<br/>
    Ghitorni, New Delhi - 110030<br/>
    <b>GSTIN:</b> 07AADCL8794N1ZM<br/>
    <b>Email:</b> mail@locofast.com<br/>
    <b>Phone:</b> +91-8920392418"""
    
    gst_line = ''
    cust_gst = customer.get('gst_number', '')
    if cust_gst:
        gst_line = f'<b>GSTIN:</b> {cust_gst}<br/>'
    
    buyer_info = f"""<b>Bill To:</b><br/>
    {customer.get('name', 'N/A')}<br/>
    {customer.get('company', '') + '<br/>' if customer.get('company') else ''}
    {gst_line}{customer.get('address', 'N/A')}<br/>
    {customer.get('city', '')}, {customer.get('state', '')}<br/>
    PIN: {customer.get('pincode', 'N/A')}<br/>
    <b>Phone:</b> {customer.get('phone', 'N/A')}<br/>
    <b>Email:</b> {customer.get('email', 'N/A')}"""
    
    address_table = Table([
        [Paragraph(seller_info, small_style), Paragraph(buyer_info, small_style)]
    ], colWidths=[90*mm, 90*mm])
    address_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#dbeafe')),
        ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#dbeafe')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(LIGHT_BG)),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(address_table)
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
        
        # HSN code: use item-specific if set, fallback to generic fabric HSN
        hsn = item.get('hsn_code', '') or '540799'
        
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
    cgst = tax / 2
    sgst = tax / 2
    
    totals_data = [
        ['Subtotal:', f"Rs {subtotal:,.2f}"],
        ['CGST (2.5%):', f"Rs {cgst:,.2f}"],
        ['SGST (2.5%):', f"Rs {sgst:,.2f}"],
    ]
    
    # Show packaging and logistics separately for bulk orders
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
    
    # Amount in Words
    amount_words = number_to_words(total)
    elements.append(Paragraph(
        f"<b>Amount in Words:</b> {amount_words} Rupees Only",
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
    """Generate and download invoice PDF for an order"""
    # Find order
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
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
        [Paragraph("First Floor, Khasra No 385, Deskconnect<br/>100 Feet Road, Opp. Corporation Bank, Ghitorni,<br/>New Delhi, Delhi - 110030, India<br/>GSTIN: 07AADCL8794N1ZM<br/>Email: accounts@locofast.com", small_style),
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
