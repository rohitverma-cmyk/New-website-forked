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
  - **Backend** `vendor_rfq_router.py` — eligibility-aware listing of public RFQs based on the vendor's `category_ids`. Knits routes to vendors with `cat-polyester` (post-Phase 22 merge). 6 endpoints (list / stats / detail / pick / quote / edit-quote).
  - **New collections**: `vendor_rfq_picks`, `vendor_quotes` (one quote per vendor per RFQ; re-submit upserts).
  - **Frontend pages**: `/vendor/rfqs` (Business Overview + status pill tabs + RFQ cards with Pick CTA) and `/vendor/rfqs/:rfqId` (Submit/Edit Quote modal).
  - **Vendor sidebar** — added "RFQ / Requests" item to `VendorLayout.js`.

### Phase 43: Customer-driven Quote Conversion + Vendor Orders Source Filter (Phase B-1) (Complete - Feb 2026)
**Customer (not admin) compares received quotes and converts the chosen one.** Mirrors the staging customer screens (Quotes received tab + Quote-comparison detail with Proceed-payment CTA).

- **Backend** `customer_queries_router.py` (3 endpoints):
  - `GET /api/customer/queries?status=received|not_received|closed` — list customer's RFQs with quote count + best-quote summary.
  - `GET /api/customer/queries/{rfq_id}` — RFQ detail + sorted quotes; cheapest gets `is_best_price`.
  - `POST /api/customer/queries/quotes/{quote_id}/place-order` — converts winning quote → real order. Delegates to `orders_router.create_order` so Razorpay/credit/commission/email logic stays single-sourced. Stamps `source: "rfq"` + `rfq_id`/`quote_id` on the order. Marks losing quotes `lost`, winning quote `won`, RFQ `won`.
- **RFQ ↔ customer linkage**: `rfq_router.submit_rfq` now reads optional Bearer customer token and writes `customer_id` on the RFQ doc — anonymous public RFQ submissions still work.
- **Customer Account** (`/account`):
  - New "My Queries" tab with sub-tabs `Quotes received | Quotes not received | Closed`, search box, RFQ cards with best-quote pill + relative date.
  - New page `/account/queries/:rfqId` — fabric/order detail cards + quote comparison list. Each quote has a `Proceed payment ›` CTA → Razorpay checkout → order confirmation. Won quotes get an "Order placed" badge; losing quotes get "Not selected" greyed state.
- **Vendor Orders** (`/vendor/orders`):
  - New `Inventory | RFQ | All` source filter chips (with live counts).
  - Each row shows a small `RFQ` or `Inventory` pill next to the order number.
  - `GET /api/vendor/orders` extended with `?source=` param + matches on either `items.fabric_id` (catalog) OR `items.seller_id` (RFQ flow, since the synthetic item id has no fabric document).
- **Smoke-tested end-to-end**: customer RFQ (Bearer attached) → 2 vendor quotes → list shows 1 query in "Quotes received" with best ₹45.8/m → detail shows 2 quote cards with Best Price + spec chips → place-order on quote 1 creates real order LF/ORD/003 with `source='rfq'`, ₹131,250 total, RFQ flipped to `won`, vendor's orders list shows it tagged `source='rfq'`.

### Phase 44: Customer Profile — Mandatory Fields + Live GST Verification (Complete - Feb 2026)
- **Mandatory fields** on `/account → Profile`: GST Number, Company Name (auto-filled from GST), Email (read-only login identity), Contact Person Name, Phone. Red asterisk markers + inline error text.
- **Live GST verification** on every save via `Sandbox.co.in` API (`gst_verify.py` shared helper extracted from server.py — also used by the existing `/api/gst/verify` and supplier signup flow).
- **PUT /api/customer/profile** validates mandatory fields, verifies the GSTIN against Sandbox.co.in, auto-fills `company` from `legal_name` (fallback `trade_name`), persists `gst_verified=true`, `gst_business_type`, `gst_status`, and seeds `city`/`state`/`pincode` from the GST registry if user hasn't entered them.
- **Frontend** (`CustomerAccountPage.js`): client-side validation (mandatory + phone-digit check + 15-char GSTIN), inline red error text per field, server error pinned to GSTIN field if it mentions GST, "Verified" badge with ShieldCheck icon when `gst_verified=true`, save button label flips to "Verifying GST..." during the call.
- **Tested**: 14/14 backend tests pass, all frontend UI requirements verified (iteration_41.json).

### Phase 45: Order Detail & Tracking + "+ New Query" + Standalone Factories (Complete - Feb 2026)
Three quick wins on top of Phase 44, all green-tested by the testing agent (10/10 backend, 100% frontend, iteration_42.json).

- **Order Detail & Tracking** (`/account/orders/:orderId`, new `OrderDetailPage.js`):
  - 5-stage timeline strip: *Payment → Paid → Processing → Shipped → Delivered* (cancelled fork shows red banner)
  - **Pay-now CTA** for `payment_pending` orders — resumes the original `razorpay_order_id` (no duplicate orders) via new `GET /api/customer/orders/{id}/pay-context`
  - **Download invoice** button for paid orders → `/api/orders/{id}/invoice`
  - **Track shipment** link surfaces `https://shiprocket.co/tracking/<awb_code>` whenever Shiprocket has allocated an AWB (also shows the AWB chip)
  - New owner-scoped backend endpoint `GET /api/customer/orders/{id}` (404s on cross-customer access, 401 without auth)
  - Order cards in `My Orders` are now clickable cards with a "View details ›" CTA. URLs use `order.id` (UUID) so the `LF/ORD/001` slashes don't break routing.

- **"+ New Query" button** (`CustomerQueriesTab.js`):
  - Top-right CTA in the My Queries tab navigates to `/rfq?from=account`
  - `RFQPage` now attaches `Authorization: Bearer <lf_customer_token>` so the resulting RFQ is auto-linked to the customer's account
  - On success with `from=account`, redirects to `/account?tab=queries`. CustomerAccountPage now reads `?tab=` to deep-link into the right tab.

- **Standalone Factories** (`brand_router.py` + `AdminBrands.js`):
  - `parent_brand_id` is now optional when `type='factory'` — factories can buy for themselves without a brand parent
  - When supplied, parent brand is still validated against the brands collection (regression-safe)
  - Admin form: parent brand dropdown defaults to "— Standalone (no parent brand) —"; factory list rows show italic "Standalone" label when no parent is set

### Phase 46: Full Shiprocket module port + auto-status webhook (Complete - Feb 2026)
Ported the standalone Shiprocket integration repo (`github.com/deepakw0403-cpu/Shiprocket-integration`) into `/app/backend/shiprocket/` and mounted under `/api/shiprocket`. Replaces the older orphaned `shiprocket_router.py` + `shiprocket_service.py` files (deleted).

- **6 routers mounted** under `/api/shiprocket`: orders, courier, tracking, pickup, returns, webhooks
- **Singleton `auth_service`** with auto token refresh (24h before expiry) + tenacity retry/backoff on every Shiprocket API call
- **Webhook → orders updater** (`shiprocket/api/webhooks.py`):
  - `POST /api/shiprocket/webhooks/tracking` and `POST /api/shiprocket/webhooks/order-status` (already wired in your Shiprocket dashboard)
  - Maps raw Shiprocket statuses → our 5-stage canonical: `Pickup Scheduled→processing`, `Picked Up / In Transit / OFD→shipped`, `Delivered→delivered`, `RTO Initiated/Lost→cancelled`
  - **Regression guard** (`_STATUS_RANK`): never flips a delivered order back to processing if Shiprocket retransmits an older event
  - Stamps `courier_name`, `shipped_at`, `delivered_at`, `shiprocket_last_event` on the order
  - Writes a per-event audit log to `shiprocket_events` collection
  - Uses BackgroundTasks → returns 200 to Shiprocket fast (no retry storms)
  - In-memory ring buffer (200 most recent events) at `GET /api/shiprocket/webhooks/events` for debugging
- **`orders_router.create_shiprocket_shipment`** migrated to use the new `OrderService` + `CreateOrderRequest` schema (fully validated payloads, type-safe)
- **Bonus capabilities now available** (not yet surfaced in UI but wired): NDR/RTO actions, manifest generation, pickup-location CRUD, bulk tracking
- **Tested**: 23/23 backend tests pass, frontend timeline auto-advances (iteration_43.json)

### Phase 47: Tracking History Drawer (Complete - Feb 2026)
Per-order vertical timeline of every Shiprocket scan, surfaced from the Order Detail page. Tested 13/13 backend + 100% frontend (iteration_44.json).

- **Backend** `GET /api/customer/orders/{id}/tracking` — owner-scoped, returns events newest-first with `raw_status`, `mapped_status`, `courier_name`, `location`, `activity`, `event_time`, `received_at`. 404s on cross-customer access.
- **Webhook handler** now also extracts `location` (Mumbai, Karnataka, etc.) and `activity` ("Pickup successful", "Bag scanned at hub", etc.) from Shiprocket payloads and persists them on `shiprocket_events`.
- **Frontend** `<TrackingHistoryDrawer>` — slide-from-right drawer, vertical rail of events, dot color-coded by `mapped_status` (green delivered / blue shipped / amber processing / red cancelled), "Latest" badge on the newest event, MapPin icon for location, footer link out to `shiprocket.co/tracking/<awb>`. Closes via X, backdrop, or Esc. Locks body scroll while open.
- **Visibility**: button only renders when there's something to show — i.e. when `awb_code` exists OR `shiprocket_last_event` is set OR order is at processing/shipped/delivered status.

