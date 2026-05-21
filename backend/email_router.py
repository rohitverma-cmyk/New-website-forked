"""
Email Router - Handles email notifications using Resend
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import asyncio
import logging
import resend
import auth_helpers

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/email", tags=["email"])

# ==================== EMAIL AUDIT LOG ====================
async def log_email(
    *,
    kind: str,  # e.g. "order_confirmation", "order_admin", "order_seller", "rfq_notification"
    recipients: List[str],
    subject: str,
    html: str = "",
    status: str = "sent",  # sent | failed | skipped
    error: Optional[str] = None,
    order_id: Optional[str] = None,
    order_number: Optional[str] = None,
    brand_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    rfq_id: Optional[str] = None,
    meta: Optional[dict] = None,
):
    """Persist every email attempt for Admin audit trail. Fire-and-forget safe."""
    if db is None:
        return
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "recipients": [r for r in (recipients or []) if r],
            "subject": subject or "",
            "html": html or "",
            "status": status,
            "error": error,
            "order_id": order_id,
            "order_number": order_number,
            "brand_id": brand_id,
            "customer_id": customer_id,
            "rfq_id": rfq_id,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_logs.insert_one(doc)
    except Exception as e:
        logger.warning(f"email_logs insert failed: {e}")

# Database reference (set from main server)
db = None

def set_db(database):
    """Set database reference from main server"""
    global db
    db = database

# Initialize Resend
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
ADMIN_NOTIFICATION_EMAIL = "deepakw0403@gmail.com"
ORDER_NOTIFICATION_EMAILS = ["mail@locofast.com", "mohit@locofast.com", "ashish.katiyar@locofast.com", "creditoperations@locofast.com"]
SITE_URL = os.environ.get('SITE_URL', 'https://locofast.com')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
    logger.info("Resend API initialized successfully")
else:
    logger.warning("Resend API key not found - email features will be disabled")

# ==================== MODELS ====================

class EmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: str
    html_content: str

# ==================== EMAIL TEMPLATES ====================

def get_order_confirmation_email(order: dict) -> str:
    """Generate order confirmation email HTML"""
    items_html = ""
    for item in order.get("items", []):
        items_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
                <strong>{item.get('fabric_name', 'Fabric')}</strong><br>
                <span style="color: #666; font-size: 14px;">{item.get('category_name', '')}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
                {item.get('quantity', 0)} m
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                ₹{item.get('price_per_meter', 0):,.2f}/m
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                ₹{(item.get('quantity', 0) * item.get('price_per_meter', 0)):,.2f}
            </td>
        </tr>
        """
    
    customer = order.get("customer", {})
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <!-- Header -->
        <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #2563EB 0%, #1e3a8a 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Order Confirmed!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Thank you for your order</p>
        </div>
        
        <!-- Order Info -->
        <div style="background: #f8fafc; padding: 20px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
            <table style="width: 100%;">
                <tr>
                    <td>
                        <strong style="color: #64748b; font-size: 12px; text-transform: uppercase;">Order Number</strong><br>
                        <span style="font-size: 18px; font-weight: 600; color: #2563EB;">{order.get('order_number', '')}</span>
                    </td>
                    <td style="text-align: right;">
                        <strong style="color: #64748b; font-size: 12px; text-transform: uppercase;">Order Date</strong><br>
                        <span style="font-size: 14px;">{order.get('created_at', '')[:10]}</span>
                    </td>
                </tr>
            </table>
        </div>
        
        <!-- Order Items -->
        <div style="background: white; padding: 20px; border: 1px solid #e2e8f0;">
            <h2 style="margin: 0 0 15px 0; font-size: 16px; color: #1e293b;">Order Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 13px;">Item</th>
                        <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; font-size: 13px;">Qty</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 13px;">Price</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 13px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>
            
            <!-- Totals -->
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
                <table style="width: 100%;">
                    <tr>
                        <td style="padding: 5px 0; color: #64748b;">Subtotal</td>
                        <td style="padding: 5px 0; text-align: right;">₹{order.get('subtotal', 0):,.2f}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; color: #64748b;">GST (5%)</td>
                        <td style="padding: 5px 0; text-align: right;">₹{order.get('tax', 0):,.2f}</td>
                    </tr>
                    <tr style="font-size: 18px; font-weight: 600;">
                        <td style="padding: 15px 0 5px 0; border-top: 1px solid #e2e8f0;">Total Paid</td>
                        <td style="padding: 15px 0 5px 0; text-align: right; color: #059669; border-top: 1px solid #e2e8f0;">₹{order.get('total', 0):,.2f}</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <!-- Shipping Info -->
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #475569;">Shipping Details</h3>
            <p style="margin: 0; color: #1e293b;">
                <strong>{customer.get('name', '')}</strong><br>
                {customer.get('company', '')}<br>
                {customer.get('address', '')}<br>
                {customer.get('city', '')}{', ' + customer.get('state', '') if customer.get('state') else ''} {customer.get('pincode', '')}<br>
                <br>
                <strong>Phone:</strong> {customer.get('phone', '')}<br>
                <strong>Email:</strong> {customer.get('email', '')}
            </p>
        </div>
        
        <!-- Invoice CTA -->
        <div style="background: #fff; padding: 20px; border: 1px solid #e2e8f0; border-top: none; text-align: center;">
            <a href="{SITE_URL}/api/orders/{order.get('id', '')}/invoice" style="display: inline-block; background: #2563EB; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Download Tax Invoice (GST)
            </a>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">A GST-compliant invoice has been generated for this order.</p>
        </div>

        <!-- Next Steps -->
        <div style="background: #ecfdf5; padding: 20px; border: 1px solid #d1fae5; border-radius: 0 0 12px 12px;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #065f46;">What's Next?</h3>
            <ol style="margin: 0; padding-left: 20px; color: #047857;">
                <li style="margin-bottom: 8px;">Our team will verify your order and stock availability</li>
                <li style="margin-bottom: 8px;">You'll receive a confirmation call within 24 hours</li>
                <li style="margin-bottom: 8px;"><strong>Samples dispatched in 24–48 hours</strong> and <strong>bulk dispatched in 24–48 hours for packaging &amp; dispatch</strong> (for in-stock items). Manufactured-to-order bulk typically dispatches within ~30 days of confirmation.</li>
                <li>Tracking details will be shared via SMS/Email</li>
            </ol>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 30px 0; color: #64748b; font-size: 13px;">
            <p style="margin: 0 0 10px 0;">Questions about your order?</p>
            <p style="margin: 0;">
                <a href="mailto:support@locofast.com" style="color: #2563EB; text-decoration: none;">support@locofast.com</a> | 
                <a href="tel:+919876543210" style="color: #2563EB; text-decoration: none;">+91 98765 43210</a>
            </p>
            <p style="margin: 20px 0 0 0; color: #94a3b8;">
                Locofast - Reliable Fabric Sourcing for Brands & Manufacturers
            </p>
        </div>
        
    </body>
    </html>
    """

def get_order_received_admin_email(order: dict) -> str:
    """Generate admin notification email for new order — includes ALL customer info"""
    items_html = ""
    for item in order.get("items", []):
        qty = item.get('quantity', 0)
        rate = item.get('price_per_meter', 0)
        amount = qty * rate
        order_type = item.get('order_type', 'bulk')
        type_label = 'Sample' if order_type == 'sample' else 'Bulk'
        # Prefer slug over UUID for cleaner, SEO-friendly URLs. Public PDP
        # route accepts either (id_or_slug), so we always have a valid link.
        fabric_ref = item.get('fabric_slug') or item.get('fabric_id', '')
        fabric_url = f"{SITE_URL}/fabrics/{fabric_ref}"
        _color = item.get('color_name') or ''
        _color_hex = item.get('color_hex') or '#ccc'
        _color_chip = (
            f'<span style="display: inline-flex; align-items: center; gap: 4px; background: #f3f4f6; color: #374151; padding: 2px 6px; border-radius: 10px; font-size: 11px; margin-left: 6px;">'
            f'<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: {_color_hex}; border: 1px solid #d1d5db;"></span>{_color}'
            f'</span>'
        ) if _color else ''
        
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <a href="{fabric_url}" style="color: #2563EB; font-weight: 600; text-decoration: underline;">{item.get('fabric_name', 'Fabric')}</a>{_color_chip}<br>
                <span style="color: #666; font-size: 12px;">Code: {item.get('fabric_code', 'N/A')} | Seller: {item.get('seller_company', 'N/A')}</span>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                <span style="background: {'#dbeafe' if order_type == 'sample' else '#d1fae5'}; color: {'#1e40af' if order_type == 'sample' else '#065f46'}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">{type_label}</span>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">{qty}m</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹{rate:,.2f}/m</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">₹{amount:,.2f}</td>
        </tr>
        """
    
    customer = order.get("customer", {})
    payment_status = order.get('payment_status', 'pending').upper()
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #333; max-width: 640px; margin: 0 auto;">
        
        <div style="background: linear-gradient(135deg, #2563EB 0%, #1e3a8a 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">New Order Received!</h1>
            <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">Order {order.get('order_number', '')}</p>
        </div>
        
        <!-- Quick Summary -->
        <div style="background: #eff6ff; padding: 20px; border: 1px solid #dbeafe;">
            <table style="width: 100%;">
                <tr>
                    <td><strong style="color: #1e40af; font-size: 11px;">ORDER</strong><br><span style="font-size: 18px; font-weight: 700;">{order.get('order_number', '')}</span></td>
                    <td style="text-align: center;"><strong style="color: #1e40af; font-size: 11px;">TOTAL</strong><br><span style="font-size: 18px; font-weight: 700; color: #059669;">₹{order.get('total', 0):,.2f}</span></td>
                    <td style="text-align: right;"><strong style="color: #1e40af; font-size: 11px;">PAYMENT</strong><br><span style="font-size: 14px; font-weight: 700; color: {'#059669' if payment_status == 'PAID' else '#f59e0b'};">{payment_status}</span></td>
                </tr>
            </table>
        </div>
        
        <!-- Customer Details (FULL info including phone) -->
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
            <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">Customer Details</h3>
            <table style="width: 100%; font-size: 14px;">
                <tr><td style="padding: 4px 0; color: #64748b; width: 120px;">Name:</td><td style="padding: 4px 0; font-weight: 500;">{customer.get('name', '')}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Company:</td><td style="padding: 4px 0;">{customer.get('company', 'N/A')}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Email:</td><td style="padding: 4px 0;"><a href="mailto:{customer.get('email', '')}" style="color: #2563EB;">{customer.get('email', '')}</a></td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Phone:</td><td style="padding: 4px 0; font-weight: 600;"><a href="tel:{customer.get('phone', '')}" style="color: #2563EB;">{customer.get('phone', '')}</a></td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Address:</td><td style="padding: 4px 0;">{customer.get('address', '')}, {customer.get('city', '')}, {customer.get('state', '')} {customer.get('pincode', '')}</td></tr>
            </table>
        </div>
        
        <!-- Order Items -->
        <div style="background: white; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
            <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">Order Items</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 8px; text-align: left; font-size: 11px; color: #475569;">Product</th>
                        <th style="padding: 8px; text-align: center; font-size: 11px; color: #475569;">Type</th>
                        <th style="padding: 8px; text-align: center; font-size: 11px; color: #475569;">Qty</th>
                        <th style="padding: 8px; text-align: right; font-size: 11px; color: #475569;">Rate</th>
                        <th style="padding: 8px; text-align: right; font-size: 11px; color: #475569;">Amount</th>
                    </tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #e2e8f0;">
                <table style="width: 100%; font-size: 14px;">
                    <tr><td style="text-align: right; color: #64748b;">Subtotal:</td><td style="text-align: right; width: 100px;">₹{order.get('subtotal', 0):,.2f}</td></tr>
                    <tr><td style="text-align: right; color: #64748b;">GST (5%):</td><td style="text-align: right;">₹{order.get('tax', 0):,.2f}</td></tr>
                    {f'<tr><td style="text-align: right; color: #64748b;">Discount:</td><td style="text-align: right; color: #dc2626;">-₹{order.get("discount", 0):,.2f}</td></tr>' if order.get('discount', 0) > 0 else ''}
                    <tr style="font-size: 18px; font-weight: 700;"><td style="text-align: right; padding-top: 10px; border-top: 1px solid #e2e8f0;">Total:</td><td style="text-align: right; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #059669;">₹{order.get('total', 0):,.2f}</td></tr>
                </table>
            </div>
        </div>
        
        <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <a href="https://shop.locofast.com/admin/orders" style="background: #2563EB; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">View in Admin Panel</a>
        </div>
        
    </body>
    </html>
    """

def get_seller_order_notification_email(order: dict, items: list, seller: dict) -> str:
    """Generate order notification email for seller/supplier - NO customer phone included"""
    items_html = ""
    total_quantity = 0
    total_value = 0
    for item in items:
        qty = item.get('quantity', 0)
        rate = item.get('price_per_meter', 0)
        amount = qty * rate
        total_quantity += qty
        total_value += amount
        order_type = item.get('order_type', 'bulk')
        type_label = 'Sample' if order_type == 'sample' else 'Bulk'
        type_bg = '#dbeafe' if order_type == 'sample' else '#d1fae5'
        type_color = '#1e40af' if order_type == 'sample' else '#065f46'
        
        fabric_ref = item.get('fabric_slug') or item.get('fabric_id', '')
        fabric_url = f"{SITE_URL}/fabrics/{fabric_ref}"
        image_url = item.get('image_url', '')
        
        items_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
                <div style="display: flex; gap: 12px;">
                    {f'<img src="{image_url}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;" />' if image_url else ''}
                    <div>
                        <a href="{fabric_url}" style="color: #2563EB; text-decoration: underline; font-weight: 600;">{item.get('fabric_name', 'Fabric')}</a><br>
                        <span style="color: #666; font-size: 12px;">Code: {item.get('fabric_code', 'N/A')} | {item.get('category_name', '')}</span>
                    </div>
                </div>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
                <span style="background: {type_bg}; color: {type_color}; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    {type_label}
                </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: 600;">
                {qty} meters
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                ₹{rate:,.2f}/m
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">
                ₹{amount:,.2f}
            </td>
        </tr>
        """
    
    customer = order.get('customer', {})
    payment_status = order.get('payment_status', 'pending').upper()
    payment_badge_color = '#059669' if payment_status == 'PAID' else '#f59e0b'
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
        
        <!-- Header -->
        <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Order Received!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Please prepare goods for dispatch</p>
        </div>
        
        <!-- Order Summary Bar -->
        <div style="background: #ecfdf5; padding: 20px; border-left: 1px solid #d1fae5; border-right: 1px solid #d1fae5;">
            <table style="width: 100%;">
                <tr>
                    <td>
                        <strong style="color: #065f46; font-size: 11px; text-transform: uppercase;">Order Number</strong><br>
                        <span style="font-size: 20px; font-weight: 600; color: #059669;">{order.get('order_number', '')}</span>
                    </td>
                    <td style="text-align: center;">
                        <strong style="color: #065f46; font-size: 11px; text-transform: uppercase;">Total Quantity</strong><br>
                        <span style="font-size: 20px; font-weight: 600;">{total_quantity} meters</span>
                    </td>
                    <td style="text-align: right;">
                        <strong style="color: #065f46; font-size: 11px; text-transform: uppercase;">Payment</strong><br>
                        <span style="background: {payment_badge_color}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 600;">{payment_status}</span>
                    </td>
                </tr>
            </table>
        </div>
        
        <!-- Action Required -->
        <div style="background: #fef3c7; padding: 15px 20px; border-left: 4px solid #f59e0b;">
            <strong style="color: #92400e;">Action Required:</strong>
            <p style="margin: 5px 0 0 0; color: #78350f;">Please keep the following items ready for pickup. Our logistics partner will contact you for collection.</p>
        </div>
        
        <!-- Items Table -->
        <div style="background: white; padding: 20px; border: 1px solid #e2e8f0;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #1e293b;">Items to Prepare</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #475569; font-size: 12px;">Product</th>
                        <th style="padding: 10px; text-align: center; font-weight: 600; color: #475569; font-size: 12px;">Type</th>
                        <th style="padding: 10px; text-align: center; font-weight: 600; color: #475569; font-size: 12px;">Qty</th>
                        <th style="padding: 10px; text-align: right; font-weight: 600; color: #475569; font-size: 12px;">Rate</th>
                        <th style="padding: 10px; text-align: right; font-weight: 600; color: #475569; font-size: 12px;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>
            
            <!-- Order Value -->
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #e2e8f0; text-align: right;">
                <span style="color: #64748b; font-size: 14px;">Order Value: </span>
                <span style="font-size: 20px; font-weight: 700; color: #059669;">₹{total_value:,.2f}</span>
            </div>
            
            <!-- Commission (only when a rule actually matched — 0% default hides the line) -->
            {f'''
            <div style="margin-top: 10px; padding: 12px 15px; background: #fef3c7; border-radius: 8px; border: 1px solid #fde68a;">
                <table style="width: 100%; font-size: 14px;">
                    <tr>
                        <td style="color: #92400e;">Locofast Commission ({order.get('commission_pct', 0)}%)</td>
                        <td style="text-align: right; font-weight: 600; color: #92400e;">₹{order.get('commission_amount', 0):,.2f}</td>
                    </tr>
                    <tr>
                        <td style="color: #065f46; font-weight: 700; padding-top: 8px;">Your Payout</td>
                        <td style="text-align: right; font-weight: 700; color: #065f46; font-size: 18px; padding-top: 8px;">₹{order.get('seller_payout', total_value - order.get('commission_amount', 0)):,.2f}</td>
                    </tr>
                </table>
            </div>
            ''' if (order.get('commission_pct') or 0) > 0 else ''}
        </div>
        
        <!-- Dispatch Info -->
        <div style="background: #eff6ff; padding: 20px; border: 1px solid #dbeafe; border-top: none;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #1e40af;">Dispatch Details</h3>
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 4px 0; color: #64748b; width: 140px;">Order Date:</td>
                    <td style="padding: 4px 0; font-weight: 500;">{order.get('created_at', '')[:10]}</td>
                </tr>
                <tr>
                    <td style="padding: 4px 0; color: #64748b;">Payment Amount:</td>
                    <td style="padding: 4px 0; font-weight: 500;">₹{order.get('total', 0):,.2f} (incl. GST)</td>
                </tr>
                <tr>
                    <td style="padding: 4px 0; color: #64748b;">Payment Status:</td>
                    <td style="padding: 4px 0; font-weight: 500; color: {payment_badge_color};">{payment_status}</td>
                </tr>
            </table>
        </div>
        
        <!-- Shipping To (NO phone number) -->
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #475569;">Ship To</h3>
            <p style="margin: 0; color: #1e293b;">
                <strong>{customer.get('name', '')}</strong><br>
                {f"{customer.get('company', '')}<br>" if customer.get('company') else ''}
                {customer.get('address', '')}<br>
                {customer.get('city', '')}, {customer.get('state', '')} {customer.get('pincode', '')}<br>
                <br>
                <strong>Email:</strong> {customer.get('email', '')}
            </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 30px 0; color: #64748b; font-size: 13px;">
            <p style="margin: 0 0 10px 0;">For order queries, contact the Locofast operations team:</p>
            <p style="margin: 0;">
                <a href="mailto:mail@locofast.com" style="color: #059669; text-decoration: none;">mail@locofast.com</a> |
                <a href="tel:+918920392418" style="color: #059669; text-decoration: none;">+91 8920 392 418</a>
            </p>
            <p style="margin: 20px 0 0 0; color: #94a3b8;">
                Locofast - Reliable Fabric Sourcing for Brands & Manufacturers
            </p>
        </div>
        
    </body>
    </html>
    """

def get_enquiry_notification_email(enquiry: dict) -> str:
    """Generate enquiry notification email for admin"""
    enquiry_type = enquiry.get('enquiry_type', 'general')
    type_label = {
        'general': 'General Enquiry',
        'sample_order': 'Sample Order Request',
        'bulk_order': 'Bulk Order Request'
    }.get(enquiry_type, 'Enquiry')
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #333;">
        
        <div style="background: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px;">
            <strong style="color: #1e40af;">New {type_label}</strong>
        </div>
        
        <h2 style="margin: 0 0 20px 0;">{enquiry.get('fabric_name', 'Unknown Fabric')}</h2>
        
        <table style="width: 100%; margin-bottom: 20px;">
            <tr>
                <td style="padding: 8px 0; width: 120px;"><strong>Customer:</strong></td>
                <td>{enquiry.get('name', '')} {f"({enquiry.get('company')})" if enquiry.get('company') else ''}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0;"><strong>Email:</strong></td>
                <td><a href="mailto:{enquiry.get('email', '')}">{enquiry.get('email', '')}</a></td>
            </tr>
            <tr>
                <td style="padding: 8px 0;"><strong>Phone:</strong></td>
                <td><a href="tel:{enquiry.get('phone', '')}">{enquiry.get('phone', '')}</a></td>
            </tr>
            <tr>
                <td style="padding: 8px 0;"><strong>Type:</strong></td>
                <td><span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 12px;">{type_label}</span></td>
            </tr>
            {f'<tr><td style="padding: 8px 0;"><strong>Quantity:</strong></td><td>{enquiry.get("quantity_required", "")}</td></tr>' if enquiry.get('quantity_required') else ''}
        </table>
        
        <h3 style="margin: 20px 0 10px 0;">Message:</h3>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            {enquiry.get('message', 'No message provided')}
        </div>
        
        <p style="margin-top: 30px; color: #64748b; font-size: 13px;">
            <a href="https://locofast.com/admin/enquiries" style="color: #2563EB;">View in Admin Panel →</a>
        </p>
        
    </body>
    </html>
    """

