"""
Shiprocket Tracking Service
Handles shipment tracking by AWB and Order ID
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

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class TrackingService:
    """Service for tracking shipments via Shiprocket API"""
    
    def __init__(self, http_client: httpx.AsyncClient, headers: dict):
        self.http_client = http_client
        self.headers = headers
        self.base_url = settings.shiprocket_base_url
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def track_by_awb(self, awb_code: str) -> dict:
        """
        Get tracking information by AWB (Air Waybill) code
        
        Returns detailed tracking history and current status
        """
        url = f"{self.base_url}/v1/external/courier/track/awb/{awb_code}"
        
        try:
            response = await self.http_client.get(
                url,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            current_status = result.get("tracking_data", {}).get("shipment_track", [{}])[0].get("current_status", "Unknown")
            logger.info(f"Tracking retrieved for AWB {awb_code}: {current_status}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Tracking by AWB failed: {error_detail}")
            raise ValueError(f"Tracking retrieval failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def track_by_shipment_id(self, shipment_id: int) -> dict:
        """
        Get tracking information by Shiprocket shipment ID
        """
        url = f"{self.base_url}/v1/external/courier/track/shipment/{shipment_id}"
        
        try:
            response = await self.http_client.get(
                url,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Tracking retrieved for shipment {shipment_id}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Tracking by shipment ID failed: {error_detail}")
            raise ValueError(f"Tracking retrieval failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def track_by_order_id(self, order_id: int, channel_id: int = None) -> dict:
        """
        Get tracking information by Shiprocket order ID
        
        Args:
            order_id: Shiprocket order ID
            channel_id: Optional channel ID for multi-channel setups
        """
        url = f"{self.base_url}/v1/external/courier/track"
        
        params = {"order_id": order_id}
        if channel_id:
            params["channel_id"] = channel_id
        
        try:
            response = await self.http_client.get(
                url,
                params=params,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Tracking retrieved for order {order_id}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Tracking by order ID failed: {error_detail}")
            raise ValueError(f"Tracking retrieval failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def track_multiple_awbs(self, awb_codes: list[str]) -> dict:
        """
        Get tracking information for multiple AWB codes at once
        
        Args:
            awb_codes: List of AWB codes (max 50)
        """
        if len(awb_codes) > 50:
            raise ValueError("Maximum 50 AWB codes allowed per request")
        
        url = f"{self.base_url}/v1/external/courier/track/awbs"
        
        payload = {"awbs": awb_codes}
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Bulk tracking retrieved for {len(awb_codes)} AWBs")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Bulk tracking failed: {error_detail}")
            raise ValueError(f"Bulk tracking retrieval failed: {error_detail}")
