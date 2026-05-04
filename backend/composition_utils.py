"""
Composition normalization — single source of truth for fabric material names.

• `CANONICAL_COMPOSITIONS`: the exact list surfaced in every dropdown (Admin form,
  Vendor form, filter dropdown on /fabrics, etc.). Admins CANNOT add/remove from
  the UI — the list is intentionally code-owned so dropdowns stay clean.
• `ALIAS_MAP`: every known typo / synonym / casing variant → canonical name.
  Lookups are lowercase + whitespace-collapsed.
• `normalize_material(raw)` returns the canonical name, or, for totally unknown
  strings, a Title-Cased fallback so data is never silently dropped.
"""
import re
from typing import Optional, List, Dict

# ════════════════════════════════════════════════════════════════════
# Canonical list — frontend dropdown reads this verbatim.
# To add/remove a composition, edit this list ONLY. No admin UI.
# ════════════════════════════════════════════════════════════════════
CANONICAL_COMPOSITIONS: List[str] = [
    "Cotton",
    "Organic Cotton",
    "Recycled Cotton",
    "Polyester",
    "Recycled Polyester",
    "Viscose",
    "Lyocell",
    "Modal",
    "Lycra",  # marketing name — covers Spandex / Elastane / Flex
    "Linen",
    "Hemp",
    "Nylon",
    "Wool",
    "Silk",
    "Bamboo",
    "Acrylic",
    "Cashmere",
    "Lurex",
    "Jute",
    "Rayon",
]

# ════════════════════════════════════════════════════════════════════
# Alias map — lowercased key → canonical value.
# Covers known typos, casing issues, and brand/synonym merges.
# Keep keys lowercase here; `normalize_material()` lowercases the input.
# ════════════════════════════════════════════════════════════════════
ALIAS_MAP: Dict[str, str] = {
    # ─── Cotton family ───
    "cotton": "Cotton",
    "cottton": "Cotton",
    "coitton": "Cotton",
    "ctton": "Cotton",
    "cottn": "Cotton",
    "cotton flex": "Cotton",  # "Flex" is a Lycra brand term — treat as Cotton (dominant)
    "organic cotton": "Organic Cotton",
    "org cotton": "Organic Cotton",
    "org. cotton": "Organic Cotton",
    "organic ctton": "Organic Cotton",
    "bci cotton": "Cotton",  # Better Cotton Initiative is still cotton
    "recycled cotton": "Recycled Cotton",
    "rcy cotton": "Recycled Cotton",
    "rcyd cotton": "Recycled Cotton",

    # ─── Polyester family ───
    "polyester": "Polyester",
    "polyster": "Polyester",
    "polester": "Polyester",
    "poly": "Polyester",
    "pet": "Polyester",
    "recycled polyester": "Recycled Polyester",
    "rcy polyester": "Recycled Polyester",
    "rcy poly": "Recycled Polyester",
    "rpet": "Recycled Polyester",
    "r-pet": "Recycled Polyester",

    # ─── Viscose / Rayon / Lyocell / Modal ───
    "viscose": "Viscose",
    "visocse": "Viscose",
    "vsicose": "Viscose",
    "vicose": "Viscose",
    "rayon": "Rayon",  # Viscose is a type of rayon, but kept distinct when stated
    "lyocell": "Lyocell",
    "lyocel": "Lyocell",
    "lyocll": "Lyocell",
    "tencel": "Lyocell",  # Tencel is Lenzing's brand for Lyocell
    "tencel lyocell": "Lyocell",
    "modal": "Modal",

    # ─── Lycra / Spandex / Elastane (same chemistry) ───
    "lycra": "Lycra",
    "lyvra": "Lycra",
    "lycraa": "Lycra",
    "spandex": "Lycra",
    "elastane": "Lycra",
    "elasthane": "Lycra",
    "flex": "Lycra",  # shorthand for Lycra in trade

    # ─── Linen / Hemp / Jute ───
    "linen": "Linen",
    "linnen": "Linen",
    "hemp": "Hemp",
    "jute": "Jute",

    # ─── Other naturals / specialty ───
    "nylon": "Nylon",
    "polyamide": "Nylon",
    "pa": "Nylon",
    "wool": "Wool",
    "merino wool": "Wool",
    "silk": "Silk",
    "bamboo": "Bamboo",
    "acrylic": "Acrylic",
    "cashmere": "Cashmere",
    "lurex": "Lurex",
    "metallic": "Lurex",
}

_WS_RE = re.compile(r"\s+")


def _key(raw: str) -> str:
    """Lowercase + whitespace-collapsed key for alias lookup."""
    return _WS_RE.sub(" ", (raw or "").strip()).lower()


def normalize_material(raw: Optional[str]) -> str:
    """
    Returns the canonical material name for a raw string.
    Unknown values fall back to title-cased input so data is never silently dropped.
    """
    if not raw or not str(raw).strip():
        return ""
    k = _key(str(raw))
    if k in ALIAS_MAP:
        return ALIAS_MAP[k]
    # Try stripping percentage/numbers
    stripped = re.sub(r"\d+(\.\d+)?\s*%?", "", str(raw)).strip()
    if stripped:
        k2 = _key(stripped)
        if k2 in ALIAS_MAP:
            return ALIAS_MAP[k2]
    # Fallback — title case, preserving single-word vs multi-word shape
    return " ".join(w.capitalize() for w in _WS_RE.split(str(raw).strip()) if w)


def canonicalize_composition(comp) -> List[Dict]:
    """
    Normalises a fabric's composition field to a canonical list.
    Accepts either the new list-of-dicts shape or legacy 'Cotton 78%, Poly 20%' string.
    Merges duplicates that collapse to the same canonical name by summing percentages.
    Returns `[{'material': str, 'percentage': float}, ...]`.
    """
    merged: Dict[str, float] = {}

    def _add(mat_raw, pct_raw):
        mat = normalize_material(mat_raw)
        if not mat:
            return
        try:
            pct = float(pct_raw) if pct_raw not in (None, "") else 0
        except (ValueError, TypeError):
            pct = 0
        merged[mat] = merged.get(mat, 0) + pct

    if isinstance(comp, list):
        for item in comp:
            if isinstance(item, dict):
                _add(item.get("material"), item.get("percentage"))
    elif isinstance(comp, str):
        # Legacy: "Cotton 78%, Polyester 20%, Spandex 2%"
        for part in comp.split(","):
            m = re.match(r"\s*([A-Za-z .\-]+?)\s*(\d+(?:\.\d+)?)?\s*%?\s*$", part)
            if m:
                _add(m.group(1), m.group(2))

    # Integer percentages stay int; half-step stretch fibres get .5 preserved.
    out = []
    for mat, pct in merged.items():
        if pct == int(pct):
            out.append({"material": mat, "percentage": int(pct)})
        else:
            out.append({"material": mat, "percentage": round(pct, 2)})
    # Sort by percentage descending so cards display dominant material first
    out.sort(key=lambda x: -x["percentage"])
    return out