def get_customer_enquiry_confirmation_email(enquiry: dict) -> str:
    """Generate enquiry confirmation email for customer"""
    enquiry_type = enquiry.get('enquiry_type', 'general')
    type_label = {
        'general': 'enquiry',
        'sample_order': 'sample order request',
        'bulk_order': 'bulk order request'
    }.get(enquiry_type, 'enquiry')
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <!-- Header -->
        <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #2563EB 0%, #1e3a8a 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">We've Received Your Request!</h1>
        </div>
        
        <!-- Content -->
        <div style="background: #f8fafc; padding: 30px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
            <p style="margin: 0 0 20px 0;">Hi {enquiry.get('name', 'there').split()[0]},</p>
            
            <p style="margin: 0 0 20px 0;">
                Thank you for your {type_label} regarding <strong>{enquiry.get('fabric_name', 'our fabric')}</strong>. 
                Our team has received your request and will get back to you within 24 hours.
            </p>

            <div style="background: #fff7ed; padding: 14px 16px; border-left: 3px solid #fb923c; border-radius: 6px; margin: 0 0 20px 0;">
                <p style="margin: 0 0 4px 0; font-size: 13px; color: #9a3412;"><strong>Turnaround commitments</strong></p>
                <p style="margin: 0; font-size: 13px; color: #9a3412;">
                    • Samples dispatched in 24–48 hours (for in-stock items)<br>
                    • Bulk dispatched in 24–48 hours for packaging &amp; dispatch (in-stock)<br>
                    • Manufactured-to-order bulk typically dispatches within ~30 days of confirmation
                </p>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #64748b; text-transform: uppercase;">Your Request Summary</h3>
                <p style="margin: 0 0 8px 0;"><strong>Fabric:</strong> {enquiry.get('fabric_name', 'N/A')}</p>
                {f'<p style="margin: 0 0 8px 0;"><strong>Quantity:</strong> {enquiry.get("quantity_required", "")}</p>' if enquiry.get('quantity_required') else ''}
                <p style="margin: 0;"><strong>Message:</strong> {enquiry.get('message', 'N/A')[:100]}{'...' if len(enquiry.get('message', '')) > 100 else ''}</p>
            </div>
            
            <p style="margin: 0; color: #64748b; font-size: 14px;">
                If you have any urgent questions, feel free to reach out to us at 
                <a href="mailto:b2c@locofast.com" style="color: #2563EB;">b2c@locofast.com</a>
            </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 20px; background: #1e293b; border-radius: 0 0 12px 12px;">
            <p style="margin: 0; color: #94a3b8; font-size: 13px;">
                Locofast - Reliable Fabric Sourcing for Brands & Manufacturers
            </p>
        </div>
        
    </body>
    </html>
    """

# ==================== EMAIL ENDPOINTS ====================

# ────────── Admin email audit endpoints ──────────
@router.get("/admin/logs", tags=["email-audit"])
async def admin_list_email_logs(
    order_id: Optional[str] = None,
    order_number: Optional[str] = None,
    brand_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    kind: Optional[str] = None,
    limit: int = 100,
    admin=Depends(auth_helpers.get_current_admin),
):
    """Return email audit log entries. Filterable by order/brand/customer/kind.
    Most recent first. Used by the Admin Order Detail view to show the list
    of emails that were triggered for a given order."""
    if db is None:
        return []
    q: dict = {}
    if order_id:
        q["order_id"] = order_id
    if order_number:
        q["order_number"] = order_number
    if brand_id:
        q["brand_id"] = brand_id
    if customer_id:
        q["customer_id"] = customer_id
    if kind:
        q["kind"] = kind
    cursor = db.email_logs.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(int(limit or 100), 500)))
    return await cursor.to_list(length=limit)


@router.get("/admin/logs/{log_id}", tags=["email-audit"])
async def admin_get_email_log(log_id: str, admin=Depends(auth_helpers.get_current_admin)):
    """Fetch a single email log entry including the full HTML body — used
    by the Admin 'View email' modal."""
    if db is None:
        raise HTTPException(status_code=503, detail="Email logs unavailable")
    doc = await db.email_logs.find_one({"id": log_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Email log not found")
    return doc


@router.post("/send")
async def send_email(request: EmailRequest):
    """Send a custom email"""
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured")
    
    params = {
        "from": SENDER_EMAIL,
        "to": [request.recipient_email],
        "subject": request.subject,
        "html": request.html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {
            "success": True,
            "message": f"Email sent to {request.recipient_email}",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@router.post("/order-confirmation/{order_id}")
async def send_order_confirmation(order_id: str):
    """Send order confirmation email to customer and notify sellers"""
    if not RESEND_API_KEY:
        logger.warning("Email service not configured - skipping order confirmation email")
        return {"success": False, "message": "Email service not configured"}
    
    # Get order
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    customer_email = order.get("customer", {}).get("email")
    if not customer_email:
        raise HTTPException(status_code=400, detail="Customer email not found")
    
    results = {"customer_sent": False, "admin_sent": False, "sellers_notified": []}
    
    # Send customer confirmation
    try:
        customer_params = {
            "from": SENDER_EMAIL,
            "to": [customer_email],
            "subject": f"Order Confirmed - {order.get('order_number', '')} | Locofast",
            "html": get_order_confirmation_email(order)
        }
        
        customer_result = await asyncio.to_thread(resend.Emails.send, customer_params)
        results["customer_sent"] = True
        logger.info(f"Order confirmation email sent to {customer_email}")
        
        # Send admin notification (best effort)
        try:
            admin_params = {
                "from": SENDER_EMAIL,
                "to": [ADMIN_NOTIFICATION_EMAIL],
                "subject": f"New Order Received - {order.get('order_number', '')}",
                "html": get_order_received_admin_email(order)
            }
            await asyncio.to_thread(resend.Emails.send, admin_params)
            results["admin_sent"] = True
            logger.info(f"Admin notification sent to {ADMIN_NOTIFICATION_EMAIL}")
        except Exception as e:
            logger.warning(f"Failed to send admin notification: {str(e)}")
        
        # Send seller notifications (best effort)
        items = order.get("items", [])
        seller_items = {}  # Group items by seller
        
        for item in items:
            fabric_id = item.get("fabric_id")
            if fabric_id:
                fabric = await db.fabrics.find_one({"id": fabric_id}, {"_id": 0, "seller_id": 1})
                if fabric and fabric.get("seller_id"):
                    seller_id = fabric["seller_id"]
                    if seller_id not in seller_items:
                        seller_items[seller_id] = []
                    seller_items[seller_id].append(item)
        
        for seller_id, seller_order_items in seller_items.items():
            try:
                seller = await db.sellers.find_one({"id": seller_id}, {"_id": 0})
                if seller and seller.get("contact_email"):
                    seller_params = {
                        "from": SENDER_EMAIL,
                        "to": [seller["contact_email"]],
                        "subject": f"New Order Booking - {order.get('order_number', '')} | Prepare for Pickup",
                        "html": get_seller_order_notification_email(order, seller_order_items, seller)
                    }
                    await asyncio.to_thread(resend.Emails.send, seller_params)
                    results["sellers_notified"].append(seller["contact_email"])
                    logger.info(f"Seller notification sent to {seller['contact_email']}")
            except Exception as e:
                logger.warning(f"Failed to send seller notification to {seller_id}: {str(e)}")
        
        return {
            "success": True,
            "message": f"Order confirmation sent to {customer_email}",
            "email_id": customer_result.get("id"),
            **results
        }
        
    except Exception as e:
        logger.error(f"Failed to send order confirmation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@router.post("/test")
async def send_test_email(recipient: EmailStr):
    """Send a test email to verify configuration"""
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured")
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient],
        "subject": "Test Email from Locofast",
        "html": """
        <div style="font-family: sans-serif; padding: 20px;">
            <h1 style="color: #2563EB;">Test Email Successful!</h1>
            <p>Your email configuration is working correctly.</p>
            <p style="color: #666;">- Locofast Team</p>
        </div>
        """
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {
            "success": True,
            "message": f"Test email sent to {recipient}",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send test email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@router.post("/enquiry-notification")
async def send_enquiry_notification(enquiry: dict):
    """Send enquiry notification to admin and confirmation to customer"""
    results = {"admin_sent": False, "customer_sent": False}
    
    if not RESEND_API_KEY:
        logger.warning("Email service not configured - skipping enquiry notification")
        return {"success": False, "message": "Email service not configured", **results}
    
    customer_email = enquiry.get('email')
    enquiry_type = enquiry.get('enquiry_type', 'general')
    fabric_name = enquiry.get('fabric_name', 'Fabric')
    
    type_label = {
        'general': 'Enquiry',
        'sample_order': 'Sample Order Request',
        'bulk_order': 'Bulk Order Request'
    }.get(enquiry_type, 'Enquiry')
    
    # Send admin notification
    try:
        admin_params = {
            "from": SENDER_EMAIL,
            "to": [ADMIN_NOTIFICATION_EMAIL],
            "subject": f"New {type_label} - {fabric_name} | Locofast",
            "html": get_enquiry_notification_email(enquiry)
        }
        await asyncio.to_thread(resend.Emails.send, admin_params)
        results["admin_sent"] = True
        logger.info(f"Enquiry notification sent to {ADMIN_NOTIFICATION_EMAIL}")
    except Exception as e:
        logger.error(f"Failed to send admin notification: {str(e)}")
    
    # Send customer confirmation
    if customer_email:
        try:
            customer_params = {
                "from": SENDER_EMAIL,
                "to": [customer_email],
                "subject": f"We've Received Your {type_label} | Locofast",
                "html": get_customer_enquiry_confirmation_email(enquiry)
            }
            await asyncio.to_thread(resend.Emails.send, customer_params)
            results["customer_sent"] = True
            logger.info(f"Enquiry confirmation sent to {customer_email}")
        except Exception as e:
            logger.error(f"Failed to send customer confirmation: {str(e)}")
    
    return {
        "success": results["admin_sent"] or results["customer_sent"],
        "message": f"Admin: {'sent' if results['admin_sent'] else 'failed'}, Customer: {'sent' if results['customer_sent'] else 'failed'}",
        **results
    }

async def send_enquiry_emails(enquiry: dict):
    """Helper function to send enquiry emails - can be called from other modules"""
    if not RESEND_API_KEY:
        logger.warning("Email service not configured - skipping enquiry emails")
        return False
    
    customer_email = enquiry.get('email')
    enquiry_type = enquiry.get('enquiry_type', 'general')
    fabric_name = enquiry.get('fabric_name', 'Fabric')
    
    type_label = {
        'general': 'Enquiry',
        'sample_order': 'Sample Order Request',
        'bulk_order': 'Bulk Order Request'
    }.get(enquiry_type, 'Enquiry')
    
    # Send admin notification
    try:
        admin_params = {
            "from": SENDER_EMAIL,
            "to": [ADMIN_NOTIFICATION_EMAIL],
            "subject": f"New {type_label} - {fabric_name} | Locofast",
            "html": get_enquiry_notification_email(enquiry)
        }
        await asyncio.to_thread(resend.Emails.send, admin_params)
        logger.info(f"Enquiry notification sent to {ADMIN_NOTIFICATION_EMAIL}")
    except Exception as e:
        logger.error(f"Failed to send admin notification: {str(e)}")
    
    # Send customer confirmation
    if customer_email:
        try:
            customer_params = {
                "from": SENDER_EMAIL,
                "to": [customer_email],
                "subject": f"We've Received Your {type_label} | Locofast",
                "html": get_customer_enquiry_confirmation_email(enquiry)
            }
            await asyncio.to_thread(resend.Emails.send, customer_params)
            logger.info(f"Enquiry confirmation sent to {customer_email}")
        except Exception as e:
            logger.error(f"Failed to send customer confirmation: {str(e)}")
    
    return True



# ==================== RFQ EMAIL NOTIFICATION ====================

def get_rfq_notification_email(rfq: dict) -> str:
    """Generate RFQ notification email for admin"""
    category = rfq.get('category', '').upper()
    
    # Build details based on category
    details_html = f"<p><strong>Category:</strong> {category}</p>"
    
    if rfq.get('category') in ['cotton', 'viscose']:
        if rfq.get('fabric_requirement_type'):
            details_html += f"<p><strong>Fabric Type:</strong> {rfq.get('fabric_requirement_type')}</p>"
        if rfq.get('quantity_meters'):
            details_html += f"<p><strong>Quantity:</strong> {rfq.get('quantity_meters').replace('_', ' - ').replace('plus', '+')} meters</p>"
    elif rfq.get('category') == 'knits':
        if rfq.get('knit_quality'):
            details_html += f"<p><strong>Quality:</strong> {rfq.get('knit_quality')}</p>"
        if rfq.get('quantity_kg'):
            details_html += f"<p><strong>Quantity:</strong> {rfq.get('quantity_kg').replace('_', ' - ').replace('plus', '+')} kg</p>"
    elif rfq.get('category') == 'denim':
        if rfq.get('denim_specification'):
            details_html += f"<p><strong>Specification:</strong> {rfq.get('denim_specification')}</p>"
        if rfq.get('quantity_meters'):
            details_html += f"<p><strong>Quantity:</strong> {rfq.get('quantity_meters').replace('_', ' - ').replace('plus', '+')} meters</p>"
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }}
            .rfq-number {{ font-size: 24px; font-weight: bold; margin: 10px 0; }}
            .category-badge {{ display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 5px 12px; border-radius: 20px; font-weight: bold; }}
            .details {{ background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .contact {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>New RFQ Received</h2>
                <div class="rfq-number">{rfq.get('rfq_number', 'N/A')}</div>
                <div class="category-badge">{category}</div>
            </div>
            <div class="content">
                <div class="details">
                    <h3>Requirement Details</h3>
                    {details_html}
                    {f"<p><strong>GST Number:</strong> {rfq.get('gst_number')}</p>" if rfq.get('gst_number') else ""}
                    {f"<p><strong>Additional Notes:</strong> {rfq.get('message')}</p>" if rfq.get('message') else ""}
                </div>
                <div class="contact">
                    <h3>Contact Information</h3>
                    <p><strong>Name:</strong> {rfq.get('full_name', 'N/A')}</p>
                    <p><strong>Email:</strong> <a href="mailto:{rfq.get('email')}">{rfq.get('email', 'N/A')}</a></p>
                    <p><strong>Phone:</strong> <a href="tel:{rfq.get('phone')}">{rfq.get('phone', 'N/A')}</a></p>
                    {f"<p><strong>Website:</strong> <a href='{rfq.get('website')}'>{rfq.get('website')}</a></p>" if rfq.get('website') else ""}
                </div>
            </div>
        </div>
    </body>
    </html>
    """

