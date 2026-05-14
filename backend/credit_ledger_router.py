"""
Credit Ledger Router — Unified credit/ledger view for both standard (B2C)
and enterprise (B2B brand) buyers.

Four data streams feed `credit_disbursements`, `credit_payments`,
`credit_adjustments` + the per-lender summary `credit_lender_lines`:

  1) Disbursements CSV  → finance posts every new lender disbursement
                          (idempotent on `invoice_no`).
  2) Payments CSV       → NEFT/RTGS/Cheque/UPI/Cash repayments
                          (idempotent on `utr`).
  3) Razorpay webhook   → auto-recorded into `credit_payments` on the
                          existing `/api/orders/verify-payment` path
                          (see `record_razorpay_payment` helper).
  4) Manual Adjustments → Credit Notes / Debit Notes / Other corrections.
                          OTP-gated to `CREDIT_ADJUSTMENT_ADMIN_EMAIL`
                          (defaults to sandeep.kumar@locofast.com).

Read API: `/api/credit-ledger/by-gstin/{gstin}` returns the unified
{ totals, lenders, disbursements, payments, adjustments } payload
consumed by both Desktop /account and Mobile /m/account.
"""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import os
import io
import csv
import jwt
import random
import logging
import asyncio
import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/credit-ledger", tags=["credit-ledger"])
db = None


def set_db(database):
    global db
    db = database


# ==================== CONFIG ====================
JWT_SECRET = os.environ.get('JWT_SECRET', 'locofast-secret-key-change-me')
ADJUSTMENT_ADMIN_EMAIL = (os.environ.get('CREDIT_ADJUSTMENT_ADMIN_EMAIL') or 'sandeep.kumar@locofast.com').strip().lower()
OTP_EXPIRY_MINUTES = 10
ADJ_JWT_EXPIRY_HOURS = 4
SHEET_DISBURSEMENTS_ID = os.environ.get('SHEET_DISBURSEMENTS_ID', '').strip()
SHEET_PAYMENTS_ID = os.environ.get('SHEET_PAYMENTS_ID', '').strip()
SHEETS_SERVICE_ACCOUNT_JSON = os.environ.get('SHEETS_SERVICE_ACCOUNT_JSON', '').strip()
SHEETS_POLL_INTERVAL_SEC = int(os.environ.get('SHEETS_POLL_INTERVAL_SEC', '900') or 900)


