"""
Fabric Router — core fabric CRUD, filter-options, listing with faceted search,
count, slug/id lookup, bulk seller assignment, and multi-vendor comparison.
"""
import re as re_mod
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

import auth_helpers
import fabric_utils
from slug_utils import generate_slug
from composition_utils import CANONICAL_COMPOSITIONS, normalize_material

router = APIRouter(prefix="/api", tags=["fabrics"])
db = None


def set_db(database):
    global db
    db = database


# ==================== DISPATCH TIMELINE VALIDATION ====================
# Must match `frontend/src/lib/dispatchOptions.js`. Centralised here so vendor
# and admin write paths share the same allowed-value list.
READY_STOCK_DISPATCH_VALUES = {"1-2 days", "3-5 days", "6-9 days", "10-14 days"}
MTO_DISPATCH_VALUES = {f"{d} days" for d in (15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75)}
ALL_DISPATCH_VALUES = READY_STOCK_DISPATCH_VALUES | MTO_DISPATCH_VALUES


def validate_dispatch_timeline(value: Optional[str], stock_type: Optional[str]) -> str:
    """Raise 400 if dispatch_timeline is missing or doesn't match the preset
    list for the given stock_type. Returns the trimmed value on success."""
    v = (value or "").strip()
    if not v:
        raise HTTPException(status_code=400, detail="Dispatch timeline is required")
    expected = MTO_DISPATCH_VALUES if stock_type == "made_to_order" else READY_STOCK_DISPATCH_VALUES
    if v not in expected:
        bucket = "Made to Order" if stock_type == "made_to_order" else "Ready Stock"
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dispatch timeline '{v}' for {bucket}. Allowed: {sorted(expected)}",
        )
    return v


# ==================== MODELS ====================

class CompositionItem(BaseModel):
    material: str
    # Percentage supports fractional values (e.g., Spandex 2.5%)
    percentage: float


class FabricCreate(BaseModel):
    name: str
    category_id: str
    seller_id: Optional[str] = ""
    article_id: Optional[str] = ""
    fabric_type: str
    pattern: str = "Solid"
    weave_type: Optional[str] = ""
    construction: Optional[str] = ""
    composition: List[CompositionItem] = []
    gsm: Optional[int] = None
    ounce: Optional[str] = ""
    weight_unit: str = "gsm"
    width: str
    width_type: Optional[str] = ""  # "Open Width" or "Circular" — for knitted fabrics
    warp_count: Optional[str] = ""
    weft_count: Optional[str] = ""
    yarn_count: Optional[str] = ""
    denier: Optional[int] = None
    color: str
    finish: Optional[str] = ""
    moq: str
    starting_price: Optional[str] = ""
    availability: List[str] = []
    stock_type: str = "ready_stock"
    description: str
    tags: List[str] = []
    images: List[str] = []
    videos: List[str] = []
    quantity_available: Optional[int] = None
    rate_per_meter: Optional[float] = None
    dispatch_timeline: Optional[str] = ""
    sample_delivery_days: Optional[str] = ""
    bulk_delivery_days: Optional[str] = ""
    is_bookable: bool = False
    sample_price: Optional[float] = None
    pricing_tiers: List[dict] = []
    weft_shrinkage: Optional[float] = None
    stretch_percentage: Optional[float] = None
    seller_sku: Optional[str] = ""
    hsn_code: Optional[str] = ""
    has_multiple_colors: bool = False
    color_variants: List[dict] = []
    certifications: List[str] = []  # keys like "bci", "grs", "oeko_tex"


class FabricUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[str] = None
    seller_id: Optional[str] = None
    article_id: Optional[str] = None
    fabric_type: Optional[str] = None
    pattern: Optional[str] = None
    weave_type: Optional[str] = None
    construction: Optional[str] = None
    composition: Optional[List[CompositionItem]] = None
    gsm: Optional[int] = None
    ounce: Optional[str] = None
    weight_unit: Optional[str] = None
    width: Optional[str] = None
    width_type: Optional[str] = None
    warp_count: Optional[str] = None
    weft_count: Optional[str] = None
    yarn_count: Optional[str] = None
    denier: Optional[int] = None
    color: Optional[str] = None
    finish: Optional[str] = None
    moq: Optional[str] = None
    starting_price: Optional[str] = None
    availability: Optional[List[str]] = None
    stock_type: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    images: Optional[List[str]] = None
    videos: Optional[List[str]] = None
    quantity_available: Optional[int] = None
    rate_per_meter: Optional[float] = None
    dispatch_timeline: Optional[str] = None
    sample_delivery_days: Optional[str] = None
    bulk_delivery_days: Optional[str] = None
    is_bookable: Optional[bool] = None
    sample_price: Optional[float] = None
    pricing_tiers: Optional[List[dict]] = None
    weft_shrinkage: Optional[float] = None
    stretch_percentage: Optional[float] = None
    seller_sku: Optional[str] = None
    hsn_code: Optional[str] = None
    status: Optional[str] = None
    has_multiple_colors: Optional[bool] = None
    color_variants: Optional[List[dict]] = None
    certifications: Optional[List[str]] = None


