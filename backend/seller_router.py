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
    sellers = await db.sellers.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)

    all_cat_ids = list(set(cid for s in sellers for cid in s.get('category_ids', [])))
    categories = await db.categories.find({'id': {'$in': all_cat_ids}}, {'_id': 0}).to_list(100) if all_cat_ids else []
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
        'gst_number': data.gst_number or "",
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
