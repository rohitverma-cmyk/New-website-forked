"""
Pickup Location schemas for Shiprocket API
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class AddPickupLocationRequest(BaseModel):
    """Request schema for adding a new pickup location"""
    pickup_location: str = Field(..., min_length=1, max_length=100, description="Unique pickup location name/nickname")
    name: str = Field(..., min_length=1, max_length=100, description="Contact person name")
    email: EmailStr = Field(..., description="Contact email address")
    phone: str = Field(..., min_length=10, max_length=15, description="Contact phone number")
    address: str = Field(..., min_length=5, max_length=255, description="Pickup address line 1")
    address_2: Optional[str] = Field(default="", max_length=255, description="Pickup address line 2")
    city: str = Field(..., min_length=1, max_length=100, description="City")
    state: str = Field(..., min_length=1, max_length=100, description="State")
    country: str = Field(default="India", min_length=1, max_length=100, description="Country")
    pin_code: str = Field(..., min_length=6, max_length=6, description="PIN code")


class PickupLocation(BaseModel):
    """Schema for pickup location details"""
    id: int
    pickup_location: str
    name: str
    email: str
    phone: str
    address: str
    address_2: Optional[str] = None
    city: str
    state: str
    country: str
    pin_code: str
    status: int
    phone_verified: int
    
    class Config:
        from_attributes = True


class PickupLocationResponse(BaseModel):
    """Response schema for pickup location operations"""
    success: bool
    message: str
    data: Optional[list[PickupLocation]] = None
    errors: Optional[list[str]] = None


class SchedulePickupRequest(BaseModel):
    """Request schema for scheduling pickup"""
    shipment_ids: list[int] = Field(..., min_length=1, description="List of shipment IDs to schedule pickup for")


class GenerateLabelRequest(BaseModel):
    """Request schema for generating shipping labels"""
    shipment_ids: list[int] = Field(..., min_length=1, description="List of shipment IDs to generate labels for")


class GenerateManifestRequest(BaseModel):
    """Request schema for generating manifest"""
    shipment_ids: list[int] = Field(..., min_length=1, description="List of shipment IDs to include in manifest")


class GenerateInvoiceRequest(BaseModel):
    """Request schema for generating invoice"""
    order_ids: list[int] = Field(..., min_length=1, description="List of order IDs to generate invoices for")


class DocumentResponse(BaseModel):
    """Response schema for document generation (labels, invoices, manifests)"""
    success: bool
    message: str
    label_url: Optional[str] = None
    invoice_url: Optional[str] = None
    manifest_url: Optional[str] = None
    not_created: Optional[list[int]] = None
    errors: Optional[list[str]] = None
