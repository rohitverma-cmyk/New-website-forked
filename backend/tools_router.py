from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os
from emergentintegrations.llm.chat import LlmChat, UserMessage
import uuid

router = APIRouter(prefix="/api/tools", tags=["tools"])

# ==================== MODELS ====================

class GSTCalculatorInput(BaseModel):
    amount: float
    gst_rate: float = 18.0
    is_inclusive: bool = False

class GSTCalculatorOutput(BaseModel):
    original_amount: float
    gst_rate: float
    gst_amount: float
    total_amount: float
    cgst: float
    sgst: float

class ProfitMarginInput(BaseModel):
    cost_price: float
    selling_price: Optional[float] = None
    desired_margin: Optional[float] = None

class ProfitMarginOutput(BaseModel):
    cost_price: float
    selling_price: float
    profit: float
    profit_margin_percentage: float
    markup_percentage: float

class DiscountInput(BaseModel):
    original_price: float
    discount_percentage: Optional[float] = None
    discount_amount: Optional[float] = None
    final_price: Optional[float] = None

class DiscountOutput(BaseModel):
    original_price: float
    discount_percentage: float
    discount_amount: float
    final_price: float
    savings: float

class GSMCalculatorInput(BaseModel):
    length: float  # in meters
    width: float   # in meters
    weight: float  # in grams
    from_ounce: Optional[float] = None  # oz/sq yard

class GSMCalculatorOutput(BaseModel):
    gsm: float
    oz_per_sq_yard: float
    description: str

class CBMCalculatorInput(BaseModel):
    length: float  # in cm
    width: float   # in cm
    height: float  # in cm
    quantity: int = 1

class CBMCalculatorOutput(BaseModel):
    length_m: float
    width_m: float
    height_m: float
    cbm_per_unit: float
    total_cbm: float
    quantity: int

class VolumetricWeightInput(BaseModel):
    length: float  # in cm
    width: float   # in cm
    height: float  # in cm
    divisor: float = 5000  # Standard courier divisor

class VolumetricWeightOutput(BaseModel):
    length: float
    width: float
    height: float
    volume_cm3: float
    volumetric_weight_kg: float
    divisor_used: float

class BarcodeInput(BaseModel):
    data: str
    barcode_type: str = "CODE128"

class ProductDescriptionInput(BaseModel):
    product_name: str
    fabric_type: Optional[str] = None
    composition: Optional[str] = None
    gsm: Optional[int] = None
    width: Optional[str] = None
    color: Optional[str] = None
    finish: Optional[str] = None
    use_cases: Optional[str] = None
    tone: str = "professional"  # professional, casual, luxury

class ProductTitleInput(BaseModel):
    product_name: str
    fabric_type: Optional[str] = None
    composition: Optional[str] = None
    color: Optional[str] = None
    key_feature: Optional[str] = None

class AIGenerationOutput(BaseModel):
    generated_text: str
    suggestions: List[str] = []

# ==================== CALCULATOR ENDPOINTS ====================

@router.post("/gst-calculator", response_model=GSTCalculatorOutput)
async def calculate_gst(data: GSTCalculatorInput):
    """Calculate GST (Goods and Services Tax) for Indian businesses"""
    if data.is_inclusive:
        # Price includes GST, extract base amount
        base_amount = data.amount / (1 + data.gst_rate / 100)
        gst_amount = data.amount - base_amount
        total_amount = data.amount
    else:
        # Price excludes GST, add GST
        base_amount = data.amount
        gst_amount = data.amount * (data.gst_rate / 100)
        total_amount = data.amount + gst_amount
    
    # CGST and SGST are each half of the total GST (for intra-state)
    cgst = gst_amount / 2
    sgst = gst_amount / 2
    
    return GSTCalculatorOutput(
        original_amount=round(base_amount, 2),
        gst_rate=data.gst_rate,
        gst_amount=round(gst_amount, 2),
        total_amount=round(total_amount, 2),
        cgst=round(cgst, 2),
        sgst=round(sgst, 2)
    )

