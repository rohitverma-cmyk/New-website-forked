# Locofast - Fabric Sourcing Platform PRD

## Problem Statement
Build a CMS-driven B2B fabric sourcing platform ("locofast.com v 2.0"). Core requirements include vendor portals, instant booking flows, RFQ lead generation, and supplier storefronts.

## Tech Stack
- **Frontend**: React (CRA), Tailwind CSS, Shadcn/UI, react-helmet-async
- **Backend**: FastAPI, Motor (MongoDB async), Pydantic
- **Database**: MongoDB
- **Integrations**: Razorpay (Payments), Resend (Emails), Cloudinary (Images/Videos)

## Architecture
```
/app
├── backend/
│   ├── server.py                    # Main FastAPI app (Sellers, Fabrics, Enquiries, Reviews CRUD)
│   ├── vendor_router.py             # Updated: Comprehensive FabricCreate/FabricUpdate models
│   ├── cloudinary_router.py         # Updated: Accepts vendor tokens for image uploads
│   ├── orders_router.py             # Orders + Razorpay + email triggers
│   ├── email_router.py              # Email templates (Resend)
│   ├── seo_router.py                # SEO prerender
│   ├── supplier_router.py           # Googlebot HTML prerendering
│   └── supplier_profile_router.py   # Supplier profile API + enquiry + real reviews
└── frontend/src/
    ├── pages/
    │   ├── admin/
    │   │   ├── AdminSellerDetail.js  # Unified seller view (Profile + SKUs tabs)
    │   │   ├── AdminReviews.js       # Reviews CMS
    │   │   └── AdminSellers.js       # View button navigates to detail
    │   ├── vendor/
    │   │   └── VendorInventory.js    # UPGRADED: Comprehensive 6-section fabric form
    │   └── ...other pages
    └── components/
        ├── admin/AdminLayout.js
        ├── RFQModal.js
        └── Navbar.js
```

## Completed Features

### Phase 1-7: Core Platform, Checkout, Lead Gen, Emails, SEO, Supplier Storefront, Reviews (All Complete)

### Phase 8: Unified Admin Seller Detail + Comprehensive Vendor Form (Complete - Feb 2026)
- [x] **Unified Admin Seller Detail** (`/admin/sellers/:id`): Profile + SKUs tabs with approve/reject
- [x] **Comprehensive Vendor Fabric Form**: 6 sections matching admin-level metadata:
  - Basic Info (Name, Seller SKU, Category)
  - Fabric Specs (Type, Pattern, Color, Weight, Composition 3-material %, Warp/Weft Count, Denier, Shrinkage, Stretch, Finish)
  - Images & Videos (multi-image upload, video upload with progress)
  - Inventory & Pricing (Stock, Rate, MOQ, Delivery Days, Sample Price, 6-tier Bulk Pricing)
  - Availability (Sample/Bulk/On Request toggles, Bookable checkbox)
  - Description & Tags
- [x] **Vendor Image/Video Upload**: Cloudinary signature endpoint now accepts vendor tokens

### Phase 9: Campaigns API Fixes (Complete - Apr 2026)
- [x] **Dynamic company_type in Campaigns Push**: Fixed hardcoded `'Others'` in webhook payload to Campaigns API. Supplier signups now send extracted Fabric Categories; RFQ leads send the selected fabric_type. Fallbacks: 'Supplier' / 'Buyer'.
- [x] **RFQ Modal Enhancements**: Location dropdown, auto-phone code, conditional GST, removed 'Others' fabric type.
- [x] **GST Sandbox API on Supplier Sign-up**: Debounced verification, auto-populates Company Name & City.

### Phase 10: SEO & Prerender (Complete - Apr 2026)
- [x] **Critical Fix**: Removed `noindex, nofollow` meta tag — was explicitly blocking Google from indexing
- [x] **Dynamic Sitemap** (`GET /api/sitemap.xml`): Generates from DB — all fabrics, collections, suppliers, blog posts, tool pages
- [x] **Prerender Endpoints**: `/api/prerender/homepage`, `/api/prerender/fabrics`, `/api/prerender/collections` — serve full HTML to Googlebot
- [x] **Bot Detection**: `/api/prerender/check` endpoint for testing
- [x] **Updated robots.txt**: Allows prerender/sitemap paths, blocks admin/vendor/api
- [x] **Updated static sitemap.xml**: 17 core pages as fallback
- [x] **Production Setup Guide**: `/app/docs/SEO_PRERENDER_GUIDE.md` with nginx/Cloudflare Worker configs

### Phase 11: Performance Optimization (Complete - Apr 2026)
- [x] **Code Splitting**: All ~60 route components lazy-loaded via `React.lazy()` + `Suspense` — only HomePage, Navbar, Footer loaded eagerly
- [x] **Image Optimization**: Added `loading="lazy"`, `decoding="async"`, explicit `width`/`height` to all below-fold images; `fetchPriority="high"` on logo
- [x] **Deferred Analytics**: PostHog loads 3s after `window.load`; Emergent scripts use `defer`
- [x] **Font Loading**: Removed render-blocking `@import` from CSS bundle; preload Inter 600 woff2 in `<head>`; inline `@font-face` in critical CSS
- [x] **LCP Fix — Static Hero Shell**: Added inline HTML hero (navbar + heading + CTAs + trust badges) in `index.html` that renders immediately from HTML+CSS before React JS loads. MutationObserver removes shell once React mounts. Eliminated JS-dependent render chain for LCP element.
- [x] **Critical CSS Inlined**: Hero section styles inlined in `<style>` in `<head>` — no external CSS needed for first paint