async def send_rfq_notification(rfq: dict):
    """Send RFQ notification email to admin"""
    if not RESEND_API_KEY:
        logger.warning("Resend not configured - skipping RFQ notification")
        return False
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [ADMIN_NOTIFICATION_EMAIL],
            "subject": f"New RFQ: {rfq.get('rfq_number')} - {rfq.get('category', '').upper()} | Locofast",
            "html": get_rfq_notification_email(rfq)
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"RFQ notification sent: {rfq.get('rfq_number')}")
        return True
    except Exception as e:
        logger.error(f"Failed to send RFQ notification: {str(e)}")
        return False


# ==================== VENDOR FAN-OUT ON NEW RFQ ====================
async def send_rfq_vendor_fanout(rfq: dict):
    """Email every vendor whose category_ids match the RFQ category hint.

    For shortfall RFQs, only the vendor holding the 24 h lock is emailed
    (the top-5 fallback pool is revealed on the portal UI after expiry,
    not via an email blast, to avoid noise).
    """
    if not RESEND_API_KEY:
        return 0
    if db is None:
        return 0

    try:
        hints = {"cotton": ["cotton"], "viscose": ["viscose"], "denim": ["denim"], "knits": ["polyester"]}.get(
            (rfq.get("category") or "").lower().strip(), []
        )
        if not hints:
            return 0
        regex = "|".join(hints)
        cats = await db.categories.find(
            {"name": {"$regex": regex, "$options": "i"}}, {"_id": 0, "id": 1}
        ).to_list(50)
        cat_ids = [c["id"] for c in cats]
        if not cat_ids:
            return 0

        query = {"is_active": True, "category_ids": {"$in": cat_ids}}
        if rfq.get("vendor_lock_id"):
            # Shortfall: email only the source vendor during the lock window
            query = {"is_active": True, "id": rfq.get("vendor_lock_id")}

        vendors = await db.sellers.find(
            query, {"_id": 0, "contact_email": 1, "company_name": 1, "contact_name": 1}
        ).to_list(200)

        sent = 0
        qty_label = (
            f"{rfq.get('quantity_kg', '')} kg" if rfq.get('category') == 'knits'
            else f"{rfq.get('quantity_meters', '')} m"
        )
        is_shortfall = bool(rfq.get("is_shortfall") or rfq.get("vendor_lock_id"))
        subject_prefix = "Shortfall RFQ" if is_shortfall else "New RFQ"

        for v in vendors:
            email = (v.get("contact_email") or "").strip()
            if not email:
                continue
            params = {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": f"[{subject_prefix}] {rfq.get('rfq_number')} · {rfq.get('category', '').title()} · {qty_label}",
                "html": _render_vendor_rfq_email(rfq, v),
            }
            try:
                await asyncio.to_thread(resend.Emails.send, params)
                sent += 1
            except Exception as e:
                logger.error(f"Failed to send vendor RFQ email to {email}: {str(e)}")
        logger.info(f"Vendor RFQ fan-out: {sent}/{len(vendors)} · {rfq.get('rfq_number')}")
        return sent
    except Exception as e:
        logger.error(f"Vendor RFQ fan-out failed: {str(e)}")
        return 0


