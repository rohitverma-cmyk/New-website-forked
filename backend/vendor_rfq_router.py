"""
Vendor RFQ Router — vendor-side Pick Pool & Quote workflow.

Workflow simplification (May 2026):
- Dropped the intermediate "Pick" step. Tabs are now:
    All         → every eligible RFQ the vendor can act on
    Submitted   → their own submitted quotes
    Closed      → RFQs closed (won/lost/cancelled/auto-closed)
- Vendors can dismiss ("close") any RFQ for themselves without affecting
  other vendors' visibility.

Eligibility rules for an RFQ:
- Must match vendor's category_ids mapping.
- Shortfall RFQs have a 24 h lock to the source vendor (stored on the RFQ
  as vendor_lock_id / vendor_lock_expires_at). After expiry, visibility
  opens up to the source vendor PLUS the top-5 vendors in the same
  category ranked by inventory SKU count.

Collections:
- vendor_rfq_picks   (legacy; we still write to it when a quote is
                      submitted to keep reports compatible)
- vendor_quotes      (one quote per vendor per RFQ; re-submit upserts)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import jwt
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vendor/rfqs", tags=["vendor-rfqs"])
db = None
JWT_SECRET = os.environ.get("JWT_SECRET", "default-secret")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()


def set_db(database):
    global db
    db = database


# ==================== AUTH ====================
async def get_current_vendor(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "vendor":
            raise HTTPException(status_code=401, detail="Invalid token type")
        seller = await db.sellers.find_one(
            {"id": payload.get("seller_id"), "is_active": True},
            {"_id": 0, "password_hash": 0, "password": 0},
        )
        if not seller:
            raise HTTPException(status_code=401, detail="Vendor not found")
        return seller
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== CATEGORY MATCHING ====================
RFQ_CATEGORY_NAME_HINTS: Dict[str, List[str]] = {
    "cotton": ["cotton"],
    "viscose": ["viscose"],
    "denim": ["denim"],
    "knits": ["polyester"],
}


async def category_ids_for_rfq(rfq_category: str) -> List[str]:
    hints = RFQ_CATEGORY_NAME_HINTS.get((rfq_category or "").lower().strip(), [])
    if not hints:
        return []
    regex = "|".join(hints)
    rows = await db.categories.find(
        {"name": {"$regex": regex, "$options": "i"}}, {"_id": 0, "id": 1}
    ).to_list(50)
    return [r["id"] for r in rows]


def vendor_carries_rfq(seller_category_ids: List[str], eligible_ids: List[str]) -> bool:
    if not eligible_ids:
        return False
    return any(cid in (seller_category_ids or []) for cid in eligible_ids)


async def top_vendor_ids_for_category(category_ids: List[str], limit: int = 5) -> List[str]:
    """Top N active vendors in a category ranked by active SKU count."""
    if not category_ids:
        return []
    pipeline = [
        {"$match": {"category_id": {"$in": category_ids}, "is_active": True}},
        {"$group": {"_id": "$seller_id", "sku_count": {"$sum": 1}}},
        {"$sort": {"sku_count": -1}},
        {"$limit": limit},
    ]
    rows = await db.fabrics.aggregate(pipeline).to_list(limit)
    return [r["_id"] for r in rows if r.get("_id")]


async def vendor_blocked_by_shortfall_lock(rfq: dict, vendor_id: str) -> bool:
    """For shortfall RFQs:
      • During the 24 h lock: only the source vendor can see/act.
      • After expiry: source vendor + top-5 SKU-count vendors in the
        category can see. Everyone else stays blocked.
    Returns True when the vendor must NOT see this RFQ.
    """
    lock_holder = rfq.get("vendor_lock_id") or ""
    if not lock_holder:
        return False  # not a shortfall RFQ / no lock set
    if lock_holder == vendor_id:
        return False

    expires = rfq.get("vendor_lock_expires_at")
    if not expires:
        return False
    try:
        expires_dt = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
    except Exception:
        return False

    if datetime.now(timezone.utc) < expires_dt:
        # Still within the 24 h exclusive window
        return True

    # Lock expired — open to source vendor + top-5 SKU-count vendors
    eligible_ids = await category_ids_for_rfq(rfq.get("category", ""))
    top_ids = await top_vendor_ids_for_category(eligible_ids, limit=5)
    # lock_holder always allowed (already handled above), so we only
    # check the wider pool here.
    if vendor_id in top_ids:
        return False
    return True


# ==================== MODELS ====================
class QuoteSpecs(BaseModel):
    """Full finished-fabric specification attached to a quote.

    Required at quote-submit time: *nothing* in here — the only required
    fields are price/lead/basis on QuoteSubmit. Everything below is
    optional and surfaces progressively on the customer's comparison UI.
    """
    # Core construction
    fabric_type: Optional[str] = ""            # woven / knitted / non-woven
    weave_type: Optional[str] = ""
    pattern: Optional[str] = ""
    warp_count: Optional[str] = ""
    weft_count: Optional[str] = ""
    yarn_count: Optional[str] = ""
    reed: Optional[str] = ""
    pick: Optional[str] = ""
    construction: Optional[str] = ""
    width_inch: Optional[str] = ""
    width_type: Optional[str] = ""             # open width / circular (knits)
    loom: Optional[str] = ""
    gsm: Optional[str] = ""
    weight_oz: Optional[str] = ""
    weight_unit: Optional[str] = "GSM"
    # Knits / denim-specific
    knit_type: Optional[str] = ""
    denier: Optional[str] = ""
    stretch_pct: Optional[str] = ""
    weft_shrinkage_pct: Optional[str] = ""
    # Finishing / colour
    finish: Optional[str] = ""
    color: Optional[str] = ""
    # Admin-fabric-parity extras
    composition: List[Dict[str, Any]] = Field(default_factory=list)  # [{material, percentage}]
    certifications: List[str] = Field(default_factory=list)
    hsn_code: Optional[str] = ""
    seller_sku: Optional[str] = ""
    article_id: Optional[str] = ""
    description: Optional[str] = ""
    tags: Optional[str] = ""
    # Commercial
    moq: Optional[int] = None
    sample_price: Optional[float] = None
    pricing_tiers: List[Dict[str, Any]] = Field(default_factory=list)  # [{min, max, price}]
    dispatch_timeline: Optional[str] = ""
    sample_delivery_days: Optional[str] = ""
    bulk_delivery_days: Optional[str] = ""
    availability: List[str] = Field(default_factory=list)  # Sample / Bulk / On Request
    stock_type: Optional[str] = ""             # ready_stock / made_to_order
    quantity_available: Optional[int] = None
    # Images (URLs, already-uploaded via Cloudinary)
    image_urls: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""


class QuoteSubmit(BaseModel):
    price_per_meter: float = Field(..., gt=0)
    lead_days: int = Field(..., ge=1)
    basis: str = "x-factory"            # x-factory | door-delivered
    fabric_state: Optional[str] = "Greige"
    specs: QuoteSpecs = QuoteSpecs()
    sample_available: bool = False
    notes: Optional[str] = ""


class QuoteUpdate(BaseModel):
    price_per_meter: Optional[float] = None
    lead_days: Optional[int] = None
    basis: Optional[str] = None
    fabric_state: Optional[str] = None
    specs: Optional[QuoteSpecs] = None
    sample_available: Optional[bool] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ==================== HELPERS ====================
QUANTITY_BUCKET_LABELS = {
    "1000_5000": "1,000 – 5,000",
    "5000_20000": "5,000 – 20,000",
    "20000_50000": "20,000 – 50,000",
    "50000_plus": "50,000+",
    "1000_2500": "1,000 – 2,500",
    "2500_7500": "2,500 – 7,500",
    "7500_25000": "7,500 – 25,000",
    "25000_plus": "25,000+",
    "less_than_200": "< 200",
    "200_500": "200 – 500",
    "500_1000": "500 – 1,000",
    "1000_plus": "1,000+",
}


def _quantity_label(rfq: dict) -> str:
    """Humanise the stored quantity into a readable label.

    Priority:
      1. Exact numeric value + unit (new RFQ wizard)
      2. Bucketed range (legacy form / external API)
    """
    qv = rfq.get("quantity_value")
    qu = (rfq.get("quantity_unit") or "").lower()
    if qv and qu:
        try:
            n = float(qv)
            n_str = str(int(n)) if n.is_integer() else str(n)
            return f"{n_str} {qu}"
        except (TypeError, ValueError):
            pass
    cat = (rfq.get("category") or "").lower()
    is_kg = cat == "knits"
    raw = rfq.get("quantity_kg", "") if is_kg else rfq.get("quantity_meters", "")
    if not raw:
        # Knits sometimes use quantity_meters too; fall back gracefully
        raw = rfq.get("quantity_meters") or rfq.get("quantity_kg") or ""
    if not raw:
        return ""
    label = QUANTITY_BUCKET_LABELS.get(raw, raw.replace("_", " – "))
    return f"{label} {'kg' if is_kg else 'm'}"


async def _attach_vendor_state(rfq: dict, vendor_id: str) -> dict:
    quote = await db.vendor_quotes.find_one(
        {"rfq_id": rfq["id"], "vendor_id": vendor_id}, {"_id": 0}
    )
    rfq["my_quote"] = quote
    rfq["quantity_label"] = _quantity_label(rfq)
    return rfq


async def _vendor_effective_status(rfq: dict, vendor_id: str) -> str:
    """Single source of truth for the vendor-facing status of an RFQ.
    Values:
      submitted — vendor has a submitted quote on this RFQ
      closed    — RFQ globally closed/won, OR vendor has personally closed it
      all       — neither of the above (actionable pool)
    """
    # Personal dismissal
    closed_doc = await db.vendor_rfq_closures.find_one(
        {"rfq_id": rfq["id"], "vendor_id": vendor_id}, {"_id": 0}
    )
    if closed_doc:
        return "closed"
    if rfq.get("status") in ("closed", "won", "cancelled"):
        return "closed"
    quote = await db.vendor_quotes.find_one(
        {"rfq_id": rfq["id"], "vendor_id": vendor_id}, {"_id": 0, "status": 1}
    )
    if quote and quote.get("status") in ("submitted", "won"):
        return "submitted"
    return "all"


# ==================== ENDPOINTS ====================
@router.get("/stats")
async def vendor_rfq_stats(
    period: str = Query("7d", regex="^(today|yesterday|7d|30d)$"),
    vendor=Depends(get_current_vendor),
):
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "30d":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=7)

    seller_cats = vendor.get("category_ids", []) or []
    rfqs = await db.rfq_submissions.find(
        {"created_at": {"$gte": start.isoformat()}}, {"_id": 0}
    ).to_list(2000)

    eligible_rfq_ids = []
    cat_cache: Dict[str, List[str]] = {}
    for r in rfqs:
        c = r.get("category", "")
        if c not in cat_cache:
            cat_cache[c] = await category_ids_for_rfq(c)
        if not vendor_carries_rfq(seller_cats, cat_cache[c]):
            continue
        if await vendor_blocked_by_shortfall_lock(r, vendor["id"]):
            continue
        eligible_rfq_ids.append(r["id"])

    total = len(eligible_rfq_ids)
    if not eligible_rfq_ids:
        return {
            "period": period,
            "total_queries": 0,
            "answered_queries": 0,
            "unanswered_queries": 0,
            "orders_count": 0,
            "orders_value": 0,
            "samples_shared": 0,
        }

    answered = await db.vendor_quotes.count_documents(
        {"vendor_id": vendor["id"], "rfq_id": {"$in": eligible_rfq_ids},
         "status": {"$in": ["submitted", "won"]}}
    )
    samples = await db.vendor_quotes.count_documents(
        {"vendor_id": vendor["id"], "rfq_id": {"$in": eligible_rfq_ids}, "sample_available": True}
    )
    orders = await db.orders.find(
        {"source": "rfq", "rfq_id": {"$in": eligible_rfq_ids},
         "items.seller_id": vendor["id"]},
        {"_id": 0, "total": 1}
    ).to_list(500)
    return {
        "period": period,
        "total_queries": total,
        "answered_queries": answered,
        "unanswered_queries": max(total - answered, 0),
        "orders_count": len(orders),
        "orders_value": sum((o.get("total") or 0) for o in orders),
        "samples_shared": samples,
    }


@router.get("")
async def list_vendor_rfqs(
    status: str = Query("all", regex="^(all|submitted|closed)$"),
    limit: int = 50,
    skip: int = 0,
    vendor=Depends(get_current_vendor),
):
    """List RFQs for a vendor with new 3-tab model.
      all       → actionable pool (excludes submitted + closed)
      submitted → the vendor's submitted quotes
      closed    → RFQ closed globally OR dismissed by this vendor
    """
    seller_cats = vendor.get("category_ids", []) or []
    rfqs = await db.rfq_submissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    out: List[dict] = []
    cat_cache: Dict[str, List[str]] = {}
    for r in rfqs:
        c = r.get("category", "")
        if c not in cat_cache:
            cat_cache[c] = await category_ids_for_rfq(c)
        if not vendor_carries_rfq(seller_cats, cat_cache[c]):
            continue
        if await vendor_blocked_by_shortfall_lock(r, vendor["id"]):
            continue
        eff = await _vendor_effective_status(r, vendor["id"])
        if status == "all" and eff != "all":
            continue
        if status == "submitted" and eff != "submitted":
            continue
        if status == "closed" and eff != "closed":
            continue
        await _attach_vendor_state(r, vendor["id"])
        r["effective_status"] = eff
        out.append(r)

    return {
        "rfqs": out[skip : skip + limit],
        "total": len(out),
        "skip": skip,
        "limit": limit,
    }


@router.get("/{rfq_id}")
async def get_vendor_rfq_detail(rfq_id: str, vendor=Depends(get_current_vendor)):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    seller_cats = vendor.get("category_ids", []) or []
    eligible = await category_ids_for_rfq(rfq.get("category", ""))
    if not vendor_carries_rfq(seller_cats, eligible):
        raise HTTPException(status_code=403, detail="RFQ not in your pool")
    if await vendor_blocked_by_shortfall_lock(rfq, vendor["id"]):
        raise HTTPException(status_code=403, detail="RFQ is locked to the source vendor for 24 h")
    await _attach_vendor_state(rfq, vendor["id"])
    rfq["effective_status"] = await _vendor_effective_status(rfq, vendor["id"])
    return rfq


@router.post("/{rfq_id}/close")
async def close_vendor_rfq(rfq_id: str, vendor=Depends(get_current_vendor)):
    """Vendor-initiated 'not interested / close' — removes from their
    Actionable pool. Does NOT cancel the RFQ globally.
    """
    await db.vendor_rfq_closures.update_one(
        {"rfq_id": rfq_id, "vendor_id": vendor["id"]},
        {"$set": {
            "rfq_id": rfq_id,
            "vendor_id": vendor["id"],
            "closed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/{rfq_id}/close")
async def reopen_vendor_rfq(rfq_id: str, vendor=Depends(get_current_vendor)):
    await db.vendor_rfq_closures.delete_one({"rfq_id": rfq_id, "vendor_id": vendor["id"]})
    return {"ok": True}


@router.post("/{rfq_id}/quote")
async def submit_quote(rfq_id: str, data: QuoteSubmit, vendor=Depends(get_current_vendor)):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    seller_cats = vendor.get("category_ids", []) or []
    eligible = await category_ids_for_rfq(rfq.get("category", ""))
    if not vendor_carries_rfq(seller_cats, eligible):
        raise HTTPException(status_code=403, detail="RFQ not in your pool")
    if await vendor_blocked_by_shortfall_lock(rfq, vendor["id"]):
        raise HTTPException(status_code=403, detail="RFQ is locked to the source vendor for 24 h")

    # Record/refresh a pick row for analytics parity with earlier reports
    await db.vendor_rfq_picks.update_one(
        {"rfq_id": rfq_id, "vendor_id": vendor["id"]},
        {
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "rfq_id": rfq_id,
                "vendor_id": vendor["id"],
                "picked_at": datetime.now(timezone.utc).isoformat(),
            },
            "$set": {"status": "submitted"},
        },
        upsert=True,
    )

    now = datetime.now(timezone.utc).isoformat()
    quote_doc = {
        "id": str(uuid.uuid4()),
        "rfq_id": rfq_id,
        "rfq_number": rfq.get("rfq_number", ""),
        "vendor_id": vendor["id"],
        "vendor_company": vendor.get("company_name", ""),
        "vendor_code": vendor.get("seller_code", ""),
        "price_per_meter": data.price_per_meter,
        "lead_days": data.lead_days,
        "basis": data.basis,
        "fabric_state": data.fabric_state or "Greige",
        "specs": data.specs.model_dump(),
        "sample_available": data.sample_available,
        "notes": data.notes or "",
        "status": "submitted",
        "created_at": now,
        "updated_at": now,
    }

    existing = await db.vendor_quotes.find_one(
        {"rfq_id": rfq_id, "vendor_id": vendor["id"]}, {"_id": 0, "id": 1, "created_at": 1}
    )
    is_first_quote = existing is None
    if existing:
        await db.vendor_quotes.update_one(
            {"id": existing["id"]},
            {"$set": {**quote_doc, "id": existing["id"], "created_at": existing.get("created_at", now)}},
        )
        quote_doc["id"] = existing["id"]
    else:
        await db.vendor_quotes.insert_one(quote_doc)
        quote_doc.pop("_id", None)

    # Auto-undo personal closure so the RFQ returns to Submitted tab
    await db.vendor_rfq_closures.delete_one({"rfq_id": rfq_id, "vendor_id": vendor["id"]})

    # Email customer on new quote (best-effort)
    try:
        from email_router import send_quote_received_email
        import asyncio
        asyncio.create_task(send_quote_received_email(rfq, quote_doc, is_first=is_first_quote))
    except Exception as e:
        logger.warning(f"Failed to queue quote-received email: {str(e)}")

    return {"message": "Quote submitted", "quote": quote_doc}


@router.put("/quotes/{quote_id}")
async def edit_quote(quote_id: str, data: QuoteUpdate, vendor=Depends(get_current_vendor)):
    q = await db.vendor_quotes.find_one(
        {"id": quote_id, "vendor_id": vendor["id"]}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")

    update: Dict[str, Any] = {}
    payload = data.model_dump(exclude_none=True)
    if "specs" in payload and isinstance(payload["specs"], dict):
        update["specs"] = payload.pop("specs")
    update.update(payload)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.vendor_quotes.update_one({"id": quote_id}, {"$set": update})
    fresh = await db.vendor_quotes.find_one({"id": quote_id}, {"_id": 0})
    return {"message": "Quote updated", "quote": fresh}


# Legacy pick endpoint kept for backwards compatibility (any old clients)
@router.post("/{rfq_id}/pick")
async def pick_vendor_rfq(rfq_id: str, vendor=Depends(get_current_vendor)):
    """Legacy — the Pick step was dropped in favour of a direct submit.
    This endpoint now no-ops beyond ensuring a placeholder row exists.
    """
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    seller_cats = vendor.get("category_ids", []) or []
    eligible = await category_ids_for_rfq(rfq.get("category", ""))
    if not vendor_carries_rfq(seller_cats, eligible):
        raise HTTPException(status_code=403, detail="RFQ not in your pool")
    if await vendor_blocked_by_shortfall_lock(rfq, vendor["id"]):
        raise HTTPException(status_code=403, detail="RFQ is locked to the source vendor for 24 h")
    existing = await db.vendor_rfq_picks.find_one(
        {"rfq_id": rfq_id, "vendor_id": vendor["id"]}, {"_id": 0}
    )
    if existing:
        return {"message": "Already picked", "pick": existing}
    pick = {
        "id": str(uuid.uuid4()),
        "rfq_id": rfq_id,
        "vendor_id": vendor["id"],
        "status": "picked",
        "picked_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vendor_rfq_picks.insert_one(pick)
    pick.pop("_id", None)
    return {"message": "Picked", "pick": pick}
