"""
Credit Router — Credit applications, wallets, and balance management.
Extracted from server.py for maintainability.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from auth_helpers import get_current_admin
from datetime import datetime, timezone
import os
import uuid
import logging
import asyncio
import resend

router = APIRouter(tags=["credit"])
db = None

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
CREDIT_TEAM_EMAIL = os.environ.get("CREDIT_TEAM_EMAIL", "credit@locofast.com")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def set_db(database):
    global db
    db = database


def _build_credit_application_email(app_doc: dict) -> str:
    """HTML email sent to the credit team with applicant details + document download links."""
    ct_labels = {
        "proprietorship": "Sole Proprietorship",
        "partnership_llp": "Partnership / LLP",
        "pvt_ltd": "Private Limited",
    }
    ct = ct_labels.get(app_doc.get("company_type", ""), app_doc.get("company_type") or "—")

    docs_html = ""
    for d in app_doc.get("documents") or []:
        label = d.get("label", "")
        required = d.get("required")
        dtype = d.get("type", "upload")
        required_badge = '<span style="color:#dc2626;font-weight:600;">*</span>' if required else ""

        if dtype == "checkbox":
            status = "✓ Consented" if d.get("provided") else "✗ Not consented"
            body = f'<span style="color:#059669;">{status}</span>' if d.get("provided") else f'<span style="color:#94a3b8;">{status}</span>'
        else:
            files = d.get("files") or []
            if files:
                body = "<br>".join(
                    f'<a href="{f.get("url","")}" style="color:#2563eb;text-decoration:underline;">{f.get("name","file")}</a>'
                    for f in files
                )
            else:
                body = '<span style="color:#94a3b8;">No files uploaded</span>'

        docs_html += (
            f'<tr>'
            f'<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#334155;">{label} {required_badge}</td>'
            f'<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">{body}</td>'
            f'</tr>'
        )

    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background:#fff;">
      <div style="background: #059669; color: #fff; padding: 22px 28px; border-radius: 10px 10px 0 0;">
        <h2 style="margin:0; font-size: 20px;">New Credit Application</h2>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Submitted via locofast.com</p>
      </div>
      <div style="padding: 24px 28px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;">
        <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #0f172a;">Applicant</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 4px 0; color: #64748b; width: 150px;">Name</td><td style="padding: 4px 0; color: #0f172a;"><strong>{app_doc.get('name','')}</strong></td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="padding: 4px 0; color: #0f172a;"><strong>{app_doc.get('company','')}</strong></td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Company Type</td><td style="padding: 4px 0; color: #0f172a;">{ct}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Email</td><td style="padding: 4px 0; color: #0f172a;">{app_doc.get('email','')}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="padding: 4px 0; color: #0f172a;">{app_doc.get('phone','')}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">GST Number</td><td style="padding: 4px 0; color: #0f172a;">{app_doc.get('gst_number','') or '—'}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Turnover</td><td style="padding: 4px 0; color: #0f172a;">{app_doc.get('turnover','') or '—'}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Application ID</td><td style="padding: 4px 0; color: #0f172a; font-family: monospace; font-size: 12px;">{app_doc.get('id','')}</td></tr>
        </table>

        <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #0f172a;">Documents Submitted</h3>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 9px 10px; text-align: left; font-size: 12px; color: #475569; border-bottom: 1px solid #eee;">Document</th>
              <th style="padding: 9px 10px; text-align: left; font-size: 12px; color: #475569; border-bottom: 1px solid #eee;">Files / Status</th>
            </tr>
          </thead>
          <tbody>{docs_html}</tbody>
        </table>

        <p style="margin: 22px 0 0 0; color: #64748b; font-size: 12px;">
          Review at admin panel → Credit Applications, or call the applicant directly at {app_doc.get('phone','')}.
        </p>
      </div>
    </div>
    """


async def _send_credit_team_email(app_doc: dict):
    """Best-effort: email the credit team with the full application + document links."""
    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not configured — credit team email skipped.")
        return
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [CREDIT_TEAM_EMAIL],
            "reply_to": app_doc.get("email") or SENDER_EMAIL,
            "subject": f"New Credit Application — {app_doc.get('company','Unknown')} ({app_doc.get('turnover','—')})",
            "html": _build_credit_application_email(app_doc),
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Credit application email sent to {CREDIT_TEAM_EMAIL} for {app_doc.get('email')}")
    except Exception as e:
        logging.error(f"Failed to email credit team: {e}")


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
    app_doc.pop('_id', None)

    # Fire-and-forget: email the credit team with every uploaded file as a hyperlink
    asyncio.create_task(_send_credit_team_email(app_doc))

    # Push as a lead to campaigns (best effort)
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
async def get_credit_balance(gst_number: str = Query(...)):
    """Check credit wallet balance by business GSTIN.

    Credit lines are mapped to a legal entity (GST), not a personal email.
    Returns `has_credit=True` only when the wallet has a positive balance.
    """
    gstin = (gst_number or "").strip().upper()
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="Valid 15-character GSTIN is required")

    wallet = await db.credit_wallets.find_one({"gst_number": gstin}, {"_id": 0})
    if not wallet:
        return {
            "gst_number": gstin,
            "credit_limit": 0,
            "balance": 0,
            "has_credit": False,
            "credit_period_days": 30,
        }
    # Mask the authorized email so we can show it in the UI without
    # leaking the full address (e.g. "d***@locofast.com").
    raw_email = wallet.get("email", "") or ""
    masked = ""
    if raw_email and "@" in raw_email:
        local, domain = raw_email.split("@", 1)
        masked = (local[:1] + "***" + local[-1:] + "@" + domain) if len(local) >= 2 else (local + "***@" + domain)
    return {
        "gst_number": gstin,
        "company": wallet.get("company", ""),
        "credit_limit": wallet.get("credit_limit", 0),
        "balance": wallet.get("balance", 0),
        "has_credit": wallet.get("balance", 0) > 0,
        "authorized_email_masked": masked,
        "credit_period_days": int(wallet.get("credit_period_days", 30) or 30),
        # Full email is intentionally NOT returned to keep checkout PII-clean.
    }


@router.get("/credit/lookup-by-email")
async def lookup_wallet_by_email(email: str = Query(...)):
    """Resolve a credit wallet by buyer email to bootstrap auto-fill.

    Used by the checkout flow when a logged-in customer doesn't have a
    GSTIN stored on their profile but their email IS the authorized buyer
    on a credit wallet. We return the GSTIN + company so the form can
    auto-fill, then the regular `/credit/balance?gst_number=` flow takes
    over for actual balance display + ordering.

    Stays one-way (email → GST). The main balance endpoint remains
    GST-only — this one is purely a UX bootstrap helper.
    """
    e = (email or "").strip().lower()
    if not e or "@" not in e:
        raise HTTPException(status_code=400, detail="Valid email is required")
    wallet = await db.credit_wallets.find_one({"email": e}, {"_id": 0})
    if not wallet:
        return {"email": e, "found": False, "gst_number": "", "company": "", "credit_period_days": 30}
    return {
        "email": e,
        "found": True,
        "gst_number": wallet.get("gst_number", "") or "",
        "company": wallet.get("company", "") or "",
        "credit_period_days": int(wallet.get("credit_period_days", 30) or 30),
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
            # Mirror the GSTIN onto the wallet so credit can be looked up by
            # business GST during checkout (B2B credit lines map to a legal
            # entity, not a personal email).
            'gst_number': (app.get('gst_number') or '').strip().upper(),
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
