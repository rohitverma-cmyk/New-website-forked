"""
Order schemas for Shiprocket API
"""
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
from typing import Optional, Literal
from datetime import datetime


class OrderItemSchema(BaseModel):
    """Schema for individual order items"""
    name: str = Field(..., min_length=1, max_length=255, description="Product name")
    sku: str = Field(..., min_length=1, max_length=100, description="Stock Keeping Unit")
    units: int = Field(..., gt=0, le=1000, description="Quantity of items")
    selling_price: float = Field(..., gt=0, description="Selling price per unit")
    discount: Optional[float] = Field(default=0, ge=0, description="Discount amount")
    tax: Optional[float] = Field(default=0, ge=0, description="Tax amount")
    hsn_code: Optional[str] = Field(default=None, description="HSN code for GST")


class CreateOrderRequest(BaseModel):
    """Request schema for creating an order in Shiprocket"""
    
    # Order Details
    order_id: str = Field(..., min_length=1, max_length=100, description="Your unique order reference ID")
    order_date: datetime = Field(..., description="Order creation date")
    pickup_location: str = Field(..., min_length=1, max_length=255, description="Pickup location name (must be pre-configured in Shiprocket)")
    channel_id: Optional[int] = Field(default=None, description="Channel ID for multi-channel setups")
    comment: Optional[str] = Field(default=None, max_length=500, description="Order comments")
    
    # Billing Details
    billing_customer_name: str = Field(..., min_length=1, max_length=100, description="Customer first name")
    billing_last_name: Optional[str] = Field(default="", max_length=100, description="Customer last name")
    billing_email: EmailStr = Field(..., description="Customer email address")
    billing_phone: str = Field(..., min_length=10, max_length=15, description="Customer phone number")
    billing_address: str = Field(..., min_length=5, max_length=255, description="Billing address line 1")
    billing_address_2: Optional[str] = Field(default="", max_length=255, description="Billing address line 2")
    billing_city: str = Field(..., min_length=1, max_length=100, description="Billing city")
    billing_state: str = Field(..., min_length=1, max_length=100, description="Billing state")
    billing_country: str = Field(default="India", min_length=1, max_length=100, description="Billing country")
    billing_pincode: str = Field(..., min_length=6, max_length=6, description="Billing PIN code")
    
    # Shipping Details - Optional when shipping_is_billing=True
    shipping_is_billing: bool = Field(default=False, description="Use billing address as shipping address")
    shipping_customer_name: Optional[str] = Field(default=None, max_length=100, description="Recipient first name (optional if shipping_is_billing=True)")
    shipping_last_name: Optional[str] = Field(default="", max_length=100, description="Recipient last name")
    shipping_email: Optional[EmailStr] = Field(default=None, description="Recipient email address (optional if shipping_is_billing=True)")
    shipping_phone: Optional[str] = Field(default=None, max_length=15, description="Recipient phone number (optional if shipping_is_billing=True)")
    shipping_address: Optional[str] = Field(default=None, max_length=255, description="Shipping address line 1 (optional if shipping_is_billing=True)")
    shipping_address_2: Optional[str] = Field(default="", max_length=255, description="Shipping address line 2")
    shipping_city: Optional[str] = Field(default=None, max_length=100, description="Shipping city (optional if shipping_is_billing=True)")
    shipping_state: Optional[str] = Field(default=None, max_length=100, description="Shipping state (optional if shipping_is_billing=True)")
    shipping_country: str = Field(default="India", min_length=1, max_length=100, description="Shipping country")
    shipping_pincode: Optional[str] = Field(default=None, max_length=6, description="Shipping PIN code (optional if shipping_is_billing=True)")
    
    # Order Items
    order_items: list[OrderItemSchema] = Field(..., min_length=1, description="List of items in the order")
    
    # Package Details
    weight: float = Field(..., gt=0, description="Total weight in kg")
    length: Optional[float] = Field(default=10, gt=0, description="Package length in cm")
    breadth: Optional[float] = Field(default=10, gt=0, description="Package breadth in cm")
    height: Optional[float] = Field(default=10, gt=0, description="Package height in cm")
    
    # Payment Details
    payment_method: Literal["COD", "Prepaid"] = Field(..., description="Payment method: COD or Prepaid")
    sub_total: float = Field(..., ge=0, description="Order subtotal amount")
    shipping_charges: Optional[float] = Field(default=0, ge=0, description="Shipping charges")
    giftwrap_charges: Optional[float] = Field(default=0, ge=0, description="Gift wrap charges")
    transaction_charges: Optional[float] = Field(default=0, ge=0, description="Transaction charges")
    total_discount: Optional[float] = Field(default=0, ge=0, description="Total discount amount")
    
    @model_validator(mode='after')
    def validate_shipping_fields(self):
        """Copy billing to shipping if shipping_is_billing is True, or validate shipping fields exist"""
        if self.shipping_is_billing:
            # Copy billing details to shipping if shipping_is_billing is True
            self.shipping_customer_name = self.billing_customer_name
            self.shipping_last_name = self.billing_last_name
            self.shipping_email = self.billing_email
            self.shipping_phone = self.billing_phone
            self.shipping_address = self.billing_address
            self.shipping_address_2 = self.billing_address_2
            self.shipping_city = self.billing_city
            self.shipping_state = self.billing_state
            self.shipping_country = self.billing_country
            self.shipping_pincode = self.billing_pincode
        else:
            # Validate required shipping fields when not using billing address
            required_fields = [
                ('shipping_customer_name', self.shipping_customer_name),
                ('shipping_email', self.shipping_email),
                ('shipping_phone', self.shipping_phone),
                ('shipping_address', self.shipping_address),
                ('shipping_city', self.shipping_city),
                ('shipping_state', self.shipping_state),
                ('shipping_pincode', self.shipping_pincode)
            ]
            missing = [name for name, value in required_fields if not value]
            if missing:
                raise ValueError(f"Shipping fields required when shipping_is_billing=False: {', '.join(missing)}")
        return self
    
    @field_validator('billing_pincode')
    @classmethod
    def validate_billing_pincode(cls, v):
        if v and (not v.isdigit() or len(v) != 6):
            raise ValueError('PIN code must be a 6-digit number')
        return v
    
    @field_validator('shipping_pincode')
    @classmethod
    def validate_shipping_pincode(cls, v):
        if v and (not v.isdigit() or len(v) != 6):
            raise ValueError('PIN code must be a 6-digit number')
        return v
    
    @field_validator('billing_phone')
    @classmethod
    def validate_billing_phone(cls, v):
        if v:
            clean_phone = ''.join(filter(str.isdigit, v))
            if len(clean_phone) < 10:
                raise ValueError('Phone number must have at least 10 digits')
            return clean_phone
        return v
    
    @field_validator('shipping_phone')
    @classmethod
    def validate_shipping_phone(cls, v):
        if v:
            clean_phone = ''.join(filter(str.isdigit, v))
            if len(clean_phone) < 10:
                raise ValueError('Phone number must have at least 10 digits')
            return clean_phone
        return v


class UpdateOrderRequest(BaseModel):
    """Request schema for updating order details"""
    order_id: int = Field(..., description="Shiprocket order ID")
    shipping_customer_name: Optional[str] = None
    shipping_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_pincode: Optional[str] = None
    shipping_country: Optional[str] = None


class OrderResponse(BaseModel):
    """Response schema for order operations"""
    success: bool
    message: str
    order_id: Optional[int] = None
    shipment_id: Optional[int] = None
    status: Optional[str] = None
    status_code: Optional[int] = None
    awb_code: Optional[str] = None
    courier_name: Optional[str] = None
    data: Optional[dict] = None
    errors: Optional[list[str]] = None
