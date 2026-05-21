from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Union
import os
import re
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/seo", tags=["seo"])

# MongoDB connection - reuse from main server
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'test_database')
# Strip quotes if present
if db_name and db_name.startswith('"') and db_name.endswith('"'):
    db_name = db_name[1:-1]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# ==================== HELPER FUNCTIONS ====================

def parse_composition(composition: Union[str, List, None]) -> str:
    """Convert composition to string format, handling both string and list of dicts"""
    if not composition:
        return ""
    if isinstance(composition, str):
        return composition
    if isinstance(composition, list):
        parts = []
        for c in composition:
            if isinstance(c, dict) and c.get('material') and c.get('percentage', 0) > 0:
                parts.append(f"{c.get('percentage', 0)}% {c.get('material', '')}")
        return ", ".join(parts)
    return ""

def get_composition_materials(composition: Union[str, List, None]) -> List[str]:
    """Get list of material names from composition"""
    if not composition:
        return []
    if isinstance(composition, str):
        # Try to extract materials from string format like "100% Cotton" or "60% Cotton, 40% Polyester"
        return [m.strip() for m in re.findall(r'\d+%\s*(\w+)', composition)]
    if isinstance(composition, list):
        return [c.get('material', '').lower() for c in composition if isinstance(c, dict) and c.get('material')]
    return []

# ==================== MODELS ====================

class SEOBlockModes(BaseModel):
    h1: str = "auto"  # auto or manual
    intro: str = "auto"
    applications: str = "auto"
    bulk_details: str = "auto"
    why_fabric: str = "auto"
    faq: str = "auto"

class SEOContent(BaseModel):
    seo_h1: str = ""
    seo_intro: str = ""
    seo_applications: List[str] = []
    seo_bulk_details: Dict = {}
    seo_why_fabric: List[str] = []
    seo_faq: List[Dict] = []
    meta_title: str = ""
    meta_description: str = ""
    canonical_url: str = ""
    is_indexed: bool = True
    seo_block_modes: SEOBlockModes = SEOBlockModes()
    related_fabric_overrides: List[str] = []
    slug: str = ""

class SEOPreview(BaseModel):
    fabric_id: str
    fabric_name: str
    seo_h1: str
    meta_title: str
    meta_description: str
    intro_word_count: int
    has_applications: bool
    has_faq: bool
    has_bulk_details: bool
    has_why_fabric: bool
    alerts: List[str]
    canonical_url: str
    is_indexed: bool

class RelatedFabric(BaseModel):
    id: str
    name: str
    category_name: str
    gsm: Optional[int] = None
    ounce: str = ""
    images: List[str] = []
    slug: str = ""

class RegenerateBlockInput(BaseModel):
    block_name: str  # h1, intro, applications, bulk_details, why_fabric, faq, meta_title, meta_description

# ==================== HELPER FUNCTIONS ====================