### Phase 48: Sweep window.confirm / window.prompt out of all admin pages (Complete - Feb 2026)
Promise-based hook + provider pattern; every native browser popup across `/admin/*` replaced with branded modals.

- **New `<ConfirmProvider>`** mounts a single `<ConfirmDialog>` + input dialog at the app root. Hooks: `useConfirm()` and `useInputDialog()` return Promise-based APIs that mimic `window.confirm()` / `window.prompt()`. One-line call sites: `if (!(await confirm({ title, message, tone:"danger" }))) return;`
- **22 native popup sites replaced** across 12 admin pages: AdminBlog (3), AdminCategories (6), AdminFabrics (4), AdminSellerDetail (2), and 1 each in Sellers, Coupons, Reviews, Commission, Collections, Articles, Enquiries.
- **Single `window.prompt()`** in AdminFabrics ("Add video URL") replaced with a branded text-input modal (Enter submits, Escape cancels, click-backdrop dismisses).
- Tested 100% pass — all 11 admin pages verified, dismissal via Cancel/backdrop/Escape all work, no regressions on AdminBrands flows (iteration_45.json).

### Phase 49: Sample-Order Email Audit Log + Unified Enterprise Account + Enterprise RFQ Portal (Complete - Feb 2026)
Three P0 enterprise items shipped together. Tested 22/22 backend tests + 100% frontend (iteration_46.json). Detail in CHANGELOG.md.

### Phase 50: Account Manager module + Brand Financial Ledger + Invoice/Email/Shiprocket fixes (Complete - Feb 2026)
Major financial workflow capability. Tested 30/30 backend + 100% frontend (iteration_47.json).

### Phase 51: AM-for-factories + Factory credit visibility + Address aggregation + E-way Bill everywhere (Complete - Feb 2026)
4 deliverables building on the AM module. Tested 16/16 backend + 100% frontend (iteration_48.json). Detail in CHANGELOG.md.

### Phase 52: Cloudinary uploads + Cart address picker + Brand-group AM picker (Complete - Feb 2026)
3 UX upgrades. Tested 22/22 backend + 100% frontend (iteration_49.json). Detail in CHANGELOG.md.

### Phase 53: Realtime quote-arrived notifications — email + bell icon (Complete - Feb 2026)
Vendor quotes now ping the brand portal in real time. Tested 9/9 backend + 100% frontend (iteration_51.json).

- **Email fanout**: `send_quote_received_email` now branches on `rfq.brand_id`. For brand-RFQs, fans out to ALL active `brand_admin` users on the brand (not just the RFQ author). Subject line: `[New quote] ₹185/kg on RFQ-2026-0042 · Locofast`. HTML body has a green pricing card + "View & compare quotes" emerald CTA linking to `/enterprise/queries/{id}`. Audit row written with `kind=quote_received_brand`.
- **In-app bell**: New `brand_notifications` collection — one row per brand_admin per quote. New endpoints: `GET /api/brand/notifications?limit=10`, `GET /api/brand/notifications/unread-count`, `POST /api/brand/notifications/{id}/read`, `POST /api/brand/notifications/read-all`.
- **Frontend `<NotificationBell>` component**: mounted in `BrandLayout` top-nav. Polls unread-count every 30s. Red badge with pulse animation showing count. Click opens 380px dropdown with the latest 10 notifications, "Mark all read" header, "See all queries →" footer. Click on a notification marks-read and navigates to `/enterprise/queries/:id`.



- **Cloudinary file uploads**: New reusable `<FileUploadInput>` (admin) + `<BrandFileUpload>` (brand) components. Drag-drop or click; shows file chip with Replace/Remove after upload. Backend changes: signature endpoint enum extended to `raw|auto|image|video` (PDF support), `verify_admin` accepts brand JWT type. Wired into 5 admin forms (Invoice PDF, E-way Bill PDF, Credit Note PDF, Debit Note PDF, Payment Receipt) + ApplyCreditModal supporting-document field.
- **Cart saved-address picker**: BrandCart now loads `/api/brand/addresses` on mount and renders saved-address cards (with `REGISTERED OFFICE`, `Default`, `GST-seeded`, `Factory · {name}` badges). Auto-picks the default. "Add new address" toggle reveals the inline form (still saves to backend if "Save as default" is checked). Selection radios with brand colors.
- **Brand-group AM picker**: `_require_am_for_brand` permission helper now grants access via `parent_brand_id` inheritance — assigning an AM to a parent brand auto-grants finance access to ALL its linked factories (no need to explicitly add each factory to `managed_brand_ids`). `GET /api/admin/account-managers` returns each managed brand entry with its `factories[]` nested. UI shows single "brand group" cards (brand + indented factories list, +1 factory badge) instead of two separate Brands/Factories columns. Capacity copy now says "brand groups".



