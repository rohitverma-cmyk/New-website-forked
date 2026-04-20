"""
Prerender Router - Serves fully rendered HTML to search engine bots for key pages.
Also provides a dynamic sitemap.xml generated from the database.
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from typing import Optional
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(tags=["prerender"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'test_database')
if db_name and db_name.startswith('"') and db_name.endswith('"'):
    db_name = db_name[1:-1]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

BOT_AGENTS = [
    'googlebot', 'bingbot', 'yandex', 'baiduspider', 'facebookexternalhit',
    'twitterbot', 'rogerbot', 'linkedinbot', 'embedly', 'quora link preview',
    'showyoubot', 'outbrain', 'pinterest', 'slackbot', 'vkshare',
    'w3c_validator', 'whatsapp', 'semrushbot', 'ahrefsbot'
]

BASE_URL = "https://locofast.com"


def is_bot(user_agent: str) -> bool:
    ua_lower = (user_agent or '').lower()
    return any(bot in ua_lower for bot in BOT_AGENTS)


def slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


# ==================== HOMEPAGE PRERENDER ====================

@router.get("/api/prerender/homepage")
async def prerender_homepage():
    """Fully rendered HTML for the homepage — served to search engine bots."""
    # Fetch collections for the page
    collections = await db.collections.find({}, {'_id': 0}).to_list(6)
    # Fetch some featured fabrics
    featured_fabrics = await db.fabrics.find(
        {'status': 'approved'},
        {'_id': 0}
    ).limit(12).to_list(12)

    # Enrich fabrics with category names
    cat_ids = list(set(f.get('category_id', '') for f in featured_fabrics if f.get('category_id')))
    categories = await db.categories.find({'id': {'$in': cat_ids}}, {'_id': 0}).to_list(100) if cat_ids else []
    cat_map = {c['id']: c['name'] for c in categories}

    # Build collection cards
    collections_html = ""
    for c in collections:
        img = c.get('banner_image', '') or ''
        img_tag = f'<img src="{img}" alt="{c.get("name", "")} collection" width="400" height="250" loading="lazy" />' if img else ''
        collections_html += f"""
        <div class="collection-card">
            {img_tag}
            <h3>{c.get('name', '')}</h3>
            <p>{c.get('description', '')[:120]}</p>
            <a href="/collections/{c.get('id', '')}">View Collection</a>
        </div>"""

    # Build fabric cards
    fabrics_html = ""
    for f in featured_fabrics:
        img = f.get('images', [''])[0] if f.get('images') else ''
        img_tag = f'<img src="{img}" alt="{f.get("name", "")} fabric" width="300" height="300" loading="lazy" />' if img else ''
        cat_name = cat_map.get(f.get('category_id', ''), '')
        fabrics_html += f"""
        <div class="fabric-card">
            {img_tag}
            <h3>{f.get('name', '')}</h3>
            <p>{cat_name}</p>
            <a href="/fabrics/{f.get('id', '')}">View Details</a>
        </div>"""

    # FAQ
    faqs = [
        ("Can I get samples before placing a bulk order?",
         "Yes, absolutely. Most seller partners on our platform offer sampling. Sample costs vary by fabric type and seller, and are typically adjusted against your final order."),
        ("What is the minimum order quantity (MOQ)?",
         "MOQ varies by seller partner and fabric type, typically ranging from 300-1500 meters. Every listing clearly shows MOQ upfront so there are no surprises."),
        ("How does the Money Safety Guarantee work?",
         "Your payments are held securely until you confirm receipt and satisfaction with your order. This ensures sellers are incentivized to deliver quality, and buyers have peace of mind."),
        ("How fast is delivery?",
         "Lead times range from 15-45 days depending on the fabric and seller location. Each listing shows estimated delivery timelines before you order."),
        ("How does pricing work?",
         "Pricing is set by seller partners and displayed transparently per meter/kg. What you see is what you pay — no hidden platform fees for buyers."),
    ]
    faq_html = ""
    faq_schema_items = []
    for q, a in faqs:
        faq_html += f"""
        <div class="faq-item">
            <h3>{q}</h3>
            <p>{a}</p>
        </div>"""
        faq_schema_items.append(f'{{"@type":"Question","name":"{q}","acceptedAnswer":{{"@type":"Answer","text":"{a}"}}}}')

    faq_schema = f"""{{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{",".join(faq_schema_items)}]
    }}"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Locofast - Premium Fabric Sourcing for Fashion Brands | B2B Textile Marketplace</title>
    <meta name="description" content="Source quality fabrics from verified Indian mills. Transparent pricing, MOQ clarity, and fast delivery for fashion brands, designers, and manufacturers. Get samples within 48 hours.">
    <meta name="keywords" content="fabric sourcing, textile marketplace, wholesale fabrics, cotton fabric, denim fabric, fashion fabric, B2B textile, Indian mills, fabric supplier, clothing manufacturer">
    <link rel="canonical" href="{BASE_URL}/">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{BASE_URL}/">
    <meta property="og:title" content="Locofast - Premium Fabric Sourcing for Fashion Brands">
    <meta property="og:description" content="Source quality fabrics from verified Indian mills. Transparent pricing, MOQ clarity, and fast delivery for fashion brands and designers.">
    <meta property="og:site_name" content="Locofast">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Locofast - Premium Fabric Sourcing for Fashion Brands">
    <meta name="twitter:description" content="Source quality fabrics from verified Indian mills. Transparent pricing, MOQ clarity, and fast delivery.">
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Locofast",
        "url": "{BASE_URL}",
        "description": "Premium fabric sourcing platform connecting fashion brands with verified Indian textile mills",
        "contactPoint": {{
            "@type": "ContactPoint",
            "contactType": "customer service",
            "availableLanguage": ["English", "Hindi"]
        }},
        "address": {{
            "@type": "PostalAddress",
            "addressCountry": "IN"
        }}
    }}
    </script>
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Locofast",
        "url": "{BASE_URL}",
        "potentialAction": {{
            "@type": "SearchAction",
            "target": "{BASE_URL}/fabrics?search={{search_term_string}}",
            "query-input": "required name=search_term_string"
        }}
    }}
    </script>
    <script type="application/ld+json">{faq_schema}</script>
    <style>
        body {{ font-family: Inter, system-ui, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }}
        .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
        .hero {{ background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 80px 20px; text-align: center; }}
        .hero h1 {{ font-size: 42px; margin-bottom: 16px; line-height: 1.2; }}
        .hero p {{ font-size: 18px; color: #94a3b8; max-width: 640px; margin: 0 auto 32px; }}
        .hero a {{ display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0 8px; }}
        .section {{ padding: 60px 20px; }}
        .section h2 {{ font-size: 28px; text-align: center; margin-bottom: 40px; }}
        .grid-3 {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; max-width: 1200px; margin: 0 auto; }}
        .grid-4 {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 24px; max-width: 1200px; margin: 0 auto; }}
        .card {{ border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }}
        .card h3 {{ font-size: 18px; margin: 12px 0 8px; }}
        .card p {{ color: #64748b; font-size: 14px; line-height: 1.6; }}
        .collection-card {{ border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }}
        .collection-card img {{ width: 100%; height: 200px; object-fit: cover; }}
        .collection-card h3 {{ padding: 12px 16px 0; font-size: 16px; }}
        .collection-card p {{ padding: 0 16px; color: #64748b; font-size: 14px; }}
        .collection-card a {{ display: block; padding: 8px 16px 16px; color: #2563eb; text-decoration: none; font-size: 14px; }}
        .fabric-card {{ border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }}
        .fabric-card img {{ width: 100%; height: 200px; object-fit: cover; }}
        .fabric-card h3 {{ padding: 8px 12px 0; font-size: 15px; }}
        .fabric-card p {{ padding: 0 12px 4px; color: #2563eb; font-size: 13px; }}
        .fabric-card a {{ display: block; padding: 4px 12px 12px; color: #2563eb; text-decoration: none; font-size: 13px; }}
        .steps {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 32px; max-width: 1000px; margin: 0 auto; }}
        .step {{ text-align: center; }}
        .step-num {{ font-size: 48px; font-weight: 700; color: #2563eb; }}
        .faq-item {{ border-bottom: 1px solid #e5e7eb; padding: 16px 0; max-width: 800px; margin: 0 auto; }}
        .faq-item h3 {{ font-size: 16px; margin-bottom: 8px; }}
        .faq-item p {{ color: #64748b; font-size: 14px; line-height: 1.6; }}
        .cta-section {{ background: #2563eb; color: white; padding: 60px 20px; text-align: center; margin: 40px 0; border-radius: 16px; }}
        .cta-section h2 {{ color: white; }}
        .cta-section a {{ display: inline-block; background: white; color: #2563eb; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 8px; }}
        footer {{ text-align: center; padding: 40px 20px; color: #94a3b8; border-top: 1px solid #e5e7eb; }}
        footer a {{ color: #2563eb; text-decoration: none; margin: 0 12px; }}
    </style>
</head>
<body>
    <header style="padding:16px 20px; border-bottom:1px solid #e5e7eb;">
        <a href="/" style="font-size:24px; font-weight:700; color:#1a1a1a; text-decoration:none;">Locofast</a>
        <nav style="display:inline; margin-left:40px;">
            <a href="/fabrics" style="color:#64748b; text-decoration:none; margin:0 16px;">Fabrics</a>
            <a href="/collections" style="color:#64748b; text-decoration:none; margin:0 16px;">Collections</a>
            <a href="/assisted-sourcing" style="color:#64748b; text-decoration:none; margin:0 16px;">Assisted Sourcing</a>
            <a href="/suppliers" style="color:#64748b; text-decoration:none; margin:0 16px;">Sell on Locofast</a>
        </nav>
    </header>

    <section class="hero">
        <h1>Premium Fabric Sourcing for Fashion Brands</h1>
        <p>Source quality fabrics from 500+ verified Indian mills. Transparent pricing, clear MOQ, and fast delivery — all in one platform.</p>
        <a href="/fabrics">Browse Fabrics</a>
        <a href="/assisted-sourcing" style="background:transparent; border:1px solid white;">Get Sourcing Help</a>
    </section>

    <section class="section">
        <h2>Why Fashion Brands Choose Locofast</h2>
        <div class="grid-3">
            <div class="card">
                <h3>500+ Verified Seller Partners</h3>
                <p>Access a curated network of verified textile sellers across India. Every partner is vetted for quality and reliability.</p>
            </div>
            <div class="card">
                <h3>Transparent MOQ &amp; Pricing</h3>
                <p>No hidden costs. Clear minimum order quantities and pricing displayed upfront on every fabric listing.</p>
            </div>
            <div class="card">
                <h3>Money Safety Guarantee</h3>
                <p>Locofast's secure payment system ensures your money is protected. Pay with confidence knowing your transactions are safeguarded.</p>
            </div>
        </div>
    </section>

    <section class="section" style="background:#f8fafc;">
        <h2>How It Works</h2>
        <div class="steps">
            <div class="step">
                <div class="step-num">01</div>
                <h3>Browse or Submit Your Requirement</h3>
                <p>Explore our catalog of fabrics or share your specific needs — type, quantity, budget, and timeline.</p>
            </div>
            <div class="step">
                <div class="step-num">02</div>
                <h3>Get Matched Instantly</h3>
                <p>Our platform intelligently connects your requirements with the best-suited seller partners from our verified network.</p>
            </div>
            <div class="step">
                <div class="step-num">03</div>
                <h3>Order with Confidence</h3>
                <p>Compare options, request samples, and place orders with complete transparency on pricing and delivery timelines.</p>
            </div>
        </div>
    </section>

    {"<section class='section'><h2>Featured Collections</h2><div class='grid-4'>" + collections_html + "</div></section>" if collections_html else ""}

    {"<section class='section' style='background:#f8fafc;'><h2>Featured Fabrics</h2><div class='grid-4'>" + fabrics_html + "</div><p style='text-align:center; margin-top:24px;'><a href='/fabrics' style='color:#2563eb;'>Browse All Fabrics</a></p></section>" if fabrics_html else ""}

    <section class="section">
        <h2>Who Uses Locofast?</h2>
        <div class="grid-4">
            <div class="card">
                <h3>Fashion Brands</h3>
                <p>D2C labels, boutique brands, and fashion houses looking for reliable fabric sourcing partners.</p>
            </div>
            <div class="card">
                <h3>Garment Manufacturers</h3>
                <p>Garment manufacturers and export houses needing consistent quality fabrics at scale.</p>
            </div>
            <div class="card">
                <h3>Buying Houses</h3>
                <p>Sourcing agencies and buying houses connecting international brands with Indian textiles.</p>
            </div>
            <div class="card">
                <h3>Private Label</h3>
                <p>Private label businesses and white-label manufacturers seeking quality fabric suppliers.</p>
            </div>
        </div>
    </section>

    <section class="section" style="background:#f8fafc;">
        <h2>Frequently Asked Questions</h2>
        {faq_html}
    </section>

    <section class="cta-section container">
        <h2>Ready to Source Smarter?</h2>
        <p style="font-size:18px; opacity:0.9; margin-bottom:24px;">Join hundreds of fashion brands sourcing quality fabrics through Locofast.</p>
        <a href="/fabrics">Browse Catalog</a>
        <a href="/assisted-sourcing" style="background:transparent; border:1px solid white; color:white;">Get Sourcing Help</a>
    </section>

    <footer>
        <p><strong>Locofast</strong> — India's B2B Fabric Sourcing Platform</p>
        <p>
            <a href="/fabrics">Fabrics</a>
            <a href="/collections">Collections</a>
            <a href="/about-us">About Us</a>
            <a href="/customers">Customers</a>
            <a href="/contact">Contact</a>
            <a href="/blog">Blog</a>
            <a href="/suppliers">Sell on Locofast</a>
        </p>
        <p style="font-size:12px; margin-top:16px;">Source cotton, denim, polyester, knit, blended, and sustainable fabrics from verified Indian mills.</p>
    </footer>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ==================== FABRICS LISTING PRERENDER ====================

@router.get("/api/prerender/fabrics")
async def prerender_fabrics():
    """Pre-rendered fabrics catalog page for search engines."""
    fabrics = await db.fabrics.find(
        {'status': 'approved'},
        {'_id': 0}
    ).limit(50).to_list(50)

    categories = await db.categories.find({}, {'_id': 0}).to_list(100)
    cat_map = {c['id']: c['name'] for c in categories}

    total = await db.fabrics.count_documents({'status': 'approved'})

    # Category links
    cat_links = ""
    for c in categories:
        cat_links += f'<a href="/fabrics?category={c["id"]}" style="display:inline-block;padding:8px 16px;margin:4px;border:1px solid #e5e7eb;border-radius:20px;color:#1a1a1a;text-decoration:none;font-size:14px;">{c["name"]}</a>'

    # Fabric cards
    cards = ""
    for f in fabrics:
        img = f.get('images', [''])[0] if f.get('images') else ''
        img_tag = f'<img src="{img}" alt="{f.get("name","")} fabric" width="300" height="300" loading="lazy"/>' if img else ''
        cat_name = cat_map.get(f.get('category_id', ''), '')
        gsm = f.get('gsm', '')
        rate = f.get('rate_per_meter', '')
        cards += f"""
        <div style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
            {img_tag}
            <div style="padding:12px;">
                <h3 style="font-size:15px; margin:0 0 4px;">{f.get('name','')}</h3>
                <p style="color:#2563eb; font-size:13px; margin:0 0 4px;">{cat_name}</p>
                <p style="color:#64748b; font-size:13px; margin:0;">{f'{gsm} GSM' if gsm else ''} {f'| INR {rate}/m' if rate else ''}</p>
                <a href="/fabrics/{f.get('id','')}" style="color:#2563eb; font-size:13px;">View Details</a>
            </div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fabric Catalog - Browse {total}+ Fabrics from Indian Mills | Locofast</title>
    <meta name="description" content="Browse {total}+ quality fabrics from verified Indian mills. Cotton, denim, polyester, knits, blended, and sustainable fabrics. Transparent pricing and MOQ.">
    <link rel="canonical" href="{BASE_URL}/fabrics">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="Fabric Catalog | Locofast">
    <meta property="og:description" content="Browse {total}+ quality fabrics from verified Indian mills.">
    <style>
        body {{ font-family: Inter, system-ui, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }}
    </style>
</head>
<body>
    <header style="padding:16px 20px; border-bottom:1px solid #e5e7eb;">
        <a href="/" style="font-size:24px; font-weight:700; color:#1a1a1a; text-decoration:none;">Locofast</a>
    </header>
    <div style="max-width:1200px; margin:0 auto; padding:20px;">
        <h1 style="font-size:32px;">Fabric Catalog</h1>
        <p style="color:#64748b;">{total} fabrics from verified Indian mills</p>
        <nav style="margin:24px 0;">{cat_links}</nav>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:20px;">
            {cards}
        </div>
    </div>
    <footer style="text-align:center; padding:40px 20px; color:#94a3b8; border-top:1px solid #e5e7eb;">
        <p>Locofast — India's B2B Fabric Sourcing Platform</p>
    </footer>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ==================== COLLECTIONS PRERENDER ====================

@router.get("/api/prerender/collections")
async def prerender_collections():
    """Pre-rendered collections page for search engines."""
    collections = await db.collections.find({}, {'_id': 0}).to_list(50)

    cards = ""
    for c in collections:
        img = c.get('banner_image', '') or ''
        img_tag = f'<img src="{img}" alt="{c.get("name","")} collection" width="400" height="250" loading="lazy"/>' if img else ''
        cards += f"""
        <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
            {img_tag}
            <div style="padding:16px;">
                <h2 style="font-size:20px; margin:0 0 8px;">{c.get('name','')}</h2>
                <p style="color:#64748b; font-size:14px;">{c.get('description','')[:200]}</p>
                <a href="/collections/{c.get('id','')}" style="color:#2563eb; font-size:14px;">View Collection</a>
            </div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fabric Collections - Curated Textile Ranges | Locofast</title>
    <meta name="description" content="Explore curated fabric collections for fashion brands. Seasonal ranges, trending fabrics, and specialty textiles from verified Indian mills.">
    <link rel="canonical" href="{BASE_URL}/collections">
    <meta name="robots" content="index, follow">
    <style>
        body {{ font-family: Inter, system-ui, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }}
    </style>
</head>
<body>
    <header style="padding:16px 20px; border-bottom:1px solid #e5e7eb;">
        <a href="/" style="font-size:24px; font-weight:700; color:#1a1a1a; text-decoration:none;">Locofast</a>
    </header>
    <div style="max-width:1200px; margin:0 auto; padding:20px;">
        <h1 style="font-size:32px;">Fabric Collections</h1>
        <p style="color:#64748b;">Curated fabric ranges for fashion brands and manufacturers</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:24px; margin-top:32px;">
            {cards}
        </div>
    </div>
    <footer style="text-align:center; padding:40px 20px; color:#94a3b8; border-top:1px solid #e5e7eb;">
        <p>Locofast — India's B2B Fabric Sourcing Platform</p>
    </footer>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ==================== BOT DETECTION MIDDLEWARE ENDPOINT ====================

@router.get("/api/prerender/check")
async def prerender_check(request: Request, path: Optional[str] = None):
    """Utility endpoint: check if a request would be prerendered (for nginx config testing)."""
    ua = request.headers.get('user-agent', '')
    bot = is_bot(ua)
    return {
        "user_agent": ua[:100],
        "is_bot": bot,
        "path": path,
        "prerender_available": path in ['/', '/fabrics', '/collections'] if path else False
    }
