"""
Customer Queries Router — customer-side view of their RFQs + the
vendor quotes they've received + the conversion to an order.

The conversion path is intentionally customer-driven (not admin):
  Customer submits RFQ via `/api/rfq/submit` (already wires customer_id
  if a Bearer customer token is present)
    → many vendors see it in their pool and submit quotes via
      `/api/vendor/rfqs/{rfq_id}/quote`
    → customer compares received quotes here
    → customer picks one and POSTs to /place-order on that quote
      → order is created with `source: "rfq"`, linked to the rfq +
        winning quote + vendor; Razorpay flow continues as usual.
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customer/queries", tags=["customer-queries"])
db = None


def set_db(database):
    global db
    db = database


# ==================== AUTH ====================
def _get_customer(request: Request) -> dict:
    from customer_router import get_current_customer
    return get_current_customer(request)


# ==================== HELPERS ====================
def _quantity_label(rfq: dict) -> str:
    if rfq.get("category") == "knits":
        v = rfq.get("quantity_kg", "")
        return f"{v} kg" if v else ""
    v = rfq.get("quantity_meters", "")
    return f"{v} m" if v else ""


async def _attach_quotes_summary(rfq: dict) -> dict:
    quotes = await db.vendor_quotes.find(
        {"rfq_id": rfq["id"], "status": "submitted"}, {"_id": 0}
    ).sort("price_per_meter", 1).to_list(50)
    rfq["quotes_count"] = len(quotes)
    rfq["best_quote"] = quotes[0] if quotes else None
    rfq["quantity_label"] = _quantity_label(rfq)
    return rfq


# ==================== MODELS ====================
class PlaceOrderFromQuote(BaseModel):
    quantity: int  # meters (or kg) — frozen at order time
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    company: Optional[str] = ""
    gst_number: Optional[str] = ""
    notes: Optional[str] = ""
    payment_method: str = "razorpay"  # razorpay | credit


# ==================== ENDPOINTS ====================
@router.get("")
async def list_my_queries(
    request: Request,
    status: str = "received",
    limit: int = 50,
    skip: int = 0,
):
    """
    status:
      - received   → customer's RFQs that have ≥1 submitted quote
      - not_received → customer's RFQs with no quotes yet
      - closed     → status=closed on the RFQ
    """
    cust = _get_customer(request)
    cust_id = cust.get("customer_id")

    base = {"customer_id": cust_id}
    if status == "closed":
        base["status"] = "closed"
    rfqs = await db.rfq_submissions.find(base, {"_id": 0}).sort("created_at", -1).to_list(2000)

    out: List[dict] = []
    for r in rfqs:
        await _attach_quotes_summary(r)
        if status == "received" and r["quotes_count"] == 0:
            continue
        if status == "not_received" and r["quotes_count"] > 0:
            continue
        out.append(r)

    return {
        "queries": out[skip : skip + limit],
        "total": len(out),
        "skip": skip,
        "limit": limit,
    }


@router.get("/{rfq_id}")
async def get_my_query_detail(rfq_id: str, request: Request):
    cust = _get_customer(request)
    rfq = await db.rfq_submissions.find_one(
        {"id": rfq_id, "customer_id": cust.get("customer_id")}, {"_id": 0}
    )
    if not rfq:
        raise HTTPException(status_code=404, detail="Query not found")
    quotes = await db.vendor_quotes.find(
        {"rfq_id": rfq_id, "status": "submitted"}, {"_id": 0}
    ).sort("price_per_meter", 1).to_list(50)

    # Stamp Best Price flag on the cheapest quote (rate per unit)
    if quotes:
        quotes[0]["is_best_price"] = True

    rfq["quotes"] = quotes
    rfq["quantity_label"] = _quantity_label(rfq)
    return rfq


@router.post("/quotes/{quote_id}/place-order")
async def place_order_from_quote(
    quote_id: str,
    payload: PlaceOrderFromQuote,
    request: Request,
):
    """Convert a vendor quote into an order. Delegates to orders_router.create_order
    so all downstream side-effects (commission, Razorpay, emails, ledger) stay
    in one place.
    """
    cust = _get_customer(request)
    cust_id = cust.get("customer_id")

    quote = await db.vendor_quotes.find_one({"id": quote_id, "status": "submitted"}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    rfq = await db.rfq_submissions.find_one(
        {"id": quote["rfq_id"], "customer_id": cust_id}, {"_id": 0}
    )
    if not rfq:
        raise HTTPException(status_code=403, detail="Quote does not belong to your query")

    customer = await db.customers.find_one({"id": cust_id}, {"_id": 0}) or {}

    # Build an OrderCreate-compatible dict and call create_order directly so
    # we reuse the (battle-tested) Razorpay + credit + commission code paths.
    from orders_router import create_order, OrderCreate, OrderItem, CustomerInfo

    item = OrderItem(
        fabric_id=f"rfq-{rfq['id']}",  # synthetic id; not a catalog SKU
        fabric_name=f"{rfq.get('category', 'Fabric').title()} {rfq.get('fabric_requirement_type', '') or ''}".strip(),
        fabric_code=rfq.get("rfq_number", ""),
        category_name=(rfq.get("category") or "").title(),
        seller_company=quote.get("vendor_company", ""),
        seller_id=quote.get("vendor_id", ""),
        quantity=int(payload.quantity),
        price_per_meter=float(quote["price_per_meter"]),
        order_type="bulk",
        dispatch_timeline=f"{quote.get('lead_days', '')} days",
    )
    customer_info = CustomerInfo(
        name=customer.get("name") or rfq.get("full_name", ""),
        email=customer.get("email") or rfq.get("email"),
        phone=customer.get("phone") or rfq.get("phone", ""),
        company=payload.company or customer.get("company", "") or rfq.get("website", ""),
        gst_number=payload.gst_number or customer.get("gst_number", "") or rfq.get("gst_number", ""),
        address=payload.address or customer.get("address", ""),
        city=payload.city or customer.get("city", ""),
        state=payload.state or customer.get("state", ""),
        pincode=payload.pincode or customer.get("pincode", ""),
    )

    order_payload = OrderCreate(
        items=[item],
        customer=customer_info,
        notes=payload.notes or f"RFQ {rfq.get('rfq_number')} → Quote {quote_id[:8]}",
        payment_method=payload.payment_method,
    )
    result = await create_order(order_payload)

    # Stamp source/RFQ/quote linkage on the order so vendor + admin views can
    # tell the two streams apart.
    order_id = result.get("order_id")
    if order_id:
        await db.orders.update_one(
            {"id": order_id},
            {
                "$set": {
                    "source": "rfq",
                    "rfq_id": rfq["id"],
                    "rfq_number": rfq.get("rfq_number"),
                    "quote_id": quote_id,
                }
            },
        )
        # Mark all losing quotes on this RFQ as `lost` for analytics; mark the
        # winning quote as `won`. Idempotent.
        await db.vendor_quotes.update_many(
            {"rfq_id": rfq["id"], "id": {"$ne": quote_id}, "status": "submitted"},
            {"$set": {"status": "lost", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.vendor_quotes.update_one(
            {"id": quote_id},
            {"$set": {"status": "won", "won_at": datetime.now(timezone.utc).isoformat()}},
        )
        # Mark the RFQ as `won` so it lands in the Closed bucket on Customer side
        await db.rfq_submissions.update_one(
            {"id": rfq["id"]},
            {"$set": {"status": "won", "winning_quote_id": quote_id, "winning_vendor_id": quote.get("vendor_id")}},
        )

    return result
