"""
Article Router — articles group color variants of the same fabric across sellers.
Endpoints: list / get / create / update / delete + variants.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

import auth_helpers
import fabric_utils

router = APIRouter(prefix="/api", tags=["articles"])
db = None


def set_db(database):
    global db
    db = database


# ==================== MODELS ====================

class ArticleCreate(BaseModel):
    name: str
    base_fabric_id: Optional[str] = ""
    description: Optional[str] = ""
    seller_id: Optional[str] = ""
    category_id: Optional[str] = ""


class ArticleUpdate(BaseModel):
    name: Optional[str] = None
    base_fabric_id: Optional[str] = None
    description: Optional[str] = None
    seller_id: Optional[str] = None
    category_id: Optional[str] = None


class Article(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    article_code: str = ""
    name: str
    base_fabric_id: str = ""
    description: str = ""
    seller_id: str = ""
    seller_name: str = ""
    category_id: str = ""
    category_name: str = ""
    variant_count: int = 0
    created_at: str


class Fabric(BaseModel):
    """Minimal Fabric response for /articles/{id}/variants — avoid coupling."""
    model_config = ConfigDict(extra="allow")
    id: str


# ==================== ROUTES ====================

@router.get("/articles", response_model=List[Article])
async def get_articles(
    seller_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
):
    query = {}
    if seller_id:
        query['seller_id'] = seller_id
    if category_id:
        query['category_id'] = category_id

    articles = await db.articles.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)

    seller_ids = list({a.get('seller_id', '') for a in articles if a.get('seller_id')})
    sellers = await db.sellers.find({'id': {'$in': seller_ids}}, {'_id': 0}).to_list(100) if seller_ids else []
    seller_map = {s['id']: s['name'] for s in sellers}

    cat_ids = list({a.get('category_id', '') for a in articles if a.get('category_id')})
    categories = await db.categories.find({'id': {'$in': cat_ids}}, {'_id': 0}).to_list(100) if cat_ids else []
    cat_map = {c['id']: c['name'] for c in categories}

    variant_counts = {}
    for aid in (a['id'] for a in articles):
        variant_counts[aid] = await db.fabrics.count_documents({'article_id': aid})

    for article in articles:
        article['seller_name'] = seller_map.get(article.get('seller_id', ''), '')
        article['category_name'] = cat_map.get(article.get('category_id', ''), '')
        article['variant_count'] = variant_counts.get(article['id'], 0)
        if 'article_code' not in article:
            article['article_code'] = ''
    return articles


@router.get("/articles/{article_id}", response_model=Article)
async def get_article(article_id: str):
    article = await db.articles.find_one({'id': article_id}, {'_id': 0})
    if not article:
        raise HTTPException(status_code=404, detail='Article not found')

    if article.get('seller_id'):
        seller = await db.sellers.find_one({'id': article['seller_id']}, {'_id': 0})
        article['seller_name'] = seller['name'] if seller else ''
    else:
        article['seller_name'] = ''

    if article.get('category_id'):
        category = await db.categories.find_one({'id': article['category_id']}, {'_id': 0})
        article['category_name'] = category['name'] if category else ''
    else:
        article['category_name'] = ''

    article['variant_count'] = await db.fabrics.count_documents({'article_id': article_id})
    if 'article_code' not in article:
        article['article_code'] = ''
    return article


@router.get("/articles/{article_id}/variants", response_model=List[Fabric])
async def get_article_variants(article_id: str):
    """Get all color variants (fabrics) for an article."""
    article = await db.articles.find_one({'id': article_id}, {'_id': 0})
    if not article:
        raise HTTPException(status_code=404, detail='Article not found')

    fabrics = await db.fabrics.find({'article_id': article_id}, {'_id': 0}).to_list(100)

    category_ids = list({f['category_id'] for f in fabrics if f.get('category_id')})
    categories = await db.categories.find({'id': {'$in': category_ids}}, {'_id': 0}).to_list(100) if category_ids else []
    cat_map = {c['id']: c['name'] for c in categories}

    seller_ids = list({f.get('seller_id', '') for f in fabrics if f.get('seller_id')})
    sellers = await db.sellers.find({'id': {'$in': seller_ids}}, {'_id': 0}).to_list(100) if seller_ids else []
    seller_map = {s['id']: s for s in sellers}

    for fabric in fabrics:
        fabric_utils.normalize_fabric(fabric)
        fabric['category_name'] = cat_map.get(fabric.get('category_id', ''), '')
        seller = seller_map.get(fabric.get('seller_id', ''))
        fabric['seller_name'] = seller['name'] if seller else ''
        fabric['seller_company'] = seller['company_name'] if seller else ''
        fabric['seller_code'] = seller.get('seller_code', '') if seller else ''
        if 'seller_id' not in fabric:
            fabric['seller_id'] = ''
    return fabrics


@router.post("/articles", response_model=Article)
async def create_article(data: ArticleCreate, admin=Depends(auth_helpers.get_current_admin)):
    article_id = str(uuid.uuid4())
    article_code = await fabric_utils.generate_article_code()

    article_doc = {
        'id': article_id,
        'article_code': article_code,
        'name': data.name,
        'base_fabric_id': data.base_fabric_id or "",
        'description': data.description or "",
        'seller_id': data.seller_id or "",
        'category_id': data.category_id or "",
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.articles.insert_one(article_doc)
    article_doc.pop('_id', None)

    seller_name = ""
    category_name = ""
    if data.seller_id:
        seller = await db.sellers.find_one({'id': data.seller_id}, {'_id': 0})
        seller_name = seller['name'] if seller else ''
    if data.category_id:
        category = await db.categories.find_one({'id': data.category_id}, {'_id': 0})
        category_name = category['name'] if category else ''

    article_doc['seller_name'] = seller_name
    article_doc['category_name'] = category_name
    article_doc['variant_count'] = 0
    return Article(**article_doc)


@router.put("/articles/{article_id}", response_model=Article)
async def update_article(article_id: str, data: ArticleUpdate, admin=Depends(auth_helpers.get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')

    result = await db.articles.update_one({'id': article_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Article not found')

    article = await db.articles.find_one({'id': article_id}, {'_id': 0})

    if article.get('seller_id'):
        seller = await db.sellers.find_one({'id': article['seller_id']}, {'_id': 0})
        article['seller_name'] = seller['name'] if seller else ''
    else:
        article['seller_name'] = ''

    if article.get('category_id'):
        category = await db.categories.find_one({'id': article['category_id']}, {'_id': 0})
        article['category_name'] = category['name'] if category else ''
    else:
        article['category_name'] = ''

    article['variant_count'] = await db.fabrics.count_documents({'article_id': article_id})
    if 'article_code' not in article:
        article['article_code'] = ''
    return Article(**article)


@router.delete("/articles/{article_id}")
async def delete_article(article_id: str, admin=Depends(auth_helpers.get_current_admin)):
    fabric_count = await db.fabrics.count_documents({'article_id': article_id})
    if fabric_count > 0:
        await db.fabrics.update_many({'article_id': article_id}, {'$set': {'article_id': ''}})

    result = await db.articles.delete_one({'id': article_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Article not found')
    return {'message': 'Article deleted'}