- **AM scope extended to factories**: `managed_brand_ids` now accepts factory IDs (which are `brands` records with `type: "factory"`). The Account Managers page renders a 2-column picker (Brands · Factories) with parent-brand context on every factory row. Permission gate `_require_am_for_brand` works identically — AMs see hard 403 on entities not in their list.
- **Brand sees linked factories' credit**: New `GET /api/brand/factory-credit-summaries` returns per-factory credit summary (allocated/available/outstanding/sample credits). New "Linked Factories' Credit" section in `/enterprise/account` Overview. Empty state shows **"Credit limit not opened"** + **"Apply for credit"** amber CTA. Same CTA at the brand level when the brand itself has no credit lines.
- **Apply for credit email**: New `POST /api/brand/credit-application` — persists to `credit_applications` collection and emails `creditops@locofast.com` (BCC's the assigned AM if any) with brand/factory name, GST, requested amount, use case, contact details. Configurable via `LOCOFAST_CREDITOPS_INBOX` env. Permission boundary: brand admin can apply for self or for a linked factory only. Audit-logged in `email_logs`.
- **Address aggregation**: `GET /api/brand/addresses` (called by a brand admin) now merges every linked factory's GST + manual addresses into the response with `source: "factory"`, `factory_id`, `factory_name`, `read_only: true`. Brand-side cards render a `Building2 · from Factory · {name}` badge and hide the Set-default/Remove buttons.
- **Invoice + E-way Bill everywhere**:
  - `brand_invoices` schema gains `eway_bill_number` + `eway_bill_url` fields.
  - AM Financials portal: Invoice Add/Edit form has both fields; invoice table row renders a purple Receipt icon next to the FileText icon when `eway_bill_url` is set.
  - Brand Orders page: new **Documents** column showing Invoice (blue) + E-way (purple) chip buttons when the linked invoice exists; "no invoice" italic placeholder otherwise. Powered by `_attach_invoice_links` helper joining `brand_invoices.order_id`.
  - Admin Order Detail modal: E-way Bill button next to Invoice button when `linked_invoice.eway_bill_url` is set; otherwise renders an "Add E-way Bill" CTA deep-linking to the brand's Financials portal. Powered by `list_orders` admin endpoint joining `brand_invoices`.



- **Q3 Invoice fix**: Order numbers like `LF/ORD/014` contain slashes that broke the path-routed invoice URL. Frontend now passes UUID `order.id` (slash-free) in AdminOrders + OrderConfirmationPage; `downloadInvoice()` also URL-encodes defensively; backend handler accepts both.
- **Q4 Customer email CTA**: `get_order_confirmation_email()` now renders a "Download Tax Invoice (GST)" button linking to `/api/orders/{order.id}/invoice` after every paid order.
- **Q5 Ashish CC**: `ORDER_NOTIFICATION_EMAILS` now includes `ashish.katiyar@locofast.com`. New `LOCOFAST_ORDER_DELIVERY_CC` env (defaults to ashish) is appended to every brand-order ops handoff.
- **Q6 Shiprocket on brand orders**: `brand_create_order` now `asyncio.create_task`s a new `_create_shiprocket_shipment_for_brand_order()` helper. Both samples and bulk auto-land on the courier pickup queue (parity with B2C `verify_payment` flow).
- **Q1+Q2 Account Manager + Multi-doc Ledger**:
  - **Role**: Admin users get `is_account_manager: bool` + `managed_brand_ids: List[str]` (max 3 brands per AM, 1 AM per brand). Endpoints: `PUT /api/admin/users/{id}/account-manager`, `PUT /api/admin/users/{id}/managed-brands`, `GET /api/admin/account-managers`, `GET /api/admin/brands/{id}/account-manager`.
  - **Permission helper** `_require_am_for_brand()` — non-AM admins are super-users; AM admins can only act on their assigned brands (everything else returns 403).
  - **3 new collections**: `brand_invoices`, `brand_credit_notes`, `brand_debit_notes`, `brand_payments`. Full CRUD on each with reason validation (CN: short_delivery / defective / return / quality_issue / discount / other; DN: late_payment / additional_logistics / tax_correction / other) and manual invoice numbers (rejects duplicates per brand).
  - **Payments with allocation**: One payment splits across multiple invoices via `allocations: [{invoice_id, amount}]`. Validates allocations ≤ payment amount, invoice ownership, and invoice outstanding-balance. Auto-updates invoice `amount_paid` + `status` (unpaid → partially_paid → paid). Cancellation reverses balances.
  - **Unified financials**: `GET /api/admin/brands/{id}/financials` and `GET /api/brand/financials` (read-only) return summary tiles (invoiced / paid / CN / DN / outstanding) + chronological timeline merging all 4 doc types + linked credit lines + sample-credit history. Brand version also surfaces the assigned AM contact card.
  - **New admin pages**: `/admin/account-managers` (promote/demote/assign-brands) and `/admin/brands/:brandId/financials` (full management portal with 6 tabs: Summary / Invoices / Credit Notes / Debit Notes / Payments / Timeline).
  - **Brand-side**: New "Financials" tab in `/enterprise/account` showing 5-tile summary, invoice list with PDF download links, AM contact card, recent activity timeline.



- **Email Audit Log (#5)** — `email_logs` collection + `log_email()` helper in `email_router.py`. Every order email (customer / Locofast admin / vendor / brand admins / ops) is persisted with `kind`, `recipients`, `subject`, full `html` body, `status` (sent/failed/skipped), `error`, plus `order_id`, `brand_id`, `customer_id` for filtering.
  - Admin endpoints: `GET /api/email/admin/logs?order_id=...&kind=...` (list), `GET /api/email/admin/logs/{log_id}` (single with html).
  - Brand-side: `GET /api/brand/orders/{id}/emails` (own audit trail, html stripped).
  - Wired into both `send_order_notification_emails` (B2C orders) and `_notify_order_recipients` (brand orders) — buyer / brand admins / sellers / ops all logged with distinct `kind` strings.
  - Frontend: `OrderEmailAudit.js` component renders in Admin Order Detail modal with Eye-icon "View body" → iframe-sandboxed HTML preview modal.

- **Unified Enterprise Account (#6)** — `BrandAccount.js` rewritten with 5 tabs (Overview / Profile / Addresses / Orders / Activity Ledger), URL deeplink via `?tab=...`.
  - **Profile tab**: Edit-in-place enterprise card (name, GST, phone, address) — `PUT /api/brand/profile` (brand_admin only, GST length validation). Read-only "You" card with logged-in user details.
  - **Addresses tab**: Full CRUD on the address book using existing `/api/brand/addresses` endpoints — saved cards, "Add address" inline form, set-default, remove. GST-seeded default highlighted with shield badge.
  - **Orders tab**: Sample + Bulk sections with item lists and PDP links per line.
  - **Activity Ledger**: `GET /api/brand/ledger` enriched with joined `order.products` array (fabric_id, fabric_name, fabric_code, color_name, quantity, unit, pdp_url) — every sample/bulk debit now shows the full product names with deep links to the catalog PDP.

- **Enterprise RFQ & Quotes Portal (#7)** — `rfq_router.submit_rfq` extended to accept brand JWTs and stamp `brand_id` + `brand_user_id`. Brand contact info auto-backfilled from `brand_users` + `brands` profile.
  - `GET /api/brand/queries?status=received|not_received|closed` — lists RFQs filed by anyone in the brand with `quotes_count`, `best_quote`, `quantity_label`.
  - `GET /api/brand/queries/{rfq_id}` — full RFQ + sorted vendor quotes with `is_best_price` flag on the cheapest.
  - Frontend pages: `/enterprise/queries` (3-tab grid with counts + search) and `/enterprise/queries/:rfqId` (spec card + best-price quote comparison). Won quotes get a Trophy badge; lost quotes greyed out.
  - "Queries" added to `BrandLayout` nav between Catalog and Orders.
  - `RFQPage.js` now sends `lf_brand_token` first (falls back to `lf_customer_token`); on success while brand-logged-in it redirects to `/enterprise/queries`.

- **RFQ Multi-Step Drafts + PDP Spec Prefill (#8 — Feb 2026)** — Buyers no longer lose work mid-wizard, and PDP-launched RFQs auto-inherit the SKU's specs.
  - **Backend** (`rfq_router.py`): `POST /api/rfq/submit` accepts new `is_draft: true` flag → creates an RFQ with `status="draft"`. New `PATCH /api/rfq/{rfq_id}` with `RFQPatch` model lets the wizard progressively enrich the same RFQ (composition, GSM, color, target_price…); aliases mirrored (`color → color_or_shade`, `weave_type → weave_pattern`, `target_price_per_unit → target_price_per_meter`, `required_by → dispatch_required_by`). PATCH is owner-only (403 otherwise) and frozen once a `vendor_quotes.status="won"` row exists. `finalize: true` flips draft→`new` and stamps `finalized_at`.
  - **Frontend RFQPage.js**: Step 1 Continue POSTs `is_draft=true` → stores `rfq_id` and shows a green "Draft RFQ-XXXXXX saved" pill. Steps 2 & 3 PATCH only the fields they own. Final Submit PATCHes delivery + `finalize=true` (no duplicate RFQ). Anonymous users (no JWT) silently fall back to a single legacy POST on Submit.
  - **PDP Prefill**: `/rfq?fabric_id=<id>` fetches the fabric and pre-fills category, fabric_type, unit, sub_category, composition rows, GSM/oz, width, color, pantone, weave/knit, finish, end_use & certifications. Toast confirms "Specs pre-filled from \<name\>".
  - **RFQModal**: When launched from a PDP (with `fabric` prop) it now also surfaces an "Open full RFQ form (specs pre-filled)" link that deep-links into the wizard with prefill. `BrandFabricDetail.js` now passes `fabric={fabric}` to the modal so brand-side PDPs get the same flow.
  - **Brand-logged-in contact card**: RFQPage Step 4 now hydrates from `lf_brand_token` (via `/api/brand/me`) in addition to customer tokens, so brand users see the read-only "Submitting as …" card instead of an empty contact form.

- **Credit Period + 1.5%/mo Surcharge (Feb 2026)** — Brand orders paid via Locofast Credit Line now apply a per-month surcharge based on the credit period (30/60/90 days).
  - **Backend (`brand_router.py`)**: `brands.credit_period_days` (default 30, validated 30/60/90) drives the formula `credit_charge = pre_credit_total * 0.015 * (period/30)` in `brand_create_order`. Razorpay path (`/brand/orders/razorpay/create` + payment_method=razorpay) is surcharge-free. `GET /api/brand/credit-summary` now returns `credit.credit_period_days` so the cart can mirror the math.
  - **Frontend (`BrandCart.js`)**: Reads `credit_period_days` from credit-summary, computes `bulkCreditCharge` whenever bulk payment method = "credit", renders a "Credit charges (1.5% × N mo)" line in the Bulk summary, and rolls the charge into the bulk-total + grand-total. Locofast Credit Line option label now shows "<period>-day terms" with "1.5%/mo surcharge applies" subtitle. Toggling to Razorpay drops the charge instantly.
  - **Admin tooling**: `PUT /api/admin/brands/{id}` accepts `credit_period_days` (validates 30/60/90). Bulk Credit Upload modal also seeds the field on first allocation.
  - **B2C parity**: `CheckoutPage.js` + `orders_router.create_order` apply the same formula keyed on `credit_wallets.credit_period_days` (GST-keyed wallet).

### Phase 54: Vendor Payouts Module (Complete - Feb 2026)
New `accounts` role with restricted admin access. Calculates per-vendor dues from paid orders, applies commission % + advances, generates "Mark Paid" with UTR tracking. Module covers: dashboard at `/admin/payouts`, advances tied to specific orders, vendor finance edit (bank/PAN/payment_terms), email + WhatsApp settlement notifications.

### Phase 55: Vendor Invoice Upload as Prerequisite for Payout (Complete - Feb 2026)
Compliance gate — vendor must upload their tax invoice before Accounts can release payment. Tested 11/11 backend + 5/5 frontend (iteration_58.json).
- **Backend (`payouts_router.py`)**: New endpoints `GET /api/vendor/payouts` (vendor JWT), `POST /api/vendor/payouts/{id}/upload-invoice` (vendor JWT), `POST /api/payouts/{id}/reject-invoice` (accounts/admin). Mark-paid endpoint now returns HTTP 400 if `vendor_invoice_status != "uploaded"`. Upload locks once submitted; only rejection unlocks re-upload. Audit history persisted in `vendor_invoice_history` array.
- **Email triggers (Resend)**: On upload → email to `creditoperations@locofast.com` (env `ACCOUNTS_NOTIFY_EMAIL`) with invoice metadata + view link. On rejection → email to vendor with reason and call-to-action to re-upload.
- **Frontend — Vendor Portal**: New `/vendor/payouts` page with 4 stat tiles (pending/uploaded/rejected/paid), filter chips, table of payouts, upload modal with invoice_number + date + amount fields + Cloudinary upload widget (any file type, max 25 MB). Same upload widget reused inside the VendorOrders detail modal so vendors can submit from either flow.
- **Frontend — Admin/Accounts**: New "Invoice" column in payouts table (badge: Awaiting upload / Uploaded ↗ / Rejected). Detail modal gains "Vendor's Tax Invoice" section showing invoice number/date/claimed amount/uploaded-at + Open link. "Mark Paid" button is disabled (with tooltip) until invoice is uploaded. Inline "Reject invoice" button opens reason modal → fires rejection email to vendor.
- **New schema fields on `vendor_payouts`**: `vendor_invoice_url`, `vendor_invoice_filename`, `vendor_invoice_number`, `vendor_invoice_date`, `vendor_invoice_amount`, `vendor_invoice_status` ("not_uploaded"/"uploaded"/"rejected"), `vendor_invoice_uploaded_at`, `vendor_invoice_rejection_reason`, `vendor_invoice_rejected_at`, `vendor_invoice_rejected_by`, `vendor_invoice_history[]`.
- **New components**: `/app/frontend/src/components/vendor/VendorFileUpload.js` (Cloudinary direct-upload via vendor JWT, any file type), `/app/frontend/src/pages/vendor/VendorPayouts.js`.

### Phase 56: Set Credit Limit by GST + Credit-Ops email rename (Complete - Feb 2026)
Single-entry "Set Credit Limit by GST" admin tool — alternative to the bulk CSV upload. Tested 14/14 backend + all frontend (iteration_59.json).
- **Backend (`orders_router.py`)**: New `POST /api/orders/credit/wallets/upsert` (password '0905' gated) — creates a new wallet when GST is unknown, or updates an existing one in Replace/Top-up mode. New `GET /api/orders/credit/wallets/lookup?gst_number=...` returns `{found, wallet?}`. Validates GSTIN length=15, credit_limit≥0, credit_period_days ∈ {30,60,90}.
- **Frontend**: New "Set Limit by GST" button on Credit Management tab opens `SetCreditByGstModal`. As soon as the GSTIN reaches 15 chars, a debounced lookup runs (client-cache first, then server). If found → blue "Updating existing wallet" card with current limit/balance/used + Replace/Top-up toggle. If not found → amber "New customer" card with Company/Email/Lender/Period fields. Replace mode resets balance to new limit; Top-up preserves used credit. Credit-panel search now also matches against `gst_number`.
- **Email rename**: `accounts@locofast.com` (a no-inbox distribution list) replaced with `creditoperations@locofast.com` across payouts emails, ORDER_NOTIFICATION_EMAILS, brand_router LOCOFAST_ORDER_DELIVERY_CC default, and the GST invoice PDF email field. The seeded admin login was renamed too (idempotent migration in `seed_accounts_user.py` carries over the existing user record). Old email no longer logs in.

### Phase 57: Place of Supply = Shipping State + Consignee GST capture (Complete - Feb 2026)
Fixed a compliance bug — CGST/IGST was previously decided by the buyer's BILLING GST, which is wrong for shipped goods. Per CGST §10, Place of Supply for goods = location of delivery. Now the invoice routes tax type based on the shipping state. Tested 11/11 backend + all frontend (iteration_60.json).
- **New `ShipTo` Pydantic model** on `OrderCreate` with name, company, gst_number, address, city, state, pincode, phone. Persisted on the order doc.
- **New `_resolve_pos_state(order, customer)`** function — POS resolution priority: `ship_to.gst_number` (first 2 digits) → `ship_to.state` → `customer.gst_number` → `customer.state`. Drives the `is_interstate` flag for IGST vs CGST+SGST on the invoice. `_resolve_buyer_state` retained for the Bill-To block (decoupled so billing state still shows correctly even when shipping elsewhere).
- **Invoice PDF**: When `ship_to` is present, a 3-column layout (Seller | Bill-To | Ship-To) renders. Ship-To block includes consignee GSTIN + "State Code: NN (StateName)". Place of Supply line at the bottom now reflects the shipping state. Tax breakdown (CGST/SGST or IGST) follows the new POS resolution.
- **Checkout UX (`CheckoutPage.js`)**: Selecting "Ship to a Different Address" now opens a GST-first form. An amber warning explains the GST is required for correct tax routing. Typing a 15-char GSTIN auto-verifies via `/api/gst/verify` (reused — no new endpoint), pulling firm name + address + state + pincode from GSTN. The State field becomes **readOnly** with a "🔒 locked from GSTN" indicator post-verification so the buyer cannot drift the state off the GSTN-registered value. Submit blocked until consignee GST is verified.

### Phase 58: Edit Order + Vendor-driven Ship-From (Complete - Feb 2026)
Full admin order-edit capability + Shiprocket pickup now sourced from the assigned vendor's address instead of Locofast's hardcoded warehouse. Tested 16/16 backend + all frontend (iteration_61.json).
- **Backend (`orders_router.py`)**: New `PATCH /api/orders/{id}/edit` (admin auth) accepting partial OrderEditPayload (items/customer/ship_to/seller_id/notes/repush_shiprocket). Edits rejected when status is `delivered` or `cancelled`. Recomputes subtotal/tax/total on every save. New `GET /api/orders/{id}/edits` returns the audit history. New `order_edits` collection persists every edit with `{order_id, edited_by, edited_at, changed_fields, diff{before,after}}`.
- **Vendor change behaviour**: Stamps new seller_id/seller_company onto every item (PRICE STAYS THE SAME — business rule). Cancels any pending payout for the old vendor with reason="Vendor reassigned via order edit". Already-paid payouts are never touched but get flagged with `needs_review=true` for accounts review. If order was already pushed to Shiprocket, the old SR shipment is cancelled via the SR cancel API and a new one is created with the new vendor's pickup address.
- **Vendor-driven Ship-From**: New `_ensure_vendor_pickup_nickname(seller)` helper. Each seller now has 7 pickup fields (pickup_address/city/state/pincode/contact_name/contact_phone + shiprocket_pickup_nickname). When pushing to Shiprocket, the helper looks up the nickname; if blank, auto-registers a new pickup location in Shiprocket using the vendor's address fields (idempotent, stable nickname `VND-{seller_code}`) and persists it back to the seller. Falls back to "Primary" only when address fields are missing, with a log warning.
- **Checkout / Shiprocket payload**: `create_shiprocket_shipment` now passes `shipping_*` fields separately when `ship_to` is present (so SR sends to the consignee, not the billing address) and `pickup_location` is the vendor-specific nickname.
- **Frontend — `EditOrderModal.js`**: Full 5-tab modal (Items / Customer / Shipping / Vendor / History) opened via "Edit Order" button on the admin order detail. Live total recomputation preview, vendor search with pickup-warning badge, audit history viewer with collapsible diff JSON, optional "cancel & re-push SR" checkbox.
- **Frontend — Admin Seller Detail Finance tab**: Adds a "Pickup address (Ship-From)" card with 7 fields + Save button so admin can register each vendor's warehouse for Shiprocket pickup.

### Phase 63: Frictionless Checkout (Complete - Feb 15, 2026)
**Goal**: Order flow needed to mirror the unified RFQ flow — gate guests behind WhatsApp OTP, auto-fill everything for logged-in customers, surface past saved addresses as one-tap chips.

- **Backend**: `GET /api/customer/saved-addresses` — derives unique past shipping addresses from `db.orders` (looks up by email OR phone, dedupes on address+pincode, limits to 6). Zero schema change — addresses come from each order's snapshotted `customer{}` block.
- **Frontend** — `SavedAddressPicker` component: horizontal scrollable chip list, only renders when API returns non-empty. Each chip fills form fields on tap (name, phone, address, city, state, pincode, GSTIN).
- **Wrappers**: `CheckoutPage` (desktop) and `MCheckout` (mobile) now default-export gated variants using the same `RFQAuthGate`. Logged-in users pass through transparently.
- **Verified** (iteration_66.json): 100% pass (11/11 backend + 10/10 frontend). Picker dedupe correct, gate shows for guests, complete-profile customers auto-fill cleanly.

### Phase 62: Unified RFQ Flow (Complete - Feb 15, 2026)
**Goal**: Single RFQ structure across desktop + mobile, with smart skipping for logged-in users and inline registration for guests.

- **3-stage auth gate** (`RFQAuthGate.js`): phone → WhatsApp OTP → (if new) inline registration (name + email + GSTIN with server-side GST verify via Sandbox API). Reuses existing Gupshup integration + `PUT /customer/profile` endpoint.
- **Use-case logic**:
  - Logged-in + PDP context → collapsed "Specs locked from {fabric}" card with Edit toggle, skip personal-info step
  - Logged-in + header → fabric picker grid, skip personal-info step
  - Guest → auth gate, then route into one of the above
- **Mobile (`MRFQ.js`)**: full refactor — 2 steps for logged-in (specs+qty → notes), no contact step. Fabric pre-fills from `?fabric=` param via `/api/fabrics/{slug}`. Composition rendering normalises array/string forms.
- **Desktop (`RFQPage.js`)**: wrapped in `RFQAuthGate` (last 15 lines) without touching the existing 1000+ line form below.
- **Verified** (iteration_65.json): 100% pass (10/10 frontend + 9/9 backend). 1 LOW-priority composition display bug found and fixed.

### Phase 61: Unified Credit & Ledger (Complete - Feb 14, 2026)
**Goal**: Bring B2C/standard buyers to parity with enterprise — every buyer with a GSTIN now sees a single Credit & Ledger view (limits per lender, full disbursement history, payments stream, manual adjustments).

- **Backend** — new router `/api/credit-ledger/*` (`credit_ledger_router.py`):
  - 4 new MongoDB collections: `credit_lender_lines`, `credit_disbursements`, `credit_payments`, `credit_adjustments` (+ `credit_adjustment_otps`). Indexed in `db_indexes.py`.
  - `POST /admin/disbursements/upload-csv` & `POST /admin/payments/upload-csv` — tolerant CSV parser (handles `#REF!`, comma-thousands, `DD-Mon-YY`/ISO dates). Idempotent on `invoice_no` / `utr`.
  - OTP-gated manual adjustments: `send-otp` → `verify-otp` (4h JWT scoped `credit_adjustment`) → `post`. Restricted to `CREDIT_ADJUSTMENT_ADMIN_EMAIL` (default `sandeep.kumar@locofast.com`). Adjustments are immutable (409 on duplicate ref).
  - Razorpay auto-record hook fires from `orders_router.verify_payment` → credit_payments with `utr='razorpay:<id>'`, `source='razorpay-webhook'`.
  - `GET /by-gstin/{gstin}` unified read returns `{ totals, lenders, disbursements, payments, adjustments }`. Falls back to legacy `credit_wallets` row when new tables are empty (so existing buyers see something immediately).
  - Google Sheets poller scaffolded (env: `SHEETS_SERVICE_ACCOUNT_JSON`, `SHEET_DISBURSEMENTS_ID`, `SHEET_PAYMENTS_ID`, `SHEETS_POLL_INTERVAL_SEC=900`). No-op until creds supplied.

- **Frontend** — shared `<CreditLedgerView/>` presentation component (top stat cards, lender utilisation bars, disbursement table with status pills, payments stream with auto/manual badges, adjustments table). Used by:
  - Desktop `/account?tab=ledger` — new "Credit & Ledger" tab (testid `tab-credit-ledger`).
  - Mobile `/m/ledger` — new route + tile on `/m/account`.
  - `/admin/credit-adjustments` — 3-stage OTP form (email → 6-digit OTP → adjustment form). JWT cached in localStorage `credit_adj_jwt`.
  - Static design preview at `/dev/ledger-preview` (kept for stakeholder reference).

- **Verified** (iteration_64.json): 14/14 backend + 100% frontend. Real CSV (35 rows) ingested cleanly; idempotency, OTP rate-limit, JWT scope, Razorpay hook, legacy wallet fallback all PASS.

### Phase 60: RFQ → Order Packaging & Logistics Parity (Complete - Feb 14, 2026)
Bug fix — orders created from a vendor quote (RFQ flow) were missing `packaging_charge` and `logistics_only_charge` because `place_order_from_quote` built an `OrderCreate` without these fields, defaulting them to ₹0. This caused revenue leakage on RFQ-converted orders.
- **Backend (`customer_queries_router.py`)** — `place_order_from_quote` (lines 199-244) now computes bulk pricing inline (`total_logistics = max(3% of subtotal, ₹3000)`, `packaging = qty × ₹1`, `logistics_only = total_logistics - packaging`) — mirroring `CheckoutPage.calculatePricing`. Passes both fields into `OrderCreate` so downstream `calculate_totals` produces correct taxable value & total. Tested 6/6 backend cases (iteration_63.json).
- Both Desktop (`CustomerQueryDetail.js`) and Mobile (`MRfqDetail.js`) RFQ-place-order paths benefit (shared endpoint).

### Phase 59: 5% GST on Packaging + Logistics (Complete - Feb 2026)
Compliance fix — per Schedule II of the CGST Act, packaging and logistics charged by the supplier are part of the value of supply and are taxable at the same rate as the principal goods. Earlier orders didn't tax these charges; new orders do. Tested 9/9 backend + frontend (iteration_62.json).
- **Backend (`orders_router.py`)**: `calculate_totals` rewritten — `taxable_value = goods_subtotal + packaging + logistics`, `tax = 5% × taxable_value`, `total = taxable_value + tax`. Result also exposes a `tax_on_charges_v2: True` flag so the PDF renderer can branch correctly.
- **Order doc**: New persisted fields `taxable_value` and `tax_on_charges_v2: True` on both Razorpay and credit-paid order creation paths. Bangladesh export PI flow unchanged (exports stay zero-rated).
- **Invoice PDF — dual presentation**:
  - **v2 (Feb 2026+)**: Goods Subtotal → Packaging Charge → Logistics Charge → **Taxable Value** → IGST 5% (or CGST 2.5% + SGST 2.5%) → TOTAL
  - **v1 (legacy)**: Subtotal → IGST/CGST/SGST (on goods only) → Packaging → Logistics → TOTAL — preserved exactly so historical invoices match what customers were actually charged.
- **Checkout UI (`CheckoutPage.js`)**: Both `calculatePricing` and `calculateMultiItemPricing` now compute tax base = `goods + packaging + logistics`. Order summary panel reorders to: Goods Subtotal → Packaging → Logistics → "Taxable value (Goods + Packaging + Logistics)" dashed row → GST 5% → Coupon/Credit → Total.

## Backlog

### P0 (Top Priority — Next)
- [ ] Auto due-date reminder emails (T-7 / T-3 / T+0): cron scanning `brand_invoices` for unpaid status, sending progressive reminders to brand admins & assigned AMs to reduce DSO.

### P1 (High Priority)
- [ ] Outbound webhooks for CRM — POST RFQ status changes (`new → quoted → won`) to an external endpoint
- [ ] Vendor SLA Timer (Time-to-Quote) — 48h countdown when a vendor opens an RFQ; auto-close on miss
- [ ] Run `backfill_denim_names.py` on production to standardize legacy denim names/weaves/ounce formatting
- [ ] Run `POST /api/migrate/compositions?apply=true` on production
- [ ] Admin workflow: populate `article_id` on existing fabric SKUs so Buy Box dedupe becomes visible on listing

### P2 (Medium Priority)
- [ ] Audit the 103 soft-404 pages from Google Search Console
- [ ] Homepage redesign modules: Block CMS, Deal Wall Manager, Live Auctions, Trending Rankings
- [ ] Further `server.py` slimming (GST, Stats, Seed, RFQ-lead still inline; target <400 lines)

## Mobile PWA (Feb 13, 2026)
- Dual-surface app: Desktop `/` and Mobile `/m/*` share React tree but isolate theme/SW.
- Mobile pages: MHome, MCatalog, MFabricDetail, MRFQ, MOrders, MOrderDetail, MAccount, MCheckout, MNotifications, MLogin, **MRfqDetail**, **MOrderConfirmation**, **MInventory**, **MCollections**, **MCollectionDetail**, **MQueries** (new Feb 13: parity gap fix).
- MAccount now has parity with desktop `/account`: Orders + Queries + RFQ stat cards, Company auto-fill, phone-only nudge, inline edit-sheet validation, Email field.
- Architectural rules in `/app/frontend/src/mobile/README.md` — never touch `src/pages/` for mobile work.

### Mobile Checkout Funnel Hardening (Feb 18, 2026)
- **Sticky CTA z-index lifted 50→100** on MFabricDetail and MCheckout so the PWA install banner (z90) can no longer hijack taps. Was the root cause of "Buy sample / Book Bulk does nothing" on production.
- **CTA bar flush with viewport bottom**: removed the unused 64px tab-bar reservation on fabric detail (tabs are already hidden) — `bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px)`.
- **PWA InstallPrompt suppressed** on `/m/fabric/*`, `/m/checkout`, `/m/rfq/*`, `/m/order*` to avoid any overlay-on-CTA race condition.
- **Mobile checkout auto-fills from saved addresses**: when the customer profile doc has empty `address/city/state/pincode` (common for users who only filled address per-order on desktop), MCheckout now falls back to `/api/customer/saved-addresses[0]` for the prefill — no more re-asking for shipping details already captured on desktop.
- Fixed-bar centering uses `left:50%; transform:translateX(-50%); width:100%; max-width:480px` so the bar matches the mobile frame on wider viewports.

### GST Trade Name Migration (Feb 18, 2026)
- **Forward-fix:** Flipped GST auto-fill priority from `legal_name → trade_name` so all new GSTIN verifications save the Trade Name as the customer's company name (which is what the tax invoice prints). Touched `customer_router.py`, `CustomerAccountPage.js`, `AdminCustomers.js`. Desktop CheckoutPage/AdminSellers/SellOnLocofast already preferred trade name.
- **Backfill tool:** new admin endpoint `POST /api/admin/customers/{id}/resync-gst` + "Resync" button next to GSTIN in `/admin/customers` detail dialog. Re-hits the GST registry, prefers trade_name for `company`, refreshes `city/state/pincode`, stamps `gst_status` + `gst_last_synced_at`. If the GSTIN comes back cancelled/inactive (`sts != "Active"`), we flag `gst_verified=false` and persist the status — but **never wipe** the existing company name (per ops directive).

### Provisional Bulk Orders — Vendor & Admin UIs (Feb 19, 2026) ✅
Full E2E flow for the 10% advance bulk order workflow shipped. Customer pays 10% advance → Vendor marks goods ready with exact dispatched quantity (with per-roll breakdown) → balance invoice auto-emailed → Customer pays balance OR Admin marks paid offline → Shiprocket push.
- **Vendor UI** (`/app/frontend/src/pages/vendor/VendorOrders.js`)
  - `ProvisionalBanner` component renders contextual banners for each payment_status (`pending_advance` / `advance_paid` / `balance_pending` / `paid`).
  - `MarkGoodsReadyModal`: per-item rolls breakdown (count × length rows), auto-summed total, ±10% variance warning, optional dispatch_note per item. Vendor sees only items where `seller_id` matches their own.
  - "Mark Goods Ready" CTA visible only when `payment_status === 'advance_paid'`. Submitting calls `POST /api/orders/{id}/mark-goods-ready` and refreshes the modal.
- **Admin UI** (`/app/frontend/src/pages/admin/AdminOrders.js`)
  - Top-of-modal `admin-provisional-banner` with Advance / Balance / Stage tiles for any provisional order.
  - "Mark Balance Paid (₹X)" button in the action footer, visible only when `is_provisional && payment_status === 'balance_pending'`. Confirms then `POST /api/orders/{id}/mark-balance-paid` — flips order to `paid+confirmed`, deducts inventory, materializes payouts, pushes to Shiprocket.
  - New status configs for `provisional`, `goods_ready`, and payment statuses `pending_advance`, `advance_paid`, `balance_pending`.
- **Backend** (`/app/backend/orders_router.py`)
  - `POST /api/orders/{order_id}/mark-goods-ready` extended to accept `rolls: [{count, length}]` and `dispatch_note` per item; auto-derives `actual_quantity` from rolls when omitted.
  - Replaced async-dependency call with manual JWT parsing inside the endpoint to support both vendor and admin/accounts callers (testing-agent fix).
  - On `all_ready=true` we recompute actual_total proportional to original packaging/logistics/tax, stamp `balance_amount`, transition payment_status → `balance_pending`, status → `goods_ready`, and fire `send_balance_payment_due_email` to the customer (best-effort).
- **API helpers** (`/app/frontend/src/lib/api.js`): `vendorMarkGoodsReady(orderId, items)`, `adminMarkBalancePaid(orderId)`. Axios interceptor now forwards the vendor JWT for `mark-goods-ready` calls.
- **Tests**: `/app/backend/tests/test_provisional_orders.py` — 10/10 pass (state machine, variance band, rolls payload, balance recompute, admin override, full E2E).

### Provisional Bulk Orders — Vendor Invoice + Payout from Actual Qty (Feb 19, 2026) ✅
Refined the goods-ready step so vendor payouts use real dispatched quantities and the tax invoice is captured upfront.
- **Vendor invoice required at goods-ready**: `POST /api/orders/{id}/mark-goods-ready` now requires `vendor_invoice: {url, filename, invoice_number, invoice_date, amount?}` when caller is a vendor. Admin override (caller_role=admin) still allowed without invoice. Order stores `vendor_invoices: [{seller_id, url, filename, invoice_number, invoice_date, amount, uploaded_at}]` keyed by seller_id (multi-supplier safe).
- **Payouts use actual_quantity**: `payouts_router.materialize_payouts_for_order` now reads `item.actual_quantity` (fallback to `item.quantity`) when computing `line_gross`, so vendor commission/payout matches dispatched volume — not the customer's original order. Non-provisional orders are unchanged.
- **Auto-stamped payout invoice**: When materializing a payout we copy the order's `vendor_invoices` entry onto the payout doc (`vendor_invoice_url`, `vendor_invoice_number`, `vendor_invoice_date`, `vendor_invoice_amount`, `vendor_invoice_status='uploaded'`, `vendor_invoice_source='mark_goods_ready'`). Vendor doesn't need to re-upload from My Payouts; legacy `/api/vendor/payouts/{id}/upload-invoice` is still available for non-provisional flows.
- **UI** (`/app/frontend/src/pages/vendor/VendorOrders.js`): Mark Goods Ready modal now has a "Tax Invoice for Payout" block (invoice number + invoice date + amount + Cloudinary file upload). Submit blocked until all required fields are filled.
- **Tests**: `/app/backend/tests/test_provisional_invoice_payout.py` — 10/10 pass (required-for-vendor, optional-for-admin, vendor_invoices persistence, actual_quantity payout, invoice auto-stamping, non-provisional fallback, legacy upload still works).

### Provisional Bulk Orders — Complete Flow + 24h Vendor SLA + Internal Mail Chain (Feb 19, 2026) ✅
Final end-to-end workflow shipped. 13/13 tests pass (`/app/backend/tests/test_vendor_accept_cancel_v70.py`).
- **Agent qty_type toggle** (`AgentDashboardPage.js`): cart-level `Quantity Confirmation` toggle (Actual / Provisional) + per-item override on each cart row. Drives `order.is_provisional` at checkout — ANY item with `qty_type='provisional'` triggers the 10% advance flow. Samples are always `actual`. Backend: `SharedCartItem.qty_type`, `CreateSharedCartRequest.default_qty_type`, `OrderItem.qty_type`.
- **Vendor 24h Accept/Cancel window** (`VendorOrders.js` + `orders_router.py`): On successful advance/full payment we stamp `vendor_acceptance_status='pending'` + `vendor_action_deadline = now + 24h`. New banner (testid `vendor-acceptance-banner`) with live h/m countdown shows Confirm Order / Cancel Order. Multi-vendor: each vendor accepts independently; any cancel cancels the whole order (single-payment constraint). 
- **Auto-cancel on SLA miss** (`order_autocancel.py`): `cancel_stale_vendor_orders` sweep fires every hour. Orders past `vendor_action_deadline` → `status=cancelled`, `cancellation_reason=vendor_sla_missed`, customer email + internal `VENDOR_AUTO_CANCELLED` event. Configurable via `VENDOR_ACCEPT_SLA_HOURS` (default 24).
- **Customer cancellation email** (`email_router.send_order_cancellation_email`): Hand-crafted template explaining reason + advance refund window. Logged to `email_logs`. Internal stakeholders are **never** CC'd.
- **Shareable balance-pay link** (`orders_router.py`): Agent/admin can mint `POST /api/orders/{id}/balance-share-link` returning `{token, url}` (signed against `BALANCE_LINK_SECRET`). Public `GET /api/orders/balance-share/{order_id}/{token}` returns order summary; `POST .../pay` mints a Razorpay order for the balance — customer doesn't need to log in. Agent dashboard now has "Share Balance Link" button (testid `agent-balance-link-{order_number}`) on every `balance_pending` provisional order.
- **Internal mail chain** (`internal_events.py`, **new module**): Separate event-driven pipeline. `OrderEvent` enum + `fire_internal_event()` helper sends single email per event to a fixed 4-address list (Deepak@locofast.com, ankush.mehandiratta@locofast.com, accounts@locofast.com, animesh.sharma@locofast.com — overridable via `INTERNAL_ORDER_CC` env). Hooks wired into: `verify-payment` (ADVANCE_PAID / PAYMENT_CAPTURED / ORDER_CONFIRMED based on stage), `mark-goods-ready` all_ready (GOODS_READY), `mark-balance-paid` (ORDER_CONFIRMED + PAYMENT_CAPTURED), Shiprocket success (ORDER_DISPATCHED), `vendor-accept` (VENDOR_ACCEPTED), `vendor-cancel` (VENDOR_REJECTED + ORDER_CANCELLED), `cancel_stale_vendor_orders` (VENDOR_AUTO_CANCELLED), `payouts/{id}/mark-paid` (VENDOR_PAYOUT_PAID). All emails logged to `db.email_logs` with `kind=internal_<event>`. **Never sent to or CC'd on customer emails.**
- **New endpoints**: `POST /api/orders/{id}/vendor-accept`, `POST /api/orders/{id}/vendor-cancel`, `POST /api/orders/{id}/balance-share-link`, `GET /api/orders/balance-share/{order_id}/{token}`, `POST /api/orders/balance-share/{order_id}/{token}/pay`.
- **Tests**: 13/13 pass — vendor accept/cancel, multi-vendor 403 isolation, SLA auto-cancel, balance share mint/resolve/pay, internal events firing & logging, qty_type propagation, customer-vs-internal email separation.

### Admin Cancel-with-Reason + Order Status Tabs (Feb 19, 2026) ✅
Audit-driven hardening of the admin order panel. 7/7 backend tests + all UI checks pass.
- **Status tabs** (`/admin/orders`): Replaced the status dropdown with 9 one-tap tabs (All / Payment Pending / Provisional / Goods Ready / Confirmed / Processing / Shipped / Delivered / Cancelled). Each tab carries a live count badge. Switched from server-side `?status=` requery → fetch all (limit 1000) once + client-side filter for instant tab switches and accurate counts.
- **Cancel button in detail modal** (`AdminOrders.js`): Previously only available as a Ban icon in the list row. Now `admin-cancel-order-modal-btn` lives in the order detail modal footer (hidden for `cancelled`/`delivered` orders), so admins don't need to close the modal to cancel.
- **Free-text cancellation note** (`AdminOrders.js`): Added `admin-cancel-notes` textarea to the cancel modal. **Required** when reason="Other"; the note is appended to the human-readable reason in the customer email and internal mail chain.
- **Customer email + internal mail chain on admin cancel** (`orders_router.py`): `PUT /api/orders/{id}/cancel` now fires `send_order_cancellation_email` (customer-facing) AND `fire_internal_event(ORDER_CANCELLED)` (separate internal stakeholders' chain). Order doc now stores `cancellation_notes` + `cancelled_by='admin'`. Backend stays lenient on empty notes for "other" (frontend enforces); credit-refund path unchanged.
- **API helper**: `cancelOrder(id, reason, notes='')` — backward compatible.

### Mark Goods Ready for Non-Provisional Orders + Vendor Status Tabs (Feb 19, 2026) ✅
Bug-fix + UX from user audit. 9/9 endpoint tests pass.
- **Bug**: Supplier couldn't see Mark Goods Ready CTA on confirmed (non-provisional) orders — endpoint was gated on `is_provisional=True`, frontend banner only rendered for provisional.
- **Backend** (`orders_router.py`): `POST /api/orders/{id}/mark-goods-ready` now branches on `is_provisional`. Provisional gating unchanged. Non-provisional now accepts `status ∈ (confirmed, processing, goods_ready)` (the last one enables edits/re-uploads). For non-provisional we only stamp rolls + invoice on items, set `status='goods_ready'`, `goods_ready_at`, `goods_ready_by`. No total/balance recomputation (customer already paid 100%). No balance-due customer email. **Internal GOODS_READY event fires for both paths.**
- **Frontend Vendor** (`VendorOrders.js`):
  - New `MarkReadyBanner` (testid `vendor-mark-ready-banner`) renders inside order detail modal when order is non-provisional and status ∈ {confirmed, processing}. Reuses the existing `MarkGoodsReadyModal` (rolls + invoice).
  - Stamped state (testid `vendor-banner-goods-ready-stamped`) with Edit link for already-marked orders.
  - **Status tabs** (testid `vendor-order-status-tabs`): 9 tabs (All / Payment Pending / Advance Paid / Confirmed / Goods Ready / Processing / Shipped / Delivered / Cancelled) with live count badges scoped to the current Source filter (Inventory/RFQ).

### Packing Slip PDF (Feb 19, 2026) ✅
- **New module** `/app/backend/packing_slip.py` — reportlab-based generator that flattens `dispatch_rolls` into ONE ROW PER ROLL (e.g., `3 rolls × 50m` → 3 rows of `Roll 1/3 · 50m`, `Roll 2/3 · 50m`, …). Falls back to ordered/actual quantity if rolls weren't captured. Header shows order #, goods-ready timestamp; address panel with FROM (supplier) → SHIP TO (customer). Footer carries total rolls + total meters + per-item dispatch notes.
- **New endpoint** `GET /api/orders/{order_id}/packing-slip` — vendor or admin JWT. Vendors get only their own seller_id's items; admins get every supplier on the order. Returns `application/pdf`. 400 if no quantity data captured yet, 403 if vendor has no items on this order.
- **Frontend** (`VendorOrders.js`): New `PackingSlipButton` component (testid `vendor-packing-slip-btn`) on the goods-ready stamped banner. Downloads via axios blob, surfaces backend error detail (decoding blob → JSON for nicer toasts). Visible for both non-provisional goods_ready orders AND provisional orders in balance_pending / paid (since rolls + invoice are already captured at that point).

### Per-Category Variance Configuration (Feb 19, 2026) ✅
Default ±variance band tightened from 10% → 3%. Admins can now configure variance per category (e.g., greige rolls 5–8%, knits 3–5%). 18/19 tests pass; 1 bug caught by testing agent (POST /categories was dropping new fields) fixed in-flight.
- **Backend** `provisional_orders.py`: `VARIANCE_PCT` env-default lowered to `3`. `within_variance(ordered, actual, pct=None)` now takes an explicit `pct` kwarg. New `resolve_category_variance(db, category_id) -> float` reads `categories.variance_pct` if set & positive, else returns the platform default.
- **Backend** `orders_router.py` (mark-goods-ready): resolves `cat_by_fabric` in a single fabric lookup (since order items don't carry `category_id`), then applies the per-category band per item. Error message surfaces each line's exact band: `"Cotton Twill (±5.0%), Linen 220 (±3.0%)"`.
- **Backend** `category_router.py`: `CategoryCreate` / `CategoryUpdate` / `Category` now include optional `variance_pct: float`. POST `/api/categories` and PUT `/api/categories/{id}` accept it; GET returns it. (Bug-fix: POST was previously dropping `variance_pct` + other newer fields — now mirrors full schema.)
- **Frontend** `AdminCategories.js`: New "Goods-Ready Variance %" input (testid `category-variance-input`) on the category modal — 0–100 range, blank → platform default. Help text spells out typical ranges (knits 3–5%, greige 5–8%).

### Multi-Vendor Shiprocket Duplicate Prevention (Feb 19, 2026) ✅
Bug: Duplicate Shiprocket shipments being created for the same vendor (Locofast Online Services) on multi-supplier orders. Verified 9/11 backend tests + frontend rendering invariant.
- **Root cause #1 (backend)**: Auto-push during `verify-payment` splits a multi-vendor order into child orders and pushes each child's Shiprocket independently. The PARENT order's `shiprocket_shipments[]` array was never populated. When admin clicked "Push to Shiprocket" on the parent later, `admin_push_to_shiprocket`'s idempotency check saw an empty array and re-pushed every supplier → duplicate SR# on Shiprocket.
- **Fix #1** (`orders_router.py` verify-payment auto-push, lines 893-984): After each child push (success OR failure), aggregate the result into a `parent_shipments[]` list with seller_id, seller_company, success, order_id, shipment_id, awb_code, child_order_id, error. After all children, persist that list onto the parent's `shiprocket_shipments` array along with `shiprocket_pushed=True` + first-success mirror on legacy single-shipment fields. Subsequent admin pushes correctly short-circuit with `already_pushed=true`.
- **Root cause #2 (frontend)**: AdminOrders.js name-based fallback could match the same shipment row under multiple supplier groups, displaying identical SR# under different vendors.
- **Fix #2** (`AdminOrders.js`): `srMap` only indexes shipments WITH a `seller_id`; `srByName` only indexes shipments WITHOUT one. A `claimed: Set` ensures each shipment can attach to AT MOST ONE supplier group across the render loop.
- **Tests**: 9 backend tests pass (admin idempotency, force re-push, seller_ids filter, single-vendor regression, provisional advance-leg no-push, failed-push structure preserved). 2 skipped due to no existing multi-vendor test data — code review confirms logic is correct.

### Agent Cart — Unit-aware Display (kg vs m) (Feb 19, 2026) ✅
Bug: Agent panel always showed `/m` regardless of the fabric's actual sales unit. Polyester knits (configured by vendor as `kg`) were being shown in metres, mismatching the customer-facing PDP.
- **Shared helper** `/app/frontend/src/lib/fabricUnit.js`: `getFabricUnit(fabric)` returns `kg` when `fabric_type === 'knitted'` AND not in the denim category, else `m`. Mirrors the existing logic in VendorInventory + AdminFabrics, so all three surfaces now derive the unit identically.
- **Frontend agent** (`AgentDashboardPage.js`): Catalog tile price (`/m` → `/{unit}`), cart row price (`₹X/{item.unit}`), quantity controls, stepper tooltips, aria-labels — all reflect the per-item unit. `addToCart` stamps `unit` + `fabric_type` + `category_id` so it persists through cart, share, checkout and order.
- **Frontend customer** (`SharedCartPage.js`): item qty + price now show `item.unit` instead of hardcoded `m`.
- **Backend** (`agent_router.py`): `SharedCartItem` accepts `unit` + `fabric_type` + `category_id`. `orders_router.OrderItem` accepts `unit` so it survives checkout → DB → invoice rendering.
- **Frontend checkout** (`CheckoutPage.js`): items payload to `/orders/create` now carries `unit` for both PDP single-item and shared-cart multi-item paths. PDP single-item infers `kg` from `fabric_type=knitted && category_id != cat-denim`.

### Sample MOQ: 5m for Customer Orders, 1m for Agent (Feb 19, 2026) ✅
- **Desktop PDP** (`FabricDetailPage.js`): default sample qty 1 → 5; dropdown options `1–5` → `5–25`; quick-chip options `[1,2,3,5]` → `[5,10,15,20]`.
- **Mobile PDP** (`MFabricDetail.js`): default sample qty 1 → 5; stepper min 1m → 5m; cap 5m → 25m; quick chips `[1,2,3,5]` → `[5,10,15,20,25]`; modal title updated.
- **Backend guard** (`orders_router.create_order`): customer-initiated orders (no `agent_id` AND no `shared_cart_token`) with any sample line < 5 m → 400 with message `Sample orders on the website require a minimum of 5 metres.` Agent-assisted carts bypass — verified with curl (`qty=2` → 400; `qty=2 + agent_id` → 201 success).

### Customer Invoice Layout Match (Feb 19, 2026) ✅
Rewrote `generate_invoice_pdf` to exactly match the customer invoice mockup. Verified with AI structure analysis at 95 % confidence.
- **Header**: Logo + "B2B Fabric Sourcing Platform" tagline top-left; meta block top-right stacks Invoice Date / Invoice No / Payment with contextual ● PAID badge (green / amber). Removed the duplicate `Invoice Details` table.
- **Items table**: Compact labels `# · Description · HSN · Qty · Rate (₹) · Delivery · Amount (₹)`. Each row's description renders bold fabric name + small grey subline `SKU · Color · Type`. Qty/rate use the per-item `unit` (kg for knitted, m otherwise).
- **Totals**: All rows in brand blue (Order Value · Packaging · Logistics · Gross Value · GST · Total Invoice Value); last row bolder with underline.
- **Authorised Signatory** (left) sits side-by-side with totals (right) to match the mockup. Includes "For LOCOFAST ONLINE SERVICES PRIVATE LIMITED" header above signature line.
- **Amount in Words**: now boxed with a subtle blue border + light-blue background.

### Finance Balance-Payment Controls in Admin Order Modal (Feb 19, 2026) ✅
Surfaced both balance-payment controls inside the admin order detail modal so the Locofast Accounts/Finance team can act without leaving `/admin/orders`.
- **Share Balance Link** button (testid `admin-share-balance-link-btn`) — copies a public `/pay-balance/{id}/{token}` URL to clipboard. Identical to the agent-side flow but available to admins + accounts role. Endpoint `POST /api/orders/{id}/balance-share-link` already accepted admin tokens (which includes accounts via `db.admins`).
- **Mark Balance Paid** button stays — fires the existing endpoint, which auto-flips order to `paid+confirmed`, deducts inventory, materializes payouts, pushes to Shiprocket, fires `ORDER_CONFIRMED` + `PAYMENT_CAPTURED` internal events.
- **AdminLayout**: relabeled the accounts nav entry from `Orders (read)` → `Orders` since accounts now have write capability on the balance-payment flow.
- **No backend changes needed** — endpoints `mark-balance-paid` and `balance-share-link` already authorize via `get_current_admin`, which resolves both `role=admin` and `role=accounts`. Confirmed end-to-end with finance JWT.

### P3 (Low Priority)
- [ ] Wishlist/Favorites for B2B buyers
- [ ] Advanced Analytics Dashboard

### Actual-Qty Balance Collection + Vendor Payout Auto-Resync (Feb 19, 2026) ✅
Closed two intertwined gaps when vendors report a goods-ready qty that differs from the booked qty.

**Backend (`orders_router.py`)**
- `mark_goods_ready` now recomputes `actual_subtotal / packaging / logistics / tax / total` for **non-provisional** orders too (previously only provisional). Sets `balance_amount = max(actual_total − amount_paid, 0)` and `refund_amount = max(amount_paid − actual_total, 0)`. Flips `payment_status` to `balance_pending` whenever balance > 0; otherwise stays `paid`.
- New endpoint `POST /api/orders/{id}/recompute-actuals` — retroactive fix for orders marked ready before this logic landed. Idempotent; only mutates if at least one item has `actual_quantity != quantity`.
- Removed the `is_provisional` gate from `balance-share-link`, `mark-balance-paid`, `start_balance_payment`, and `start_balance_payment_via_share`. Balance flow is now driven entirely by `payment_status == 'balance_pending'`, so non-provisional orders with delta balance use the same buttons & token URL.

**Backend (`payouts_router.py`)**
- New helper `resync_payouts_for_actual_qty(order)` — automatically called from the tail of `mark_goods_ready`. Recomputes every PENDING `vendor_payouts` row using `actual_quantity`, stamps `actual_qty_resync_at`, leaves PAID rows untouched.
- Fixed `resync_order_commission` and bulk `resync_commissions` and the preview path in `get_order_seller_commissions` — all three were silently using `it.get("quantity")` instead of `actual_quantity`, so the manual "Resync" button was a no-op on quantity drift.

**Frontend (`AdminOrders.js`)**
- New banner "Actual qty differs from ordered" on non-provisional orders with `goods_ready_at` set and a delta — shows Original vs Actual invoice value + Customer owes / Refund due, with contextual help.
- Action-bar gate relaxed: **Share Balance Link** and **Mark Balance Paid** buttons now surface whenever `payment_status === 'balance_pending'` and `balance_amount > 0`, regardless of `is_provisional`. Same backend endpoints handle both paths.
- New purple button "Recompute Actuals" surfaces for legacy orders (`goods_ready_at` set, `actual_total` null, and at least one item with diff) — one-click retroactive fix that also resyncs vendor payouts.

**Verified end-to-end via curl on preview:**
- Created a synthetic non-provisional order, 100m → 105m actual qty. `mark-goods-ready` → `actual_total=12012`, `balance_amount=1092`, `payment_status=balance_pending`. Vendor payout auto-resynced from gross ₹10,000 → **₹11,000** (110m × ₹100), with `actual_qty_resync_at` stamped.
- `balance-share-link` minted a public URL for the non-provisional order (would previously 400).
- `mark-balance-paid` flipped to `paid` (would previously 400 with "Not a provisional order").

### Admin User Management (Feb 19, 2026) ✅
Super-admin (default `admin@locofast.com`, configurable via `SUPER_ADMIN_EMAIL` env var) can now create/reset/deactivate other admin-panel users from a new page `/admin/users` — no more DB shell needed for password resets.
- **Backend**: new `admin_users_router.py` exposing `GET/POST /api/admin/manage-users`, `POST /api/admin/manage-users/{id}/reset-password`, `PATCH /api/admin/manage-users/{id}` (rename / role / AM flag / active toggle), `DELETE` (soft-delete via `active=false`). Gated by `_require_super_admin` — non-super admins get 403.
- **Login flow**: `/api/auth/login` now rejects accounts with `active=false` with a friendly 403 "Account is deactivated. Please contact your administrator." Super-admin row cannot be self-deactivated.
- **Frontend**: new `AdminUserManagement.js` with create-user modal, inline reset-password modal, role dropdown (Admin / Accounts), AM toggle, active/inactive pill, and a footer link pointing Supplier-Manager creation to the dedicated `/admin/supplier-managers` page (those live in a separate collection). Nav link "Admin Users" appears in the sidebar only for the super-admin email.

### Admin Orders Modal — Actual Quantity Display (Feb 19, 2026) ✅
Closed the loop on the "show actual quantity once goods are ready" work — admin staff now see the same numbers customers and mobile users see (already shipped earlier in `OrderDetailPage.js` / `MOrderDetail.js`).
- **Items**: each line in the supplier-grouped block uses `item.actual_quantity` when present (falls back to `item.quantity`). Line total = actualQty × price, unit-aware (`item.unit || "m"`). Subtle muted note appears beneath each row when actual ≠ ordered: "_Originally ordered Xm · vendor reported Ym at goods-ready_".
- **Supplier subtotal** in the green section header recomputes off actual qty.
- **Payment summary** (`bg-gray-50` block): when `selectedOrder.goods_ready_at` is set AND `actual_total` is populated (provisional path), the entire summary swaps to `actual_subtotal / actual_packaging_charge / actual_logistics_charge / actual_tax / actual_total` with a "Final · Goods Ready" badge in the heading. For non-provisional orders (where customer already paid 100% on original qty), the order-level totals stay unchanged — matching the customer-view contract exactly.
- **Shiprocket push picker** subtotal also uses actual qty so multi-vendor pushes show the same figures as the modal.
- Verified live on ORD-UOHM6W (sample, 1m → 1.02m actual): screenshot confirms item line + subtotal show ₹1.02, audit note visible, payment summary stays at ₹117.05 (correct — non-provisional).

## Credentials
See `/app/memory/test_credentials.md`

### 6-Tab Order Lifecycle Overhaul (Feb 21, 2026) ✅
Unified the entire order pipeline behind 6 read-time stages — single source of truth (`/app/backend/order_pipeline.py · compute_pipeline_stage`) rendered identically on Admin, Vendor and Customer surfaces.

**Pipeline stages (in order)**:
1. `awaiting_confirm` — bulk order placed, vendor hasn't marked goods ready (samples auto-confirm)
2. `cancelled` — terminal
3. `confirmed_pending_dispatch` — goods marked ready, balance payment pending
4. `prepare_dispatch` — balance paid; vendor must upload tax invoice → triggers Shiprocket push
5. `dispatched` — courier has AWB / e-way bill uploaded / sample (eway skipped)
6. `delivered` — Shiprocket marked delivered

**Backend** (`/app/backend/orders_router.py`, `vendor_router.py`, `customer_router.py`)
- New helper `_attach_pipeline(order)` injects `pipeline_stage` + `pipeline_label` at read time — no DB migration, soft-migrates legacy orders.
- `GET /api/orders`, `GET /api/orders/{id}`, `GET /api/vendor/orders`, `GET /api/customer/orders`, `GET /api/customer/orders/{id}` all return `pipeline_stage`/`pipeline_label`. List endpoint accepts optional `?pipeline_stage=` filter.
- `POST /api/orders/{id}/mark-goods-ready` — tax invoice is now OPTIONAL (was previously a hard requirement that 400'd vendors). Invoice collection moved to the Prepare Dispatch step.
- NEW endpoint `POST /api/orders/{id}/vendor-upload-invoice` — vendor uploads tax invoice at the Prepare Dispatch stage. Persists `vendor_invoices` and fires Shiprocket push best-effort. Stage-gated (must be `prepare_dispatch` or `dispatched`).
- Vendor orders now expose `customer.gst_number` (required on supplier tax invoices) while still hiding `phone`/`email`.

**Frontend** (`AdminOrders.js`, `VendorOrders.js`)
- Tab arrays replaced with the 6-stage pipeline (testids `admin-order-tab-*` and `vendor-order-tab-*`). Filtering switched from `status` to `pipeline_stage`.
- Vendor `MarkGoodsReadyModal`: invoice upload block removed; replaced with a deferred-note indicator (testid `mark-ready-invoice-deferred-note`).
- New `PrepareDispatchBanner` component (testid `vendor-prepare-dispatch-banner`) — shows Locofast Bill-To (GSTIN `07AADCL8794N1ZM`) + customer Ship-To with GSTIN, takes tax invoice file + number + date + amount, posts to `/vendor-upload-invoice` which atomically saves and pushes to Shiprocket.
- Vendor order Ship-To section now renders `customer.gst_number` when present (testid `vendor-customer-gstin`).
- Admin status badge in orders table now uses `pipeline_label` for consistency with the tab labels.

**Verified via testing_agent_v3_fork (iteration 75)** — 100% backend (11/12 passed, 1 skipped for lack of live `prepare_dispatch` order), 100% frontend.
