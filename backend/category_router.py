"""
Category Router — CRUD for fabric categories.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import auth_helpers

router = APIRouter(prefix="/api", tags=["categories"])
db = None


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class CategoryCreate(BaseModel):
    name: str
    slug: str = ""
    description: str = ""
    image_url: str = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

class Category(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    slug: str = ""
    description: str = ""
    image_url: str = ""
    fabric_count: int = 0


# ==================== ROUTES ====================

@router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find({}, {'_id': 0}).to_list(100)
    # Compute live fabric counts in one aggregation, then merge
    pipeline = [{"$group": {"_id": "$category_id", "n": {"$sum": 1}}}]
    counts = {row["_id"]: row["n"] async for row in db.fabrics.aggregate(pipeline)}
    for c in categories:
        c['fabric_count'] = counts.get(c['id'], 0)
    return categories


@router.get("/categories/{category_id}", response_model=Category)
async def get_category(category_id: str):
    category = await db.categories.find_one({'id': category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    return category


@router.post("/categories", response_model=Category)
async def create_category(data: CategoryCreate, admin=Depends(auth_helpers.get_current_admin)):
    category_id = str(uuid.uuid4())
    category_doc = {
        'id': category_id,
        'name': data.name,
        'description': data.description or "",
        'image_url': data.image_url or "",
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(category_doc)
    # Remove MongoDB _id before returning (insert_one modifies the dict)
    category_doc.pop('_id', None)
    return Category(**category_doc)


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, data: CategoryUpdate, admin=Depends(auth_helpers.get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')

    result = await db.categories.update_one({'id': category_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Category not found')

    category = await db.categories.find_one({'id': category_id}, {'_id': 0})
    return Category(**category)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, admin=Depends(auth_helpers.get_current_admin)):
    result = await db.categories.delete_one({'id': category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Category not found')
    return {'message': 'Category deleted'}
