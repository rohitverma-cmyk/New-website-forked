from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import shutil

# Load environment variables FIRST before importing modules that need them
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Now import modules that depend on environment variables
from tools_router import router as tools_router
from seo_router import router as seo_router
from blog_router import router as blog_router
from supplier_router import router as supplier_router
import orders_router
import email_router
import vendor_router
import coupon_router
import cloudinary_router
import rfq_router
import supplier_profile_router

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="Locofast API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class AdminCreate(BaseModel):
    email: str
    password: str
    name: str

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str = ""

class TokenResponse(BaseModel):
    token: str
    admin: AdminResponse

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str = ""
    image_url: str = ""
    created_at: str

# Seller Models
class SellerCreate(BaseModel):
    name: str
    company_name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    contact_email: str  # Required for notifications
    contact_phone: str  # Required
    category_ids: List[str] = []
    is_active: bool = True
    password: Optional[str] = ""  # For vendor portal login
    # Additional fields
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
    # Additional fields
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
    created_at: str
    # Additional fields
    established_year: Optional[int] = None
    monthly_capacity: str = ""
    employee_count: str = ""
    factory_size: str = ""
    turnover_range: str = ""
    certifications: List[str] = []
    export_markets: List[str] = []
    gst_number: str = ""

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(admin_id: str) -> str:
    payload = {
        'sub': admin_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        admin_id = payload.get('sub')
        admin = await db.admins.find_one({'id': admin_id}, {'_id': 0})
        if not admin:
            raise HTTPException(status_code=401, detail='Invalid token')
        return admin
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register_admin(data: AdminCreate):
    existing = await db.admins.find_one({'email': data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    admin_id = str(uuid.uuid4())
    admin_doc = {
        'id': admin_id,
        'email': data.email,
        'password': hash_password(data.password),
        'name': data.name,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin_doc)
    token = create_token(admin_id)
    return TokenResponse(
        token=token,
        admin=AdminResponse(id=admin_id, email=data.email, name=data.name)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login_admin(data: AdminLogin):
    admin = await db.admins.find_one({'email': data.email})
    if not admin or not verify_password(data.password, admin['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    token = create_token(admin['id'])
    return TokenResponse(
        token=token,
        admin=AdminResponse(id=admin['id'], email=admin['email'], name=admin['name'], role=admin.get('role', ''))
    )

@api_router.get("/auth/me", response_model=AdminResponse)
async def get_me(admin=Depends(get_current_admin)):
    return AdminResponse(id=admin['id'], email=admin['email'], name=admin['name'], role=admin.get('role', ''))

# ==================== CATEGORY ROUTES (extracted to category_router.py) ====================

# ==================== SELLER ROUTES (extracted to seller_router.py) ====================

# ==================== FABRIC ROUTES (extracted to fabric_router.py) ====================

# ==================== IMAGE UPLOAD (extracted to upload_router.py) ====================

# ==================== ARTICLE ROUTES (extracted to article_router.py) ====================

# Credit routes moved to credit_router.py


# ==================== REVIEW ROUTES (extracted to reviews_router.py) ====================

# ==================== GST VERIFICATION ====================

@api_router.post("/gst/verify")
async def verify_gst(data: dict):
    """Verify GST number using Sandbox.co.in API and return company details"""
    import httpx
    
    gstin = (data.get('gstin') or '').strip().upper()
    if not gstin or len(gstin) != 15:
        raise HTTPException(status_code=400, detail='Invalid GSTIN - must be 15 characters')
    
    sandbox_key = os.environ.get('SANDBOX_API_KEY')
    sandbox_secret = os.environ.get('SANDBOX_API_SECRET')
    
    if not sandbox_key or not sandbox_secret:
        raise HTTPException(status_code=503, detail='GST verification service not configured')
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Authenticate
            auth_resp = await client.post(
                'https://api.sandbox.co.in/authenticate',
                headers={
                    'x-api-key': sandbox_key,
                    'x-api-secret': sandbox_secret,
                }
            )
            auth_data = auth_resp.json()
            token = auth_data.get('access_token', '')
            
            if not token:
                raise HTTPException(status_code=502, detail='Failed to authenticate with GST service')
            
            # Step 2: Search GSTIN
            gst_resp = await client.post(
                'https://api.sandbox.co.in/gst/compliance/public/gstin/search',
                headers={
                    'Authorization': token,
                    'x-api-key': sandbox_key,
                    'Content-Type': 'application/json'
                },
                json={'gstin': gstin}
            )
            gst_data = gst_resp.json()
            
            if gst_data.get('code') != 200:
                return {
                    'valid': False,
                    'message': gst_data.get('message', 'GST verification failed'),
                    'gstin': gstin
                }
            
            info = gst_data.get('data', {}).get('data', {})
            addr = info.get('pradr', {}).get('addr', {})
            
            return {
                'valid': True,
                'gstin': gstin,
                'legal_name': info.get('lgnm', ''),
                'trade_name': info.get('tradeNam', ''),
                'business_type': info.get('ctb', ''),
                'gst_status': info.get('sts', ''),
                'registration_date': info.get('rgdt', ''),
                'city': addr.get('dst', ''),
                'state': addr.get('stcd', ''),
                'pincode': addr.get('pncd', ''),
                'address': f"{addr.get('bno', '')} {addr.get('flno', '')} {addr.get('st', '')} {addr.get('loc', '')}".strip(),
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail='GST verification timed out')
    except Exception as e:
        logging.error(f"GST verification error: {str(e)}")
        raise HTTPException(status_code=500, detail='GST verification failed')

@api_router.post("/enquiries/rfq-lead")
async def create_rfq_lead(data: dict):
    """Handle RFQ form submission from homepage - sends email to marketing@locofast.com"""
    import httpx
    
    name = data.get('name', '')
    phone = data.get('phone', '')
    gst_number = data.get('gst_number', '')
    bin_number = data.get('bin_number', '')
    company_name = data.get('company_name', '')
    email = data.get('email', '')
    fabric_type = data.get('fabric_type', '')
    fabric_url = data.get('fabric_url', '')
    fabric_name = data.get('fabric_name', '')
    location = data.get('location', '')
    # New fields from PDP modal (fabric-aware)
    quantity_value = data.get('quantity_value', 0) or 0
    quantity_unit = (data.get('quantity_unit', '') or '').lower()
    notes_message = data.get('message', '') or ''
    # GST-verified fields (auto-populated from frontend)
    gst_legal_name = data.get('gst_legal_name', '')
    gst_trade_name = data.get('gst_trade_name', '')
    gst_status = data.get('gst_status', '')
    gst_city = data.get('gst_city', '')
    gst_state = data.get('gst_state', '')
    gst_address = data.get('gst_address', '')
    
    if not name or not email or not phone:
        raise HTTPException(status_code=400, detail='Name, email, and phone are required')
    
    # Save as enquiry in DB
    enquiry_id = str(uuid.uuid4())
    enquiry_doc = {
        'id': enquiry_id,
        'name': name,
        'email': email,
        'phone': phone,
        'company': company_name,
        'gst_number': gst_number,
        'bin_number': bin_number,
        'gst_legal_name': gst_legal_name,
        'gst_trade_name': gst_trade_name,
        'gst_status': gst_status,
        'gst_city': gst_city,
        'gst_state': gst_state,
        'gst_address': gst_address,
        'fabric_type': fabric_type,
        'fabric_url': fabric_url,
        'fabric_name': fabric_name,
        'message': f"{'Fabric URL: ' + fabric_url if fabric_url else 'Fabric Type: ' + fabric_type}\nCompany: {company_name}\nLocation: {location}\nGST: {gst_number}\nGST Legal Name: {gst_legal_name}\nGST Status: {gst_status}",
        'type': 'rfq_lead',
        'source': 'SKU Page RFQ' if fabric_url else 'Homepage RFQ Form',
        'location': location,
        'status': 'new',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.enquiries.insert_one(enquiry_doc)

    # ALSO write a parallel rfq_submissions doc so the lead shows up in
    # /admin/rfqs (the dedicated RFQ workspace), not just /admin/enquiries.
    # This unifies the two entry points (PDP modal + /rfq form) into one
    # place admins triage from.
    rfq_id = str(uuid.uuid4())
    rfq_number_simple = f"RFQ-{enquiry_id[:6].upper()}"
    try:
        # Resolve customer if logged in (so the lead links back to their profile)
        customer_id = ""
        # request not available here without changes; we use header-less anonymous id resolution
        # Best-effort: match by email/phone in customers
        match_or = []
        if email:
            match_or.append({"email": email.lower().strip()})
        if phone:
            cleaned = phone.replace(" ", "").lstrip("+")
            for variant in {phone, cleaned, cleaned.lstrip("91")}:
                if variant:
                    match_or.append({"phone": variant})
        if match_or:
            existing = await db.customers.find_one({"$or": match_or}, {"_id": 0, "id": 1})
            if existing:
                customer_id = existing.get("id", "")

        # Best-effort category guess from the fabric_type free-text
        guessed_category = "cotton"
        if fabric_type:
            t = fabric_type.lower()
            if "denim" in t:
                guessed_category = "denim"
            elif "knit" in t:
                guessed_category = "knits"
            elif "viscose" in t:
                guessed_category = "viscose"

        await db.rfq_submissions.insert_one({
            "id": rfq_id,
            "rfq_number": rfq_number_simple,
            "customer_id": customer_id,
            "category": guessed_category,
            "fabric_requirement_type": fabric_type or "",
            "quantity_value": float(quantity_value) if quantity_value else 0,
            "quantity_unit": quantity_unit,
            "full_name": name,
            "email": email,
            "phone": phone,
            "company": company_name,
            "gst_number": gst_number,
            "delivery_city": gst_city,
            "delivery_state": gst_state,
            "fabric_url": fabric_url,
            "fabric_name": fabric_name,
            "lead_source": "SKU Page RFQ" if fabric_url else "Homepage RFQ",
            "ingested_via": "rfq_lead_modal",
            "message": notes_message,
            "status": "new",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logging.warning(f"Failed to mirror rfq_lead to rfq_submissions: {str(e)}")
    
    # Send email to marketing@locofast.com
    try:
        from email_router import send_rfq_lead_email
        asyncio.create_task(send_rfq_lead_email(enquiry_doc))
    except Exception as e:
        logging.warning(f"Failed to send RFQ lead email: {str(e)}")
    
    # Send to Zapier webhook
    try:
        from zapier_webhook import send_enquiry_to_zapier
        asyncio.create_task(send_enquiry_to_zapier(enquiry_doc))
    except Exception as e:
        logging.warning(f"Failed to send to Zapier: {str(e)}")
    
    # Push to campaigns.locofast.com admin
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            campaign_payload = {
                'name': name,
                'company': company_name,
                'email': email,
                'phone': phone,
                'company_type': fabric_type if fabric_type else 'Buyer',
                'gst_info': {
                    'legal_name': gst_legal_name,
                    'trade_name': gst_trade_name,
                    'status': gst_status,
                    'city': gst_city,
                    'state': gst_state,
                    'address': gst_address,
                    'fabric_type': fabric_type,
                } if gst_legal_name else None,
                'campaign': 'Website RFQ',
            }
            # Include BIN for Bangladesh leads
            if bin_number:
                campaign_payload['bin'] = bin_number
            await client.post('https://campaigns.locofast.com/api/leads', json=campaign_payload)
            logging.info(f"RFQ lead pushed to campaigns admin: {name}")
    except Exception as e:
        logging.warning(f"Failed to push to campaigns: {str(e)}")
    
    return {'message': 'Quote request submitted successfully', 'id': enquiry_id}

# ==================== COLLECTION ROUTES (extracted to collection_router.py) ====================

# ==================== STATS ====================

@api_router.get("/stats")
async def get_stats(admin=Depends(get_current_admin)):
    fabrics_count = await db.fabrics.count_documents({})
    categories_count = await db.categories.count_documents({})
    sellers_count = await db.sellers.count_documents({})
    active_sellers_count = await db.sellers.count_documents({'is_active': {'$ne': False}})
    collections_count = await db.collections.count_documents({})
    articles_count = await db.articles.count_documents({})
    enquiries_count = await db.enquiries.count_documents({})
    new_enquiries = await db.enquiries.count_documents({'status': 'new'})
    bookable_fabrics = await db.fabrics.count_documents({'is_bookable': True})
    
    return {
        'fabrics': fabrics_count,
        'categories': categories_count,
        'sellers': sellers_count,
        'active_sellers': active_sellers_count,
        'collections': collections_count,
        'articles': articles_count,
        'enquiries': enquiries_count,
        'new_enquiries': new_enquiries,
        'bookable_fabrics': bookable_fabrics
    }

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    # Check if data exists
    existing = await db.categories.count_documents({})
    if existing > 0:
        return {'message': 'Data already seeded'}
    
    # Seed categories
    categories = [
        {'id': 'cat-cotton', 'name': 'Cotton Fabrics', 'description': 'Woven and knitted cotton fabrics', 'image_url': 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400', 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': 'cat-polyester', 'name': 'Polyester Fabrics', 'description': 'Polyester wovens and knits', 'image_url': 'https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400', 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': 'cat-blended', 'name': 'Blended Fabrics', 'description': 'Poly-cotton and other blends', 'image_url': 'https://images.unsplash.com/photo-1558171814-05506ed68369?w=400', 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': 'cat-denim', 'name': 'Denim', 'description': 'Denim fabrics in various weights', 'image_url': 'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=400', 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': 'cat-sustainable', 'name': 'Sustainable Fabrics', 'description': 'Organic, recycled, and eco-certified fabrics', 'image_url': 'https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=400', 'created_at': datetime.now(timezone.utc).isoformat()},
    ]
    await db.categories.insert_many(categories)
    
    # Seed fabrics
    fabrics = [
        {'id': str(uuid.uuid4()), 'name': 'Cotton Poplin 40x60', 'category_id': 'cat-cotton', 'fabric_type': 'woven', 'composition': '100% Cotton', 'gsm': 120, 'width': '58 inches', 'color': 'White', 'finish': 'Mercerized', 'moq': '500 meters', 'price_range': 'On enquiry', 'availability': ['Sample', 'Bulk'], 'description': 'Plain weave cotton poplin. Count: 40x60. Construction: 76x68. Suitable for shirts, blouses, and lining applications.', 'tags': ['cotton', 'poplin', 'shirting', 'plain weave'], 'images': ['https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800', 'https://images.unsplash.com/photo-1620799139834-6b8f844fbe61?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Organic Cotton Canvas', 'category_id': 'cat-cotton', 'fabric_type': 'woven', 'composition': '100% Organic Cotton', 'gsm': 280, 'width': '60 inches', 'color': 'Natural', 'finish': 'Enzyme Washed', 'moq': '300 meters', 'price_range': 'On enquiry', 'availability': ['Sample', 'Bulk'], 'description': 'Heavy canvas weave. GOTS certified organic cotton. Applications: bags, workwear, upholstery.', 'tags': ['organic', 'canvas', 'gots', 'heavy'], 'images': ['https://images.unsplash.com/photo-1594761051656-153e3be6a9a3?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Cotton Single Jersey', 'category_id': 'cat-polyester', 'fabric_type': 'knitted', 'composition': '95% Cotton, 5% Elastane', 'gsm': 180, 'width': 'Circular', 'color': 'Multiple colors available', 'finish': 'Bio-polished', 'moq': '400 meters', 'price_range': 'On enquiry', 'availability': ['Sample', 'Bulk'], 'description': 'Single jersey knit with elastane. Bio-polish finish reduces pilling. Suitable for t-shirts and casual wear.', 'tags': ['jersey', 'stretch', 'tshirt', 'knit'], 'images': ['https://images.unsplash.com/photo-1647699926980-b7d360761521?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'PC Blend Twill 65/35', 'category_id': 'cat-blended', 'fabric_type': 'woven', 'composition': '65% Polyester, 35% Cotton', 'gsm': 220, 'width': '58 inches', 'color': 'Khaki', 'finish': 'Wrinkle-resistant', 'moq': '600 meters', 'price_range': 'On enquiry', 'availability': ['Bulk'], 'description': '2/1 twill weave. Poly-cotton blend. Wrinkle-resistant finish. Applications: uniforms, workwear, institutional fabrics.', 'tags': ['twill', 'uniform', 'workwear', 'blend'], 'images': ['https://images.unsplash.com/photo-1558171814-05506ed68369?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Stretch Denim 10oz', 'category_id': 'cat-denim', 'fabric_type': 'woven', 'composition': '98% Cotton, 2% Spandex', 'gsm': 340, 'width': '56 inches', 'color': 'Indigo', 'finish': 'Stone Washed', 'moq': '500 meters', 'price_range': 'On enquiry', 'availability': ['On Request'], 'description': '3/1 right hand twill denim. Weight: 10oz. Stone wash finish available. Stretch for comfort fit.', 'tags': ['denim', 'stretch', 'jeans', 'indigo'], 'images': ['https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=800', 'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Recycled Polyester Taffeta', 'category_id': 'cat-sustainable', 'fabric_type': 'woven', 'composition': '100% Recycled Polyester', 'gsm': 150, 'width': '60 inches', 'color': 'Black', 'finish': 'Water-repellent', 'moq': '400 meters', 'price_range': 'On enquiry', 'availability': ['Sample', 'Bulk'], 'description': 'Taffeta weave from recycled PET. GRS certified. Water-repellent finish available. Applications: outerwear, bags.', 'tags': ['recycled', 'grs', 'outerwear', 'taffeta'], 'images': ['https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Polyester Interlock', 'category_id': 'cat-polyester', 'fabric_type': 'knitted', 'composition': '100% Polyester', 'gsm': 200, 'width': '70 inches', 'color': 'Navy', 'finish': 'Moisture-wicking', 'moq': '350 meters', 'price_range': 'On enquiry', 'availability': ['Sample', 'Bulk'], 'description': 'Double knit interlock construction. Moisture-wicking treatment. Applications: sportswear, activewear, athleisure.', 'tags': ['sports', 'activewear', 'interlock', 'performance'], 'images': ['https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
        {'id': str(uuid.uuid4()), 'name': 'Tencel Lyocell Sateen', 'category_id': 'cat-sustainable', 'fabric_type': 'woven', 'composition': '100% Tencel Lyocell', 'gsm': 160, 'width': '58 inches', 'color': 'Sage Green', 'finish': 'Sateen', 'moq': '250 meters', 'price_range': 'On enquiry', 'availability': ['Sample'], 'description': 'Sateen weave Tencel Lyocell. FSC certified. Applications: dresses, blouses, bedding.', 'tags': ['tencel', 'lyocell', 'sateen', 'fsc'], 'images': ['https://images.unsplash.com/photo-1560258632-fb994fd2bd44?w=800'], 'created_at': datetime.now(timezone.utc).isoformat()},
    ]
    await db.fabrics.insert_many(fabrics)
    
    # Create default admin
    admin_doc = {
        'id': str(uuid.uuid4()),
        'email': 'admin@locofast.com',
        'password': hash_password('admin123'),
        'name': 'Locofast Admin',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin_doc)
    
    return {'message': 'Data seeded successfully', 'admin_email': 'admin@locofast.com', 'admin_password': 'admin123'}


# ==================== MIGRATIONS (extracted to migrations_router.py) ====================


# ==================== SITEMAP (extracted to sitemap_router.py) ====================

# ==================== SETUP ====================

# Initialize orders and email routers with database
orders_router.set_db(db)
orders_router.init_razorpay()
email_router.set_db(db)
cloudinary_router.set_db(db)
cloudinary_router.init_cloudinary()
rfq_router.set_db(db)

app.include_router(api_router)
app.include_router(tools_router)
app.include_router(seo_router)
app.include_router(blog_router)
app.include_router(supplier_router)
app.include_router(orders_router.router)
app.include_router(email_router.router)
app.include_router(vendor_router.router)
app.include_router(coupon_router.router, prefix="/api")
app.include_router(cloudinary_router.router)
app.include_router(rfq_router.router)
app.include_router(supplier_profile_router.router)

import prerender_router
app.include_router(prerender_router.router)

import customer_router
customer_router.set_db(db)
app.include_router(customer_router.router)

import agent_router
agent_router.set_db(db)
app.include_router(agent_router.router)

import brand_router
brand_router.set_db(db)
app.include_router(brand_router.router, prefix="/api")

import account_manager_router
account_manager_router.set_db(db)
app.include_router(account_manager_router.router, prefix="/api")

import commission_router
commission_router.set_db(db)
app.include_router(commission_router.router)

import payouts_router  # noqa: E402
app.include_router(payouts_router.router, prefix="/api")

import category_router
category_router.set_db(db)
app.include_router(category_router.router)

import seller_router
seller_router.set_db(db)
app.include_router(seller_router.router)

import fabric_utils
fabric_utils.set_db(db)

import fabric_router
fabric_router.set_db(db)
app.include_router(fabric_router.router)

import article_router
article_router.set_db(db)
app.include_router(article_router.router)

import collection_router
collection_router.set_db(db, normalize_fn=fabric_utils.normalize_fabric)
app.include_router(collection_router.router)

import enquiry_router
enquiry_router.set_db(db)
app.include_router(enquiry_router.router)

import vendor_rfq_router
vendor_rfq_router.set_db(db)
app.include_router(vendor_rfq_router.router)

import customer_queries_router
customer_queries_router.set_db(db)
app.include_router(customer_queries_router.router)

# External lead-ingest API (CRM, partner integrations) — protected by X-API-Key
import external_rfq_router
external_rfq_router.set_db(db)
app.include_router(external_rfq_router.router)

# ── Shiprocket integration (full module port) ──
# Mounts orders/courier/tracking/pickup/returns/webhooks under /api/shiprocket.
# Webhooks fan out into orders.status so the customer order-detail timeline
# (Payment → Paid → Processing → Shipped → Delivered) auto-advances.
from shiprocket.api import (
    orders_router as sr_orders_router,
    courier_router as sr_courier_router,
    tracking_router as sr_tracking_router,
    pickup_router as sr_pickup_router,
    returns_router as sr_returns_router,
    webhooks_router as sr_webhooks_router,
)
from shiprocket.api import webhooks as _sr_webhooks_module

_sr_webhooks_module.set_db(db)
for _r in (sr_orders_router, sr_courier_router, sr_tracking_router,
           sr_pickup_router, sr_returns_router, sr_webhooks_router):
    app.include_router(_r, prefix="/api/shiprocket")

import credit_router
credit_router.set_db(db)
app.include_router(credit_router.router, prefix="/api")

import auth_helpers
auth_helpers.set_db(db)

# Extracted routers (must come after auth_helpers.set_db)
import migrations_router
import sitemap_router
import reviews_router
import upload_router
migrations_router.set_db(db)
sitemap_router.set_db(db)
reviews_router.set_db(db)
app.include_router(migrations_router.router)
app.include_router(sitemap_router.router)
app.include_router(reviews_router.router)
app.include_router(upload_router.router)

import admin_customers_router
admin_customers_router.set_db(db)
app.include_router(admin_customers_router.router)

# Serve uploaded files
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bot prerender middleware: serves pre-rendered HTML to search engine bots
from bot_prerender_middleware import BotPrerenderMiddleware
app.add_middleware(BotPrerenderMiddleware)

@app.on_event("startup")
async def startup_create_default_admin():
    """Create or reset default admin on startup"""
    try:
        # Always ensure admin@locofast.com exists with password admin123
        existing = await db.admins.find_one({'email': 'admin@locofast.com'})
        
        if existing:
            # Reset password to admin123
            await db.admins.update_one(
                {'email': 'admin@locofast.com'},
                {'$set': {'password': hash_password('admin123')}}
            )
            logger.info("Admin password reset to: admin123")
        else:
            # Create new admin
            admin_doc = {
                'id': str(uuid.uuid4()),
                'email': 'admin@locofast.com',
                'password': hash_password('admin123'),
                'name': 'Locofast Admin',
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.admins.insert_one(admin_doc)
            logger.info("Default admin created: admin@locofast.com / admin123")
    except Exception as e:
        logger.error(f"Error with admin setup: {str(e)}")

    # Ensure MongoDB indexes exist for hot query paths. Idempotent —
    # create_index is a no-op if an index with the same keys already exists.
    try:
        from db_indexes import ensure_indexes
        await ensure_indexes(db)
    except Exception as e:
        logger.error(f"Index bootstrap failed: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