def generate_slug(name: str, category_name: str, gsm: Optional[int] = None, ounce: str = "") -> str:
    """Generate SEO-friendly slug from fabric details"""
    # Clean the name
    slug_parts = [name.lower()]
    
    # Add weight if available
    if gsm:
        slug_parts.append(f"{gsm}gsm")
    elif ounce:
        slug_parts.append(f"{ounce}oz")
    
    # Join and clean
    slug = "-".join(slug_parts)
    slug = re.sub(r'[^a-z0-9-]', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    
    return slug

def generate_h1(name: str, gsm: Optional[int], ounce: str, fabric_type: str) -> str:
    """Generate SEO H1 title"""
    weight_part = ""
    if gsm:
        weight_part = f"{gsm} GSM"
    elif ounce:
        weight_part = f"{ounce} oz"
    
    type_label = "Woven" if fabric_type == "woven" else "Knit" if fabric_type == "knitted" else "Fabric"
    
    h1_parts = [name]
    if weight_part:
        h1_parts.append(weight_part)
    h1_parts.append(type_label)
    
    return f"{' – '.join(h1_parts)} | Bulk Supply in India"

def generate_meta_title(name: str, category_name: str, gsm: Optional[int], ounce: str) -> str:
    """Generate meta title (max 60 chars)"""
    weight = f"{gsm} GSM" if gsm else f"{ounce} oz" if ounce else ""
    base = f"{name}"
    if weight:
        base = f"{name} {weight}"
    
    suffix = " | Suppliers India"
    
    # Truncate if needed
    max_base_len = 60 - len(suffix)
    if len(base) > max_base_len:
        base = base[:max_base_len-3] + "..."
    
    return base + suffix

def generate_meta_description(name: str, category_name: str, composition, gsm: Optional[int], ounce: str, moq: str, finish: str) -> str:
    """Generate meta description (max 160 chars)"""
    # Build composition string using helper function
    comp_str = parse_composition(composition)
    
    weight = f"{gsm} GSM" if gsm else f"{ounce} oz" if ounce else ""
    
    desc_parts = [f"Source {name}"]
    if weight:
        desc_parts[0] += f" ({weight})"
    if comp_str:
        desc_parts.append(comp_str)
    desc_parts.append("from verified Indian mills")
    if moq:
        desc_parts.append(f"MOQ: {moq}")
    
    desc = ". ".join(desc_parts)
    
    # Truncate if needed
    if len(desc) > 160:
        desc = desc[:157] + "..."
    
    return desc

def generate_bulk_details(moq: str, dispatch_timeline: str, is_bookable: bool) -> Dict:
    """Generate bulk order details block"""
    return {
        "moq": moq or "Contact for MOQ",
        "lead_time": dispatch_timeline or "2-4 weeks (typical)",
        "sampling": "Available on request",
        "dispatch_region": "Pan-India"
    }

def infer_applications(category_name: str, fabric_type: str, tags: List[str], composition) -> List[str]:
    """Infer likely applications from fabric properties.

    Order of precedence:
      1. Category keyword match (denim, cotton, polyester, knit, blend, …)
      2. Fabric-name keyword match (taffeta, sateen, lyocell, viscose, …)
      3. Tag keyword match (shirt/dress/sport/uniform)
      4. Composition fallback (cotton/poly/blend)
      5. Generic apparel fallback — guarantees we never return an empty list
         (used to leave fabrics with sparse metadata blank, which then
         showed as "missing applications" in the SEO audit).
    """
    applications: List[str] = []

    category_lower = (category_name or "").lower()
    if "denim" in category_lower:
        applications.extend(["Jeans manufacturing", "Denim jackets", "Casual wear", "Workwear"])
    elif "cotton" in category_lower:
        applications.extend(["Shirting", "Casual wear", "Summer clothing"])
    elif "polyester" in category_lower or "poly" in category_lower:
        applications.extend(["Sportswear", "Activewear", "Uniforms"])
    elif "knit" in category_lower:
        applications.extend(["T-shirts", "Casual tops", "Athleisure"])
    elif "blend" in category_lower:
        applications.extend(["Uniforms", "Workwear", "Institutional wear"])
    elif "silk" in category_lower:
        applications.extend(["Eveningwear", "Lingerie", "Premium dresses"])
    elif "linen" in category_lower:
        applications.extend(["Summer shirting", "Resortwear", "Trousers"])
    elif "wool" in category_lower:
        applications.extend(["Suiting", "Outerwear", "Winter wear"])
    elif "viscose" in category_lower or "rayon" in category_lower:
        applications.extend(["Dresses", "Blouses", "Drape-led fashion"])

    # Fabric-name fallback — many SKUs name the fabric variety in the
    # title (taffeta, sateen, lyocell…). Match those too.
    fabric_name_lower = (fabric_type or "").lower()
    name_map = {
        "taffeta": ["Outerwear", "Jackets", "Linings"],
        "sateen": ["Premium shirting", "Bedding", "Drapery"],
        "lyocell": ["Premium dresses", "Workwear", "Sustainable apparel"],
        "tencel": ["Premium dresses", "Workwear", "Sustainable apparel"],
        "modal": ["T-shirts", "Innerwear", "Athleisure"],
        "twill": ["Trousers", "Workwear", "Uniforms"],
        "fleece": ["Hoodies", "Joggers", "Winter wear"],
        "jersey": ["T-shirts", "Casual tops", "Athleisure"],
        "rib": ["T-shirts", "Cuffs & necklines", "Athleisure"],
        "chambray": ["Shirting", "Casual wear", "Childrenswear"],
        "oxford": ["Premium shirting", "Formal shirts"],
        "poplin": ["Shirting", "Dresses", "Uniforms"],
        "satin": ["Eveningwear", "Lingerie", "Linings"],
    }
    for kw, apps in name_map.items():
        if kw in fabric_name_lower or kw in (category_name or "").lower():
            applications.extend(apps)

    # From tags
    for tag in (tags or []):
        tag_lower = (tag or "").lower()
        if "shirt" in tag_lower:
            applications.append("Shirting")
        elif "dress" in tag_lower:
            applications.append("Dresses")
        elif "sport" in tag_lower or "active" in tag_lower:
            applications.append("Sportswear")
        elif "uniform" in tag_lower:
            applications.append("Uniforms")
        elif "denim" in tag_lower:
            applications.append("Jeans manufacturing")
        elif "outer" in tag_lower:
            applications.append("Outerwear")

    # Composition fallback (when category/name don't match)
    if not applications:
        materials = [m for m in get_composition_materials(composition or []) if m]
        if any("cotton" in m for m in materials):
            applications.extend(["Shirting", "Casual wear", "Summer clothing"])
        elif any("poly" in m for m in materials):
            applications.extend(["Sportswear", "Activewear", "Uniforms"])

    # Generic apparel fallback — guarantees a non-empty list
    if not applications:
        applications = ["Apparel manufacturing", "Fashion garments", "Womenswear", "Menswear"]

    seen = set()
    unique = []
    for app in applications:
        if app.lower() not in seen:
            seen.add(app.lower())
            unique.append(app)
    return unique[:6]

def generate_why_fabric_bullets(fabric: Dict) -> List[str]:
    """Generate 'Why this fabric' bullet points from specs"""
    bullets = []
    
    # From fabric type
    if fabric.get('fabric_type') == 'woven':
        bullets.append("Woven construction for durability and structure")
    elif fabric.get('fabric_type') == 'knitted':
        bullets.append("Knit construction for stretch and comfort")
    
    # From composition - use helper function
    composition = fabric.get('composition', [])
    materials = get_composition_materials(composition)
    if materials:
        if any('cotton' in m for m in materials):
            bullets.append("Cotton content for breathability and comfort")
        if any('poly' in m for m in materials):
            bullets.append("Polyester for durability and color retention")
        if any('spandex' in m or 'elastane' in m or 'lycra' in m for m in materials):
            bullets.append("Stretch component for comfort and fit")
    
    # From GSM/weight
    gsm = fabric.get('gsm')
    if gsm:
        if gsm < 150:
            bullets.append("Lightweight construction for summer wear")
        elif gsm > 250:
            bullets.append("Heavy-weight for durability and warmth")
        else:
            bullets.append("Medium weight suitable for year-round use")
    
    # From finish
    finish = fabric.get('finish', '').lower()
    if finish:
        if 'bio' in finish:
            bullets.append("Bio-finish for soft hand feel")
        elif 'silicon' in finish:
            bullets.append("Silicone finish for smooth texture")
        elif 'wash' in finish:
            bullets.append("Pre-washed for reduced shrinkage")
    
    # From availability
    availability = fabric.get('availability', [])
    if 'Bulk' in availability:
        bullets.append("Bulk quantities available for production orders")
    if 'Sample' in availability:
        bullets.append("Sampling available before bulk commitment")
    
    return bullets[:6]

def generate_template_faq(fabric: Dict) -> List[Dict]:
    """Generate FAQ from existing fields"""
    faq = []
    
    # GSM/Weight FAQ
    gsm = fabric.get('gsm')
    ounce = fabric.get('ounce', '')
    if gsm:
        faq.append({
            "question": "What is the weight of this fabric?",
            "answer": f"This fabric weighs {gsm} GSM (grams per square meter)."
        })
    elif ounce:
        faq.append({
            "question": "What is the weight of this fabric?",
            "answer": f"This fabric weighs {ounce} oz per square yard."
        })
    
    # MOQ FAQ
    moq = fabric.get('moq', '')
    if moq:
        faq.append({
            "question": "What is the minimum order quantity?",
            "answer": f"The MOQ for this fabric is {moq}."
        })
    
    # Lead time FAQ
    dispatch = fabric.get('dispatch_timeline', '')
    if dispatch:
        faq.append({
            "question": "What is the lead time for orders?",
            "answer": f"Typical dispatch timeline is {dispatch}."
        })
    else:
        faq.append({
            "question": "What is the lead time for orders?",
            "answer": "Lead time varies based on order quantity. Contact us for specific timelines."
        })
    
    # Sampling FAQ
    availability = fabric.get('availability', [])
    if 'Sample' in availability:
        faq.append({
            "question": "Are samples available?",
            "answer": "Yes, samples are available. Contact us to request sample yardage."
        })
    else:
        faq.append({
            "question": "Are samples available?",
            "answer": "Sampling availability can be confirmed on request."
        })
    
    # Export FAQ
    faq.append({
        "question": "Is this fabric suitable for export orders?",
        "answer": "Yes, this fabric can be supplied for export orders. Documentation and compliance support available."
    })
    
    return faq[:5]

async def generate_ai_intro(fabric: Dict) -> str:
    """Generate AI-powered intro using GPT-4o"""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return generate_template_intro(fabric)
    
    # Build context
    name = fabric.get('name', '')
    category = fabric.get('category_name', '')
    composition = fabric.get('composition', [])
    comp_str = parse_composition(composition)
    
    gsm = fabric.get('gsm')
    ounce = fabric.get('ounce', '')
    weight = f"{gsm} GSM" if gsm else f"{ounce} oz" if ounce else ""
    finish = fabric.get('finish', '')
    moq = fabric.get('moq', '')
    dispatch = fabric.get('dispatch_timeline', '')
    tags = fabric.get('tags', [])
    
    prompt = f"""Write a B2B commercial product introduction for this fabric. 

Fabric: {name}
Category: {category}
Composition: {comp_str}
Weight: {weight}
Finish: {finish}
MOQ: {moq}
Lead Time: {dispatch}
Tags: {', '.join(tags)}

Requirements:
- Write exactly 120-160 words
- Commercial B2B tone - no fluff, no history lessons
- Focus on practical benefits for manufacturers
- Mention 2-3 key applications
- Include a brief mention of ordering/supply capability
- Do NOT use phrases like "looking for" or questions
- Start directly with the product description

Generate only the intro text, no headers."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"seo-intro-{uuid.uuid4()}",
            system_message="You are a B2B textile copywriter specializing in fabric sourcing platforms. Write concise, commercial copy."
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=prompt))
        return response.strip()
    except Exception as e:
        print(f"AI intro generation failed: {e}")
        return generate_template_intro(fabric)

def generate_template_intro(fabric: Dict) -> str:
    """Generate template-based intro as fallback"""
    name = fabric.get('name', '')
    category = fabric.get('category_name', '')
    composition = fabric.get('composition', [])
    comp_str = parse_composition(composition)
    gsm = fabric.get('gsm')
    ounce = fabric.get('ounce', '')
    weight = f"{gsm} GSM" if gsm else f"{ounce} oz" if ounce else ""
    finish = fabric.get('finish', '')
    moq = fabric.get('moq', '')
    
    intro = f"{name} is a {category.lower()} fabric"
    if comp_str:
        intro += f" made from {comp_str}"
    if weight:
        intro += f" at {weight}"
    intro += "."
    
    if finish:
        intro += f" Features {finish} finish for enhanced performance."
    
    intro += " Sourced from verified Indian mills with consistent quality for bulk manufacturing."
    
    if moq:
        intro += f" Available with MOQ of {moq}."
    
    intro += " Contact our sourcing team for samples and production orders."
    
    return intro

async def generate_ai_why_fabric(fabric: Dict) -> List[str]:
    """Generate AI-powered 'Why this fabric' bullets"""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return generate_why_fabric_bullets(fabric)
    
    name = fabric.get('name', '')
    category = fabric.get('category_name', '')
    composition = fabric.get('composition', [])
    comp_str = parse_composition(composition)
    gsm = fabric.get('gsm')
    ounce = fabric.get('ounce', '')
    finish = fabric.get('finish', '')
    fabric_type = fabric.get('fabric_type', '')
    
    prompt = f"""Generate 4-6 bullet points explaining why a manufacturer should choose this fabric.

Fabric: {name}
Category: {category}
Type: {fabric_type}
Composition: {comp_str}
Weight: {gsm} GSM or {ounce} oz
Finish: {finish}

Requirements:
- Each bullet should be one concise sentence (10-15 words)
- Focus on practical manufacturing benefits
- Be specific to the fabric properties, not generic
- No marketing fluff
- Format: Return each bullet on a new line, no numbering or bullets characters

Generate only the bullet text."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"seo-why-{uuid.uuid4()}",
            system_message="You are a B2B textile expert. Write concise, factual product benefits."
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=prompt))
        bullets = [line.strip() for line in response.strip().split('\n') if line.strip()]
        return bullets[:6]
    except Exception as e:
        print(f"AI why-fabric generation failed: {e}")
        return generate_why_fabric_bullets(fabric)

