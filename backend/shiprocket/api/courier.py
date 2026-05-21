"""
Courier API Router for Shiprocket Integration
"""
import httpx
import logging
from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional

from ..services.auth import auth_service
from ..services.courier import CourierService
from ..schemas.courier import (
    RateCalculationRequest,
    RateCalculationResponse,
    CourierOption,
    AWBAssignmentRequest,
    AWBAssignmentResponse
)
from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/courier", tags=["Shiprocket Courier"])


@router.post("/rates", response_model=RateCalculationResponse)
async def calculate_shipping_rates(rate_request: RateCalculationRequest):
    """
    Calculate shipping rates for available couriers
    
    Returns list of available couriers with:
    - Shipping rates
    - Estimated delivery days
    - COD charges (if applicable)
    - Chargeable weight
    
    Use the recommended_courier for optimal price/speed balance.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            courier_service = CourierService(client, headers)
            result = await courier_service.check_serviceability(rate_request)
            
            couriers = []
            recommended = None
            
            if result.get("data", {}).get("available_courier_companies"):
                for c in result["data"]["available_courier_companies"]:
                    courier = CourierOption(
                        courier_id=c.get("courier_company_id"),
                        courier_name=c.get("courier_name", ""),
                        rate=float(c.get("rate", 0)),
                        cod_charge=float(c.get("cod_charges", 0)) if c.get("cod_charges") else None,
                        estimated_delivery_days=c.get("estimated_delivery_days", 0),
                        min_weight=float(c.get("min_weight", 0)),
                        chargeable_weight=float(c.get("chargeable_weight", 0)),
                        freight_charge=float(c.get("freight_charge", 0)),
                        coverage_charges=float(c.get("coverage_charges", 0)),
                        mode=c.get("mode", ""),
                        etd=c.get("etd"),
                        rto_charges=float(c.get("rto_charges", 0)) if c.get("rto_charges") else None,
                        is_surface=c.get("is_surface", False)
                    )
                    couriers.append(courier)
                
                # Recommend the cheapest courier with reasonable delivery time
                if couriers:
                    recommended = min(couriers, key=lambda x: x.rate)
            
            return RateCalculationResponse(
                success=True,
                message=f"Found {len(couriers)} available courier(s)",
                pickup_postcode=rate_request.pickup_postcode,
                delivery_postcode=rate_request.delivery_postcode,
                weight=rate_request.weight,
                cod=rate_request.cod,
                available_couriers=couriers,
                recommended_courier=recommended
            )
    
    except ValueError as e:
        logger.error(f"Rate calculation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error calculating rates: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate rates: {str(e)}"
        )


@router.get("/list", response_model=APIResponse)
async def get_courier_list():
    """
    Get list of all available courier partners
    
    Returns all couriers with their shipment counts and status.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            courier_service = CourierService(client, headers)
            result = await courier_service.get_courier_list()
            
            return APIResponse(
                success=True,
                message="Courier list retrieved successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error getting courier list: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get courier list: {str(e)}"
        )


@router.post("/assign-awb", response_model=AWBAssignmentResponse)
async def assign_awb(request: AWBAssignmentRequest):
    """
    Assign AWB (Air Waybill) to a shipment
    
    This assigns a courier and generates tracking number (AWB) for the shipment.
    
    If courier_id is not provided, Shiprocket will auto-assign the best courier.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            courier_service = CourierService(client, headers)
            result = await courier_service.assign_awb(
                shipment_id=request.shipment_id,
                courier_id=request.courier_id,
                status=request.status
            )
            
            # Check if AWB assignment was successful
            awb_status = result.get("awb_assign_status", 0)
            response_data = result.get("response", {}).get("data", {})
            
            # Handle wallet balance error or other failures
            if awb_status == 0 or not response_data.get("awb_code"):
                error_msg = result.get("message") or response_data.get("awb_assign_error") or "AWB assignment failed"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_msg
                )
            
            return AWBAssignmentResponse(
                success=True,
                message="AWB assigned successfully",
                awb_code=response_data.get("awb_code"),
                courier_company_id=response_data.get("courier_company_id"),
                courier_name=response_data.get("courier_name"),
                shipment_id=request.shipment_id,
                applied_weight=response_data.get("applied_weight"),
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error assigning AWB: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign AWB: {str(e)}"
        )


@router.get("/serviceability", response_model=APIResponse)
async def check_pincode_serviceability(
    pickup_pincode: str = Query(..., min_length=6, max_length=6, description="Pickup PIN code"),
    delivery_pincode: str = Query(..., min_length=6, max_length=6, description="Delivery PIN code")
):
    """
    Check if a route is serviceable
    
    Returns whether delivery is possible between the two pincodes.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            courier_service = CourierService(client, headers)
            result = await courier_service.check_pincode_serviceability(
                pickup_pincode=pickup_pincode,
                delivery_pincode=delivery_pincode
            )
            
            return APIResponse(
                success=True,
                message="Serviceability check complete",
                data={
                    "pickup_pincode": pickup_pincode,
                    "delivery_pincode": delivery_pincode,
                    "serviceable": result.get("serviceable", False),
                    "details": result.get("data")
                }
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error checking serviceability: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check serviceability: {str(e)}"
        )


@router.post("/request-pickup", response_model=APIResponse)
async def request_shipment_pickup(shipment_ids: list[int]):
    """
    Request pickup for shipments
    
    This schedules a pickup from your warehouse for the specified shipments.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            courier_service = CourierService(client, headers)
            result = await courier_service.request_shipment_pickup(shipment_ids)
            
            return APIResponse(
                success=True,
                message=f"Pickup requested for {len(shipment_ids)} shipment(s)",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error requesting pickup: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to request pickup: {str(e)}"
        )
