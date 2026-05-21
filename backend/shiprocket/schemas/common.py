"""
Common schemas used across all Shiprocket endpoints
"""
from pydantic import BaseModel
from typing import Optional, Any, Generic, TypeVar
from datetime import datetime

T = TypeVar('T')


class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool
    message: str
    data: Optional[Any] = None
    errors: Optional[list[str]] = None
    timestamp: datetime = None
    
    def __init__(self, **data):
        if 'timestamp' not in data:
            data['timestamp'] = datetime.utcnow()
        super().__init__(**data)


class PaginatedResponse(BaseModel):
    """Paginated response wrapper"""
    success: bool
    message: str
    data: Optional[list[Any]] = None
    page: int
    per_page: int
    total: int
    total_pages: int
    errors: Optional[list[str]] = None
