"""
Shiprocket Shipping Integration Service
Handles authentication, rate calculation, order creation, AWB assignment, and tracking
"""

import httpx
import logging
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

class ShiprocketService:
    """Service for interacting with Shiprocket API"""
    
    def __init__(self):
        self.email = os.environ.get("SHIPROCKET_API_EMAIL")
        self.password = os.environ.get("SHIPROCKET_API_PASSWORD")
        self.base_url = os.environ.get("SHIPROCKET_API_BASE_URL", "https://apiv2.shiprocket.in")
        self.token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
    
    async def get_valid_token(self) -> str:
        """Get a valid token, refreshing if necessary"""
        now = datetime.utcnow()
        
        if self.token and self.token_expiry and now < self.token_expiry:
            return self.token
        
        logger.info("Generating new Shiprocket authentication token")
        await self._generate_token()
        return self.token
    
    async def _generate_token(self) -> None:
        """Generate a new authentication token from Shiprocket"""
        auth_url = f"{self.base_url}/v1/external/auth/login"
        
        payload = {
            "email": self.email,
            "password": self.password
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    auth_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self.token = data.get("token")
                    self.token_expiry = datetime.utcnow() + timedelta(hours=240)
                    logger.info(f"Successfully generated Shiprocket token")
                else:
                    error_message = f"Failed to authenticate with Shiprocket: {response.status_code} - {response.text}"
                    logger.error(error_message)
                    raise Exception(error_message)
                    
            except httpx.TimeoutException:
                logger.error("Timeout connecting to Shiprocket authentication endpoint")
                raise
            except Exception as e:
                logger.error(f"Error generating Shiprocket token: {str(e)}")
                raise
    
    async def check_serviceability(
        self,
        pickup_pincode: str,
        delivery_pincode: str,
        weight_kg: float,
        cod: bool = False,
        length_cm: float = 30,
        width_cm: float = 20,
        height_cm: float = 10,
        declared_value: float = 1000
    ) -> Dict[str, Any]:
        """
        Check courier serviceability and get shipping rates
        """
        endpoint = f"{self.base_url}/v1/external/courier/serviceability/"
        token = await self.get_valid_token()
        
        params = {
            "pickup_postcode": pickup_pincode,
            "delivery_postcode": delivery_pincode,
            "weight": round(weight_kg, 2),
            "cod": 1 if cod else 0,
            "length": length_cm,
            "breadth": width_cm,
            "height": height_cm,
            "declared_value": declared_value
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    endpoint,
                    params=params,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 202]:
                    data = response.json()
                    couriers = data.get("data", {}).get("available_courier_companies", [])
                    
                    formatted_couriers = []
                    for courier in couriers:
                        formatted_couriers.append({
                            "courier_id": courier.get("courier_company_id"),
                            "courier_name": courier.get("courier_name"),
                            "rate": courier.get("rate"),
                            "cod_charges": courier.get("cod_charges", 0),
                            "freight_charge": courier.get("freight_charge"),
                            "estimated_delivery_days": courier.get("estimated_delivery_days"),
                            "etd": courier.get("etd"),
                            "min_weight": courier.get("min_weight"),
                            "is_surface": courier.get("is_surface", False),
                            "is_air": not courier.get("is_surface", False)
                        })
                    
                    return {
                        "success": True,
                        "couriers": sorted(formatted_couriers, key=lambda x: x.get("rate", 0)),
                        "count": len(formatted_couriers)
                    }
                else:
                    logger.error(f"Serviceability check failed: {response.status_code} - {response.text}")
                    return {
                        "success": False,
                        "error": f"Failed to check serviceability: {response.text}",
                        "couriers": []
                    }
                    
            except Exception as e:
                logger.error(f"Error checking serviceability: {str(e)}")
                return {
                    "success": False,
                    "error": str(e),
                    "couriers": []
                }
    
    async def create_order(
        self,
        order_id: str,
        order_date: str,
        pickup_location: str,
        billing_customer_name: str,
        billing_phone: str,
        billing_address: str,
        billing_city: str,
        billing_state: str,
        billing_pincode: str,
        billing_email: str,
        shipping_customer_name: str,
        shipping_phone: str,
        shipping_address: str,
        shipping_city: str,
        shipping_state: str,
        shipping_pincode: str,
        order_items: List[Dict],
        payment_method: str,  # "COD" or "Prepaid"
        sub_total: float,
        length: float,
        breadth: float,
        height: float,
        weight: float
    ) -> Dict[str, Any]:
        """
        Create an order in Shiprocket
        """
        endpoint = f"{self.base_url}/v1/external/orders/create/adhoc"
        token = await self.get_valid_token()
        
        payload = {
            "order_id": order_id,
            "order_date": order_date,
            "pickup_location": pickup_location,
            "billing_customer_name": billing_customer_name,
            "billing_last_name": "",
            "billing_address": billing_address,
            "billing_city": billing_city,
            "billing_pincode": billing_pincode,
            "billing_state": billing_state,
            "billing_country": "India",
            "billing_email": billing_email,
            "billing_phone": billing_phone,
            "shipping_is_billing": False,
            "shipping_customer_name": shipping_customer_name,
            "shipping_last_name": "",
            "shipping_address": shipping_address,
            "shipping_city": shipping_city,
            "shipping_pincode": shipping_pincode,
            "shipping_state": shipping_state,
            "shipping_country": "India",
            "shipping_phone": shipping_phone,
            "order_items": order_items,
            "payment_method": payment_method,
            "sub_total": sub_total,
            "length": length,
            "breadth": breadth,
            "height": height,
            "weight": weight
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    logger.info(f"Order {order_id} created in Shiprocket: {data}")
                    return {
                        "success": True,
                        "shiprocket_order_id": data.get("order_id"),
                        "shipment_id": data.get("shipment_id"),
                        "status": data.get("status"),
                        "message": data.get("message", "Order created successfully")
                    }
                else:
                    logger.error(f"Failed to create order: {response.status_code} - {response.text}")
                    return {
                        "success": False,
                        "error": f"Failed to create order: {response.text}"
                    }
                    
            except Exception as e:
                logger.error(f"Error creating order: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def assign_awb(self, shipment_id: int, courier_id: int) -> Dict[str, Any]:
        """
        Assign AWB (Air Waybill) to a shipment
        """
        endpoint = f"{self.base_url}/v1/external/courier/assign/awb"
        token = await self.get_valid_token()
        
        payload = {
            "shipment_id": shipment_id,
            "courier_id": courier_id
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {
                        "success": True,
                        "awb_code": data.get("response", {}).get("data", {}).get("awb_code"),
                        "courier_name": data.get("response", {}).get("data", {}).get("courier_name"),
                        "message": "AWB assigned successfully"
                    }
                else:
                    logger.error(f"Failed to assign AWB: {response.status_code} - {response.text}")
                    return {
                        "success": False,
                        "error": f"Failed to assign AWB: {response.text}"
                    }
                    
            except Exception as e:
                logger.error(f"Error assigning AWB: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def generate_label(self, shipment_id: int) -> Dict[str, Any]:
        """
        Generate shipping label for a shipment
        """
        endpoint = f"{self.base_url}/v1/external/courier/generate/label"
        token = await self.get_valid_token()
        
        payload = {
            "shipment_id": [shipment_id]
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {
                        "success": True,
                        "label_url": data.get("label_url"),
                        "message": "Label generated successfully"
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Failed to generate label: {response.text}"
                    }
                    
            except Exception as e:
                logger.error(f"Error generating label: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def track_shipment(self, awb_code: str) -> Dict[str, Any]:
        """
        Track a shipment using AWB code
        """
        endpoint = f"{self.base_url}/v1/external/courier/track/awb/{awb_code}"
        token = await self.get_valid_token()
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    endpoint,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 202]:
                    data = response.json()
                    tracking_data = data.get("tracking_data", {})
                    
                    activities = []
                    for activity in tracking_data.get("shipment_track_activities", []):
                        activities.append({
                            "date": activity.get("date"),
                            "status": activity.get("status"),
                            "activity": activity.get("activity"),
                            "location": activity.get("location", "")
                        })
                    
                    return {
                        "success": True,
                        "current_status": tracking_data.get("shipment_status"),
                        "current_status_id": tracking_data.get("shipment_status_id"),
                        "awb_code": awb_code,
                        "courier_name": tracking_data.get("courier_name"),
                        "estimated_delivery": tracking_data.get("edd"),
                        "activities": activities,
                        "pickup_date": tracking_data.get("pickup_date"),
                        "delivered_date": tracking_data.get("delivered_date")
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Tracking data not available"
                    }
                    
            except Exception as e:
                logger.error(f"Error tracking shipment: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def track_by_order_id(self, order_id: str) -> Dict[str, Any]:
        """
        Track a shipment using Order ID
        """
        endpoint = f"{self.base_url}/v1/external/courier/track"
        token = await self.get_valid_token()
        
        params = {
            "order_id": order_id
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    endpoint,
                    params=params,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code in [200, 202]:
                    data = response.json()
                    return {
                        "success": True,
                        "tracking_data": data
                    }
                else:
                    return {
                        "success": False,
                        "error": "Tracking data not available"
                    }
                    
            except Exception as e:
                logger.error(f"Error tracking by order ID: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def get_pickup_locations(self) -> Dict[str, Any]:
        """
        Get all pickup locations configured in Shiprocket
        """
        endpoint = f"{self.base_url}/v1/external/settings/company/pickup"
        token = await self.get_valid_token()
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    endpoint,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    locations = data.get("data", {}).get("shipping_address", [])
                    
                    formatted_locations = []
                    for loc in locations:
                        formatted_locations.append({
                            "id": loc.get("id"),
                            "pickup_location": loc.get("pickup_location"),
                            "name": loc.get("name"),
                            "email": loc.get("email"),
                            "phone": loc.get("phone"),
                            "address": loc.get("address"),
                            "city": loc.get("city"),
                            "state": loc.get("state"),
                            "pin_code": loc.get("pin_code"),
                            "is_primary": loc.get("is_primary_location", False)
                        })
                    
                    return {
                        "success": True,
                        "locations": formatted_locations
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to fetch pickup locations"
                    }
                    
            except Exception as e:
                logger.error(f"Error fetching pickup locations: {str(e)}")
                return {
                    "success": False,
                    "error": str(e)
                }


# Singleton instance
shiprocket_service = ShiprocketService()
