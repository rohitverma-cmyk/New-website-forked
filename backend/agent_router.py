"""
Agent Router - OTP-based email login for sales agents.
Agents can browse catalog, build carts, share cart links with customers.
Admin can create/edit/deactivate agents.
"""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
import os
import random
import logging
import jwt
import asyncio
import uuid
import resend
import shutil
from pathlib import Path
import httpx

# ==================== EXCHANGE RATE CACHE ====================

_exchange_rate_cache = {"rate": None, "date": None}
METERS_TO_YARDS = 1.0936

async def get_usd_rate() -> float:
    """Get daily cached INR→USD rate."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _exchange_rate_cache["rate"] and _exchange_rate_cache["date"] == today:
        return _exchange_rate_cache["rate"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://open.er-api.com/v6/latest/INR")
            data = resp.json()
            rate = data.get("rates", {}).get("USD", 0.0119)
            _exchange_rate_cache["rate"] = rate
            _exchange_rate_cache["date"] = today
            return rate
    except Exception as e:
        logger.warning(f"Exchange rate fetch failed: {e}")
        return _exchange_rate_cache["rate"] or 0.0119  # fallback ~84 INR/USD

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])

db = None
JWT_SECRET = os.environ.get('JWT_SECRET', 'locofast-agent-secret-2026')
JWT_ALGORITHM = "HS256"
OTP_EXPIRY_MINUTES = 10

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

class SharedCartItem(BaseModel):
    fabric_id: str
    fabric_name: str
    fabric_code: str = ""
    category_name: str = ""
    seller_company: str = ""
    seller_id: str = ""
    quantity: int
    price_per_meter: float
    order_type: str = "bulk"
    image_url: str = ""
    hsn_code: str = ""

class CreateSharedCartRequest(BaseModel):
    items: list[SharedCartItem]
    customer_email: str = ""
    notes: str = ""
    payment_proof_url: str = ""  # RTGS/NEFT screenshot URL
    dispatch_country: str = "india"  # "india" or "bangladesh"


# ==================== AUTH HELPERS ====================

def create_agent_token(email: str, agent_id: str, name: str) -> str:
    payload = {
        "email": email,
        "agent_id": agent_id,
        "name": name,
        "type": "agent",
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_agent(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "agent":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== OTP ENDPOINTS ====================

@router.post("/send-otp")
async def send_otp(data: SendOTPRequest):
    email = data.email.lower().strip()

    # Check agent exists and is active
    agent = await db.agents.find_one({'email': email, 'status': 'active'}, {'_id': 0})
    if not agent:
        raise HTTPException(status_code=403, detail="No active agent account found for this email. Contact admin.")

    now = datetime.now(timezone.utc)

    # Rate limit
    cutoff = (now - timedelta(minutes=10)).isoformat()
    recent = await db.agent_otps.count_documents({'email': email, 'created_at': {'$gte': cutoff}})
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait.")

    otp = str(random.randint(100000, 999999))

    await db.agent_otps.insert_one({
        'email': email,
        'otp': otp,
        'used': False,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    })

    if RESEND_API_KEY:
        try:
            params = {
                "from": f"Locofast <{SENDER_EMAIL}>",
                "to": [email],
                "subject": f"Agent Login Code: {otp}",
                "html": f"""
                <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                    <img src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg" alt="Locofast" height="32" style="margin-bottom: 32px;" />
                    <h2 style="font-size: 24px; font-weight: 600; margin: 0 0 8px;">Agent Login Code</h2>
                    <p style="color: #64748b; margin: 0 0 32px;">Enter this code to sign in to your Locofast Agent portal:</p>
                    <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
                        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1e293b;">{otp}</span>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This code expires in {OTP_EXPIRY_MINUTES} minutes.</p>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logger.error(f"Failed to send agent OTP email: {e}")
            raise HTTPException(status_code=500, detail="Failed to send OTP.")
    else:
        logger.warning(f"No Resend key — Agent OTP for {email}: {otp}")

    return {"message": "OTP sent to your email", "email": email}


