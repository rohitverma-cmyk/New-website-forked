"""
Zapier Webhook Integration
Sends all leads to Zapier for automation workflows
"""

import httpx
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/5994632/uxd3tni/"

async def send_to_zapier(
    lead_type: str,
    source: str,
    contact: dict,
    product: Optional[dict] = None,
    details: Optional[dict] = None
):
    """
    Send lead data to Zapier webhook
    
    Args:
        lead_type: One of 'enquiry', 'sample_booking', 'bulk_booking', 'rfq', 'order'
        source: Where the lead came from (e.g., 'fabric_catalog', 'fabric_detail', 'rfq_page')
        contact: Dict with name, email, phone, company
        product: Dict with fabric_id, fabric_name, category, quantity (optional)
        details: Dict with message, rfq_number, order_number, etc. (optional)
    """
    
    payload = {
        "lead_type": lead_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source or "website",
        
        "contact": {
            "name": contact.get("name", ""),
            "email": contact.get("email", ""),
            "phone": contact.get("phone", ""),
            "company": contact.get("company", "")
        },
        
        "product": {
            "fabric_id": (product or {}).get("fabric_id", ""),
            "fabric_name": (product or {}).get("fabric_name", ""),
            "category": (product or {}).get("category", ""),
            "quantity": (product or {}).get("quantity", "")
        },
        
        "details": details or {}
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(ZAPIER_WEBHOOK_URL, json=payload)
            
            if response.status_code == 200:
                logger.info(f"Zapier webhook sent successfully: {lead_type} from {source}")
                return True
            else:
                logger.warning(f"Zapier webhook returned status {response.status_code}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send to Zapier webhook: {str(e)}")
        return False


async def send_enquiry_to_zapier(enquiry: dict):
    """Send enquiry lead to Zapier - ONLY general enquiries, not bookings"""
    
    enquiry_type = enquiry.get("enquiry_type", "general")
    
    # Only send general enquiries to Zapier (from Send Enquiry button)
    # Skip sample_booking, bulk_booking, sample_order, bulk_order
    if enquiry_type not in ["general"]:
        logger.info(f"Skipping Zapier for enquiry type: {enquiry_type} (only 'general' enquiries are sent)")
        return
    
    await send_to_zapier(
        lead_type="enquiry",
        source=enquiry.get("source", "website"),
        contact={
            "name": enquiry.get("name", ""),
            "email": enquiry.get("email", ""),
            "phone": enquiry.get("phone", ""),
            "company": enquiry.get("company", "")
        },
        product={
            "fabric_id": enquiry.get("fabric_id", ""),
            "fabric_name": enquiry.get("fabric_name", ""),
            "category": enquiry.get("category_name", ""),
            "quantity": enquiry.get("quantity_required", "")
        },
        details={
            "message": enquiry.get("message", ""),
            "enquiry_type": enquiry_type,
            "enquiry_id": str(enquiry.get("_id", "")) if enquiry.get("_id") else ""
        }
    )


async def send_rfq_to_zapier(rfq: dict):
    """Send RFQ lead to Zapier"""
    
    contact_details = rfq.get("contact_details", {})
    requirements = rfq.get("requirements", {})
    
    await send_to_zapier(
        lead_type="rfq",
        source="rfq_page",
        contact={
            "name": contact_details.get("full_name", ""),
            "email": contact_details.get("email", ""),
            "phone": contact_details.get("phone", ""),
            "company": contact_details.get("company_website", "")
        },
        product={
            "fabric_id": "",
            "fabric_name": "",
            "category": rfq.get("category", ""),
            "quantity": requirements.get("quantity_meters") or requirements.get("quantity_kg", "")
        },
        details={
            "rfq_number": rfq.get("rfq_number", ""),
            "gst_number": contact_details.get("gst_number", ""),
            "message": contact_details.get("additional_message", ""),
            "requirements": requirements
        }
    )


async def send_order_to_zapier(order: dict):
    """Send order lead to Zapier"""
    
    shipping = order.get("shipping_address", {})
    items = order.get("items", [])
    first_item = items[0] if items else {}
    
    await send_to_zapier(
        lead_type="order",
        source="checkout",
        contact={
            "name": shipping.get("name", ""),
            "email": order.get("customer_email", ""),
            "phone": shipping.get("phone", ""),
            "company": shipping.get("company", "")
        },
        product={
            "fabric_id": first_item.get("fabric_id", ""),
            "fabric_name": first_item.get("fabric_name", ""),
            "category": "",
            "quantity": f"{first_item.get('quantity', '')} {first_item.get('unit', 'meters')}"
        },
        details={
            "order_number": order.get("order_number", ""),
            "order_type": first_item.get("order_type", ""),
            "total_amount": order.get("total_amount", 0),
            "payment_status": order.get("payment_status", ""),
            "items_count": len(items)
        }
    )