def _render_vendor_rfq_email(rfq: dict, vendor: dict) -> str:
    preview_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") + f"/vendor/rfqs/{rfq.get('id', '')}"
    qty_label = (
        f"{rfq.get('quantity_kg', '')} kg" if rfq.get('category') == 'knits'
        else f"{rfq.get('quantity_meters', '')} m"
    )
    is_shortfall = bool(rfq.get("is_shortfall"))
    shortfall_html = ""
    if is_shortfall:
        shortfall_html = f"""
        <p style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px;color:#92400E;font-size:13px;margin:16px 0;">
          <strong>Linked to inventory order.</strong> Buyer has already taken
          {rfq.get('linked_inventory_qty', 0)} m from stock; they need the remaining
          <strong>{rfq.get('quantity_meters', '')}</strong> m filled via RFQ. First chance to quote
          goes to you for 24 h.
        </p>
        """
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
      <h2 style="margin:0 0 8px;font-size:20px;">New RFQ in your pool</h2>
      <p style="color:#6B7280;margin:0 0 20px;font-size:13px;">
        Hi {(vendor.get('contact_name') or vendor.get('company_name') or 'there').split(',')[0]},
        a buyer has raised an RFQ matching your categories. Submit a quote
        to compete.
      </p>
      {shortfall_html}
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:12px;color:#6B7280;">RFQ Number</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#2563EB;">{rfq.get('rfq_number', '')}</p>
        <p style="margin:0;font-size:12px;color:#6B7280;">Category</p>
        <p style="margin:0 0 12px;font-size:14px;"><strong>{(rfq.get('category') or '').title()}</strong>
          {(' · ' + rfq.get('fabric_requirement_type', '')) if rfq.get('fabric_requirement_type') else ''}</p>
        <p style="margin:0;font-size:12px;color:#6B7280;">Quantity</p>
        <p style="margin:0 0 12px;font-size:14px;"><strong>{qty_label}</strong></p>
        {('<p style="margin:0;font-size:12px;color:#6B7280;">Buyer notes</p><p style="margin:0 0 12px;font-size:13px;color:#374151;white-space:pre-line;">' + (rfq.get('message') or '').strip() + '</p>') if rfq.get('message') else ''}
      </div>
      <p style="margin:24px 0 0;text-align:center;">
        <a href="{preview_url}"
           style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">
          Open RFQ & Submit Quote
        </a>
      </p>
      <p style="color:#9CA3AF;font-size:11px;text-align:center;margin:20px 0 0;">
        You're receiving this because your vendor categories match this RFQ. Manage preferences in your Locofast vendor portal.
      </p>
    </div>
    """


# ==================== CUSTOMER / BRAND QUOTE RECEIVED ====================
async def send_quote_received_email(rfq: dict, quote: dict, is_first: bool = True):
    """Let the buyer know a new/updated quote landed on their RFQ.

    Routing:
    - If the RFQ has a `brand_id`, fan out the email to **every brand_admin
      user** on that brand (so procurement heads + their managers all see
      the price), and ALSO drop a `brand_notifications` row per recipient
      so the bell icon in the brand portal shows an unread badge.
    - Otherwise (B2C customer RFQ) — fall back to the customer's email
      using `customer_id` → email lookup.
    """
    if db is None:
        return False
    try:
        rfq_id = rfq.get("id")
        rfq_number = rfq.get("rfq_number", "")
        brand_id = (rfq.get("brand_id") or "").strip()

        # Brand-RFQ branch — multi-recipient + in-app notification
        if brand_id:
            return await _notify_brand_on_quote(rfq, quote, is_first)

        # B2C customer fallback (existing behaviour)
        if not RESEND_API_KEY:
            return False
        customer_id = rfq.get("customer_id")
        recipient = (rfq.get("email") or "").strip()
        if customer_id:
            cust = await db.customers.find_one({"id": customer_id}, {"_id": 0, "email": 1, "name": 1})
            if cust and cust.get("email"):
                recipient = cust.get("email")
        if not recipient:
            return False

        subject_prefix = "New quote" if is_first else "Quote updated"
        subject = f"[{subject_prefix}] ₹{quote.get('price_per_meter', '')}/m on {rfq_number} · Locofast"
        html = _render_customer_quote_email(rfq, quote, is_first)
        params = {"from": SENDER_EMAIL, "to": [recipient], "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Quote-received email sent to {recipient} for RFQ {rfq_number}")
        await log_email(kind="quote_received_customer", recipients=[recipient], subject=subject, html=html, status="sent",
                        rfq_id=rfq_id, customer_id=customer_id)
        return True
    except Exception as e:
        logger.error(f"Failed to send quote-received email: {str(e)}")
        return False


async def _notify_brand_on_quote(rfq: dict, quote: dict, is_first: bool) -> bool:
    """Brand-side fanout: email every brand_admin + push in-app notification."""
    rfq_id = rfq.get("id")
    rfq_number = rfq.get("rfq_number", "")
    brand_id = rfq.get("brand_id")

    # Resolve recipients (active brand_admin users on this brand)
    admins = await db.brand_users.find(
        {"brand_id": brand_id, "role": "brand_admin", "status": "active"},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    ).to_list(length=50)
    recipients = [a.get("email") for a in admins if a.get("email")]

    # Build the headline so it works for both knits/wovens
    cat = (rfq.get("category") or "").lower()
    unit = "kg" if cat == "knits" else "m"
    headline_qty = ""
    if rfq.get("quantity_value"):
        try:
            qv = float(rfq.get("quantity_value"))
            qv_str = str(int(qv)) if qv.is_integer() else str(qv)
            headline_qty = f"{qv_str} {(rfq.get('quantity_unit') or unit).lower()}"
        except (TypeError, ValueError):
            pass
    if not headline_qty:
        raw = rfq.get("quantity_kg") or rfq.get("quantity_meters") or ""
        headline_qty = f"{raw.replace('_', '–')} {unit}" if raw else ""

    spec_bits = [rfq.get("fabric_requirement_type"), rfq.get("knit_type"), rfq.get("weave_type")]
    spec_bits = [s for s in spec_bits if s]
    if rfq.get("gsm"):
        spec_bits.append(f"{rfq.get('gsm')} GSM")
    spec = " · ".join(spec_bits) or "Custom RFQ"
    vendor_name = quote.get("vendor_company") or "Locofast verified mill"
    price = quote.get("price_per_meter", "")
    headline = f"{vendor_name} quoted ₹{price}/{unit} on {rfq_number} ({spec}{', ' + headline_qty if headline_qty else ''})"

    # Push 1 notification per admin so each user has an independent unread state
    now = datetime.now(timezone.utc).isoformat()
    notif_docs = []
    for a in admins:
        notif_docs.append({
            "id": str(uuid.uuid4()),
            "brand_id": brand_id,
            "brand_user_id": a.get("id"),
            "kind": "quote_received",
            "title": headline,
            "rfq_id": rfq_id,
            "rfq_number": rfq_number,
            "vendor_company": vendor_name,
            "price_per_unit": float(price) if isinstance(price, (int, float)) else (float(price) if isinstance(price, str) and price.replace(".", "").isdigit() else None),
            "unit": unit,
            "is_first": is_first,
            "url": f"/enterprise/queries/{rfq_id}",
            "read": False,
            "created_at": now,
        })
    if notif_docs:
        await db.brand_notifications.insert_many(notif_docs)

    if not recipients or not RESEND_API_KEY:
        # Still record an audit row so we know the in-app notification fired
        await log_email(kind="quote_received_brand", recipients=recipients, subject=headline, html="", status="skipped" if not RESEND_API_KEY else "skipped",
                        error="No recipients" if not recipients else "RESEND_API_KEY missing",
                        rfq_id=rfq_id, brand_id=brand_id)
        return bool(notif_docs)

    subject = f"[{'New quote' if is_first else 'Quote updated'}] ₹{price}/{unit} on {rfq_number} · Locofast"
    html = _render_brand_quote_email(rfq, quote, headline, unit)
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL, "to": recipients, "subject": subject, "html": html,
        })
        await log_email(kind="quote_received_brand", recipients=recipients, subject=subject, html=html, status="sent",
                        rfq_id=rfq_id, brand_id=brand_id)
        logger.info(f"Quote-received email sent to {recipients} for brand RFQ {rfq_number}")
        return True
    except Exception as e:
        logger.error(f"Brand quote-received email failed: {e}")
        await log_email(kind="quote_received_brand", recipients=recipients, subject=subject, html=html, status="failed",
                        error=str(e), rfq_id=rfq_id, brand_id=brand_id)
        return False


def _render_brand_quote_email(rfq: dict, quote: dict, headline: str, unit: str) -> str:
    preview_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") + f"/enterprise/queries/{rfq.get('id', '')}"
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
      <h2 style="margin:0 0 8px;font-size:22px;">You've got a new quote</h2>
      <p style="color:#374151;margin:0 0 20px;font-size:14px;line-height:1.55">{headline}</p>
      <div style="background:#ECFDF5;border:1px solid #BBF7D0;border-radius:8px;padding:20px;margin-bottom:20px">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#047857;font-weight:600">Vendor Quote</p>
        <p style="margin:6px 0 2px;font-size:28px;font-weight:700;color:#065F46">₹{quote.get('price_per_meter', '')}<span style="font-size:14px;color:#10B981;font-weight:500">/{unit}</span></p>
        <p style="margin:0;color:#4B5563;font-size:12px">
          Lead time: {quote.get('lead_days', '—')} days · MOQ: {quote.get('moq', '—')} {unit}
        </p>
      </div>
      <a href="{preview_url}" style="display:inline-block;background:#10B981;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">View &amp; compare quotes</a>
      <p style="margin-top:24px;color:#9CA3AF;font-size:11px;">You're receiving this because you're a brand admin on Locofast. Manage notifications in Account → Profile.</p>
    </div>"""


