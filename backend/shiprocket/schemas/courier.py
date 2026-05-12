"""
Courier and Rate schemas for Shiprocket API
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal, Union


class RateCalculationRequest(BaseModel):
    """Request schema for calculating shipping rates"""
    pickup_postcode: str = Field(..., min_length=6, max_length=6, description="Pickup location PIN code")
    delivery_postcode: str = Field(..., min_length=6, max_length=6, description="Delivery location PIN code")
    weight: float = Field(..., gt=0, le=50, description="Package weight in kg")
    length: Optional[float] = Field(default=None, gt=0, description="Package length in cm")
    breadth: Optional[float] = Field(default=None, gt=0, description="Package breadth in cm")
    height: Optional[float] = Field(default=None, gt=0, description="Package height in cm")
    declared_value: Optional[float] = Field(default=None, ge=0, description="Declared value of the package")
    cod: bool = Field(default=False, description="Is this a Cash on Delivery order?")


class CourierOption(BaseModel):
    """Schema for individual courier option"""
    courier_id: int = Field(..., description="Courier company ID")
    courier_name: str = Field(..., description="Courier company name")
    rate: float = Field(..., description="Shipping rate in INR")
    cod_charge: Optional[float] = Field(default=None, description="COD charge if applicable")
    estimated_delivery_days: Union[int, str] = Field(..., description="Estimated days for delivery")
    min_weight: float = Field(..., description="Minimum chargeable weight")
    chargeable_weight: float = Field(..., description="Chargeable weight")
    freight_charge: float = Field(..., description="Freight charge")
    coverage_charges: Optional[float] = Field(default=0, description="Coverage charges")
    mode: Union[str, int] = Field(..., description="Delivery mode (0=Surface, 1=Air)")
    etd: Optional[str] = Field(default=None, description="Estimated time of delivery")
    rto_charges: Optional[float] = Field(default=None, description="Return to Origin charges")
    is_surface: bool = Field(default=False, description="Is surface delivery")
    
    class Config:
        from_attributes = True


class RateCalculationResponse(BaseModel):
    """Response schema for rate calculation"""
    success: bool
    message: str
    pickup_postcode: str
    delivery_postcode: str
    weight: float
    cod: bool
    available_couriers: Optional[list[CourierOption]] = None
    recommended_courier: Optional[CourierOption] = None
    errors: Optional[list[str]] = None


class AWBAssignmentRequest(BaseModel):
    """Request schema for AWB assignment"""
    shipment_id: int = Field(..., description="Shiprocket shipment ID")
    courier_id: Optional[int] = Field(default=None, description="Specific courier ID (optional - auto-assigned if not provided)")
    status: Optional[str] = Field(default=None, description="Status filter")


class AWBAssignmentResponse(BaseModel):
    """Response schema for AWB assignment"""
    success: bool
    message: str
    awb_code: Optional[str] = None
    courier_company_id: Optional[int] = None
    courier_name: Optional[str] = None
    shipment_id: Optional[int] = None
    applied_weight: Optional[float] = None
    data: Optional[dict] = None
    errors: Optional[list[str]] = None
