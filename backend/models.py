"""
Shared Pydantic models used across all routers.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


# ==================== AUTH MODELS ====================

class AdminCreate(BaseModel):
    email: str
    password: str
    name: str

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminResponse(BaseModel):
    id: str
    email: str
    name: str

class TokenResponse(BaseModel):
    token: str
    admin: AdminResponse


# ==================== CATEGORY MODELS ====================

class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    image_url: str = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

class Category(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    slug: str
    description: str = ""
    image_url: str = ""
    fabric_count: int = 0


# ==================== COMPOSITION ====================

class CompositionItem(BaseModel):
    material: str = ""
    percentage: float = 0


# ==================== SELLER MODELS ====================

class SellerCreate(BaseModel):
    company_name: str
    contact_person: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    location: str = ""
    address: str = ""
    about: str = ""
    specialization: List[str] = []
    certifications: List[str] = []
    minimum_order_quantity: int = 0
    logo_url: str = ""
    banner_url: str = ""
    gst_number: str = ""
    website: str = ""
    established_year: str = ""
    employee_count: str = ""
    production_capacity: str = ""
    delivery_time: str = ""
    sample_available: bool = True

class SellerUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    about: Optional[str] = None
    specialization: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    minimum_order_quantity: Optional[int] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    gst_number: Optional[str] = None
    website: Optional[str] = None
    established_year: Optional[str] = None
    employee_count: Optional[str] = None
    production_capacity: Optional[str] = None
    delivery_time: Optional[str] = None
    sample_available: Optional[bool] = None
    is_active: Optional[bool] = None

class Seller(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    company_name: str
    contact_person: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    location: str = ""
    address: str = ""
    about: str = ""
    specialization: List[str] = []
    certifications: List[str] = []
    minimum_order_quantity: int = 0
    logo_url: str = ""
    banner_url: str = ""
    gst_number: str = ""
    website: str = ""
    established_year: str = ""
    employee_count: str = ""
    production_capacity: str = ""
    delivery_time: str = ""
    sample_available: bool = True
    fabric_count: int = 0
    is_active: bool = True
    created_at: str = ""


# ==================== FABRIC MODELS ====================

class FabricCreate(BaseModel):
    name: str
    category_id: str
    seller_id: str = ""
    article_id: str = ""
    composition: List[CompositionItem] = []
    gsm: int = 0
    width: str = ""
    construction: str = ""
    weave_type: str = ""
    finish: str = ""
    color: str = ""
    pattern: str = ""
    moq: str = ""
    rate_per_meter: float = 0
    sample_price: Optional[float] = None
    description: str = ""
    images: List[str] = []
    video_urls: List[str] = []
    is_bookable_sample: bool = False
    is_bookable_bulk: bool = False
    quantity_available: Optional[int] = None
    lead_time: str = ""
    weight_unit: str = "gsm"
    ounce: Optional[float] = None
    shrinkage: str = ""
    pricing_tiers: List[dict] = []
    fabric_type: str = ""
    seller_sku: str = ""
    hsn_code: Optional[str] = ""
    has_multiple_colors: bool = False
    color_variants: List[dict] = []

class FabricUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[str] = None
    seller_id: Optional[str] = None
    article_id: Optional[str] = None
    composition: Optional[List[CompositionItem]] = None
    gsm: Optional[int] = None
    width: Optional[str] = None
    construction: Optional[str] = None
    weave_type: Optional[str] = None
    finish: Optional[str] = None
    color: Optional[str] = None
    pattern: Optional[str] = None
    moq: Optional[str] = None
    rate_per_meter: Optional[float] = None
    sample_price: Optional[float] = None
    description: Optional[str] = None
    images: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None
    is_bookable_sample: Optional[bool] = None
    is_bookable_bulk: Optional[bool] = None
    quantity_available: Optional[int] = None
    lead_time: Optional[str] = None
    weight_unit: Optional[str] = None
    ounce: Optional[float] = None
    shrinkage: Optional[str] = None
    pricing_tiers: Optional[List[dict]] = None
    fabric_type: Optional[str] = None
    seller_sku: Optional[str] = None
    hsn_code: Optional[str] = None
    status: Optional[str] = None
    has_multiple_colors: Optional[bool] = None
    color_variants: Optional[List[dict]] = None

class Fabric(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    slug: str = ""
    fabric_code: str = ""
    category_id: str = ""
    category_name: str = ""
    seller_id: str = ""
    seller_company: str = ""
    seller_location: str = ""
    article_id: str = ""
    article_code: str = ""
    composition: object = None
    gsm: int = 0
    width: str = ""
    construction: str = ""
    weave_type: str = ""
    finish: str = ""
    color: str = ""
    pattern: str = ""
    moq: str = ""
    rate_per_meter: float = 0
    sample_price: Optional[float] = None
    description: str = ""
    images: List[str] = []
    video_urls: List[str] = []
    is_bookable_sample: bool = False
    is_bookable_bulk: bool = False
    quantity_available: Optional[int] = None
    lead_time: str = ""
    weight_unit: str = "gsm"
    ounce: Optional[float] = None
    shrinkage: str = ""
    pricing_tiers: List[dict] = []
    fabric_type: str = ""
    seller_sku: str = ""
    hsn_code: str = ""
    has_multiple_colors: bool = False
    color_variants: List[dict] = []
    status: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


# ==================== ENQUIRY MODELS ====================

class EnquiryCreate(BaseModel):
    name: str
    email: str
    phone: str = ""
    company: str = ""
    message: str
    fabric_id: str = ""
    fabric_name: str = ""
    enquiry_type: str = "general"

class Enquiry(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    email: str
    phone: str = ""
    company: str = ""
    message: str
    fabric_id: str = ""
    fabric_name: str = ""
    enquiry_type: str = "general"
    status: str = "new"
    created_at: str = ""


# ==================== COLLECTION MODELS ====================

class CollectionCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    image_url: str = ""
    fabric_ids: List[str] = []

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    fabric_ids: Optional[List[str]] = None
    is_featured: Optional[bool] = None

class Collection(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    slug: str
    description: str = ""
    image_url: str = ""
    fabric_ids: List[str] = []
    is_featured: bool = False
    created_at: str = ""


# ==================== ARTICLE MODELS ====================

class ArticleCreate(BaseModel):
    name: str
    description: str = ""
    category_id: str = ""
    fabric_type: str = ""
    base_composition: str = ""

class ArticleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    fabric_type: Optional[str] = None
    base_composition: Optional[str] = None

class Article(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    article_code: str = ""
    name: str
    description: str = ""
    category_id: str = ""
    category_name: str = ""
    fabric_type: str = ""
    base_composition: str = ""
    variant_count: int = 0
    created_at: str = ""
