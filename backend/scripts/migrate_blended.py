"""One-shot migration: move fabrics out of "Blended Fabrics" into the category
whose material has the highest percentage in their composition.

Rules
-----
* Composition is a list of { material, percentage } on each fabric.
* "Dominant material" = the entry with the highest percentage (ties → first).
* Name normalisation (for routing only — we do NOT edit composition data):
    cotton variants      -> Cotton Fabrics
    polyester / poly     -> Polyester Fabrics
    viscose / rayon      -> Viscose
    linen                -> Linen               (created if missing)
    hemp / recycled ...  -> Sustainable Fabrics
    everything else      -> stays in Blended Fabrics

Usage
-----
  python migrate_blended.py            # DRY-RUN (default, no writes)
  python migrate_blended.py --apply    # actually writes category_id
"""
import asyncio
import os
import sys
import argparse
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


NORMALISE = [
    ("cotton",    "Cotton Fabrics"),
    ("coitton",   "Cotton Fabrics"),      # typo seen in DB
    ("org cotton","Cotton Fabrics"),
    ("polyester", "Polyester Fabrics"),
    ("poly",      "Polyester Fabrics"),
    ("pc blend",  "Polyester Fabrics"),   # PC = Polyester/Cotton, P is dominant
    ("p/c",       "Polyester Fabrics"),
    ("viscose",   "Viscose"),
    ("rayon",     "Viscose"),
    ("linen",     "Linen"),
    ("hemp",      "Sustainable Fabrics"),
    ("recycled",  "Sustainable Fabrics"),
    ("organic",   "Sustainable Fabrics"),
]


def route(material: str) -> str | None:
    """Return target category NAME for a given material string, or None."""
    m = (material or "").strip().lower()
    if not m:
        return None
    for key, target in NORMALISE:
        if key in m:
            return target
    return None


def dominant_target(comp, name: str = "") -> tuple[str | None, str]:
    """Return (target_category_name, reason) for a composition list.
    Falls back to parsing the fabric NAME if composition is missing.
    """
    if isinstance(comp, list) and comp:
        ranked = sorted(
            comp,
            key=lambda x: float(x.get("percentage") or 0),
            reverse=True,
        )
        for item in ranked:
            mat = item.get("material") or ""
            target = route(mat)
            if target:
                return target, f"{mat.strip()} {item.get('percentage')}%"
        return None, f"no known material in {comp}"
    # Fallback: parse the fabric NAME, preserve word order
    low = (name or "").lower()
    best, best_pos = None, 1e9
    for key, target in NORMALISE:
        pos = low.find(key)
        if pos != -1 and pos < best_pos:
            best, best_pos = target, pos
    if best:
        return best, f"(inferred from name '{name}')"
    return None, "no composition + no hint in name"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes to DB")
    args = ap.parse_args()

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # --- 1. Load existing categories ------------------------------------
    cats = await db.categories.find({}, {"_id": 0}).to_list(length=500)
    by_name = {c["name"]: c for c in cats}
    print("\n=== Existing categories ===")
    for c in cats:
        print(f"  {c['name']:<30} id={c['id']}")

    blended = by_name.get("Blended Fabrics")
    if not blended:
        print("\nNo 'Blended Fabrics' category — nothing to do.")
        return
    blended_id = blended["id"]

    # --- 2. Ensure Linen category exists (create if --apply) ------------
    if "Linen" not in by_name:
        linen = {
            "id": "cat-linen",
            "name": "Linen",
            "slug": "linen",
            "description": "Natural linen fabrics — breathable, durable, elegant.",
            "image_url": "",
            "fabric_count": 0,
        }
        print(f"\n[NEW CATEGORY] Linen  id={linen['id']}  (will be created)")
        if args.apply:
            await db.categories.insert_one(linen.copy())
            print("  -> inserted")
        by_name["Linen"] = linen
    else:
        print("\nLinen category already exists — will reuse.")

    # --- 3. Scan blended fabrics ---------------------------------------
    fabrics = await db.fabrics.find({"category_id": blended_id}, {"_id": 0}).to_list(length=1000)
    print(f"\n=== {len(fabrics)} fabrics currently in 'Blended Fabrics' ===\n")

    moves = Counter()
    stays = 0
    rows = []
    for f in fabrics:
        target_name, reason = dominant_target(f.get("composition"), f.get("name", ""))
        if not target_name or target_name == "Blended Fabrics":
            rows.append((f["id"][:8], f.get("name", "")[:38], "-- stays --", reason))
            stays += 1
            continue
        target = by_name.get(target_name)
        if not target:
            rows.append((f["id"][:8], f.get("name", "")[:38], f"MISSING:{target_name}", reason))
            stays += 1
            continue
        moves[target_name] += 1
        rows.append((f["id"][:8], f.get("name", "")[:38], target_name, reason))

    # Pretty print table
    print(f"{'ID':<10} {'NAME':<40} {'→ TARGET':<22} REASON")
    print("-" * 110)
    for r in rows:
        print(f"{r[0]:<10} {r[1]:<40} {r[2]:<22} {r[3]}")

    print("\n=== Summary ===")
    for name, n in moves.most_common():
        print(f"  + {n:>3}  ->  {name}")
    print(f"  = {stays:>3}  stay in Blended Fabrics")
    print(f"  total: {sum(moves.values()) + stays}")

    if not args.apply:
        print("\nDRY-RUN complete. Re-run with --apply to write changes.")
        return

    # --- 4. Apply updates ----------------------------------------------
    print("\nApplying updates...")
    updated = 0
    for f in fabrics:
        target_name, _ = dominant_target(f.get("composition"), f.get("name", ""))
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

    # Refresh fabric_count on every affected category
    for cat_name in list(moves.keys()) + ["Blended Fabrics"]:
        cat = by_name.get(cat_name)
        if not cat:
            continue
        count = await db.fabrics.count_documents({"category_id": cat["id"]})
        await db.categories.update_one(
            {"id": cat["id"]}, {"$set": {"fabric_count": count}}
        )
        print(f"  [{cat_name}] fabric_count = {count}")

    # --- 5. Delete the now-empty Blended Fabrics category --------------
    remaining = await db.fabrics.count_documents({"category_id": blended_id})
    if remaining == 0:
        del_res = await db.categories.delete_one({"id": blended_id})
        print(f"\n[CLEANUP] Deleted 'Blended Fabrics' category (removed={del_res.deleted_count})")
    else:
        print(f"\n[CLEANUP] 'Blended Fabrics' still has {remaining} fabric(s) — not deleted.")

    print(f"\nDone. {updated} fabrics reassigned.")


if __name__ == "__main__":
    asyncio.run(main())
