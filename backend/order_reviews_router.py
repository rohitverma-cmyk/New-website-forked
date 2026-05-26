"""
order_reviews_router.py
───────────────────────
Customer-submitted order ratings (1–5 stars) + admin moderation surface.
Distinct from `reviews_router.py` which manages admin-curated seller reviews.

Endpoints
─────────
  GET   /api/order-reviews/{order_id}              — public landing page hydration
  POST  /api/order-reviews/submit                  — public submission (emails ops)
  GET   /api/admin/order-reviews                   — admin list + stats
  GET   /api/admin/order-reviews/export.csv        — admin CSV download

Security
────────
Anyone with the order UUID can submit (UUID = 122 bits of entropy). Re-submission
allowed within 7 days from the first review — see EDIT_WINDOW_DAYS.
"""
import asyncio
import csv
import io
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import auth_helpers

logger = logging.getLogger("order_reviews")
router = APIRouter(prefix="/api", tags=["order-reviews"])

EDIT_WINDOW_DAYS = 7
REVIEWS_NOTIFY_EMAIL = os.environ.get("REVIEWS_NOTIFY_EMAIL", "mail@locofast.com")

_db = None


def init(db):
    global _db
    _db = db


async def _fetch_order(order_id: str) -> Optional[dict]:
    return await _db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )


def _summary_items(order: dict) -> list[dict]:
    out = []
    for it in (order.get("items") or [])[:5]:
        imgs = it.get("images") or it.get("image_urls") or []
        img = ""
        if isinstance(imgs, list) and imgs:
            first = imgs[0]
            img = first.get("url", "") if isinstance(first, dict) else first
        elif it.get("image_url"):
            img = it.get("image_url")
        out.append({
            "fabric_name": it.get("fabric_name") or "Fabric",
            "fabric_code": it.get("fabric_code") or it.get("code") or "",
            "category_name": it.get("category_name") or it.get("category") or "",
            "quantity": float(it.get("quantity") or 0),
            "price_per_meter": float(it.get("price_per_meter") or it.get("price") or 0),
            "image_url": img,
        })
    return out


@router.get("/order-reviews/{order_id}")
async def get_order_for_feedback(order_id: str):
    """Hydrate the customer feedback landing page (public)."""
    order = await _fetch_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    cust = order.get("customer") or {}
    existing = await _db.order_reviews.find_one(
        {"order_id": order.get("id")}, {"_id": 0}
    )
    can_edit = True
    if existing:
        created = existing.get("created_at", "")
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            can_edit = (datetime.now(timezone.utc) - created_dt) <= timedelta(days=EDIT_WINDOW_DAYS)
        except Exception:
            can_edit = False
    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "customer_name": cust.get("name", ""),
        "customer_email": cust.get("email", ""),
        "total": float(order.get("total") or 0),
        "delivered_at": order.get("delivered_at") or order.get("updated_at"),
        "items": _summary_items(order),
        "existing_review": existing,
        "can_edit": can_edit,
        "edit_window_days": EDIT_WINDOW_DAYS,
    }


class _ReviewSubmit(BaseModel):
    order_id: str
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = ""


def _star_row(rating: int) -> str:
    full = "★" * rating
    empty = "☆" * (5 - rating)
    color = "#fbbf24" if rating >= 3 else "#ef4444"
    return f'<span style="color:{color};font-size:18px;letter-spacing:2px;">{full}<span style="color:#e2e8f0;">{empty}</span></span>'


def _build_admin_notify_html(review: dict, order: dict) -> str:
    cust = order.get("customer") or {}
    rating = int(review.get("rating") or 0)
    fb = (review.get("feedback") or "").strip()
    return f"""
    <div style="font-family:Inter,-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <div style="background:{'#dc2626' if rating <= 2 else '#0ea5e9'};color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:18px;">New customer review · {rating}/5</h2>
        <p style="margin:6px 0 0;font-size:12px;opacity:0.9;">{order.get('order_number','')}</p>
      </div>
      <div style="padding:22px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;background:#fff;">
        <table style="width:100%;font-size:13px;color:#475569;margin-bottom:16px;">
          <tr><td style="padding:4px 0;width:120px;color:#94a3b8;">Customer:</td><td style="font-weight:600;color:#0f172a;">{cust.get('name','—')}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Email:</td><td>{cust.get('email','—')}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Order:</td><td><strong>{order.get('order_number','')}</strong></td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Rating:</td><td>{_star_row(rating)} <strong style="margin-left:6px;">{rating}/5</strong></td></tr>
        </table>
        {f'<div style="background:#f8fafc;border-left:3px solid #0ea5e9;border-radius:6px;padding:12px 14px;font-size:13px;color:#334155;">{fb}</div>' if fb else '<p style="color:#94a3b8;font-size:12px;">No written feedback provided.</p>'}
        {'<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;margin-top:14px;font-size:12px;color:#7f1d1d;"><strong>Low-rating alert.</strong> Recommend agent follow-up within 24h.</div>' if rating <= 2 else ''}
      </div>
    </div>
    """


