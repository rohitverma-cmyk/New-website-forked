"""
Supplier Profile API — Full profile data for supplier storefront pages.
"""
from fastapi import APIRouter, HTTPException, Body
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import uuid as _uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/api/suppliers", tags=["supplier-profiles"])

client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = client[os.environ.get("DB_NAME", "test_database")]


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')


@router.get("/{slug}/profile")
async def get_supplier_profile(slug: str):
    """Get full supplier profile by slug."""
    # Find seller by slug match on company_name
    sellers = []
    async for s in db.sellers.find({"is_active": True}, {"_id": 0, "password_hash": 0}):
        if slugify(s.get("company_name", "")) == slug:
            sellers.append(s)
    
    if not sellers:
        # Try partial match
        async for s in db.sellers.find({"is_active": True}, {"_id": 0, "password_hash": 0}):
            if slug in slugify(s.get("company_name", "")):
                sellers.append(s)
    
    if not sellers:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    seller = sellers[0]
    seller_id = seller["id"]
    
    # Get all fabrics for this seller
    fabrics = []
    async for f in db.fabrics.find(
        {"seller_id": seller_id, "status": "approved"},
        {"_id": 0}
    ).sort("created_at", -1):
        fabrics.append(f)
    
    # Aggregate stats
    total_skus = len(fabrics)
    in_stock = sum(1 for f in fabrics if (f.get("quantity_available") or 0) > 0)
    low_stock = sum(1 for f in fabrics if 0 < (f.get("quantity_available") or 0) <= 100)
    bookable = sum(1 for f in fabrics if f.get("is_bookable"))
    
    # Category breakdown
    category_counts = {}
    for f in fabrics:
        cat = f.get("category_name", "Uncategorized")
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    # Stock by category
    stock_by_category = {}
    for f in fabrics:
        cat = f.get("category_name", "Uncategorized")
        qty = f.get("quantity_available") or 0
        stock_by_category[cat] = stock_by_category.get(cat, 0) + qty
    
    # Get orders for this seller (anonymised)
    recent_orders = []
    async for o in db.orders.find(
        {"items.seller_id": seller_id},
        {"_id": 0, "order_number": 1, "items": 1, "status": 1, "created_at": 1, "customer.city": 1, "customer.state": 1}
    ).sort("created_at", -1).limit(10):
        for item in o.get("items", []):
            if item.get("seller_id") == seller_id:
                recent_orders.append({
                    "order_id": o.get("order_number", ""),
                    "product": item.get("fabric_name", ""),
                    "quantity": item.get("quantity", 0),
                    "order_type": item.get("order_type", "bulk"),
                    "status": o.get("status", "confirmed"),
                    "buyer_location": f"{o.get('customer', {}).get('city', '')}, {o.get('customer', {}).get('state', '')}",
                    "date": str(o.get("created_at", ""))[:10]
                })
    
    total_orders = len(recent_orders)
    
    # Get reviews from reviews collection
    reviews_cursor = db.reviews.find(
        {"seller_id": seller_id}, {"_id": 0}
    ).sort("review_date", -1).limit(50)
    reviews_raw = await reviews_cursor.to_list(50)
    
    reviews = []
    for r in reviews_raw:
        reviews.append({
            "buyer_name": r.get("customer_name", ""),
            "buyer_company": r.get("customer_company", ""),
            "buyer_location": r.get("customer_location", ""),
            "rating": r.get("rating", 5),
            "text": r.get("review_text", ""),
            "date": r.get("review_date", ""),
            "is_verified": r.get("is_verified", True),
        })
    
    # Compute review stats from actual data
    review_count = len(reviews)
    if review_count > 0:
        avg_rating = round(sum(r["rating"] for r in reviews) / review_count, 1)
        dist = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}
        for r in reviews:
            dist[str(r["rating"])] = dist.get(str(r["rating"]), 0) + 1
        review_stats = {
            "average": avg_rating,
            "count": review_count,
            "distribution": dist,
            "sub_ratings": {
                "quality": avg_rating,
                "communication": avg_rating,
                "on_time_delivery": avg_rating,
                "packaging": avg_rating,
            }
        }
    else:
        review_stats = {
            "average": 0,
            "count": 0,
            "distribution": {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0},
            "sub_ratings": {
                "quality": 0,
                "communication": 0,
                "on_time_delivery": 0,
                "packaging": 0,
            }
        }
    
    # Get similar suppliers (same state or category)
    similar = []
    query = {"is_active": True, "id": {"$ne": seller_id}}
    if seller.get("state"):
        query["state"] = seller.get("state")
    async for s in db.sellers.find(query, {"_id": 0, "password_hash": 0}).limit(4):
        s_fabrics = await db.fabrics.count_documents({"seller_id": s["id"], "status": "approved"})
        similar.append({
            "id": s["id"],
            "company_name": s.get("company_name", ""),
            "slug": slugify(s.get("company_name", "")),
            "city": s.get("city", ""),
            "state": s.get("state", ""),
            "logo_url": s.get("logo_url", ""),
            "category_ids": s.get("category_ids", []),
            "fabric_count": s_fabrics
        })
    
    # If not enough similar by state, get by any
    if len(similar) < 3:
        async for s in db.sellers.find(
            {"is_active": True, "id": {"$ne": seller_id}},
            {"_id": 0, "password_hash": 0}
        ).limit(4):
            if not any(sim["id"] == s["id"] for sim in similar):
                s_fabrics = await db.fabrics.count_documents({"seller_id": s["id"], "status": "approved"})
                similar.append({
                    "id": s["id"],
                    "company_name": s.get("company_name", ""),
                    "slug": slugify(s.get("company_name", "")),
                    "city": s.get("city", ""),
                    "state": s.get("state", ""),
                    "logo_url": s.get("logo_url", ""),
                    "category_ids": s.get("category_ids", []),
                    "fabric_count": s_fabrics
                })
                if len(similar) >= 4:
                    break
    
    # Determine primary category
    primary_category = ""
    if category_counts:
        primary_category = max(category_counts, key=category_counts.get)
    elif seller.get("category_ids"):
        primary_category = seller["category_ids"][0].replace("cat-", "").title()
    
    # Build profile response
    profile = {
        "seller": {
            "id": seller_id,
            "company_name": seller.get("company_name", ""),
            "slug": slugify(seller.get("company_name", "")),
            "description": seller.get("description", ""),
            "logo_url": seller.get("logo_url", ""),
            "city": seller.get("city", ""),
            "state": (seller.get("state") or "").strip(),
            "contact_name": seller.get("name", ""),
            "contact_email": seller.get("contact_email", ""),
            "contact_phone": seller.get("contact_phone", ""),
            "category_ids": seller.get("category_ids", []),
            "primary_category": primary_category,
            "created_at": str(seller.get("created_at", "")),
            "gst_verified": bool(seller.get("gst_number")),
            "is_premium": bool(seller.get("is_premium")),
            "certifications": seller.get("certifications", []),
            "business_type": seller.get("business_type", "Manufacturer"),
            "established_year": seller.get("established_year"),
            "employee_count": seller.get("employee_count", ""),
            "factory_size": seller.get("factory_size", ""),
            "turnover_range": seller.get("turnover_range", ""),
            "export_markets": seller.get("export_markets", []),
            "languages": seller.get("languages", ["English", "Hindi"]),
            "working_hours": seller.get("working_hours", "Mon-Sat, 9:00 AM - 6:00 PM"),
            "payment_terms": seller.get("payment_terms", "100% advance for new buyers"),
            "payment_modes": seller.get("payment_modes", ["Bank Transfer", "UPI"]),
            "moq": seller.get("moq", "1000 meters"),
            "dispatch_city": seller.get("dispatch_city") or seller.get("city", ""),
            "packing_method": seller.get("packing_method", "Roll packing in poly bag"),
            "monthly_capacity": seller.get("monthly_capacity", ""),
            "standard_lead_time": seller.get("standard_lead_time", "7-10 days"),
            "custom_lead_time": seller.get("custom_lead_time", "15-20 days"),
            "sample_lead_time": seller.get("sample_lead_time", "3-5 days"),
        },
        "stats": {
            "total_skus": total_skus,
            "in_stock": in_stock,
            "low_stock": low_stock,
            "bookable": bookable,
            "total_orders": total_orders,
            "on_time_rate": 95,
            "response_time": "< 2 hours",
            "years_in_business": _calc_years(seller.get("established_year") or seller.get("created_at")),
            "category_counts": category_counts,
            "stock_by_category": stock_by_category,
        },
        "fabrics": fabrics,
        "recent_orders": recent_orders,
        "reviews": reviews,
        "review_stats": review_stats,
        "similar_suppliers": similar,
    }
    
    return profile


