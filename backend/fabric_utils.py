"""
Fabric utilities — shared helpers used by fabric_router, article_router,
collection_router, and any admin-facing route that needs fabric normalization
or unique code generation.
"""
import random
import re
import string

db = None


def set_db(database):
    global db
    db = database


def normalize_fabric(fabric: dict) -> dict:
    """Normalize legacy fabric data to current schema."""
    # Handle legacy string composition - convert to list format
    if isinstance(fabric.get('composition'), str):
        comp_str = fabric['composition']
        parsed = []
        matches = re.findall(r'(\d+)%\s*([^,]+)', comp_str)
        if matches:
            for percentage, material in matches:
                parsed.append({'material': material.strip(), 'percentage': int(percentage)})
            fabric['composition'] = parsed
        else:
            fabric['composition'] = [{'material': comp_str, 'percentage': 100}] if comp_str else []
    elif not fabric.get('composition'):
        fabric['composition'] = []

    # Handle tags - must be a list
    if not isinstance(fabric.get('tags'), list):
        raw = fabric.get('tags', '')
        if isinstance(raw, str) and raw:
            fabric['tags'] = [t.strip() for t in raw.split(',') if t.strip()]
        else:
            fabric['tags'] = []

    # Defaults for missing / legacy fields — matches historical behaviour exactly
    if 'pattern' not in fabric:
        fabric['pattern'] = 'Solid'
    if 'starting_price' not in fabric:
        fabric['starting_price'] = ''
    if 'videos' not in fabric:
        fabric['videos'] = []
    elif not isinstance(fabric.get('videos'), list):
        fabric['videos'] = []
    if 'warp_count' not in fabric:
        fabric['warp_count'] = ''
    if 'weft_count' not in fabric:
        fabric['weft_count'] = ''
    if 'yarn_count' not in fabric:
        fabric['yarn_count'] = ''
    if 'ounce' not in fabric:
        fabric['ounce'] = ''
    if 'weight_unit' not in fabric:
        fabric['weight_unit'] = 'gsm'
    if 'gsm' not in fabric:
        fabric['gsm'] = None
    if 'fabric_code' not in fabric or not fabric['fabric_code']:
        fabric['fabric_code'] = ''
    if 'availability' not in fabric:
        fabric['availability'] = []
    elif not isinstance(fabric.get('availability'), list):
        fabric['availability'] = []
    if 'quantity_available' not in fabric:
        fabric['quantity_available'] = None
    if 'rate_per_meter' not in fabric:
        fabric['rate_per_meter'] = None
    if 'dispatch_timeline' not in fabric:
        fabric['dispatch_timeline'] = ''
    if 'is_bookable' not in fabric:
        fabric['is_bookable'] = False
    if 'weft_shrinkage' not in fabric:
        fabric['weft_shrinkage'] = None
    if 'stretch_percentage' not in fabric:
        fabric['stretch_percentage'] = None
    if 'seller_sku' not in fabric:
        fabric['seller_sku'] = ''
    if 'article_id' not in fabric:
        fabric['article_id'] = ''
    if 'sample_price' not in fabric:
        fabric['sample_price'] = None
    if 'pricing_tiers' not in fabric:
        fabric['pricing_tiers'] = []
    if 'stock_type' not in fabric:
        fabric['stock_type'] = 'ready_stock'
    if 'sample_delivery_days' not in fabric:
        fabric['sample_delivery_days'] = ''
    if 'bulk_delivery_days' not in fabric:
        fabric['bulk_delivery_days'] = ''
    if not isinstance(fabric.get('images'), list):
        fabric['images'] = []
    if 'status' not in fabric or fabric.get('status') is None:
        fabric['status'] = None
    if 'fabric_type' not in fabric:
        fabric['fabric_type'] = ''
    if 'hsn_code' not in fabric:
        fabric['hsn_code'] = ''
    if 'has_multiple_colors' not in fabric:
        fabric['has_multiple_colors'] = False
    if 'color_variants' not in fabric:
        fabric['color_variants'] = []
    if 'color' not in fabric:
        fabric['color'] = ''
    if 'moq' not in fabric:
        fabric['moq'] = ''
    if 'description' not in fabric:
        fabric['description'] = ''
    if 'width' not in fabric:
        fabric['width'] = ''
    if 'finish' not in fabric:
        fabric['finish'] = ''
    if 'created_at' not in fabric:
        fabric['created_at'] = ''
    # Slug — use stored slug or fall back to fabric ID (never generate random)
    if 'slug' not in fabric or not fabric.get('slug'):
        fabric['slug'] = fabric.get('id', '')

    return fabric


async def generate_fabric_code() -> str:
    """Generate a unique fabric code like LF-XXXXX."""
    while True:
        code = 'LF-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        if not await db.fabrics.find_one({'fabric_code': code}):
            return code


async def generate_seller_code() -> str:
    """Generate a unique seller code like LS-XXXXX."""
    while True:
        code = 'LS-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        if not await db.sellers.find_one({'seller_code': code}):
            return code


async def generate_article_code() -> str:
    """Generate a unique article code like ART-XXXXX."""
    while True:
        code = 'ART-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        if not await db.articles.find_one({'article_code': code}):
            return code
