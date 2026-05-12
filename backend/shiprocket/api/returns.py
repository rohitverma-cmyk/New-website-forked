"""
Returns and RTO API Router for Shiprocket Integration
"""
import httpx
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks, status, Query

from ..services.auth import auth_service
from ..services.returns import ReturnsService
from ..schemas.returns import (
    CreateReturnOrderRequest,
    ReturnOrderResponse,
    NDRActionRequest
)
from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/returns", tags=["Shiprocket Returns & RTO"])


@router.post("/create", response_model=ReturnOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_return_order(
    return_request: CreateReturnOrderRequest,
    background_tasks: BackgroundTasks
):
    """
    Create a return order in Shiprocket
    
    This initiates a reverse pickup from the customer's address.
    The package will be picked up from the customer and delivered to your warehouse.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            returns_service = ReturnsService(client, headers)
            result = await returns_service.create_return_order(return_request)
            
            background_tasks.add_task(
                logger.info,
                f"Return order created: {return_request.order_id} -> SR ID: {result.get('order_id')}"
            )
            
            return ReturnOrderResponse(
                success=True,
                message="Return order created successfully",
                order_id=result.get("order_id"),
                shipment_id=result.get("shipment_id"),
                status=result.get("status"),
                data=result
            )
    
    except ValueError as e:
        logger.error(f"Validation error creating return order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error creating return order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create return order: {str(e)}"
        )


@router.get("/", response_model=APIResponse)
async def get_return_orders(
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=100, description="Items per page")
):
    """
    Get all return orders with pagination
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            returns_service = ReturnsService(client, headers)
            result = await returns_service.get_return_orders(page=page, per_page=per_page)
            
            return APIResponse(
                success=True,
                message=f"Retrieved {len(result.get('data', []))} return orders",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error getting return orders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get return orders: {str(e)}"
        )


@router.post("/cancel", response_model=APIResponse)
async def cancel_return_orders(order_ids: list[int]):
    """
    Cancel return orders before pickup
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            returns_service = ReturnsService(client, headers)
            result = await returns_service.cancel_return_order(order_ids)
            
            return APIResponse(
                success=True,
                message=f"Successfully cancelled {len(order_ids)} return order(s)",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error cancelling return orders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel return orders: {str(e)}"
        )


# ===================== NDR (Non-Delivery Report) =====================

@router.get("/ndr", response_model=APIResponse)
async def get_ndr_shipments(
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=100, description="Items per page")
):
    """
    Get NDR (Non-Delivery Report) shipments
    
    These are shipments that couldn't be delivered and require action.
    Common reasons: customer not available, wrong address, refused delivery.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            returns_service = ReturnsService(client, headers)
            result = await returns_service.get_ndr_shipments(page=page, per_page=per_page)
            
            return APIResponse(
                success=True,
                message="NDR shipments retrieved successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error getting NDR shipments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get NDR shipments: {str(e)}"
        )


@router.post("/ndr/action", response_model=APIResponse)
async def take_ndr_action(request: NDRActionRequest):
    """
    Take action on NDR shipment
    
    Available actions:
    - **re-attempt**: Attempt delivery again (optionally with new date/phone/address)
    - **return**: Return the package to sender
    - **fake-attempt**: Mark as fake attempt if courier didn't actually try
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            returns_service = ReturnsService(client, headers)
            result = await returns_service.take_ndr_action(
                awb=request.awb,
                action=request.action,
                comments=request.comments,
                preferred_date=request.preferred_date,
                phone=request.phone,
                address=request.address
            )
            
            return APIResponse(
                success=True,
                message=f"NDR action '{request.action}' submitted for AWB {request.awb}",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error taking NDR action: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to take NDR action: {str(e)}"
        )
