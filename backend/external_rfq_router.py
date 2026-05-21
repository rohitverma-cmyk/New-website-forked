"""
External RFQ Lead-Ingest API
============================

Server-to-server endpoint for pushing RFQ leads from any external system
(CRM, marketing automation, partner site, ad platforms, etc.) into
Locofast's RFQ pipeline.

  • Auth: static API key in `X-API-Key` header (rotate via env)
  • Path: POST /api/external/rfq
  • One endpoint, four category-specific payload shapes (cotton, knits,
    denim, viscose) — schema declared with Pydantic discriminator so
    OpenAPI (/api/docs) renders all four contracts neatly.

Once created, the RFQ:
  - Gets a Locofast RFQ number (RFQ-XXXXXX)
  - Lands in the same vendor fan-out + admin dashboard as a customer-form
    RFQ (no separate workflow)
  - Carries `lead_source` + `external_id` so admins can trace it back
    to the originating CRM record
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal, Optional, Union
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, field_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/external", tags=["External Lead Ingest"])

db = None


def set_db(database):
    global db
    db = database


import re

GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")


# ──────────────────────────────────────────────────────────────────────────
# Auth — API key in X-API-Key header
# ──────────────────────────────────────────────────────────────────────────
def require_ingest_key(x_api_key: Annotated[str, Header(alias="X-API-Key")] = ""):
    expected = os.environ.get("LOCOFAST_INGEST_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Ingest API not configured")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


# ──────────────────────────────────────────────────────────────────────────
# Enums — locked vocabularies that match the customer-facing RFQ form so
# admin filters and vendor routing keep working uniformly.
# ──────────────────────────────────────────────────────────────────────────
class FabricRequirementType(str, Enum):
    GREIGE = "Greige"
    DYED = "Dyed"
    RFD = "RFD"
    PRINTED = "Printed"


class CottonViscoseQuantity(str, Enum):
    """Meter buckets for cotton & viscose."""
    Q1 = "1000_5000"
    Q2 = "5000_20000"
    Q3 = "20000_50000"
    Q4 = "50000_plus"


class DenimQuantity(str, Enum):
    """Meter buckets for denim."""
    Q1 = "1000_2500"
    Q2 = "2500_7500"
    Q3 = "7500_25000"
    Q4 = "25000_plus"


class KnitsQuantity(str, Enum):
    """Kilogram buckets for knits."""
    Q1 = "less_than_200"
    Q2 = "200_500"
    Q3 = "500_1000"
    Q4 = "1000_plus"


class StretchType(str, Enum):
    NONE = "non_stretch"
    TWO_WAY = "2_way"
    FOUR_WAY = "4_way"
    COMFORT_STRETCH = "comfort_stretch"
    POWER_STRETCH = "power_stretch"


class WeavePattern(str, Enum):
    """Weave patterns for cotton/viscose wovens."""
    PLAIN = "Plain"
    TWILL = "Twill"
    SATIN = "Satin"
    DOBBY = "Dobby"
    JACQUARD = "Jacquard"
    OXFORD = "Oxford"
    POPLIN = "Poplin"
    BASKET = "Basket"
    HERRINGBONE = "Herringbone"
    OTHER = "Other"


class KnitType(str, Enum):
    """Knit construction types."""
    SINGLE_JERSEY = "Single Jersey"
    INTERLOCK = "Interlock"
    PIQUE = "Pique"
    RIB_1X1 = "Rib 1x1"
    RIB_2X2 = "Rib 2x2"
    FRENCH_TERRY = "French Terry"
    FLEECE = "Fleece"
    LOOPKNIT = "Loopknit"
    WAFFLE = "Waffle"
    MESH = "Mesh"
    HONEYCOMB = "Honeycomb"
    OTHER = "Other"


class DenimWashType(str, Enum):
    """Denim wash / dye treatment."""
    INDIGO = "Indigo"
    SULPHUR_BLACK = "Sulphur Black"
    RAW = "Raw"
    STONE_WASH = "Stone Wash"
    ENZYME_WASH = "Enzyme Wash"
    BLEACH_WASH = "Bleach Wash"
    ACID_WASH = "Acid Wash"
    PIGMENT = "Pigment Dyed"
    OTHER = "Other"


# ──────────────────────────────────────────────────────────────────────────
# Shared contact / metadata block — every category uses this
# ──────────────────────────────────────────────────────────────────────────
class ContactMeta(BaseModel):
    full_name: str = Field(
        ...,
        min_length=2,
        max_length=120,
        description="Buyer's full name. Mandatory.",
        examples=["Aarav Sharma"],
    )
    email: EmailStr = Field(
        ...,
        description="Buyer's email — used for quote notifications. Mandatory. "
                    "Used together with phone to deduplicate against existing customers.",
        examples=["aarav@acmegarments.in"],
    )
    phone: str = Field(
        ...,
        min_length=10,
        max_length=15,
        description="Buyer's mobile (E.164 OR 10-digit Indian). Mandatory. "
                    "Used together with email to deduplicate against existing customers.",
        examples=["+919876543210"],
    )
    company: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Buyer's company name. Mandatory.",
        examples=["Acme Garments Pvt Ltd"],
    )
    gst_number: str = Field(
        ...,
        min_length=15,
        max_length=15,
        description="Buyer's GSTIN — 15 chars, format: 22AAAAA0000A1Z5. "
                    "Mandatory. Format-validated only (no live GSTN lookup at ingest "
                    "time — the customer can re-verify in their profile later).",
        examples=["27AAACR5055K1ZP"],
    )
    website: Optional[str] = Field(
        "", max_length=200,
        description="Buyer's company website. Optional.",
        examples=["https://acmegarments.in"],
    )
    message: Optional[str] = Field(
        "", max_length=2000,
        description="Free-text additional notes from the buyer. Optional.",
        examples=["Need swatches before 15 Mar; bulk dispatch by 30 Apr"],
    )
    target_price_per_meter: Optional[float] = Field(
        None, ge=0, le=10000,
        description="Buyer's target price per meter in INR. Optional — passed to vendors.",
        examples=[185.0],
    )
    dispatch_required_by: Optional[str] = Field(
        None,
        description="Required dispatch date in ISO 8601 format (YYYY-MM-DD). Optional.",
        examples=["2026-04-30"],
    )
    delivery_pincode: Optional[str] = Field(
        "", min_length=0, max_length=10,
        description="Delivery PIN/postal code. Optional.",
        examples=["110001"],
    )
    delivery_city: Optional[str] = Field(
        "", max_length=100,
        description="Delivery city. Optional.",
        examples=["New Delhi"],
    )
    delivery_state: Optional[str] = Field(
        "", max_length=100,
        description="Delivery state. Optional.",
        examples=["Delhi"],
    )

    # Lead-tracking fields — for CRM/agency attribution
    lead_source: Optional[str] = Field(
        "", max_length=100,
        description="Where this lead originated. Free-form. Optional.",
        examples=["HubSpot", "Meta Ads · Cotton Q2 Campaign", "Partner Portal"],
    )
    external_id: Optional[str] = Field(
        "", max_length=100,
        description="The lead ID in your source system. Used for de-duplication "
                    "if the same lead is pushed twice. Optional but strongly recommended.",
        examples=["hubspot-deal-184729"],
    )
    campaign: Optional[str] = Field(
        "", max_length=100,
        description="Marketing campaign / UTM tag. Optional.",
        examples=["winter-25-cotton"],
    )

    # ── SHARED FABRIC SPEC FIELDS (apply to every category) ──
    # These all default to optional but the more the buyer fills, the more
    # accurate the vendor quotes.

    composition: str = Field(
        ...,
        min_length=2, max_length=200,
        description="Fibre composition / blend. Mandatory — vendors cannot "
                    "quote without knowing the fibre breakdown.",
        examples=["100% Cotton", "65% Cotton / 35% Polyester", "100% Viscose Lyocell"],
    )
    sub_category: Optional[str] = Field(
        "", max_length=100,
        description="Sub-category within the chosen category. Free text. "
                    "E.g. for cotton: Poplin, Twill, Voile, Drill, Cambric, "
                    "Khadi, Lawn, Slub, Chambray, Oxford, Canvas, Corduroy. "
                    "For viscose: Modal, Lyocell, Tencel, Viscose-Linen. "
                    "For denim: Selvedge, Stretch, Bull Denim, Indigo. "
                    "For knits: see knit_type field instead.",
        examples=["Poplin"],
    )
    gsm: Optional[int] = Field(
        None, ge=20, le=2000,
        description="Fabric weight in grams per square metre. "
                    "Common ranges — voile/lawn: 60-90, poplin: 100-140, "
                    "twill/drill: 180-300, denim: 280-400, jersey knit: 140-220, "
                    "fleece: 220-360.",
        examples=[180],
    )
    width_inches: Optional[int] = Field(
        None, ge=20, le=120,
        description="Fabric width in inches. Standard widths: 44\", 46\", 58\", 60\", 72\". "
                    "Open width vs tubular varies for knits — flag in `message` if needed.",
        examples=[58],
    )
    stretch: Optional[StretchType] = Field(
        None,
        description="Stretch property. One of: `non_stretch`, `2_way`, "
                    "`4_way`, `comfort_stretch`, `power_stretch`.",
        examples=["2_way"],
    )
    finish: Optional[str] = Field(
        "", max_length=200,
        description="Fabric finishes — comma-separated when multiple. "
                    "Examples: Mercerized, Sanforized, Pre-shrunk, Calendered, "
                    "Brushed, Peached, Anti-microbial, Water-repellent.",
        examples=["Mercerized + Sanforized"],
    )
    color_or_shade: Optional[str] = Field(
        "", max_length=100,
        description="Required colour/shade. Free text. Use `pantone_code` "
                    "for exact reference.",
        examples=["Navy Blue"],
    )
    pantone_code: Optional[str] = Field(
        "", max_length=50,
        description="Pantone TPX/TCX/TPG colour code. Optional.",
        examples=["19-3933 TCX"],
    )
    end_use: Optional[str] = Field(
        "", max_length=100,
        description="What the buyer plans to make from this fabric. Helps "
                    "vendors recommend appropriate finishes / quality grades.",
        examples=["Men's formal shirts"],
    )
    certifications: Optional[list[str]] = Field(
        None,
        description="Required certifications, list of strings. Common: "
                    "GOTS, OEKO-TEX, BCI, GRS, RDS, Fair Trade, Organic.",
        examples=[["GOTS", "OEKO-TEX"]],
    )

    @field_validator("gst_number")
    @classmethod
    def _validate_gstin(cls, v: str) -> str:
        v = v.strip().upper()
        if not GSTIN_REGEX.match(v):
            raise ValueError(
                "gst_number must be a valid 15-character GSTIN "
                "(format: 22AAAAA0000A1Z5)"
            )
        return v

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 10:
            if digits[0] not in "6789":
                raise ValueError("phone must be a valid 10-digit Indian mobile (starting 6/7/8/9) or full E.164")
        elif len(digits) == 12 and digits.startswith("91"):
            if digits[2] not in "6789":
                raise ValueError("phone must be a valid Indian mobile")
        elif len(digits) < 10 or len(digits) > 15:
            raise ValueError("phone must be 10-digit Indian or full E.164 (max 15 digits)")
        return v


# ──────────────────────────────────────────────────────────────────────────
# Per-category payload shapes (Pydantic discriminator on `category`)
# ──────────────────────────────────────────────────────────────────────────
class CottonRFQ(ContactMeta):
    """Cotton RFQ — quantity in meters, fabric requirement type required."""
    category: Literal["cotton"] = Field(..., description="Must be 'cotton'.")
    fabric_requirement_type: FabricRequirementType = Field(
        ...,
        description="Mandatory for cotton. One of: Greige, Dyed, RFD, Printed.",
        examples=["Dyed"],
    )
    quantity_meters: CottonViscoseQuantity = Field(
        ...,
        description="Mandatory. Bucketed quantity in meters.",
        examples=["5000_20000"],
    )
    thread_count: Optional[str] = Field(
        "", max_length=50,
        description="Warp x weft thread count. Free text — accepts `60x60`, "
                    "`100x100`, `30s x 20s`, `40s/2 x 40s/2`, etc. "
                    "Higher counts = finer / smoother fabric.",
        examples=["60x60"],
    )
    weave_pattern: Optional[WeavePattern] = Field(
        None,
        description="Weave construction. One of: Plain, Twill, Satin, "
                    "Dobby, Jacquard, Oxford, Poplin, Basket, Herringbone, Other.",
        examples=["Twill"],
    )


class ViscoseRFQ(ContactMeta):
    """Viscose RFQ — quantity in meters, fabric requirement type required."""
    category: Literal["viscose"] = Field(..., description="Must be 'viscose'.")
    fabric_requirement_type: FabricRequirementType = Field(
        ...,
        description="Mandatory for viscose. One of: Greige, Dyed, RFD, Printed.",
        examples=["Printed"],
    )
    quantity_meters: CottonViscoseQuantity = Field(
        ...,
        description="Mandatory. Bucketed quantity in meters.",
        examples=["1000_5000"],
    )
    thread_count: Optional[str] = Field(
        "", max_length=50,
        description="Warp x weft thread count. Free text.",
        examples=["100x100"],
    )
    weave_pattern: Optional[WeavePattern] = Field(
        None,
        description="Weave construction.",
        examples=["Satin"],
    )


class DenimRFQ(ContactMeta):
    """Denim RFQ — quantity in meters, free-text spec required."""
    category: Literal["denim"] = Field(..., description="Must be 'denim'.")
    denim_specification: str = Field(
        ..., min_length=5, max_length=500,
        description="Mandatory. Free-text denim spec (composition, weight, finish).",
        examples=["65% Cotton / 35% Poly · 11 oz · Stretch · Indigo · Dry-process washed"],
    )
    quantity_meters: DenimQuantity = Field(
        ...,
        description="Mandatory. Bucketed quantity in meters.",
        examples=["7500_25000"],
    )
    weight_oz: Optional[float] = Field(
        None, ge=4, le=20,
        description="Denim weight in oz/sq.yd. Common ranges: lightweight 7-9 oz, "
                    "mid 10-12 oz, heavy 13-16 oz. Use this OR `gsm`, not both.",
        examples=[11.0],
    )
    wash_type: Optional[DenimWashType] = Field(
        None,
        description="Wash / dye treatment. One of: Indigo, Sulphur Black, Raw, "
                    "Stone Wash, Enzyme Wash, Bleach Wash, Acid Wash, Pigment Dyed, Other.",
        examples=["Indigo"],
    )


class KnitsRFQ(ContactMeta):
    """Knits RFQ — quantity in kg, knit quality required."""
    category: Literal["knits"] = Field(..., description="Must be 'knits'.")
    knit_quality: str = Field(
        ..., min_length=5, max_length=200,
        description="Mandatory. Knit quality / GSM specification (free text).",
        examples=["4 Way Lycra 220-230 GSM"],
    )
    quantity_kg: KnitsQuantity = Field(
        ...,
        description="Mandatory. Bucketed quantity in kilograms.",
        examples=["500_1000"],
    )
    knit_type: Optional[KnitType] = Field(
        None,
        description="Knit construction type. One of: Single Jersey, Interlock, "
                    "Pique, Rib 1x1, Rib 2x2, French Terry, Fleece, Loopknit, "
                    "Waffle, Mesh, Honeycomb, Other.",
        examples=["Single Jersey"],
    )


# Discriminated union — FastAPI auto-generates 4 payload examples in OpenAPI
RFQPayload = Annotated[
    Union[CottonRFQ, ViscoseRFQ, DenimRFQ, KnitsRFQ],
    Field(discriminator="category"),
]


class RFQIngestResponse(BaseModel):
    success: bool = True
    rfq_id: str = Field(..., examples=["a3a3a51b-7b3b-4a65-9a8e-9b4f4e1c1b7a"])
    rfq_number: str = Field(..., examples=["RFQ-AB12CD"])
    status: Literal["new"] = "new"
    message: str = "RFQ ingested"
    deduplicated: bool = Field(
        False,
        description="True when an existing RFQ with the same `external_id` "
                    "was returned instead of a new one being created.",
    )
    customer_id: str = Field(
        "",
        description="The Locofast customer ID this RFQ is linked to. If the buyer "
                    "(matched on email or phone) already had an account, this is their "
                    "existing customer_id; otherwise a fresh customer was auto-created.",
        examples=["c3a75dae-c5a3-442e-8022-f2b807c36786"],
    )
    customer_existed: bool = Field(
        False,
        description="True if a Locofast customer with this email or phone "
                    "already existed before the RFQ was ingested.",
    )


# ──────────────────────────────────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────────────────────────────────
@router.post(
    "/rfq",
    response_model=RFQIngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest an RFQ lead",
    description=(
        "Push an RFQ lead from any external system (CRM, ad platform, partner site, etc.).\n\n"
        "Requires `X-API-Key` header. Choose the schema for your `category`:\n"
        "- `cotton` / `viscose` → meters + `fabric_requirement_type`\n"
        "- `denim` → meters + `denim_specification`\n"
        "- `knits` → kg + `knit_quality`\n\n"
        "If `external_id` matches a previously-ingested RFQ, the existing one is returned "
        "(no duplicate created)."
    ),
    responses={
        201: {"description": "RFQ created successfully"},
        200: {"description": "Existing RFQ returned (de-duplicated by external_id)"},
        401: {"description": "Missing or invalid X-API-Key"},
        422: {"description": "Validation error — see `detail` for field-level issues"},
    },
)
async def ingest_rfq(payload: RFQPayload, _auth: bool = Depends(require_ingest_key)):
    # De-dupe on external_id first — idempotent retry safety.
    if payload.external_id:
        existing = await db.rfq_submissions.find_one(
            {"external_id": payload.external_id},
            {"_id": 0, "id": 1, "rfq_number": 1, "status": 1, "customer_id": 1},
        )
        if existing:
            return RFQIngestResponse(
                rfq_id=existing["id"],
                rfq_number=existing["rfq_number"],
                status=existing.get("status", "new"),
                message="Existing RFQ returned (deduplicated by external_id)",
                deduplicated=True,
                customer_id=existing.get("customer_id", "") or "",
                customer_existed=True,
            )

    # Customer lookup / auto-create — match on email OR normalized phone
    # so the RFQ links to a single canonical customer profile, even if the
    # buyer logged in earlier via email but the CRM is pushing only phone.
    customer_id, customer_existed = await _resolve_or_create_customer(payload)

    rfq_id = str(uuid.uuid4())
    rfq_number = await _generate_rfq_number()

    base = payload.model_dump()
    category = base["category"]

    rfq_doc = {
        "id": rfq_id,
        "rfq_number": rfq_number,
        "customer_id": customer_id,  # ← now linked
        "category": category,
        "fabric_requirement_type": base.get("fabric_requirement_type", "") or "",
        "quantity_meters": base.get("quantity_meters", "") or "",
        "quantity_kg": base.get("quantity_kg", "") or "",
        "knit_quality": base.get("knit_quality", "") or "",
        "denim_specification": base.get("denim_specification", "") or "",
        "full_name": base["full_name"],
        "email": base["email"],
        "phone": base["phone"],
        "company": base.get("company") or "",
        "gst_number": base.get("gst_number") or "",
        "website": base.get("website") or "",
        "message": base.get("message") or "",
        "target_price_per_meter": base.get("target_price_per_meter"),
        "dispatch_required_by": base.get("dispatch_required_by") or "",
        "delivery_pincode": base.get("delivery_pincode") or "",
        "delivery_city": base.get("delivery_city") or "",
        "delivery_state": base.get("delivery_state") or "",

        # Shared fabric spec
        "composition": base.get("composition") or "",
        "sub_category": base.get("sub_category") or "",
        "gsm": base.get("gsm"),
        "width_inches": base.get("width_inches"),
        "stretch": base.get("stretch") or "",
        "finish": base.get("finish") or "",
        "color_or_shade": base.get("color_or_shade") or "",
        "pantone_code": base.get("pantone_code") or "",
        "end_use": base.get("end_use") or "",
        "certifications": base.get("certifications") or [],

        # Per-category fabric spec — only the relevant ones populate
        "thread_count": base.get("thread_count") or "",
        "weave_pattern": base.get("weave_pattern") or "",
        "weight_oz": base.get("weight_oz"),
        "wash_type": base.get("wash_type") or "",
        "knit_type": base.get("knit_type") or "",

        "lead_source": base.get("lead_source") or "",
        "external_id": base.get("external_id") or "",
        "campaign": base.get("campaign") or "",
        "ingested_via": "external_api",
        "status": "new",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.rfq_submissions.insert_one(rfq_doc)

    await db.enquiries.insert_one({
        "id": str(uuid.uuid4()),
        "name": rfq_doc["full_name"],
        "email": rfq_doc["email"],
        "phone": rfq_doc["phone"],
        "company": rfq_doc["company"] or rfq_doc["website"],
        "message": _format_enquiry_message(rfq_doc),
        "enquiry_type": "rfq",
        "source": rfq_doc["lead_source"] or "external_api",
        "rfq_id": rfq_id,
        "rfq_number": rfq_number,
        "status": "new",
        "created_at": rfq_doc["created_at"],
    })

    try:
        import asyncio
        from email_router import send_rfq_notification, send_rfq_vendor_fanout
        asyncio.create_task(send_rfq_notification(rfq_doc))
        asyncio.create_task(send_rfq_vendor_fanout(rfq_doc))
    except Exception as e:
        logger.warning(f"External RFQ {rfq_number} email queue failed: {e}")

    # Push to campaigns.locofast.com admin — same payload shape as the
    # website RFQ form (server.py:create_rfq_lead) so this lead surfaces in
    # the campaigns admin alongside organic Website RFQ leads.
    try:
        import asyncio
        asyncio.create_task(_push_to_campaigns_admin(rfq_doc))
    except Exception as e:
        logger.warning(f"External RFQ {rfq_number} campaigns push failed: {e}")

    logger.info(
        f"External RFQ ingested: {rfq_number} · category={category} · "
        f"source={rfq_doc['lead_source']} · customer={customer_id} · existed={customer_existed}"
    )

    return RFQIngestResponse(
        rfq_id=rfq_id,
        rfq_number=rfq_number,
        status="new",
        message="RFQ ingested",
        deduplicated=False,
        customer_id=customer_id,
        customer_existed=customer_existed,
    )


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────
async def _generate_rfq_number() -> str:
    import random
    import string
    while True:
        n = "RFQ-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not await db.rfq_submissions.find_one({"rfq_number": n}, {"_id": 1}):
            return n


def _normalize_phone_for_lookup(raw: str) -> str:
    """Strip non-digits + ensure 91 prefix so we can match against any
    historic phone format stored in `customers.phone` (variously '9876543210',
    '+91 98765 43210', '919876543210')."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10 and digits[0] in "6789":
        return "91" + digits
    return digits