def _render_customer_quote_email(rfq: dict, quote: dict, is_first: bool = True) -> str:
    preview_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") + f"/account/queries/{rfq.get('id', '')}"
    qty_label = (
        f"{rfq.get('quantity_kg', '')} kg" if rfq.get('category') == 'knits'
        else f"{rfq.get('quantity_meters', '')} m"
    )
    heading = "You've got a quote" if is_first else "A mill updated their quote"
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
      <h2 style="margin:0 0 8px;font-size:22px;">{heading}</h2>
      <p style="color:#6B7280;margin:0 0 20px;font-size:13px;">
        A mill has responded on your query <strong style="color:#2563EB;">{rfq.get('rfq_number')}</strong>.
        Compare all quotes and pay online to place your order.
      </p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:20px;">
        <p style="margin:0;font-size:12px;color:#6B7280;">Rate</p>
        <p style="margin:0 0 12px;font-size:28px;font-weight:700;color:#059669;">
          ₹ {quote.get('price_per_meter', '')} <span style="font-size:14px;font-weight:500;color:#6B7280;">/ m</span>
        </p>
        <p style="margin:0;font-size:12px;color:#6B7280;">Lead time</p>
        <p style="margin:0 0 12px;font-size:14px;"><strong>{quote.get('lead_days', '')} days</strong>
          · {('Ex-factory' if quote.get('basis') == 'x-factory' else 'Door-delivered')}</p>
        <p style="margin:0;font-size:12px;color:#6B7280;">Your RFQ</p>
        <p style="margin:0 0 4px;font-size:14px;">{(rfq.get('category') or '').title()} · {qty_label}</p>
        {('<p style="margin:8px 0 0;font-size:13px;color:#6B7280;font-style:italic;">' + (quote.get('notes') or '') + '</p>') if quote.get('notes') else ''}
      </div>
      <p style="margin:24px 0 0;text-align:center;">
        <a href="{preview_url}"
           style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">
          Compare & Proceed to Payment
        </a>
      </p>
      <p style="color:#9CA3AF;font-size:11px;text-align:center;margin:20px 0 0;">
        Locofast · Supplier details masked until order confirmation.
      </p>
    </div>
    """


async def send_rfq_lead_email(lead: dict):
    """Send RFQ lead notification to marketing@locofast.com"""
    if not RESEND_API_KEY:
        logger.warning("Resend API key not configured - skipping RFQ lead email")
        return False
    
    name = lead.get('name', '')
    email = lead.get('email', '')
    phone = lead.get('phone', '')
    company = lead.get('company', '')
    gst = lead.get('gst_number', '')
    fabric_type = lead.get('fabric_type', '')
    fabric_url = lead.get('fabric_url', '')
    fabric_name = lead.get('fabric_name', '')
    gst_legal = lead.get('gst_legal_name', '')
    gst_status = lead.get('gst_status', '')
    gst_city = lead.get('gst_city', '')
    gst_state = lead.get('gst_state', '')
    gst_address = lead.get('gst_address', '')
    
    # GST verification badge
    gst_badge = ""
    if gst_legal:
        badge_color = "#16a34a" if gst_status == "Active" else "#dc2626"
        gst_badge = f"""
        <tr style="background: #f0fdf4; border-left: 3px solid {badge_color};">
            <td colspan="2" style="padding: 12px;">
                <strong style="color: {badge_color};">GST Verified</strong>
                <br/><span style="font-size: 13px; color: #374151;">{gst_legal} | Status: {gst_status}</span>
                <br/><span style="font-size: 12px; color: #6b7280;">{gst_city}, {gst_state}{' | ' + gst_address if gst_address else ''}</span>
            </td>
        </tr>
        """
    
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: linear-gradient(135deg, #2563EB, #1d4ed8); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">New Quote Request</h1>
            <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">{'From Product Page' if fabric_url else 'From Homepage RFQ Form'}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 10px 0; font-weight: bold; width: 140px; color: #64748b;">Name</td><td style="padding: 10px 0;">{name}</td></tr>
                <tr style="background: #f8fafc;"><td style="padding: 10px 0; font-weight: bold; color: #64748b;">Email</td><td style="padding: 10px 0;"><a href="mailto:{email}" style="color: #2563EB;">{email}</a></td></tr>
                <tr><td style="padding: 10px 0; font-weight: bold; color: #64748b;">Phone</td><td style="padding: 10px 0;"><a href="tel:+91{phone}" style="color: #2563EB;">+91 {phone}</a></td></tr>
                <tr style="background: #f8fafc;"><td style="padding: 10px 0; font-weight: bold; color: #64748b;">Company</td><td style="padding: 10px 0;">{company}</td></tr>
                <tr><td style="padding: 10px 0; font-weight: bold; color: #64748b;">GST Number</td><td style="padding: 10px 0; font-family: monospace;">{gst}</td></tr>
                {gst_badge}
                {'<tr style="background: #eff6ff;"><td style="padding: 10px 0; font-weight: bold; color: #64748b;">Fabric</td><td style="padding: 10px 0;"><a href="' + fabric_url + '" style="color: #2563EB; font-weight: bold;">' + (fabric_name or fabric_url) + '</a></td></tr>' if fabric_url else '<tr style="background: #eff6ff;"><td style="padding: 10px 0; font-weight: bold; color: #64748b;">Fabric Type</td><td style="padding: 10px 0;"><strong style="color: #2563EB;">' + fabric_type + '</strong></td></tr>'}
            </table>
        </div>
        <div style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">Locofast RFQ Lead System</p>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": ["marketing@locofast.com"],
            "subject": f"[RFQ Lead] {name} - {company} - {fabric_name or fabric_type}",
            "html": html,
            "reply_to": email
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"RFQ lead email sent to marketing@locofast.com for {name}")
        return True
    except Exception as e:
        logger.error(f"Failed to send RFQ lead email: {str(e)}")
        return False



async def send_order_notification_emails(order: dict, order_db=None):
    """
    Auto-send order notification emails after payment confirmation.
    Sends to: 1) Customer  2) mail@locofast.com + mohit@locofast.com  3) Each supplier
    Every attempt is persisted to `email_logs` for Admin audit trail.
    """
    order_id = order.get("id")
    order_number = order.get("order_number", "")
    order_type_label = (order.get("order_type") or "").lower() or ("sample" if any((i.get("order_type") == "sample") for i in (order.get("items") or [])) else "bulk")

    if not RESEND_API_KEY:
        logger.warning("Resend not configured - skipping order notification emails")
        await log_email(
            kind=f"order_{order_type_label}_bundle",
            recipients=[],
            subject=f"Order {order_number} — notifications skipped",
            status="skipped",
            error="RESEND_API_KEY not configured",
            order_id=order_id, order_number=order_number,
        )
        return {"customer_sent": False, "admin_sent": False, "sellers_notified": []}
    
    use_db = order_db or db
    results = {"customer_sent": False, "admin_sent": False, "sellers_notified": []}

    # ── Enrich items with seller_company + fabric_slug if missing ───────
    # Older order rows (and some flows) only persist seller_id/fabric_id.
    # The admin email surfaces "Seller: <company>" and the linked PDP URL,
    # so we backfill these fields from the live DB just before sending.
    if use_db:
        items_in = order.get("items") or []
        missing_fabric_ids = list({
            it.get("fabric_id") for it in items_in
            if it.get("fabric_id") and (not it.get("seller_company") or not it.get("fabric_slug"))
        })
        if missing_fabric_ids:
            fab_cursor = use_db.fabrics.find(
                {"id": {"$in": missing_fabric_ids}},
                {"_id": 0, "id": 1, "slug": 1, "seller_id": 1},
            )
            fab_map = {}
            seller_ids_needed = set()
            async for f in fab_cursor:
                fab_map[f["id"]] = f
                if f.get("seller_id"):
                    seller_ids_needed.add(f["seller_id"])
            seller_map = {}
            if seller_ids_needed:
                async for s in use_db.sellers.find(
                    {"id": {"$in": list(seller_ids_needed)}},
                    {"_id": 0, "id": 1, "company_name": 1, "name": 1},
                ):
                    seller_map[s["id"]] = s.get("company_name") or s.get("name") or ""
            for it in items_in:
                f = fab_map.get(it.get("fabric_id"))
                if not f:
                    continue
                if not it.get("fabric_slug") and f.get("slug"):
                    it["fabric_slug"] = f["slug"]
                if not it.get("seller_company"):
                    sid = f.get("seller_id") or it.get("seller_id") or ""
                    if sid and seller_map.get(sid):
                        it["seller_company"] = seller_map[sid]
                if not it.get("seller_id") and f.get("seller_id"):
                    it["seller_id"] = f["seller_id"]

    customer_email = order.get("customer", {}).get("email")
    brand_id = order.get("brand_id")
    customer_id = order.get("customer_id")
    
    # 1. Send customer confirmation email
    if customer_email:
        subject = f"Order Confirmed - {order_number} | Locofast"
        html = get_order_confirmation_email(order)
        try:
            params = {"from": SENDER_EMAIL, "to": [customer_email], "subject": subject, "html": html}
            await asyncio.to_thread(resend.Emails.send, params)
            results["customer_sent"] = True
            logger.info(f"Order confirmation email sent to customer: {customer_email}")
            await log_email(kind=f"order_{order_type_label}_customer", recipients=[customer_email], subject=subject, html=html, status="sent",
                            order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id)
        except Exception as e:
            logger.error(f"Failed to send customer order email: {str(e)}")
            await log_email(kind=f"order_{order_type_label}_customer", recipients=[customer_email], subject=subject, html=html, status="failed",
                            error=str(e), order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id)
    
    # 2. Send admin notification to mail@locofast.com AND mohit@locofast.com
    admin_subject = f"New Order - {order_number} | ₹{order.get('total', 0):,.0f} | Locofast"
    admin_html = get_order_received_admin_email(order)
    try:
        admin_params = {"from": SENDER_EMAIL, "to": ORDER_NOTIFICATION_EMAILS, "subject": admin_subject, "html": admin_html}
        await asyncio.to_thread(resend.Emails.send, admin_params)
        results["admin_sent"] = True
        logger.info(f"Admin order notification sent to {ORDER_NOTIFICATION_EMAILS}")
        await log_email(kind=f"order_{order_type_label}_admin", recipients=ORDER_NOTIFICATION_EMAILS, subject=admin_subject, html=admin_html, status="sent",
                        order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id)
    except Exception as e:
        logger.error(f"Failed to send admin order notification: {str(e)}")
        await log_email(kind=f"order_{order_type_label}_admin", recipients=ORDER_NOTIFICATION_EMAILS, subject=admin_subject, html=admin_html, status="failed",
                        error=str(e), order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id)
    
    # 3. Send supplier notification emails (grouped by seller)
    items = order.get("items", [])
    seller_items = {}  # Group items by seller_id
    
    for item in items:
        fabric_id = item.get("fabric_id")
        seller_id = item.get("seller_id", "")
        
        # If seller_id not in item, look up from fabric
        if not seller_id and fabric_id and use_db:
            fabric = await use_db.fabrics.find_one({"id": fabric_id}, {"_id": 0, "seller_id": 1})
            if fabric:
                seller_id = fabric.get("seller_id", "")
        
        if seller_id:
            if seller_id not in seller_items:
                seller_items[seller_id] = []
            seller_items[seller_id].append(item)
    
    for seller_id, seller_order_items in seller_items.items():
        try:
            if not use_db:
                continue
            seller = await use_db.sellers.find_one({"id": seller_id}, {"_id": 0})
            if not seller:
                logger.warning(f"Seller {seller_id} not found in DB — skipping email")
                await log_email(kind=f"order_{order_type_label}_seller", recipients=[], subject=f"Seller notification — {order_number}", status="skipped",
                                error=f"seller {seller_id} not found",
                                order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id,
                                meta={"seller_id": seller_id})
                continue
            
            seller_email = seller.get("contact_email")
            if not seller_email:
                logger.warning(f"Seller {seller_id} has no contact_email — skipping")
                await log_email(kind=f"order_{order_type_label}_seller", recipients=[], subject=f"Seller notification — {order_number}", status="skipped",
                                error="seller has no contact_email",
                                order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id,
                                meta={"seller_id": seller_id, "seller_name": seller.get("company_name", "")})
                continue

            seller_subject = f"New Order Booking - {order_number} | Prepare for Dispatch | Locofast"
            seller_html = get_seller_order_notification_email(order, seller_order_items, seller)
            seller_params = {"from": SENDER_EMAIL, "to": [seller_email], "subject": seller_subject, "html": seller_html}
            await asyncio.to_thread(resend.Emails.send, seller_params)
            results["sellers_notified"].append(seller_email)
            logger.info(f"Supplier notification sent to {seller_email} for order {order_number}")
            await log_email(kind=f"order_{order_type_label}_seller", recipients=[seller_email], subject=seller_subject, html=seller_html, status="sent",
                            order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id,
                            meta={"seller_id": seller_id, "seller_name": seller.get("company_name", "")})
        except Exception as e:
            logger.error(f"Failed to send supplier notification to seller {seller_id}: {str(e)}")
            await log_email(kind=f"order_{order_type_label}_seller", recipients=[], subject=f"Seller notification — {order_number}", status="failed",
                            error=str(e),
                            order_id=order_id, order_number=order_number, brand_id=brand_id, customer_id=customer_id,
                            meta={"seller_id": seller_id})
    
    logger.info(f"Order {order_number} email results: customer={results['customer_sent']}, admin={results['admin_sent']}, sellers={results['sellers_notified']}")
    return results


def get_order_shipped_email(order: dict) -> str:
    """HTML email for order shipped notification"""
    customer = order.get('customer', {})
    items_html = ""
    for item in order.get('items', []):
        items_html += f"""
        <tr>
            <td style="padding:12px;border-bottom:1px solid #f0f0f0;">{item.get('fabric_name','')}</td>
            <td style="padding:12px;border-bottom:1px solid #f0f0f0;text-align:center;">{item.get('quantity',0)}m</td>
            <td style="padding:12px;border-bottom:1px solid #f0f0f0;text-align:right;">Rs {item.get('quantity',0)*item.get('price_per_meter',0):,.0f}</td>
        </tr>"""

    awb = order.get('awb_code', '')
    tracking_html = f"""
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
        <p style="font-size:14px;color:#166534;margin:0 0 8px;">Tracking Number</p>
        <p style="font-size:24px;font-weight:700;color:#166534;letter-spacing:2px;margin:0;">{awb if awb else 'Will be updated shortly'}</p>
    </div>""" if awb else ""

    return f"""
    <div style="font-family:Inter,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#2563EB;padding:32px;text-align:center;">
            <h1 style="color:#fff;font-size:24px;margin:0;">Your Order Has Been Shipped!</h1>
            <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Order {order.get('order_number','')}</p>
        </div>
        <div style="padding:32px;">
            <p style="font-size:16px;color:#1a1a1a;">Hi {customer.get('name','')},</p>
            <p style="color:#64748b;line-height:1.6;">Great news! Your order has been shipped and is on its way to you.</p>
            {tracking_html}
            <div style="margin:24px 0;">
                <h3 style="font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Shipping To</h3>
                <p style="color:#1a1a1a;margin:8px 0;">{customer.get('name','')}<br/>{customer.get('address','')}<br/>{customer.get('city','')}, {customer.get('state','')} {customer.get('pincode','')}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;">
                <thead><tr style="background:#f8fafc;">
                    <th style="padding:12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Item</th>
                    <th style="padding:12px;text-align:center;font-size:12px;color:#64748b;text-transform:uppercase;">Qty</th>
                    <th style="padding:12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Amount</th>
                </tr></thead>
                <tbody>{items_html}</tbody>
                <tfoot><tr>
                    <td colspan="2" style="padding:12px;text-align:right;font-weight:700;">Total</td>
                    <td style="padding:12px;text-align:right;font-weight:700;color:#2563EB;">Rs {order.get('total',0):,.0f}</td>
                </tr></tfoot>
            </table>
            <p style="color:#64748b;font-size:13px;line-height:1.6;">If you have any questions about your delivery, please contact us at <a href="mailto:mail@locofast.com" style="color:#2563EB;">mail@locofast.com</a> or call +91-8920392418.</p>
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">Locofast Online Services Pvt Ltd | www.locofast.com</p>
        </div>
    </div>"""


def get_order_delivered_email(order: dict) -> str:
    """HTML email for order delivered notification"""
    customer = order.get('customer', {})
    return f"""
    <div style="font-family:Inter,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#059669;padding:32px;text-align:center;">
            <h1 style="color:#fff;font-size:24px;margin:0;">Your Order Has Been Delivered!</h1>
            <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Order {order.get('order_number','')}</p>
        </div>
        <div style="padding:32px;">
            <p style="font-size:16px;color:#1a1a1a;">Hi {customer.get('name','')},</p>
            <p style="color:#64748b;line-height:1.6;">Your order has been successfully delivered. We hope you're happy with your purchase!</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
                <p style="font-size:48px;margin:0 0 8px;">&#10003;</p>
                <p style="font-size:18px;font-weight:700;color:#166534;margin:0;">Delivered</p>
                <p style="color:#64748b;font-size:14px;margin:8px 0 0;">Order {order.get('order_number','')} | Rs {order.get('total',0):,.0f}</p>
            </div>
            <p style="color:#64748b;line-height:1.6;">Please inspect the goods upon receipt. If you find any issues, please write to us within 24 hours at <a href="mailto:mail@locofast.com" style="color:#2563EB;">mail@locofast.com</a>.</p>
            <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:24px 0;">
                <p style="font-size:14px;font-weight:600;color:#1a1a1a;margin:0 0 8px;">Need more fabric?</p>
                <p style="color:#64748b;font-size:13px;margin:0 0 12px;">Browse our catalog and place your next order.</p>
                <a href="https://locofast.com/fabrics" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Browse Fabrics</a>
            </div>
            <p style="color:#64748b;font-size:13px;">Thank you for choosing Locofast!</p>
        </div>
        <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">Locofast Online Services Pvt Ltd | www.locofast.com</p>
        </div>
    </div>"""


async def send_order_status_email(order: dict, new_status: str):
    """Send email notification when order status changes to shipped or delivered."""
    if not RESEND_API_KEY:
        return False

    customer_email = order.get('customer', {}).get('email')
    if not customer_email:
        return False

    order_number = order.get('order_number', '')

    if new_status == 'shipped':
        subject = f"Your Locofast Order {order_number} Has Been Shipped!"
        html = get_order_shipped_email(order)
    elif new_status == 'delivered':
        subject = f"Your Locofast Order {order_number} Has Been Delivered!"
        html = get_order_delivered_email(order)
    else:
        return False

    try:
        params = {
            "from": f"Locofast <{SENDER_EMAIL}>",
            "to": [customer_email],
            "subject": subject,
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Order status email ({new_status}) sent to {customer_email} for {order_number}")
        return True
    except Exception as e:
        logger.error(f"Failed to send {new_status} email for {order_number}: {e}")
        return False