async def generate_ai_faq(fabric: Dict) -> List[Dict]:
    """Generate AI-powered FAQ"""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return generate_template_faq(fabric)
    
    name = fabric.get('name', '')
    gsm = fabric.get('gsm')
    ounce = fabric.get('ounce', '')
    moq = fabric.get('moq', '')
    dispatch = fabric.get('dispatch_timeline', '')
    
    prompt = f"""Generate 5 FAQ questions and answers for this fabric product page.

Fabric: {name}
Weight: {gsm} GSM or {ounce} oz
MOQ: {moq}
Lead Time: {dispatch}

Requirements:
- Questions should be what B2B buyers actually ask
- Include questions about: weight/GSM, MOQ, lead time, export suitability, sampling
- Answers should be factual, based on the data provided
- Keep answers to 1-2 sentences each
- Format each as: Q: [question]\\nA: [answer]

Generate exactly 5 Q&A pairs."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"seo-faq-{uuid.uuid4()}",
            system_message="You are a B2B textile expert answering buyer questions."
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse Q&A pairs
        faq = []
        lines = response.strip().split('\n')
        current_q = None
        for line in lines:
            line = line.strip()
            if line.startswith('Q:'):
                current_q = line[2:].strip()
            elif line.startswith('A:') and current_q:
                faq.append({
                    "question": current_q,
                    "answer": line[2:].strip()
                })
                current_q = None
        
        return faq[:5] if faq else generate_template_faq(fabric)
    except Exception as e:
        print(f"AI FAQ generation failed: {e}")
        return generate_template_faq(fabric)

# ==================== ENDPOINTS ====================

@router.get("/fabric/{fabric_id}")
async def get_fabric_seo(fabric_id: str):
    """Get SEO content for a fabric"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    # Get category name
    category = await db.categories.find_one({'id': fabric.get('category_id')}, {'_id': 0})
    category_name = category['name'] if category else ''
    fabric['category_name'] = category_name
    
    # Check if SEO content exists
    seo_data = await db.fabric_seo.find_one({'fabric_id': fabric_id}, {'_id': 0})
    
    if seo_data:
        return seo_data
    
    # Return empty SEO structure if none exists
    return {
        "fabric_id": fabric_id,
        "seo_h1": "",
        "seo_intro": "",
        "seo_applications": [],
        "seo_bulk_details": {},
        "seo_why_fabric": [],
        "seo_faq": [],
        "meta_title": "",
        "meta_description": "",
        "canonical_url": "",
        "is_indexed": True,
        "seo_block_modes": {"h1": "auto", "intro": "auto", "applications": "auto", "bulk_details": "auto", "why_fabric": "auto", "faq": "auto"},
        "related_fabric_overrides": [],
        "slug": ""
    }

