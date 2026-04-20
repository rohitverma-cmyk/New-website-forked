"""
Shiprocket Shipping Routes
API endpoints for shipping rate calculation, order creation, and tracking
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from shiprocket_service import shiprocket_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/shipping", tags=["shipping"])


class ShippingRateRequest(BaseModel):
    """Request model for shipping rate calculation"""
    pickup_pincode: str
    delivery_pincode: str
    weight_kg: float
    length_cm: float = 30
    width_cm: float = 20
    height_cm: float = 10
    cod: bool = False
    declared_value: float = 1000


class OrderItem(BaseModel):
    """Order item for shipment"""
    name: str
    sku: str
    units: int
    selling_price: float
    hsn: Optional[str] = ""


class CreateShipmentRequest(BaseModel):
    """Request model for creating a shipment"""
    order_id: str
    pickup_location: str  # Name of pickup location in Shiprocket
    
    # Billing details
    billing_customer_name: str
    billing_phone: str
    billing_address: str
    billing_city: str
    billing_state: str
    billing_pincode: str
    billing_email: EmailStr
    
    # Shipping details (can be same as billing)
    shipping_customer_name: Optional[str] = None
    shipping_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_pincode: Optional[str] = None
    
    # Order details
    order_items: List[OrderItem]
    payment_method: str = "Prepaid"  # "COD" or "Prepaid"
    sub_total: float
    
    # Package dimensions
    length: float = 30
    breadth: float = 20
    height: float = 10
    weight: float = 0.5


class AssignAWBRequest(BaseModel):
    """Request for assigning AWB to shipment"""
    shipment_id: int
    courier_id: int


@router.get("/rates")
async def get_shipping_rates(
    pickup_pincode: str = Query(..., description="Pickup location pincode"),
    delivery_pincode: str = Query(..., description="Delivery location pincode"),
    weight_kg: float = Query(..., description="Package weight in kg"),
    length_cm: float = Query(30, description="Package length in cm"),
    width_cm: float = Query(20, description="Package width in cm"),
    height_cm: float = Query(10, description="Package height in cm"),
    cod: bool = Query(False, description="Is Cash on Delivery"),
    declared_value: float = Query(1000, description="Declared value of shipment")
):
    """
    Get available shipping rates for a delivery
    Returns list of available couriers with their rates and delivery estimates
    """
    try:
        result = await shiprocket_service.check_serviceability(
            pickup_pincode=pickup_pincode,
            delivery_pincode=delivery_pincode,
            weight_kg=weight_kg,
            cod=cod,
            length_cm=length_cm,
            width_cm=width_cm,
            height_cm=height_cm,
            declared_value=declared_value
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting shipping rates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rates")
async def calculate_shipping_rates(request: ShippingRateRequest):
    """
    Calculate shipping rates (POST method)
    """
    try:
        result = await shiprocket_service.check_serviceability(
            pickup_pincode=request.pickup_pincode,
            delivery_pincode=request.delivery_pincode,
            weight_kg=request.weight_kg,
            cod=request.cod,
            length_cm=request.length_cm,
            width_cm=request.width_cm,
            height_cm=request.height_cm,
            declared_value=request.declared_value
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error calculating shipping rates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-shipment")
async def create_shipment(request: CreateShipmentRequest):
    """
    Create a shipment in Shiprocket
    This should be called after order is placed and payment is confirmed
    """
    try:
        # Use billing address as shipping if not provided
        shipping_customer_name = request.shipping_customer_name or request.billing_customer_name
        shipping_phone = request.shipping_phone or request.billing_phone
        shipping_address = request.shipping_address or request.billing_address
        shipping_city = request.shipping_city or request.billing_city
        shipping_state = request.shipping_state or request.billing_state
        shipping_pincode = request.shipping_pincode or request.billing_pincode
        
        # Format order items
        order_items = []
        for item in request.order_items:
            order_items.append({
                "name": item.name,
                "sku": item.sku,
                "units": item.units,
                "selling_price": item.selling_price,
                "hsn": item.hsn or ""
            })
        
        result = await shiprocket_service.create_order(
            order_id=request.order_id,
            order_date=datetime.now().strftime("%Y-%m-%d %H:%M"),
            pickup_location=request.pickup_location,
            billing_customer_name=request.billing_customer_name,
            billing_phone=request.billing_phone,
            billing_address=request.billing_address,
            billing_city=request.billing_city,
            billing_state=request.billing_state,
            billing_pincode=request.billing_pincode,
            billing_email=request.billing_email,
            shipping_customer_name=shipping_customer_name,
            shipping_phone=shipping_phone,
            shipping_address=shipping_address,
            shipping_city=shipping_city,
            shipping_state=shipping_state,
            shipping_pincode=shipping_pincode,
            order_items=order_items,
            payment_method=request.payment_method,
            sub_total=request.sub_total,
            length=request.length,
            breadth=request.breadth,
            height=request.height,
            weight=request.weight
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error creating shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign-awb")
async def assign_awb(request: AssignAWBRequest):
    """
    Assign AWB (Air Waybill) to a shipment
    """
    try:
        result = await shiprocket_service.assign_awb(
            shipment_id=request.shipment_id,
            courier_id=request.courier_id
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error assigning AWB: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-label/{shipment_id}")
async def generate_label(shipment_id: int):
    """
    Generate shipping label for a shipment
    """
    try:
        result = await shiprocket_service.generate_label(shipment_id=shipment_id)
        return result
        
    except Exception as e:
        logger.error(f"Error generating label: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/track/awb/{awb_code}")
async def track_by_awb(awb_code: str):
    """
    Track shipment using AWB code
    """
    try:
        result = await shiprocket_service.track_shipment(awb_code=awb_code)
        return result
        
    except Exception as e:
        logger.error(f"Error tracking shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/track/order/{order_id}")
async def track_by_order(order_id: str):
    """
    Track shipment using Order ID
    """
    try:
        result = await shiprocket_service.track_by_order_id(order_id=order_id)
        return result
        
    except Exception as e:
        logger.error(f"Error tracking order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pickup-locations")
async def get_pickup_locations():
    """
    Get all configured pickup locations from Shiprocket
    """
    try:
        result = await shiprocket_service.get_pickup_locations()
        return result
        
    except Exception as e:
        logger.error(f"Error fetching pickup locations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    Check if Shiprocket API is accessible
    """
    try:
        token = await shiprocket_service.get_valid_token()
        return {
            "status": "healthy",
            "shiprocket_connected": True,
            "token_valid": token is not None
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "shiprocket_connected": False,
            "error": str(e)
        }
