"""
Agent Catalogue — turns a filter/AI-search result set into a polished,
shareable client-facing brochure with a big Locofast watermark.

Two endpoints:
* `/api/agent/catalogues`   — agent CRUD (auth-gated)
* `/api/catalogues/{slug}`  — PUBLIC viewer (no auth, no rate limit)

Catalogues are immutable after creation by default (the agent can
re-edit their own, but each share URL renders the latest snapshot).
"""
import logging
import secrets
import string
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agent_router import get_current_agent

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent-catalogues"])
db = None


def set_db(database):
    global db
    db = database


# -------- helpers ----------------------------------------------------------

def _slug() -> str:
    """Short, unguessable, URL-safe slug. 12 chars ≈ 71 bits of entropy —
    plenty so links can't be enumerated."""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(12))


def _public_view(cat: dict, fabrics: list[dict]) -> dict:
    """Hydrate a catalogue doc for the public viewer.

    Excludes any agent PII the buyer shouldn't see (agent_id, internal
    timestamps, etc.). Returns a single envelope the frontend can render
    without any further DB calls.
    """
    return {
        "id": cat["id"],
        "slug": cat["slug"],
        "title": cat.get("title") or "Curated Catalogue",
        "intro": cat.get("intro") or "",
        "client_name": cat.get("client_name") or "",
        "client_logo_url": cat.get("client_logo_url") or "",
        "hero_image_url": cat.get("hero_image_url") or "",
        "agent_name": cat.get("agent_name") or "",
        "agent_email": cat.get("agent_email") or "",
        "agent_phone": cat.get("agent_phone") or "",
        "view_count": cat.get("view_count", 0),
        "created_at": cat.get("created_at"),
        "fabrics": [_fabric_for_catalogue(f) for f in fabrics],
    }


def _fabric_for_catalogue(f: dict) -> dict:
    """Standard-pack fields for the client-facing tile.

    Notably hides supplier name (protects sourcing relationships) but keeps
    supplier city so the client gets a sense of origin.
    """
    comp = f.get("composition")
    if isinstance(comp, list):
        comp_str = " + ".join(
            f"{c.get('percentage','')}% {c.get('material','')}".strip()
            for c in comp if c and c.get("material")
        )
    else:
        comp_str = comp or ""
    return {
        "id": f.get("id"),
        "slug": f.get("slug") or "",
        "name": f.get("name") or "",
        "fabric_code": f.get("fabric_code") or "",
        "image_url": f.get("image_url") or "",
        "category_name": f.get("category_name") or "",
        "fabric_type": f.get("fabric_type") or "",
        "composition": comp_str,
        "gsm": f.get("gsm"),
        "ounce": f.get("ounce"),
        "width": f.get("width"),
        "color_or_shade": f.get("color_or_shade") or "",
        "weave_pattern": f.get("weave_pattern") or "",
        "knit_type": f.get("knit_type") or "",
        "moq": f.get("moq"),
        "unit": f.get("unit") or "m",
        "starting_price": f.get("starting_price") or f.get("rate_per_meter"),
        "is_bookable": bool(f.get("is_bookable")),
        "lead_time_days": f.get("lead_time_days"),
    }


# -------- request models ---------------------------------------------------

class CatalogueCreate(BaseModel):
    title: str = Field("", max_length=200)
    intro: str = Field("", max_length=2000)
    client_name: str = Field("", max_length=200)
    client_logo_url: str = Field("", max_length=600)
    hero_image_url: str = Field("", max_length=600)
    fabric_ids: list[str]


class CataloguePatch(BaseModel):
    title: str | None = None
    intro: str | None = None
    client_name: str | None = None
    client_logo_url: str | None = None
    hero_image_url: str | None = None
    fabric_ids: list[str] | None = None


# -------- agent routes (auth-gated) ----------------------------------------

