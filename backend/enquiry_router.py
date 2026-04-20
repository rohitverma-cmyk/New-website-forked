"""
Enquiry Router — general enquiries, RFQ leads, and status management.
Includes the Zapier + campaigns.locofast.com push side-effects that the
old in-server.py implementation fired on create.
"""
import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

import auth_helpers

router = APIRouter(prefix="/api", tags=["enquiries"])
db = None


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class EnquiryCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    company: Optional[str] = ""
    message: str
    fabric_id: Optional[str] = None
    fabric_name: Optional[str] = None
    fabric_code: Optional[str] = None
    enquiry_type: Optional[str] = "general"
    source: Optional[str] = "website"


class Enquiry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = ""
    email: str = ""
    phone: str = ""
    company: str = ""
    message: str = ""
    fabric_id: Optional[str] = None
    fabric_name: Optional[str] = None
    fabric_code: Optional[str] = None
    enquiry_type: Optional[str] = "general"
    source: Optional[str] = "website"
    status: str = "new"
    created_at: str = ""


# ==================== ROUTES ====================

@router.post("/enquiries", response_model=Enquiry)
async def create_enquiry(data: EnquiryCreate):
    enquiry_id = str(uuid.uuid4())
    enquiry_doc = {
        'id': enquiry_id,
        **data.model_dump(),
        'status': 'new',
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.enquiries.insert_one(enquiry_doc)
    enquiry_doc.pop('_id', None)  # insert_one mutates the dict

    # Email notifications (best effort)
    try:
        from email_router import send_enquiry_emails
        asyncio.create_task(send_enquiry_emails(enquiry_doc))
    except Exception as e:
        logging.warning(f"Failed to queue enquiry emails: {str(e)}")

    # Zapier webhook (best effort)
    try:
        from zapier_webhook import send_enquiry_to_zapier
        asyncio.create_task(send_enquiry_to_zapier(enquiry_doc))
    except Exception as e:
        logging.warning(f"Failed to send to Zapier: {str(e)}")

    # Campaigns push (best effort)
    try:
        campaign_name = 'Vendor Signup' if enquiry_doc.get('enquiry_type') == 'supplier_signup' else 'Website RFQ'
        company_type = enquiry_doc.get('company_type', '')
        if not company_type:
            msg = enquiry_doc.get('message', '')
            if 'Fabric Categories:' in msg:
                cat_line = [ln for ln in msg.split('\n') if 'Fabric Categories:' in ln]
                if cat_line:
                    company_type = cat_line[0].split('Fabric Categories:')[-1].strip()
            if not company_type:
                company_type = 'Supplier' if enquiry_doc.get('enquiry_type') == 'supplier_signup' else 'Buyer'
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post('https://campaigns.locofast.com/api/leads', json={
                'name': enquiry_doc.get('name', ''),
                'company': enquiry_doc.get('company', ''),
                'email': enquiry_doc.get('email', ''),
                'phone': enquiry_doc.get('phone', ''),
                'company_type': company_type,
                'message': enquiry_doc.get('message', ''),
                'campaign': campaign_name,
            })
            logging.info(
                f"Enquiry pushed to campaigns admin: {enquiry_doc.get('name', '')} ({campaign_name})"
            )
    except Exception as e:
        logging.warning(f"Failed to push enquiry to campaigns: {str(e)}")

    return Enquiry(**enquiry_doc)


@router.get("/enquiries", response_model=List[Enquiry])
async def get_enquiries(admin=Depends(auth_helpers.get_current_admin)):
    enquiries = await db.enquiries.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return enquiries


@router.put("/enquiries/{enquiry_id}/status")
async def update_enquiry_status(
    enquiry_id: str,
    status: str = Query(...),
    admin=Depends(auth_helpers.get_current_admin),
):
    result = await db.enquiries.update_one({'id': enquiry_id}, {'$set': {'status': status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Enquiry not found')
    return {'message': 'Status updated'}


@router.delete("/enquiries/{enquiry_id}")
async def delete_enquiry(
    enquiry_id: str,
    admin=Depends(auth_helpers.get_current_admin),
):
    result = await db.enquiries.delete_one({'id': enquiry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Enquiry not found')
    return {'message': 'Enquiry deleted'}
