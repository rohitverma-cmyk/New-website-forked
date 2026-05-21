# Locofast — External RFQ Lead Ingest API

> **What this is**: A single REST endpoint for pushing RFQ leads into Locofast from any external system — CRM (HubSpot, Salesforce, Zoho), ad platforms, partner sites, marketing automation tools, etc.
>
> **What it does**: Creates a new RFQ in our pipeline that gets the same vendor fan-out and admin treatment as a customer-form RFQ. Returns the Locofast RFQ number for your records.

---

## 1. Endpoint

```
POST  https://fabric-sourcing-cms.preview.emergentagent.com/api/external/rfq
```

> ⚠ **This is the staging/test environment.** Use this URL to build, test, and certify your integration end-to-end. We'll switch you over to the production URL (`https://www.locofast.com/api/external/rfq`) and rotate API keys once your team is ready to go live.

---

## 2. Authentication

All requests must include an `X-API-Key` header. The key is shared with you separately and rotates on demand.

```
X-API-Key: lf_ingest_••••••••••••••••••••••••••••••••••••
```

Missing or wrong key → `401 Unauthorized`.

---

## 3. Categories

Locofast supports **four product categories**. The payload shape changes slightly per category:

| `category` | Quantity unit | Required spec field |
|---|---|---|
| `cotton`  | meters | `fabric_requirement_type` |
| `viscose` | meters | `fabric_requirement_type` |
| `denim`   | meters | `denim_specification` (free text) |
| `knits`   | kilograms | `knit_quality` (free text) |

---

## 4. Field reference

> **Reading the tables:** Min/Max columns show character length for strings, numeric range for numbers, and array size for arrays. Enums use the "Allowed values" column instead.

### 4.1 Buyer / contact fields