@router.post("/profit-margin-calculator", response_model=ProfitMarginOutput)
async def calculate_profit_margin(data: ProfitMarginInput):
    """Calculate profit margin, markup, and selling price"""
    if data.selling_price:
        # Calculate margin from selling price
        profit = data.selling_price - data.cost_price
        profit_margin = (profit / data.selling_price) * 100 if data.selling_price > 0 else 0
        markup = (profit / data.cost_price) * 100 if data.cost_price > 0 else 0
        selling_price = data.selling_price
    elif data.desired_margin:
        # Calculate selling price from desired margin
        selling_price = data.cost_price / (1 - data.desired_margin / 100)
        profit = selling_price - data.cost_price
        profit_margin = data.desired_margin
        markup = (profit / data.cost_price) * 100 if data.cost_price > 0 else 0
    else:
        raise HTTPException(status_code=400, detail="Provide either selling_price or desired_margin")
    
    return ProfitMarginOutput(
        cost_price=round(data.cost_price, 2),
        selling_price=round(selling_price, 2),
        profit=round(profit, 2),
        profit_margin_percentage=round(profit_margin, 2),
        markup_percentage=round(markup, 2)
    )

@router.post("/discount-calculator", response_model=DiscountOutput)
async def calculate_discount(data: DiscountInput):
    """Calculate discount amount, percentage, or final price"""
    original = data.original_price
    
    if data.discount_percentage is not None:
        discount_amt = original * (data.discount_percentage / 100)
        final = original - discount_amt
        discount_pct = data.discount_percentage
    elif data.discount_amount is not None:
        discount_amt = data.discount_amount
        final = original - discount_amt
        discount_pct = (discount_amt / original) * 100 if original > 0 else 0
    elif data.final_price is not None:
        final = data.final_price
        discount_amt = original - final
        discount_pct = (discount_amt / original) * 100 if original > 0 else 0
    else:
        raise HTTPException(status_code=400, detail="Provide discount_percentage, discount_amount, or final_price")
    
    return DiscountOutput(
        original_price=round(original, 2),
        discount_percentage=round(discount_pct, 2),
        discount_amount=round(discount_amt, 2),
        final_price=round(final, 2),
        savings=round(discount_amt, 2)
    )

@router.post("/gsm-calculator", response_model=GSMCalculatorOutput)
async def calculate_gsm(data: GSMCalculatorInput):
    """Calculate fabric GSM (Grams per Square Meter) or convert from ounce"""
    if data.from_ounce is not None:
        # Convert oz/sq yard to GSM
        # 1 oz/sq yard = 33.906 GSM
        gsm = data.from_ounce * 33.906
        oz_per_sq_yard = data.from_ounce
        description = f"{data.from_ounce} oz/sq yard equals {round(gsm, 2)} GSM"
    else:
        # Calculate GSM from dimensions and weight
        area_sqm = data.length * data.width
        if area_sqm <= 0:
            raise HTTPException(status_code=400, detail="Area must be greater than zero")
        gsm = data.weight / area_sqm
        # Convert GSM to oz/sq yard (divide by 33.906)
        oz_per_sq_yard = gsm / 33.906
        description = f"Fabric weight: {round(gsm, 2)} GSM ({round(oz_per_sq_yard, 2)} oz/sq yard)"
    
    return GSMCalculatorOutput(
        gsm=round(gsm, 2),
        oz_per_sq_yard=round(oz_per_sq_yard, 2),
        description=description
    )

@router.post("/cbm-calculator", response_model=CBMCalculatorOutput)
async def calculate_cbm(data: CBMCalculatorInput):
    """Calculate Cubic Meter (CBM) for shipping cargo volume"""
    # Convert cm to meters
    length_m = data.length / 100
    width_m = data.width / 100
    height_m = data.height / 100
    
    cbm_per_unit = length_m * width_m * height_m
    total_cbm = cbm_per_unit * data.quantity
    
    return CBMCalculatorOutput(
        length_m=round(length_m, 4),
        width_m=round(width_m, 4),
        height_m=round(height_m, 4),
        cbm_per_unit=round(cbm_per_unit, 6),
        total_cbm=round(total_cbm, 6),
        quantity=data.quantity
    )

