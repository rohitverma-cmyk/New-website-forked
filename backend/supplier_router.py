"""
Supplier Pages Router - Handles SEO-preserved supplier pages and prerendering for bots
URL Pattern: /suppliers/{category}/{state}/{company-slug}/id={old_id}
"""
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse
from typing import Optional
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'test_database')
if db_name and db_name.startswith('"') and db_name.endswith('"'):
    db_name = db_name[1:-1]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Bot User-Agent patterns for prerender detection
BOT_AGENTS = [
    'googlebot', 'bingbot', 'yandex', 'baiduspider', 'facebookexternalhit',
    'twitterbot', 'rogerbot', 'linkedinbot', 'embedly', 'quora link preview',
    'showyoubot', 'outbrain', 'pinterest', 'slackbot', 'vkshare',
    'w3c_validator', 'whatsapp', 'semrushbot', 'ahrefsbot'
]

def is_bot(user_agent: str) -> bool:
    """Detect if request is from a search engine bot"""
    ua_lower = (user_agent or '').lower()
    return any(bot in ua_lower for bot in BOT_AGENTS)

def slugify(text: str) -> str:
    """Convert text to URL-friendly slug"""
    slug = text.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')

def parse_composition_str(composition) -> str:
    """Convert composition to readable string"""
    if isinstance(composition, str):
        return composition
    if isinstance(composition, list):
        parts = []
        for c in composition:
            if isinstance(c, dict) and c.get('material'):
                parts.append(f"{c.get('percentage', 0)}% {c.get('material', '')}")
        return ", ".join(parts)
    return ""


async def find_supplier_by_slug(category_slug: str, state_slug: str, company_slug: str):
    """Find a seller matching the URL slugs"""
    sellers = await db.sellers.find({}, {'_id': 0}).to_list(500)
    
    best_match = None
    for seller in sellers:
        # Match company slug
        seller_slug = slugify(seller.get('company_name', '') or seller.get('name', ''))
        if seller_slug == company_slug or slugify(seller.get('name', '')) == company_slug:
            # Check state match
            seller_state = slugify(seller.get('state', ''))
            if seller_state == state_slug or not seller.get('state'):
                best_match = seller
                break
    
    return best_match


async def get_supplier_fabrics(seller_id: str, category_slug: str = None):
    """Get fabrics for a specific seller, optionally filtered by category"""
    query = {'seller_id': seller_id}
    
    # If category is specified, try to match
    if category_slug:
        categories = await db.categories.find({}, {'_id': 0}).to_list(100)
        for cat in categories:
            if slugify(cat['name']) == category_slug or category_slug in slugify(cat['name']):
                query['category_id'] = cat['id']
                break
    
    fabrics = await db.fabrics.find(query, {'_id': 0}).limit(20).to_list(20)
    
    # Enrich with category names
    cat_ids = list(set(f.get('category_id', '') for f in fabrics if f.get('category_id')))
    categories = await db.categories.find({'id': {'$in': cat_ids}}, {'_id': 0}).to_list(100) if cat_ids else []
    cat_map = {c['id']: c['name'] for c in categories}
    
    for fabric in fabrics:
        fabric['category_name'] = cat_map.get(fabric.get('category_id', ''), '')
        fabric['composition_str'] = parse_composition_str(fabric.get('composition', ''))
    
    return fabrics


async def get_related_suppliers(state: str, category_slug: str, exclude_id: str = None):
    """Get related suppliers from the same state/category"""
    sellers = await db.sellers.find({'is_active': {'$ne': False}}, {'_id': 0}).to_list(100)
    related = []
    for s in sellers:
        if s.get('id') == exclude_id:
            continue
        if slugify(s.get('state', '')) == state:
            related.append(s)
    return related[:6]


# ==================== API ENDPOINTS ====================

