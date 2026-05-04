"""Backfill denim fabric names to the convention
    "M1 M2 M3, Weave type, Weight, Color: Color name"

Data hygiene:
* Parses weave from legacy names (2/1 RHT, 3/1 LHT, Dobby, etc) and writes
  `weave_type` so future edits work.
* Cleans messy ounce strings ("9.5(+-3%)", "6.50 OZ (B/W)" → "9.5", "6.50").
* Normalises composition typos for the generated name ONLY (Poly→Polyester,
  Lyvra→Lycra). Original composition documents are left intact.
* Never overwrites a fabric name if a weave type cannot be detected — the row
  is reported as SKIPPED.

Usage
-----
    python scripts/backfill_denim_names.py            # dry-run
    python scripts/backfill_denim_names.py --apply    # write
"""
import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


WEAVE_PATTERNS = [
    (r"\b3\s*/\s*1\s*RHT\b", "3/1 RHT"),
    (r"\b3\s*/\s*1\s*LHT\b", "3/1 LHT"),
    (r"\b2\s*/\s*1\s*RHT\b", "2/1 RHT"),
    (r"\b2\s*/\s*1\s*LHT\b", "2/1 LHT"),
    (r"\b4\s*/\s*1\s*Satin\b", "4/1 Satin"),
    (r"\bHerringbone\b", "Herringbone"),
    (r"\bDobby\b", "Dobby"),
]

# Normalise only for the generated NAME string — composition docs untouched
MATERIAL_ALIASES = {
    "poly": "Polyester",
    "polyester": "Polyester",
    "cotton": "Cotton",
    "coitton": "Cotton",          # typo in DB
    "org cotton": "Organic Cotton",
    "org. cotton": "Organic Cotton",
    "lycra": "Lycra",
    "lyvra": "Lycra",             # typo in DB
    "spandex": "Spandex",
    "hemp": "Hemp",
    "recycled cotton": "Recycled Cotton",
    "viscose": "Viscose",
    "linen": "Linen",
}


def detect_weave(name: str) -> str:
    for rx, label in WEAVE_PATTERNS:
        if re.search(rx, name, re.IGNORECASE):
            return label
    return ""


def clean_ounce(ounce: str) -> str:
    """'9.5(+-3%)' -> '9.5'; '6.50 OZ (B/W)' -> '6.5'; '12 OZ' -> '12'."""
    if not ounce:
        return ""
    m = re.match(r"^\s*([\d.]+)", ounce)
    if not m:
        return ""
    num = m.group(1).rstrip(".")
    # Strip a trailing zero after a dot: '6.50' -> '6.5', but keep '10'
    if "." in num:
        num = num.rstrip("0").rstrip(".")
    return num


def normalise_material(raw: str) -> str:
    key = (raw or "").strip().lower()
    return MATERIAL_ALIASES.get(key, raw.strip().title())


def build_name(fabric: dict, weave: str) -> str:
    # Composition → top-3 materials in declared order
    mats = []
    for c in (fabric.get("composition") or []):
        name = normalise_material(c.get("material", ""))
        if name and name not in mats:
            mats.append(name)
        if len(mats) == 3:
            break

    mat_str = " ".join(mats)
    weight_unit = fabric.get("weight_unit", "gsm")
    if weight_unit == "ounce" and fabric.get("ounce"):
        weight_str = f"{clean_ounce(fabric['ounce'])}oz"
    elif fabric.get("gsm"):
        weight_str = f"{fabric['gsm']} GSM"
    else:
        weight_str = ""

    color = (fabric.get("color") or "").strip()
    parts = [mat_str, weave, weight_str]
    base = ", ".join(p for p in parts if p)
    if not base:
        return ""
    return f"{base}, Color: {color}" if color else base


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes to DB")
    args = ap.parse_args()

    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    fabrics = await db.fabrics.find({"category_id": "cat-denim"}, {"_id": 0}).to_list(500)
    print(f"=== {len(fabrics)} denim fabrics ===\n")

    updated = 0
    skipped = 0
    same = 0
    print(f"{'ID':<10} {'BEFORE':<42} {'AFTER':<64}")
    print("-" * 120)
    for f in fabrics:
        old_name = f.get("name", "")
        weave = f.get("weave_type") or detect_weave(old_name)
        if not weave:
            print(f"{f['id'][:8]:<10} {old_name[:40]:<42} -- SKIP (no weave detectable) --")
            skipped += 1
            continue
        new_name = build_name(f, weave)
        if not new_name:
            print(f"{f['id'][:8]:<10} {old_name[:40]:<42} -- SKIP (could not build name) --")
            skipped += 1
            continue
        if new_name == old_name and (f.get("weave_type") or "") == weave:
            print(f"{f['id'][:8]:<10} {old_name[:40]:<42} = unchanged")
            same += 1
            continue
        print(f"{f['id'][:8]:<10} {old_name[:40]:<42} → {new_name[:60]}")
        updated += 1

        if args.apply:
            cleaned_ounce = clean_ounce(f.get("ounce", "")) if f.get("weight_unit") == "ounce" else f.get("ounce", "")
            set_doc = {"name": new_name, "weave_type": weave}
            if cleaned_ounce and cleaned_ounce != f.get("ounce"):
                set_doc["ounce"] = cleaned_ounce
            await db.fabrics.update_one({"id": f["id"]}, {"$set": set_doc})

    print("\n=== Summary ===")
    print(f"  updated: {updated}")
    print(f"  skipped: {skipped}")
    print(f"  unchanged: {same}")
    if not args.apply:
        print("\nDRY-RUN — re-run with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main())
