"""
Orders API Router for Shiprocket Integration
"""
import httpx
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks, status, Query
from typing import Optional

from ..services.auth import auth_service
from ..services.orders import OrderService
from ..schemas.orders import (
    CreateOrderRequest,
    OrderResponse,
    UpdateOrderRequest
)
from ..schemas.common import APIResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders", tags=["Shiprocket Orders"])


@router.post("/create", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_request: CreateOrderRequest,
    background_tasks: BackgroundTasks
):
    """
    Create a new order in Shiprocket
    
    This endpoint creates an order and returns:
    - Shiprocket order_id
    - Shiprocket shipment_id
    - Status information
    
    The order will be ready for courier assignment after creation.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.create_order(order_request)
            
            # Log in background
            background_tasks.add_task(
                logger.info,
                f"Order created: {order_request.order_id} -> SR ID: {result.get('order_id')}"
            )
            
            return OrderResponse(
                success=True,
                message="Order created successfully",
                order_id=result.get("order_id"),
                shipment_id=result.get("shipment_id"),
                status=result.get("status"),
                status_code=result.get("status_code"),
                data=result
            )
    
    except ValueError as e:
        logger.error(f"Validation error creating order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create order: {str(e)}"
        )


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int):
    """
    Get order details by Shiprocket order ID
    
    Returns complete order information including items, addresses, and status.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.get_order(order_id)
            
            return OrderResponse(
                success=True,
                message="Order retrieved successfully",
                order_id=order_id,
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error retrieving order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve order: {str(e)}"
        )


@router.get("/", response_model=APIResponse)
async def get_all_orders(
    page: int = Query(default=1, ge=1, description="Page number"),
    per_page: int = Query(default=20, ge=1, le=100, description="Items per page"),
    sort: str = Query(default="desc", enum=["asc", "desc"], description="Sort order"),
    sort_by: str = Query(default="id", description="Sort field"),
    filter_by: Optional[str] = Query(default=None, description="Filter by status"),
    search: Optional[str] = Query(default=None, description="Search term")
):
    """
    Get all orders with pagination and filtering
    
    Supports pagination, sorting, filtering by status, and search.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.get_all_orders(
                page=page,
                per_page=per_page,
                sort=sort,
                sort_by=sort_by,
                filter_by=filter_by,
                search=search
            )
            
            return APIResponse(
                success=True,
                message=f"Retrieved {len(result.get('data', []))} orders",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error retrieving orders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve orders: {str(e)}"
        )


@router.post("/cancel", response_model=APIResponse)
async def cancel_orders(order_ids: list[int]):
    """
    Cancel one or more orders before dispatch
    
    Orders can only be cancelled before they are picked up by the courier.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.cancel_order(order_ids)
            
            return APIResponse(
                success=True,
                message=f"Successfully cancelled {len(order_ids)} order(s)",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error cancelling orders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel orders: {str(e)}"
        )


@router.patch("/{order_id}/pickup-location", response_model=APIResponse)
async def update_pickup_location(order_id: int, pickup_location: str):
    """
    Update pickup location for an order
    
    Can only be updated before courier assignment.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.update_pickup_location(order_id, pickup_location)
            
            return APIResponse(
                success=True,
                message="Pickup location updated successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error updating pickup location: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update pickup location: {str(e)}"
        )


@router.patch("/{order_id}/delivery-address", response_model=APIResponse)
async def update_delivery_address(order_id: int, address_update: UpdateOrderRequest):
    """
    Update delivery address for an order
    
    Can only be updated before the order is out for delivery.
    """
    try:
        headers = await auth_service.get_auth_headers_async()
        
        async with httpx.AsyncClient() as client:
            order_service = OrderService(client, headers)
            result = await order_service.update_delivery_address(
                order_id=order_id,
                shipping_customer_name=address_update.shipping_customer_name,
                shipping_phone=address_update.shipping_phone,
                shipping_address=address_update.shipping_address,
                shipping_city=address_update.shipping_city,
                shipping_state=address_update.shipping_state,
                shipping_pincode=address_update.shipping_pincode,
                shipping_country=address_update.shipping_country or "India"
            )
            
            return APIResponse(
                success=True,
                message="Delivery address updated successfully",
                data=result
            )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error updating delivery address: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update delivery address: {str(e)}"
        )
