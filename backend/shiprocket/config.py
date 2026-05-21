"""
Shiprocket Configuration Module
Manages all configuration settings from environment variables
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List


class ShiprocketSettings(BaseSettings):
    """Shiprocket API Configuration loaded from environment variables"""
    
    # Shiprocket API Configuration
    shiprocket_api_email: str
    shiprocket_api_password: str
    shiprocket_base_url: str = "https://apiv2.shiprocket.in"
    shiprocket_auth_endpoint: str = "/v1/external/auth/login"
    
    # Token Management
    token_validity_hours: int = 240  # 10 days
    token_refresh_buffer_hours: int = 24  # Refresh 24 hours before expiry
    
    # Rate Limiting
    rate_limit_requests: int = 1000
    rate_limit_window_seconds: int = 60
    
    # Retry Configuration
    max_retries: int = 3
    retry_backoff_factor: float = 2.0
    retry_max_delay: int = 30
    
    # Timeouts
    request_timeout: int = 30
    
    # Blocked Couriers (case-insensitive partial match)
    blocked_couriers: List[str] = [
        "amazon",
        "Amazon"
    ]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_shiprocket_settings() -> ShiprocketSettings:
    """Cache settings instance for performance"""
    return ShiprocketSettings()