@router.post("/volumetric-weight-calculator", response_model=VolumetricWeightOutput)
async def calculate_volumetric_weight(data: VolumetricWeightInput):
    """Calculate volumetric/dimensional weight for courier shipping"""
    volume = data.length * data.width * data.height
    volumetric_weight = volume / data.divisor
    
    return VolumetricWeightOutput(
        length=data.length,
        width=data.width,
        height=data.height,
        volume_cm3=round(volume, 2),
        volumetric_weight_kg=round(volumetric_weight, 3),
        divisor_used=data.divisor
    )

# ==================== AI-POWERED ENDPOINTS ====================

@router.post("/product-description-generator", response_model=AIGenerationOutput)
async def generate_product_description(data: ProductDescriptionInput):
    """Generate AI-powered product descriptions for fabrics"""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Build context
    context_parts = [f"Product: {data.product_name}"]
    if data.fabric_type:
        context_parts.append(f"Fabric Type: {data.fabric_type}")
    if data.composition:
        context_parts.append(f"Composition: {data.composition}")
    if data.gsm:
        context_parts.append(f"Weight: {data.gsm} GSM")
    if data.width:
        context_parts.append(f"Width: {data.width}")
    if data.color:
        context_parts.append(f"Color: {data.color}")
    if data.finish:
        context_parts.append(f"Finish: {data.finish}")
    if data.use_cases:
        context_parts.append(f"Ideal for: {data.use_cases}")
    
    context = "\n".join(context_parts)
    
    tone_instructions = {
        "professional": "Use a professional, B2B tone suitable for wholesale buyers.",
        "casual": "Use a friendly, approachable tone.",
        "luxury": "Use an elegant, premium tone that emphasizes quality and exclusivity."
    }
    
    prompt = f"""Generate a compelling product description for this fabric:

{context}

Requirements:
- {tone_instructions.get(data.tone, tone_instructions['professional'])}
- Keep it concise (2-3 paragraphs max)
- Highlight key features and benefits
- Include potential applications
- Make it SEO-friendly with relevant keywords

Generate only the description, no headers or labels."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"desc-{uuid.uuid4()}",
            system_message="You are an expert fabric industry copywriter specializing in B2B product descriptions."
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Generate alternative suggestions
        suggestions = [
            f"Premium {data.fabric_type or 'fabric'} for quality-conscious buyers",
            f"Versatile {data.product_name} for multiple applications",
            f"High-performance textile solution"
        ]
        
        return AIGenerationOutput(
            generated_text=response,
            suggestions=suggestions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

@router.post("/product-title-generator", response_model=AIGenerationOutput)
async def generate_product_title(data: ProductTitleInput):
    """Generate SEO-friendly product titles for fabrics"""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Build context
    context_parts = [f"Product: {data.product_name}"]
    if data.fabric_type:
        context_parts.append(f"Type: {data.fabric_type}")
    if data.composition:
        context_parts.append(f"Composition: {data.composition}")
    if data.color:
        context_parts.append(f"Color: {data.color}")
    if data.key_feature:
        context_parts.append(f"Key Feature: {data.key_feature}")
    
    context = "\n".join(context_parts)
    
    prompt = f"""Generate 5 SEO-optimized product titles for this fabric:

{context}

