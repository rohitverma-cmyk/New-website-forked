"""
Pickup, Labels, and Manifest API Router for Shiprocket Integration
"""
import httpx
import logging
from fastapi import APIRouter, HTTPException, status

from ..services.auth import auth_service
from ..services.pickup import PickupService
from ..schemas.pickup import (
    AddPickupLocationRequest,
    PickupLocationResponse,
    SchedulePickupRequest,
    GenerateLabelRequest,
    GenerateManifestRequest,
    GenerateInvoiceRequest,
    DocumentResponse
)
from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pickup", tags=["Shiprocket Pickup & Documents"])


# ===================== PICKUP LOCATIONS =====================

@router.get("/locations", response_model=APIResponse)
async def get_pickup_locations():
    """
    Get all configured pickup locations
    
    Returns list of all warehouse/pickup locations configured in your Shiprocket account.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.get_pickup_locations()
            
            return APIResponse(
                success=True,
                message="Pickup locations retrieved successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error getting pickup locations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pickup locations: {str(e)}"
        )


@router.post("/locations", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def add_pickup_location(location: AddPickupLocationRequest):
    """
    Add a new pickup location
    
    Creates a new warehouse/pickup location in your Shiprocket account.
    The pickup_location name must be unique.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.add_pickup_location(location)
            
            return APIResponse(
                success=True,
                message=f"Pickup location '{location.pickup_location}' added successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error adding pickup location: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add pickup location: {str(e)}"
        )


# ===================== PICKUP SCHEDULING =====================

@router.post("/schedule", response_model=APIResponse)
async def schedule_pickup(request: SchedulePickupRequest):
    """
    Schedule pickup for shipments
    
    This schedules a courier to pickup packages from your warehouse.
    Shipments must have AWB assigned before scheduling pickup.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.schedule_pickup(request.shipment_ids)
            
            return APIResponse(
                success=True,
                message=f"Pickup scheduled for {len(request.shipment_ids)} shipment(s)",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error scheduling pickup: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule pickup: {str(e)}"
        )


# ===================== LABELS =====================

@router.post("/labels", response_model=DocumentResponse)
async def generate_labels(request: GenerateLabelRequest):
    """
    Generate shipping labels for shipments
    
    Returns a PDF URL containing shipping labels for all specified shipments.
    Shipments must have AWB assigned before generating labels.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.generate_label(request.shipment_ids)
            
            return DocumentResponse(
                success=True,
                message=f"Labels generated for {len(request.shipment_ids)} shipment(s)",
                label_url=result.get("label_url"),
                not_created=result.get("not_created"),
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error generating labels: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate labels: {str(e)}"
        )


# ===================== INVOICES =====================

@router.post("/invoices", response_model=DocumentResponse)
async def generate_invoices(request: GenerateInvoiceRequest):
    """
    Generate invoices for orders
    
    Returns a PDF URL containing invoices for all specified orders.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.generate_invoice(request.order_ids)
            
            return DocumentResponse(
                success=True,
                message=f"Invoices generated for {len(request.order_ids)} order(s)",
                invoice_url=result.get("invoice_url"),
                not_created=result.get("not_created"),
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error generating invoices: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate invoices: {str(e)}"
        )


# ===================== MANIFESTS =====================

@router.post("/manifests", response_model=DocumentResponse)
async def generate_manifest(request: GenerateManifestRequest):
    """
    Generate pickup manifest for shipments
    
    The manifest is a document that contains all shipment details for the courier pickup.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            pickup_service = PickupService(client, headers)
            result = await pickup_service.generate_manifest(request.shipment_ids)
            
            return DocumentResponse(
                success=True,
                message=f"Manifest generated for {len(request.shipment_ids)} shipment(s)",
                manifest_url=result.get("manifest_url"),
                not_created=result.get("not_created"),
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error generating manifest: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate manifest: {str(e)}"
        )