@router.post("/verify-otp")
async def verify_otp(data: VerifyOTPRequest):
    email = data.email.lower().strip()
    now = datetime.now(timezone.utc)

    otp_doc = await db.agent_otps.find_one({
        'email': email, 'otp': data.otp, 'used': False,
        'expires_at': {'$gte': now.isoformat()}
    })
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    await db.agent_otps.update_one({'_id': otp_doc['_id']}, {'$set': {'used': True}})

    agent = await db.agents.find_one({'email': email, 'status': 'active'}, {'_id': 0})
    if not agent:
        raise HTTPException(status_code=403, detail="Agent account not active")

    token = create_agent_token(email, agent['id'], agent.get('name', ''))

    return {
        "token": token,
        "agent": agent
    }


# ==================== AGENT PROFILE ====================

@router.get("/me")
async def get_agent_profile(request: Request):
    payload = get_current_agent(request)
    agent = await db.agents.find_one({'email': payload['email']}, {'_id': 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


# ==================== EXCHANGE RATE ENDPOINT ====================

@router.get("/exchange-rate")
async def get_exchange_rate():
    """Get current INR→USD exchange rate (daily cached)."""
    rate = await get_usd_rate()
    return {"inr_to_usd": rate, "usd_to_inr": round(1 / rate, 2) if rate else 84.0, "meters_to_yards": METERS_TO_YARDS}


# ==================== SHARED CART ====================

@router.post("/shared-cart")
async def create_shared_cart(data: CreateSharedCartRequest, request: Request):
    """Create a shared cart with a unique token link for the customer."""
    payload = get_current_agent(request)

    if not data.items:
        raise HTTPException(status_code=400, detail="Cart must have at least one item")

    cart_id = str(uuid.uuid4())
    cart_token = str(uuid.uuid4()).replace('-', '')[:12]
    now = datetime.now(timezone.utc)

    # Calculate Bangladesh charges if applicable
    bangladesh_charges = None
    usd_rate = None
    if data.dispatch_country == "bangladesh":
        subtotal = sum(item.quantity * item.price_per_meter for item in data.items)
        usd_rate = await get_usd_rate()
        border_logistics = round(subtotal * 0.01, 2)
        export_documentation = round(subtotal * 0.004, 2)
        custom_clearance = round(subtotal * 0.0105, 2)
        bangladesh_charges = {
            "border_logistics_pct": 1.0,
            "border_logistics": border_logistics,
            "export_documentation_pct": 0.40,
            "export_documentation": export_documentation,
            "custom_clearance_pct": 1.05,
            "custom_clearance": custom_clearance,
            "total_extra_charges": round(border_logistics + export_documentation + custom_clearance, 2),
            "inr_to_usd_rate": usd_rate,
            "subtotal_inr": subtotal,
            "subtotal_usd": round(subtotal * usd_rate, 2),
        }

    cart_doc = {
        'id': cart_id,
        'token': cart_token,
        'agent_id': payload['agent_id'],
        'agent_email': payload['email'],
        'agent_name': payload.get('name', ''),
        'items': [item.model_dump() for item in data.items],
        'customer_email': data.customer_email,
        'notes': data.notes,
        'payment_proof_url': data.payment_proof_url,
        'dispatch_country': data.dispatch_country,
        'bangladesh_charges': bangladesh_charges,
        'usd_rate': usd_rate,
        'status': 'pending',
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(days=7)).isoformat()
    }

    await db.shared_carts.insert_one(cart_doc)

    return {
        'cart_id': cart_id,
        'token': cart_token,
        'status': 'pending',
        'bangladesh_charges': bangladesh_charges,
    }


@router.get("/shared-carts")
async def list_shared_carts(request: Request):
    """List all shared carts for the logged-in agent."""
    payload = get_current_agent(request)
    carts = await db.shared_carts.find(
        {'agent_email': payload['email']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return carts


@router.delete("/shared-cart/{cart_id}")
async def delete_shared_cart(cart_id: str, request: Request):
    """Soft-delete a shared cart that's no longer required. Refuses to
    delete carts that have already been converted into an order — those
    must stay around for audit/attribution. The cart owner (agent) must
    match the requester.
    """
    payload = get_current_agent(request)
    # Match on `id` first, fall back to `token` so the FE can pass either
    cart = await db.shared_carts.find_one(
        {'$or': [{'id': cart_id}, {'token': cart_id}], 'agent_email': payload['email']},
        {'_id': 0}
    )
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    if cart.get('status') == 'completed':
        raise HTTPException(
            status_code=400,
            detail="This cart has already been converted into an order and cannot be deleted."
        )
    await db.shared_carts.delete_one({'id': cart['id']})
    return {"success": True, "deleted_id": cart['id'], "message": "Shared cart deleted"}


@router.post("/upload-payment-proof")
async def upload_payment_proof(file: UploadFile = File(...), request: Request = None):
    """Upload RTGS/NEFT payment proof screenshot."""
    get_current_agent(request)  # Verify auth

    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # Save to uploads directory
    upload_dir = Path(__file__).parent / 'uploads' / 'payment_proofs'
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    file_path = upload_dir / filename

    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)

    # Return URL path
    url = f"/api/uploads/payment_proofs/{filename}"
    return {"url": url, "filename": filename}



# ==================== PUBLIC SHARED CART (no auth) ====================

@router.get("/cart/{token}")
async def get_shared_cart(token: str):
    """Public endpoint: Get shared cart by token for customer to view and pay."""
    cart = await db.shared_carts.find_one({'token': token}, {'_id': 0})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found or expired")

    now = datetime.now(timezone.utc).isoformat()
    if cart.get('expires_at', '') < now:
        raise HTTPException(status_code=410, detail="This cart link has expired")

    if cart.get('status') == 'completed':
        raise HTTPException(status_code=410, detail="This cart has already been checked out")

    return cart


# ==================== AGENT ORDER HISTORY ====================

@router.get("/orders")
async def get_agent_orders(request: Request):
    """Get all orders created via this agent's shared carts."""
    payload = get_current_agent(request)
    orders = await db.orders.find(
        {'agent_email': payload['email']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return orders


# ==================== ADMIN: AGENT MANAGEMENT ====================

@router.get("/admin/list")
async def admin_list_agents(request: Request):
    """Admin: list all agents."""
    agents = await db.agents.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return agents


@router.post("/admin/create")
async def admin_create_agent(data: dict, request: Request):
    """Admin: create a new agent."""
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")

    existing = await db.agents.find_one({'email': email})
    if existing:
        raise HTTPException(status_code=400, detail="Agent with this email already exists")

    agent_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    agent_doc = {
        'id': agent_id,
        'name': name,
        'email': email,
        'phone': data.get('phone', ''),
        'status': 'active',
        'created_at': now,
        'updated_at': now
    }

    await db.agents.insert_one(agent_doc)
    agent_doc.pop('_id', None)
    return agent_doc


@router.put("/admin/{agent_id}")
async def admin_update_agent(agent_id: str, data: dict, request: Request):
    """Admin: update agent details or status."""
    update = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if 'name' in data:
        update['name'] = data['name']
    if 'phone' in data:
        update['phone'] = data['phone']
    if 'status' in data:
        if data['status'] not in ('active', 'inactive'):
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'inactive'")
        update['status'] = data['status']

    result = await db.agents.update_one({'id': agent_id}, {'$set': update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = await db.agents.find_one({'id': agent_id}, {'_id': 0})
    return agent


@router.get("/admin/{agent_id}/stats")
async def admin_agent_stats(agent_id: str, request: Request):
    """Admin: get agent performance stats."""
    agent = await db.agents.find_one({'id': agent_id}, {'_id': 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    total_carts = await db.shared_carts.count_documents({'agent_id': agent_id})
    completed_carts = await db.shared_carts.count_documents({'agent_id': agent_id, 'status': 'completed'})
    total_orders = await db.orders.count_documents({'agent_id': agent_id})

    pipeline = [
        {"$match": {"agent_id": agent_id, "payment_status": "paid"}},
        {"$group": {"_id": None, "revenue": {"$sum": "$total"}}}
    ]
    rev = await db.orders.aggregate(pipeline).to_list(1)
    revenue = rev[0]['revenue'] if rev else 0

    return {
        'agent': agent,
        'total_carts_shared': total_carts,
        'completed_carts': completed_carts,
        'total_orders': total_orders,
        'total_revenue': round(revenue, 2),
        'conversion_rate': round((completed_carts / total_carts * 100) if total_carts > 0 else 0, 1)
    }
