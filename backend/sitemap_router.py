"""
Dynamic /api/sitemap.xml generator. Moved out of server.py for clarity.
"""
from fastapi import APIRouter
from fastapi.responses import Response
from datetime import datetime, timezone
import re as re_mod

router = APIRouter(prefix="/api", tags=["sitemap"])
db = None


def set_db(database):
    global db
    db = database


def _parse_date(date_str: str) -> str:
    try:
        if isinstance(date_str, str):
            return date_str[:10]
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')
    except Exception:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _slugify(text: str) -> str:
    s = (text or "").lower().strip()
    s = re_mod.sub(r'[^a-z0-9\s-]', '', s)
    s = re_mod.sub(r'[\s_]+', '-', s)
    s = re_mod.sub(r'-+', '-', s)
    return s.strip('-')


async def _build_sitemap_xml() -> str:
    base_url = "https://locofast.com"
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # Include any fabric that's NOT explicitly archived or rejected.
    # Earlier we filtered `status == 'approved'` which silently excluded
    # 191 of 196 live fabrics (their status field was never set), so they
    # weren't in the sitemap → Google saw them as "not indexed".
    fabrics = await db.fabrics.find(
        {
            '$and': [
                {'$or': [{'is_active': {'$ne': False}}, {'is_active': {'$exists': False}}]},
                {'status': {'$nin': ['archived', 'rejected', 'draft']}},
            ]
        },
        {'_id': 0, 'id': 1, 'slug': 1, 'created_at': 1}
    ).to_list(length=10000)

    # Respect noindex flag in fabric_seo — admin can opt-out individual
    # fabric pages from being indexed (e.g. discontinued SKUs we still
    # want to keep live for direct links).
    noindex_ids = {
        s['fabric_id']
        async for s in db.fabric_seo.find({'is_indexed': False}, {'_id': 0, 'fabric_id': 1})
    }
    fabrics = [f for f in fabrics if f['id'] not in noindex_ids]
    collections = await db.collections.find({}, {'id': 1, 'created_at': 1}).to_list(length=100)
    posts = await db.posts.find({'status': 'published'}, {'slug': 1, 'updated_at': 1}).to_list(length=500)
    categories = await db.categories.find({}, {'_id': 0}).to_list(length=100)
    sellers = await db.sellers.find(
        {'is_active': {'$ne': False}},
        {'_id': 0, 'id': 1, 'company_name': 1, 'name': 1, 'state': 1, 'category_ids': 1}
    ).to_list(length=500)
    cat_map = {c['id']: c['name'] for c in categories}

    static_pages = [
        {'loc': '/', 'priority': '1.0', 'changefreq': 'weekly'},
        {'loc': '/fabrics', 'priority': '0.9', 'changefreq': 'daily'},
        {'loc': '/collections', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': '/suppliers', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': '/sell', 'priority': '0.7', 'changefreq': 'monthly'},
        {'loc': '/about-us', 'priority': '0.6', 'changefreq': 'monthly'},
        {'loc': '/customers', 'priority': '0.6', 'changefreq': 'monthly'},
        {'loc': '/how-it-works', 'priority': '0.6', 'changefreq': 'monthly'},
        {'loc': '/assisted-sourcing', 'priority': '0.7', 'changefreq': 'monthly'},
        {'loc': '/contact', 'priority': '0.5', 'changefreq': 'monthly'},
        {'loc': '/faq', 'priority': '0.5', 'changefreq': 'monthly'},
        {'loc': '/blog', 'priority': '0.7', 'changefreq': 'weekly'},
        {'loc': '/tools', 'priority': '0.6', 'changefreq': 'monthly'},
        {'loc': '/tools/gst-calculator', 'priority': '0.5', 'changefreq': 'monthly'},
        {'loc': '/tools/profit-margin-calculator', 'priority': '0.5', 'changefreq': 'monthly'},
        {'loc': '/tools/gsm-calculator', 'priority': '0.5', 'changefreq': 'monthly'},
        {'loc': '/tools/cbm-calculator', 'priority': '0.5', 'changefreq': 'monthly'},
    ]

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

    for page in static_pages:
        xml += f'''  <url>
    <loc>{base_url}{page['loc']}</loc>
    <changefreq>{page['changefreq']}</changefreq>
    <priority>{page['priority']}</priority>
  </url>\n'''

    for fabric in fabrics:
        last_mod = _parse_date(fabric.get('created_at', ''))
        fabric_path = fabric.get('slug') or fabric['id']
        xml += f'''  <url>
    <loc>{base_url}/fabrics/{fabric_path}</loc>
    <lastmod>{last_mod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>\n'''

    for collection in collections:
        xml += f'''  <url>
    <loc>{base_url}/collections/{collection['id']}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>\n'''

    for post in posts:
        last_mod = _parse_date(post.get('updated_at', ''))
        xml += f'''  <url>
    <loc>{base_url}/blog/{post['slug']}</loc>
    <lastmod>{last_mod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>\n'''

    for cat in categories:
        xml += f'''  <url>
    <loc>{base_url}/fabrics?category={cat['id']}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>\n'''

    for seller in sellers:
        company = seller.get('company_name') or seller.get('name', '')
        state = seller.get('state', '')
        s_cat_ids = seller.get('category_ids', [])
        if not company or not state:
            continue
        company_slug = _slugify(company)
        state_slug = _slugify(state)
        cat_name = cat_map.get(s_cat_ids[0], 'fabrics') if s_cat_ids else 'fabrics'
        cat_slug = _slugify(cat_name)
        xml += f'''  <url>
    <loc>{base_url}/suppliers/{cat_slug}/{state_slug}/{company_slug}/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>\n'''

    xml += '</urlset>'
    return xml


@router.get("/sitemap.xml", response_class=Response)
async def get_sitemap():
    """Generate dynamic sitemap.xml — accessible at /api/sitemap.xml"""
    return Response(content=await _build_sitemap_xml(), media_type="application/xml")
