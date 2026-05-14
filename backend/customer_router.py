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

class SendWhatsAppOTPRequest(BaseModel):
    phone: str

class VerifyWhatsAppOTPRequest(BaseModel):
    phone: str
    otp: str

class ProfileUpdate(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    country: str = ""  # ISO-2 code (IN, US, GB, …) — drives phone dial-code prefix
    company: str = ""
    gstin: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""


# ==================== AUTH HELPERS ====================

def create_customer_token(email: str, customer_id: str, phone: str = "") -> str:
    payload = {
        "email": email,
        "customer_id": customer_id,
        "phone": phone,
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_customer(request):
    """Extract customer from JWT token in Authorization header.

    Returns the JWT payload dict. For email-only legacy logins, the
    `email` claim is the identity. For phone-OTP logins the customer
    may not yet have an email — in that case `email` is empty and
    `customer_id` is the canonical lookup key.
    """
    from fastapi import Request  # noqa: F401
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "customer":
            raise HTTPException(status_code=401, detail="Invalid token type")
        # Back-fill `email` from the customer doc if the token carried only a
        # phone identity. Existing endpoints use `payload['email']` as the
        # MongoDB lookup key — keeping that contract avoids touching every
        # downstream handler.
        if not payload.get("email") and payload.get("customer_id") and db is not None:
            # Use cached payload — fetch will be done by callers if needed
            pass
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
    token = create_customer_token(email, customer.get('id', customer_id), customer.get('phone', ''))

    return {
        "token": token,
        "customer": {k: v for k, v in customer.items() if k != '_id'},
        "is_new": not bool(customer.get('name'))
    }


# ==================== WHATSAPP OTP ENDPOINTS ====================

PHONE_PLACEHOLDER_EMAIL_DOMAIN = "@phone.locofast.local"


def _placeholder_email_for_phone(e164_phone: str) -> str:
    """Synthetic email used for phone-only customers so existing email-keyed
    Mongo lookups (profile, orders, queries, tracking) keep working with no
    refactor. The frontend hides this email and prompts the user to add a
    real one in their profile.
    """
    return f"phone+{e164_phone}{PHONE_PLACEHOLDER_EMAIL_DOMAIN}"


async def _find_customer_by_phone(e164_phone: str):
    """Return the canonical customer doc that owns this phone, regardless
    of which legacy format it was stored in.

    Phone numbers were saved in 5+ different shapes across the codebase
    over time:
      * '919876543210'    (E.164 no plus — what /send-whatsapp-otp produces)
      * '+919876543210'   (E.164 with plus — saved by the profile editor's
                          dial-code + local combiner)
      * '9876543210'      (10-digit only — early signups before country code)
      * '+91 9876543210'  (legacy with space — older profile saves)
      * '91 9876543210'   (same, no plus)

    We look up by the explicit list of variants so the match is exact and
    cheap (single B-tree hit). Among multiple matches we prefer the row
    whose email is NOT the synthetic phone placeholder — that's the
    canonical record holding name/GST/orders.
    """
    local10 = e164_phone[-10:]
    variants = list({
        e164_phone,           # '919876543210'
        f'+{e164_phone}',     # '+919876543210'
        local10,              # '9876543210'
        f'+91{local10}',      # '+919876543210' (dupe protection)
        f'+91 {local10}',     # '+91 9876543210'
        f'91 {local10}',      # '91 9876543210'
    })
    matches = await db.customers.find(
        {'phone': {'$in': variants}},
        {'_id': 0}
    ).to_list(length=10)
    if not matches:
        return None
    real = [c for c in matches if not (c.get('email') or '').endswith(PHONE_PLACEHOLDER_EMAIL_DOMAIN)]
    return real[0] if real else matches[0]


async def _merge_placeholder_into(canonical_id: str, e164_phone: str, now_iso: str):
    """Find any phone-placeholder rows for this number and merge them into
    the canonical customer. Re-points orders / queries / cart, then deletes
    the placeholder. Safe to call on every WhatsApp login — no-op if no
    placeholder exists.
    """
    local10 = e164_phone[-10:]
    variants = list({
        e164_phone, f'+{e164_phone}', local10,
        f'+91{local10}', f'+91 {local10}', f'91 {local10}',
    })
    placeholders = await db.customers.find({
        'email': {'$regex': PHONE_PLACEHOLDER_EMAIL_DOMAIN.replace('.', r'\.') + '$'},
        'phone': {'$in': variants},
        'id': {'$ne': canonical_id},
    }, {'_id': 0, 'id': 1, 'email': 1}).to_list(length=20)
    if not placeholders:
        return 0
    placeholder_ids = [p['id'] for p in placeholders]
    placeholder_emails = [p['email'] for p in placeholders]
    canonical = await db.customers.find_one({'id': canonical_id}, {'_id': 0, 'email': 1}) or {}
    canonical_email = canonical.get('email') or ''
    try:
        await db.rfq_submissions.update_many(
            {'customer_id': {'$in': placeholder_ids}},
            {'$set': {'customer_id': canonical_id, 'email': canonical_email}}
        )
        await db.rfq_submissions.update_many(
            {'email': {'$in': placeholder_emails}, 'customer_id': {'$exists': False}},
            {'$set': {'customer_id': canonical_id, 'email': canonical_email}}
        )
        await db.orders.update_many(
            {'customer_email': {'$in': placeholder_emails}},
            {'$set': {'customer_email': canonical_email}}
        )
    except Exception as e:
        logger.warning(f"Phone-merge: data re-pointing partial failure: {e}")
    deleted = await db.customers.delete_many({'id': {'$in': placeholder_ids}})
    logger.info(f"Phone-merge: collapsed {deleted.deleted_count} placeholder row(s) into {canonical_id} for +{e164_phone}")
    return deleted.deleted_count


@router.post("/send-whatsapp-otp")
async def send_whatsapp_otp_endpoint(data: SendWhatsAppOTPRequest):
    """Send a 6-digit OTP via Gupshup WhatsApp template."""
    from gupshup_service import normalize_indian_phone, send_whatsapp_otp

    is_valid, e164_phone = normalize_indian_phone(data.phone)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number")

    now = datetime.now(timezone.utc)

    # Rate limit: max 3 OTPs per phone per 10 min
    cutoff = (now - timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    recent_count = await db.customer_otps.count_documents({
        'phone': e164_phone,
        'channel': 'whatsapp',
        'created_at': {'$gte': cutoff},
    })
    if recent_count >= OTP_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait a few minutes.")

    otp = str(random.randint(100000, 999999))

    await db.customer_otps.insert_one({
        'phone': e164_phone,
        'channel': 'whatsapp',
        'otp': otp,
        'used': False,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
    })

    result = await send_whatsapp_otp(e164_phone, otp)
    if not result.get("success"):
        # Log but don't expose Gupshup internals to the client.
        logger.error(f"Gupshup OTP send failed for {e164_phone}: {result.get('error')}")
        raise HTTPException(status_code=502, detail="Couldn't send OTP via WhatsApp. Please try email instead.")

    return {
        "message": "OTP sent to your WhatsApp",
        "phone_masked": e164_phone[:4] + "****" + e164_phone[-2:],
    }


@router.post("/verify-whatsapp-otp")
async def verify_whatsapp_otp_endpoint(data: VerifyWhatsAppOTPRequest):
    """Verify WhatsApp OTP and issue a customer JWT.

    Auto-creates a customer row keyed by `phone` on first login. If a
    customer already exists with this phone (saved via /profile from an
    email-account), we log them into that same account (auto-merge).
    """
    from gupshup_service import normalize_indian_phone

    is_valid, e164_phone = normalize_indian_phone(data.phone)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    now = datetime.now(timezone.utc)

    otp_doc = await db.customer_otps.find_one({
        'phone': e164_phone,
        'channel': 'whatsapp',
        'otp': data.otp,
        'used': False,
        'expires_at': {'$gte': now.isoformat()},
    })
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    await db.customer_otps.update_one({'_id': otp_doc['_id']}, {'$set': {'used': True}})

    # Auto-merge: find canonical customer regardless of phone format.
    customer = await _find_customer_by_phone(e164_phone)

    if not customer:
        # Brand-new customer — create row with synthetic placeholder email
        # so downstream email-keyed lookups keep working unchanged.
        import uuid
        customer_id = str(uuid.uuid4())
        placeholder_email = _placeholder_email_for_phone(e164_phone)
        customer = {
            'id': customer_id,
            'email': placeholder_email,
            'name': '',
            'phone': e164_phone,
            'phone_verified': True,
            'company': '',
            'gstin': '',
            'address': '',
            'city': '',
            'state': '',
            'pincode': '',
            'created_via': 'whatsapp_otp',
            'created_at': now.isoformat(),
            'updated_at': now.isoformat(),
        }
        await db.customers.insert_one(customer)
        customer.pop('_id', None)
        logger.info(f"New customer created via WhatsApp OTP: {e164_phone}")
    else:
        # Existing customer — stamp phone_verified and canonicalise phone
        # format so future matches don't depend on the legacy storage.
        updates = {'phone_verified': True, 'phone': e164_phone, 'updated_at': now.isoformat()}
        await db.customers.update_one({'id': customer['id']}, {'$set': updates})
        customer.update(updates)
        # Collapse any stray phone-placeholder rows into this canonical doc.
        await _merge_placeholder_into(customer['id'], e164_phone, now.isoformat())

    token = create_customer_token(customer.get('email', ''), customer['id'], e164_phone)

    return {
        "token": token,
        "customer": {k: v for k, v in customer.items() if k != '_id'},
        "is_new": not bool(customer.get('name')),
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
    """Update customer profile.

    Mandatory fields: name, phone, gstin. GSTIN is verified against Sandbox.co.in
    only when it CHANGES (or when the existing record has gst_verified=False).
    Customers can now also update their email and address details — they were
    previously locked to the login identity, which made editing painful.
    Changing email returns `email_changed=True` so the client can prompt re-login.
    """
    payload = get_current_customer(request)

    # Mandatory validation
    name = (data.name or "").strip()
    phone = (data.phone or "").strip()
    gstin = (data.gstin or "").strip().upper()
    company = (data.company or "").strip()
    new_email = (data.email or "").strip().lower()

    missing = []
    if not name:
        missing.append("Contact Person Name")
    if not phone:
        missing.append("Phone")
    if not gstin:
        missing.append("GST Number")
    if missing:
        raise HTTPException(status_code=400, detail=f"Required: {', '.join(missing)}")

    # Phone shape: 10 digits (allow optional +91 / spaces). Normalise to
    # E.164 ('91xxxxxxxxxx') so WhatsApp OTP login can match this account
    # regardless of how the customer types their number later.
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="Phone must be at least 10 digits")
    try:
        from gupshup_service import normalize_indian_phone
        is_valid, e164 = normalize_indian_phone(phone)
        if is_valid:
            phone = e164  # store as '91xxxxxxxxxx' — canonical form
    except Exception:
        pass

    # Fetch current record to decide what's changed
    current = await db.customers.find_one({"email": payload["email"]}, {"_id": 0}) or {}
    gst_changed = (current.get("gstin") or "").upper() != gstin
    needs_verify = gst_changed or not current.get("gst_verified")

    if needs_verify:
        # Server-side GST verification only when GSTIN changed or never verified.
        from gst_verify import verify_gstin
        try:
            gst_result = await verify_gstin(gstin)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"GST verification error: {e}")
            raise HTTPException(status_code=502, detail="GST verification service unavailable")

        if not gst_result.get("valid"):
            raise HTTPException(
                status_code=400,
                detail=f"GST verification failed: {gst_result.get('message', 'Invalid GSTIN')}"
            )

        # Auto-fill company from GST API (legal_name preferred).
        api_company = (gst_result.get("legal_name") or gst_result.get("trade_name") or "").strip()
        if api_company:
            company = api_company
        if not company:
            raise HTTPException(status_code=400, detail="Company Name could not be resolved from GST")
        gst_extras = {
            "gst_verified": True,
            "gst_business_type": gst_result.get("business_type", ""),
            "gst_status": gst_result.get("gst_status", ""),
        }
        gst_addr_defaults = {
            "city": gst_result.get("city", ""),
            "state": gst_result.get("state", ""),
            "pincode": gst_result.get("pincode", ""),
        }
    else:
        # GSTIN unchanged + already verified → preserve flags, skip API call.
        company = company or current.get("company", "")
        if not company:
            raise HTTPException(status_code=400, detail="Company Name is required")
        gst_extras = {}
        gst_addr_defaults = {}

    # Email change — only if it's actually different & well-formed.
    email_changed = False
    if new_email and new_email != (payload["email"] or "").lower():
        if "@" not in new_email or "." not in new_email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Invalid email format")
        # Ensure no other customer already uses this email
        existing = await db.customers.find_one(
            {"email": new_email, "id": {"$ne": current.get("id")}}, {"_id": 0, "id": 1}
        )
        if existing:
            raise HTTPException(status_code=409, detail="This email is already linked to another account")
        email_changed = True

    update_data = {
        "name": name,
        "phone": phone,
        "country": (data.country or current.get("country") or "IN").upper(),
        "company": company,
        "gstin": gstin,
        **gst_extras,
        "address": (data.address or "").strip(),
        "city": (data.city or "").strip() or gst_addr_defaults.get("city", current.get("city", "")),
        "state": (data.state or "").strip() or gst_addr_defaults.get("state", current.get("state", "")),
        "pincode": (data.pincode or "").strip() or gst_addr_defaults.get("pincode", current.get("pincode", "")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if email_changed:
        update_data["email"] = new_email

    await db.customers.update_one(
        {"email": payload["email"]},
        {"$set": update_data}
    )

    # Re-read using new email if it was changed
    lookup_email = new_email if email_changed else payload["email"]
    customer = await db.customers.find_one({"email": lookup_email}, {"_id": 0})
    if email_changed and customer is not None:
        customer["_email_changed"] = True
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


@router.get("/orders/{order_id}")
async def get_customer_order(order_id: str, request: Request):
    """Get a single order — scoped to the logged-in customer's email so
    customers can only access their own orders. Looks up by id OR order_number.
    """
    payload = get_current_customer(request)
    order = await db.orders.find_one(
        {
            "$or": [{"id": order_id}, {"order_number": order_id}],
            "customer.email": payload["email"],
        },
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/orders/{order_id}/pay-context")
async def get_order_pay_context(order_id: str, request: Request):
    """Return Razorpay re-checkout context for a payment_pending order owned
    by the customer. Re-uses the original `razorpay_order_id` so the customer
    can complete payment without creating a duplicate order.
    """
    payload = get_current_customer(request)
    order = await db.orders.find_one(
        {
            "$or": [{"id": order_id}, {"order_number": order_id}],
            "customer.email": payload["email"],
        },
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")
    if not order.get("razorpay_order_id"):
        raise HTTPException(status_code=400, detail="Order has no Razorpay order to resume")

    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "razorpay_order_id": order["razorpay_order_id"],
        "razorpay_key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
        "amount": order.get("total", 0),
        "amount_paise": int(round(float(order.get("total", 0)) * 100)),
        "currency": "INR",
        "customer": order.get("customer", {}),
    }


@router.get("/orders/{order_id}/tracking")
async def get_order_tracking(order_id: str, request: Request):
    """Return the per-order Shiprocket scan history for the customer's
    Order Detail "Tracking history" drawer. Scoped to the order owner.
    """
    payload = get_current_customer(request)

    order = await db.orders.find_one(
        {
            "$or": [{"id": order_id}, {"order_number": order_id}],
            "customer.email": payload["email"],
        },
        {"_id": 0, "id": 1, "order_number": 1, "awb_code": 1,
         "courier_name": 1, "shipped_at": 1, "delivered_at": 1, "status": 1}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Pull scan events newest-first; cap at 100.
    cursor = db.shiprocket_events.find(
        {"order_id": order["id"]},
        {"_id": 0, "raw_status": 1, "mapped_status": 1, "courier_name": 1,
         "location": 1, "activity": 1, "event_time": 1, "received_at": 1}
    ).sort("event_time", -1)
    events = await cursor.to_list(length=100)

    return {
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "awb_code": order.get("awb_code"),
        "courier_name": order.get("courier_name"),
        "shipped_at": order.get("shipped_at"),
        "delivered_at": order.get("delivered_at"),
        "status": order.get("status"),
        "events": events,
    }