@router.post("/fabric/{fabric_id}/generate")
async def generate_fabric_seo(fabric_id: str):
    """Generate all SEO content for a fabric"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    # Get category name
    category = await db.categories.find_one({'id': fabric.get('category_id')}, {'_id': 0})
    category_name = category['name'] if category else ''
    fabric['category_name'] = category_name
    
    # Check existing SEO data and modes
    existing_seo = await db.fabric_seo.find_one({'fabric_id': fabric_id}, {'_id': 0})
    modes = existing_seo.get('seo_block_modes', {}) if existing_seo else {}
    
    # Generate slug
    slug = generate_slug(
        fabric.get('name', ''),
        category_name,
        fabric.get('gsm'),
        fabric.get('ounce', '')
    )
    
    # Generate content for auto-mode blocks
    seo_h1 = generate_h1(
        fabric.get('name', ''),
        fabric.get('gsm'),
        fabric.get('ounce', ''),
        fabric.get('fabric_type', '')
    ) if modes.get('h1', 'auto') == 'auto' else (existing_seo.get('seo_h1', '') if existing_seo else '')
    
    seo_intro = await generate_ai_intro(fabric) if modes.get('intro', 'auto') == 'auto' else (existing_seo.get('seo_intro', '') if existing_seo else '')
    
    seo_applications = infer_applications(
        category_name,
        # Compose a lookup blob: fabric_type + name → catches "Taffeta"
        # / "Sateen" / "Lyocell" appearing in the product name, which
        # the name_map inside infer_applications uses for fallback.
        f"{fabric.get('fabric_type','')} {fabric.get('name','')}",
        fabric.get('tags', []),
        fabric.get('composition', [])
    ) if modes.get('applications', 'auto') == 'auto' else (existing_seo.get('seo_applications', []) if existing_seo else [])
    
    seo_bulk_details = generate_bulk_details(
        fabric.get('moq', ''),
        fabric.get('dispatch_timeline', ''),
        fabric.get('is_bookable', False)
    ) if modes.get('bulk_details', 'auto') == 'auto' else (existing_seo.get('seo_bulk_details', {}) if existing_seo else {})
    
    seo_why_fabric = await generate_ai_why_fabric(fabric) if modes.get('why_fabric', 'auto') == 'auto' else (existing_seo.get('seo_why_fabric', []) if existing_seo else [])
    
    seo_faq = await generate_ai_faq(fabric) if modes.get('faq', 'auto') == 'auto' else (existing_seo.get('seo_faq', []) if existing_seo else [])
    
    meta_title = generate_meta_title(
        fabric.get('name', ''),
        category_name,
        fabric.get('gsm'),
        fabric.get('ounce', '')
    )
    
    meta_description = generate_meta_description(
        fabric.get('name', ''),
        category_name,
        fabric.get('composition', []),
        fabric.get('gsm'),
        fabric.get('ounce', ''),
        fabric.get('moq', ''),
        fabric.get('finish', '')
    )
    
    # Build canonical URL
    category_slug = re.sub(r'[^a-z0-9-]', '-', category_name.lower()).strip('-')
    canonical_url = f"/fabrics/{category_slug}/{slug}/"
    
    seo_doc = {
        "fabric_id": fabric_id,
        "seo_h1": seo_h1,
        "seo_intro": seo_intro,
        "seo_applications": seo_applications,
        "seo_bulk_details": seo_bulk_details,
        "seo_why_fabric": seo_why_fabric,
        "seo_faq": seo_faq,
        "meta_title": meta_title,
        "meta_description": meta_description,
        "canonical_url": canonical_url,
        "is_indexed": existing_seo.get('is_indexed', True) if existing_seo else True,
        "seo_block_modes": existing_seo.get('seo_block_modes', {"h1": "auto", "intro": "auto", "applications": "auto", "bulk_details": "auto", "why_fabric": "auto", "faq": "auto"}) if existing_seo else {"h1": "auto", "intro": "auto", "applications": "auto", "bulk_details": "auto", "why_fabric": "auto", "faq": "auto"},
        "related_fabric_overrides": existing_seo.get('related_fabric_overrides', []) if existing_seo else [],
        "slug": slug,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert SEO document
    await db.fabric_seo.update_one(
        {'fabric_id': fabric_id},
        {'$set': seo_doc},
        upsert=True
    )
    
    return seo_doc

@router.post("/fabric/{fabric_id}/regenerate-block")
async def regenerate_seo_block(fabric_id: str, data: RegenerateBlockInput):
    """Regenerate a specific SEO block"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    # Get category name
    category = await db.categories.find_one({'id': fabric.get('category_id')}, {'_id': 0})
    category_name = category['name'] if category else ''
    fabric['category_name'] = category_name
    
    block_name = data.block_name
    update_data = {}
    
    if block_name == 'h1':
        update_data['seo_h1'] = generate_h1(
            fabric.get('name', ''),
            fabric.get('gsm'),
            fabric.get('ounce', ''),
            fabric.get('fabric_type', '')
        )
    elif block_name == 'intro':
        update_data['seo_intro'] = await generate_ai_intro(fabric)
    elif block_name == 'applications':
        update_data['seo_applications'] = infer_applications(
            category_name,
            fabric.get('fabric_type', ''),
            fabric.get('tags', []),
            fabric.get('composition', [])
        )
    elif block_name == 'bulk_details':
        update_data['seo_bulk_details'] = generate_bulk_details(
            fabric.get('moq', ''),
            fabric.get('dispatch_timeline', ''),
            fabric.get('is_bookable', False)
        )
    elif block_name == 'why_fabric':
        update_data['seo_why_fabric'] = await generate_ai_why_fabric(fabric)
    elif block_name == 'faq':
        update_data['seo_faq'] = await generate_ai_faq(fabric)
    elif block_name == 'meta_title':
        update_data['meta_title'] = generate_meta_title(
            fabric.get('name', ''),
            category_name,
            fabric.get('gsm'),
            fabric.get('ounce', '')
        )
    elif block_name == 'meta_description':
        update_data['meta_description'] = generate_meta_description(
            fabric.get('name', ''),
            category_name,
            fabric.get('composition', []),
            fabric.get('gsm'),
            fabric.get('ounce', ''),
            fabric.get('moq', ''),
            fabric.get('finish', '')
        )
    else:
        raise HTTPException(status_code=400, detail=f'Invalid block name: {block_name}')
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.fabric_seo.update_one(
        {'fabric_id': fabric_id},
        {'$set': update_data},
        upsert=True
    )
    
    return {"block": block_name, "content": update_data.get(f'seo_{block_name}') or update_data.get(block_name)}

