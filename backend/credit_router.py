"""
Credit Router — Credit applications, wallets, and balance management.
Extracted from server.py for maintainability.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from auth_helpers import get_current_admin
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter(tags=["credit"])
db = None

def set_db(database):
    global db
    db = database


@router.post("/credit/apply")
async def apply_for_credit(data: dict):
    """Submit a credit application."""
    name = data.get('name', '')
    email = data.get('email', '')
    phone = data.get('phone', '')
    company = data.get('company', '')
    turnover = data.get('turnover', '')
    gst_number = data.get('gst_number', '')
    message = data.get('message', '')
    company_type = data.get('company_type', '')
    documents = data.get('documents', [])

    if not name or not email or not phone or not company:
        raise HTTPException(status_code=400, detail='Name, email, phone, and company are required')

    application_id = str(uuid.uuid4())
    app_doc = {
        'id': application_id,
        'name': name,
        'email': email,
        'phone': phone,
        'company': company,
        'company_type': company_type,
        'turnover': turnover,
        'gst_number': gst_number,
        'message': message,
        'documents': documents,
        'status': 'pending',
        'credit_limit': 0,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.credit_applications.insert_one(app_doc)

    # Push as a lead to campaigns
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post('https://campaigns.locofast.com/api/leads', json={
                'name': name,
                'company': company,
                'email': email,
                'phone': phone,
                'company_type': 'Credit Application',
                'message': f"Type: {company_type}\nTurnover: {turnover}\nGST: {gst_number}\n{message}",
                'campaign': 'Credit Application',
            })
    except Exception as e:
        logging.warning(f"Failed to push credit application to campaigns: {str(e)}")

    return {'message': 'Credit application submitted successfully', 'id': application_id}


@router.get("/credit/balance")
async def get_credit_balance(email: str = Query(...)):
    """Check credit wallet balance for a customer by email."""
    wallet = await db.credit_wallets.find_one({'email': email}, {'_id': 0})
    if not wallet:
        return {'email': email, 'credit_limit': 0, 'balance': 0, 'has_credit': False}
    return {
        'email': email,
        'credit_limit': wallet.get('credit_limit', 0),
        'balance': wallet.get('balance', 0),
        'has_credit': wallet.get('balance', 0) > 0
    }


@router.get("/credit/applications")
async def get_credit_applications(admin=Depends(get_current_admin)):
    """Admin: list all credit applications."""
    apps = await db.credit_applications.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return apps


@router.put("/credit/applications/{app_id}/approve")
async def approve_credit_application(app_id: str, data: dict, admin=Depends(get_current_admin)):
    """Admin: approve a credit application and set credit limit."""
    credit_limit = data.get('credit_limit', 0)
    if credit_limit <= 0:
        raise HTTPException(status_code=400, detail='Credit limit must be positive')

    app = await db.credit_applications.find_one({'id': app_id}, {'_id': 0})
    if not app:
        raise HTTPException(status_code=404, detail='Application not found')

    await db.credit_applications.update_one({'id': app_id}, {'$set': {'status': 'approved', 'credit_limit': credit_limit}})

    await db.credit_wallets.update_one(
        {'email': app['email']},
        {'$set': {
            'email': app['email'],
            'name': app['name'],
            'company': app['company'],
            'credit_limit': credit_limit,
            'balance': credit_limit,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )

    return {'message': f'Credit approved for {app["company"]}'}


@router.put("/credit/applications/{app_id}/reject")
async def reject_credit_application(app_id: str, data: dict, admin=Depends(get_current_admin)):
    """Admin: reject a credit application."""
    reason = data.get('reason', 'Application does not meet criteria')
    result = await db.credit_applications.update_one(
        {'id': app_id},
        {'$set': {'status': 'rejected', 'rejection_reason': reason, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Application not found')
    return {'message': 'Application rejected'}
