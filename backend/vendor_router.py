"""
Vendor Router - Handles vendor/seller portal authentication and inventory management
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import os
import uuid
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/vendor", tags=["vendor"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'test_database')
if db_name and db_name.startswith('"') and db_name.endswith('"'):
    db_name = db_name[1:-1]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'vendor-secret-key')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# ==================== MODELS ====================

class VendorLogin(BaseModel):
    email: str
    password: str

class VendorResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    seller_code: str = ""
    name: str
    company_name: str
    contact_email: str
    contact_phone: str
    city: str = ""
    state: str = ""

class FabricCreate(BaseModel):
    name: str
    fabric_code: str = ""
    category_id: str = ""
    description: str = ""
    composition: object = ""  # Can be string (legacy) or list of {material, percentage}
    gsm: Optional[int] = None
    ounce: str = ""
    width: Optional[str] = ""
    finish: str = ""
    tags: object = ""  # Can be string or list
    images: List[str] = []
    videos: List[str] = []
    is_bookable: bool = False
    quantity_available: int = 0
    rate_per_meter: float = 0
    sample_price: Optional[float] = None
    moq: str = ""
    dispatch_timeline: str = ""
    # Comprehensive fields
    fabric_type: str = "woven"
    pattern: str = "Solid"
    color: str = ""
    warp_count: str = ""
    weft_count: str = ""
    yarn_count: str = ""
    denier: Optional[int] = None
    weft_shrinkage: Optional[float] = None
    stretch_percentage: Optional[float] = None
    weight_unit: str = "gsm"
    stock_type: str = "ready_stock"
    starting_price: str = ""
    availability: List[str] = []
    seller_sku: str = ""
    article_id: str = ""
    sample_delivery_days: str = ""
    bulk_delivery_days: str = ""
    pricing_tiers: List[dict] = []

class FabricUpdate(BaseModel):
    name: Optional[str] = None
    fabric_code: Optional[str] = None
    description: Optional[str] = None
    composition: Optional[object] = None
    gsm: Optional[int] = None
    ounce: Optional[str] = None
    width: Optional[str] = None
    finish: Optional[str] = None
    tags: Optional[object] = None
    images: Optional[List[str]] = None
    videos: Optional[List[str]] = None
    is_bookable: Optional[bool] = None
    quantity_available: Optional[int] = None
    rate_per_meter: Optional[float] = None
    sample_price: Optional[float] = None
    moq: Optional[str] = None
    dispatch_timeline: Optional[str] = None
    # Comprehensive fields
    fabric_type: Optional[str] = None
    pattern: Optional[str] = None
    color: Optional[str] = None
    warp_count: Optional[str] = None
    weft_count: Optional[str] = None
    yarn_count: Optional[str] = None
    denier: Optional[int] = None
    weft_shrinkage: Optional[float] = None
    stretch_percentage: Optional[float] = None
    weight_unit: Optional[str] = None
    stock_type: Optional[str] = None
    starting_price: Optional[str] = None
    availability: Optional[List[str]] = None
    seller_sku: Optional[str] = None
    article_id: Optional[str] = None
    sample_delivery_days: Optional[str] = None
    bulk_delivery_days: Optional[str] = None
    pricing_tiers: Optional[List[dict]] = None

# ==================== AUTH HELPERS ====================

def create_vendor_token(seller_id: str, email: str) -> str:
    """Create JWT token for vendor"""
    payload = {
        'seller_id': seller_id,
        'email': email,
        'type': 'vendor',
        'exp': datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_vendor(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify vendor JWT token and return seller info"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        if payload.get('type') != 'vendor':
            raise HTTPException(status_code=401, detail='Invalid token type')
        
        seller_id = payload.get('seller_id')
        seller = await db.sellers.find_one({'id': seller_id, 'is_active': True}, {'_id': 0, 'password_hash': 0})
        
        if not seller:
            raise HTTPException(status_code=401, detail='Vendor not found or inactive')
        
        return seller
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ==================== AUTH ENDPOINTS ====================

@router.post("/login")
async def vendor_login(data: VendorLogin):
    """Vendor login with email and password"""
    seller = await db.sellers.find_one({'contact_email': data.email, 'is_active': True})
    
    if not seller:
        raise HTTPException(status_code=401, detail='Invalid email or password')
    
    # Check for password (can be stored as 'password_hash' or 'password')
    password_hash = seller.get('password_hash') or seller.get('password', '')
    if not password_hash:
        raise HTTPException(status_code=401, detail='Vendor account not set up. Please contact admin.')
    
    if not bcrypt.checkpw(data.password.encode('utf-8'), password_hash.encode('utf-8')):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    
    token = create_vendor_token(seller['id'], data.email)
    
    return {
        'token': token,
        'vendor': VendorResponse(
            id=seller['id'],
            seller_code=seller.get('seller_code', ''),
            name=seller.get('name', ''),
            company_name=seller.get('company_name', ''),
            contact_email=seller.get('contact_email', ''),
            contact_phone=seller.get('contact_phone', ''),
            city=seller.get('city', ''),
            state=seller.get('state', '')
        )
    }

@router.get("/me")
async def get_vendor_profile(vendor=Depends(get_current_vendor)):
    """Get current vendor profile"""
    return VendorResponse(**vendor)

# ==================== INVENTORY ENDPOINTS ====================

@router.get("/fabrics")
async def get_vendor_fabrics(vendor=Depends(get_current_vendor)):
    """Get all fabrics belonging to this vendor"""
    fabrics = await db.fabrics.find(
        {'seller_id': vendor['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    # Resolve category names for fabrics missing category_name
    categories_cache = {}
    for f in fabrics:
        if not f.get('category_name') and f.get('category_id'):
            cid = f['category_id']
            if cid not in categories_cache:
                cat = await db.categories.find_one({'id': cid}, {'_id': 0})
                categories_cache[cid] = cat.get('name', '') if cat else ''
            f['category_name'] = categories_cache[cid]
    
    return fabrics

@router.get("/fabrics/{fabric_id}")
async def get_vendor_fabric(fabric_id: str, vendor=Depends(get_current_vendor)):
    """Get a specific fabric belonging to this vendor"""
    fabric = await db.fabrics.find_one(
        {'id': fabric_id, 'seller_id': vendor['id']},
        {'_id': 0}
    )
    
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    return fabric

@router.post("/fabrics")
async def create_vendor_fabric(data: FabricCreate, vendor=Depends(get_current_vendor)):
    """Create a new fabric for this vendor"""
    fabric_id = str(uuid.uuid4())
    
    # Get category name
    category_name = ""
    if data.category_id:
        category = await db.categories.find_one({'id': data.category_id}, {'_id': 0})
        category_name = category.get('name', '') if category else ""
    
    fabric_doc = {
        'id': fabric_id,
        'name': data.name,
        'fabric_code': data.fabric_code,
        'seller_id': vendor['id'],
        'seller_company': vendor.get('company_name', ''),
        'seller_name': vendor.get('name', ''),
        'category_id': data.category_id,
        'category_name': category_name,
        'description': data.description,
        'composition': data.composition,
        'gsm': data.gsm,
        'ounce': data.ounce,
        'width': data.width,
        'finish': data.finish,
        'tags': data.tags,
        'images': data.images,
        'videos': data.videos,
        'is_bookable': data.is_bookable,
        'quantity_available': data.quantity_available,
        'rate_per_meter': data.rate_per_meter,
        'sample_price': data.sample_price,
        'moq': data.moq,
        'dispatch_timeline': data.dispatch_timeline,
        'status': 'pending',
        'fabric_type': data.fabric_type,
        'pattern': data.pattern,
        'color': data.color,
        'warp_count': data.warp_count,
        'weft_count': data.weft_count,
        'yarn_count': data.yarn_count,
        'denier': data.denier,
        'weft_shrinkage': data.weft_shrinkage,
        'stretch_percentage': data.stretch_percentage,
        'weight_unit': data.weight_unit,
        'stock_type': data.stock_type,
        'starting_price': data.starting_price,
        'availability': data.availability,
        'seller_sku': data.seller_sku,
        'article_id': data.article_id,
        'sample_delivery_days': data.sample_delivery_days,
        'bulk_delivery_days': data.bulk_delivery_days,
        'pricing_tiers': data.pricing_tiers,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.fabrics.insert_one(fabric_doc)
    
    # Remove _id before returning
    fabric_doc.pop('_id', None)
    return fabric_doc

@router.put("/fabrics/{fabric_id}")
async def update_vendor_fabric(fabric_id: str, data: FabricUpdate, vendor=Depends(get_current_vendor)):
    """Update a fabric belonging to this vendor"""
    # Verify ownership
    fabric = await db.fabrics.find_one({'id': fabric_id, 'seller_id': vendor['id']})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found or not owned by you')
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    await db.fabrics.update_one({'id': fabric_id}, {'$set': update_data})
    
    updated = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    return updated

@router.delete("/fabrics/{fabric_id}")
async def delete_vendor_fabric(fabric_id: str, vendor=Depends(get_current_vendor)):
    """Delete a fabric belonging to this vendor"""
    # Verify ownership
    fabric = await db.fabrics.find_one({'id': fabric_id, 'seller_id': vendor['id']})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found or not owned by you')
    
    await db.fabrics.delete_one({'id': fabric_id})
    return {'success': True, 'message': 'Fabric deleted'}

@router.get("/orders")
async def get_vendor_orders(vendor=Depends(get_current_vendor)):
    """Get orders containing this vendor's fabrics"""
    # Find orders that have items from this vendor's fabrics
    vendor_fabric_ids = await db.fabrics.distinct('id', {'seller_id': vendor['id']})
    
    orders = await db.orders.find(
        {'items.fabric_id': {'$in': vendor_fabric_ids}},
        {'_id': 0}
    ).sort('created_at', -1).to_list(500)
    
    # Filter items to only show vendor's fabrics
    for order in orders:
        order['items'] = [item for item in order.get('items', []) if item.get('fabric_id') in vendor_fabric_ids]
    
    return orders