def _calc_years(val):
    """Calculate years in business from established year or created_at."""
    if not val:
        return 1
    try:
        if isinstance(val, int):
            return max(1, datetime.now().year - val)
        if isinstance(val, str) and len(val) == 4:
            return max(1, datetime.now().year - int(val))
        # Parse ISO date
        dt = datetime.fromisoformat(str(val).replace('Z', '+00:00'))
        diff = datetime.now(timezone.utc) - dt
        return max(1, diff.days // 365)
    except Exception:
        return 1


@router.get("/directory")
async def get_supplier_directory():
    """Get all active suppliers for directory/sitemap."""
    suppliers = []
    async for s in db.sellers.find({"is_active": True}, {"_id": 0, "password_hash": 0}):
        fabric_count = await db.fabrics.count_documents({"seller_id": s["id"], "status": "approved"})
        primary_cat = ""
        if s.get("category_ids"):
            primary_cat = s["category_ids"][0].replace("cat-", "").title()
        
        suppliers.append({
            "id": s["id"],
            "company_name": s.get("company_name", ""),
            "slug": slugify(s.get("company_name", "")),
            "city": s.get("city", ""),
            "state": (s.get("state") or "").strip(),
            "logo_url": s.get("logo_url", ""),
            "primary_category": primary_cat or "fabrics",
            "fabric_count": fabric_count,
            "description": s.get("description", ""),
        })
    
    return suppliers



@router.post("/{slug}/enquiry")
async def create_supplier_enquiry(slug: str, body: dict = Body(...)):
    """Save a supplier-specific enquiry from the profile page."""
    enquiry = {
        "id": str(_uuid.uuid4())[:8],
        "supplier_slug": slug,
        "name": body.get("name", ""),
        "company_name": body.get("company_name", ""),
        "country": body.get("country", "India"),
        "product_interest": body.get("product_interest", ""),
        "quantity": body.get("quantity", ""),
        "message": body.get("message", ""),
        "source": "supplier_profile",
        "status": "new",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enquiries.insert_one(enquiry)
    return {"success": True, "message": "Enquiry sent successfully"}