@router.put("/fabric/{fabric_id}")
async def update_fabric_seo(fabric_id: str, seo_data: dict):
    """Update SEO content for a fabric"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    seo_data['fabric_id'] = fabric_id
    seo_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.fabric_seo.update_one(
        {'fabric_id': fabric_id},
        {'$set': seo_data},
        upsert=True
    )
    
    return seo_data

@router.get("/fabric/{fabric_id}/preview")
async def get_seo_preview(fabric_id: str):
    """Get SEO preview with alerts"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    seo_data = await db.fabric_seo.find_one({'fabric_id': fabric_id}, {'_id': 0})
    
    alerts = []
    intro_word_count = 0
    
    if seo_data:
        # Check intro word count
        intro = seo_data.get('seo_intro', '')
        intro_word_count = len(intro.split())
        if intro_word_count < 100:
            alerts.append(f"Intro too short ({intro_word_count} words). Target: 120-160 words.")
        elif intro_word_count > 180:
            alerts.append(f"Intro too long ({intro_word_count} words). Target: 120-160 words.")
        
        # Check meta title
        meta_title = seo_data.get('meta_title', '')
        if len(meta_title) > 60:
            alerts.append(f"Meta title too long ({len(meta_title)} chars). Max: 60 chars.")
        elif not meta_title:
            alerts.append("Missing meta title.")
        
        # Check meta description
        meta_desc = seo_data.get('meta_description', '')
        if len(meta_desc) > 160:
            alerts.append(f"Meta description too long ({len(meta_desc)} chars). Max: 160 chars.")
        elif not meta_desc:
            alerts.append("Missing meta description.")
        
        # Check other blocks
        if not seo_data.get('seo_applications'):
            alerts.append("Missing applications/use cases.")
        if not seo_data.get('seo_faq'):
            alerts.append("Missing FAQ section.")
        if not seo_data.get('seo_why_fabric'):
            alerts.append("Missing 'Why this fabric' section.")
    else:
        alerts.append("No SEO content generated. Click 'Generate SEO' to create content.")
    
    return {
        "fabric_id": fabric_id,
        "fabric_name": fabric.get('name', ''),
        "seo_h1": seo_data.get('seo_h1', '') if seo_data else '',
        "meta_title": seo_data.get('meta_title', '') if seo_data else '',
        "meta_description": seo_data.get('meta_description', '') if seo_data else '',
        "intro_word_count": intro_word_count,
        "has_applications": bool(seo_data.get('seo_applications')) if seo_data else False,
        "has_faq": bool(seo_data.get('seo_faq')) if seo_data else False,
        "has_bulk_details": bool(seo_data.get('seo_bulk_details')) if seo_data else False,
        "has_why_fabric": bool(seo_data.get('seo_why_fabric')) if seo_data else False,
        "alerts": alerts,
        "canonical_url": seo_data.get('canonical_url', '') if seo_data else '',
        "is_indexed": seo_data.get('is_indexed', True) if seo_data else True
    }

