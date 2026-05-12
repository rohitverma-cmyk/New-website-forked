"""
Return Order schemas for Shiprocket API
"""
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, Literal
from datetime import datetime


class ReturnItemSchema(BaseModel):
    """Schema for items being returned"""
    name: str = Field(..., min_length=1, max_length=255, description="Product name")
    sku: str = Field(..., min_length=1, max_length=100, description="Stock Keeping Unit")
    units: int = Field(..., gt=0, le=1000, description="Quantity of items being returned")
    selling_price: float = Field(..., gt=0, description="Original selling price per unit")
    discount: Optional[float] = Field(default=0, ge=0, description="Discount amount")
    tax: Optional[float] = Field(default=0, ge=0, description="Tax amount")
    hsn_code: Optional[str] = Field(default=None, description="HSN code for GST")
    qc_enable: bool = Field(default=False, description="Enable quality check for this item")


class CreateReturnOrderRequest(BaseModel):
    """Request schema for creating a return order"""
    
    # Order Details
    order_id: str = Field(..., min_length=1, max_length=100, description="Your unique return order reference ID")
    order_date: datetime = Field(..., description="Return order creation date")
    channel_id: Optional[int] = Field(default=None, description="Channel ID for multi-channel setups")
    
    # Pickup Details (Customer's address where package will be picked up)
    pickup_customer_name: str = Field(..., min_length=1, max_length=100, description="Customer first name")
    pickup_last_name: Optional[str] = Field(default="", max_length=100, description="Customer last name")
    pickup_email: EmailStr = Field(..., description="Customer email address")
    pickup_phone: str = Field(..., min_length=10, max_length=15, description="Customer phone number")
    pickup_address: str = Field(..., min_length=5, max_length=255, description="Customer address line 1")
    pickup_address_2: Optional[str] = Field(default="", max_length=255, description="Customer address line 2")
    pickup_city: str = Field(..., min_length=1, max_length=100, description="Customer city")
    pickup_state: str = Field(..., min_length=1, max_length=100, description="Customer state")
    pickup_country: str = Field(default="India", min_length=1, max_length=100, description="Customer country")
    pickup_pincode: str = Field(..., min_length=6, max_length=6, description="Customer PIN code")
    
    # Shipping Details (Warehouse address where package will be delivered)
    shipping_customer_name: str = Field(..., min_length=1, max_length=100, description="Warehouse contact name")
    shipping_last_name: Optional[str] = Field(default="", max_length=100, description="Warehouse contact last name")
    shipping_email: EmailStr = Field(..., description="Warehouse email address")
    shipping_phone: str = Field(..., min_length=10, max_length=15, description="Warehouse phone number")
    shipping_address: str = Field(..., min_length=5, max_length=255, description="Warehouse address line 1")
    shipping_address_2: Optional[str] = Field(default="", max_length=255, description="Warehouse address line 2")
    shipping_city: str = Field(..., min_length=1, max_length=100, description="Warehouse city")
    shipping_state: str = Field(..., min_length=1, max_length=100, description="Warehouse state")
    shipping_country: str = Field(default="India", min_length=1, max_length=100, description="Warehouse country")
    shipping_pincode: str = Field(..., min_length=6, max_length=6, description="Warehouse PIN code")
    
    # Return Items
    order_items: list[ReturnItemSchema] = Field(..., min_length=1, description="List of items being returned")
    
    # Package Details
    weight: float = Field(..., gt=0, description="Total weight in kg")
    length: Optional[float] = Field(default=10, gt=0, description="Package length in cm")
    breadth: Optional[float] = Field(default=10, gt=0, description="Package breadth in cm")
    height: Optional[float] = Field(default=10, gt=0, description="Package height in cm")
    
    # Payment Details
    payment_method: Literal["COD", "Prepaid"] = Field(default="Prepaid", description="Original payment method")
    sub_total: float = Field(..., ge=0, description="Return order value")
    
    @field_validator('pickup_pincode', 'shipping_pincode')
    @classmethod
    def validate_pincode(cls, v):
        if not v.isdigit() or len(v) != 6:
            raise ValueError('PIN code must be a 6-digit number')
        return v


class ReturnOrderResponse(BaseModel):
    """Response schema for return order operations"""
    success: bool
    message: str
    order_id: Optional[int] = None
    shipment_id: Optional[int] = None
    status: Optional[str] = None
    data: Optional[dict] = None
    errors: Optional[list[str]] = None


class NDRShipment(BaseModel):
    """Schema for NDR (Non-Delivery Report) shipment"""
    awb: str
    order_id: int
    shipment_id: int
    courier_name: str
    ndr_reason: str
    ndr_date: str
    customer_name: str
    customer_phone: str
    delivery_address: str
    
    class Config:
        from_attributes = True


class NDRActionRequest(BaseModel):
    """Request schema for taking action on NDR shipment"""
    awb: str = Field(..., description="AWB code of the NDR shipment")
    action: Literal["re-attempt", "return", "fake-attempt"] = Field(..., description="Action to take")
    comments: Optional[str] = Field(default="", max_length=500, description="Action comments")
    preferred_date: Optional[str] = Field(default=None, description="Preferred delivery date (YYYY-MM-DD) for re-attempt")
    phone: Optional[str] = Field(default=None, description="Updated phone number")
    address: Optional[str] = Field(default=None, description="Updated address")
