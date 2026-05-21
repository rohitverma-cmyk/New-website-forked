"""
Shiprocket Pickup Service
Handles pickup location management, pickup scheduling, labels, and manifests
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
from ..schemas.pickup import AddPickupLocationRequest

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class PickupService:
    """Service for managing pickups, labels, and manifests via Shiprocket API"""
    
    def __init__(self, http_client: httpx.AsyncClient, headers: dict):
        self.http_client = http_client
        self.headers = headers
        self.base_url = settings.shiprocket_base_url
    
    # ===================== PICKUP LOCATIONS =====================
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def get_pickup_locations(self) -> dict:
        """Get all configured pickup locations"""
        url = f"{self.base_url}/v1/external/settings/company/pickup"
        
        try:
            response = await self.http_client.get(
                url,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            locations_count = len(result.get("data", {}).get("shipping_address", []))
            logger.info(f"Retrieved {locations_count} pickup locations")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Get pickup locations failed: {error_detail}")
            raise ValueError(f"Get pickup locations failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def add_pickup_location(self, location_data: AddPickupLocationRequest) -> dict:
        """Add a new pickup location"""
        url = f"{self.base_url}/v1/external/settings/company/addpickup"
        
        payload = {
            "pickup_location": location_data.pickup_location,
            "name": location_data.name,
            "email": location_data.email,
            "phone": location_data.phone,
            "address": location_data.address,
            "address_2": location_data.address_2 or "",
            "city": location_data.city,
            "state": location_data.state,
            "country": location_data.country,
            "pin_code": location_data.pin_code
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
            logger.info(f"Pickup location added: {location_data.pickup_location}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Add pickup location failed: {error_detail}")
            raise ValueError(f"Add pickup location failed: {error_detail}")
    
    # ===================== PICKUP SCHEDULING =====================
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def schedule_pickup(self, shipment_ids: list[int]) -> dict:
        """
        Schedule pickup for one or more shipments
        
        Args:
            shipment_ids: List of shipment IDs to schedule pickup for
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
            logger.info(f"Pickup scheduled for {len(shipment_ids)} shipment(s)")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Schedule pickup failed: {error_detail}")
            raise ValueError(f"Schedule pickup failed: {error_detail}")
    
    # ===================== LABELS =====================
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def generate_label(self, shipment_ids: list[int]) -> dict:
        """
        Generate shipping labels for shipments
        
        Returns PDF URL for downloading labels
        """
        url = f"{self.base_url}/v1/external/courier/generate/label"
        
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
            label_url = result.get("label_url")
            logger.info(f"Labels generated for {len(shipment_ids)} shipment(s): {label_url}")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Generate labels failed: {error_detail}")
            raise ValueError(f"Generate labels failed: {error_detail}")
    
    # ===================== INVOICES =====================
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def generate_invoice(self, order_ids: list[int]) -> dict:
        """
        Generate invoices for orders
        
        Returns PDF URL for downloading invoices
        """
        url = f"{self.base_url}/v1/external/orders/print/invoice"
        
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
            logger.info(f"Invoices generated for {len(order_ids)} order(s)")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Generate invoices failed: {error_detail}")
            raise ValueError(f"Generate invoices failed: {error_detail}")
    
    # ===================== MANIFESTS =====================
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def generate_manifest(self, shipment_ids: list[int]) -> dict:
        """
        Generate pickup manifest for batch shipments
        
        The manifest is a document that contains all shipment details for pickup
        """
        url = f"{self.base_url}/v1/external/manifests/generate"
        
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
            logger.info(f"Manifest generated for {len(shipment_ids)} shipment(s)")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Generate manifest failed: {error_detail}")
            raise ValueError(f"Generate manifest failed: {error_detail}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException))
    )
    async def print_manifest(self, order_ids: list[int]) -> dict:
        """Get printable manifest document"""
        url = f"{self.base_url}/v1/external/manifests/print"
        
        payload = {"order_ids": order_ids}
        
        try:
            response = await self.http_client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=settings.request_timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Manifest printed for {len(order_ids)} order(s)")
            return result
            
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Print manifest failed: {error_detail}")
            raise ValueError(f"Print manifest failed: {error_detail}")