@router.get("/lookup/{category}/{state}/{slug}")
async def lookup_supplier(category: str, state: str, slug: str):
    """API endpoint to look up a supplier by URL components"""
    seller = await find_supplier_by_slug(category, state, slug)
    
    if not seller:
        # Return a contextual fallback instead of 404
        # This is important for SEO — we serve relevant content even if seller isn't in our DB
        categories = await db.categories.find({}, {'_id': 0}).to_list(100)
        cat_match = None
        for c in categories:
            if category in slugify(c['name']):
                cat_match = c
                break
        
        # Get fabrics from this category in this state area
        query = {}
        if cat_match:
            query['category_id'] = cat_match['id']
        
        fabrics = await db.fabrics.find(query, {'_id': 0}).limit(12).to_list(12)
        for f in fabrics:
            f['composition_str'] = parse_composition_str(f.get('composition', ''))
        
        # Get sellers from the state
        all_sellers = await db.sellers.find({'is_active': {'$ne': False}}, {'_id': 0}).to_list(100)
        state_sellers = [s for s in all_sellers if slugify(s.get('state', '')) == state]
        
        state_display = state.replace('-', ' ').title()
        category_display = category.replace('-', ' ').title()
        company_display = slug.replace('-', ' ').title()
        
        return {
            "found": False,
            "company_name": company_display,
            "category": category_display,
            "state": state_display,
            "category_slug": category,
            "state_slug": state,
            "message": f"Explore {category_display} suppliers in {state_display}",
            "fabrics": fabrics[:12],
            "related_suppliers": state_sellers[:6],
            "total_fabrics": len(fabrics),
            "meta": {
                "title": f"{company_display} - {category_display} Fabric Supplier in {state_display} | Locofast",
                "description": f"Source {category_display.lower()} fabrics from verified suppliers in {state_display}. Browse catalog, request samples, and place bulk orders on Locofast.",
                "canonical": f"/suppliers/{category}/{state}/{slug}/"
            }
        }
    
    # Found the seller - get their fabrics
    fabrics = await get_supplier_fabrics(seller['id'], category)
    related = await get_related_suppliers(state, category, seller.get('id'))
    
    state_display = seller.get('state', state.replace('-', ' ').title())
    city_display = seller.get('city', '')
    category_display = category.replace('-', ' ').title()
    
    # Get category names for seller
    cat_ids = seller.get('category_ids', [])
    categories = await db.categories.find({'id': {'$in': cat_ids}}, {'_id': 0}).to_list(100) if cat_ids else []
    category_names = [c['name'] for c in categories]
    
    return {
        "found": True,
        "seller": {
            "id": seller['id'],
            "name": seller.get('name', ''),
            "company_name": seller.get('company_name', ''),
            "description": seller.get('description', ''),
            "city": city_display,
            "state": state_display,
            "contact_email": seller.get('contact_email', ''),
            "seller_code": seller.get('seller_code', ''),
            "logo_url": seller.get('logo_url', ''),
            "category_names": category_names,
        },
        "category": category_display,
        "state": state_display,
        "category_slug": category,
        "state_slug": state,
        "fabrics": fabrics,
        "related_suppliers": related,
        "total_fabrics": len(fabrics),
        "meta": {
            "title": f"{seller.get('company_name', seller.get('name', ''))} - {category_display} Supplier in {state_display} | Locofast",
            "description": f"{seller.get('company_name', '')} is a verified {category_display.lower()} fabric supplier in {city_display}, {state_display}. Browse {len(fabrics)} fabrics, request samples, and source in bulk on Locofast.",
            "canonical": f"/suppliers/{category}/{state}/{slug}/"
        }
    }