class Fabric(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    slug: str = ""
    fabric_code: str = ""
    name: str = ""
    category_id: str = ""
    category_name: str = ""
    seller_id: str = ""
    seller_name: str = ""
    seller_company: str = ""
    seller_code: str = ""
    article_id: str = ""
    fabric_type: str = ""
    pattern: str = "Solid"
    weave_type: str = ""
    construction: str = ""
    composition: List[CompositionItem] = []
    gsm: Optional[int] = None
    ounce: str = ""
    weight_unit: str = "gsm"
    width: str = ""
    width_type: str = ""
    warp_count: str = ""
    weft_count: str = ""
    yarn_count: str = ""
    denier: Optional[int] = None
    color: str = ""
    finish: str = ""
    moq: str = ""
    starting_price: str = ""
    availability: List[str] = []
    stock_type: str = "ready_stock"
    description: str = ""
    tags: List[str] = []
    images: List[str] = []
    videos: List[str] = []
    quantity_available: Optional[int] = None
    rate_per_meter: Optional[float] = None
    dispatch_timeline: str = ""
    sample_delivery_days: str = ""
    bulk_delivery_days: str = ""
    is_bookable: bool = False
    sample_price: Optional[float] = None
    pricing_tiers: List[dict] = []
    weft_shrinkage: Optional[float] = None
    stretch_percentage: Optional[float] = None
    seller_sku: str = ""
    hsn_code: str = ""
    has_multiple_colors: bool = False
    color_variants: List[dict] = []
    certifications: List[str] = []
    status: Optional[str] = None
    vendor_count: int = 1
    created_at: str = ""


# ==================== FILTER BUILDER ====================

def _build_fabric_query(
    category_id, seller_id, article_id, fabric_type, search,
    min_gsm, max_gsm, pattern, color, width, min_price, max_price,
    composition, bookable_only, sample_available, instant_bookable,
    enquiry_only, status, include_pending, has_oz_filter,
    certifications=None,
):
    """Shared query builder used by both /fabrics and /fabrics/count."""
    and_conditions = []
    query = {}

    if status:
        and_conditions.append({'status': status})
    elif include_pending:
        pass
    else:
        and_conditions.append({'$or': [
            {'status': 'approved'},
            {'status': {'$exists': False}},
            {'status': None},
        ]})

    if category_id:
        query['category_id'] = category_id
    if seller_id:
        query['seller_id'] = seller_id
    if article_id:
        query['article_id'] = article_id
    if fabric_type:
        query['fabric_type'] = fabric_type
    if bookable_only:
        query['is_bookable'] = True
        query['quantity_available'] = {'$gt': 0}
    if sample_available:
        query['is_bookable'] = True
        and_conditions.append({'$or': [
            {'sample_price': {'$gt': 0}},
            {'rate_per_meter': {'$gt': 0}},
        ]})
    if instant_bookable:
        query['is_bookable'] = True
        and_conditions.append({'$or': [
            {'sample_price': {'$gt': 0}},
            {'rate_per_meter': {'$gt': 0}},
            {'quantity_available': {'$gt': 0}},
        ]})
    if enquiry_only:
        and_conditions.append({'$or': [
            {'is_bookable': {'$ne': True}},
            {'$and': [
                {'sample_price': {'$in': [None, 0]}},
                {'rate_per_meter': {'$in': [None, 0]}},
                {'quantity_available': {'$in': [None, 0]}},
            ]},
        ]})
    if min_gsm is not None or max_gsm is not None:
        gsm_q = {}
        if min_gsm is not None:
            gsm_q['$gte'] = min_gsm
        if max_gsm is not None:
            gsm_q['$lte'] = max_gsm
        if gsm_q:
            query['gsm'] = gsm_q
    if pattern:
        query['pattern'] = {'$regex': f'^{pattern}$', '$options': 'i'}
    if color:
        and_conditions.append({'$or': [
            {'color': {'$regex': color, '$options': 'i'}},
            {'name': {'$regex': color, '$options': 'i'}},
        ]})
    if width:
        query['width'] = {'$regex': width, '$options': 'i'}
    if has_oz_filter:
        and_conditions.append({'ounce': {'$exists': True, '$ne': ''}})
    if min_price is not None or max_price is not None:
        price_q = {}
        if min_price is not None:
            price_q['$gte'] = min_price
        if max_price is not None:
            price_q['$lte'] = max_price
        if price_q:
            query['rate_per_meter'] = price_q
    if composition:
        and_conditions.append({'$or': [
            {'composition': {'$elemMatch': {'material': {'$regex': composition, '$options': 'i'}}}},
            {'composition': {'$regex': composition, '$options': 'i'}},
        ]})
    # Certifications filter — multi-select. Buyer picks e.g. ["bci","grs"] →
    # fabric must carry ALL of those (conservative: "I need BCI AND GRS" is
    # more useful than OR when sourcing compliance-sensitive orders).
    if certifications:
        cert_list = certifications if isinstance(certifications, list) else [
            c.strip() for c in str(certifications).split(",") if c.strip()
        ]
        if cert_list:
            and_conditions.append({'certifications': {'$all': cert_list}})
    if search:
        and_conditions.append({'$or': [
            {'name': {'$regex': search, '$options': 'i'}},
            {'tags': {'$regex': search, '$options': 'i'}},
            {'color': {'$regex': search, '$options': 'i'}},
            {'fabric_code': {'$regex': search, '$options': 'i'}},
            {'seller_sku': {'$regex': search, '$options': 'i'}},
            {'description': {'$regex': search, '$options': 'i'}},
            {'category_name': {'$regex': search, '$options': 'i'}},
            {'fabric_type': {'$regex': search, '$options': 'i'}},
            {'weave_type': {'$regex': search, '$options': 'i'}},
            {'pattern': {'$regex': search, '$options': 'i'}},
            {'composition.material': {'$regex': search, '$options': 'i'}},
            {'seller_company': {'$regex': search, '$options': 'i'}},
        ]})

    if and_conditions:
        query['$and'] = and_conditions
    return query


def _oz_pipeline_stages(oz_min, oz_max):
    """Common stages that turn the ounce string field into a numeric bucket."""
    stages = [
        {'$addFields': {
            '_oz_match': {'$regexFind': {'input': {'$ifNull': ['$ounce', '0']}, 'regex': r'^[\d.]+'}},
        }},
        {'$addFields': {
            '_oz_num': {'$convert': {'input': '$_oz_match.match', 'to': 'double', 'onError': 0, 'onNull': 0}},
        }},
    ]
    oz_cond = {}
    if oz_min is not None:
        oz_cond['$gte'] = oz_min
    if oz_max is not None:
        oz_cond['$lte'] = oz_max
    stages.append({'$match': {'_oz_num': oz_cond}})
    return stages


# ==================== ROUTES ====================

@router.get("/fabrics/filter-options")
async def get_fabric_filter_options():
    """Distinct values for color, pattern, width, composition from visible fabrics."""
    fabrics = await db.fabrics.find(
        {'$or': [
            {'status': 'approved'},
            {'status': {'$exists': False}},
            {'status': None},
        ]},
        {'_id': 0, 'color': 1, 'name': 1, 'pattern': 1, 'width': 1, 'composition': 1, 'category_name': 1, 'certifications': 1},
    ).to_list(5000)

    colors, patterns, widths, compositions = set(), set(), set(), set()
    cert_counts = {}
    has_denim = False
    for f in fabrics:
        c = (f.get('color') or '').strip()
        if c:
            colors.add(c)
        match = re_mod.search(r'Color:\s*([^,]+)', f.get('name', ''))
        if match:
            colors.add(match.group(1).strip())
        p = (f.get('pattern') or '').strip()
        if p:
            patterns.add(p)
        w = (f.get('width') or '').strip()
        if w:
            widths.add(w)
        comp = f.get('composition')
        if isinstance(comp, list):
            for item in comp:
                mat = (item.get('material') or '').strip()
                if mat:
                    compositions.add(normalize_material(mat))
        elif isinstance(comp, str) and comp.strip():
            for part in comp.split(','):
                mat = re_mod.sub(r'\d+%?\s*', '', part).strip()
                if mat:
                    compositions.add(normalize_material(mat))
        cat = (f.get('category_name') or '').lower()
        if 'denim' in cat:
            has_denim = True
        # Per-certification count so sidebar can show "BCI (42)"
        for ck in (f.get('certifications') or []):
            if ck:
                cert_counts[ck] = cert_counts.get(ck, 0) + 1
    # Only surface compositions from the canonical whitelist — prevents
    # stray typos or unknown materials leaking into the B2C dropdown.
    canonical_set = set(CANONICAL_COMPOSITIONS)
    compositions = {c for c in compositions if c in canonical_set}
    return {
        'colors': sorted(colors, key=str.lower),
        'patterns': sorted(patterns, key=str.lower),
        'widths': sorted(widths, key=str.lower),
        'compositions': sorted(compositions, key=str.lower),
        'certifications': cert_counts,
        'has_denim': has_denim,
    }


@router.get("/composition/options")
async def get_composition_options():
    """Canonical composition list used by all forms (Admin, Vendor). Code-owned."""
    return {"options": list(CANONICAL_COMPOSITIONS)}


@router.get("/fabrics", response_model=List[Fabric])
async def get_fabrics(
    category_id: Optional[str] = Query(None),
    seller_id: Optional[str] = Query(None),
    article_id: Optional[str] = Query(None),
    fabric_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_gsm: Optional[int] = Query(None),
    max_gsm: Optional[int] = Query(None),
    pattern: Optional[str] = Query(None),
    color: Optional[str] = Query(None),
    width: Optional[str] = Query(None),
    min_weight_oz: Optional[float] = Query(None),
    max_weight_oz: Optional[float] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    composition: Optional[str] = Query(None),
    bookable_only: Optional[bool] = Query(None),
    sample_available: Optional[bool] = Query(None),
    instant_bookable: Optional[bool] = Query(None),
    enquiry_only: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    include_pending: Optional[bool] = Query(None),
    dedupe_by_article: Optional[bool] = Query(False),
    certifications: Optional[str] = Query(None, description="Comma-separated certification keys e.g. bci,grs"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    optional_admin=Depends(auth_helpers.get_optional_admin),
):
    has_oz = min_weight_oz is not None or max_weight_oz is not None
    cert_list = [c.strip() for c in (certifications or "").split(",") if c.strip()]
    query = _build_fabric_query(
        category_id, seller_id, article_id, fabric_type, search,
        min_gsm, max_gsm, pattern, color, width, min_price, max_price,
        composition, bookable_only, sample_available, instant_bookable,
        enquiry_only, status, include_pending, has_oz,
        certifications=cert_list,
    )

    skip = (page - 1) * limit
    pipeline = [{'$match': query}]
    if has_oz:
        pipeline.extend(_oz_pipeline_stages(min_weight_oz, max_weight_oz))

    # Sort priority (left = highest):
    #   1. image_quality_rank — fabrics with real (Cloudinary/upload) images
    #      first, Unsplash/external second, no-image last. This guarantees
    #      page 1 always leads with photographed inventory; placeholder SKUs
    #      land at the back of the catalog.
    #   2. booking_priority — both > bulk > sample > enquiry
    #   3. created_at desc — newest within each tier
    pipeline.extend([
        {'$addFields': {
            'image_quality_rank': {
                '$switch': {
                    'branches': [
                        # No images at all → rank 2 (last)
                        {'case': {'$or': [
                            {'$eq': [{'$ifNull': ['$images', []]}, []]},
                            {'$eq': [{'$size': {'$ifNull': ['$images', []]}}, 0]},
                        ]}, 'then': 2},
                        # First image is an Unsplash / placeholder URL → rank 1
                        {'case': {'$regexMatch': {
                            'input': {'$ifNull': [{'$arrayElemAt': ['$images', 0]}, '']},
                            'regex': 'unsplash|placeholder|placehold\\.co',
                            'options': 'i',
                        }}, 'then': 1},
                    ],
                    'default': 0,  # real, photographed image
                },
            },
            'booking_priority': {
                '$switch': {
                    'branches': [
                        {'case': {'$and': [
                            {'$eq': ['$is_bookable', True]},
                            {'$gt': [{'$ifNull': ['$quantity_available', 0]}, 0]},
                            {'$gt': [{'$ifNull': ['$sample_price', 0]}, 0]},
                        ]}, 'then': 1},
                        {'case': {'$and': [
                            {'$eq': ['$is_bookable', True]},
                            {'$gt': [{'$ifNull': ['$quantity_available', 0]}, 0]},
                        ]}, 'then': 2},
                        {'case': {'$and': [
                            {'$eq': ['$is_bookable', True]},
                            {'$gt': [{'$ifNull': ['$sample_price', 0]}, 0]},
                        ]}, 'then': 3},
                    ],
                    'default': 4,
                },
            },
        }},
        {'$sort': {'image_quality_rank': 1, 'booking_priority': 1, 'created_at': -1}},
    ])

    if dedupe_by_article:
        # Fetch enough docs to cover multi-vendor collapse, then dedupe in-process.
        # For the current catalog size (<5k SKUs) this is cheap.
        pipeline.append({'$project': {'_id': 0, 'booking_priority': 0, 'image_quality_rank': 0, '_oz_match': 0, '_oz_num': 0}})
        all_fabrics = await db.fabrics.aggregate(pipeline).to_list(5000)
        seen = {}
        ordered = []
        for f in all_fabrics:
            aid = (f.get('article_id') or '').strip()
            if not aid:
                # No article grouping → each SKU stays distinct
                f['vendor_count'] = 1
                ordered.append(f)
                continue
            if aid in seen:
                # Cheaper wins; keep lowest non-null rate_per_meter
                existing = seen[aid]
                cur_rate = f.get('rate_per_meter')
                best_rate = existing.get('rate_per_meter')
                if cur_rate is not None and (best_rate is None or cur_rate < best_rate):
                    # Swap: preserve vendor_count
                    f['vendor_count'] = existing.get('vendor_count', 1) + 1
                    idx = ordered.index(existing)
                    ordered[idx] = f
                    seen[aid] = f
                else:
                    existing['vendor_count'] = existing.get('vendor_count', 1) + 1
            else:
                f['vendor_count'] = 1
                seen[aid] = f
                ordered.append(f)
        fabrics = ordered[skip:skip + limit]
    else:
        pipeline.extend([
            {'$skip': skip},
            {'$limit': limit},
            {'$project': {'_id': 0, 'booking_priority': 0, 'image_quality_rank': 0, '_oz_match': 0, '_oz_num': 0}},
        ])
        fabrics = await db.fabrics.aggregate(pipeline).to_list(limit)

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
        # Vendor identity policy:
        # - Admins (logged in via JWT) see full seller_name + seller_company
        #   so they can manage the catalog from /admin/fabrics.
        # - Public/unauthenticated visitors see only seller_code (LS-XXXXX)
        #   to prevent buyers from bypassing the marketplace.
        if optional_admin:
            fabric['seller_name'] = seller['name'] if seller else ''
            fabric['seller_company'] = seller['company_name'] if seller else ''
        else:
            fabric['seller_name'] = ''
            fabric['seller_company'] = ''
        fabric['seller_code'] = seller.get('seller_code', '') if seller else ''
        if 'seller_id' not in fabric:
            fabric['seller_id'] = ''
    return fabrics


@router.get("/fabrics/count")
async def get_fabrics_count(
    category_id: Optional[str] = Query(None),
    seller_id: Optional[str] = Query(None),
    article_id: Optional[str] = Query(None),
    fabric_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_gsm: Optional[int] = Query(None),
    max_gsm: Optional[int] = Query(None),
    pattern: Optional[str] = Query(None),
    color: Optional[str] = Query(None),
    width: Optional[str] = Query(None),
    min_weight_oz: Optional[float] = Query(None),
    max_weight_oz: Optional[float] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    composition: Optional[str] = Query(None),
    bookable_only: Optional[bool] = Query(None),
    sample_available: Optional[bool] = Query(None),
    instant_bookable: Optional[bool] = Query(None),
    enquiry_only: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    include_pending: Optional[bool] = Query(None),
    dedupe_by_article: Optional[bool] = Query(False),
    certifications: Optional[str] = Query(None),
):
    has_oz = min_weight_oz is not None or max_weight_oz is not None
    cert_list = [c.strip() for c in (certifications or "").split(",") if c.strip()]
    query = _build_fabric_query(
        category_id, seller_id, article_id, fabric_type, search,
        min_gsm, max_gsm, pattern, color, width, min_price, max_price,
        composition, bookable_only, sample_available, instant_bookable,
        enquiry_only, status, include_pending, has_oz,
        certifications=cert_list,
    )
    if dedupe_by_article:
        # Count unique (article_id if present, else doc _id) groups
        pipeline = [{'$match': query}]
        if has_oz:
            pipeline.extend(_oz_pipeline_stages(min_weight_oz, max_weight_oz))
        pipeline.extend([
            {'$group': {
                '_id': {'$cond': [
                    {'$or': [{'$eq': [{'$ifNull': ['$article_id', '']}, '']}]},
                    '$id',
                    '$article_id',
                ]},
            }},
            {'$count': 'total'},
        ])
        result = await db.fabrics.aggregate(pipeline).to_list(1)
        count = result[0]['total'] if result else 0
    elif has_oz:
        count_pipeline = [{'$match': query}]
        count_pipeline.extend(_oz_pipeline_stages(min_weight_oz, max_weight_oz))
        count_pipeline.append({'$count': 'total'})
        result = await db.fabrics.aggregate(count_pipeline).to_list(1)
        count = result[0]['total'] if result else 0
    else:
        count = await db.fabrics.count_documents(query)
    return {'count': count}


@router.get("/fabrics/{fabric_id_or_slug}", response_model=Fabric)
async def get_fabric(fabric_id_or_slug: str, optional_admin=Depends(auth_helpers.get_optional_admin)):
    fabric = await db.fabrics.find_one({'id': fabric_id_or_slug}, {'_id': 0})
    if not fabric:
        fabric = await db.fabrics.find_one({'slug': fabric_id_or_slug}, {'_id': 0})
    if not fabric and len(fabric_id_or_slug) > 7 and '-' in fabric_id_or_slug:
        slug_prefix = fabric_id_or_slug.rsplit('-', 1)[0]
        if slug_prefix:
            fabric = await db.fabrics.find_one({'slug': {'$regex': f'^{slug_prefix}'}}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')

    fabric_utils.normalize_fabric(fabric)
    category = await db.categories.find_one({'id': fabric.get('category_id', '')}, {'_id': 0})
    fabric['category_name'] = category['name'] if category else ''

    if fabric.get('seller_id'):
        seller = await db.sellers.find_one({'id': fabric['seller_id']}, {'_id': 0})
        # Admin browsing /admin/fabrics PDP sees full vendor info; public
        # visitors see only seller_code.
        if optional_admin:
            fabric['seller_name'] = seller['name'] if seller else ''
            fabric['seller_company'] = seller['company_name'] if seller else ''
        else:
            fabric['seller_name'] = ''
            fabric['seller_company'] = ''
        fabric['seller_code'] = seller.get('seller_code', '') if seller else ''
    else:
        fabric['seller_id'] = ''
        fabric['seller_name'] = ''
        fabric['seller_company'] = ''
        fabric['seller_code'] = ''
    return fabric


@router.post("/fabrics", response_model=Fabric)
async def create_fabric(data: FabricCreate, admin=Depends(auth_helpers.get_current_admin)):
    category = await db.categories.find_one({'id': data.category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=400, detail='Category not found')

    # Hard-required: dispatch_timeline must be one of the preset values for the
    # selected stock_type. Older drafts are migrated by the backfill endpoint.
    data.dispatch_timeline = validate_dispatch_timeline(data.dispatch_timeline, data.stock_type)

    # Hard-required: every fabric must be attributed to a registered supplier.
    # Unattributed inventory pollutes the catalog and breaks downstream
    # order/credit/dispatch flows that branch on seller_id.
    if not data.seller_id:
        raise HTTPException(status_code=400, detail='Supplier is required — please select a supplier for this fabric')
    seller = await db.sellers.find_one({'id': data.seller_id}, {'_id': 0})
    if not seller:
        raise HTTPException(status_code=400, detail='Selected supplier not found')

    fabric_id = str(uuid.uuid4())
    fabric_code = await fabric_utils.generate_fabric_code()
    slug = generate_slug(data.name, fabric_id)

    payload = data.model_dump()
    # Normalise every composition material to canonical form on write
    if payload.get('composition'):
        from composition_utils import canonicalize_composition
        payload['composition'] = canonicalize_composition(payload['composition'])

    fabric_doc = {
        'id': fabric_id,
        'fabric_code': fabric_code,
        'slug': slug,
        **payload,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.fabrics.insert_one(fabric_doc)
    fabric_doc.pop('_id', None)

    fabric_doc['category_name'] = category['name']
    fabric_doc['seller_name'] = seller['name'] if seller else ''
    fabric_doc['seller_company'] = seller['company_name'] if seller else ''
    return Fabric(**fabric_doc)


@router.put("/fabrics/{fabric_id}", response_model=Fabric)
async def update_fabric(fabric_id: str, data: FabricUpdate, admin=Depends(auth_helpers.get_current_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')

    # If either dispatch_timeline or stock_type is being modified, validate the
    # combination against the preset list. We need the existing fabric to know
    # the effective stock_type after the merge.
    if 'dispatch_timeline' in update_data or 'stock_type' in update_data:
        existing = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0, 'stock_type': 1, 'dispatch_timeline': 1})
        if not existing:
            raise HTTPException(status_code=404, detail='Fabric not found')
        effective_stock = update_data.get('stock_type', existing.get('stock_type', 'ready_stock'))
        effective_disp = update_data.get('dispatch_timeline', existing.get('dispatch_timeline', ''))
        update_data['dispatch_timeline'] = validate_dispatch_timeline(effective_disp, effective_stock)

    if 'name' in update_data:
        update_data['slug'] = generate_slug(update_data['name'], fabric_id)

    # Normalise composition on every write so the DB stays clean going forward
    if 'composition' in update_data:
        from composition_utils import canonicalize_composition
        update_data['composition'] = canonicalize_composition(update_data['composition'])

    # Defence-in-depth: never let an admin clear seller_id on an existing
    # fabric — every fabric must remain attributed to a registered supplier.
    if 'seller_id' in update_data:
        if not update_data['seller_id']:
            raise HTTPException(status_code=400, detail='Supplier cannot be removed — every fabric must have a supplier')
        seller = await db.sellers.find_one({'id': update_data['seller_id']}, {'_id': 0})
        if not seller:
            raise HTTPException(status_code=400, detail='Selected supplier not found')

    if 'category_id' in update_data:
        category = await db.categories.find_one({'id': update_data['category_id']}, {'_id': 0})
        if not category:
            raise HTTPException(status_code=400, detail='Category not found')

    result = await db.fabrics.update_one({'id': fabric_id}, {'$set': update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Fabric not found')

    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    fabric_utils.normalize_fabric(fabric)
    category = await db.categories.find_one({'id': fabric.get('category_id', '')}, {'_id': 0})
    fabric['category_name'] = category['name'] if category else ''

    if fabric.get('seller_id'):
        seller = await db.sellers.find_one({'id': fabric['seller_id']}, {'_id': 0})
        fabric['seller_name'] = seller['name'] if seller else ''
        fabric['seller_company'] = seller['company_name'] if seller else ''
        fabric['seller_code'] = seller.get('seller_code', '') if seller else ''
    else:
        fabric['seller_id'] = ''
        fabric['seller_name'] = ''
        fabric['seller_company'] = ''
        fabric['seller_code'] = ''
    return fabric


@router.delete("/fabrics/{fabric_id}")
async def delete_fabric(fabric_id: str, admin=Depends(auth_helpers.get_current_admin)):
    result = await db.fabrics.delete_one({'id': fabric_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Fabric not found')
    return {'message': 'Fabric deleted'}


@router.post("/fabrics/bulk-assign-seller")
async def bulk_assign_seller(data: dict, admin=Depends(auth_helpers.get_current_admin)):
    seller_id = data.get('seller_id')
    if not seller_id:
        raise HTTPException(status_code=400, detail='seller_id is required')

    seller = await db.sellers.find_one({'id': seller_id}, {'_id': 0})
    if not seller:
        raise HTTPException(status_code=404, detail='Seller not found')

    result = await db.fabrics.update_many(
        {'$or': [
            {'seller_id': {'$exists': False}},
            {'seller_id': None},
            {'seller_id': ''},
        ]},
        {'$set': {
            'seller_id': seller_id,
            'seller_name': seller.get('name', ''),
            'seller_company': seller.get('company_name', ''),
        }},
    )
    return {
        'message': f'Assigned {result.modified_count} fabrics to {seller.get("company_name", seller.get("name", ""))}',
        'modified_count': result.modified_count,
    }


@router.post("/fabrics/reassign-seller")
async def reassign_fabric_seller(data: dict, admin=Depends(auth_helpers.get_current_admin)):
    fabric_ids = data.get('fabric_ids', [])
    seller_id = data.get('seller_id')
    if not fabric_ids or not seller_id:
        raise HTTPException(status_code=400, detail='fabric_ids and seller_id are required')

    seller = await db.sellers.find_one({'id': seller_id}, {'_id': 0})
    if not seller:
        raise HTTPException(status_code=404, detail='Seller not found')

    result = await db.fabrics.update_many(
        {'id': {'$in': fabric_ids}},
        {'$set': {
            'seller_id': seller_id,
            'seller_name': seller.get('name', ''),
            'seller_company': seller.get('company_name', ''),
        }},
    )
    return {
        'message': f'Reassigned {result.modified_count} fabrics to {seller.get("company_name", seller.get("name", ""))}',
        'modified_count': result.modified_count,
    }


@router.get("/fabrics/{fabric_id}/other-sellers")
async def get_other_sellers_for_fabric(fabric_id: str):
    """Other vendor listings for the same product (via shared article_id)."""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')

    article_id = fabric.get('article_id', '')
    if not article_id:
        return []

    others = await db.fabrics.find(
        {'article_id': article_id, 'id': {'$ne': fabric_id}, 'status': 'approved'},
        {'_id': 0},
    ).to_list(20)

    for f in others:
        if f.get('seller_id'):
            seller = await db.sellers.find_one({'id': f['seller_id']}, {'_id': 0})
            if seller:
                f['seller_name'] = seller.get('name', '')
                f['seller_company'] = seller.get('company_name', '')
                f['seller_city'] = seller.get('city', '')
                f['seller_state'] = seller.get('state', '')

    others.sort(key=lambda x: x.get('rate_per_meter') or 999999)
    return others


@router.post("/migrate/compositions")
async def migrate_compositions(apply: bool = Query(False), admin=Depends(auth_helpers.get_current_admin)):
    """
    Normalise every fabric's `composition` field to the canonical list.
    Dry-run by default — returns the plan of changes.
    Pass `?apply=true` to actually write the updates.
    """
    from composition_utils import canonicalize_composition, CANONICAL_COMPOSITIONS
    fabrics = await db.fabrics.find({}, {'_id': 0, 'id': 1, 'name': 1, 'composition': 1}).to_list(length=10000)
    plan = []
    unchanged = 0
    for f in fabrics:
        original = f.get('composition') or []
        canonical = canonicalize_composition(original)
        # Compare normalized JSON representations
        before_key = str(sorted(
            [(i.get('material', ''), i.get('percentage', 0)) for i in original]
            if isinstance(original, list) else []
        ))
        after_key = str(sorted([(i['material'], i['percentage']) for i in canonical]))
        if before_key != after_key:
            plan.append({
                'fabric_id': f['id'],
                'name': f.get('name', ''),
                'before': original,
                'after': canonical,
            })
        else:
            unchanged += 1

    if apply and plan:
        for change in plan:
            await db.fabrics.update_one(
                {'id': change['fabric_id']},
                {'$set': {'composition': change['after']}},
            )
    return {
        'total_fabrics': len(fabrics),
        'unchanged': unchanged,
        'changes_count': len(plan),
        'applied': apply,
        'sample_changes': plan[:20],
        'canonical_compositions': list(CANONICAL_COMPOSITIONS),
    }

