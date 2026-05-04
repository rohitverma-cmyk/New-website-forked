# Locofast SKU Metadata Fix Sheet

**Generated**: Feb 2026 · **Total fabrics audited**: 194 · **Source**: live preview DB

> This document lists every format deviation found in the current catalog. Each section shows **what's wrong**, **how to fix it**, and **which SKU IDs are affected**. Give each admin user a slice (by seller / by category / by section) and work through the checklist.
>
> Supporting data dumps (full lists, copy-pasteable IDs):
> - `/app/memory/sku_audit.json`
> - `/app/memory/sku_audit_extra.json`
> - `/app/memory/sku_duplicate_groups.json`

---

## 📐 The Master Name Format

Every SKU name must follow this pattern:

### Denim
`<Material(s)>, <Weave>, <Weight>, Color: <ColorName>`
Example: `Cotton Polyester Lycra, 3/1 RHT, 12.5oz, Color: Indigo x White`

### Non-Denim
`<Material(s)> <Construction>, <GSM>` *(Color optional if multi-color)*
Example: `Cotton Poplin, 130 GSM` · `Organic Cotton Canvas, 280 GSM`

### Casing & Punctuation Rules
- **Title Case** for every word in the name (`cotton interlock` ❌ → `Cotton Interlock` ✅)
- **Weave** uses forward-slash: `3/1 RHT`, `2/1 LHT`, `4/1 Satin` (never `3\1`, never `3/1Twill` with no space)
- **Weight** format: `130 GSM` (space before unit) or `12.5oz` (no space, lowercase)
- **Apostrophes** on yarn counts: use `40x40` not `40's x 40's`
- **No double spaces**, no trailing spaces, no tabs
- **Material names** — only from the canonical list (below). `Poly` → `Polyester`, `Lyvra` → `Lycra`, `Cottton` → `Cotton`.

### Canonical Materials (Admin > Compositions)
`Cotton`, `Organic Cotton`, `Recycled Cotton`, `Polyester`, `Recycled Polyester`, `Viscose`, `Lyocell`, `Modal`, `Lycra`, `Linen`, `Hemp`, `Nylon`, `Wool`, `Silk`, `Bamboo`, `Acrylic`, `Cashmere`, `Lurex`, `Jute`, `Rayon`, `Spandex`, `Elastane`, `Tencel`, `Cupro`, `Ramie`

---

## 🔴 P0 — Blocking issues (must fix first)

### 1. Composition stored as plain string instead of array (9 SKUs)
These rows store composition as `"100% Cotton"` instead of `[{"material": "Cotton", "percentage": 100}]`. The Admin form's composition dropdown cannot read/edit them.

**Action**: Open each SKU in Admin → Composition section → delete the string row → add materials via the dropdown with percentages summing to 100. Save.