@router.get("/prerender/{category}/{state}/{path:path}")
async def prerender_supplier_page(request: Request, category: str, state: str, path: str):
    """
    Pre-rendered HTML for search engine bots.
    Returns complete HTML with all content visible in page source.
    In production, nginx/proxy routes bot requests here instead of to React SPA.
    """
    # Extract slug from path (handles both "company-slug" and "company-slug/id=1234")
    slug = path.split('/')[0] if '/' in path else path
    
    # Look up supplier data
    data = await lookup_supplier(category, state, slug)
    
    meta = data.get('meta', {})
    title = meta.get('title', 'Supplier | Locofast')
    description = meta.get('description', '')
    canonical = meta.get('canonical', f'/suppliers/{category}/{state}/{slug}/')
    
    state_display = data.get('state', state.replace('-', ' ').title())
    category_display = data.get('category', category.replace('-', ' ').title())
    
    # Build fabric cards HTML
    fabrics_html = ""
    for f in data.get('fabrics', []):
        img = f.get('images', [''])[0] if f.get('images') else ''
        img_tag = f'<img src="{img}" alt="{f.get("name", "")} fabric" width="300" height="300" loading="lazy" />' if img else ''
        comp = f.get('composition_str', '') or parse_composition_str(f.get('composition', ''))
        gsm = f.get('gsm', '')
        
        fabrics_html += f"""
        <div class="fabric-card">
            {img_tag}
            <h3>{f.get('name', '')}</h3>
            <p class="fabric-specs">{comp}{f' | {gsm} GSM' if gsm else ''}</p>
            <p class="fabric-category">{f.get('category_name', '')}</p>
            <a href="/fabrics/{f.get('id', '')}">View Details</a>
        </div>
        """
    
    # Build related suppliers HTML
    related_html = ""
    for s in data.get('related_suppliers', []):
        s_slug = slugify(s.get('company_name', '') or s.get('name', ''))
        s_state = slugify(s.get('state', state))
        related_html += f"""
        <li>
            <a href="/suppliers/{category}/{s_state}/{s_slug}/">{s.get('company_name', s.get('name', ''))}</a>
            {f' - {s.get("city", "")}, {s.get("state", "")}' if s.get('city') else ''}
        </li>
        """
    
    # Build seller info section
    seller_info = ""
    if data.get('found') and data.get('seller'):
        seller = data['seller']
        seller_info = f"""
        <section class="supplier-profile">
            <h2>{seller.get('company_name', seller.get('name', ''))}</h2>
            <p class="location">{seller.get('city', '')}{', ' + seller.get('state', '') if seller.get('state') else ''}</p>
            {f'<p class="description">{seller.get("description", "")}</p>' if seller.get('description') else ''}
            <div class="specializations">
                <strong>Specializations:</strong> {', '.join(seller.get('category_names', []))}
            </div>
        </section>
        """
    else:
        company_name = data.get('company_name', slug.replace('-', ' ').title())
        seller_info = f"""
        <section class="supplier-profile">
            <h2>{company_name}</h2>
            <p class="location">{state_display}</p>
            <p>Explore {category_display.lower()} fabrics from verified suppliers in {state_display}.</p>
        </section>
        """

    # Schema.org structured data
    schema_json = f"""
    {{
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "{data.get('seller', {}).get('company_name', data.get('company_name', ''))}",
        "description": "{description}",
        "address": {{
            "@type": "PostalAddress",
            "addressRegion": "{state_display}",
            "addressCountry": "IN"
        }},
        "url": "https://locofast.com{canonical}",
        "parentOrganization": {{
            "@type": "Organization",
            "name": "Locofast",
            "url": "https://locofast.com"
        }}
    }}
    """

    # Complete pre-rendered HTML
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{description}">
    <link rel="canonical" href="https://locofast.com{canonical}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:type" content="business.business">
    <meta property="og:url" content="https://locofast.com{canonical}">
    <meta name="robots" content="index, follow">
    <script type="application/ld+json">{schema_json}</script>
    <style>
        body {{ font-family: Inter, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }}
        .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
        .breadcrumb {{ color: #666; margin-bottom: 20px; }}
        .breadcrumb a {{ color: #2563EB; text-decoration: none; }}
        .supplier-profile {{ background: #f8fafc; padding: 32px; border-radius: 12px; margin-bottom: 32px; }}
        .supplier-profile h2 {{ margin: 0 0 8px; font-size: 28px; }}
        .location {{ color: #666; margin-bottom: 12px; }}
        .fabrics-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 24px; }}
        .fabric-card {{ border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }}
        .fabric-card img {{ width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }}
        .fabric-card h3 {{ font-size: 16px; margin: 12px 0 4px; }}
        .fabric-specs {{ color: #666; font-size: 14px; }}
        .fabric-category {{ color: #2563EB; font-size: 13px; }}
        .cta-section {{ background: #2563EB; color: white; padding: 40px; border-radius: 12px; text-align: center; margin: 40px 0; }}
        .cta-section a {{ color: white; background: #1d4ed8; padding: 12px 32px; border-radius: 8px; text-decoration: none; display: inline-block; margin-top: 16px; }}
        .related-suppliers {{ margin: 40px 0; }}
        .related-suppliers ul {{ list-style: none; padding: 0; }}
        .related-suppliers li {{ padding: 8px 0; border-bottom: 1px solid #eee; }}
        .related-suppliers a {{ color: #2563EB; text-decoration: none; }}
        h1 {{ font-size: 32px; margin-bottom: 8px; }}
    </style>
</head>
<body>
    <div class="container">
        <nav class="breadcrumb">
            <a href="/">Home</a> &raquo;
            <a href="/suppliers/">Suppliers</a> &raquo;
            <a href="/suppliers/{category}/">{category_display}</a> &raquo;
            <a href="/suppliers/{category}/{state}/">{state_display}</a> &raquo;
            <span>{data.get('seller', {}).get('company_name', data.get('company_name', ''))}</span>
        </nav>
        
        <h1>{category_display} Fabric Supplier in {state_display}</h1>
        
        {seller_info}
        
        <section>
            <h2>Available Fabrics ({data.get('total_fabrics', 0)})</h2>
            <div class="fabrics-grid">
                {fabrics_html if fabrics_html else '<p>Browse our full catalog of fabrics from verified Indian suppliers.</p>'}
            </div>
        </section>
        
        <section class="cta-section">
            <h2>Looking for {category_display} Fabrics?</h2>
            <p>Get samples, pricing, and bulk availability from verified Indian mills.</p>
            <a href="/fabrics/">Browse Full Catalog</a>
            <a href="/request-quote/">Request a Quote</a>
        </section>
        
        {f'''<section class="related-suppliers">
            <h2>More {category_display} Suppliers in {state_display}</h2>
            <ul>{related_html}</ul>
        </section>''' if related_html else ''}
        
        <footer style="text-align:center; padding:40px 0; color:#666; border-top:1px solid #eee; margin-top:40px;">
            <p>Locofast - India's B2B Fabric Sourcing Platform</p>
            <p><a href="/about/" style="color:#2563EB;">About</a> | <a href="/fabrics/" style="color:#2563EB;">Fabrics</a> | <a href="/contact/" style="color:#2563EB;">Contact</a></p>
        </footer>
    </div>
</body>
</html>"""
    
    return HTMLResponse(content=html, status_code=200)
