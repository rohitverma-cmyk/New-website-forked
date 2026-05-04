"""
One-off migration endpoints. All are idempotent and admin-only.

Moved out of server.py on 2026-02 to keep the entrypoint lean.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
import re
import auth_helpers

router = APIRouter(prefix="/api", tags=["migrations"])
db = None


def set_db(database):
    global db
    db = database


# ==================== BULK APPEND WEIGHT TO NAME ====================
# Fixes the #1 data-hygiene issue: ~181 non-denim SKUs whose name omits the
# GSM. This endpoint appends ", <gsm> GSM" (or ", <oz>oz" for denim) to the
# name of every SKU whose weight is set in the DB but missing from the name.
#
# Idempotent — skips rows whose name already contains a weight pattern.

_WEIGHT_RX = re.compile(r"\d+(?:\.\d+)?\s*(GSM|oz|OZ)", re.IGNORECASE)


def _clean_ounce(ounce) -> str:
    if ounce is None or ounce == "":
        return ""
    m = re.match(r"^\s*([\d.]+)", str(ounce))
    if not m:
        return ""
    num = m.group(1).rstrip(".")
    if "." in num:
        num = num.rstrip("0").rstrip(".")
    return num


def _build_new_name(fabric: dict, cat_name: str) -> str | None:
    """Return the new name with weight appended, or None if we can't/shouldn't."""
    name = (fabric.get("name") or "").strip()
    if not name:
        return None
    # Already has weight — skip (idempotent)
    if _WEIGHT_RX.search(name):
        return None

    weight_unit = fabric.get("weight_unit")
    # Prefer the unit that matches the fabric's declared weight_unit
    if weight_unit == "ounce" and fabric.get("ounce"):
        oz = _clean_ounce(fabric["ounce"])
        if oz:
            return f"{name}, {oz}oz"
    if fabric.get("gsm"):
        gsm = fabric["gsm"]
        try:
            gsm = int(gsm) if float(gsm).is_integer() else gsm
        except (TypeError, ValueError):
            pass
        return f"{name}, {gsm} GSM"
    # Fallback — denim with ounce but weight_unit not set
    if cat_name == "Denim" and fabric.get("ounce"):
        oz = _clean_ounce(fabric["ounce"])
        if oz:
            return f"{name}, {oz}oz"
    return None


@router.post("/migrate/append-weight-to-names")
async def append_weight_to_names(
    apply: bool = Query(False, description="false = dry-run preview, true = write changes"),
    category_id: str | None = Query(None, description="Restrict to a single category"),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Append `, <gsm> GSM` (or `, <oz>oz`) to every SKU name whose weight is
    set in the DB but missing from the name. Idempotent.
    """
    cats = await db.categories.find({}, {"_id": 0}).to_list(200)
    cat_by_id = {c["id"]: c["name"] for c in cats}

    q = {}
    if category_id:
        q["category_id"] = category_id
    fabrics = await db.fabrics.find(q, {"_id": 0}).to_list(5000)

    plan = []
    for f in fabrics:
        new_name = _build_new_name(f, cat_by_id.get(f.get("category_id", ""), ""))
        if not new_name or new_name == f.get("name"):
            continue
        plan.append({
            "id": f.get("id", ""),
            "old_name": f.get("name", ""),
            "new_name": new_name,
            "category": cat_by_id.get(f.get("category_id", ""), "?"),
            "seller": f.get("seller_company", ""),
        })

    if not apply:
        return {
            "apply": False,
            "status": "dry_run",
            "total_scanned": len(fabrics),
            "will_update": len(plan),
            "preview": plan[:25],
        }

    updated = 0
    for row in plan:
        res = await db.fabrics.update_one(
            {"id": row["id"]},
            {"$set": {"name": row["new_name"]}},
        )
        if res.modified_count:
            updated += 1

    return {
        "apply": True,
        "status": "applied",
        "total_scanned": len(fabrics),
        "updated": updated,
        "preview": plan[:25],
    }