# ==================== PARSING HELPERS ====================
def _clean_num(v: Any) -> Optional[float]:
    """Parse a CSV cell into a float. Handles ₹, commas, parentheses for negatives,
    `#REF!` errors, blanks. Returns None if not numeric."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s.startswith('#') or s.lower() in ('nan', 'none', 'null', '-'):
        return None
    s = s.replace('₹', '').replace(',', '').replace('Rs.', '').replace('Rs', '').strip()
    neg = False
    if s.startswith('(') and s.endswith(')'):
        s = s[1:-1]
        neg = True
    try:
        n = float(s)
        return -n if neg else n
    except (ValueError, TypeError):
        return None


def _clean_str(v: Any) -> str:
    if v is None:
        return ''
    return str(v).strip()


_MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def _clean_date(v: Any) -> Optional[str]:
    """Parse common date formats → ISO YYYY-MM-DD. Supports
    'DD-Mon-YY', 'DD-Mon-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', etc."""
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    # ISO already?
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return s
    # DD-Mon-YY / DD-Mon-YYYY
    m = re.match(r'^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$', s)
    if m:
        d, mon, y = m.group(1), m.group(2).lower()[:3], m.group(3)
        mi = _MONTHS.get(mon)
        if mi:
            yi = int(y)
            if yi < 100:
                yi += 2000
            try:
                return f"{yi:04d}-{mi:02d}-{int(d):02d}"
            except ValueError:
                return None
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$', s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return f"{y:04d}-{mo:02d}-{d:02d}"
        except ValueError:
            return None
    return None


def _norm_gst(v: Any) -> str:
    return _clean_str(v).upper().replace(' ', '')


def _norm_header(h: str) -> str:
    """Normalize CSV header to a canonical key."""
    s = (h or '').strip().lower().replace('.', '').replace('₹', '').replace('(', '').replace(')', '')
    s = re.sub(r'\s+', ' ', s)
    return s


# Maps from messy real-world headers → canonical internal keys
DISBURSEMENT_HEADER_MAP = {
    'client name': 'client_name',
    'client': 'client_name',
    'gst no': 'gst_number',
    'gst number': 'gst_number',
    'gst': 'gst_number',
    'gstin': 'gst_number',
    'lfb id': 'lfb_id',
    'lfb customer id': 'lfb_id',
    'client credit days': 'credit_period_days',
    'credit days': 'credit_period_days',
    'credit period': 'credit_period_days',
    'credit period days': 'credit_period_days',
    'limit': 'credit_limit',
    'credit limit': 'credit_limit',
    'disbursement date': 'disbursement_date',
    'disb date': 'disbursement_date',
    'inv no': 'invoice_no',
    'invoice no': 'invoice_no',
    'invoice number': 'invoice_no',
    'order id': 'order_id',
    'inv date': 'invoice_date',
    'invoice date': 'invoice_date',
    'inv amount': 'invoice_amount',
    'invoice amount': 'invoice_amount',
    'client adv': 'client_advance',
    'client advance': 'client_advance',
    'advance': 'client_advance',
    'client cn': 'credit_note_amount',
    'credit note': 'credit_note_amount',
    'disburse amount': 'disbursed_amount',
    'disbursed amount': 'disbursed_amount',
    'due date': 'due_date',
    'due date as per delivery': 'due_date',
    'amt repaid by client': 'amount_repaid',
    'amount repaid': 'amount_repaid',
    'amt repaid': 'amount_repaid',
    'pending repayments': 'pending_amount',
    'pending': 'pending_amount',
    'lendor': 'lender',
    'lender': 'lender',
    'notes': 'notes',
    'note': 'notes',
}

PAYMENT_HEADER_MAP = {
    'payment date': 'payment_date',
    'date': 'payment_date',
    'gst no': 'gst_number',
    'gstin': 'gst_number',
    'gst': 'gst_number',
    'client name': 'client_name',
    'client': 'client_name',
    'mode': 'mode',
    'payment mode': 'mode',
    'bank reference': 'utr',
    'utr no': 'utr',
    'utr': 'utr',
    'reference': 'utr',
    'reference / utr': 'utr',
    'amount': 'amount',
    'against invoice no': 'against_invoice_no',
    'against invoice': 'against_invoice_no',
    'invoice no': 'against_invoice_no',
    'against order id': 'against_order_id',
    'order id': 'against_order_id',
    'lender': 'lender',
    'payer bank name': 'payer_bank_name',
    'payer bank': 'payer_bank_name',
    'notes': 'notes',
}


def _parse_csv(file_bytes: bytes) -> List[Dict[str, str]]:
    """Tolerant CSV parser. Returns list of dicts using raw original headers."""
    text = file_bytes.decode('utf-8-sig', errors='ignore')
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        rows.append({k: v for k, v in r.items() if k is not None})
    return rows


def _remap_row(row: Dict[str, str], header_map: Dict[str, str]) -> Dict[str, Any]:
    """Translate a raw CSV row dict into canonical keys via header_map."""
    out = {}
    for k, v in row.items():
        nk = _norm_header(k)
        canon = header_map.get(nk)
        if canon and canon not in out:
            out[canon] = v
    return out


# ==================== INGESTION CORE ====================
async def _upsert_lender_line(gstin: str, lender: str, credit_limit: Optional[float], credit_period_days: Optional[int], client_name: Optional[str] = None):
    """Upsert per-(GSTIN, lender) limit row. Limit is only set when a numeric
    value is supplied (don't overwrite with None)."""
    if not gstin or not lender:
        return
    now = datetime.now(timezone.utc).isoformat()
    set_doc: Dict[str, Any] = {'updated_at': now, 'gst_number': gstin, 'lender': lender}
    setoninsert: Dict[str, Any] = {'created_at': now}
    if credit_limit is not None:
        set_doc['credit_limit'] = float(credit_limit)
    if credit_period_days is not None:
        set_doc['credit_period_days'] = int(credit_period_days)
    if client_name:
        set_doc['client_name'] = client_name
    await db.credit_lender_lines.update_one(
        {'gst_number': gstin, 'lender': lender},
        {'$set': set_doc, '$setOnInsert': setoninsert},
        upsert=True,
    )


async def _ingest_disbursement_row(canon: Dict[str, Any], source: str = 'csv') -> Dict[str, Any]:
    """Idempotent upsert of a single disbursement row keyed by invoice_no."""
    gstin = _norm_gst(canon.get('gst_number'))
    inv = _clean_str(canon.get('invoice_no'))
    lender = _clean_str(canon.get('lender'))
    if len(gstin) != 15:
        return {'ok': False, 'reason': 'GSTIN must be 15 chars', 'inv_no': inv}
    if not inv:
        return {'ok': False, 'reason': 'invoice_no missing'}
    if not lender:
        return {'ok': False, 'reason': 'lender missing', 'inv_no': inv}

    invoice_amount = _clean_num(canon.get('invoice_amount')) or 0.0
    advance = _clean_num(canon.get('client_advance')) or 0.0
    cn = _clean_num(canon.get('credit_note_amount')) or 0.0
    disbursed = _clean_num(canon.get('disbursed_amount'))
    if disbursed is None:
        disbursed = round(invoice_amount - advance - cn, 2)
    repaid = _clean_num(canon.get('amount_repaid')) or 0.0
    pending = _clean_num(canon.get('pending_amount'))
    if pending is None:
        pending = round(max(0.0, disbursed - repaid), 2)
    credit_limit = _clean_num(canon.get('credit_limit'))
    credit_period_days = None
    cpd_raw = _clean_num(canon.get('credit_period_days'))
    if cpd_raw is not None:
        cpd_int = int(round(cpd_raw))
        credit_period_days = cpd_int if cpd_int in (30, 60, 90) else cpd_int

    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    due = _clean_date(canon.get('due_date'))
    status = 'Repaid' if pending <= 0.5 else ('Overdue' if (due and due < today) else 'Outstanding')

    doc = {
        'gst_number': gstin,
        'client_name': _clean_str(canon.get('client_name')),
        'lfb_id': _clean_str(canon.get('lfb_id')),
        'lender': lender,
        'disbursement_date': _clean_date(canon.get('disbursement_date')),
        'invoice_no': inv,
        'order_id': _clean_str(canon.get('order_id')),
        'invoice_date': _clean_date(canon.get('invoice_date')),
        'invoice_amount': invoice_amount,
        'client_advance': advance,
        'credit_note_amount': cn,
        'disbursed_amount': disbursed,
        'due_date': due,
        'amount_repaid': repaid,
        'pending_amount': pending,
        'status': status,
        'notes': _clean_str(canon.get('notes')),
        'source': source,
        'updated_at': now,
    }
    await db.credit_disbursements.update_one(
        {'invoice_no': inv},
        {'$set': doc, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )
    await _upsert_lender_line(gstin, lender, credit_limit, credit_period_days, doc['client_name'])
    return {'ok': True, 'inv_no': inv, 'gst_number': gstin, 'lender': lender}


async def _ingest_payment_row(canon: Dict[str, Any], source: str = 'csv') -> Dict[str, Any]:
    """Idempotent upsert of a single payment row keyed by UTR."""
    gstin = _norm_gst(canon.get('gst_number'))
    utr = _clean_str(canon.get('utr'))
    amount = _clean_num(canon.get('amount')) or 0.0
    if len(gstin) != 15:
        return {'ok': False, 'reason': 'GSTIN must be 15 chars', 'utr': utr}
    if not utr:
        return {'ok': False, 'reason': 'UTR / reference missing'}
    if amount <= 0:
        return {'ok': False, 'reason': 'amount must be > 0', 'utr': utr}

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'gst_number': gstin,
        'client_name': _clean_str(canon.get('client_name')),
        'payment_date': _clean_date(canon.get('payment_date')) or now[:10],
        'mode': _clean_str(canon.get('mode')) or 'NEFT',
        'utr': utr,
        'amount': amount,
        'against_invoice_no': _clean_str(canon.get('against_invoice_no')),
        'against_order_id': _clean_str(canon.get('against_order_id')),
        'lender': _clean_str(canon.get('lender')),
        'payer_bank_name': _clean_str(canon.get('payer_bank_name')),
        'notes': _clean_str(canon.get('notes')),
        'source': source,
        'updated_at': now,
    }
    await db.credit_payments.update_one(
        {'utr': utr},
        {'$set': doc, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )
    # If pointed at an invoice, recompute that disbursement's repaid/pending
    if doc['against_invoice_no']:
        await _recompute_disbursement_repayment(doc['against_invoice_no'])
    return {'ok': True, 'utr': utr, 'gst_number': gstin}


async def _recompute_disbursement_repayment(invoice_no: str):
    """Recompute repaid/pending for one disbursement from all payments + CN/DN
    adjustments pointing at it."""
    inv = await db.credit_disbursements.find_one({'invoice_no': invoice_no}, {'_id': 0})
    if not inv:
        return
    pays = await db.credit_payments.find({'against_invoice_no': invoice_no}, {'_id': 0}).to_list(length=1000)
    adjs = await db.credit_adjustments.find({'against_invoice_no': invoice_no}, {'_id': 0}).to_list(length=1000)
    paid = sum(float(p.get('amount') or 0) for p in pays)
    # CN reduces what the buyer owes (treated as repayment-equivalent);
    # DN increases it (negative).
    adj_credit = sum(float(a.get('amount') or 0) for a in adjs)
    effective_repaid = round(paid + max(0.0, adj_credit), 2)
    disbursed = float(inv.get('disbursed_amount') or 0)
    pending = round(max(0.0, disbursed - effective_repaid - min(0.0, adj_credit)), 2)
    today = datetime.now(timezone.utc).date().isoformat()
    due = inv.get('due_date')
    status = 'Repaid' if pending <= 0.5 else ('Overdue' if (due and due < today) else 'Outstanding')
    await db.credit_disbursements.update_one(
        {'invoice_no': invoice_no},
        {'$set': {
            'amount_repaid': effective_repaid,
            'pending_amount': pending,
            'status': status,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }}
    )


# ==================== ADMIN — CSV UPLOAD ENDPOINTS ====================
@router.post('/admin/disbursements/upload-csv')
async def upload_disbursements_csv(file: UploadFile = File(...)):
    """Admin uploads the disbursements CSV (same format the user shared).
    Idempotent on invoice_no. Returns per-row outcome.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='Only .csv files are accepted')
    raw = await file.read()
    rows = _parse_csv(raw)
    if not rows:
        raise HTTPException(status_code=400, detail='CSV is empty or unreadable')
    results = {'total': len(rows), 'created_or_updated': 0, 'skipped': []}
    for idx, r in enumerate(rows, start=2):  # row 1 is header
        canon = _remap_row(r, DISBURSEMENT_HEADER_MAP)
        out = await _ingest_disbursement_row(canon, source='csv')
        if out['ok']:
            results['created_or_updated'] += 1
        else:
            results['skipped'].append({'row': idx, **out})
    return results


@router.post('/admin/payments/upload-csv')
async def upload_payments_csv(file: UploadFile = File(...)):
    """Admin uploads the NEFT/RTGS payments CSV. Idempotent on UTR."""
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail='Only .csv files are accepted')
    raw = await file.read()
    rows = _parse_csv(raw)
    if not rows:
        raise HTTPException(status_code=400, detail='CSV is empty or unreadable')
    results = {'total': len(rows), 'created_or_updated': 0, 'skipped': []}
    for idx, r in enumerate(rows, start=2):
        canon = _remap_row(r, PAYMENT_HEADER_MAP)
        out = await _ingest_payment_row(canon, source='csv')
        if out['ok']:
            results['created_or_updated'] += 1
        else:
            results['skipped'].append({'row': idx, **out})
    return results


# ==================== ADJUSTMENT OTP + POST ====================
class AdjustmentOTPRequest(BaseModel):
    email: str


class AdjustmentOTPVerify(BaseModel):
    email: str
    otp: str


class AdjustmentPost(BaseModel):
    gst_number: str
    type: str  # 'Credit Note' | 'Debit Note' | 'Other'
    reference_no: str
    amount: float  # signed (CN positive, DN negative)
    against_invoice_no: Optional[str] = ''
    against_order_id: Optional[str] = ''
    lender: Optional[str] = ''
    reason: str
    attachment_url: Optional[str] = ''


def _get_adj_user(request: Request) -> str:
    """Extract & verify the adjustment-scoped JWT issued by /adjustments/verify-otp."""
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Adjustment OTP token required')
    try:
        payload = jwt.decode(auth.split(' ', 1)[1], JWT_SECRET, algorithms=['HS256'])
        if payload.get('scope') != 'credit_adjustment':
            raise HTTPException(status_code=403, detail='Token not authorised for adjustments')
        email = (payload.get('email') or '').strip().lower()
        if email != ADJUSTMENT_ADMIN_EMAIL:
            raise HTTPException(status_code=403, detail='Email not authorised')
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Adjustment session expired — please re-verify OTP')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')


@router.post('/admin/adjustments/send-otp')
async def adj_send_otp(data: AdjustmentOTPRequest):
    """Send a 6-digit OTP. Only the configured admin email is accepted."""
    email = (data.email or '').strip().lower()
    if email != ADJUSTMENT_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail='Only the credit-adjustment admin may request this OTP.')
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=10)).isoformat()
    recent = await db.credit_adjustment_otps.count_documents({'email': email, 'created_at': {'$gte': cutoff}})
    if recent >= 5:
        raise HTTPException(status_code=429, detail='Too many OTP requests — try again in a few minutes.')
    code = str(random.randint(100000, 999999))
    await db.credit_adjustment_otps.insert_one({
        'email': email,
        'otp': code,
        'used': False,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
    })
    # Reuse the Resend setup from customer_router (lazy import to avoid circularity)
    try:
        import resend  # noqa: F401
        RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
        SENDER_EMAIL = os.environ.get('RESEND_FROM_EMAIL') or os.environ.get('SENDER_EMAIL') or 'no-reply@locofast.com'
        if RESEND_API_KEY:
            import resend as resend_mod
            resend_mod.api_key = RESEND_API_KEY
            params = {
                'from': f'Locofast <{SENDER_EMAIL}>',
                'to': [email],
                'subject': f'Credit Adjustment OTP: {code}',
                'html': f"""
                <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                    <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 8px;">Credit Adjustment Access</h2>
                    <p style="color: #64748b; margin: 0 0 24px;">Use this OTP to post a credit/debit-note adjustment:</p>
                    <div style="background: #fef3c7; border: 2px solid #fde68a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 16px;">
                        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #78350f;">{code}</span>
                    </div>
                    <p style="color: #94a3b8; font-size: 13px;">Valid for {OTP_EXPIRY_MINUTES} minutes. Adjustments are signed in your name — only proceed if you intended this.</p>
                </div>
                """,
            }
            await asyncio.to_thread(resend_mod.Emails.send, params)
            logger.info(f'Credit-adjustment OTP sent to {email}')
        else:
            logger.warning(f'[no RESEND_API_KEY] credit-adjustment OTP for {email}: {code}')
    except Exception as e:
        logger.error(f'Failed to send adjustment OTP: {e}')
        # Still return success — code is stored; in dev log shows it.
    return {'message': 'OTP sent', 'email': email}


@router.post('/admin/adjustments/verify-otp')
async def adj_verify_otp(data: AdjustmentOTPVerify):
    email = (data.email or '').strip().lower()
    if email != ADJUSTMENT_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail='Email not authorised')
    now = datetime.now(timezone.utc)
    doc = await db.credit_adjustment_otps.find_one({
        'email': email,
        'otp': data.otp,
        'used': False,
        'expires_at': {'$gte': now.isoformat()},
    })
    if not doc:
        raise HTTPException(status_code=400, detail='Invalid or expired OTP')
    await db.credit_adjustment_otps.update_one({'_id': doc['_id']}, {'$set': {'used': True}})
    token = jwt.encode({
        'email': email,
        'scope': 'credit_adjustment',
        'exp': now + timedelta(hours=ADJ_JWT_EXPIRY_HOURS),
    }, JWT_SECRET, algorithm='HS256')
    return {'token': token, 'email': email, 'expires_in_hours': ADJ_JWT_EXPIRY_HOURS}


@router.post('/admin/adjustments/post')
async def adj_post(payload: AdjustmentPost, request: Request):
    posted_by = _get_adj_user(request)
    gstin = _norm_gst(payload.gst_number)
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail='GSTIN must be 15 chars')
    if payload.type not in ('Credit Note', 'Debit Note', 'Other'):
        raise HTTPException(status_code=400, detail='Type must be Credit Note / Debit Note / Other')
    ref = (payload.reference_no or '').strip()
    if not ref:
        raise HTTPException(status_code=400, detail='Reference No is required')
    # Idempotent on reference_no
    existing = await db.credit_adjustments.find_one({'reference_no': ref}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=409, detail=f'Reference {ref} already posted — adjustments are immutable.')
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'gst_number': gstin,
        'type': payload.type,
        'reference_no': ref,
        'amount': float(payload.amount),
        'against_invoice_no': (payload.against_invoice_no or '').strip(),
        'against_order_id': (payload.against_order_id or '').strip(),
        'lender': (payload.lender or '').strip(),
        'reason': payload.reason.strip(),
        'attachment_url': (payload.attachment_url or '').strip(),
        'posted_by': posted_by,
        'created_at': now,
        'updated_at': now,
    }
    await db.credit_adjustments.insert_one(doc.copy())
    if doc['against_invoice_no']:
        await _recompute_disbursement_repayment(doc['against_invoice_no'])
    return {'ok': True, 'reference_no': ref}


# ==================== READ — UNIFIED LEDGER ====================
@router.get('/by-gstin/{gstin}')
async def ledger_by_gstin(gstin: str):
    """Returns the unified ledger payload consumed by /account & /m/account."""
    gst = _norm_gst(gstin)
    if len(gst) != 15:
        raise HTTPException(status_code=400, detail='GSTIN must be 15 chars')

    lenders = await db.credit_lender_lines.find({'gst_number': gst}, {'_id': 0}).sort('created_at', 1).to_list(length=50)
    disbursements = await db.credit_disbursements.find({'gst_number': gst}, {'_id': 0}).sort('disbursement_date', -1).to_list(length=2000)
    payments = await db.credit_payments.find({'gst_number': gst}, {'_id': 0}).sort('payment_date', -1).to_list(length=2000)
    adjustments = await db.credit_adjustments.find({'gst_number': gst}, {'_id': 0}).sort('created_at', -1).to_list(length=2000)
    # Compute utilised per lender = open disbursements (pending > 0)
    lender_utilised: Dict[str, float] = {}
    for d in disbursements:
        if d.get('pending_amount', 0) > 0:
            lender_utilised[d.get('lender', '')] = lender_utilised.get(d.get('lender', ''), 0) + float(d.get('pending_amount', 0))
    enriched_lenders = []
    for ln in lenders:
        lim = float(ln.get('credit_limit') or 0)
        util = round(lender_utilised.get(ln.get('lender', ''), 0), 2)
        enriched_lenders.append({
            **ln,
            'utilized': util,
            'available': round(max(0.0, lim - util), 2),
        })

    # Fallback to legacy `credit_wallets` if no new-format lender lines yet.
    if not enriched_lenders:
        wallet = await db.credit_wallets.find_one({'gst_number': gst}, {'_id': 0})
        if wallet:
            lim = float(wallet.get('credit_limit') or 0)
            bal = float(wallet.get('balance') or 0)
            enriched_lenders = [{
                'gst_number': gst,
                'lender': wallet.get('lender') or 'Locofast',
                'credit_limit': lim,
                'credit_period_days': int(wallet.get('credit_period_days') or 30),
                'utilized': round(max(0.0, lim - bal), 2),
                'available': bal,
                'client_name': wallet.get('company') or wallet.get('name', ''),
            }]

    totals_limit = sum(float(ln.get('credit_limit') or 0) for ln in enriched_lenders)
    totals_util = sum(float(ln.get('utilized') or 0) for ln in enriched_lenders)
    today = datetime.now(timezone.utc).date().isoformat()
    overdue = sum(float(d.get('pending_amount') or 0) for d in disbursements if d.get('pending_amount', 0) > 0 and d.get('due_date') and d['due_date'] < today)

    return {
        'gst_number': gst,
        'client_name': (enriched_lenders[0].get('client_name') if enriched_lenders else ''),
        'totals': {
            'limit': round(totals_limit, 2),
            'utilized': round(totals_util, 2),
            'available': round(max(0.0, totals_limit - totals_util), 2),
            'overdue': round(overdue, 2),
        },
        'lenders': enriched_lenders,
        'disbursements': disbursements,
        'payments': payments,
        'adjustments': adjustments,
    }


# ==================== RAZORPAY AUTO-RECORD HOOK ====================
async def record_razorpay_payment(order: Dict[str, Any], payment_id: str):
    """Called from orders_router.verify_payment on successful Razorpay
    payment. Records the payment into credit_payments (idempotent on the
    razorpay payment_id used as UTR).

    Designed to be best-effort: never raises into the caller.
    """
    try:
        gstin = _norm_gst((order.get('customer') or {}).get('gst_number'))
        amount = float(order.get('total') or 0)
        if len(gstin) != 15 or amount <= 0:
            return
        utr = f'razorpay:{payment_id}'
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            'gst_number': gstin,
            'client_name': (order.get('customer') or {}).get('name', ''),
            'payment_date': now[:10],
            'mode': 'Razorpay',
            'utr': utr,
            'amount': amount,
            'against_invoice_no': order.get('order_number', ''),
            'against_order_id': order.get('order_number', ''),
            'lender': 'Locofast',
            'payer_bank_name': '',
            'notes': 'Auto-recorded from Razorpay payment-verify',
            'source': 'razorpay-webhook',
            'updated_at': now,
        }
        await db.credit_payments.update_one(
            {'utr': utr},
            {'$set': doc, '$setOnInsert': {'created_at': now}},
            upsert=True,
        )
        logger.info(f'Razorpay payment {payment_id} auto-recorded into credit_payments')
    except Exception as e:
        logger.warning(f'record_razorpay_payment failed: {e}')


# ==================== GOOGLE SHEETS POLLING (stub) ====================
async def _poll_google_sheets_once():
    """Pulls both Sheet 1 (disbursements) and Sheet 2 (payments) once.
    No-op unless `SHEETS_SERVICE_ACCOUNT_JSON` + sheet IDs are configured.
    """
    if not (SHEETS_SERVICE_ACCOUNT_JSON and (SHEET_DISBURSEMENTS_ID or SHEET_PAYMENTS_ID)):
        return  # silently skip — no credentials yet
    try:
        import json as _json
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        info = _json.loads(SHEETS_SERVICE_ACCOUNT_JSON)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
        )
        service = await asyncio.to_thread(build, 'sheets', 'v4', credentials=creds, cache_discovery=False)

        async def _read(sid: str) -> List[Dict[str, str]]:
            if not sid:
                return []
            resp = await asyncio.to_thread(
                lambda: service.spreadsheets().values().get(spreadsheetId=sid, range='A:Z').execute()
            )
            values = resp.get('values', [])
            if len(values) < 2:
                return []
            headers = values[0]
            rows = []
            for v in values[1:]:
                rows.append({h: (v[i] if i < len(v) else '') for i, h in enumerate(headers)})
            return rows

        d_rows = await _read(SHEET_DISBURSEMENTS_ID)
        for r in d_rows:
            canon = _remap_row(r, DISBURSEMENT_HEADER_MAP)
            await _ingest_disbursement_row(canon, source='gsheet')

        p_rows = await _read(SHEET_PAYMENTS_ID)
        for r in p_rows:
            canon = _remap_row(r, PAYMENT_HEADER_MAP)
            await _ingest_payment_row(canon, source='gsheet')

        logger.info(f'[sheets-poll] disbursements rows={len(d_rows)} payments rows={len(p_rows)}')
    except Exception as e:
        logger.error(f'[sheets-poll] failed: {e}')


async def start_sheets_poller():
    """Background loop. Started from server.py on startup."""
    if not SHEETS_SERVICE_ACCOUNT_JSON:
        logger.info('[sheets-poll] disabled — SHEETS_SERVICE_ACCOUNT_JSON not set')
        return
    logger.info(f'[sheets-poll] starting · interval={SHEETS_POLL_INTERVAL_SEC}s')
    while True:
        await _poll_google_sheets_once()
        await asyncio.sleep(max(60, SHEETS_POLL_INTERVAL_SEC))


# Manual trigger endpoint (admin-only sanity)
@router.post('/admin/sheets/poll-now')
async def trigger_poll_now():
    if not SHEETS_SERVICE_ACCOUNT_JSON:
        raise HTTPException(status_code=400, detail='Google Sheets not configured — set SHEETS_SERVICE_ACCOUNT_JSON + SHEET_DISBURSEMENTS_ID / SHEET_PAYMENTS_ID in .env')
    await _poll_google_sheets_once()
    return {'ok': True}
