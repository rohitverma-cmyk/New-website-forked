"""
Admin-managed review CRUD for seller profiles.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
import uuid
import auth_helpers

router = APIRouter(prefix="/api", tags=["reviews"])
db = None


def set_db(database):
    global db
    db = database


@router.post("/reviews")
async def create_review(data: dict, admin=Depends(auth_helpers.get_current_admin)):
    """Admin creates a review for a seller (from ERP data)."""
    for field in ['seller_id', 'customer_name', 'rating']:
        if not data.get(field):
            raise HTTPException(status_code=400, detail=f'{field} is required')

    rating = data['rating']
    if not isinstance(rating, (int, float)) or rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail='Rating must be between 1 and 5')

    seller = await db.sellers.find_one({'id': data['seller_id']}, {'_id': 0, 'company_name': 1})
    if not seller:
        raise HTTPException(status_code=404, detail='Seller not found')

    review = {
        'id': str(uuid.uuid4())[:8],
        'seller_id': data['seller_id'],
        'seller_name': seller.get('company_name', ''),
        'customer_name': data['customer_name'],
        'customer_company': data.get('customer_company', ''),
        'customer_location': data.get('customer_location', ''),
        'rating': int(rating),
        'review_text': data.get('review_text', ''),
        'review_date': data.get('review_date', datetime.now(timezone.utc).strftime('%Y-%m-%d')),
        'is_verified': data.get('is_verified', True),
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(review)
    review.pop('_id', None)
    return review


@router.get("/reviews")
async def get_reviews(seller_id: str = Query(None), admin=Depends(auth_helpers.get_current_admin)):
    """Get all reviews, optionally filtered by seller_id."""
    query = {'seller_id': seller_id} if seller_id else {}
    return await db.reviews.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)


@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, admin=Depends(auth_helpers.get_current_admin)):
    """Delete a review."""
    result = await db.reviews.delete_one({'id': review_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Review not found')
    return {'message': 'Review deleted'}