@router.post("/migrate/slugs")
async def migrate_slugs(admin=Depends(auth_helpers.get_current_admin)):
    """One-time migration: generate slugs for all fabrics that don't have one."""
    from slug_utils import generate_slug
    fabrics = await db.fabrics.find(
        {'$or': [{'slug': {'$exists': False}}, {'slug': ''}, {'slug': None}]},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(10000)
    count = 0
    for f in fabrics:
        slug = generate_slug(f.get('name', 'fabric'), f['id'])
        await db.fabrics.update_one({'id': f['id']}, {'$set': {'slug': slug}})
        count += 1
    return {'migrated': count}


# ==================== MIGRATION: Dissolve "Blended Fabrics" ====================
# Reassigns every fabric in the Blended category to the category whose material
# has the highest percentage in its composition. Falls back to parsing the
# fabric name when composition is empty. Deletes Blended when empty.

_BLENDED_MAT_MAP = [
    ("cotton",    "Cotton Fabrics"),
    ("coitton",   "Cotton Fabrics"),       # seen typo in prod/preview
    ("org cotton","Cotton Fabrics"),
    ("polyester", "Polyester Fabrics"),
    ("poly",      "Polyester Fabrics"),
    ("pc blend",  "Polyester Fabrics"),    # P/C → Polyester is dominant
    ("p/c",       "Polyester Fabrics"),
    ("viscose",   "Viscose"),
    ("rayon",     "Viscose"),
    ("linen",     "Linen"),
    ("hemp",      "Sustainable Fabrics"),
    ("recycled",  "Sustainable Fabrics"),
    ("organic",   "Sustainable Fabrics"),
]


def _route_material(material: str):
    m = (material or "").strip().lower()
    if not m:
        return None
    for key, target in _BLENDED_MAT_MAP:
        if key in m:
            return target
    return None


def _dominant_target(comp, name: str):
    """Return (target_category_name, reason_str)."""
    if isinstance(comp, list) and comp:
        ranked = sorted(comp, key=lambda x: float(x.get("percentage") or 0), reverse=True)
        for item in ranked:
            mat = item.get("material") or ""
            tgt = _route_material(mat)
            if tgt:
                return tgt, f"{mat.strip()} {item.get('percentage')}%"
        return None, "no known material in composition"
    # Name fallback
    low = (name or "").lower()
    best, best_pos = None, 10**9
    for key, target in _BLENDED_MAT_MAP:
        pos = low.find(key)
        if pos != -1 and pos < best_pos:
            best, best_pos = target, pos
    if best:
        return best, "(inferred from name)"
    return None, "no composition + no hint in name"


@router.post("/migrate/blended")
async def migrate_blended(
    apply: bool = Query(False),
    mode: str = Query("smart", description="'smart' (auto-route by material) or 'all_to_linen' (bulk move)"),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Dissolve the 'Blended Fabrics' category.
    - Dry run: POST /api/migrate/blended (apply=false) → returns the plan.
    - Apply:   POST /api/migrate/blended?apply=true   → runs and deletes Blended.
    - mode=all_to_linen: bulk-move every blended fabric to Linen.
    Idempotent — safe to re-run.
    """
    cats = await db.categories.find({}, {"_id": 0}).to_list(length=500)
    by_name = {c["name"]: c for c in cats}
    blended = by_name.get("Blended Fabrics")
    if not blended:
        return {
            "apply": apply, "mode": mode, "status": "noop",
            "message": "No 'Blended Fabrics' category present — nothing to migrate.",
            "plan": [], "summary": {},
        }

    linen_created = False
    if "Linen" not in by_name:
        linen_doc = {
            "id": "cat-linen",
            "name": "Linen",
            "slug": "linen",
            "description": "Natural linen fabrics — breathable, durable, elegant.",
            "image_url": "",
            "fabric_count": 0,
        }
        if apply:
            await db.categories.insert_one(linen_doc.copy())
            linen_created = True
        by_name["Linen"] = linen_doc

    blended_id = blended["id"]
    fabrics = await db.fabrics.find({"category_id": blended_id}, {"_id": 0}).to_list(length=5000)

    plan, summary, stays = [], {}, 0
    for f in fabrics:
        if mode == "all_to_linen":
            target_name = "Linen"
            reason = "bulk-move (all_to_linen mode)"
        else:
            target_name, reason = _dominant_target(f.get("composition"), f.get("name", ""))
        target = by_name.get(target_name) if target_name and target_name != "Blended Fabrics" else None
        plan.append({
            "id": f["id"], "name": f.get("name", ""),
            "target": target_name if target else "-- stays --",
            "reason": reason, "target_exists": bool(target),
        })
        if target:
            summary[target_name] = summary.get(target_name, 0) + 1
        else:
            stays += 1
    summary["__stays_in_blended"] = stays

    if not apply:
        return {
            "apply": False, "status": "dry_run",
            "blended_fabrics_total": len(fabrics),
            "summary": summary,
            "linen_will_be_created": "Linen" not in [c["name"] for c in cats],
            "plan": plan,
        }

    updated = 0
    for f in fabrics:
        if mode == "all_to_linen":
            target_name = "Linen"
        else:
            target_name, _ = _dominant_target(f.get("composition"), f.get("name", ""))
        if not target_name or target_name == "Blended Fabrics":
            continue
        target = by_name.get(target_name)
        if not target:
            continue
        res = await db.fabrics.update_one(
            {"id": f["id"]},
            {"$set": {"category_id": target["id"], "category_name": target_name}},
        )
        if res.modified_count:
            updated += 1

    counts_after = {}
    for cat_name in list(summary.keys()) + ["Blended Fabrics"]:
        if cat_name.startswith("__"):
            continue
        cat = by_name.get(cat_name)
        if not cat:
            continue
        c = await db.fabrics.count_documents({"category_id": cat["id"]})
        await db.categories.update_one({"id": cat["id"]}, {"$set": {"fabric_count": c}})
        counts_after[cat_name] = c

    deleted_blended = False
    remaining = await db.fabrics.count_documents({"category_id": blended_id})
    if remaining == 0:
        r = await db.categories.delete_one({"id": blended_id})
        deleted_blended = bool(r.deleted_count)

    return {
        "apply": True, "status": "applied",
        "blended_fabrics_total": len(fabrics),
        "reassigned": updated, "linen_created": linen_created,
        "summary": summary, "counts_after": counts_after,
        "blended_deleted": deleted_blended, "blended_remaining": remaining,
    }


@router.post("/migrate/knits")
async def migrate_knits(
    apply: bool = Query(False),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Dissolve the 'Knits' category → moves fabrics to 'Polyester Fabrics', then deletes Knits."""
    cats = await db.categories.find({}, {"_id": 0}).to_list(length=500)
    by_name = {c["name"]: c for c in cats}
    knits = by_name.get("Knits")
    if not knits:
        return {"apply": apply, "status": "noop", "message": "No 'Knits' category present.",
                "knits_fabrics_total": 0, "reassigned": 0, "knits_deleted": False}

    polyester = by_name.get("Polyester Fabrics")
    if not polyester:
        raise HTTPException(status_code=400, detail="Target category 'Polyester Fabrics' not found.")

    knits_id = knits["id"]
    polyester_id = polyester["id"]
    fabrics = await db.fabrics.find({"category_id": knits_id}, {"_id": 0}).to_list(length=5000)

    if not apply:
        return {"apply": False, "status": "dry_run",
                "knits_fabrics_total": len(fabrics),
                "target": "Polyester Fabrics",
                "plan": [{"id": f["id"], "name": f.get("name", ""), "target": "Polyester Fabrics"} for f in fabrics]}

    res = await db.fabrics.update_many(
        {"category_id": knits_id},
        {"$set": {"category_id": polyester_id, "category_name": "Polyester Fabrics"}},
    )
    updated = res.modified_count

    poly_count = await db.fabrics.count_documents({"category_id": polyester_id})
    await db.categories.update_one({"id": polyester_id}, {"$set": {"fabric_count": poly_count}})
    knits_remaining = await db.fabrics.count_documents({"category_id": knits_id})

    deleted_knits = False
    if knits_remaining == 0:
        r = await db.categories.delete_one({"id": knits_id})
        deleted_knits = bool(r.deleted_count)

    return {"apply": True, "status": "applied",
            "knits_fabrics_total": len(fabrics), "reassigned": updated,
            "polyester_count_after": poly_count,
            "knits_remaining": knits_remaining, "knits_deleted": deleted_knits}


@router.post("/migrate/greige")
async def migrate_greige(
    apply: bool = Query(False),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Delete the 'Greige' category (now used as a pattern, not a category).

    Will refuse to delete if any fabrics still reference it — returns the list
    so the admin can re-classify them before re-running with ?apply=true.
    """
    greige = await db.categories.find_one({"name": "Greige"}, {"_id": 0})
    if not greige:
        return {"apply": apply, "status": "noop",
                "message": "No 'Greige' category present.", "greige_deleted": False}

    greige_id = greige["id"]
    fabrics = await db.fabrics.find(
        {"category_id": greige_id}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(length=5000)

    if not apply:
        return {"apply": False, "status": "dry_run",
                "greige_id": greige_id,
                "fabrics_in_greige": len(fabrics),
                "fabrics": fabrics[:20],
                "deletable": len(fabrics) == 0,
                "message": ("Safe to delete — no fabrics in Greige."
                            if len(fabrics) == 0
                            else f"{len(fabrics)} fabric(s) still in Greige. Re-classify them first.")}

    if len(fabrics) > 0:
        raise HTTPException(status_code=400,
            detail=f"Cannot delete Greige — {len(fabrics)} fabric(s) still reference it.")

    r = await db.categories.delete_one({"id": greige_id})
    return {"apply": True, "status": "applied", "greige_deleted": bool(r.deleted_count)}


# ==================== BACKFILL DISPATCH TIMELINE ====================
# Maps every fabric's free-text `dispatch_timeline` into the new preset list:
#   ready_stock   → "1-2 days" | "3-5 days" | "6-9 days" | "10-14 days"
#   made_to_order → "15 days" .. "75 days" (5-day increments)
#
# Strategy: parse leading numeric value (or range midpoint) from the string,
# choose the nearest preset bucket, and update the row. Idempotent — fabrics
# already on a valid preset are skipped (no DB write, counted as "ok").
#
# Defaults applied when value is missing/unparseable:
#   ready_stock   → "3-5 days"
#   made_to_order → "30 days"

READY_STOCK_PRESETS = [
    {"value": "1-2 days",   "lo": 1,  "hi": 2,  "mid": 1.5},
    {"value": "3-5 days",   "lo": 3,  "hi": 5,  "mid": 4.0},
    {"value": "6-9 days",   "lo": 6,  "hi": 9,  "mid": 7.5},
    {"value": "10-14 days", "lo": 10, "hi": 14, "mid": 12.0},
]
MTO_PRESETS = [
    {"value": f"{d} days", "mid": float(d)}
    for d in [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]
]
READY_STOCK_VALUES = {p["value"] for p in READY_STOCK_PRESETS}
MTO_VALUES = {p["value"] for p in MTO_PRESETS}

_NUM_RX = re.compile(r"(\d+(?:\.\d+)?)")


def _parse_days(text: str):
    """Extract a numeric "days" estimate from free-text dispatch strings.

    Examples:
      "7-10 days"   -> 8.5  (midpoint)
      "30 days"     -> 30.0
      "2 weeks"     -> 14.0
      "1 month"     -> 30.0
      "Ready Stock" -> None
    """
    if not text:
        return None
    s = str(text).strip().lower()
    nums = [float(m) for m in _NUM_RX.findall(s)]
    if not nums:
        return None
    base = (nums[0] + nums[1]) / 2 if len(nums) >= 2 else nums[0]
    if "week" in s:
        base *= 7
    elif "month" in s:
        base *= 30
    elif "hour" in s or "hr" in s:
        base /= 24.0
    return base


def _bucket_ready_stock(days: float) -> str:
    return min(READY_STOCK_PRESETS, key=lambda p: abs(p["mid"] - days))["value"]


def _bucket_mto(days: float) -> str:
    return min(MTO_PRESETS, key=lambda p: abs(p["mid"] - days))["value"]


def _target_dispatch(stock_type: str, current: str):
    """Decide the target preset value. Returns (new_value, reason)."""
    is_mto = stock_type == "made_to_order"

    # Already on a valid preset → no-op
    if is_mto and current in MTO_VALUES:
        return None, "ok"
    if not is_mto and current in READY_STOCK_VALUES:
        return None, "ok"

    days = _parse_days(current)
    if days is None:
        # No usable signal — apply category default
        return ("30 days" if is_mto else "3-5 days"), "default"

    # If MTO but parsed days is < 15 (suspiciously fast for production),
    # bump to the smallest MTO bucket; if ready_stock but days > 14, push
    # to the longest ready bucket. We do NOT cross-flip stock_type here —
    # that's a vendor decision, not a migration decision.
    if is_mto:
        if days < 15:
            days = 15
        return _bucket_mto(days), f"mapped_from:{current}"
    if days > 14:
        days = 14
    return _bucket_ready_stock(days), f"mapped_from:{current}"


@router.post("/migrations/backfill-dispatch-timeline")
async def backfill_dispatch_timeline(
    apply: bool = Query(False, description="False = dry-run preview only"),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Map every fabric's dispatch_timeline to one of the new presets.

    Run with `?apply=false` first to preview the diff, then `?apply=true`.
    Idempotent — re-running after apply is a no-op.
    """
    fabrics = await db.fabrics.find(
        {},
        {"_id": 0, "id": 1, "name": 1, "stock_type": 1, "dispatch_timeline": 1},
    ).to_list(10000)

    changes, defaults, ok, samples = 0, 0, 0, []
    bulk_ops = []
    for f in fabrics:
        stock_type = f.get("stock_type") or "ready_stock"
        current = (f.get("dispatch_timeline") or "").strip()
        new_val, reason = _target_dispatch(stock_type, current)
        if new_val is None:
            ok += 1
            continue
        if reason == "default":
            defaults += 1
        else:
            changes += 1
        if len(samples) < 25:
            samples.append({
                "id": f.get("id"),
                "name": f.get("name"),
                "stock_type": stock_type,
                "from": current,
                "to": new_val,
                "reason": reason,
            })
        if apply:
            bulk_ops.append({"id": f.get("id"), "new": new_val})

    if apply and bulk_ops:
        # No bulk_write for arbitrary $set on different values — one-by-one is fine
        # at this scale (≤200 docs).
        for op in bulk_ops:
            await db.fabrics.update_one(
                {"id": op["id"]},
                {"$set": {"dispatch_timeline": op["new"]}},
            )

    return {
        "apply": apply,
        "status": "applied" if apply else "preview",
        "scanned": len(fabrics),
        "already_ok": ok,
        "mapped_from_text": changes,
        "defaulted_blank_or_unparseable": defaults,
        "total_to_update": changes + defaults,
        "sample_changes": samples,
    }