@router.get("/fabric/{fabric_id}/related")
async def get_related_fabrics(fabric_id: str):
    """Get related fabrics for internal linking"""
    fabric = await db.fabrics.find_one({'id': fabric_id}, {'_id': 0})
    if not fabric:
        raise HTTPException(status_code=404, detail='Fabric not found')
    
    # Check for manual overrides
    seo_data = await db.fabric_seo.find_one({'fabric_id': fabric_id}, {'_id': 0})
    overrides = seo_data.get('related_fabric_overrides', []) if seo_data else []
    
    related = []
    
    # First, add manual overrides
    if overrides:
        override_fabrics = await db.fabrics.find({'id': {'$in': overrides}}, {'_id': 0}).to_list(3)
        for f in override_fabrics:
            cat = await db.categories.find_one({'id': f.get('category_id')}, {'_id': 0})
            seo = await db.fabric_seo.find_one({'fabric_id': f['id']}, {'_id': 0})
            related.append({
                "id": f['id'],
                "name": f.get('name', ''),
                "category_name": cat['name'] if cat else '',
                "gsm": f.get('gsm'),
                "ounce": f.get('ounce', ''),
                "images": f.get('images', [])[:1],
                "slug": seo.get('slug', '') if seo else ''
            })
    
    # Then auto-find related (same category, similar GSM)
    gsm = fabric.get('gsm')
    category_id = fabric.get('category_id')
    
    query = {
        'id': {'$ne': fabric_id},
        'category_id': category_id
    }
    
    # Add GSM range filter if available
    if gsm:
        query['gsm'] = {'$gte': gsm - 20, '$lte': gsm + 20}
    
    auto_related = await db.fabrics.find(query, {'_id': 0}).limit(6 - len(related)).to_list(6)
    
    for f in auto_related:
        if f['id'] not in [r['id'] for r in related]:
            cat = await db.categories.find_one({'id': f.get('category_id')}, {'_id': 0})
            seo = await db.fabric_seo.find_one({'fabric_id': f['id']}, {'_id': 0})
            related.append({
                "id": f['id'],
                "name": f.get('name', ''),
                "category_name": cat['name'] if cat else '',
                "gsm": f.get('gsm'),
                "ounce": f.get('ounce', ''),
                "images": f.get('images', [])[:1],
                "slug": seo.get('slug', '') if seo else ''
            })
    
    return related[:6]

