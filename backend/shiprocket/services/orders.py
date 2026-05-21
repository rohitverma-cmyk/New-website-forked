"""
Shiprocket Order Service
Handles order creation, management, and cancellation
"""
import httpx
import logging
from typing import Optional
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from ..config import get_shiprocket_settings
from ..schemas.orders import CreateOrderRequest, UpdateOrderRequest

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class OrderService:
    """Service for managing orders via Shiprocket API"""
    
    def __init__(self, http_client: httpx.AsyncClient, headers: dict):
        self.http_client = http_client
        self.headers = headers
        self.base_url = settings.shiprocket_base_url
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def create_order(self, order_data: CreateOrderRequest) -> dict:
        """
        Create a new order in Shiprocket
        
        Returns:
            dict containing order_id, shipment_id, and other details
        """
        url = f"{self.base_url}/v1/external/orders/create/adhoc"
        
        payload = {
            "order_id": order_data.order_id,
            "order_date": order_data.order_date.strftime("%Y-%m-%d %H:%M"),
            "pickup_location": order_data.pickup_location,
            "channel_id": order_data.channel_id,
            "comment": order_data.comment or "",
            
            # Billing Details
            "billing_customer_name": order_data.billing_customer_name,
            "billing_last_name": order_data.billing_last_name or "",
            "billing_email": order_data.billing_email,
            "billing_phone": order_data.billing_phone,
            "billing_address": order_data.billing_address,
            "billing_address_2": order_data.billing_address_2 or "",
            "billing_city": order_data.billing_city,
            "billing_state": order_data.billing_state,
            "billing_country": order_data.billing_country,
            "billing_pincode": order_data.billing_pincode,
            
            # Shipping Details (same as billing if shipping_is_billing is True)
            "shipping_is_billing": order_data.shipping_is_billing,
            "shipping_customer_name": order_data.shipping_customer_name,
            "shipping_last_name": order_data.shipping_last_name or "",
            "shipping_email": order_data.shipping_email,
            "shipping_phone": order_data.shipping_phone,
            "shipping_address": order_data.shipping_address,
            "shipping_address_2": order_data.shipping_address_2 or "",
            "shipping_city": order_data.shipping_city,
            "shipping_state": order_data.shipping_state,
            "shipping_country": order_data.shipping_country,
            "shipping_pincode": order_data.shipping_pincode,
            
            # Order Items
            "order_items": [
                {
                    "name": item.name,
                    "sku": item.sku,
                    "units": item.units,
                    "selling_price": str(item.selling_price),
                    "discount": str(item.discount or 0),
                    "tax": str(item.tax or 0),
                    "hsn": item.hsn_code or ""
                }
                for item in order_data.order_items
            ],
            
            # Package Details
            "weight": order_data.weight,
            "length": order_data.length or 10,
            "breadth": order_data.breadth or 10,
            "height": order_data.height or 10,
            
            # Payment
            "payment_method": order_data.payment_method,
            "sub_total": order_data.sub_total,
            "shipping_charges": order_data.shipping_charges or 0,
            "giftwrap_charges": order_data.giftwrap_charges or 0,
            "transaction_charges": order_data.transaction_charges or 0,
            "total_discount": order_data.total_discount or 0,
        }
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Order created successfully: {order_data.order_id} -> Shiprocket ID: {result.get('order_id')}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to create order: {error_detail}")
            raise ValueError(f"Order creation failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_order(self, order_id: int) -> dict:
        """Get order details by Shiprocket order ID"""
        url = f"{self.base_url}/v1/external/orders/show/{order_id}"
        
        try:
            response = await self.http_client.get(
                url,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Order retrieved successfully: {order_id}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to get order: {error_detail}")
            raise ValueError(f"Get order failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_all_orders(
        self,
        page: int = 1,
        per_page: int = 20,
        sort: str = "desc",
        sort_by: str = "id",
        filter_by: Optional[str] = None,
        search: Optional[str] = None
    ) -> dict:
        """Get all orders with pagination and filtering"""
        url = f"{self.base_url}/v1/external/orders"
        
        params = {
            "page": page,
            "per_page": per_page,
            "sort": sort,
            "sort_by": sort_by
        }
        
        if filter_by:
            params["filter"] = filter_by
        if search:
            params["search"] = search
        
        try:
            response = await self.http_client.get(
                url,
                params=params,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Retrieved {len(result.get('data', []))} orders")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to get orders: {error_detail}")
            raise ValueError(f"Get orders failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def cancel_order(self, order_ids: list[int]) -> dict:
        """
        Cancel one or more orders before dispatch
        
        Args:
            order_ids: List of Shiprocket order IDs to cancel
        """
        url = f"{self.base_url}/v1/external/orders/cancel"
        
        payload = {"ids": order_ids}
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Orders cancelled successfully: {order_ids}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to cancel orders: {error_detail}")
            raise ValueError(f"Order cancellation failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def update_pickup_location(self, order_id: int, pickup_location: str) -> dict:
        """Update pickup location for an order"""
        url = f"{self.base_url}/v1/external/orders/address/pickup"
        
        payload = {
            "order_id": order_id,
            "pickup_location": pickup_location
        }
        
        try:
            response = await self.http_client.patch(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Pickup location updated for order: {order_id}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to update pickup location: {error_detail}")
            raise ValueError(f"Update pickup location failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def update_delivery_address(
        self,
        order_id: int,
        shipping_customer_name: str,
        shipping_phone: str,
        shipping_address: str,
        shipping_city: str,
        shipping_state: str,
        shipping_pincode: str,
        shipping_country: str = "India"
    ) -> dict:
        """Update delivery address for an order"""
        url = f"{self.base_url}/v1/external/orders/address/update"
        
        payload = {
            "order_id": order_id,
            "shipping_customer_name": shipping_customer_name,
            "shipping_phone": shipping_phone,
            "shipping_address": shipping_address,
            "shipping_city": shipping_city,
            "shipping_state": shipping_state,
            "shipping_pincode": shipping_pincode,
            "shipping_country": shipping_country
        }
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Delivery address updated for order: {order_id}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Failed to update delivery address: {error_detail}")
            raise ValueError(f"Update delivery address failed: {error_detail}")
