"""
Shiprocket Authentication Service
Handles token generation, storage, and automatic refresh
"""
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from ..config import get_shiprocket_settings

logger = logging.getLogger(__name__)
settings = get_shiprocket_settings()


class AuthService:
    """Manages Shiprocket authentication and token lifecycle with automatic refresh"""
    
    def __init__(self):
        self.current_token: Optional[str] = None
        self.token_generated_at: Optional[datetime] = None
        self.http_client: Optional[httpx.AsyncClient] = None
    
    async def initialize(self):
        """Initialize the HTTP client and generate initial token"""
        self.http_client = httpx.AsyncClient(
            timeout=settings.request_timeout,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)
        )
        await self.refresh_token()
        logger.info("Shiprocket AuthService initialized successfully")
    
    async def close(self):
        """Close the HTTP client"""
        if self.http_client:
            await self.http_client.aclose()
            logger.info("Shiprocket AuthService closed")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(httpx.RequestError)
    )
    async def _generate_new_token(self) -> str:
        """Generate a new authentication token from Shiprocket API"""
        auth_url = f"{settings.shiprocket_base_url}{settings.shiprocket_auth_endpoint}"
        
        payload = {
            "email": settings.shiprocket_api_email,
            "password": settings.shiprocket_api_password
        }
        
        try:
            response = await self.http_client.post(auth_url, json=payload)
            response.raise_for_status()
            
            data = response.json()
            token = data.get("token")
            
            if not token:
                logger.error("No token received from Shiprocket API")
                raise ValueError("Authentication failed: no token in response")
            
            self.current_token = token
            self.token_generated_at = datetime.utcnow()
            logger.info("Successfully generated new Shiprocket API token")
            
            return token
            
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"Authentication failed: {error_msg}")
            raise ValueError(f"Authentication failed: {error_msg}")
        except Exception as e:
            logger.error(f"Unexpected error during token generation: {str(e)}")
            raise
    
    async def refresh_token(self) -> str:
        """Refresh the authentication token if needed"""
        if self._is_token_valid():
            return self.current_token
        
        logger.info("Token expired or not initialized, generating new token")
        return await self._generate_new_token()
    
    def _is_token_valid(self) -> bool:
        """Check if current token is still valid"""
        if not self.current_token or not self.token_generated_at:
            return False
        
        expiration_buffer = timedelta(hours=settings.token_refresh_buffer_hours)
        token_expiration = self.token_generated_at + timedelta(hours=settings.token_validity_hours)
        
        return datetime.utcnow() < (token_expiration - expiration_buffer)
    
    async def get_token(self) -> str:
        """Get current valid token, refreshing if necessary"""
        if not self._is_token_valid():
            await self.refresh_token()
        return self.current_token
    
    def get_auth_headers(self) -> dict:
        """Get headers with authorization token"""
        if not self.current_token:
            raise ValueError("No valid token available. Call get_token() first.")
        
        return {
            "Authorization": f"Bearer {self.current_token}",
            "Content-Type": "application/json"
        }
    
    async def get_auth_headers_async(self) -> dict:
        """Get headers with valid token (auto-refresh)"""
        await self.get_token()
        return self.get_auth_headers()


# Global singleton instance
auth_service = AuthService()