async def _notify_admin(review: dict, order: dict) -> None:
    try:
        from email_router import RESEND_API_KEY, SENDER_EMAIL
        import resend as _resend
    except Exception as e:
        logger.warning(f"Resend not importable: {e}")
        return
    if not RESEND_API_KEY:
        return
    rating = int(review.get("rating") or 0)
    subject = (
        f"Low rating ({rating}/5) — {order.get('order_number','')}"
        if rating <= 2 else
        f"New review · {rating}/5 — {order.get('order_number','')}"
    )
    try:
        await asyncio.to_thread(
            _resend.Emails.send,
            {"from": SENDER_EMAIL, "to": [REVIEWS_NOTIFY_EMAIL], "subject": subject,
             "html": _build_admin_notify_html(review, order)}
        )
    except Exception as e:
        logger.error(f"Review notify email failed: {e}")


@router.post("/order-reviews/submit")
async def submit_review(payload: _ReviewSubmit):
    order = await _fetch_order(payload.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order_id = order.get("id")
    cust = order.get("customer") or {}
    now = datetime.now(timezone.utc).isoformat()

    existing = await _db.order_reviews.find_one({"order_id": order_id}, {"_id": 0})
    if existing:
        try:
            created_dt = datetime.fromisoformat(existing.get("created_at", "").replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - created_dt) > timedelta(days=EDIT_WINDOW_DAYS):
                raise HTTPException(
                    status_code=400,
                    detail=f"Reviews can only be edited within {EDIT_WINDOW_DAYS} days of first submission",
                )
        except ValueError:
            pass
        update = {
            "rating": payload.rating,
            "feedback": (payload.feedback or "").strip()[:2000],
            "updated_at": now,
        }
        await _db.order_reviews.update_one({"order_id": order_id}, {"$set": update})
        review = {**existing, **update}
    else:
        review = {
            "id": f"rev_{order_id}",
            "order_id": order_id,
            "order_number": order.get("order_number"),
            "customer_id": cust.get("id", ""),
            "customer_name": cust.get("name", ""),
            "customer_email": cust.get("email", ""),
            "rating": payload.rating,
            "feedback": (payload.feedback or "").strip()[:2000],
            "created_at": now,
            "updated_at": now,
        }
        await _db.order_reviews.insert_one(dict(review))
        review.pop("_id", None)

    await _notify_admin(review, order)
    return {"success": True, "review": review}


def _build_admin_query(rating: Optional[int], search: Optional[str]) -> dict:
    q: dict = {}
    if rating:
        q["rating"] = rating
    if search and search.strip():
        s = search.strip()
        q["$or"] = [
            {"order_number": {"$regex": s, "$options": "i"}},
            {"customer_name": {"$regex": s, "$options": "i"}},
            {"customer_email": {"$regex": s, "$options": "i"}},
        ]
    return q


@router.get("/admin/order-reviews")
async def list_order_reviews(
    rating: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = "",
    limit: int = Query(100, le=500),
    skip: int = Query(0, ge=0),
    admin=Depends(auth_helpers.get_current_admin),
):
    q = _build_admin_query(rating, search)
    cur = _db.order_reviews.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cur.to_list(limit)
    total = await _db.order_reviews.count_documents(q)
    # Stats independent of filters
    buckets = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    avg_sum = 0
    avg_count = 0
    async for row in _db.order_reviews.aggregate([{"$group": {"_id": "$rating", "count": {"$sum": 1}}}]):
        r = row.get("_id")
        c = row.get("count", 0)
        if isinstance(r, int) and 1 <= r <= 5:
            buckets[r] = c
            avg_sum += r * c
            avg_count += c
    avg = round(avg_sum / avg_count, 2) if avg_count else 0
    return {
        "items": items,
        "total": total,
        "stats": {"average": avg, "count": avg_count, "buckets": buckets},
    }


@router.get("/admin/order-reviews/export.csv")
async def export_order_reviews(
    rating: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = "",
    admin=Depends(auth_helpers.get_current_admin),
):
    q = _build_admin_query(rating, search)
    rows = await _db.order_reviews.find(q, {"_id": 0}).sort("created_at", -1).to_list(10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["order_number", "customer_name", "customer_email", "rating",
                "feedback", "created_at", "updated_at"])
    for r in rows:
        w.writerow([
            r.get("order_number", ""),
            r.get("customer_name", ""),
            r.get("customer_email", ""),
            r.get("rating", ""),
            (r.get("feedback") or "").replace("\n", " "),
            r.get("created_at", ""),
            r.get("updated_at", ""),
        ])
    buf.seek(0)
    filename = f"locofast-reviews-{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
