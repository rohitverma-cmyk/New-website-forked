"""
Collection Router — CRUD for fabric collections.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import auth_helpers

router = APIRouter(prefix="/api", tags=["collections"])
db = None
# Reference to normalize_fabric from server — set at init time
_normalize_fabric = None


def set_db(database, normalize_fn=None):
    global db, _normalize_fabric
    db = database
    if normalize_fn:
        _normalize_fabric = normalize_fn


# ==================== MODELS ====================

class CollectionCreate(BaseModel):
    name: str
    slug: str = ""
    description: str = ""
    image_url: str = ""
    fabric_ids: List[str] = []
    is_featured: bool = False

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    fabric_ids: Optional[List[str]] = None
    is_featured: Optional[bool] = None

class Collection(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    slug: str = ""
    description: str = ""
    image_url: str = ""
    fabric_ids: List[str] = []
    is_featured: bool = False
    fabric_count: int = 0
    created_at: str = ""


# Fabric model for collection fabrics response (minimal)
class FabricResponse(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    slug: str = ""
    name: str = ""
    fabric_code: str = ""
    category_id: str = ""
    category_name: str = ""
    seller_id: str = ""
    seller_name: str = ""
    seller_company: str = ""
    rate_per_meter: float = 0
    images: List[str] = []
    gsm: Optional[int] = None
    width: str = ""
    color: str = ""
    pattern: str = ""
    moq: str = ""
    fabric_type: str = ""
    has_multiple_colors: bool = False
    color_variants: List[dict] = []
    status: Optional[str] = None


# ==================== ROUTES ====================

@router.get("/collections", response_model=List[Collection])
async def get_collections():
    collections = await db.collections.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)
    for coll in collections:
        coll['fabric_count'] = len(coll.get('fabric_ids', []))
    return collections


@router.get("/collections/featured", response_model=List[Collection])
async def get_featured_collections():
    collections = await db.collections.find({'is_featured': True}, {'_id': 0}).sort('created_at', -1).to_list(10)
    for coll in collections:
        coll['fabric_count'] = len(coll.get('fabric_ids', []))
    return collections


@router.get("/collections/{collection_id}", response_model=Collection)
async def get_collection(collection_id: str):
    collection = await db.collections.find_one({'id': collection_id}, {'_id': 0})
    if not collection:
        raise HTTPException(status_code=404, detail='Collection not found')
    collection['fabric_count'] = len(collection.get('fabric_ids', []))
    return collection


@router.get("/collections/{collection_id}/fabrics")
async def get_collection_fabrics(collection_id: str):
    collection = await db.collections.find_one({'id': collection_id}, {'_id': 0})
    if not collection:
        raise HTTPException(status_code=404, detail='Collection not found')

    fabric_ids = collection.get('fabric_ids', [])
    if not fabric_ids:
        return []

    fabrics = await db.fabrics.find({'id': {'$in': fabric_ids}}, {'_id': 0}).to_list(100)

    category_ids = list(set(f['category_id'] for f in fabrics if f.get('category_id')))
    categories = await db.categories.find({'id': {'$in': category_ids}}, {'_id': 0}).to_list(100) if category_ids else []
    cat_map = {c['id']: c['name'] for c in categories}

    seller_ids = list(set(f.get('seller_id', '') for f in fabrics if f.get('seller_id')))
    sellers = await db.sellers.find({'id': {'$in': seller_ids}}, {'_id': 0}).to_list(100) if seller_ids else []
    seller_map = {s['id']: s for s in sellers}

    for fabric in fabrics:
        if _normalize_fabric:
            _normalize_fabric(fabric)
        fabric['category_name'] = cat_map.get(fabric.get('category_id', ''), '')
        seller = seller_map.get(fabric.get('seller_id', ''))
        fabric['seller_name'] = seller['name'] if seller else ''
        fabric['seller_company'] = seller['company_name'] if seller else ''
        if 'seller_id' not in fabric:
            fabric['seller_id'] = ''

    return fabrics


@router.post("/collections", response_model=Collection)
async def create_collection(data: CollectionCreate, admin=Depends(auth_helpers.get_current_admin)):
    collection_id = str(uuid.uuid4())
    collection_doc = {
        'id': collection_id,
        'name': data.name,
        'description': data.description or "",
        'image_url': data.image_url or "",
        'fabric_ids': data.fabric_ids or [],
        'is_featured': data.is_featured,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.collections.insert_one(collection_doc)
    # Remove MongoDB _id before returning (insert_one modifies the dict)
    collection_doc.pop('_id', None)
    collection_doc['fabric_count'] = len(collection_doc['fabric_ids'])
    return Collection(**collection_doc)


@router.put("/collections/{collection_id}", response_model=Collection)
async def update_collection(collection_id: str, data: CollectionUpdate, admin=Depends(auth_helpers.get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')

    result = await db.collections.update_one({'id': collection_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Collection not found')

    collection = await db.collections.find_one({'id': collection_id}, {'_id': 0})
    collection['fabric_count'] = len(collection.get('fabric_ids', []))
    return Collection(**collection)


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, admin=Depends(auth_helpers.get_current_admin)):
    result = await db.collections.delete_one({'id': collection_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Collection not found')
    return {'message': 'Collection deleted'}
