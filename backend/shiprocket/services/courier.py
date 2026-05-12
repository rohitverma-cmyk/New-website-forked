"""
Shiprocket Courier Service
Handles courier selection, rate calculation, and AWB generation
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
from ..schemas.courier import RateCalculationRequest

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class CourierService:
    """Service for courier selection and rate calculation via Shiprocket API"""
    
    def __init__(self, http_client: httpx.AsyncClient, headers: dict):
        self.http_client = http_client
        self.headers = headers
        self.base_url = settings.shiprocket_base_url
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def check_serviceability(self, rate_request: RateCalculationRequest) -> dict:
        """
        Check courier serviceability and get shipping rates
        
        Returns list of available couriers with their rates and estimated delivery times
        """
        url = f"{self.base_url}/v1/external/courier/serviceability/"
        
        params = {
            "pickup_postcode": rate_request.pickup_postcode,
            "delivery_postcode": rate_request.delivery_postcode,
            "weight": rate_request.weight,
            "cod": 1 if rate_request.cod else 0
        }
        
        if rate_request.length:
            params["length"] = rate_request.length
        if rate_request.breadth:
            params["breadth"] = rate_request.breadth
        if rate_request.height:
            params["height"] = rate_request.height
        if rate_request.declared_value:
            params["declared_value"] = rate_request.declared_value
        
        try:
            response = await self.http_client.get(
                url,
                params=params,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            courier_count = len(result.get("data", {}).get("available_courier_companies", []))
            logger.info(f"Serviceability check: {courier_count} couriers available for route {rate_request.pickup_postcode} -> {rate_request.delivery_postcode}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Serviceability check failed: {error_detail}")
            raise ValueError(f"Serviceability check failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_courier_list(self) -> dict:
        """Get list of all available couriers"""
        url = f"{self.base_url}/v1/external/courier/courierListWithCounts"
        
        try:
            response = await self.http_client.get(
                url,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Retrieved courier list")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Get courier list failed: {error_detail}")
            raise ValueError(f"Get courier list failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def assign_awb(
        self,
        shipment_id: int,
        courier_id: Optional[int] = None,
        status: Optional[str] = None
    ) -> dict:
        """
        Assign AWB (Air Waybill) to a shipment
        
        Args:
            shipment_id: Shiprocket shipment ID
            courier_id: Optional specific courier ID (auto-assigned if not provided)
            status: Optional status filter
            
        Returns:
            dict containing AWB details and courier assignment info
        """
        url = f"{self.base_url}/v1/external/courier/assign/awb"
        
        payload = {"shipment_id": shipment_id}
        
        if courier_id:
            payload["courier_id"] = courier_id
        if status:
            payload["status"] = status
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            awb_code = result.get("response", {}).get("data", {}).get("awb_code")
            logger.info(f"AWB assigned to shipment {shipment_id}: {awb_code}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"AWB assignment failed: {error_detail}")
            raise ValueError(f"AWB assignment failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def request_shipment_pickup(self, shipment_ids: list[int]) -> dict:
        """
        Request pickup for one or more shipments
        
        Args:
            shipment_ids: List of shipment IDs to request pickup for
        """
        url = f"{self.base_url}/v1/external/courier/generate/pickup"
        
        payload = {"shipment_id": shipment_ids}
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Pickup requested for {len(shipment_ids)} shipment(s)")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Pickup request failed: {error_detail}")
            raise ValueError(f"Pickup request failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def check_pincode_serviceability(
        self,
        pickup_pincode: str,
        delivery_pincode: str
    ) -> dict:
        """Check if a route is serviceable"""
        url = f"{self.base_url}/v1/external/courier/serviceability/"
        
        params = {
            "pickup_postcode": pickup_pincode,
            "delivery_postcode": delivery_pincode,
            "weight": 0.5,  # Default weight for serviceability check
            "cod": 0
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
            is_serviceable = len(result.get("data", {}).get("available_courier_companies", [])) > 0
            logger.info(f"Route {pickup_pincode} -> {delivery_pincode} serviceability: {is_serviceable}")
            return {
                "serviceable": is_serviceable,
                "data": result
            }
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Pincode serviceability check failed: {error_detail}")
            raise ValueError(f"Pincode serviceability check failed: {error_detail}")