@router.post("/batch-generate-slugs")
async def batch_generate_slugs():
    """Batch generate slugs for all fabrics without slugs"""
    fabrics = await db.fabrics.find({}, {'_id': 0}).to_list(10000)
    
    updated = 0
    for fabric in fabrics:
        # Check if slug exists
        seo_data = await db.fabric_seo.find_one({'fabric_id': fabric['id']}, {'_id': 0})
        
        if not seo_data or not seo_data.get('slug'):
            # Get category
            category = await db.categories.find_one({'id': fabric.get('category_id')}, {'_id': 0})
            category_name = category['name'] if category else ''
            
            # Generate slug
            slug = generate_slug(
                fabric.get('name', ''),
                category_name,
                fabric.get('gsm'),
                fabric.get('ounce', '')
            )
            
            # Ensure uniqueness
            existing = await db.fabric_seo.find_one({'slug': slug, 'fabric_id': {'$ne': fabric['id']}}, {'_id': 0})
            if existing:
                slug = f"{slug}-{fabric['id'][:6]}"
            
            # Build canonical URL
            category_slug = re.sub(r'[^a-z0-9-]', '-', category_name.lower()).strip('-')
            canonical_url = f"/fabrics/{category_slug}/{slug}/"
            
            # Update or create SEO record
            await db.fabric_seo.update_one(
                {'fabric_id': fabric['id']},
                {'$set': {
                    'fabric_id': fabric['id'],
                    'slug': slug,
                    'canonical_url': canonical_url,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
            updated += 1
    
    return {"message": f"Generated slugs for {updated} fabrics", "updated_count": updated}


# ────────────────────────────────────────────────────────────────────
# Batch-fill missing SEO data
# ────────────────────────────────────────────────────────────────────
def _seo_doc_needs_filling(seo: dict | None) -> list[str]:
    """Return list of missing/empty SEO fields. Empty list => fully populated."""
    if not seo:
        return ["__no_doc__"]
    missing = []
    if not (seo.get("meta_title") or "").strip():       missing.append("meta_title")
    if not (seo.get("meta_description") or "").strip(): missing.append("meta_description")
    if not (seo.get("seo_h1") or "").strip():           missing.append("seo_h1")
    intro = (seo.get("seo_intro") or "").strip()
    # Mirror the audit definition used elsewhere — intros below ~120 words
    # are flagged as "too short" in the SEO Manager UI.
    if len(intro) < 600: missing.append("seo_intro")
    if not seo.get("seo_applications"):                 missing.append("seo_applications")
    if not seo.get("seo_faq"):                          missing.append("seo_faq")
    if not seo.get("seo_why_fabric"):                   missing.append("seo_why_fabric")
    if not seo.get("seo_bulk_details"):                 missing.append("seo_bulk_details")
    return missing


@router.get("/audit")
async def seo_audit():
    """Read-only audit — counts fabrics with each kind of missing SEO data
    plus the list of pages not currently indexable (no SEO doc, or is_indexed=False).
    """
    fabrics = await db.fabrics.find({}, {"_id": 0, "id": 1, "name": 1, "fabric_code": 1, "is_active": 1}).to_list(20000)
    seo_index = {s["fabric_id"]: s async for s in db.fabric_seo.find({}, {"_id": 0})}

    counts = {
        "meta_title": 0, "meta_description": 0, "seo_h1": 0, "seo_intro": 0,
        "seo_applications": 0, "seo_faq": 0, "seo_why_fabric": 0,
        "seo_bulk_details": 0, "no_seo_doc": 0, "noindex": 0,
    }
    needs_fill_ids: list[dict] = []
    not_indexable: list[dict] = []

    for f in fabrics:
        seo = seo_index.get(f["id"])
        miss = _seo_doc_needs_filling(seo)
        if "__no_doc__" in miss:
            counts["no_seo_doc"] += 1
        else:
            for k in miss:
                counts[k] = counts.get(k, 0) + 1
        if miss:
            needs_fill_ids.append({
                "id": f["id"],
                "fabric_code": f.get("fabric_code", ""),
                "name": f.get("name", "")[:80],
                "missing": miss,
            })
        # Indexability
        if not seo:
            not_indexable.append({
                "id": f["id"],
                "fabric_code": f.get("fabric_code", ""),
                "name": f.get("name", ""),
                "reason": "No SEO doc — won't appear in sitemap.xml",
                "is_active": f.get("is_active", True),
            })
        elif seo.get("is_indexed") is False:
            counts["noindex"] += 1
            not_indexable.append({
                "id": f["id"],
                "fabric_code": f.get("fabric_code", ""),
                "name": f.get("name", ""),
                "reason": "is_indexed=False (manually blocked)",
                "is_active": f.get("is_active", True),
            })

    return {
        "total_fabrics": len(fabrics),
        "total_seo_docs": len(seo_index),
        "needs_fill_count": len(needs_fill_ids),
        "not_indexable_count": len(not_indexable),
        "counts": counts,
        "needs_fill": needs_fill_ids,
        "not_indexable": not_indexable,
    }


@router.post("/batch-fill-missing")
async def batch_fill_missing_seo(only_active: bool = True):
    """One-shot: scan every fabric and run `generate_fabric_seo` for any
    fabric whose SEO doc is missing OR has empty auto-fields.

    `only_active=True` (default) → fills only `is_active=True` fabrics.
    Set to false to also fill draft / archived rows.

    Idempotent — running it twice is a no-op for already-complete docs.
    """
    # `is_active` is missing on every legacy fabric — treat absent as
    # active. Inactive only excluded when the field is explicitly False.
    query = {"is_active": {"$ne": False}} if only_active else {}
    fabrics = await db.fabrics.find(query, {"_id": 0}).to_list(20000)

    seo_index = {s["fabric_id"]: s async for s in db.fabric_seo.find({}, {"_id": 0})}

    filled, errors, skipped = [], [], 0
    for fabric in fabrics:
        seo = seo_index.get(fabric["id"])
        miss = _seo_doc_needs_filling(seo)
        if not miss:
            skipped += 1
            continue
        try:
            doc = await generate_fabric_seo(fabric["id"])
            filled.append({
                "id": fabric["id"],
                "fabric_code": fabric.get("fabric_code", ""),
                "name": fabric.get("name", ""),
                "filled_fields": miss,
                "meta_title": doc.get("meta_title", "")[:60],
            })
        except Exception as e:
            errors.append({
                "id": fabric["id"],
                "fabric_code": fabric.get("fabric_code", ""),
                "name": fabric.get("name", ""),
                "error": str(e)[:200],
            })

    return {
        "filled_count": len(filled),
        "skipped_already_complete": skipped,
        "errors_count": len(errors),
        "filled": filled,
        "errors": errors,
    }


# ────────────────────────────────────────────────────────────────────
# Async Batch-Fill Job (with live progress)
# ────────────────────────────────────────────────────────────────────
# For ops running on production with 400+ fabrics: a sync request would
# hang the browser for ~20 min. Instead, we spawn a background asyncio
# task, persist progress in the `seo_jobs` collection, and let the UI
# poll `/status/{job_id}` every couple of seconds.
#
# The job document is the single source of truth — survives page
# refresh and lets multiple admins watch the same run.

async def _run_batch_fill_job(job_id: str, only_active: bool):
    """Background worker — updates `seo_jobs` doc as it processes fabrics."""
    try:
        query = {"is_active": {"$ne": False}} if only_active else {}
        fabrics = await db.fabrics.find(query, {"_id": 0}).to_list(20000)
        seo_index = {s["fabric_id"]: s async for s in db.fabric_seo.find({}, {"_id": 0})}

        # Pre-compute the work-list so `total` reflects fabrics that
        # actually need filling, not the whole catalog.
        work = []
        skipped_initial = 0
        for fabric in fabrics:
            seo = seo_index.get(fabric["id"])
            miss = _seo_doc_needs_filling(seo)
            if miss:
                work.append((fabric, miss))
            else:
                skipped_initial += 1

        await db.seo_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "total": len(work),
                "skipped_already_complete": skipped_initial,
                "status": "running",
            }},
        )

        filled, errors = [], []
        # Per-fabric timeout — without this, ONE hung LLM call (rate
        # limit / network / API quota) blocks the whole job indefinitely.
        # 90s comfortably covers 3 sequential LLM blocks; anything slower
        # is treated as a soft-failure and we move on.
        PER_FABRIC_TIMEOUT = 90
        for idx, (fabric, miss) in enumerate(work):
            await db.seo_jobs.update_one(
                {"job_id": job_id},
                {"$set": {
                    "processed": idx,
                    "current_fabric": {
                        "id": fabric["id"],
                        "name": fabric.get("name", "")[:80],
                        "fabric_code": fabric.get("fabric_code", ""),
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            try:
                await asyncio.wait_for(
                    generate_fabric_seo(fabric["id"]),
                    timeout=PER_FABRIC_TIMEOUT,
                )
                filled.append({
                    "id": fabric["id"],
                    "fabric_code": fabric.get("fabric_code", ""),
                    "name": fabric.get("name", ""),
                    "filled_fields": miss,
                })
                await db.seo_jobs.update_one(
                    {"job_id": job_id},
                    {"$inc": {"filled_count": 1}},
                )
            except asyncio.TimeoutError:
                errors.append({
                    "id": fabric["id"],
                    "fabric_code": fabric.get("fabric_code", ""),
                    "name": fabric.get("name", ""),
                    "error": f"Timed out after {PER_FABRIC_TIMEOUT}s",
                })
                await db.seo_jobs.update_one(
                    {"job_id": job_id},
                    {"$inc": {"errors_count": 1}},
                )
            except Exception as e:
                errors.append({
                    "id": fabric["id"],
                    "fabric_code": fabric.get("fabric_code", ""),
                    "name": fabric.get("name", ""),
                    "error": str(e)[:200],
                })
                await db.seo_jobs.update_one(
                    {"job_id": job_id},
                    {"$inc": {"errors_count": 1}},
                )

        await db.seo_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "processed": len(work),
                "status": "completed",
                "current_fabric": None,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "filled_sample": filled[:50],   # cap stored sample to keep doc small
                "errors": errors[:50],
            }},
        )
    except Exception as e:
        await db.seo_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "failed",
                "fatal_error": str(e)[:500],
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }},
        )