### Phase 12: Canonical Tags — Duplicate Content Fix (Complete - Apr 2026)
- [x] **Global CanonicalTag component**: Auto-generates self-referencing canonical for every route, strips trailing slashes, normalizes to `https://locofast.com`
- [x] **Duplicate route handling**: `/sell` canonicalizes to `/suppliers` (same content, one canonical)
- [x] **Fixed broken canonicals**: AboutPage `/about` → `/about-us`, FabricsPage removed query params from canonical, BlogPostPage uses `locofast.com` not `window.location`, SupplierProfilePage uses `locofast.com`
- [x] **Static canonical in index.html**: For raw HTML before React loads

### Phase 13: Multi-Vendor SKU Architecture (Complete - Apr 2026)
- [x] **Article-based grouping**: Multiple vendor fabrics linked via shared `article_id` (existing articles system)
- [x] **API**: `GET /api/fabrics/{id}/other-sellers` — returns other vendor listings for same product, sorted by price
- [x] **Compare Prices UI**: Fabric detail page shows comparison table (seller, location, price, MOQ, delivery) when multiple vendors list the same product
- [x] **Zero data migration**: Existing fabrics untouched, articles are optional grouping layer
- [x] **Admin workflow**: Link fabrics to same article via admin panel to enable multi-vendor comparison

### Phase 14: Split Bulk Logistics + Bangladesh BIN + Agent-Assisted Booking (Complete - Apr 2026)
- [x] **Split Bulk Logistics**: Bulk orders now show "Packaging" (Rs 1/meter) and "Logistics" (remainder) as separate line items. Total = max(3% of subtotal, Rs 3000). Sample orders unchanged (flat Rs 100).
  - Updated: `CheckoutPage.js` (calculatePricing, Payment Summary), `orders_router.py` (calculate_totals, order creation, PDF generation), `AdminOrders.js` (detail modal)
  - New fields in orders collection: `packaging_charge`, `logistics_only_charge`
- [x] **Bangladesh BIN Field**: RFQ Modal now collects BIN (Business Identification Number) for Bangladesh location, pushed to `campaigns.locofast.com` API. GST field remains for India.
  - Updated: `RFQModal.js`, `server.py` (`create_rfq_lead`)
- [x] **Agent-Assisted Booking System**: Full agent portal for assisted online bookings.
  - Agent OTP login (`/agent/login`) — admin creates agent, agent logs in via OTP email
  - Agent dashboard (`/agent`) — browse catalog, build cart, generate shareable cart link
  - Shared cart page (`/shared-cart/:token`) — customer receives link, logs in via OTP, proceeds to checkout
  - Order labels: "Online" or "Assisted Online" with agent name on admin orders page
  - Admin agent management (`/admin/agents`) — create, edit, deactivate agents, view performance stats
  - New backend: `agent_router.py` with collections: `agents`, `agent_otps`, `shared_carts`
  - New fields in orders: `booking_type` (online/assisted_online), `agent_id`, `agent_email`, `agent_name`

### Phase 15: Navbar Cleanup + Filters + Agent Payment Proof (Complete - Apr 2026)
- [x] **Removed Collections from navbar**: Collections link removed from header. Page still accessible via direct URL.
- [x] **Composition filter**: New filter dropdown on FabricsPage pulls unique material names from DB.
- [x] **Denim oz filter**: When Denim category selected, GSM Range filter becomes "Weight (oz)". Non-denim shows both.
- [x] **Agent RTGS/NEFT Payment Proof**: Agents can upload payment proof screenshots when creating shared carts.

### Phase 16: Vendor Commission System (Complete - Apr 2026)
- [x] **Commission Rules Engine**: 5-tier commission structure with priority hierarchy:
  - Vendor-specific override > Category-wise > Cart Value Slab > Meterage Slab > Inventory/RFQ > Default (5%)
- [x] **Admin Commission Page** (`/admin/commission`): Full CRUD for commission rules, grouped by type, with Add/Edit/Delete/Activate
- [x] **Auto-calculated on orders**: Commission %, amount, rule applied, and seller payout stored on every order
- [x] **Vendor Dashboard**: Commission and Your Payout columns + detail modal with breakdown
- [x] **Admin Orders**: Commission section in order detail (rate, amount, rule, seller payout)
- [x] **Seller Email**: Commission deduction and payout amount included in order notification email
- New backend: `commission_router.py`, new collection: `commission_rules`
- New fields in orders: `commission_pct`, `commission_amount`, `commission_rule`, `seller_payout`