| Field | Type | Mandatory | Min | Max | Format / Allowed values | Sample |
|---|---|---|---|---|---|---|
| `category` | string enum | ✅ | — | — | `cotton` \| `viscose` \| `denim` \| `knits` | `"cotton"` |
| `full_name` | string | ✅ | 2 chars | 120 chars | Free text | `"Aarav Sharma"` |
| `email` | string | ✅ | — | 254 chars | Valid RFC 5322 email | `"aarav@acme.in"` |
| `phone` | string | ✅ | 10 chars | 15 chars | Indian 10-digit (starts 6/7/8/9) OR full E.164 | `"+919876543210"` |
| `company` | string | ✅ | 2 chars | 200 chars | Free text | `"Acme Garments Pvt Ltd"` |
| `gst_number` | string | ✅ | 15 chars | 15 chars | Regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` | `"27AAACR5055K1ZP"` |
| `website` | string | ❌ | 0 | 200 chars | Free text URL | `"https://acme.in"` |
| `message` | string | ❌ | 0 | 2000 chars | Free text | `"Need swatches by 15 Mar"` |
| `target_price_per_meter` | float | ❌ | 0 | 10000 | INR per metre | `185.0` |
| `dispatch_required_by` | string | ❌ | 10 chars | 10 chars | ISO date `YYYY-MM-DD` | `"2026-04-30"` |
| `delivery_pincode` | string | ❌ | 0 | 10 chars | Free text | `"110001"` |
| `delivery_city` | string | ❌ | 0 | 100 chars | Free text | `"New Delhi"` |
| `delivery_state` | string | ❌ | 0 | 100 chars | Free text | `"Delhi"` |
| `lead_source` | string | ❌ | 0 | 100 chars | Free text | `"HubSpot"` |
| `external_id` | string | ❌ | 0 | 100 chars | Free text — used for de-dupe | `"hubspot-deal-184729"` |
| `campaign` | string | ❌ | 0 | 100 chars | Free text | `"winter-25-cotton"` |

### 4.2 Fabric spec — common to all categories

> ⚠ **The more spec you send, the more accurate the vendor quote.** Sparse RFQs get sparse quotes.

| Field | Type | Mandatory | Min | Max | Format / Allowed values | Sample |
|---|---|---|---|---|---|---|
| `composition` | string | ✅ | 2 chars | 200 chars | Free text — fibre blend | `"100% Cotton"` / `"65% Cotton / 35% Polyester"` |
| `sub_category` | string | ❌ | 0 | 100 chars | Free text — see cheatsheet below | `"Poplin"` |
| `gsm` | int | ❌ | 20 | 2000 | Grams per square metre | `180` |
| `width_inches` | int | ❌ | 20 | 120 | Fabric width in inches | `58` |
| `stretch` | string enum | ❌ | — | — | `non_stretch` \| `2_way` \| `4_way` \| `comfort_stretch` \| `power_stretch` | `"2_way"` |
| `finish` | string | ❌ | 0 | 200 chars | Comma-separated finishes | `"Mercerized + Sanforized"` |
| `color_or_shade` | string | ❌ | 0 | 100 chars | Free text | `"Navy Blue"` |
| `pantone_code` | string | ❌ | 0 | 50 chars | Free text | `"19-3933 TCX"` |
| `end_use` | string | ❌ | 0 | 100 chars | Free text | `"Men's formal shirts"` |
| `certifications` | string array | ❌ | — | — | Array of free-text strings (no hard size limit, but keep ≤20 items for sanity) | `["GOTS", "OEKO-TEX"]` |

**Sub-category cheatsheet** (free text — common values, not enums):
- **Cotton**: `Poplin`, `Voile`, `Twill`, `Drill`, `Cambric`, `Khadi`, `Lawn`, `Slub`, `Chambray`, `Oxford`, `Canvas`, `Corduroy`, `Flannel`
- **Viscose**: `Modal`, `Lyocell`, `Tencel`, `Viscose-Linen`, `Viscose-Lycra`, `Rayon`
- **Denim**: `Selvedge`, `Stretch`, `Comfort Stretch`, `Power Stretch`, `Bull Denim`, `Indigo`, `Sulphur Black`, `Coated`, `Raw`
- **Knits**: use the dedicated `knit_type` enum field instead

### 4.3 Cotton & Viscose (woven) — extra fields

| Field | Type | Mandatory | Min | Max | Format / Allowed values | Sample |
|---|---|---|---|---|---|---|
| `fabric_requirement_type` | string enum | ✅ | — | — | `Greige` \| `Dyed` \| `RFD` \| `Printed` | `"Dyed"` |
| `quantity_meters` | string enum | ✅ | — | — | `1000_5000` \| `5000_20000` \| `20000_50000` \| `50000_plus` | `"5000_20000"` |
| `thread_count` | string | ❌ | 0 | 50 chars | Free text — warp × weft | `"60x60"` / `"100x100"` / `"30s x 20s"` |
| `weave_pattern` | string enum | ❌ | — | — | `Plain` \| `Twill` \| `Satin` \| `Dobby` \| `Jacquard` \| `Oxford` \| `Poplin` \| `Basket` \| `Herringbone` \| `Other` | `"Twill"` |

### 4.4 Denim — extra fields

| Field | Type | Mandatory | Min | Max | Format / Allowed values | Sample |
|---|---|---|---|---|---|---|
| `denim_specification` | string | ✅ | 5 chars | 500 chars | Free text — composition, weight, finish | `"65% Cotton / 35% Poly · 11 oz · Stretch · Indigo"` |
| `quantity_meters` | string enum | ✅ | — | — | `1000_2500` \| `2500_7500` \| `7500_25000` \| `25000_plus` | `"7500_25000"` |
| `weight_oz` | float | ❌ | 4 | 20 | oz/sq.yd. **Use this OR `gsm`, not both** | `11.0` |
| `wash_type` | string enum | ❌ | — | — | `Indigo` \| `Sulphur Black` \| `Raw` \| `Stone Wash` \| `Enzyme Wash` \| `Bleach Wash` \| `Acid Wash` \| `Pigment Dyed` \| `Other` | `"Indigo"` |

### 4.5 Knits — extra fields

| Field | Type | Mandatory | Min | Max | Format / Allowed values | Sample |
|---|---|---|---|---|---|---|
| `knit_quality` | string | ✅ | 5 chars | 200 chars | Free text — quality + GSM | `"4 Way Lycra 220-230 GSM"` |
| `quantity_kg` | string enum | ✅ | — | — | `less_than_200` \| `200_500` \| `500_1000` \| `1000_plus` | `"500_1000"` |
| `knit_type` | string enum | ❌ | — | — | `Single Jersey` \| `Interlock` \| `Pique` \| `Rib 1x1` \| `Rib 2x2` \| `French Terry` \| `Fleece` \| `Loopknit` \| `Waffle` \| `Mesh` \| `Honeycomb` \| `Other` | `"Single Jersey"` |

### 4.6 Quick mandatory-fields cheatsheet (per category)

| Category | Mandatory fields (in addition to the contact + common block) |
|---|---|
| **Cotton**  | `category="cotton"` · `fabric_requirement_type` · `quantity_meters` · `composition` |
| **Viscose** | `category="viscose"` · `fabric_requirement_type` · `quantity_meters` · `composition` |
| **Denim**   | `category="denim"` · `denim_specification` · `quantity_meters` · `composition` |
| **Knits**   | `category="knits"` · `knit_quality` · `quantity_kg` · `composition` |

Plus the **6 common contact fields** for every category: `full_name`, `email`, `phone`, `company`, `gst_number`. So **every RFQ has at least 9 mandatory fields** (5 contact + composition + category + 2 category-specific).

---

## 5. Request examples (one per category)

### 5.1 Cotton — full fabric spec

```bash
curl -X POST "https://fabric-sourcing-cms.preview.emergentagent.com/api/external/rfq" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lf_ingest_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "category": "cotton",
    "fabric_requirement_type": "Dyed",
    "quantity_meters": "5000_20000",
    "full_name": "Aarav Sharma",
    "email": "aarav@acmegarments.in",
    "phone": "+919876543210",
    "company": "Acme Garments Pvt Ltd",
    "gst_number": "27AAACR5055K1ZP",

    "composition": "100% Cotton",
    "sub_category": "Poplin",
    "thread_count": "60x60",
    "weave_pattern": "Plain",
    "gsm": 120,
    "width_inches": 58,
    "stretch": "non_stretch",
    "finish": "Mercerized + Sanforized",
    "color_or_shade": "Navy Blue",
    "pantone_code": "19-3933 TCX",
    "end_use": "Mens formal shirts",
    "certifications": ["GOTS", "OEKO-TEX"],

    "target_price_per_meter": 185.0,
    "dispatch_required_by": "2026-04-30",
    "delivery_pincode": "110001",
    "delivery_city": "New Delhi",
    "delivery_state": "Delhi",
    "message": "Need 5000m swatches first; bulk later",
    "lead_source": "HubSpot",
    "external_id": "hubspot-deal-184729",
    "campaign": "winter-25-cotton"
  }'
