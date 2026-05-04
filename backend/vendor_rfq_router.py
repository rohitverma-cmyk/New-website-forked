"""
Vendor RFQ Router — vendor-side Pick Pool & Quote workflow.

Customer RFQs are created via /api/rfq/submit. Each RFQ has a category
("cotton" | "viscose" | "denim" | "knits"). This router lets a logged-in
vendor:

  - See all RFQs whose category matches at least one of the vendor's
    `category_ids` (Pick Pool)
  - Pick an RFQ into their personal pipeline (no exclusivity — others
    can still pick & quote)
  - Submit / edit a Quote (price, lead-days, delivery basis,
    finished-fabric specs)
  - View Business Overview stats for a configurable date window

Collections introduced:
  - vendor_rfq_picks    {id, rfq_id, vendor_id, status, picked_at, ...}
  - vendor_quotes       {id, rfq_id, vendor_id, price_per_meter, lead_days,
                         basis, specs, status, ...}

`category_ids` on a seller already gates eligibility — when an RFQ's
category resolves to a category_id the vendor doesn't carry, the RFQ is
hidden from their pool.
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
# RFQ stores `category` as a slug ("cotton"/"viscose"/"denim"/"knits"). We
# need to translate it to one or more category_ids from the categories
# collection. Knits was merged into Polyester (Phase 22), so any "knits"
# RFQ routes to vendors who carry Polyester.
RFQ_CATEGORY_NAME_HINTS: Dict[str, List[str]] = {
    "cotton": ["cotton"],
    "viscose": ["viscose"],
    "denim": ["denim"],
    "knits": ["polyester"],
}


async def category_ids_for_rfq(rfq_category: str) -> List[str]:
    """Return all category_ids whose name matches the RFQ category hint."""
    hints = RFQ_CATEGORY_NAME_HINTS.get((rfq_category or "").lower().strip(), [])
    if not hints:
        return []
    # Build regex OR across all hints
    regex = "|".join(hints)
    rows = await db.categories.find(
        {"name": {"$regex": regex, "$options": "i"}}, {"_id": 0, "id": 1}
    ).to_list(50)
    return [r["id"] for r in rows]


def vendor_carries_rfq(seller_category_ids: List[str], eligible_ids: List[str]) -> bool:
    if not eligible_ids:
        return False
    return any(cid in (seller_category_ids or []) for cid in eligible_ids)


# ==================== MODELS ====================
class QuoteSpecs(BaseModel):
    warp_count: Optional[str] = ""
    weft_count: Optional[str] = ""
    reed: Optional[str] = ""
    pick: Optional[str] = ""
    width_inch: Optional[str] = ""
    loom: Optional[str] = ""
    gsm: Optional[str] = ""
    finish: Optional[str] = ""
    notes: Optional[str] = ""


class QuoteSubmit(BaseModel):
    price_per_meter: float = Field(..., gt=0)
    lead_days: int = Field(..., ge=1)
    basis: str = "x-factory"  # x-factory | door-delivered
    fabric_state: Optional[str] = "Greige"  # Greige | Dyed | RFD | Printed
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
    status: Optional[str] = None  # draft | submitted


# ==================== HELPERS ====================
def _quantity_label(rfq: dict) -> str:
    """Human-readable quantity ('12,300 m' / '500 kg')."""
    if rfq.get("category") == "knits":
        v = rfq.get("quantity_kg", "")
        return f"{v} kg" if v else ""
    v = rfq.get("quantity_meters", "")
    return f"{v} m" if v else ""


async def _enrich_rfq_for_vendor(rfq: dict, vendor_id: str) -> dict:
    """Attach pick-state + my-quote summary to an RFQ doc."""
    pick = await db.vendor_rfq_picks.find_one(
        {"rfq_id": rfq["id"], "vendor_id": vendor_id}, {"_id": 0}
    )
    quote = await db.vendor_quotes.find_one(
        {"rfq_id": rfq["id"], "vendor_id": vendor_id}, {"_id": 0}
    )
    rfq["my_pick_status"] = (pick or {}).get("status", "pool")
    rfq["my_quote"] = quote
    rfq["quantity_label"] = _quantity_label(rfq)
    return rfq


async def _vendor_status(rfq_id: str, vendor_id: str) -> str:
    """Resolve the effective vendor-facing status for a single RFQ."""
    quote = await db.vendor_quotes.find_one(
        {"rfq_id": rfq_id, "vendor_id": vendor_id}, {"_id": 0, "status": 1}
    )
    if quote and quote.get("status") == "submitted":
        return "submitted"
    pick = await db.vendor_rfq_picks.find_one(
        {"rfq_id": rfq_id, "vendor_id": vendor_id}, {"_id": 0, "status": 1}
    )
    return (pick or {}).get("status", "pool")


# ==================== ENDPOINTS ====================
@router.get("/stats")
async def vendor_rfq_stats(
    period: str = Query("7d", regex="^(today|yesterday|7d|30d)$"),
    vendor=Depends(get_current_vendor),
):
    """Business Overview counts for the current vendor."""
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "30d":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=7)

    # Eligible RFQ ids for this vendor in the window
    seller_cats = vendor.get("category_ids", []) or []
    rfqs = await db.rfq_submissions.find(
        {"created_at": {"$gte": start.isoformat()}}, {"_id": 0, "id": 1, "category": 1}
    ).to_list(2000)
    eligible_rfq_ids = []
    cat_cache: Dict[str, List[str]] = {}
    for r in rfqs:
        c = r.get("category", "")
        if c not in cat_cache:
            cat_cache[c] = await category_ids_for_rfq(c)
        if vendor_carries_rfq(seller_cats, cat_cache[c]):
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
        {"vendor_id": vendor["id"], "rfq_id": {"$in": eligible_rfq_ids}, "status": "submitted"}
    )
    samples = await db.vendor_quotes.count_documents(
        {"vendor_id": vendor["id"], "rfq_id": {"$in": eligible_rfq_ids}, "sample_available": True}
    )
    return {
        "period": period,
        "total_queries": total,
        "answered_queries": answered,
        "unanswered_queries": max(total - answered, 0),
        "orders_count": 0,  # Phase B will wire orders
        "orders_value": 0,
        "samples_shared": samples,
    }


@router.get("")
async def list_vendor_rfqs(
    status: str = Query("all", regex="^(all|new|picked|submitted|closed)$"),
    limit: int = 50,
    skip: int = 0,
    vendor=Depends(get_current_vendor),
):
    """List RFQs in this vendor's Pick Pool, filtered by status."""
    seller_cats = vendor.get("category_ids", []) or []

    rfqs = await db.rfq_submissions.find(
        {"status": {"$ne": "closed"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(2000)

    out: List[dict] = []
    cat_cache: Dict[str, List[str]] = {}
    for r in rfqs:
        c = r.get("category", "")
        if c not in cat_cache:
            cat_cache[c] = await category_ids_for_rfq(c)
        if not vendor_carries_rfq(seller_cats, cat_cache[c]):
            continue
        eff = await _vendor_status(r["id"], vendor["id"])
        if status == "new" and eff != "pool":
            continue
        if status == "picked" and eff != "picked":
            continue
        if status == "submitted" and eff != "submitted":
            continue
        if status == "closed" and eff != "closed":
            continue
        await _enrich_rfq_for_vendor(r, vendor["id"])
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
    await _enrich_rfq_for_vendor(rfq, vendor["id"])
    rfq["effective_status"] = await _vendor_status(rfq_id, vendor["id"])
    return rfq


@router.post("/{rfq_id}/pick")
async def pick_vendor_rfq(rfq_id: str, vendor=Depends(get_current_vendor)):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    seller_cats = vendor.get("category_ids", []) or []
    eligible = await category_ids_for_rfq(rfq.get("category", ""))
    if not vendor_carries_rfq(seller_cats, eligible):
        raise HTTPException(status_code=403, detail="RFQ not in your pool")

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


@router.post("/{rfq_id}/quote")
async def submit_quote(rfq_id: str, data: QuoteSubmit, vendor=Depends(get_current_vendor)):
    rfq = await db.rfq_submissions.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    seller_cats = vendor.get("category_ids", []) or []
    eligible = await category_ids_for_rfq(rfq.get("category", ""))
    if not vendor_carries_rfq(seller_cats, eligible):
        raise HTTPException(status_code=403, detail="RFQ not in your pool")

    # Ensure pick exists (auto-pick if vendor jumps straight to quote)
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

    # If quote already exists, update it instead of inserting a duplicate
    existing = await db.vendor_quotes.find_one(
        {"rfq_id": rfq_id, "vendor_id": vendor["id"]}, {"_id": 0, "id": 1}
    )
    if existing:
        await db.vendor_quotes.update_one(
            {"id": existing["id"]},
            {"$set": {**quote_doc, "id": existing["id"], "created_at": existing.get("created_at", now)}},
        )
        quote_doc["id"] = existing["id"]
    else:
        await db.vendor_quotes.insert_one(quote_doc)
        quote_doc.pop("_id", None)
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
