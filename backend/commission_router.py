"""
Commission Router - Manages commission rules and calculations for vendor payouts.
Commission hierarchy (most specific wins):
  1. Vendor-specific override
  2. Category + Pattern (e.g. Cotton + Stripes)
  3. Category-specific rate
  4. Cart value slab
  5. Meterage slab
  6. Order source (inventory vs RFQ)
  7. Default (5%)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/commission", tags=["commission"])

db = None
# Default commission when no rule matches. 0 means "don't charge anything
# by default" — admins must set explicit rules in /admin/commission before
# any commission is applied. Kept as a constant (not editable from UI yet)
# to avoid silent fee drift; flip here + update the caption in the Admin
# page if this ever changes.
DEFAULT_COMMISSION_PCT = 0.0


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class CommissionRule(BaseModel):
    rule_type: str  # vendor, category, category_pattern, cart_value, meterage, source
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    pattern: Optional[str] = None  # used by category_pattern (e.g. "Solid", "Stripes")
    min_value: Optional[float] = None  # For cart_value or meterage slabs
    max_value: Optional[float] = None
    source: Optional[str] = None  # "inventory" or "rfq"
    commission_pct: float
    is_active: bool = True


# ==================== COMMISSION CALCULATOR ====================

async def calculate_commission(order_data: dict, items: list) -> dict:
    """
    Calculate commission % and amount for an order.
    Priority: vendor > category+pattern > category > cart_value > meterage > source > default
    """
    if db is None:
        return {"commission_pct": DEFAULT_COMMISSION_PCT, "commission_amount": 0, "rule_applied": "default"}

    subtotal = sum(item.get("quantity", 0) * item.get("price_per_meter", 0) for item in items)
    total_meters = sum(item.get("quantity", 0) for item in items)
    seller_id = items[0].get("seller_id", "") if items else ""
    category_name = items[0].get("category_name", "") if items else ""
    pattern = (items[0].get("pattern", "") if items else "") or ""
    is_rfq = order_data.get("source") == "rfq"

    rules = await db.commission_rules.find({"is_active": True}, {"_id": 0}).to_list(500)

    # 1. Vendor-specific
    for r in rules:
        if r.get("rule_type") == "vendor" and r.get("vendor_id") == seller_id:
            pct = r["commission_pct"]
            return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": f"vendor:{r.get('vendor_name', seller_id)}"}

    # 2. Category + Pattern (more specific than plain category — e.g. Cotton + Stripes
    #    might attract a different rate than generic Cotton).
    for r in rules:
        if (
            r.get("rule_type") == "category_pattern"
            and r.get("category_name", "").lower() == category_name.lower()
            and (r.get("pattern", "") or "").lower() == pattern.lower()
            and category_name and pattern
        ):
            pct = r["commission_pct"]
            return {
                "commission_pct": pct,
                "commission_amount": round(subtotal * pct / 100, 2),
                "rule_applied": f"category_pattern:{category_name}/{pattern}",
            }

    # 3. Category-specific
    for r in rules:
        if r.get("rule_type") == "category" and r.get("category_name", "").lower() == category_name.lower():
            pct = r["commission_pct"]
            return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": f"category:{category_name}"}

    # 4. Cart value slab
    cart_rules = sorted([r for r in rules if r.get("rule_type") == "cart_value"], key=lambda x: x.get("min_value", 0))
    for r in cart_rules:
        mn = r.get("min_value", 0) or 0
        mx = r.get("max_value") or float("inf")
        if mn <= subtotal <= mx:
            pct = r["commission_pct"]
            return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": f"cart_value:{mn}-{mx}"}

    # 5. Meterage slab
    meter_rules = sorted([r for r in rules if r.get("rule_type") == "meterage"], key=lambda x: x.get("min_value", 0))
    for r in meter_rules:
        mn = r.get("min_value", 0) or 0
        mx = r.get("max_value") or float("inf")
        if mn <= total_meters <= mx:
            pct = r["commission_pct"]
            return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": f"meterage:{mn}-{mx}m"}

    # 6. Source (inventory vs RFQ)
    source_type = "rfq" if is_rfq else "inventory"
    for r in rules:
        if r.get("rule_type") == "source" and r.get("source") == source_type:
            pct = r["commission_pct"]
            return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": f"source:{source_type}"}

    # 7. Default
    pct = DEFAULT_COMMISSION_PCT
    return {"commission_pct": pct, "commission_amount": round(subtotal * pct / 100, 2), "rule_applied": "default"}


# ==================== ADMIN CRUD ====================

@router.get("/rules")
async def list_rules():
    """List all commission rules."""
    rules = await db.commission_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rules


@router.post("/rules")
async def create_rule(rule: CommissionRule):
    """Create a new commission rule."""
    doc = rule.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    await db.commission_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: str, data: dict):
    """Update a commission rule."""
    update = {k: v for k, v in data.items() if k not in ("id", "_id", "created_at")}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.commission_rules.update_one({"id": rule_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule = await db.commission_rules.find_one({"id": rule_id}, {"_id": 0})
    return rule


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a commission rule."""
    result = await db.commission_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": True}


@router.get("/default")
async def get_default():
    """Get the default commission percentage."""
    return {"default_pct": DEFAULT_COMMISSION_PCT}


@router.post("/calculate-preview")
async def preview_commission(data: dict):
    """Preview commission calculation for given parameters (admin tool)."""
    items = data.get("items", [{"quantity": data.get("quantity", 100), "price_per_meter": data.get("price", 100), "seller_id": data.get("seller_id", ""), "category_name": data.get("category_name", "")}])
    result = await calculate_commission(data, items)
    return result
