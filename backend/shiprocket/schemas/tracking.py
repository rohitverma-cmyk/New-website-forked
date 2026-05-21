"""
Tracking schemas for Shiprocket API
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class TrackingActivity(BaseModel):
    """Schema for individual tracking activity/event"""
    date: str
    activity: str
    location: str
    status: Optional[str] = None
    
    class Config:
        from_attributes = True


class ShipmentTrack(BaseModel):
    """Schema for shipment tracking details"""
    awb_code: str
    courier_name: str
    current_status: str
    current_status_id: int
    delivered_date: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    edd: Optional[str] = None  # Expected Delivery Date
    activities: Optional[list[TrackingActivity]] = None
    
    class Config:
        from_attributes = True


class TrackingResponse(BaseModel):
    """Response schema for tracking queries"""
    success: bool
    message: str
    awb_code: Optional[str] = None
    shipment_id: Optional[int] = None
    order_id: Optional[int] = None
    courier_name: Optional[str] = None
    current_status: Optional[str] = None
    current_status_id: Optional[int] = None
    delivered_date: Optional[str] = None
    edd: Optional[str] = None
    tracking_data: Optional[dict] = None
    errors: Optional[list[str]] = None


class TrackingUpdate(BaseModel):
    """Schema for tracking update (used in webhooks)"""
    awb_code: str = Field(..., description="AWB code of the shipment")
    status: str = Field(..., description="Current status")
    status_code: int = Field(..., description="Status code")
    status_date: Optional[datetime] = Field(default=None, description="Status update timestamp")
    courier_name: str = Field(..., description="Courier company name")
    order_id: Optional[str] = Field(default=None, description="Your order reference ID")
    shipment_id: Optional[int] = Field(default=None, description="Shiprocket shipment ID")
    scans: Optional[list[dict]] = Field(default=None, description="Tracking scan events")
    
    class Config:
        from_attributes = True


class WebhookPayload(BaseModel):
    """Schema for Shiprocket webhook payloads"""
    event: str = Field(..., description="Event type")
    timestamp: datetime = Field(..., description="Event timestamp")
    data: TrackingUpdate = Field(..., description="Event data")
    
    class Config:
        from_attributes = True


class BulkTrackingRequest(BaseModel):
    """Request schema for bulk tracking"""
    awb_codes: list[str] = Field(..., min_length=1, max_length=50, description="List of AWB codes (max 50)")