@router.post("/batch-fill-missing/start")
async def batch_fill_missing_seo_start(only_active: bool = True):
    """Start the batch-fill as a background job. Returns immediately with
    a job_id the client can poll via `/batch-fill-missing/status/{job_id}`.
    """
    # If another job is currently running, return that one instead of
    # spawning a duplicate — keeps multiple admin tabs in sync.
    active = await db.seo_jobs.find_one(
        {"status": "running"},
        {"_id": 0},
        sort=[("started_at", -1)],
    )
    if active:
        return {"job_id": active["job_id"], "already_running": True}

    job_id = str(uuid.uuid4())
    await db.seo_jobs.insert_one({
        "job_id": job_id,
        "status": "queued",
        "only_active": only_active,
        "total": 0,
        "processed": 0,
        "filled_count": 0,
        "errors_count": 0,
        "skipped_already_complete": 0,
        "current_fabric": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "filled_sample": [],
        "errors": [],
    })

    # Fire-and-forget — Motor + asyncio keeps it alive in the same loop.
    asyncio.create_task(_run_batch_fill_job(job_id, only_active))

    return {"job_id": job_id, "already_running": False}


@router.get("/batch-fill-missing/status/{job_id}")
async def batch_fill_missing_seo_status(job_id: str):
    """Live progress for a batch-fill job."""
    job = await db.seo_jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/batch-fill-missing/latest")
async def batch_fill_missing_seo_latest():
    """Returns the most recent job (running or completed). Used by the UI
    on page-load to auto-resume the progress panel if a job is in-flight.
    """
    job = await db.seo_jobs.find_one(
        {},
        {"_id": 0},
        sort=[("started_at", -1)],
    )
    return job or {"job_id": None}


@router.post("/batch-fill-missing/resume")
async def batch_fill_missing_seo_resume():
    """Recover from a stalled job: if the most recent job is `running`
    but its heartbeat (`updated_at`) is older than 3 minutes, treat it
    as dead, mark the previous job as `stalled`, and start a fresh
    job that picks up the still-missing fabrics.

    Idempotent — calling repeatedly while a healthy job is running is
    a no-op.
    """
    latest = await db.seo_jobs.find_one({}, {"_id": 0}, sort=[("started_at", -1)])
    if not latest:
        # Nothing has ever run; just start a fresh job
        return await batch_fill_missing_seo_start()

    if latest.get("status") == "running":
        # Check heartbeat freshness
        last = latest.get("updated_at") or latest.get("started_at")
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00")) if last else None
        except Exception:
            last_dt = None
        stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=3)
        if last_dt and last_dt > stale_threshold:
            # Job is healthy — return it
            return {"job_id": latest["job_id"], "already_running": True, "healthy": True}
        # Otherwise: mark as stalled and re-spawn
        await db.seo_jobs.update_one(
            {"job_id": latest["job_id"]},
            {"$set": {
                "status": "stalled",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "stalled_reason": f"No heartbeat since {last}",
            }},
        )

    # Start a fresh job — it will scan again and only pick up still-missing fabrics
    job_id = str(uuid.uuid4())
    await db.seo_jobs.insert_one({
        "job_id": job_id,
        "status": "queued",
        "only_active": True,
        "total": 0,
        "processed": 0,
        "filled_count": 0,
        "errors_count": 0,
        "skipped_already_complete": 0,
        "current_fabric": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "filled_sample": [],
        "errors": [],
        "resumed_from": latest.get("job_id") if latest else None,
    })
    asyncio.create_task(_run_batch_fill_job(job_id, True))
    return {"job_id": job_id, "already_running": False, "resumed_from": latest.get("job_id") if latest else None}