```

### 5.2 Viscose

```bash
curl -X POST "https://fabric-sourcing-cms.preview.emergentagent.com/api/external/rfq" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lf_ingest_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "category": "viscose",
    "fabric_requirement_type": "Printed",
    "quantity_meters": "1000_5000",
    "full_name": "Priya Iyer",
    "email": "priya@vstextiles.com",
    "phone": "9123456789",
    "company": "VS Textiles",
    "gst_number": "29AABCU9603R1ZX",
    "composition": "100% Viscose",
    "sub_category": "Modal",
    "weave_pattern": "Satin",
    "gsm": 110,
    "width_inches": 58,
    "lead_source": "Salesforce"
  }'
```

### 5.3 Denim

```bash
curl -X POST "https://fabric-sourcing-cms.preview.emergentagent.com/api/external/rfq" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lf_ingest_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "category": "denim",
    "denim_specification": "65% Cotton / 35% Poly · 11 oz · Stretch · Indigo · Dry-process washed",
    "quantity_meters": "7500_25000",
    "full_name": "Rohan Mehta",
    "email": "rohan@blueknit.in",
    "phone": "+919812345678",
    "company": "Blue Knit Apparel",
    "gst_number": "29AABCU9603R1ZX",
    "composition": "65% Cotton / 35% Polyester",
    "sub_category": "Comfort Stretch",
    "weight_oz": 11.0,
    "wash_type": "Indigo",
    "stretch": "comfort_stretch",
    "width_inches": 58,
    "target_price_per_meter": 320.0,
    "delivery_city": "Bengaluru",
    "lead_source": "Meta Ads · Denim April",
    "external_id": "meta-lead-994412"
  }'
```

### 5.4 Knits

```bash
curl -X POST "https://fabric-sourcing-cms.preview.emergentagent.com/api/external/rfq" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lf_ingest_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "category": "knits",
    "knit_quality": "4 Way Lycra 220-230 GSM",
    "quantity_kg": "500_1000",
    "full_name": "Sana Khan",
    "email": "sana@activeapparel.in",
    "phone": "9988776655",
    "company": "Active Apparel Co",
    "gst_number": "07AAACL7707J1ZF",
    "composition": "92% Polyester / 8% Spandex",
    "knit_type": "Single Jersey",
    "gsm": 220,
    "stretch": "4_way",
    "color_or_shade": "Fluorescent Yellow",
    "end_use": "Activewear leggings",
    "certifications": ["OEKO-TEX"],
    "message": "Need black + 2 fluorescent shades",
    "lead_source": "Partner Portal"
  }'
