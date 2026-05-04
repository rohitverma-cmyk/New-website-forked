"""
RFQ Router - Handles Request for Quote submissions with category-specific fields
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rfq", tags=["rfq"])

# MongoDB reference (will be set from main server)
db = None

def set_db(database):
    """Set database reference from main server"""
    global db
    db = database

# ==================== MODELS ====================

class RFQSubmission(BaseModel):
    # Category selection
    category: str  # cotton, knits, denim, viscose
    
    # Cotton & Viscose specific
    fabric_requirement_type: Optional[str] = ""  # Greige, Dyed, RFD, Printed
    
    # Quantity fields (meters for cotton/viscose/denim, kg for knits)
    quantity_meters: Optional[str] = ""  # e.g., "1000_5000", "5000_20000"
    quantity_kg: Optional[str] = ""  # e.g., "200_500", "500_1000"
    
    # Knits specific
    knit_quality: Optional[str] = ""  # e.g., "4 Way Lycra 220-230 GSM"
    
    # Denim specific
    denim_specification: Optional[str] = ""  # e.g., "65% Cotton 35% Poly 4.5oz..."
    
    # Contact details
    full_name: str
    email: EmailStr
    phone: str
    gst_number: Optional[str] = ""
    website: Optional[str] = ""
    message: Optional[str] = ""

class RFQResponse(BaseModel):
    id: str
    rfq_number: str
    category: str
    fabric_requirement_type: str = ""
    quantity_meters: str = ""
    quantity_kg: str = ""
    knit_quality: str = ""
    denim_specification: str = ""
    full_name: str
    email: str
    phone: str
    gst_number: str = ""
    website: str = ""
    message: str = ""
    status: str
    created_at: str

# ==================== HELPERS ====================

async def generate_rfq_number() -> str:
    """Generate unique RFQ number like RFQ-XXXXX"""
    import random
    import string
    while True:
        number = 'RFQ-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        existing = await db.rfq_submissions.find_one({'rfq_number': number})
        if not existing:
            return number

def get_quantity_label(category: str, value: str) -> str:
    """Convert quantity value to human-readable label"""
    quantity_labels = {
        "cotton": {
            "1000_5000": "1,000 - 5,000 m",
            "5000_20000": "5,000 - 20,000 m",
            "20000_50000": "20,000 - 50,000 m",
            "50000_plus": "50,000 m+"
        },
        "viscose": {
            "1000_5000": "1,000 - 5,000 m",
            "5000_20000": "5,000 - 20,000 m",
            "20000_50000": "20,000 - 50,000 m",
            "50000_plus": "50,000 m+"
        },
        "denim": {
            "1000_2500": "1,000 - 2,500 m",
            "2500_7500": "2,500 - 7,500 m",
            "7500_25000": "7,500 - 25,000 m",
            "25000_plus": "25,000 m+"
        },
        "knits": {
            "less_than_200": "Less than 200 kg",
            "200_500": "200 - 500 kg",
            "500_1000": "500 - 1,000 kg",
            "1000_plus": "1,000 kg+"
        }
    }
    return quantity_labels.get(category, {}).get(value, value)

# ==================== ENDPOINTS ====================

@router.post("/submit", response_model=RFQResponse)
async def submit_rfq(data: RFQSubmission, request: Request):
    """Submit a new Request for Quote with category-specific details"""
    
    rfq_id = str(uuid.uuid4())
    rfq_number = await generate_rfq_number()

    # If the caller is a logged-in customer, attach their customer_id so the
    # RFQ shows up in their /account "My Queries" list. Anonymous submissions
    # (public RFQ form) just leave it blank.
    customer_id = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as _jwt
            JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
            payload = _jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
            if payload.get("type") == "customer":
                customer_id = payload.get("customer_id", "") or ""
        except Exception:
            customer_id = ""

    rfq_doc = {
        'id': rfq_id,
        'rfq_number': rfq_number,
        'customer_id': customer_id,
        'category': data.category,
        'fabric_requirement_type': data.fabric_requirement_type or "",
        'quantity_meters': data.quantity_meters or "",
        'quantity_kg': data.quantity_kg or "",
        'knit_quality': data.knit_quality or "",
        'denim_specification': data.denim_specification or "",
        'full_name': data.full_name,
        'email': data.email,
        'phone': data.phone,
        'gst_number': data.gst_number or "",
        'website': data.website or "",
        'message': data.message or "",
        'status': 'new',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.rfq_submissions.insert_one(rfq_doc)
    
    # Also create an enquiry record for unified tracking
    quantity_value = data.quantity_meters or data.quantity_kg
    quantity_label = get_quantity_label(data.category, quantity_value)
    
    enquiry_message = f"**RFQ #{rfq_number}**\n"
    enquiry_message += f"Category: {data.category.upper()}\n"
    
    if data.category in ["cotton", "viscose"]:
        enquiry_message += f"Fabric Type: {data.fabric_requirement_type}\n"
        enquiry_message += f"Quantity: {quantity_label}\n"
    elif data.category == "knits":
        enquiry_message += f"Quality: {data.knit_quality}\n"
        enquiry_message += f"Quantity: {quantity_label}\n"
    elif data.category == "denim":
        enquiry_message += f"Specification: {data.denim_specification}\n"
        enquiry_message += f"Quantity: {quantity_label}\n"
    
    if data.gst_number:
        enquiry_message += f"GST: {data.gst_number}\n"
    if data.message:
        enquiry_message += f"\nNotes: {data.message}"
    
    enquiry_doc = {
        'id': str(uuid.uuid4()),
        'name': data.full_name,
        'email': data.email,
        'phone': data.phone,
        'company': data.website or "",
        'message': enquiry_message,
        'enquiry_type': 'rfq',
        'source': 'rfq_page',
        'rfq_id': rfq_id,
        'rfq_number': rfq_number,
        'status': 'new',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.enquiries.insert_one(enquiry_doc)
    
    # Send email notification (async, don't block)
    try:
        from email_router import send_rfq_notification
        import asyncio
        asyncio.create_task(send_rfq_notification(rfq_doc))
    except Exception as e:
        logger.warning(f"Failed to queue RFQ email: {str(e)}")
    
    # Note: RFQs are NOT sent to Zapier - only general enquiries are
    
    logger.info(f"New RFQ submitted: {rfq_number} for {data.category}")
    
    return RFQResponse(**rfq_doc)

@router.get("/list")
async def list_rfqs(
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """List RFQ submissions (admin only - auth can be added later)"""
    query = {}
    if status:
        query['status'] = status
    if category:
        query['category'] = category
    
    rfqs = await db.rfq_submissions.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rfq_submissions.count_documents(query)
    
    return {
        'rfqs': rfqs,
        'total': total,
        'limit': limit,
        'skip': skip
    }

@router.get("/{rfq_id}")
async def get_rfq(rfq_id: str):
    """Get a specific RFQ by ID"""
    rfq = await db.rfq_submissions.find_one({'id': rfq_id}, {'_id': 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq

@router.put("/{rfq_id}/status")
async def update_rfq_status(rfq_id: str, status: str):
    """Update RFQ status"""
    valid_statuses = ['new', 'contacted', 'quoted', 'won', 'lost', 'closed']
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.rfq_submissions.update_one(
        {'id': rfq_id},
        {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="RFQ not found")
    
    return {'message': 'Status updated', 'status': status}
