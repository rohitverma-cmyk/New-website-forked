"""
Email Router - Handles email notifications using Resend
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import asyncio
import logging
import resend

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/email", tags=["email"])

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
ORDER_NOTIFICATION_EMAILS = ["mail@locofast.com", "mohit@locofast.com"]
SITE_URL = os.environ.get('SITE_URL', 'https://shop.locofast.com')

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
        
        <!-- Next Steps -->
        <div style="background: #ecfdf5; padding: 20px; border: 1px solid #d1fae5; border-radius: 0 0 12px 12px;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #065f46;">What's Next?</h3>
            <ol style="margin: 0; padding-left: 20px; color: #047857;">
                <li style="margin-bottom: 8px;">Our team will verify your order and stock availability</li>
                <li style="margin-bottom: 8px;">You'll receive a confirmation call within 24 hours</li>
                <li style="margin-bottom: 8px;">Dispatch within the timeline mentioned on the product page</li>
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
        fabric_url = f"{SITE_URL}/fabrics/{item.get('fabric_id', '')}"
        
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <a href="{fabric_url}" style="color: #2563EB; font-weight: 600; text-decoration: none;">{item.get('fabric_name', 'Fabric')}</a><br>
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
        
        fabric_url = f"{SITE_URL}/fabrics/{item.get('fabric_id', '')}"
        image_url = item.get('image_url', '')
        
        items_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
                <div style="display: flex; gap: 12px;">
                    {f'<img src="{image_url}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;" />' if image_url else ''}
                    <div>
                        <a href="{fabric_url}" style="color: #2563EB; text-decoration: none; font-weight: 600;">{item.get('fabric_name', 'Fabric')}</a><br>
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
            
            <!-- Commission -->
            <div style="margin-top: 10px; padding: 12px 15px; background: #fef3c7; border-radius: 8px; border: 1px solid #fde68a;">
                <table style="width: 100%; font-size: 14px;">
                    <tr>
                        <td style="color: #92400e;">Locofast Commission ({order.get('commission_pct', 5)}%)</td>
                        <td style="text-align: right; font-weight: 600; color: #92400e;">₹{order.get('commission_amount', total_value * 0.05):,.2f}</td>
                    </tr>
                    <tr>
                        <td style="color: #065f46; font-weight: 700; padding-top: 8px;">Your Payout</td>
                        <td style="text-align: right; font-weight: 700; color: #065f46; font-size: 18px; padding-top: 8px;">₹{order.get('seller_payout', total_value * 0.95):,.2f}</td>
                    </tr>
                </table>
            </div>
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
    """
    if not RESEND_API_KEY:
        logger.warning("Resend not configured - skipping order notification emails")
        return {"customer_sent": False, "admin_sent": False, "sellers_notified": []}
    
    use_db = order_db or db
    results = {"customer_sent": False, "admin_sent": False, "sellers_notified": []}
    
    customer_email = order.get("customer", {}).get("email")
    order_number = order.get("order_number", "")
    
    # 1. Send customer confirmation email
    if customer_email:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [customer_email],
                "subject": f"Order Confirmed - {order_number} | Locofast",
                "html": get_order_confirmation_email(order)
            }
            await asyncio.to_thread(resend.Emails.send, params)
            results["customer_sent"] = True
            logger.info(f"Order confirmation email sent to customer: {customer_email}")
        except Exception as e:
            logger.error(f"Failed to send customer order email: {str(e)}")
    
    # 2. Send admin notification to mail@locofast.com AND mohit@locofast.com
    try:
        admin_params = {
            "from": SENDER_EMAIL,
            "to": ORDER_NOTIFICATION_EMAILS,
            "subject": f"New Order - {order_number} | ₹{order.get('total', 0):,.0f} | Locofast",
            "html": get_order_received_admin_email(order)
        }
        await asyncio.to_thread(resend.Emails.send, admin_params)
        results["admin_sent"] = True
        logger.info(f"Admin order notification sent to {ORDER_NOTIFICATION_EMAILS}")
    except Exception as e:
        logger.error(f"Failed to send admin order notification: {str(e)}")
    
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
                continue
            
            seller_email = seller.get("contact_email")
            if not seller_email:
                logger.warning(f"Seller {seller_id} has no contact_email — skipping")
                continue
            
            seller_params = {
                "from": SENDER_EMAIL,
                "to": [seller_email],
                "subject": f"New Order Booking - {order_number} | Prepare for Dispatch | Locofast",
                "html": get_seller_order_notification_email(order, seller_order_items, seller)
            }
            await asyncio.to_thread(resend.Emails.send, seller_params)
            results["sellers_notified"].append(seller_email)
            logger.info(f"Supplier notification sent to {seller_email} for order {order_number}")
        except Exception as e:
            logger.error(f"Failed to send supplier notification to seller {seller_id}: {str(e)}")
    
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