```

---

## 6. Response

### 6.1 Success — new RFQ created (201)

```json
{
  "success": true,
  "rfq_id": "a3a3a51b-7b3b-4a65-9a8e-9b4f4e1c1b7a",
  "rfq_number": "RFQ-AB12CD",
  "status": "new",
  "message": "RFQ ingested",
  "deduplicated": false,
  "customer_id": "c3a75dae-c5a3-442e-8022-f2b807c36786",
  "customer_existed": false
}
```

> `customer_id` is the Locofast customer the RFQ has been linked to.
> `customer_existed: false` means we auto-created a fresh customer for this lead.
> When the buyer logs in next via email-OTP or WhatsApp-OTP, this RFQ will already be waiting in their `/account → My Queries`.

### 6.2 Success — linked to existing customer (201)

If the email or phone already matches an existing Locofast customer, we link the RFQ to that customer and surface them via `customer_existed: true`:

```json
{
  "success": true,
  "rfq_id": "5451e681-a102-4510-b8f0-7b89aa74bb98",
  "rfq_number": "RFQ-5IDWZX",
  "status": "new",
  "message": "RFQ ingested",
  "deduplicated": false,
  "customer_id": "c3a75dae-c5a3-442e-8022-f2b807c36786",
  "customer_existed": true
}
```

### 6.3 Idempotent retry — existing RFQ returned (201)

If you push the same `external_id` twice, Locofast does **not** create a duplicate. The original RFQ is returned with `deduplicated: true`:

```json
{
  "success": true,
  "rfq_id": "a3a3a51b-7b3b-4a65-9a8e-9b4f4e1c1b7a",
  "rfq_number": "RFQ-AB12CD",
  "status": "new",
  "message": "Existing RFQ returned (deduplicated by external_id)",
  "deduplicated": true,
  "customer_id": "c3a75dae-c5a3-442e-8022-f2b807c36786",
  "customer_existed": true
}
```

### 6.4 Errors

| HTTP | Body | When |
|---|---|---|
| **401** | `{"detail": "Invalid API key"}` | Missing or wrong `X-API-Key` |
| **422** | `{"detail": [{"loc": ["body", "email"], "msg": "value is not a valid email address", ...}]}` | Validation error — `loc` array tells you which field failed |
| **503** | `{"detail": "Ingest API not configured"}` | Server-side env not set (you should never see this in production) |

---

## 7. De-duplication & idempotency

There are **two layers of de-duplication** — both run automatically:

### 7.1 RFQ-level de-dup (via `external_id`)

If your CRM sometimes pushes the same lead twice (network retries, webhook re-delivery, etc.), pass a stable `external_id`:

- First call → creates RFQ, returns `deduplicated: false`
- All subsequent calls with the same `external_id` → return original RFQ, `deduplicated: true`

This makes the endpoint **safe to retry**. We strongly recommend setting `external_id` for any automated integration.

### 7.2 Customer-level de-dup (via email + phone)

Every RFQ is automatically linked to a Locofast customer. We match against existing customers using:

1. **Email** match (canonical primary)
2. **Phone** match (normalized — accepts `9876543210`, `+919876543210`, `919876543210` interchangeably)

- If a match is found → RFQ links to that customer. `customer_existed: true`. Any blank fields on the customer profile (`company`, `gstin`) are gently backfilled from the lead — your fields never overwrite curated customer data.
- If no match → a fresh customer is auto-created with the lead data (`name`, `email`, `phone`, `company`, `gstin`, `city`, `state`, `pincode`). `customer_existed: false`. When the buyer next logs in via email-OTP or WhatsApp-OTP, the RFQ is already waiting in their `/account → My Queries`.

This means the same buyer pushing 5 RFQs across 3 categories from your CRM ends up as **1 customer with 5 linked RFQs** — no duplicate profiles, no orphaned leads.

---

## 8. What happens to the lead next?

Once ingested, the RFQ:

1. Lands in admin `/admin/enquiries` and `/admin/rfqs` dashboards (filtered as `source: external_api`)
2. Triggers a **vendor fan-out email** to all eligible sellers in the chosen category
3. Triggers an **admin notification email**
4. Becomes available in the customer's `/account → My Queries` view (if they later log in with the same email)
5. Vendors quote → buyer compares quotes → converts to a paid order via Razorpay

You'll know the lead is being worked on when the `status` field flips from `new` → `in_progress` → `quoted` → `won` / `lost` / `expired`.

---

## 9. Rate limits & SLAs

- **Soft limit**: 60 requests / minute / API key
- **Hard limit**: 1000 requests / hour / API key
- **Vendor fan-out latency**: < 30 sec from successful ingest
- **Uptime target**: 99.9% (preview environment is best-effort, not SLA-backed)

If you need higher limits for a one-time bulk import, let us know and we'll temporarily raise the cap.

---

## 10. Live OpenAPI / Swagger

A machine-readable schema is available at:

```
GET  https://fabric-sourcing-cms.preview.emergentagent.com/api/docs
GET  https://fabric-sourcing-cms.preview.emergentagent.com/api/openapi.json
```

The `/api/docs` page is interactive — paste your `X-API-Key` once, then click "Try it out" on any payload to send a real request.

---

## 11. Support

- API issues / new feature requests: **deepak.wadhwa@locofast.com**
- Status / incident updates: announced via your assigned account manager
