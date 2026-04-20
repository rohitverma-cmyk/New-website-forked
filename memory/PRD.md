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

## Backlog

### P1 (High Priority)
- [ ] Multi-Color SKU System: Add color variants per fabric with separate photos and inventory per color

### P2 (Medium Priority)
- [ ] SEO-Friendly Fabric URLs (slugs)
- [ ] server.py refactoring into separate routers

### P3 (Low Priority)
- [ ] Wishlist/Favorites
- [ ] Advanced Analytics Dashboard

## Credentials
See `/app/memory/test_credentials.md`
