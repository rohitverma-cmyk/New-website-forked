"""
Coupon Router - Basic coupon/discount code engine for Locofast v1.0
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import os

router = APIRouter(prefix="/coupons", tags=["coupons"])

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "locofast")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Models
class CouponCreate(BaseModel):
    code: str = Field(..., min_length=3, max_length=20, description="Unique coupon code")
    description: str = Field(default="", description="Coupon description")
    discount_type: str = Field(..., pattern="^(percentage|fixed)$", description="Type of discount")
    discount_value: float = Field(..., gt=0, description="Discount value (percentage or fixed amount)")
    min_order_value: float = Field(default=0, ge=0, description="Minimum order value to apply coupon")
    max_discount: Optional[float] = Field(default=None, description="Maximum discount cap for percentage coupons")
    usage_limit: Optional[int] = Field(default=None, description="Maximum number of times coupon can be used")
    valid_from: Optional[str] = Field(default=None, description="Start date (ISO format)")
    valid_until: Optional[str] = Field(default=None, description="Expiry date (ISO format)")
    is_active: bool = Field(default=True, description="Whether coupon is active")

class CouponUpdate(BaseModel):
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    min_order_value: Optional[float] = None
    max_discount: Optional[float] = None
    usage_limit: Optional[int] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    is_active: Optional[bool] = None

class CouponValidateRequest(BaseModel):
    code: str
    subtotal: float

# Routes

@router.post("/validate")
async def validate_coupon(request: CouponValidateRequest):
    """Validate a coupon code and calculate discount"""
    code = request.code.strip().upper()
    subtotal = request.subtotal
    
    # Find coupon
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    
    if not coupon:
        return {"valid": False, "message": "Invalid coupon code"}
    
    # Check if active
    if not coupon.get("is_active", True):
        return {"valid": False, "message": "This coupon is no longer active"}
    
    # Check validity dates
    now = datetime.now(timezone.utc)
    
    if coupon.get("valid_from"):
        valid_from = datetime.fromisoformat(coupon["valid_from"].replace("Z", "+00:00"))
        if now < valid_from:
            return {"valid": False, "message": "This coupon is not yet active"}
    
    if coupon.get("valid_until"):
        valid_until = datetime.fromisoformat(coupon["valid_until"].replace("Z", "+00:00"))
        if now > valid_until:
            return {"valid": False, "message": "This coupon has expired"}
    
    # Check minimum order value
    min_order = coupon.get("min_order_value", 0)
    if subtotal < min_order:
        return {
            "valid": False, 
            "message": f"Minimum order value of ₹{min_order:,.0f} required"
        }
    
    # Check usage limit
    usage_limit = coupon.get("usage_limit")
    usage_count = coupon.get("usage_count", 0)
    if usage_limit and usage_count >= usage_limit:
        return {"valid": False, "message": "This coupon has reached its usage limit"}
    
    # Calculate discount
    discount_type = coupon.get("discount_type", "percentage")
    discount_value = coupon.get("discount_value", 0)
    
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
        # Apply max discount cap if set
        max_discount = coupon.get("max_discount")
        if max_discount and discount_amount > max_discount:
            discount_amount = max_discount
    else:  # fixed
        discount_amount = min(discount_value, subtotal)  # Don't exceed subtotal
    
    return {
        "valid": True,
        "message": "Coupon applied successfully",
        "coupon": {
            "code": coupon["code"],
            "description": coupon.get("description", ""),
            "discount_type": discount_type,
            "discount_value": discount_value
        },
        "discount_amount": round(discount_amount, 2)
    }


@router.get("")
async def list_coupons():
    """List all coupons (Admin)"""
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=100)
    return {"coupons": coupons}


@router.get("/{coupon_id}")
async def get_coupon(coupon_id: str):
    """Get a single coupon by ID"""
    coupon = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return coupon


@router.post("")
async def create_coupon(coupon_data: CouponCreate):
    """Create a new coupon (Admin)"""
    # Check if code already exists
    code = coupon_data.code.strip().upper()
    existing = await db.coupons.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    
    # Create coupon
    coupon = {
        "id": str(uuid.uuid4()),
        "code": code,
        "description": coupon_data.description,
        "discount_type": coupon_data.discount_type,
        "discount_value": coupon_data.discount_value,
        "min_order_value": coupon_data.min_order_value,
        "max_discount": coupon_data.max_discount,
        "usage_limit": coupon_data.usage_limit,
        "usage_count": 0,
        "valid_from": coupon_data.valid_from,
        "valid_until": coupon_data.valid_until,
        "is_active": coupon_data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.coupons.insert_one(coupon)
    
    # Return without _id
    coupon.pop("_id", None)
    return {"success": True, "coupon": coupon}


@router.put("/{coupon_id}")
async def update_coupon(coupon_id: str, coupon_data: CouponUpdate):
    """Update a coupon (Admin)"""
    # Build update dict
    update_dict = {k: v for k, v in coupon_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.coupons.update_one(
        {"id": coupon_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    # Return updated coupon
    coupon = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    return {"success": True, "coupon": coupon}


@router.delete("/{coupon_id}")
async def delete_coupon(coupon_id: str):
    """Delete a coupon (Admin)"""
    result = await db.coupons.delete_one({"id": coupon_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    return {"success": True, "message": "Coupon deleted"}


@router.post("/{coupon_id}/increment-usage")
async def increment_coupon_usage(coupon_id: str):
    """Increment usage count for a coupon (called after successful order)"""
    result = await db.coupons.update_one(
        {"id": coupon_id},
        {"$inc": {"usage_count": 1}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    return {"success": True}
