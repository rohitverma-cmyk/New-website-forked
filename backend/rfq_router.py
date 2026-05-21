"""
RFQ Router - Handles Request for Quote submissions with category-specific fields
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rfq", tags=["rfq"])

# MongoDB reference (will be set from main server)
db = None

def set_db(database):
    """Set database reference from main server"""
    global db
    db = database

# ==================== MODELS ====================

class CompositionItem(BaseModel):
    material: str = ""
    percentage: float = 0


class RFQSubmission(BaseModel):
    # Category selection
    category: str  # cotton, knits, denim, viscose

    # Cotton & Viscose specific
    fabric_requirement_type: Optional[str] = ""  # Greige, Dyed, RFD, Printed

    # Quantity — both legacy bucket strings and new exact numeric
    quantity_meters: Optional[str] = ""  # legacy bucket e.g. "1000_5000"
    quantity_kg: Optional[str] = ""      # legacy bucket
    quantity_value: Optional[float] = 0  # new: exact qty
    quantity_unit: Optional[str] = ""    # new: m | kg | yd

    # Knits specific
    knit_quality: Optional[str] = ""
    knit_type: Optional[str] = ""

    # Denim specific
    denim_specification: Optional[str] = ""
    wash_type: Optional[str] = ""
    weight_oz: Optional[float] = 0

    # Common fabric-spec fields (matches what Vendors enter while listing fabrics)
    sub_category: Optional[str] = ""
    composition: Optional[List[CompositionItem]] = []
    gsm: Optional[float] = 0
    width_inches: Optional[float] = 0
    color: Optional[str] = ""
    pantone_code: Optional[str] = ""
    pattern: Optional[str] = ""
    weave_type: Optional[str] = ""
    thread_count: Optional[str] = ""
    yarn_count: Optional[str] = ""
    stretch: Optional[str] = ""
    finish: Optional[str] = ""
    end_use: Optional[str] = ""
    certifications: Optional[List[str]] = []

    # Reference photos (Cloudinary URLs uploaded by buyer)
    reference_images: Optional[List[str]] = []

    # Pricing & timeline
    target_price_per_unit: Optional[float] = 0
    required_by: Optional[str] = ""  # YYYY-MM-DD
    sample_needed: Optional[bool] = False

    # Delivery
    delivery_city: Optional[str] = ""
    delivery_state: Optional[str] = ""
    delivery_pincode: Optional[str] = ""

    # Contact details — required for anonymous, derived from JWT for logged-in
    full_name: Optional[str] = ""
    email: Optional[str] = ""  # not EmailStr — phone-only login produces synthetic
    phone: Optional[str] = ""
    gst_number: Optional[str] = ""
    website: Optional[str] = ""
    message: Optional[str] = ""
    # When true, RFQ is born as a 'draft'. Vendors can still see it (with a
    # 'Spec sheet partial' pill) but the buyer can keep PATCHing more details
    # via PATCH /api/rfq/{rfq_id} without re-creating a duplicate.
    is_draft: Optional[bool] = False
    # When the wizard is launched from a Product Detail Page, capture
    # the source fabric so vendors see "RFQ raised against SKU LF-XXXX"
    # and can deep-link straight back to the live PDP. Snapshot stored
    # so renames/un-publishes don't break the historical link.
    prefill_fabric_id: Optional[str] = ""

class RFQResponse(BaseModel):
    id: str
    rfq_number: str
    category: str
    fabric_requirement_type: str = ""
    quantity_meters: str = ""
    quantity_kg: str = ""
    quantity_value: float = 0
    quantity_unit: str = ""
    knit_quality: str = ""
    denim_specification: str = ""
    full_name: str
    email: str
    phone: str
    gst_number: str = ""
    website: str = ""
    message: str = ""
    status: str
    created_at: str

# ==================== HELPERS ====================

async def generate_rfq_number() -> str:
    """Generate unique RFQ number like RFQ-XXXXX"""
    import random
    import string
    while True:
        number = 'RFQ-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        existing = await db.rfq_submissions.find_one({'rfq_number': number})
        if not existing:
            return number

def get_quantity_label(category: str, value: str) -> str:
    """Convert quantity value to human-readable label"""
    quantity_labels = {
        "cotton": {
            "1000_5000": "1,000 - 5,000 m",
            "5000_20000": "5,000 - 20,000 m",
            "20000_50000": "20,000 - 50,000 m",
            "50000_plus": "50,000 m+"
        },
        "viscose": {
            "1000_5000": "1,000 - 5,000 m",
            "5000_20000": "5,000 - 20,000 m",
            "20000_50000": "20,000 - 50,000 m",
            "50000_plus": "50,000 m+"
        },
        "denim": {
            "1000_2500": "1,000 - 2,500 m",
            "2500_7500": "2,500 - 7,500 m",
            "7500_25000": "7,500 - 25,000 m",
            "25000_plus": "25,000 m+"
        },
        "knits": {
            "less_than_200": "Less than 200 kg",
            "200_500": "200 - 500 kg",
            "500_1000": "500 - 1,000 kg",
            "1000_plus": "1,000 kg+"
        }
    }
    return quantity_labels.get(category, {}).get(value, value)

# ==================== ENDPOINTS ====================

@router.post("/submit", response_model=RFQResponse)
async def submit_rfq(data: RFQSubmission, request: Request):
    """Submit a new Request for Quote with category-specific details.

    Logged-in customers don't need to send full_name/email/phone —
    we resolve them from the JWT + stored profile so the form can
    skip the contact step entirely.
    """

    rfq_id = str(uuid.uuid4())
    rfq_number = await generate_rfq_number()

    # If the caller is a logged-in customer, attach their customer_id and
    # backfill missing contact fields from the stored profile.
    customer_id = ""
    brand_id = ""
    brand_user_id = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as _jwt
            JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
            payload = _jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
            tok_type = payload.get("type")
            if tok_type == "customer":
                customer_id = payload.get("customer_id", "") or ""
            elif tok_type == "brand":
                brand_id = payload.get("brand_id", "") or ""
                brand_user_id = payload.get("brand_user_id", "") or ""
        except Exception:
            customer_id = ""

    # Resolve contact info from profile if customer is logged in
    profile_email = ""
    profile_phone = ""
    profile_name = ""
    profile_gst = ""
    profile_company = ""
    if customer_id:
        cust = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if cust:
            profile_email = cust.get("email") or ""
            profile_phone = cust.get("phone") or ""
            profile_name = cust.get("name") or ""
            profile_gst = cust.get("gstin") or ""
            profile_company = cust.get("company") or ""
    elif brand_id and brand_user_id:
        # Brand user — backfill from brand_users + brand profile
        bu = await db.brand_users.find_one({"id": brand_user_id}, {"_id": 0})
        br = await db.brands.find_one({"id": brand_id}, {"_id": 0})
        if bu:
            profile_email = bu.get("email") or ""
            profile_name = bu.get("name") or ""
        if br:
            profile_gst = br.get("gst") or ""
            profile_company = br.get("name") or ""
            profile_phone = br.get("phone") or ""

    full_name = (data.full_name or profile_name or "").strip()
    email = (data.email or profile_email or "").strip().lower()
    phone = (data.phone or profile_phone or "").strip()
    gst_number = (data.gst_number or profile_gst or "").strip().upper()

    # Validate — anonymous flow needs the trio; logged-in flow falls back to profile
    if not full_name:
        raise HTTPException(status_code=400, detail="Name is required (or sign in)")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Email or phone is required")
    if not email:
        # Synthetic placeholder so legacy enquiry pipeline doesn't break on empty email
        clean_phone = phone.lstrip("+").replace(" ", "")
        email = f"phone+{clean_phone}@phone.locofast.local"

    # Composition: drop empty rows + accept dict OR pydantic model
    cleaned_composition = []
    for c in (data.composition or []):
        if hasattr(c, "model_dump"):
            c = c.model_dump()
        material = (c.get("material") or "").strip()
        pct = float(c.get("percentage") or 0)
        if material and pct > 0:
            cleaned_composition.append({"material": material, "percentage": pct})

    rfq_doc = {
        'id': rfq_id,
        'rfq_number': rfq_number,
        'customer_id': customer_id,
        'brand_id': brand_id,
        'brand_user_id': brand_user_id,
        'category': data.category,
        'fabric_requirement_type': data.fabric_requirement_type or "",
        'quantity_meters': data.quantity_meters or "",
        'quantity_kg': data.quantity_kg or "",
        'quantity_value': float(data.quantity_value or 0),
        'quantity_unit': (data.quantity_unit or "").lower(),
        'knit_quality': data.knit_quality or "",
        'knit_type': data.knit_type or "",
        'denim_specification': data.denim_specification or "",
        'wash_type': data.wash_type or "",
        'weight_oz': float(data.weight_oz or 0),
        'sub_category': data.sub_category or "",
        'composition': cleaned_composition,
        'gsm': float(data.gsm or 0),
        'width_inches': float(data.width_inches or 0),
        'color': data.color or "",
        'color_or_shade': data.color or "",
        'pantone_code': data.pantone_code or "",
        'pattern': data.pattern or "",
        'weave_type': data.weave_type or "",
        'weave_pattern': data.weave_type or "",
        'thread_count': data.thread_count or "",
        'yarn_count': data.yarn_count or "",
        'stretch': data.stretch or "",
        'finish': data.finish or "",
        'end_use': data.end_use or "",
        'certifications': data.certifications or [],
        'reference_images': data.reference_images or [],
        'target_price_per_unit': float(data.target_price_per_unit or 0),
        'target_price_per_meter': float(data.target_price_per_unit or 0),
        'required_by': data.required_by or "",
        'dispatch_required_by': data.required_by or "",
        'sample_needed': bool(data.sample_needed),
        'delivery_city': data.delivery_city or "",
        'delivery_state': data.delivery_state or "",
        'delivery_pincode': data.delivery_pincode or "",
        'full_name': full_name,
        'email': email,
        'phone': phone,
        'gst_number': gst_number,
        'company': profile_company,
        'website': data.website or "",
        'message': data.message or "",
        'status': 'draft' if data.is_draft else 'new',
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    # ── PDP source-fabric snapshot ──────────────────────────────────────
    # Vendors (and admins) need to know which catalog SKU the RFQ was
    # raised against. We snapshot id/code/name so renames or un-publishes
    # later don't orphan the link, and we resolve the live PDP slug for
    # quick navigation back to the live page.
    if data.prefill_fabric_id:
        f = await db.fabrics.find_one(
            {"id": data.prefill_fabric_id},
            {"_id": 0, "id": 1, "fabric_code": 1, "name": 1, "slug": 1, "category_id": 1, "category_name": 1, "seller_company": 1},
        )
        if f:
            rfq_doc.update({
                'linked_fabric_id': f.get("id", ""),
                'linked_fabric_code': f.get("fabric_code", ""),
                'linked_fabric_name': f.get("name", ""),
                'linked_fabric_slug': f.get("slug", "") or f.get("id", ""),
                'linked_fabric_category': f.get("category_name", "") or f.get("category_id", ""),
                'linked_fabric_seller': f.get("seller_company", ""),
            })

    await db.rfq_submissions.insert_one(rfq_doc)
    rfq_doc.pop("_id", None)

    # Also create an enquiry record for unified tracking
    quantity_value = data.quantity_meters or data.quantity_kg
    quantity_label = get_quantity_label(data.category, quantity_value)
    if data.quantity_value and data.quantity_unit:
        quantity_label = f"{int(data.quantity_value) if data.quantity_value == int(data.quantity_value) else data.quantity_value} {data.quantity_unit}"

    enquiry_message = f"**RFQ #{rfq_number}**\n"
    enquiry_message += f"Category: {data.category.upper()}\n"
    if quantity_label:
        enquiry_message += f"Quantity: {quantity_label}\n"
    if data.fabric_requirement_type:
        enquiry_message += f"Fabric Type: {data.fabric_requirement_type}\n"
    if cleaned_composition:
        comp_str = ", ".join(f"{c['percentage']}% {c['material']}" for c in cleaned_composition)
        enquiry_message += f"Composition: {comp_str}\n"
    if data.gsm:
        enquiry_message += f"GSM: {data.gsm}\n"
    if data.weight_oz:
        enquiry_message += f"Weight: {data.weight_oz} oz\n"
    if data.color:
        enquiry_message += f"Color: {data.color}{f' ({data.pantone_code})' if data.pantone_code else ''}\n"
    if data.target_price_per_unit:
        enquiry_message += f"Target price: ₹{data.target_price_per_unit}/{(data.quantity_unit or 'unit')}\n"
    if data.required_by:
        enquiry_message += f"Required by: {data.required_by}\n"
    if gst_number:
        enquiry_message += f"GST: {gst_number}\n"
    if data.message:
        enquiry_message += f"\nNotes: {data.message}"

    enquiry_doc = {
        'id': str(uuid.uuid4()),
        'name': full_name,
        'email': email,
        'phone': phone,
        'company': profile_company or data.website or "",
        'message': enquiry_message,
        'enquiry_type': 'rfq',
        'source': 'rfq_page',
        'rfq_id': rfq_id,
        'rfq_number': rfq_number,
        'status': 'new',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.enquiries.insert_one(enquiry_doc)

    # Send email notification (async, don't block)
    try:
        from email_router import send_rfq_notification, send_rfq_vendor_fanout
        import asyncio
        asyncio.create_task(send_rfq_notification(rfq_doc))
        asyncio.create_task(send_rfq_vendor_fanout(rfq_doc))
    except Exception as e:
        logger.warning(f"Failed to queue RFQ email: {str(e)}")

    logger.info(f"New RFQ submitted: {rfq_number} for {data.category} (customer={customer_id or 'anon'})")

    return RFQResponse(**rfq_doc)


# ==================== SHORTFALL RFQ ====================
class ShortfallRFQ(BaseModel):
    """Generated when a buyer wants more than what's in stock for a fabric.
    Inventory portion stays in cart (handled client-side); the shortfall
    becomes an RFQ with a 24-hour exclusive lock to the SKU's seller, then
    opens up to all eligible vendors in the same category.
    """
    fabric_id: str
    requested_qty: int
    available_qty: int
    shortfall_qty: int
    full_name: str
    email: str
    phone: str
    gst_number: Optional[str] = ""
    company: Optional[str] = ""
    message: Optional[str] = ""
    # Optional — when the inventory portion is converted to an order, the
    # caller can patch `linked_order_id` onto the RFQ later.


@router.post("/shortfall")
async def create_shortfall_rfq(data: ShortfallRFQ, request: Request):
    """Create a shortfall RFQ that is locked to the SKU's seller for 24 h
    (first-refusal window) and then released to the wider category pool.
    """
    if data.shortfall_qty <= 0:
        raise HTTPException(status_code=400, detail="Shortfall must be > 0")

    fabric = await db.fabrics.find_one({"id": data.fabric_id}, {"_id": 0})
    if not fabric:
        raise HTTPException(status_code=404, detail="Fabric not found")

    # Pull the customer_id off the bearer token if present so the RFQ shows
    # up in the buyer's "My Queries" tab without an extra link step.
    customer_id = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as _jwt
            JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
            payload = _jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
            if payload.get("type") == "customer":
                customer_id = payload.get("customer_id", "") or ""
        except Exception:
            customer_id = ""

    rfq_id = str(uuid.uuid4())
    rfq_number = await generate_rfq_number()

    # Map fabric category_id → RFQ category slug used by vendor pool routing
    category_slug_map = {
        "cat-cotton": "cotton",
        "cat-denim": "denim",
        "cat-viscose": "viscose",
        "cat-polyester": "knits",
        "cat-linen": "cotton",
        "cat-sustainable": "cotton",
    }
    rfq_category = category_slug_map.get(fabric.get("category_id", ""), "cotton")

    now = datetime.now(timezone.utc)
    lock_expires_at = (now + timedelta(hours=24)).isoformat()

    summary = (
        f"Inventory shortfall on {fabric.get('fabric_code') or fabric.get('name', '')}. "
        f"Buyer wants {data.requested_qty} m. {data.available_qty} m available in stock; "
        f"requesting quote for the remaining {data.shortfall_qty} m."
    )
    message = (data.message or "").strip()
    full_message = (message + "\n\n" if message else "") + summary

    rfq_doc = {
        "id": rfq_id,
        "rfq_number": rfq_number,
        "customer_id": customer_id,
        "category": rfq_category,
        "fabric_requirement_type": fabric.get("fabric_requirement_type", "")
            or ("Greige" if fabric.get("category_id") != "cat-denim" else ""),
        "quantity_meters": str(data.shortfall_qty),
        "quantity_kg": "",
        "knit_quality": "",
        "denim_specification": "",
        "full_name": data.full_name,
        "email": data.email,
        "phone": data.phone,
        "gst_number": data.gst_number or "",
        "website": data.company or "",
        "message": full_message,
        "status": "new",
        "created_at": now.isoformat(),
        # Shortfall metadata
        "is_shortfall": True,
        "linked_fabric_id": data.fabric_id,
        "linked_fabric_code": fabric.get("fabric_code", ""),
        "linked_fabric_name": fabric.get("name", ""),
        "linked_inventory_qty": data.available_qty,
        "linked_total_requested_qty": data.requested_qty,
        # Vendor first-refusal lock — only the SKU's seller sees it for 24 h
        "vendor_lock_id": fabric.get("seller_id") or "",
        "vendor_lock_expires_at": lock_expires_at,
    }

    await db.rfq_submissions.insert_one(rfq_doc)

    # Mirror to enquiries collection so it shows up in admin Leads/Enquiries.
    await db.enquiries.insert_one({
        "id": str(uuid.uuid4()),
        "name": data.full_name,
        "email": data.email,
        "phone": data.phone,
        "company": data.company or "",
        "message": f"**Shortfall RFQ #{rfq_number}**\n{full_message}",
        "enquiry_type": "rfq_shortfall",
        "source": "pdp_shortfall_modal",
        "rfq_id": rfq_id,
        "rfq_number": rfq_number,
        "status": "new",
        "created_at": now.isoformat(),
    })

    # Fire email notification (best-effort)
    try:
        from email_router import send_rfq_notification, send_rfq_vendor_fanout
        import asyncio
        asyncio.create_task(send_rfq_notification(rfq_doc))
        # Shortfall fan-out emails only the locked source vendor during
        # the 24 h exclusive window (handled inside the helper).
        asyncio.create_task(send_rfq_vendor_fanout(rfq_doc))
    except Exception as e:
        logger.warning(f"Failed to queue shortfall RFQ email: {str(e)}")

    logger.info(
        f"Shortfall RFQ {rfq_number} created — "
        f"fabric={data.fabric_id}, vendor_lock={rfq_doc['vendor_lock_id']}, "
        f"shortfall={data.shortfall_qty}m"
    )

    return {
        "id": rfq_id,
        "rfq_number": rfq_number,
        "shortfall_qty": data.shortfall_qty,
        "available_qty": data.available_qty,
        "vendor_lock_id": rfq_doc["vendor_lock_id"],
        "vendor_lock_expires_at": lock_expires_at,
    }


@router.get("/list")
async def list_rfqs(
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """List RFQ submissions (admin only - auth can be added later)"""
    query = {}
    if status:
        query['status'] = status
    if category:
        query['category'] = category
    
    rfqs = await db.rfq_submissions.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rfq_submissions.count_documents(query)
    
    return {
        'rfqs': rfqs,
        'total': total,
        'limit': limit,
        'skip': skip
    }

@router.get("/{rfq_id}")
async def get_rfq(rfq_id: str):
    """Get a specific RFQ by ID"""
    rfq = await db.rfq_submissions.find_one({'id': rfq_id}, {'_id': 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq

@router.put("/{rfq_id}/status")
async def update_rfq_status(rfq_id: str, status: str):
    """Update RFQ status"""
    valid_statuses = ['new', 'contacted', 'quoted', 'won', 'lost', 'closed']
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.rfq_submissions.update_one(
        {'id': rfq_id},
        {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="RFQ not found")
    
    return {'message': 'Status updated', 'status': status}


# ════════════════════════════════════════════════════════════════════
# PATCH /api/rfq/{rfq_id} — progressive enrichment of a draft RFQ
# Used by the multi-step wizard: Step 1 POSTs with is_draft=true to
# create the RFQ, subsequent steps PATCH only the fields they collect.
# Permission: only the original submitter (matched via JWT) can edit.
# Once the RFQ has a `won` quote, edits are frozen.
# ════════════════════════════════════════════════════════════════════
class RFQPatch(BaseModel):
    # Every field is optional — clients send only the ones they touched.
    fabric_requirement_type: Optional[str] = None
    quantity_meters: Optional[str] = None
    quantity_kg: Optional[str] = None
    quantity_value: Optional[float] = None
    quantity_unit: Optional[str] = None
    knit_quality: Optional[str] = None
    knit_type: Optional[str] = None
    denim_specification: Optional[str] = None
    composition: Optional[List[CompositionItem]] = None
    gsm: Optional[float] = None
    weight_oz: Optional[float] = None
    width_inches: Optional[float] = None
    color: Optional[str] = None
    pantone_code: Optional[str] = None
    pattern: Optional[str] = None
    weave_type: Optional[str] = None
    thread_count: Optional[str] = None
    yarn_count: Optional[str] = None
    stretch: Optional[str] = None
    finish: Optional[str] = None
    end_use: Optional[str] = None
    certifications: Optional[List[str]] = None
    reference_images: Optional[List[str]] = None
    target_price_per_unit: Optional[float] = None
    required_by: Optional[str] = None
    sample_needed: Optional[bool] = None
    delivery_city: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_pincode: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None
    website: Optional[str] = None
    message: Optional[str] = None
    # PDP source-fabric link (lets a draft created without PDP context
    # later capture the source SKU, e.g. if the user navigates back).
    prefill_fabric_id: Optional[str] = None
    # When client sends finalize=true on the LAST step, we promote draft→new
    finalize: Optional[bool] = False


def _decode_caller(auth_header: str) -> dict:
    """Decode the bearer JWT and return {customer_id, brand_id, brand_user_id}.
    Empty strings when not logged in. Mirrors the logic in submit_rfq."""
    out = {"customer_id": "", "brand_id": "", "brand_user_id": ""}
    if not auth_header.startswith("Bearer "):
        return out
    try:
        import jwt as _jwt
        JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
        payload = _jwt.decode(auth_header.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
        ttype = payload.get("type")
        if ttype == "customer":
            out["customer_id"] = payload.get("customer_id", "") or ""
        elif ttype == "brand":
            out["brand_id"] = payload.get("brand_id", "") or ""
            out["brand_user_id"] = payload.get("brand_user_id", "") or ""
    except Exception:
        pass
    return out


@router.patch("/{rfq_id}")
async def patch_rfq(rfq_id: str, data: RFQPatch, request: Request):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    # Permission — owner only (customer or brand user)
    caller = _decode_caller(request.headers.get("Authorization", ""))
    is_owner = (
        (rfq.get("customer_id") and rfq.get("customer_id") == caller["customer_id"]) or
        (rfq.get("brand_id") and rfq.get("brand_id") == caller["brand_id"])
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="You can only edit your own RFQ")

    # Frozen once a vendor quote is `won`
    won = await db.vendor_quotes.find_one({"rfq_id": rfq_id, "status": "won"}, {"_id": 0, "id": 1})
    if won:
        raise HTTPException(status_code=400, detail="This RFQ is closed (a quote was accepted) and can no longer be edited")

    payload = data.model_dump(exclude={"finalize"}, exclude_none=True)
    # Composition rebuild — convert nested Pydantic models to dict
    if "composition" in payload:
        cleaned = []
        for c in (data.composition or []):
            if c.material and (c.percentage or 0) > 0:
                cleaned.append({"material": c.material, "percentage": float(c.percentage)})
        payload["composition"] = cleaned

    # Mirror legacy aliases used elsewhere in the codebase
    if "color" in payload:
        payload["color_or_shade"] = payload["color"]
    if "weave_type" in payload:
        payload["weave_pattern"] = payload["weave_type"]
    if "target_price_per_unit" in payload:
        payload["target_price_per_meter"] = payload["target_price_per_unit"]
    if "required_by" in payload:
        payload["dispatch_required_by"] = payload["required_by"]

    # PDP source-fabric snapshot — same logic as POST. If buyer comes
    # back to a fabric on a later step, persist the link now.
    if "prefill_fabric_id" in payload:
        fid = payload.pop("prefill_fabric_id")
        if fid:
            f = await db.fabrics.find_one(
                {"id": fid},
                {"_id": 0, "id": 1, "fabric_code": 1, "name": 1, "slug": 1, "category_id": 1, "category_name": 1, "seller_company": 1},
            )
            if f:
                payload['linked_fabric_id'] = f.get("id", "")
                payload['linked_fabric_code'] = f.get("fabric_code", "")
                payload['linked_fabric_name'] = f.get("name", "")
                payload['linked_fabric_slug'] = f.get("slug", "") or f.get("id", "")
                payload['linked_fabric_category'] = f.get("category_name", "") or f.get("category_id", "")
                payload['linked_fabric_seller'] = f.get("seller_company", "")

    promoted_to_new = False
    if data.finalize and rfq.get("status") == "draft":
        payload["status"] = "new"
        payload["finalized_at"] = datetime.now(timezone.utc).isoformat()
        promoted_to_new = True

    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.rfq_submissions.update_one({"id": rfq_id}, {"$set": payload})

    rfq2 = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    return {
        "message": "RFQ updated",
        "rfq": rfq2,
        "promoted_to_new": promoted_to_new,
    }
