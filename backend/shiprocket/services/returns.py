"""
Shiprocket Returns Service
Handles return order creation and RTO management
"""
import httpx
import logging
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from ..config import get_shiprocket_settings
from ..schemas.returns import CreateReturnOrderRequest

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class ReturnsService:
    """Service for managing return orders and RTO via Shiprocket API"""
    
    def __init__(self, http_client: httpx.AsyncClient, headers: dict):
        self.http_client = http_client
        self.headers = headers
        self.base_url = settings.shiprocket_base_url
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def create_return_order(self, return_data: CreateReturnOrderRequest) -> dict:
        """
        Create a return order in Shiprocket
        
        This initiates a reverse pickup from the customer address
        """
        url = f"{self.base_url}/v1/external/orders/create/return"
        
        payload = {
            "order_id": return_data.order_id,
            "order_date": return_data.order_date.strftime("%Y-%m-%d %H:%M"),
            "channel_id": return_data.channel_id,
            "pickup_customer_name": return_data.pickup_customer_name,
            "pickup_last_name": return_data.pickup_last_name or "",
            "pickup_email": return_data.pickup_email,
            "pickup_phone": return_data.pickup_phone,
            "pickup_address": return_data.pickup_address,
            "pickup_address_2": return_data.pickup_address_2 or "",
            "pickup_city": return_data.pickup_city,
            "pickup_state": return_data.pickup_state,
            "pickup_country": return_data.pickup_country,
            "pickup_pincode": return_data.pickup_pincode,
            
            "shipping_customer_name": return_data.shipping_customer_name,
            "shipping_last_name": return_data.shipping_last_name or "",
            "shipping_email": return_data.shipping_email,
            "shipping_phone": return_data.shipping_phone,
            "shipping_address": return_data.shipping_address,
            "shipping_address_2": return_data.shipping_address_2 or "",
            "shipping_city": return_data.shipping_city,
            "shipping_state": return_data.shipping_state,
            "shipping_country": return_data.shipping_country,
            "shipping_pincode": return_data.shipping_pincode,
            
            "order_items": [
                {
                    "name": item.name,
                    "sku": item.sku,
                    "units": item.units,
                    "selling_price": str(item.selling_price),
                    "discount": str(item.discount or 0),
                    "tax": str(item.tax or 0),
                    "hsn": item.hsn_code or "",
                    "qc_enable": item.qc_enable
                }
                for item in return_data.order_items
            ],
            
            "weight": return_data.weight,
            "length": return_data.length or 10,
            "breadth": return_data.breadth or 10,
            "height": return_data.height or 10,
            
            "payment_method": return_data.payment_method,
            "sub_total": return_data.sub_total
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
            logger.info(f"Return order created: {return_data.order_id} -> Shiprocket ID: {result.get('order_id')}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Create return order failed: {error_detail}")
            raise ValueError(f"Create return order failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_return_orders(
        self,
        page: int = 1,
        per_page: int = 20
    ) -> dict:
        """Get all return orders with pagination"""
        url = f"{self.base_url}/v1/external/orders"
        
        params = {
            "page": page,
            "per_page": per_page,
            "filter": "return"  # Filter for return orders only
        }
        
        try:
            response = await self.http_client.get(
                url,
                params=params,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Retrieved {len(result.get('data', []))} return orders")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Get return orders failed: {error_detail}")
            raise ValueError(f"Get return orders failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def cancel_return_order(self, order_ids: list[int]) -> dict:
        """
        Cancel return orders before pickup
        
        Args:
            order_ids: List of return order IDs to cancel
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
            logger.info(f"Return orders cancelled: {order_ids}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Cancel return orders failed: {error_detail}")
            raise ValueError(f"Cancel return orders failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_ndr_shipments(self, page: int = 1, per_page: int = 20) -> dict:
        """
        Get NDR (Non-Delivery Report) shipments
        
        These are shipments that couldn't be delivered and need attention
        """
        url = f"{self.base_url}/v1/external/ndr"
        
        params = {
            "page": page,
            "per_page": per_page
        }
        
        try:
            response = await self.http_client.get(
                url,
                params=params,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Retrieved NDR shipments")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Get NDR shipments failed: {error_detail}")
            raise ValueError(f"Get NDR shipments failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def take_ndr_action(
        self,
        awb: str,
        action: str,
        comments: str = "",
        preferred_date: str = None,
        phone: str = None,
        address: str = None
    ) -> dict:
        """
        Take action on NDR shipment
        
        Args:
            awb: AWB code of the shipment
            action: Action to take - 're-attempt', 'return', 'fake-attempt'
            comments: Optional comments
            preferred_date: Preferred delivery date for re-attempt (YYYY-MM-DD)
            phone: Updated phone number
            address: Updated address
        """
        url = f"{self.base_url}/v1/external/ndr/{awb}/action"
        
        payload = {
            "action": action,
            "comments": comments
        }
        
        if preferred_date:
            payload["preferred_date"] = preferred_date
        if phone:
            payload["phone"] = phone
        if address:
            payload["address"] = address
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"NDR action taken for AWB {awb}: {action}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Take NDR action failed: {error_detail}")
            raise ValueError(f"Take NDR action failed: {error_detail}")