| SKU ID | Name | Current value |
|---|---|---|
| `87ec9eff` | Organic Cotton Canvas | `100% Organic Cotton` |
| `96446143` | Cotton Single Jersey | `95% Cotton, 5% Elastane` |
| `140bc5e0` | PC Blend Twill 65/35 | `65% Polyester, 35% Cotton` |
| `5f6c6a6e` | Stretch Denim 10oz | `98% Cotton, 2% Spandex` |
| `b48164be` | Recycled Polyester Taffeta | `100% Recycled Polyester` |
| `1ccd18c8` | Tencel Lyocell Sateen | `100% Tencel Lyocell` → split into `100% Tencel` or `100% Lyocell` (they're the same; use `Lyocell`) |
| `3a5ae305` | Test Vendor Fabric - Pending Approval | `100% Cotton` |
| `f620c93c` | Test Vendor Fabric - Pending Approval | `100% Cotton` |
| `cdcf2654` | Demo Vendor Fabric for Approval | `100% Cotton` |

### 2. Denim SKUs missing weave / ounce / color in name (3 SKUs)
Format: `<Materials>, <Weave>, <Weight>oz, Color: <Color>`

| SKU ID | Current Name | Fix To |
|---|---|---|
| `5f6c6a6e` | `Stretch Denim 10oz` | Open SKU → set weave (e.g. `3/1 RHT`), set ounce=`10`, set color → save. Result: `Cotton Spandex, 3/1 RHT, 10oz, Color: Indigo` |
| `fcd9b5a4` | `Cotton Denim DE-1341` | Open SKU → add weave, ounce, composition, color. Move sales code `DE-1341` to `fabric_code`, not name. |
| `cb979efa` | `Cotton Poly Denim DE-1353` | Same as above. Also fix `Poly` → `Polyester` in composition. |

### 3. Name casing issues (1 SKU)
| SKU ID | Wrong | Right |
|---|---|---|
| `f5a9e57d` | `cotton interlock` | `Cotton Interlock, <GSM> GSM` |

### 4. Backslash in weave notation (4 SKUs)
Replace `\` with `/` and ensure space before the weave.

| SKU ID | Wrong | Right |
|---|---|---|
| `2a2b6f85` | `Cotton 3\1 Twill` | `Cotton, 3/1 Twill, 200 GSM` |
| `39e78c38` | `Cotton 2\2Twill` | `Cotton, 2/2 Twill, <GSM> GSM` |
| `fdf70ae2` | `Cotton Lycra 4\1 Satin` | `Cotton Lycra, 4/1 Satin, <GSM> GSM` |
| `a57d84de` | `Cotton 3\1 Twill` | `Cotton, 3/1 Twill, 381 GSM` |

### 5. "Poly" → "Polyester" in names (4 SKUs)
| SKU ID | Wrong | Right |
|---|---|---|
| `5d723f9b` | `Cotton Poly Poplin Yarn Dyed` | `Cotton Polyester Poplin Yarn Dyed, <GSM> GSM` |
| `cb979efa` | `Cotton Poly Denim DE-1353` | See item 2 above |
| `0014aa13` | `Cotton Poly Ripstop` | `Cotton Polyester Ripstop, <GSM> GSM` |
| `2126a962` | `Cotton Poly Ripstop` | `Cotton Polyester Ripstop, <GSM> GSM` (dedupe with 0014aa13 — see §8) |

### 6. Apostrophe noise in yarn counts (3 SKUs)
Replace `40's x 40's` → `40x40` (or move count to a dedicated `count` field if your admin form has one).

| SKU ID | Wrong | Right |
|---|---|---|
| `cae6f6dc` | `Voile 80's X 80's` | `Cotton Voile, 80x80, <GSM> GSM` |
| `8ad86007` | `Cotton Poplin 40's x 40's` | `Cotton Poplin, 40x40, <GSM> GSM` |
| `1afc0439` | `Cotton Poplin 40's X 40's` | Dedupe with `8ad86007` (same product) |

### 7. Double-spaces in names (3 SKUs)
| SKU ID | Wrong | Right |
|---|---|---|
| `3801be45` | `Cotton  AOP` | `Cotton AOP, <GSM> GSM` |
| `bf63e3c4` | `Cotton  Seersuckers Stripes` | `Cotton Seersucker Stripes, <GSM> GSM` |
| `e8190f45` | `Cotton Yarn Dyed Checks  Oxford` | `Cotton Yarn Dyed Oxford Checks, <GSM> GSM` |

---

## 🟡 P1 — Major hygiene (high user impact)

### 8. Duplicate names — need GSM/weight in name to differentiate (29 groups, 57 extra rows)
These are **not** true duplicates — they're different GSM variants of the same construction. Rather than deleting, **append the GSM/weight to the name** so each card is uniquely identifiable.

**Top offenders** (full list in `/app/memory/sku_duplicate_groups.json`):

| Group | Count | GSMs | Action |
|---|---|---|---|
| `Cotton` (no seller) | 8 | 62, 86, 106, 108, 112, 120, 130, 140 | Rename each to `Cotton, <GSM> GSM` |
| `Cotton Yarn Dyed` (no seller) | 8 | 98, 113, 115, 127, 128, 132, 147, 150 | Rename each to `Cotton Yarn Dyed, <GSM> GSM` |
| `Cotton Poplin` | 4 | 120, 130, 136, 140 | Rename each to `Cotton Poplin, <GSM> GSM, <count if set>` |
| `Cotton AOP` | 4 | 70, 73, 84, 85 | Rename each to `Cotton AOP, <GSM> GSM` |
| `Cotton Poplin AOP` | 4 | 114, 124, 130, 142 | Rename each to `Cotton Poplin AOP, <GSM> GSM` |
| `Cotton Stripes` | 4 | 62, 106, 140, 180 | Rename each to `Cotton Stripes, <GSM> GSM` |
| `Cotton Ripstop` | 3 | 185, 205, 250 | Rename each to `Cotton Ripstop, <GSM> GSM` |
| `Polyester Single Jersey` | 3 | 120, 165, 179 | Rename each to `Polyester Single Jersey, <GSM> GSM` |
| `Cotton Double Cloth` | 3 | 115, 115, 120 | 2 with GSM=115 are true duplicates — merge/delete one |
| `Cotton Slub AOP` | 3 | 110, 130, 150 | Rename each to `Cotton Slub AOP, <GSM> GSM` |
| `Cotton Yarn Dyed Stripes` | 3 | 62, 121, 130 | Rename each to `Cotton Yarn Dyed Stripes, <GSM> GSM` |
| `Cotton Yarn Dyed 2/2 Twill` | 3 | 111, 126, 147 | Rename each to `Cotton Yarn Dyed, 2/2 Twill, <GSM> GSM` |
| `Cotton Lycra Ripstop` | 3 | 167, 182, 209 | Rename each to `Cotton Lycra Ripstop, <GSM> GSM` |
| `Cotton 3\1 Twill` | 2 | 200, 381 | Fix backslash + append GSM (see §4) |

**Process**:
1. Open each SKU in Admin > Fabrics
2. Append `, <GSM> GSM` to the name (or the weight/count differentiator that's unique to that row)
3. If two rows end up identical even after adding GSM → delete the duplicate, keep the one with more complete data (images, rate, stock)

### 9. Missing HSN code (194 SKUs — every SKU in the DB)
No SKU currently has an HSN code. This will break GST invoicing.

**Action**: Bulk-update via Admin > Fabrics. HSN codes by category:
- **Denim**: `5209`
- **Cotton wovens** (poplin, twill, ripstop, voile, canvas, oxford): `5208` or `5209` (depending on weight)
- **Cotton knits** (jersey, interlock, rib): `6006`
- **Polyester wovens**: `5407`
- **Polyester knits**: `6004` or `6006`
- **Linen**: `5309`
- **Hemp/Jute**: `5311`
- **Blended**: route to the dominant-fibre HSN above

Assign to a single person with a GST consultant's input for the borderline weights.

### 10. Missing MOQ (11 SKUs)
| SKU IDs | Suggested MOQ |
|---|---|
| `b04afb21`, `2ebbd41d` (Cotton Slub AOP) | `1500 MTR` |
| `ae094801`, `a42edbe6` (Cotton Lycra 3/1 Twill) | `1500 MTR` |
| `9901dbdb`, `702ae7ff` (Cotton 3/1 Twill) | `1500 MTR` |
| `c81d27c8`, `830d7189` (Cotton Yarn Dyed) | `1500 MTR` |
| `ac48e257` (Polyester Single Jersey) | `150 KG` |
| `ef5943c4` (Polyester Dot Knit) | `150 KG` |
| `077f547c` (Cotton, 2/1 RHT, 6.75oz) | `500 MTR` |

### 11. Missing weight in name (181 SKUs — non-denim)
Every non-denim SKU must have `, <GSM> GSM` at the end of the name.

**Example bulk-rename pattern**:
- `Cotton Poplin` → `Cotton Poplin, 130 GSM`
- `Cotton Ripstop 4MM` → `Cotton Ripstop 4MM, 205 GSM`
- `Recycled Polyester Taffeta` → `Recycled Polyester Taffeta, <GSM> GSM`

**Hint**: The `gsm` field is already filled for all 181. Just copy that into the name.

### 12. Missing width (3 SKUs)
| SKU ID | Name | Suggested width |
|---|---|---|
| `89dcdf81` | Cotton Ripstop | `58"` or `54"` — verify with mill |
| `5bcd3713` | Cotton Ripstop 4MM | `58"` or `54"` — verify with mill |
| `8ad86007` | Cotton Poplin 40's x 40's | `58"` |

### 13. Missing images (1 SKU)
| SKU ID | Name | Action |
|---|---|---|
| `cdcf2654` | Demo Vendor Fabric for Approval | Either upload an image or delete if no longer needed (it's marked demo). |

### 14. Missing fabric_code (1 SKU)
| SKU ID | Name | Action |
|---|---|---|
| `cdcf2654` | Demo Vendor Fabric for Approval | Generate fabric_code via Admin or delete. |

### 15. Denim SKU missing `ounce` (1 SKU)
| SKU ID | Name | Action |
|---|---|---|
| `5f6c6a6e` | Stretch Denim 10oz | Set `ounce: 10`, set `weight_unit: ounce`. Already in name. |

---

## 🟢 P2 — Polish (low urgency)

### 16. "Test Vendor Fabric" / "Demo Vendor Fabric" SKUs
3 test SKUs still live in the catalog and surface on brand/public pages:
- `3a5ae305`, `f620c93c` — `Test Vendor Fabric - Pending Approval`
- `cdcf2654` — `Demo Vendor Fabric for Approval`

**Action**: Either mark `status='rejected'` or hard-delete from Admin > Fabrics.

### 17. Inconsistent MOQ suffix (`1500 MTR` vs `1500MTR`)
Standardize to `1500 MTR` (with space) across all SKUs for readability.

### 18. Seller company name truncation
Some rows show seller as blank `| ` — these likely have `seller_id` set but `seller_company` field missing. Run Admin > Sellers > refresh snapshots or manually copy company name into the fabric's `seller_company`.

**Affected** (18 SKUs): all rows in the `cotton` and `cotton yarn dyed` duplicate groups where seller column showed blank.

---

## 🟢 P3 — Nice-to-have

### 19. Populate `article_id` on genuine multi-vendor duplicates
If two sellers both stock **the exact same article**, assign them the same `article_id`. The Buy Box will then auto-group them and show the cheapest vendor with a "+N more vendors" badge.

**How to identify same article**: same category + same composition + same construction + same GSM/ounce + same width. Generate a fresh UUID per article, assign to all rows.

---

## ✅ Fix Workflow Suggestion

Split work across 3 data admins:

| Admin | Scope | ~Rows | Est. effort |
|---|---|---|---|
| A | P0 items §1-§7 (formats, composition, denim) | ~25 | 1 day |
| B | P1 item §8 (duplicates — rename with GSM) | ~57 | 2 days |
| C | P1 items §9-§15 (HSN, MOQ, width, weight-in-name) | ~200 | 3 days |

After each admin finishes, re-run the audit:
```bash
cd /app/backend && python3 scripts/audit_sku_formats.py
```
*(I can wire up this script on request — it's the same query block used to generate this sheet.)*

---

## 📎 Appendix — Quick reference

### Before / After rename examples

| Before | After |
|---|---|
| `cotton interlock` | `Cotton Interlock, 220 GSM` |
| `Cotton 3\1 Twill` | `Cotton, 3/1 Twill, 200 GSM` |
| `Cotton Poly Ripstop` | `Cotton Polyester Ripstop, 185 GSM` |
| `Voile 80's X 80's` | `Cotton Voile, 80x80, 110 GSM` |
| `Cotton Poplin 40's x 40's` | `Cotton Poplin, 40x40, 130 GSM` |
| `Cotton  AOP` | `Cotton AOP, 84 GSM` |
| `Stretch Denim 10oz` | `Cotton Spandex, 3/1 RHT, 10oz, Color: Indigo` |
| `Cotton Denim DE-1341` | `Cotton, 3/1 RHT, 12oz, Color: Indigo` (move `DE-1341` into `fabric_code`) |
| `100% Organic Cotton` (composition string) | `[{"material": "Organic Cotton", "percentage": 100}]` |
