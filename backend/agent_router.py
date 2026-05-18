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


# ==================== CUSTOMER LOOKUP + SHARED-CART INVITE ====================

class SendCartInviteRequest(BaseModel):
    phone: str
    email: EmailStr | None = None
    customer_name: str | None = None  # Required only when phone is not on file


@router.get("/customer-lookup")
async def agent_customer_lookup(phone: str, request: Request):
    """Agent helper: check if `phone` is a known Locofast customer. Returns
    `{ exists: bool, name, email, company }` so the agent UI can autofill
    the customer name when sending a curated cart invite."""
    get_current_agent(request)
    from gupshup_service import normalize_indian_phone
    valid, e164 = normalize_indian_phone(phone or "")
    if not valid:
        return {"exists": False, "valid_phone": False}
    cust = await db.customers.find_one({"phone": e164}, {"_id": 0, "id": 1, "name": 1, "email": 1, "company": 1, "phone": 1})
    if not cust:
        return {"exists": False, "valid_phone": True, "normalized_phone": e164}
    # Synthetic phone-only emails — hide from the agent so they don't paste
    # a `@phone.locofast.local` placeholder into the email field.
    em = cust.get("email", "") or ""
    if em.endswith("@phone.locofast.local"):
        em = ""
    return {
        "exists": True,
        "valid_phone": True,
        "normalized_phone": e164,
        "customer_id": cust.get("id"),
        "name": cust.get("name") or "",
        "email": em,
        "company": cust.get("company") or "",
    }