### Phase 17: SEO-Friendly Fabric URLs + Refactoring (Complete - Apr 2026)
- [x] **SEO Slugs**: Fabrics now use human-readable URLs like `/fabrics/cotton-poplin-60s-abc123`
  - Auto-generated from fabric name with 6-char hex suffix for uniqueness
  - Backward compatible: old UUID URLs still work (lookup tries ID first, then slug)
  - 194 existing fabrics migrated with `/api/migrate/slugs` endpoint
  - Frontend links updated across FabricsPage, FabricDetailPage, CollectionDetailPage, InventoryPage, SupplierDetailPage
  - Sitemap updated to use slug URLs
- [x] **Router Extraction**: server.py reduced from 2389 → 2080 lines
  - `category_router.py` — Category CRUD (5 endpoints)
  - `seller_router.py` — Seller CRUD with legacy field normalization (5 endpoints)
  - `collection_router.py` — Collection CRUD + collection fabrics (7 endpoints)
  - `models.py` — Shared Pydantic models
  - `slug_utils.py` — Reusable slug generation utility

### Phase 18: Denim Taxonomy + Blended Migration (Complete - Apr 2026)
- [x] **Dissolved "Blended Fabrics" category**: Every fabric auto-reassigned to the category whose material has the highest composition % (with name-based fallback). Linen created as a new category for `Linen Cotton AOP` (55% Linen). Preview DB: 32 blended → 26 Cotton + 5 Polyester + 1 Linen; category then deleted.
  - Standalone script: `/app/backend/scripts/migrate_blended.py` (dry-run default, `--apply` to write)
  - Admin endpoint: `POST /api/migrate/blended` (dry-run) + `?apply=true` — idempotent, guarded by `get_current_admin`, returns per-fabric plan + counts_after
- [x] **Denim-specific form fields in Admin Fabrics** (when category is Denim):
  - **Color dropdown** (8 options): Black x White, Black x Black, Indigo x White, Indigo x Black, Ecru, RFD, IBST, SBIT — applies to single color & multi-color variants
  - **Weave Type dropdown** (7 options): 2/1 RHT, 2/1 LHT, 3/1 RHT, 3/1 LHT, 4/1 Satin, Dobby, Herringbone
  - **Auto-generate Name** button: produces `M1 M2 M3, Weave type, Weight, Color: Color name` (e.g. `Cotton Polyester Lycra, 3/1 RHT, 10oz, Color: Indigo x White`)
  - All other categories keep the existing free-text color + no weave constraint

### Phase 19: HeroSearchCard + Live Category Counts + Router Cleanup (Complete - Apr 2026)
- [x] **HeroSearchCard on HomePage**: Glass-morphism card replacing the two hero CTAs. Pulls live category counts; any category with < 20 SKUs gets a "COMING SOON" flag (`components/HeroSearchCard.js`). Filters: composition, weight bucket (GSM), price bucket (₹/m) + 4 popular quick chips. Submit routes to `/fabrics?category=<id>&composition=...&min_gsm=...&max_gsm=...&min_price=...&max_price=...` — passes the category ID (not name) per FabricsPage contract.
- [x] **Live fabric counts on `/api/categories`**: Now computes counts via `$group` over fabrics collection on every call — no more stale `fabric_count` field.
- [x] **`enquiry_router.py` extracted**: 4 endpoints (create/list/update-status/delete) moved out of server.py with Zapier + campaigns.locofast.com push side-effects intact. Response model loosened (`email` optional) to tolerate legacy supplier-profile enquiry docs that lack email.

### Phase 20: Fabric + Article Router Extraction (Complete - Apr 2026)
- [x] **`fabric_utils.py`** — new module holding `normalize_fabric()`, `generate_fabric_code()`, `generate_seller_code()`, `generate_article_code()`. Used by fabric_router, article_router, and collection_router.
- [x] **`fabric_router.py`** — 10 endpoints, 659 lines:
  - `/api/fabrics` (list + booking-priority sort + ounce-range pipeline)
  - `/api/fabrics/count`, `/api/fabrics/filter-options`
  - `/api/fabrics/{id_or_slug}` (with slug-prefix fallback)
  - `POST/PUT/DELETE /api/fabrics`
  - `/api/fabrics/bulk-assign-seller`, `/api/fabrics/reassign-seller`
  - `/api/fabrics/{id}/other-sellers`
  - Extracted a shared `_build_fabric_query()` + `_oz_pipeline_stages()` helper so list and count stay in sync
- [x] **`article_router.py`** — 6 endpoints, 225 lines (list/get/variants/CRUD)
- [x] **`server.py`**: **2304 → 1040 lines** (55% reduction from session start). collection_router updated to use `fabric_utils.normalize_fabric`. All dead model classes (Fabric/FabricCreate/FabricUpdate/CompositionItem/Article*/Enquiry*) removed.
- [x] **Testing agent verified**: 37/37 backend tests passed, all frontend flows green (Home HeroSearchCard, /fabrics listing, detail page, Admin Denim form auto-generate). One regression fixed during testing: HeroSearchCard was passing category name → fixed to pass category id.

