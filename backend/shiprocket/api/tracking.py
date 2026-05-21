"""
Tracking API Router for Shiprocket Integration
"""
import httpx
import logging
from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional

from ..services.auth import auth_service
from ..services.tracking import TrackingService
from ..schemas.tracking import TrackingResponse, BulkTrackingRequest
from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tracking", tags=["Shiprocket Tracking"])


@router.get("/awb/{awb_code}")
async def track_by_awb(awb_code: str):
    """
    Get tracking information by AWB (Air Waybill) code
    
    Returns:
    - Current status
    - Delivery tracking activities
    - Expected delivery date
    - Courier information
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            tracking_service = TrackingService(client, headers)
            result = await tracking_service.track_by_awb(awb_code)
            
            tracking_data = result.get("tracking_data", {})
            shipment_track = tracking_data.get("shipment_track", [{}])[0] if tracking_data.get("shipment_track") else {}
            
            return {
                "success": True,
                "message": "Tracking retrieved successfully",
                "awb_code": awb_code,
                "courier_name": shipment_track.get("courier_name"),
                "current_status": shipment_track.get("current_status"),
                "current_status_id": shipment_track.get("current_status_id"),
                "delivered_date": shipment_track.get("delivered_date"),
                "edd": shipment_track.get("edd"),
                "tracking_data": tracking_data
            }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error tracking by AWB: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve tracking: {str(e)}"
        )


@router.get("/shipment/{shipment_id}")
async def track_by_shipment_id(shipment_id: int):
    """
    Get tracking information by Shiprocket shipment ID
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            tracking_service = TrackingService(client, headers)
            result = await tracking_service.track_by_shipment_id(shipment_id)
            
            return {
                "success": True,
                "message": "Tracking retrieved successfully",
                "shipment_id": shipment_id,
                "tracking_data": result
            }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error tracking by shipment ID: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve tracking: {str(e)}"
        )


@router.get("/order/{order_id}")
async def track_by_order_id(
    order_id: int,
    channel_id: Optional[int] = Query(default=None, description="Channel ID for multi-channel setups")
):
    """
    Get tracking information by Shiprocket order ID
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            tracking_service = TrackingService(client, headers)
            result = await tracking_service.track_by_order_id(order_id, channel_id)
            
            return {
                "success": True,
                "message": "Tracking retrieved successfully",
                "order_id": order_id,
                "tracking_data": result
            }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error tracking by order ID: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve tracking: {str(e)}"
        )


@router.post("/bulk", response_model=APIResponse)
async def track_multiple_awbs(request: BulkTrackingRequest):
    """
    Get tracking information for multiple AWB codes
    
    Maximum 50 AWB codes per request.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            tracking_service = TrackingService(client, headers)
            result = await tracking_service.track_multiple_awbs(request.awb_codes)
            
            return APIResponse(
                success=True,
                message=f"Retrieved tracking for {len(request.awb_codes)} AWB(s)",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error bulk tracking: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve tracking: {str(e)}"
        )