@router.post("/shared-cart/{cart_id}/send-invite")
async def send_shared_cart_invite(cart_id: str, data: SendCartInviteRequest, request: Request):
    """Send the shared-cart link to the customer via WhatsApp + Email.

    Resolves the customer by phone first:
      - if the phone is already in `db.customers`, we use that record (and
        ignore the `customer_name` field — the existing name wins).
      - if not, the agent MUST pass `customer_name` so we can stamp it on
        the cart and create a lightweight customer doc for future lookups.

    Both WhatsApp + Email are best-effort: a partial send (e.g. email OK,
    WhatsApp failed) still returns 200 with per-channel diagnostics so the
    agent can decide whether to retry.
    """
    payload = get_current_agent(request)
    from gupshup_service import normalize_indian_phone, send_whatsapp_text

    cart = await db.shared_carts.find_one(
        {"$or": [{"id": cart_id}, {"token": cart_id}], "agent_email": payload["email"]},
        {"_id": 0},
    )
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    if cart.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Cart already converted to an order — invite not sent.")

    valid, phone_e164 = normalize_indian_phone(data.phone or "")
    if not valid:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number")

    customer_email = (data.email or "").strip().lower() if data.email else ""

    # Resolve / create customer
    cust = await db.customers.find_one({"phone": phone_e164}, {"_id": 0})
    was_existing = bool(cust)
    now_iso = datetime.now(timezone.utc).isoformat()
    if cust:
        customer_name = cust.get("name") or (data.customer_name or "").strip()
        if not cust.get("email") and customer_email:
            # Backfill email if the existing record only had a placeholder
            current = cust.get("email") or ""
            if not current or current.endswith("@phone.locofast.local"):
                await db.customers.update_one(
                    {"id": cust["id"]},
                    {"$set": {"email": customer_email, "updated_at": now_iso}},
                )
    else:
        customer_name = (data.customer_name or "").strip()
        if not customer_name:
            raise HTTPException(
                status_code=400,
                detail="Customer name is required (this number isn't on file yet)",
            )
        # Create lightweight customer so we can find them next time the
        # agent looks up this phone.
        new_id = str(uuid.uuid4())
        placeholder_email = customer_email or f"phone+{phone_e164}@phone.locofast.local"
        await db.customers.insert_one({
            "id": new_id,
            "email": placeholder_email,
            "name": customer_name,
            "phone": phone_e164,
            "phone_verified": False,
            "company": "",
            "gstin": "",
            "address": "", "city": "", "state": "", "pincode": "",
            "created_via": "agent_shared_cart",
            "created_by_agent_email": payload["email"],
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        cust = {"id": new_id, "email": placeholder_email, "name": customer_name, "phone": phone_e164}

    # Stamp the cart with the resolved customer (so the listing UI shows
    # who it was sent to, and so a later "Resend" picks up the same data).
    cart_update = {
        "customer_phone": phone_e164,
        "customer_name": customer_name,
        "last_invited_at": now_iso,
    }
    if customer_email:
        cart_update["customer_email"] = customer_email
    await db.shared_carts.update_one({"id": cart["id"]}, {"$set": cart_update})

    # Compose the share message — kept short, both channels share copy.
    base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/") or "https://locofast.com"
    share_url = f"{base_url}/shared-cart/{cart['token']}"
    cart_items = cart.get("items") or []
    item_count = len(cart_items)
    subtotal = sum(
        (float(i.get("quantity") or 0)) * (float(i.get("price_per_meter") or 0))
        for i in cart_items
    )
    agent_name = cart.get("agent_name") or payload.get("name") or "your Locofast agent"

    # Itemized breakdown — show every fabric with quantity + order type.
    # WhatsApp gets a plain-text bullet list; email gets an HTML <ul>.
    # Long carts (>8 items) get truncated with a "+N more" line so the
    # message stays within reasonable WhatsApp render limits.
    MAX_PREVIEW = 8
    preview = cart_items[:MAX_PREVIEW]
    overflow = item_count - len(preview)

    def _fmt_qty(it):
        q = it.get("quantity") or 0
        try:
            q_num = float(q)
            q_str = f"{int(q_num)}" if q_num == int(q_num) else f"{q_num:g}"
        except Exception:
            q_str = str(q)
        return f"{q_str}m"

    wa_items_lines = []
    for it in preview:
        name = (it.get("fabric_name") or "Fabric").strip()
        qty_str = _fmt_qty(it)
        otype = (it.get("order_type") or "bulk").strip().lower()
        tag = "Sample" if otype == "sample" else "Bulk"
        wa_items_lines.append(f"• {name} — {qty_str} ({tag})")
    if overflow > 0:
        wa_items_lines.append(f"• +{overflow} more item{'s' if overflow != 1 else ''}")
    wa_items_block = "\n".join(wa_items_lines)

    wa_body = (
        f"Hi {customer_name or 'there'},\n\n"
        f"I've curated a fabric cart for you on Locofast — {item_count} item{'s' if item_count != 1 else ''} ready to review.\n\n"
        + (f"{wa_items_block}\n\n" if wa_items_block else "")
        + (f"Indicative subtotal: Rs {subtotal:,.0f} (excl. GST, logistics & packaging).\n\n" if subtotal > 0 else "")
        + f"Place the order here:\n{share_url}\n\n"
        f"— {agent_name}\nLocofast Online Services"
    )

    wa_result = await send_whatsapp_text(phone_e164, wa_body)

    # Email send (best-effort)
    email_result = {"success": False, "skipped": True}
    if customer_email and RESEND_API_KEY:
        try:
            email_items_html = "".join(
                f'<li style="padding:6px 0;border-bottom:1px solid #eef2f7;color:#1e293b;">'
                f'<strong>{(it.get("fabric_name") or "Fabric").strip()}</strong>'
                f' — {_fmt_qty(it)} '
                f'<span style="color:#64748b;font-size:12px;">'
                f'({"Sample" if (it.get("order_type") or "bulk").strip().lower() == "sample" else "Bulk"})'
                f'</span></li>'
                for it in preview
            )
            if overflow > 0:
                email_items_html += (
                    f'<li style="padding:6px 0;color:#64748b;font-size:13px;">'
                    f'+ {overflow} more item{"s" if overflow != 1 else ""}</li>'
                )
            params = {
                "from": f"Locofast <{SENDER_EMAIL}>",
                "to": [customer_email],
                "subject": "Your curated fabric cart from Locofast",
                "html": f"""
                <div style="font-family: Inter, system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
                    <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">Your curated fabric cart</h2>
                    <p style="color: #475569; line-height: 1.5;">Hi {customer_name or 'there'},</p>
                    <p style="color: #475569; line-height: 1.5;">{agent_name} has prepared a cart of <strong>{item_count} item{'s' if item_count != 1 else ''}</strong> for you on Locofast.</p>
                    <ul style="list-style:none;padding:0;margin:16px 0;border-top:1px solid #eef2f7;">
                        {email_items_html}
                    </ul>
                    {f'<p style="color:#475569;line-height:1.5;">Indicative subtotal: <strong>Rs {subtotal:,.0f}</strong> (excl. GST, logistics &amp; packaging).</p>' if subtotal > 0 else ''}
                    <p style="margin: 24px 0;"><a href="{share_url}" style="display: inline-block; background: #2563EB; color: #fff; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 600;">Review &amp; Place Order</a></p>
                    <p style="color: #94a3b8; font-size: 12px;">The link is private to you and valid for 7 days. Reply to this email with any questions.</p>
                </div>
                """,
            }
            resend.Emails.send(params)
            email_result = {"success": True, "skipped": False}
        except Exception as e:  # noqa: BLE001
            logger.error(f"Resend send-invite failed for {customer_email}: {e}")
            email_result = {"success": False, "skipped": False, "error": str(e)}
    elif not customer_email:
        email_result = {"success": False, "skipped": True, "reason": "no_email_provided"}

    return {
        "success": bool(wa_result.get("success") or email_result.get("success")),
        "customer": {
            "id": cust.get("id"),
            "phone": phone_e164,
            "name": customer_name,
            "email": customer_email or cust.get("email", ""),
            "was_existing": was_existing,
        },
        "whatsapp": wa_result,
        "email": email_result,
        "share_url": share_url,
    }




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
