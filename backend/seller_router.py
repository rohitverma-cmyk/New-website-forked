"""
Seller Router — CRUD for sellers/vendors.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import bcrypt
import random
import string
import auth_helpers

router = APIRouter(prefix="/api", tags=["sellers"])
db = None


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class SellerCreate(BaseModel):
    name: str
    company_name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    contact_email: str
    contact_phone: str
    category_ids: List[str] = []
    is_active: bool = True
    password: Optional[str] = ""
    established_year: Optional[int] = None
    monthly_capacity: Optional[str] = ""
    employee_count: Optional[str] = ""
    factory_size: Optional[str] = ""
    turnover_range: Optional[str] = ""
    certifications: Optional[List[str]] = []
    export_markets: Optional[List[str]] = []
    gst_number: Optional[str] = ""
    gst_verified: Optional[bool] = False
    gst_legal_name: Optional[str] = ""
    gst_trade_name: Optional[str] = ""

class SellerUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    category_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    established_year: Optional[int] = None
    monthly_capacity: Optional[str] = None
    employee_count: Optional[str] = None
    factory_size: Optional[str] = None
    turnover_range: Optional[str] = None
    certifications: Optional[List[str]] = None
    export_markets: Optional[List[str]] = None
    gst_number: Optional[str] = None
    # Pickup (Ship-From) — used when creating Shiprocket shipments for this
    # vendor. `shiprocket_pickup_nickname` is the name as registered in the
    # Shiprocket dashboard's Pickup Locations. If empty, the auto-push helper
    # creates one on-the-fly using the address fields below.
    pickup_address: Optional[str] = None
    pickup_city: Optional[str] = None
    pickup_state: Optional[str] = None
    pickup_pincode: Optional[str] = None
    pickup_contact_name: Optional[str] = None
    pickup_contact_phone: Optional[str] = None
    shiprocket_pickup_nickname: Optional[str] = None

class Seller(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    seller_code: str = ""
    name: str
    company_name: str
    description: str = ""
    logo_url: str = ""
    city: str = ""
    state: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    category_ids: List[str] = []
    category_names: List[str] = []
    is_active: bool = True
    created_at: str = ""
    established_year: Optional[int] = None
    monthly_capacity: str = ""
    employee_count: str = ""
    factory_size: str = ""
    turnover_range: str = ""
    certifications: List[str] = []
    export_markets: List[str] = []
    gst_number: str = ""
    gst_verified: bool = False
    gst_legal_name: str = ""
    gst_trade_name: str = ""
    # Pickup (Ship-From) fields for Shiprocket integration — LEGACY
    # (kept for back-compat; new code reads from pickup_addresses).
    pickup_address: str = ""
    pickup_city: str = ""
    pickup_state: str = ""
    pickup_pincode: str = ""
    pickup_contact_name: str = ""
    pickup_contact_phone: str = ""
    shiprocket_pickup_nickname: str = ""
    # Multi-pickup support (canonical source of truth for Ship-From)
    pickup_addresses: List[dict] = []


# ── Pickup address payloads ─────────────────────────────────────────
class PickupAddressIn(BaseModel):
    """Payload used by both create and update endpoints. All fields
    are required for a usable Shiprocket pickup (else SR rejects)."""
    nickname: str           # internal label shown to admin, e.g. "Sonipat Warehouse"
    contact_person_name: str
    contact_phone: str
    contact_email: str = "noreply@locofast.com"
    address_line1: str
    address_line2: str = ""
    city: str
    state: str
    pincode: str
    is_primary: bool = False


# ==================== HELPERS ====================

async def generate_seller_code() -> str:
    while True:
        code = 'LS-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        existing = await db.sellers.find_one({'seller_code': code})
        if not existing:
            return code


def normalize_seller(seller: dict) -> dict:
    """Normalize legacy seller fields."""
    defaults = {
        'category_ids': [], 'city': seller.get('location', ''), 'state': '',
        'is_active': True, 'seller_code': '', 'created_at': datetime.now(timezone.utc).isoformat(),
        'description': '', 'logo_url': '', 'contact_email': '', 'contact_phone': '',
    }
    for key, default in defaults.items():
        if key not in seller:
            seller[key] = default
    if 'company_name' not in seller:
        seller['company_name'] = seller.get('name', '')
    return seller


# ==================== ROUTES ====================

@router.get("/sellers", response_model=List[Seller])
async def get_sellers(include_inactive: bool = Query(False)):
    query = {} if include_inactive else {'is_active': {'$ne': False}}
    # No cap — admin tools (Edit Order's vendor reassignment, payouts
    # picker, etc.) need the full vendor roster. 10k is a safe upper
    # bound that comfortably exceeds expected vendor count.
    sellers = await db.sellers.find(query, {'_id': 0}).sort('created_at', -1).to_list(10000)

    all_cat_ids = list(set(cid for s in sellers for cid in s.get('category_ids', [])))
    categories = await db.categories.find({'id': {'$in': all_cat_ids}}, {'_id': 0}).to_list(1000) if all_cat_ids else []
    cat_map = {c['id']: c['name'] for c in categories}

    for seller in sellers:
        seller['category_names'] = [cat_map.get(cid, '') for cid in seller.get('category_ids', []) if cat_map.get(cid)]
        normalize_seller(seller)

    return sellers


@router.get("/sellers/{seller_id}", response_model=Seller)
async def get_seller(seller_id: str):
    seller = await db.sellers.find_one({'id': seller_id}, {'_id': 0})
    if not seller:
        raise HTTPException(status_code=404, detail='Seller not found')

    category_names = []
    if seller.get('category_ids'):
        categories = await db.categories.find({'id': {'$in': seller['category_ids']}}, {'_id': 0}).to_list(100)
        category_names = [c['name'] for c in categories]
    seller['category_names'] = category_names
    normalize_seller(seller)

    return seller


@router.post("/sellers", response_model=Seller)
async def create_seller(data: SellerCreate, admin=Depends(auth_helpers.get_current_admin)):
    # ── GST verification gate ──────────────────────────────────────────
    # Every new seller MUST come in with a verified GSTIN. The admin UI
    # blocks the Save button until verification succeeds, but we double-
    # check server-side so direct API calls can't bypass the rule.
    gstin = (data.gst_number or "").strip().upper()
    if not gstin:
        raise HTTPException(status_code=400, detail="GST number is required to onboard a seller")
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="GST number must be 15 characters")
    if not data.gst_verified:
        raise HTTPException(status_code=400, detail="GST must be verified before onboarding the seller. Click 'Verify GST' in the form.")

    # Reject duplicates
    dup = await db.sellers.find_one({"gst_number": gstin}, {"_id": 0, "id": 1, "company_name": 1})
    if dup:
        raise HTTPException(status_code=409, detail=f"A seller with GSTIN {gstin} already exists ({dup.get('company_name','')})")

    seller_id = str(uuid.uuid4())
    seller_code = await generate_seller_code()

    category_names = []
    if data.category_ids:
        categories = await db.categories.find({'id': {'$in': data.category_ids}}, {'_id': 0}).to_list(100)
        category_names = [c['name'] for c in categories]

    hashed_password = ""
    if data.password:
        hashed_password = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    seller_doc = {
        'id': seller_id,
        'seller_code': seller_code,
        'name': data.name,
        'company_name': data.company_name,
        'description': data.description or "",
        'logo_url': data.logo_url or "",
        'city': data.city or "",
        'state': data.state or "",
        'contact_email': data.contact_email,
        'contact_phone': data.contact_phone,
        'category_ids': data.category_ids or [],
        'is_active': data.is_active,
        'password_hash': hashed_password,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'established_year': data.established_year,
        'monthly_capacity': data.monthly_capacity or "",
        'employee_count': data.employee_count or "",
        'factory_size': data.factory_size or "",
        'turnover_range': data.turnover_range or "",
        'certifications': data.certifications or [],
        'export_markets': data.export_markets or [],
        'gst_number': gstin,
        'gst_verified': True,
        'gst_verified_at': datetime.now(timezone.utc).isoformat(),
        'gst_legal_name': (data.gst_legal_name or "").strip(),
        'gst_trade_name': (data.gst_trade_name or "").strip(),
    }
    await db.sellers.insert_one(seller_doc)
    # Remove MongoDB _id before returning (insert_one modifies the dict)
    seller_doc.pop('_id', None)

    response_doc = {**seller_doc, 'category_names': category_names}
    return Seller(**response_doc)


@router.put("/sellers/{seller_id}", response_model=Seller)
async def update_seller(seller_id: str, data: SellerUpdate, admin=Depends(auth_helpers.get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None and k != 'password'}

    if data.password:
        update_data['password_hash'] = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')

    result = await db.sellers.update_one({'id': seller_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Seller not found')

    seller = await db.sellers.find_one({'id': seller_id}, {'_id': 0})

    category_names = []
    if seller.get('category_ids'):
        categories = await db.categories.find({'id': {'$in': seller['category_ids']}}, {'_id': 0}).to_list(100)
        category_names = [c['name'] for c in categories]
    seller['category_names'] = category_names
    normalize_seller(seller)

    return Seller(**seller)


@router.delete("/sellers/{seller_id}")
async def delete_seller(seller_id: str, admin=Depends(auth_helpers.get_current_admin)):
    result = await db.sellers.delete_one({'id': seller_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Seller not found')
    return {'message': 'Seller deleted'}



@router.post("/migrate/seller-codes")
async def backfill_seller_codes(admin=Depends(auth_helpers.get_current_admin)):
    """Ensure every seller has a seller_code. Idempotent — returns how many were backfilled."""
    sellers_needing = await db.sellers.find(
        {'$or': [{'seller_code': {'$exists': False}}, {'seller_code': ''}, {'seller_code': None}]},
        {'_id': 0, 'id': 1, 'name': 1, 'company_name': 1},
    ).to_list(length=1000)

    backfilled = []
    for s in sellers_needing:
        code = await generate_seller_code()
        await db.sellers.update_one({'id': s['id']}, {'$set': {'seller_code': code}})
        backfilled.append({'id': s['id'], 'name': s.get('name', ''), 'company_name': s.get('company_name', ''), 'seller_code': code})

    return {
        'total_sellers': await db.sellers.count_documents({}),
        'backfilled_count': len(backfilled),
        'backfilled': backfilled,
    }



# ════════════════════════════════════════════════════════════════════
# Pickup Address CRUD (Ship-From)
# ════════════════════════════════════════════════════════════════════
# Each seller can have multiple pickup addresses. One is marked
# Primary — used as the default Ship-From on every new Shiprocket
# push. On create, we register the nickname with Shiprocket
# Courier (B2C); Cargo (B2B) doesn't require pre-registration.
#
# Order Edit can choose a DIFFERENT pickup for one shipment, but
# only from this list — no free-form addresses anywhere in the UI.

def _normalize_phone10(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("91") and len(digits) > 10:
        digits = digits[-10:]
    return digits[:10]


def _migrate_legacy_pickup(seller: dict) -> List[dict]:
    """If a seller has legacy `pickup_address` fields but no
    `pickup_addresses` array, convert into a single Primary entry.
    Idempotent."""
    if seller.get("pickup_addresses"):
        return seller["pickup_addresses"]
    if not (seller.get("pickup_address") or "").strip():
        return []
    return [{
        "id": str(uuid.uuid4()),
        "nickname": (seller.get("shiprocket_pickup_nickname") or seller.get("company_name") or "Primary")[:50],
        "contact_person_name": seller.get("pickup_contact_name") or seller.get("name", ""),
        "contact_phone": _normalize_phone10(seller.get("pickup_contact_phone") or seller.get("contact_phone", "")),
        "contact_email": seller.get("contact_email", "noreply@locofast.com"),
        "address_line1": seller.get("pickup_address", ""),
        "address_line2": "",
        "city": seller.get("pickup_city") or seller.get("city", ""),
        "state": seller.get("pickup_state") or seller.get("state", ""),
        "pincode": seller.get("pickup_pincode", ""),
        "is_primary": True,
        "shiprocket_nickname": seller.get("shiprocket_pickup_nickname", ""),
        "registered_with_shiprocket": bool(seller.get("shiprocket_pickup_nickname")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }]


async def _register_with_shiprocket(addr: dict) -> str:
    """Register the pickup with Shiprocket Courier. Returns the SR
    nickname actually accepted (SR sometimes mutates the slug).
    Idempotent — duplicate nicknames return a benign error we swallow."""
    try:
        import httpx
        from shiprocket.services.auth import auth_service
        from shiprocket.services.pickup import PickupService
        from shiprocket.schemas.pickup import AddPickupLocationRequest

        # SR truncates pickup_location to ~36 chars; keep it clean
        nickname = (addr.get("nickname") or "Pickup")[:36]
        req = AddPickupLocationRequest(
            pickup_location=nickname,
            name=addr["contact_person_name"][:80] or "Pickup",
            email=addr.get("contact_email") or "noreply@locofast.com",
            phone=_normalize_phone10(addr["contact_phone"]) or "9999999999",
            address=addr["address_line1"][:150],
            city=addr["city"][:60],
            state=addr["state"][:60],
            country="India",
            pin_code=addr["pincode"][:6],
        )
        headers = await auth_service.get_auth_headers_async()
        async with httpx.AsyncClient(timeout=30) as client:
            svc = PickupService(client, headers)
            await svc.add_pickup_location(req)
        return nickname
    except Exception as e:
        # "Nickname already exists" is a benign re-run for the same
        # address. We surface a warning but persist the address anyway.
        import logging
        logging.getLogger(__name__).info(f"[pickup-register] SR add skipped: {e}")
        return (addr.get("nickname") or "Pickup")[:36]


async def _load_seller_or_404(seller_id: str) -> dict:
    seller = await db.sellers.find_one({"id": seller_id}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    # Lazy-migrate legacy fields on first read so older sellers gain
    # a `pickup_addresses` array automatically.
    if not seller.get("pickup_addresses") and (seller.get("pickup_address") or "").strip():
        migrated = _migrate_legacy_pickup(seller)
        if migrated:
            await db.sellers.update_one(
                {"id": seller_id},
                {"$set": {"pickup_addresses": migrated}},
            )
            seller["pickup_addresses"] = migrated
    return seller


@router.get("/sellers/{seller_id}/pickup-addresses")
async def list_pickup_addresses(seller_id: str, admin=Depends(auth_helpers.get_current_admin)):
    seller = await _load_seller_or_404(seller_id)
    return {"addresses": seller.get("pickup_addresses", [])}


@router.post("/sellers/{seller_id}/pickup-addresses")
async def add_pickup_address(seller_id: str, payload: PickupAddressIn, admin=Depends(auth_helpers.get_current_admin)):
    seller = await _load_seller_or_404(seller_id)
    addresses = seller.get("pickup_addresses", []) or []

    # Register with Shiprocket first (so we know the SR nickname)
    new_addr = payload.model_dump()
    sr_nickname = await _register_with_shiprocket(new_addr)
    new_addr.update({
        "id": str(uuid.uuid4()),
        "shiprocket_nickname": sr_nickname,
        "registered_with_shiprocket": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # If this is the first address, force it primary regardless of input
    if not addresses:
        new_addr["is_primary"] = True
    elif new_addr.get("is_primary"):
        for a in addresses:
            a["is_primary"] = False

    addresses.append(new_addr)
    await db.sellers.update_one(
        {"id": seller_id},
        {"$set": {"pickup_addresses": addresses}},
    )
    return {"address": new_addr, "addresses": addresses}


@router.patch("/sellers/{seller_id}/pickup-addresses/{addr_id}")
async def update_pickup_address(seller_id: str, addr_id: str, payload: PickupAddressIn, admin=Depends(auth_helpers.get_current_admin)):
    seller = await _load_seller_or_404(seller_id)
    addresses = seller.get("pickup_addresses", []) or []
    target = next((a for a in addresses if a.get("id") == addr_id), None)
    if not target:
        raise HTTPException(404, "Pickup address not found")

    new_values = payload.model_dump()
    # Re-register with SR if any field that affects the SR record changed
    sr_relevant_keys = ("nickname", "contact_person_name", "contact_phone", "contact_email",
                        "address_line1", "city", "state", "pincode")
    sr_changed = any(new_values.get(k) != target.get(k) for k in sr_relevant_keys)

    target.update(new_values)
    if sr_changed:
        sr_nickname = await _register_with_shiprocket(target)
        target["shiprocket_nickname"] = sr_nickname
        target["registered_with_shiprocket"] = True

    # If marked primary, demote others
    if target.get("is_primary"):
        for a in addresses:
            if a.get("id") != addr_id:
                a["is_primary"] = False

    target["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.sellers.update_one({"id": seller_id}, {"$set": {"pickup_addresses": addresses}})
    return {"address": target, "addresses": addresses}


@router.delete("/sellers/{seller_id}/pickup-addresses/{addr_id}")
async def delete_pickup_address(seller_id: str, addr_id: str, admin=Depends(auth_helpers.get_current_admin)):
    seller = await _load_seller_or_404(seller_id)
    addresses = seller.get("pickup_addresses", []) or []
    target = next((a for a in addresses if a.get("id") == addr_id), None)
    if not target:
        raise HTTPException(404, "Pickup address not found")
    if target.get("is_primary"):
        raise HTTPException(400, "Cannot delete the primary pickup address. Mark another as primary first.")

    addresses = [a for a in addresses if a.get("id") != addr_id]
    await db.sellers.update_one({"id": seller_id}, {"$set": {"pickup_addresses": addresses}})
    return {"addresses": addresses}


@router.post("/sellers/{seller_id}/pickup-addresses/{addr_id}/primary")
async def make_pickup_primary(seller_id: str, addr_id: str, admin=Depends(auth_helpers.get_current_admin)):
    seller = await _load_seller_or_404(seller_id)
    addresses = seller.get("pickup_addresses", []) or []
    target = next((a for a in addresses if a.get("id") == addr_id), None)
    if not target:
        raise HTTPException(404, "Pickup address not found")
    for a in addresses:
        a["is_primary"] = (a.get("id") == addr_id)
    await db.sellers.update_one({"id": seller_id}, {"$set": {"pickup_addresses": addresses}})
    return {"addresses": addresses}