async def _resolve_or_create_customer(payload) -> tuple[str, bool]:
    """Match an existing customer on email OR phone. If found, return their id +
    True. If not, auto-create a fresh customer doc with the lead data so when
    the buyer later logs in (email-OTP or WhatsApp-OTP), the RFQ is already
    waiting in their `/account → My Queries`.

    Returns (customer_id, customer_existed).
    """
    email = (payload.email or "").strip().lower()
    e164_phone = _normalize_phone_for_lookup(payload.phone or "")

    # Lookup — email is the canonical primary; phone is the secondary key.
    query_or = []
    if email:
        query_or.append({"email": email})
    if e164_phone:
        query_or.append({"phone": e164_phone})
        query_or.append({"phone": e164_phone[2:]})  # bare 10-digit
        query_or.append({"phone": "+" + e164_phone})  # with + prefix
        query_or.append({"phone": payload.phone})  # raw

    existing = None
    if query_or:
        existing = await db.customers.find_one({"$or": query_or}, {"_id": 0, "id": 1, "company": 1, "gstin": 1})

    if existing:
        # Soft-enrich: backfill any blank fields on the existing customer
        # without overwriting fields they've curated themselves.
        soft_update = {}
        if not existing.get("company") and payload.company:
            soft_update["company"] = payload.company
        if not existing.get("gstin") and payload.gst_number:
            soft_update["gstin"] = payload.gst_number
        if soft_update:
            soft_update["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.customers.update_one({"id": existing["id"]}, {"$set": soft_update})
        return existing["id"], True

    # Brand new customer — create with the lead data so they can log in
    # later via email-OTP and find their RFQ already in My Queries.
    new_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer_doc = {
        "id": new_id,
        "email": email,
        "name": payload.full_name,
        "phone": e164_phone or payload.phone,
        "phone_verified": False,
        "company": payload.company,
        "gstin": payload.gst_number,
        "gst_verified": False,  # ingest-time format check only; live verify on profile save
        "address": "",
        "city": payload.delivery_city or "",
        "state": payload.delivery_state or "",
        "pincode": payload.delivery_pincode or "",
        "created_via": "external_api",
        "lead_source": payload.lead_source or "",
        "created_at": now,
        "updated_at": now,
    }
    await db.customers.insert_one(customer_doc)
    return new_id, False


async def _push_to_campaigns_admin(rfq_doc: dict) -> None:
    """Forward a freshly-ingested external RFQ to campaigns.locofast.com so
    it surfaces in the campaigns admin alongside organic website RFQ leads.

    Mirrors the payload shape used by `server.py:create_rfq_lead` (the
    public /quote form) so admins see one consistent lead format regardless
    of source. Tagged `campaign: "Website RFQ"` per business decision —
    external CRM leads are treated as first-class website leads.

    Failures are swallowed; the RFQ is already persisted locally and will
    reach admins via the email fan-out anyway.
    """
    import httpx

    payload = {
        "name": rfq_doc.get("full_name") or "",
        "company": rfq_doc.get("company") or "",
        "email": rfq_doc.get("email") or "",
        "phone": rfq_doc.get("phone") or "",
        "company_type": (rfq_doc.get("category") or "").capitalize() or "Buyer",
        "campaign": "Website RFQ",
    }

    gst = rfq_doc.get("gst_number") or ""
    if gst:
        payload["gst_info"] = {
            "legal_name": rfq_doc.get("company") or "",
            "trade_name": rfq_doc.get("company") or "",
            "status": "",
            "city": rfq_doc.get("delivery_city") or "",
            "state": rfq_doc.get("delivery_state") or "",
            "address": "",
            "fabric_type": rfq_doc.get("category") or "",
            "gstin": gst,
        }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post("https://campaigns.locofast.com/api/leads", json=payload)
        logger.info(f"External RFQ {rfq_doc.get('rfq_number')} pushed to campaigns admin")
    except Exception as e:
        logger.warning(f"campaigns.locofast push failed for {rfq_doc.get('rfq_number')}: {e}")


def _format_enquiry_message(d: dict) -> str:
    parts = [f"**RFQ #{d['rfq_number']}** (External · {d.get('lead_source') or 'API'})"]
    parts.append(f"Category: {d['category'].upper()}")
    if d["category"] in ("cotton", "viscose"):
        parts.append(f"Type: {d['fabric_requirement_type']}  |  Qty: {d['quantity_meters']} m")
    elif d["category"] == "denim":
        parts.append(f"Spec: {d['denim_specification']}  |  Qty: {d['quantity_meters']} m")
    elif d["category"] == "knits":
        parts.append(f"Quality: {d['knit_quality']}  |  Qty: {d['quantity_kg']} kg")

    # Fabric-spec block — only show fields that have values
    fabric = []
    if d.get("composition"):
        fabric.append(f"Composition: {d['composition']}")
    if d.get("sub_category"):
        fabric.append(f"Sub-cat: {d['sub_category']}")
    if d.get("thread_count"):
        fabric.append(f"Thread count: {d['thread_count']}")
    if d.get("weave_pattern"):
        fabric.append(f"Weave: {d['weave_pattern']}")
    if d.get("knit_type"):
        fabric.append(f"Knit type: {d['knit_type']}")
    if d.get("wash_type"):
        fabric.append(f"Wash: {d['wash_type']}")
    if d.get("gsm"):
        fabric.append(f"GSM: {d['gsm']}")
    if d.get("weight_oz"):
        fabric.append(f"Weight: {d['weight_oz']} oz")
    if d.get("width_inches"):
        fabric.append(f"Width: {d['width_inches']}\"")
    if d.get("stretch"):
        fabric.append(f"Stretch: {d['stretch']}")
    if d.get("finish"):
        fabric.append(f"Finish: {d['finish']}")
    if d.get("color_or_shade"):
        fabric.append(f"Color: {d['color_or_shade']}")
    if d.get("pantone_code"):
        fabric.append(f"Pantone: {d['pantone_code']}")
    if d.get("end_use"):
        fabric.append(f"End-use: {d['end_use']}")
    if d.get("certifications"):
        fabric.append(f"Certs: {', '.join(d['certifications'])}")
    if fabric:
        parts.append("\nFabric spec:\n  " + "\n  ".join(fabric))

    if d.get("target_price_per_meter"):
        parts.append(f"Target ₹{d['target_price_per_meter']}/m")
    if d.get("dispatch_required_by"):
        parts.append(f"Dispatch by: {d['dispatch_required_by']}")
    if d.get("gst_number"):
        parts.append(f"GST: {d['gst_number']}")
    if d.get("external_id"):
        parts.append(f"External ID: {d['external_id']}")
    if d.get("message"):
        parts.append(f"\nNotes: {d['message']}")
    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────────────
# Public docs page — serves the markdown spec with curl examples
# ──────────────────────────────────────────────────────────────────────────
DOC_PATH = Path(__file__).parent.parent / "EXTERNAL_RFQ_API.md"


@router.get(
    "/rfq/docs",
    summary="Markdown integration guide",
    description="Returns the human-readable API docs (markdown). Pair with /api/docs (OpenAPI/Swagger).",
)
async def serve_docs():
    if DOC_PATH.exists():
        return FileResponse(str(DOC_PATH), media_type="text/markdown")
    raise HTTPException(status_code=404, detail="Docs file not found")