Requirements:
- Each title should be 50-70 characters
- Include relevant keywords
- Make them compelling and descriptive
- Suitable for e-commerce/B2B marketplace
- Format: Return only the 5 titles, one per line, numbered 1-5"""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"title-{uuid.uuid4()}",
            system_message="You are an SEO expert specializing in B2B fabric product listings."
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse suggestions from response
        lines = [line.strip() for line in response.split('\n') if line.strip()]
        suggestions = []
        for line in lines:
            # Remove numbering if present
            clean_line = line.lstrip('0123456789.-) ').strip()
            if clean_line:
                suggestions.append(clean_line)
        
        main_title = suggestions[0] if suggestions else f"{data.product_name} - Premium Quality Fabric"
        
        return AIGenerationOutput(
            generated_text=main_title,
            suggestions=suggestions[:5]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

@router.post("/barcode-generator")
async def generate_barcode(data: BarcodeInput):
    """Generate barcode data (returns SVG barcode representation)"""
    # Basic barcode generation - returns the data needed for frontend to render
    # Supported types: CODE128, EAN13, UPC, CODE39
    
    supported_types = ["CODE128", "EAN13", "UPC", "CODE39", "QR"]
    if data.barcode_type not in supported_types:
        raise HTTPException(status_code=400, detail=f"Supported barcode types: {', '.join(supported_types)}")
    
    # Validation based on type
    if data.barcode_type == "EAN13" and len(data.data) != 12:
        raise HTTPException(status_code=400, detail="EAN13 requires exactly 12 digits (check digit calculated automatically)")
    if data.barcode_type == "UPC" and len(data.data) != 11:
        raise HTTPException(status_code=400, detail="UPC requires exactly 11 digits (check digit calculated automatically)")
    
    return {
        "data": data.data,
        "type": data.barcode_type,
        "message": f"Use this data to render {data.barcode_type} barcode on frontend"
    }

# ==================== FABRIC SPECIFIC TOOLS ====================

@router.post("/fabric-weight-converter")
async def convert_fabric_weight(
    value: float,
    from_unit: str,
    to_unit: str
):
    """Convert between fabric weight units (GSM, oz/sq yard, g/m)"""
    # Conversion factors to GSM
    to_gsm = {
        "gsm": 1,
        "oz_sqyd": 33.906,  # oz/sq yard to GSM
        "g_m": 1,  # grams per meter (same as GSM for unit width)
        "oz_linear_yard": 28.35 / 0.9144,  # approximate
    }
    
    from_gsm = {
        "gsm": 1,
        "oz_sqyd": 1/33.906,
        "g_m": 1,
        "oz_linear_yard": 0.9144 / 28.35,
    }
    
    if from_unit not in to_gsm or to_unit not in from_gsm:
        raise HTTPException(
            status_code=400, 
            detail=f"Supported units: gsm, oz_sqyd, g_m, oz_linear_yard"
        )
    
    # Convert to GSM first, then to target unit
    gsm_value = value * to_gsm[from_unit]
    result = gsm_value * from_gsm[to_unit]
    
    return {
        "input_value": value,
        "input_unit": from_unit,
        "output_value": round(result, 4),
        "output_unit": to_unit,
        "gsm_equivalent": round(gsm_value, 2)
    }

@router.get("/tools-list")
async def get_tools_list():
    """Get list of all available tools"""
    return {
        "calculators": [
            {
                "id": "gst-calculator",
                "name": "GST Calculator",
                "description": "Calculate GST, CGST, SGST for Indian businesses",
                "path": "/tools/gst-calculator"
            },
            {
                "id": "profit-margin-calculator",
                "name": "Profit Margin Calculator",
                "description": "Calculate profit margins and selling prices",
                "path": "/tools/profit-margin-calculator"
            },
            {
                "id": "discount-calculator",
                "name": "Discount Calculator",
                "description": "Calculate discounts for bulk orders",
                "path": "/tools/discount-calculator"
            },
            {
                "id": "gsm-calculator",
                "name": "GSM Calculator",
                "description": "Convert fabric weight to GSM",
                "path": "/tools/gsm-calculator"
            },
            {
                "id": "cbm-calculator",
                "name": "CBM Calculator",
                "description": "Calculate cargo volume for shipping",
                "path": "/tools/cbm-calculator"
            },
            {
                "id": "volumetric-weight-calculator",
                "name": "Volumetric Weight Calculator",
                "description": "Calculate dimensional weight for shipping",
                "path": "/tools/volumetric-weight-calculator"
            }
        ],
        "ai_tools": [
            {
                "id": "product-description-generator",
                "name": "Product Description Generator",
                "description": "AI-powered fabric descriptions",
                "path": "/tools/product-description-generator"
            },
            {
                "id": "product-title-generator",
                "name": "Product Title Generator",
                "description": "SEO-friendly product titles",
                "path": "/tools/product-title-generator"
            }
        ],
        "utility_tools": [
            {
                "id": "barcode-generator",
                "name": "Barcode Generator",
                "description": "Generate barcodes for inventory",
                "path": "/tools/barcode-generator"
            }
        ]
    }