### Phase 21: Buyer-side Color Picker in Sample/Bulk Booking (Complete - Feb 2026)
- [x] **`FabricDetailPage.js`**: Book Bulk / Book Sample modals now render a color-variant picker when the fabric has `has_multiple_colors=true`. Each swatch shows color name + per-variant `quantity_available` (bulk) or "Sample available" (sample). Out-of-stock variants are disabled, sample-only filter hides variants without `sample_available=true`. First in-stock/sampleable variant is auto-selected.
- [x] **Quantity auto-cap**: Bulk qty input now reads `min(fabric.moq, selectedVariant.quantity_available)` as its max; shows inline red warning when exceeded; disables "Proceed to Checkout".
- [x] **URL carries color**: `/checkout/?fabric_id=...&type=...&qty=...&color=<name>&color_hex=<hex>`. `CheckoutPage.js` reads these, renders a pill in the Order Summary, and forwards `color_name`/`color_hex` into the order items payload.
- [x] **Backend**: `OrderItem` model in `orders_router.py` gained `color_name` + `color_hex` fields. Razorpay description, invoice PDF and customer order email (`email_router.py`) all now surface the selected color.
- [x] **Smoke-tested**: Selecting "Black" (300m stock) in the Bulk modal on the `Test Vendor Fabric` SKU correctly propagates through URL → Checkout pill → order item payload.