@router.get("/stats")
async def get_vendor_stats(vendor=Depends(get_current_vendor)):
    """Get vendor statistics"""
    total_fabrics = await db.fabrics.count_documents({'seller_id': vendor['id']})
    approved_fabrics = await db.fabrics.count_documents({'seller_id': vendor['id'], 'status': 'approved'})
    pending_fabrics = await db.fabrics.count_documents({'seller_id': vendor['id'], 'status': 'pending'})
    rejected_fabrics = await db.fabrics.count_documents({'seller_id': vendor['id'], 'status': 'rejected'})
    
    # Get vendor's fabric IDs
    vendor_fabric_ids = await db.fabrics.distinct('id', {'seller_id': vendor['id']})
    
    # Count orders with vendor's fabrics
    total_orders = await db.orders.count_documents({'items.fabric_id': {'$in': vendor_fabric_ids}})
    
    # Count enquiries
    total_enquiries = await db.enquiries.count_documents({'fabric_id': {'$in': vendor_fabric_ids}})
    
    return {
        'total_fabrics': total_fabrics,
        'approved_fabrics': approved_fabrics,
        'pending_fabrics': pending_fabrics,
        'rejected_fabrics': rejected_fabrics,
        'total_orders': total_orders,
        'total_enquiries': total_enquiries,
        'vendor_code': vendor.get('seller_code', '')
    }

@router.get("/categories")
async def get_categories_for_vendor():
    """Get all categories (for fabric creation dropdown)"""
    categories = await db.categories.find({}, {'_id': 0}).to_list(100)
    return categories

@router.get("/enquiries")
async def get_vendor_enquiries(vendor=Depends(get_current_vendor)):
    """Get all enquiries for this vendor's fabrics"""
    # Get vendor's fabric IDs
    vendor_fabric_ids = await db.fabrics.distinct('id', {'seller_id': vendor['id']})
    
    # Get enquiries for these fabrics
    enquiries = await db.enquiries.find(
        {'fabric_id': {'$in': vendor_fabric_ids}},
        {'_id': 0}
    ).sort('created_at', -1).to_list(500)
    
    return enquiries
