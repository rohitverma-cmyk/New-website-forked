"""
Customer Auth Router - OTP-based email login for buyers.
Sends 6-digit OTP via Resend, verifies, issues JWT.
Auto-creates customer profile on first login.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import random
import logging
import jwt
import asyncio
import resend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customer", tags=["customer"])

db = None
JWT_SECRET = os.environ.get('JWT_SECRET', 'locofast-customer-secret-2026')
JWT_ALGORITHM = "HS256"
OTP_EXPIRY_MINUTES = 10
OTP_RATE_LIMIT = 3  # max OTPs per email per 10 min

RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'mail@locofast.com')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class SendOTPRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class ProfileUpdate(BaseModel):
    name: str = ""
    phone: str = ""
    company: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""


# ==================== AUTH HELPERS ====================

def create_customer_token(email: str, customer_id: str) -> str:
    payload = {
        "email": email,
        "customer_id": customer_id,
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_customer(request):
    """Extract customer from JWT token in Authorization header."""
    from fastapi import Request
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "customer":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== OTP ENDPOINTS ====================

@router.post("/send-otp")
async def send_otp(data: SendOTPRequest):
    """Send a 6-digit OTP to the customer's email."""
    email = data.email.lower().strip()
    now = datetime.now(timezone.utc)

    # Rate limit: max 3 OTPs per email per 10 min
    cutoff = (now - timedelta(minutes=OTP_RATE_LIMIT)).isoformat()
    recent_count = await db.customer_otps.count_documents({
        'email': email,
        'created_at': {'$gte': cutoff}
    })
    if recent_count >= OTP_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait a few minutes.")

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))

    # Store OTP
    await db.customer_otps.insert_one({
        'email': email,
        'otp': otp,
        'used': False,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    })

    # Send email via Resend
    if RESEND_API_KEY:
        try:
            params = {
                "from": f"Locofast <{SENDER_EMAIL}>",
                "to": [email],
                "subject": f"Your Locofast login code: {otp}",
                "html": f"""
                <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                    <img src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg" alt="Locofast" height="32" style="margin-bottom: 32px;" />
                    <h2 style="font-size: 24px; font-weight: 600; margin: 0 0 8px;">Your login code</h2>
                    <p style="color: #64748b; margin: 0 0 32px;">Enter this code to sign in to your Locofast account:</p>
                    <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
                        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1e293b;">{otp}</span>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px; margin: 0;">This code expires in {OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.</p>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"OTP sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send OTP email: {e}")
            raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")
    else:
        logger.warning(f"No Resend API key — OTP for {email}: {otp}")

    return {"message": "OTP sent to your email", "email": email}


@router.post("/verify-otp")
async def verify_otp(data: VerifyOTPRequest):
    """Verify OTP and return JWT token. Creates customer profile if new."""
    email = data.email.lower().strip()
    now = datetime.now(timezone.utc)

    # Find valid OTP
    otp_doc = await db.customer_otps.find_one({
        'email': email,
        'otp': data.otp,
        'used': False,
        'expires_at': {'$gte': now.isoformat()}
    })

    if not otp_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Mark OTP as used
    await db.customer_otps.update_one(
        {'_id': otp_doc['_id']},
        {'$set': {'used': True}}
    )

    # Find or create customer
    customer = await db.customers.find_one({'email': email}, {'_id': 0})
    if not customer:
        import uuid
        customer_id = str(uuid.uuid4())
        customer = {
            'id': customer_id,
            'email': email,
            'name': '',
            'phone': '',
            'company': '',
            'address': '',
            'city': '',
            'state': '',
            'pincode': '',
            'created_at': now.isoformat(),
            'updated_at': now.isoformat()
        }
        await db.customers.insert_one(customer)
        customer.pop('_id', None)
        logger.info(f"New customer created: {email}")
    else:
        customer_id = customer['id']

    # Generate JWT
    token = create_customer_token(email, customer.get('id', customer_id))

    return {
        "token": token,
        "customer": {k: v for k, v in customer.items() if k != '_id'},
        "is_new": not bool(customer.get('name'))
    }


# ==================== PROFILE ENDPOINTS ====================

@router.get("/profile")
async def get_profile(request: Request):
    """Get current customer's profile."""
    payload = get_current_customer(request)
    customer = await db.customers.find_one({'email': payload['email']}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/profile")
async def update_profile(data: ProfileUpdate, request: Request):
    """Update customer profile."""
    payload = get_current_customer(request)

    update_data = {k: v for k, v in data.model_dump().items() if v}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.customers.update_one(
        {'email': payload['email']},
        {'$set': update_data}
    )

    customer = await db.customers.find_one({'email': payload['email']}, {'_id': 0})
    return customer


# ==================== ORDER HISTORY ====================

@router.get("/orders")
async def get_customer_orders(request: Request):
    """Get all orders for the logged-in customer (matched by email)."""
    payload = get_current_customer(request)

    orders = await db.orders.find(
        {'customer.email': payload['email']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)

    return orders