### Phase 22: Knits Category Removal + Knitted Form Rules (Complete - Feb 2026)
- [x] **Migration endpoint** `POST /api/migrate/knits` (+ `?apply=true`): dry-run returns plan; apply moves every fabric in `cat-knits` → `cat-polyester`, refreshes fabric_count, then deletes the Knits category. Idempotent.
- [x] **Admin UI button** "Move Knits → Polyester" (purple pill on `/admin/categories`) auto-shows only when Knits still exists in the DB. Runs dry-run first, confirms count, then applies.
- [x] **Dev DB migrated**: 2 Knits fabrics moved to Polyester Fabrics (16 → 18), Knits category deleted. Seed in `server.py` no longer creates Knits.
- [x] **Width dropdown unchanged + new Width Type for knitted**: Numeric "Width (inches)" (1–100") stays for all fabrics. When `fabric_type === "knitted"`, an **additional** "Width Type" dropdown appears next to it with options `Open Width` / `Circular`. Persisted as `fabric.width_type` on both Fabric (admin) and Vendor Fabric models. Surfaced on `FabricDetailPage` as `60" (Circular)` etc.
- [x] **Count fields hidden for knitted fabrics**: Warp/Weft Count (and Denier) are completely hidden for `fabric_type === "knitted"`. Admin form validation no longer requires them. Ply/count formatting still works for woven fabrics.
- [x] **Unit logic** (`kg` vs `m`) in `FabricDetailPage.js`, `AdminFabrics.js`, `VendorInventory.js` now keys off `fabric_type === "knitted"` instead of the deleted `cat-knits` category.
- [x] **Smoke-tested**: Admin Add Fabric modal → set Fabric Type to Knitted → Width dropdown shows only Open Width / Circular; Warp/Weft fields vanish.

### Phase 23: Denim → Ounce-Only Weight Unit (Complete - Feb 2026)
- [x] **Admin + Vendor forms** (`AdminFabrics.js`, `VendorInventory.js`) — When Category = Denim, the Weight Unit toggle is hidden and the form forces `weight_unit = "ounce"` via a `useEffect` on `form.category_id`. Only the Ounce (oz/yd²) dropdown is rendered, with an amber hint "Denim is always measured in oz".
- [x] **Stale GSM cleanup** — Switching a fabric to Denim clears `form.gsm = ""` so no stale GSM leaks into the payload.
- [x] **Home Hero Search** (`HeroSearchCard.js`) — Weight bucket dropdown flips from GSM to oz when Denim pill is active. New OZ buckets: *Lightweight (< 9 oz)*, *Medium (9–12 oz)*, *Heavyweight (> 12 oz)*. Weight label toggles `WEIGHT · GSM` ↔ `WEIGHT · OZ`. Submit emits `min_oz`/`max_oz` URL params (aligned with existing FabricsPage URL scheme) and `weightIdx` resets when user flips between Denim and non-Denim.
- [x] **Smoke-tested**: Selecting Denim pill → oz options appear; picking Medium → URL `/fabrics?category=cat-denim&min_oz=9&max_oz=12` correctly returns 4 denim SKUs in the 9–12 oz band.

### Phase 24: Vendor Name — Prominent on Agent Platform (Complete - Feb 2026)
- [x] **`AgentDashboardPage.js`** — Vendor (`seller_company`) is now rendered as a distinct **amber pill** with a `Store` icon on every fabric card in the catalog and every line item in the cart. Previously it was a tiny grey suffix crammed with the category name (`Cotton · LOSPL, …`). Now it occupies its own row with border and icon, so agents immediately see which supplier each SKU belongs to.
- [x] **Locofast-direct fallback** — SKUs without a seller now show a grey `Store` pill "Locofast direct" so there's never ambiguity.
- [x] **B2C parity** — Change is agent-only. Public `FabricDetailPage` / `FabricsPage` continue to hide vendor names (confidential to buyers by design).
- [x] **Smoke-tested end-to-end**: Logged in as `agent@locofast.com` → catalog card shows amber pill `🏪 LOSPL, Fabric Manufacturer, Gurugram`; added to cart → same pill persists on cart line items.

### Phase 25: Hide Vendor on Customer-Facing Pages (Complete - Feb 2026)
- [x] **`SharedCartPage.js`** — The page a customer opens from an agent's shared-cart link no longer shows `seller_company` next to the category. Customer only sees fabric name, category, qty, price, type — vendor is hidden.
- [x] **`CheckoutPage.js`** — Removed the `by {seller_company}` subtitle from the Order Summary so B2C buyers (direct + shared-cart recipients) never see supplier identity.
- [x] **`OrderConfirmationPage.js`** — Same removal for the post-purchase confirmation view.
- [x] **Customer confirmation email** already does NOT leak vendor (line 309 of `email_router.py` only shows `Code | Category`). Admin notification email (separate template, line 201) retains `Seller:` which is correct.
- [x] **Smoke-tested**: Created a real shared-cart token via `/api/agent/shared-cart`, opened `/shared-cart/<token>` — Playwright body-text check confirms `"LOSPL" not in page`. Agent attribution banner ("Assisted booking by Test Agent") still renders.

### Phase 26: "Knit Type" Dropdown for Knitted Fabrics (Complete - Feb 2026)
- [x] **New `knitTypeOptions` list** (29 entries) added to `AdminFabrics.js` and `VendorInventory.js`: Single Jersey, Interlock, Rice Knit, Dot Knit, Mesh, Pique, Honeycomb Pique, Waffle, Fleece, Terry, Baby Terry, 1x1 Rib, 2x2 Rib, 3D Jacquard, Dobby, 4-Way Lycra, 2-Way Lycra, Tin Tin, Sap Matty, Micro PP, Jacquard Zombie, Taiwan Lycra, Football Knit, Nirmal Knit, Reebok Knit, Adidas Knit, Super Malai, Micro Crepe, Bubble Crepe.
- [x] **`fabric_type === "knitted"` wins over category** — when the fabric is knitted, the dropdown shows Knit Type options (label relabeled to "Knit Type") regardless of whether the category is Cotton/Polyester/etc. Denim + Cotton woven dropdowns unchanged.
- [x] **Stored under the same `weave_type` field** on the fabric — no schema change needed (the field is effectively "weave-or-knit structure").
- [x] **Smoke-tested**: Admin Add Fabric modal → Fabric Type = Knitted → dropdown label "Knit Type", 30 options (29 + placeholder), includes Single Jersey, Terry, Bubble Crepe.

### Phase 27: Credit Application Form Overhaul (Complete - Feb 2026)
- [x] **Multiple files per document header** (`CreditApplicationSection.js`) — state refactored from `docNames[key] = filename` to `docFiles[key] = [{name, url}, ...]`. File input uses `multiple` + uploads each to Cloudinary under `credit-applications/{key}`. Uploaded files render as chip list with per-file X-remove. Button swaps from "Upload" → "Add more" once at least one file is attached.
- [x] **Balance Sheet added for Proprietorship** — new required `balance_sheet` entry "Balance Sheet (Last 2 Years)" placed 4th in the checklist (right after Bank Statement), matching the Partnership/Pvt-Ltd treatment.
- [x] **Removed GST OTP validation + CIBIL Consent entries** from all 3 company-type document lists. Step 2 still collects GST Number (business data, not consent).
- [x] **Email to `credit@locofast.com`** — new `_send_credit_team_email()` in `credit_router.py` fires via Resend after DB insert. Email contains applicant summary + HSN-style table of every document with clickable hyperlinks to each uploaded file (Cloudinary URL). `reply_to` set to the applicant's email so the credit team can reply directly. `CREDIT_TEAM_EMAIL` env var overrides default `credit@locofast.com`.
- [x] **Smoke-tested**: POST `/api/credit/apply` with 5 docs (4 upload with 1–2 files each, 1 checkbox) → DB insert + backend log confirms `Credit application email sent to credit@locofast.com`. Playwright verified proprietorship Step 3 shows Balance Sheet, no GST OTP, multi-upload helper text.

### Phase 28: Denim additions + Multi-Color on Vendor Portal (Complete - Feb 2026)
- [x] **Denim colors** — added `Indigo x Brown` and `Dark Indigo x White` to `denimColorOptions` in both Admin (`AdminFabrics.js`) and Vendor (`VendorInventory.js`) forms.
- [x] **Denim weaves** — added `4/1 Satin RHT` and `4/1 Satin LHT` to `denimWeaveOptions` in both forms.
- [x] **Vendor Multi-Color UI** — ported the entire Color Variants section from Admin to `VendorInventory.js`:
  - "This SKU has multiple colors" checkbox; auto-seeds first variant from base `color` + `quantity_available` when first enabled.
  - Per-variant: color hex picker + name input (denim uses the dropdown), Cloudinary photo upload, inventory qty (unit-aware — kg for knitted, m otherwise), Sample Available toggle, remove-variant X.
  - "+ Add Color Variant" button at the bottom.
- [x] **Vendor backend support** — added `has_multiple_colors: bool` and `color_variants: List[dict]` to `FabricCreate`/`FabricUpdate` in `vendor_router.py`; `width_type` also wired into the POST handler (was dropped earlier). Update handler already uses `model_dump()` → picks new fields automatically.
- [x] **Smoke-tested**: vendor login → edit MC fabric created via API → UI shows multi-color checkbox ticked + both variants rendered with correct name/qty/sample flags. Backend persist round-trip verified via curl.

### Phase 29: Polyester + Woven Weave Types (Complete - Feb 2026)
- [x] **Admin + Vendor forms** — new `polyesterWovenWeaveOptions` list kicks in when Category = Polyester Fabrics (and fabric_type is Woven, i.e. not Knitted): `1x1 Plain, 2x1 Twill, 3x1 Twill, 2x2 Twill, 4x1 Satin, Dobby, Jacquard, -Slub, +Slub, Magic Slub`.
- [x] **Priority order** (both Admin + Vendor): Knitted type > Denim > Polyester > Cotton > (no dropdown). So a Polyester+Knitted fabric still correctly shows Knit Types; only Polyester+Woven gets the new list.
- [x] **Smoke-tested**: Admin Add Fabric → Category=Polyester Fabrics + Fabric Type=Woven → Weave Type dropdown shows all 10 new options (verified via Playwright option-text enumeration + screenshot).

### Phase 30: Viscose weaves + Greige reclassification + Construction field + Denim-Knit unit fix (Complete - Feb 2026)
- [x] **Viscose weave types** — new `viscoseWeaveOptions` list: `1x1 Plain, 2/1 Twill, 3/1 Twill, 2/2 Twill, Dobby, 4/1 Satin, -Slub, +Slub`. Viscose is matched by category name (dynamic UUID). Priority: Knitted > Denim > Polyester > Viscose > Cotton > none. Applied to both Admin + Vendor forms.
- [x] **Greige reclassification** — deleted empty `Greige` category from DB, added `"Greige"` to `patternOptions` in both forms.
- [x] **Construction field** — new text input visible when Category = Cotton OR Viscose. Stored as `fabric.construction`. Wired through form state, edit loader, submit payload, Admin + Vendor Pydantic models, and vendor `fabric_doc` builder.
- [x] **Denim knits stay in meters** — `shouldUseKgUnit` rule updated in `AdminFabrics.js`, `VendorInventory.js`, `FabricsPage.js`, and `FabricDetailPage.js`: `knitted && category !== 'cat-denim' → kg`, otherwise `m`.
- [x] **Smoke-tested**: Playwright verified all 4 changes.

### Phase 31: Brand Portal — Enterprise B2B tier (Complete - Feb 2026)
Embedded multi-lender credit lines + curated catalogue for brand-tier B2B customers (10-100 Cr turnover). End-to-end tested via the testing agent: **30/30 backend tests + all frontend UI tests passed, zero issues**.

- [x] **Slice 1 — Brands + Users + Catalog**
  - New Mongo collections: `brands`, `brand_users`, `brand_credit_lines`, `brand_credit_ledger`, `admin_otps`
  - Backend `brand_router.py` (≈650 lines): `/api/admin/brands` CRUD, `/api/admin/brands/{id}/users` CRUD, brand auth (`/api/brand/login`, `/me`, `/reset-password`), filtered catalog (`/api/brand/fabrics`, `/api/brand/fabrics/{id_or_slug}`).
  - Welcome email via Resend with temp password (forced reset on first login)
  - Brand admin role (`brand_admin`) can manage users; `brand_user` is buyer-only
  - Frontend: `BrandAuthContext` (localStorage `lf_brand_token`), `BrandLayout` with top nav, pages `BrandLogin`, `BrandResetPassword`, `BrandFabrics`, `BrandFabricDetail`, `BrandAccount`, `BrandUsers`, `BrandOrders`
  - Admin UI: `/admin/brands` wrapped in `AdminLayout` — list, detail side-panel with category chips + user CRUD + credit lines + sample credits + ledger sections. "Brands" added to admin sidebar.

- [x] **Slice 2 — Multi-Lender Credit Lines (Stride/Muthoot/Mintifi) + OTP + FIFO**
  - `/api/admin/brands/{id}/credit-lines/otp` — generates a 6-digit OTP, emails acting admin via Resend, stores bcrypt-hashed code with 10-minute expiry + binding to `{brand_id, lender, amount}`.
  - `/api/admin/brands/{id}/credit-lines` — creates credit line only after valid OTP + matching payload. Writes `credit_allocated` ledger entry. Rejects reused/expired OTP or tampered amount/lender.
  - `/api/brand/orders` (bulk) — debits brand credit lines **FIFO** (oldest line fully drained before next). Writes `debit_order` ledger entry with per-line breakdown array. Rejects orders over available, below MOQ, or in disallowed categories.
  - Verified: 1500m × ₹132 = ₹198,000 → total ₹213,840 drained Stride (₹100k) fully and Muthoot ₹113,840. Available credit updates instantly.

- [x] **Slice 3 — Sample Credits + Razorpay Top-up**
  - `/api/admin/brands/{id}/sample-credits` — admin delta adjust (cannot reduce below used). ₹1 = 1 credit.
  - `/api/brand/orders` (sample) — debits brand `sample_credits` directly (1:1 INR). Writes `sample_credit_used` ledger entry.
  - `/api/brand/sample-credits/topup/create-order` + `/verify` — Razorpay self-serve top-up. Signature verification with `hmac.compare_digest`.
  - Brand Account page: "Pay & add" CTA opens Razorpay checkout, adds credits instantly on success.

### Phase 32: Fabric Display Names + Category SEO Block (Complete - Feb 2026)
- Injected `count` and `construction` into fabric display names via `/app/frontend/src/lib/fabricDisplay.js`.
- Added `seo_title`, `seo_intro`, `seo_applications` on Category model; Admin modal forms + FabricsPage rendering above the grid for category-filtered pages.
- Verified: `/fabrics?category=cat-cotton` now shows SEO H1 "Buy Premium Cotton Fabrics Online — Wholesale Prices" and the direct-from-mills intro block.

### Phase 33: Cloudinary Image Optimization + server.py Refactor + Buy Box (Complete - Feb 2026)
- **Cloudinary optimization**: New `/app/frontend/src/lib/imageUrl.js` with `thumbImage` (w_400), `mediumImage` (w_800), `largeImage` (w_1600) — injects `f_auto,q_auto,w_X` into Cloudinary URLs. Applied to FabricsPage cards, FabricDetailPage gallery/related, Brand Fabrics/Detail/Cart, CollectionsPage and CollectionDetailPage. Expected 50-70% bandwidth savings.
- **server.py refactor**: 1183 → 633 lines (46% reduction). Extracted to:
  - `/app/backend/migrations_router.py` — /api/migrate/slugs, /migrate/blended, /migrate/knits, /migrate/greige
  - `/app/backend/sitemap_router.py` — /api/sitemap.xml
  - `/app/backend/reviews_router.py` — /api/reviews CRUD
  - `/app/backend/upload_router.py` — /api/upload, /api/upload/video
- **Buy Box (Multi-vendor dedupe)**: `GET /api/fabrics?dedupe_by_article=true` collapses fabrics sharing a non-empty `article_id`, returning only the cheapest `rate_per_meter` SKU per article + a `vendor_count` field.
- **Backend testing**: 100% (21/21 tests passed, iteration_35.json).

### Phase 39: Vendor Identity Obfuscation + Admin Vendor Search (Complete - Feb 2026)
- **Backend obfuscation**: `seller_name` and `seller_company` blanked in:
  - `GET /api/fabrics` (public B2C list) — `fabric_router.py:511`
  - `GET /api/fabrics/{id}` (public PDP) — `fabric_router.py:602`
  - `GET /api/brand/fabrics` (brand portal list) — `brand_router.py:847`
  - `GET /api/brand/fabrics/{id}` (brand PDP) — `brand_router.py:907`
  - `seller_code` (LS-XXXXX) is the only identity field exposed publicly.
- **SEO obfuscation**: `components/SEO.js` schema.org `brand`/`manufacturer` hardcoded to "Locofast Verified Supplier" / "Locofast Verified Mills" so search-engine scrapers can't extract real vendor names.
- **Admin vendor search**: `/admin/sellers` now has a search input filtering across `seller_code`, `company_name`, contact name, GSTIN, city, state, email, phone — with live count indicator and clear button. Bug fix: grid was iterating `sellers.map` instead of `filteredSellers.map`; corrected.
- **Internal endpoints unchanged**: `/api/sellers` (admin), `/api/agent/...`, admin POST/PUT fabric responses still expose full vendor info.
- **Frontend testing**: 100% pass (iteration_39.json) — verified across admin sellers page, public catalog/PDP, brand catalog/PDP.

### Phase 40: Bulk Credit Upload UI (Complete - Feb 2026)
- **New component**: `/app/frontend/src/components/admin/BulkCreditUpload.js` — drag-and-drop file uploader for `/admin/orders` → Credit Management tab. Replaces legacy paste-only textarea modal.
- **Features**:
  - Drag-drop / click-to-browse for `.csv`, `.xlsx`, `.xls` (uses SheetJS `xlsx` lib).
  - Header auto-detection with aliases (e.g. `limit` → `credit_limit`; `bank` → `lender`).
  - Row-level validation preview: invalid email, non-numeric credit_limit, negative limits highlighted in red; submit button disabled when no valid rows.
  - **Two upload modes**: `replace` (overwrite limit, balance reset) and `topup` (add to existing limit & balance, preserves used credit).
  - "Download CSV template" + "Export current wallets" CSV buttons for closed-loop edits.
  - Paste-CSV textarea fallback retained for power users.
- **Backend changes**: `POST /api/orders/credit/wallets/bulk-upload` (`orders_router.py:719`) now accepts `mode: "replace" | "topup"`, validates per-row (email format, credit_limit ≥ 0), returns `{created, updated, skipped: [{row, email, reason}]}`.
- **API helper**: `bulkUploadCreditWallets(wallets, mode = "replace")` in `lib/api.js`.
- **Frontend testing**: 100% pass on 8 scenarios incl. mode switch, header shuffle, missing-column error (iteration_40.json).

### Phase 41: Vendor Visibility Tiering + Brand Watermark + Catalog Sort (Complete - Feb 2026)
- **Vendor visibility now context-aware**:
  - Public B2C (`/api/fabrics`, `/api/fabrics/{id}` without auth) — masked; only `seller_code` exposed.
  - Admin (logged in) — full `seller_name` + `seller_company` returned. Admin Fabrics table shows stacked Contact/Company/Code identity for data uploads.
  - Brand portal — masked (brands never see vendor names).
  - New helper `auth_helpers.get_optional_admin` decodes JWT if present, returns `None` otherwise.
- **Brand-mark watermark**: replaced text-only watermark with the official Locofast monogram (woven X) + wordmark, embedded as inline SVG (no extra asset request).
  - Four variants behind `REACT_APP_WATERMARK_VARIANT`: `label` / `hover-chip` / `tiled` / `bottom-bar`.
  - Live preview at `/admin/watermark-preview`.
  - **Shipped**: `hover-chip` (glassmorphic pill, fades in on card hover) — set in `frontend/.env`.
  - All catalog card containers verified with `group` Tailwind class so `group-hover` triggers correctly.
- **Catalog sort upgrade** (`fabric_router.py`): added `image_quality_rank` (0=real photo, 1=Unsplash/placeholder, 2=no images) as the **primary** sort key before `booking_priority` and `created_at`. Result: dummy/placeholder fabrics always sink to the last page; first page leads with photographed inventory. Verified via curl: page 1 returns 12 real-image SKUs; last page contains all 8 Unsplash + 3 no-image placeholders.

### Phase 42: Hero Pill Order + Cert Disclaimer + Vendor RFQ Pick Pool (Phase A) (Complete - Feb 2026)
- **Hero search bar**: pinned category order — Denim → Cotton → Polyester → Viscose → Sustainable → Linen via a `CATEGORY_ORDER` priority array in `HeroSearchCard.js`. Unranked categories fall back to fabric_count-desc.
- **Certification disclaimer**: new one-line `CertificationDisclaimer.js` amber chip ("Certifications are owned by respective partner mills; Locofast is a sourcing partner. Documents available on request.") rendered on public PDP, brand PDP, and the catalog certification filter sidebar.
- **Vendor RFQ Pick Pool — Phase A** (matches mobile mockups, ported to desktop):
  - **Backend** `vendor_rfq_router.py` — eligibility-aware listing of public RFQs based on the vendor's `category_ids`. Knits routes to vendors with `cat-polyester` (post-Phase 22 merge). 6 endpoints:
    - `GET /api/vendor/rfqs?status=new|picked|submitted|closed`
    - `GET /api/vendor/rfqs/stats?period=today|yesterday|7d|30d`
    - `GET /api/vendor/rfqs/{id}`
    - `POST /api/vendor/rfqs/{id}/pick` (no exclusivity — multiple vendors can pick & quote)
    - `POST /api/vendor/rfqs/{id}/quote` (auto-creates pick on first quote)
    - `PUT /api/vendor/rfqs/quotes/{quote_id}`
  - **New collections**: `vendor_rfq_picks`, `vendor_quotes` (one quote per vendor per RFQ; re-submit upserts).
  - **Frontend pages**:
    - `/vendor/rfqs` — Business Overview collapsible (Total / Answered / Unanswered / Orders & Sales / Sample Shared) with date filter pills, status pill tabs (All new · Picked · Submitted · Closed), search box, and RFQ cards with Pick CTA / Submitted-on date.
    - `/vendor/rfqs/:rfqId` — side-by-side Fabric details + Query details cards, buyer-notes callout, my-quote chip block (price ₹/m, lead days, basis, fabric state, sample, finished-fabric specs), and a Submit/Edit Quote modal.
  - **Vendor sidebar** — added "RFQ / Requests" item to `VendorLayout.js`.
  - **Smoke-tested end-to-end**: 3 RFQs visible in pool → Pick moves to Picked tab → Submit Quote (price ₹45.8/m, 4 days, Air Jet, 63 in, 65 GSM, sample) → moves to Submitted tab → stats shows 1 answered, 1 sample shared. Both pages verified visually at 1440px.

## Backlog

### P1 (High Priority)
- [ ] Run `backfill_denim_names.py` on production to standardize legacy denim names/weaves/ounce formatting
- [ ] Run `POST /api/migrate/compositions?apply=true` on production
- [ ] Admin workflow: populate `article_id` on existing fabric SKUs so Buy Box dedupe becomes visible on listing

### P2 (Medium Priority)
- [ ] Audit the 103 soft-404 pages from Google Search Console
- [ ] Homepage redesign modules: Block CMS, Deal Wall Manager, Live Auctions, Trending Rankings
- [ ] Further `server.py` slimming (GST, Stats, Seed, RFQ-lead still inline; target <400 lines)

### P3 (Low Priority)
- [ ] Wishlist/Favorites for B2B buyers
- [ ] Advanced Analytics Dashboard

## Credentials
See `/app/memory/test_credentials.md`