@router.post("/api/agent/catalogues")
async def create_catalogue(data: CatalogueCreate, request: Request):
    agent = get_current_agent(request)
    if not data.fabric_ids:
        raise HTTPException(status_code=400, detail="Add at least 1 fabric to the catalogue")
    if len(data.fabric_ids) > 200:
        raise HTTPException(status_code=400, detail="A catalogue can hold up to 200 fabrics")
    # Validate that the IDs actually exist (no point in saving a broken link)
    found = await db.fabrics.find(
        {"id": {"$in": data.fabric_ids}}, {"_id": 0, "id": 1}
    ).to_list(length=200)
    valid_ids = [f["id"] for f in found]
    # Preserve agent's chosen order, drop unknowns
    ordered_ids = [fid for fid in data.fabric_ids if fid in valid_ids]
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="None of the selected fabrics were found")

    doc = {
        "id": str(uuid4()),
        "slug": _slug(),
        "agent_id": agent.get("id") or agent.get("agent_id"),
        "agent_email": agent.get("email", ""),
        "agent_name": agent.get("name", ""),
        "agent_phone": agent.get("phone", ""),
        "title": (data.title or "").strip() or "Curated Catalogue",
        "intro": (data.intro or "").strip(),
        "client_name": (data.client_name or "").strip(),
        "client_logo_url": (data.client_logo_url or "").strip(),
        "hero_image_url": (data.hero_image_url or "").strip(),
        "fabric_ids": ordered_ids,
        "view_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.agent_catalogues.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/api/agent/catalogues")
async def list_my_catalogues(request: Request):
    agent = get_current_agent(request)
    agent_id = agent.get("id") or agent.get("agent_id")
    cats = await db.agent_catalogues.find(
        {"agent_id": agent_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    return {"catalogues": cats}


@router.patch("/api/agent/catalogues/{catalogue_id}")
async def edit_catalogue(catalogue_id: str, data: CataloguePatch, request: Request):
    agent = get_current_agent(request)
    agent_id = agent.get("id") or agent.get("agent_id")
    cat = await db.agent_catalogues.find_one({"id": catalogue_id, "agent_id": agent_id})
    if not cat:
        raise HTTPException(status_code=404, detail="Catalogue not found")
    update: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for k in ("title", "intro", "client_name", "client_logo_url", "hero_image_url"):
        val = getattr(data, k)
        if val is not None:
            update[k] = val.strip() if isinstance(val, str) else val
    if data.fabric_ids is not None:
        update["fabric_ids"] = data.fabric_ids[:200]
    await db.agent_catalogues.update_one(
        {"id": catalogue_id}, {"$set": update}
    )
    cat = await db.agent_catalogues.find_one({"id": catalogue_id}, {"_id": 0})
    return cat


@router.delete("/api/agent/catalogues/{catalogue_id}")
async def delete_catalogue(catalogue_id: str, request: Request):
    agent = get_current_agent(request)
    agent_id = agent.get("id") or agent.get("agent_id")
    res = await db.agent_catalogues.delete_one({"id": catalogue_id, "agent_id": agent_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalogue not found")
    return {"ok": True}


# -------- public viewer (no auth) ------------------------------------------

@router.get("/api/catalogues/{slug}")
async def view_catalogue(slug: str):
    cat = await db.agent_catalogues.find_one({"slug": slug}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Catalogue not found or unpublished")
    fabrics = []
    if cat.get("fabric_ids"):
        rows = await db.fabrics.find(
            {"id": {"$in": cat["fabric_ids"]}}, {"_id": 0}
        ).to_list(length=200)
        # Preserve agent's chosen order
        by_id = {r["id"]: r for r in rows}
        fabrics = [by_id[fid] for fid in cat["fabric_ids"] if fid in by_id]
    # Bump view counter — fire-and-forget so failures don't block render
    try:
        await db.agent_catalogues.update_one(
            {"slug": slug}, {"$inc": {"view_count": 1}}
        )
    except Exception:
        pass
    return _public_view(cat, fabrics)
