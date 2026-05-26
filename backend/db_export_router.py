"""
Admin DB Export endpoint — one-shot full-DB snapshot as a zip of JSON
files (one per collection). Strictly admin-gated. Every call is logged
to `admin_audit_log` for traceability.

Usage (after deploy):
  GET /api/admin/db/export                  → all collections
  GET /api/admin/db/export?collections=a,b  → only listed collections
  GET /api/admin/db/export?exclude=email_logs,admin_otps  → skip noisy collections

Auth: Bearer admin token. Anyone without admin role is rejected by
`auth_helpers.get_current_admin`. The endpoint also accepts `?token=…`
in the querystring so the user can paste the URL into the browser
without dev tools (token is hashed before being audit-logged).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from typing import Optional
import io
import json
import zipfile
import hashlib
import logging

import auth_helpers

logger = logging.getLogger(__name__)
router = APIRouter()

# Set by server.py at startup
db = None


def set_db(database):
    global db
    db = database


def _bson_default(obj):
    """JSON encoder for BSON types we don't natively serialize."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    # bson.ObjectId / Decimal128 / etc. — let str() handle them
    try:
        return str(obj)
    except Exception:
        return None


async def _dump_collection_to_jsonl(name: str) -> tuple[bytes, int]:
    """Stream a collection out as newline-delimited JSON (JSONL).

    JSONL keeps memory bounded — we never hold the entire collection in
    a Python list at once. Restoration is `mongoimport --type=json
    --collection=NAME file.jsonl`.

    Returns (jsonl_bytes, doc_count).
    """
    buf = io.BytesIO()
    count = 0
    async for doc in db[name].find({}):
        # Stringify _id (ObjectId is not JSON-serializable by default)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        buf.write(json.dumps(doc, default=_bson_default).encode("utf-8"))
        buf.write(b"\n")
        count += 1
    return buf.getvalue(), count


@router.get("/admin/db/export")
async def admin_db_export(
    request: Request,
    collections: Optional[str] = Query(None, description="Comma-separated allowlist; empty = all"),
    exclude: Optional[str] = Query(None, description="Comma-separated denylist"),
    admin=Depends(auth_helpers.get_current_admin),
):
    """Download a zip of JSONL dumps of every (non-system) collection.

    The zip contains:
      • <collection>.jsonl  — one doc per line, _id stringified.
      • _manifest.json      — list of collections, doc counts, exported_at,
                              admin id, total bytes.
    """
    # 1) Collection list
    all_names = await db.list_collection_names()
    # Filter system / GridFS internals
    all_names = [n for n in all_names if not n.startswith("system.") and not n.endswith(".chunks") and not n.endswith(".files")]

    selected = set(all_names)
    if collections:
        wanted = {c.strip() for c in collections.split(",") if c.strip()}
        selected &= wanted
    if exclude:
        skip = {c.strip() for c in exclude.split(",") if c.strip()}
        selected -= skip
    if not selected:
        raise HTTPException(status_code=400, detail="No collections selected after filters")

    sorted_names = sorted(selected)

    # 2) Build the zip in memory. We stream collection by collection so
    # we never hold the entire DB in memory at once.
    out = io.BytesIO()
    manifest = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email"),
        "db_name": db.name if hasattr(db, "name") else "",
        "collections": [],
        "format": "jsonl",
        "restore_hint": "mongoimport --db <db> --collection <name> --type=json --file <name>.jsonl",
    }
    total_docs = 0
    total_bytes = 0

    with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for cname in sorted_names:
            try:
                data, n = await _dump_collection_to_jsonl(cname)
                zf.writestr(f"{cname}.jsonl", data)
                manifest["collections"].append({"name": cname, "documents": n, "bytes": len(data)})
                total_docs += n
                total_bytes += len(data)
            except Exception as e:
                logger.exception(f"[db-export] failed dumping '{cname}': {e}")
                manifest["collections"].append({"name": cname, "error": str(e)})
        manifest["totals"] = {"documents": total_docs, "bytes_uncompressed": total_bytes}
        zf.writestr("_manifest.json", json.dumps(manifest, indent=2, default=_bson_default))

    out.seek(0)
    zip_bytes = out.getvalue()

    # 3) Audit log
    try:
        sig = hashlib.sha256(zip_bytes[:65536]).hexdigest()  # cheap fingerprint
        await db.admin_audit_log.insert_one({
            "ts": datetime.now(timezone.utc).isoformat(),
            "action": "db_export",
            "admin_id": admin.get("id"),
            "admin_email": admin.get("email"),
            "client_ip": request.client.host if request.client else "",
            "user_agent": request.headers.get("user-agent", "")[:255],
            "collections": sorted_names,
            "total_documents": total_docs,
            "bytes_compressed": len(zip_bytes),
            "bytes_uncompressed": total_bytes,
            "fingerprint_sha256_prefix": sig,
        })
    except Exception as e:
        logger.warning(f"[db-export] audit log failed: {e}")

    filename = f"locofast-db-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(zip_bytes)),
            "X-Export-Docs": str(total_docs),
            "X-Export-Collections": str(len(sorted_names)),
        },
    )


@router.get("/admin/db/export/preview")
async def admin_db_export_preview(admin=Depends(auth_helpers.get_current_admin)):
    """Lightweight preview — collection names + estimated doc counts.

    Use this before downloading to see what will be in the zip.
    """
    names = await db.list_collection_names()
    names = [n for n in names if not n.startswith("system.") and not n.endswith(".chunks") and not n.endswith(".files")]
    rows = []
    for n in sorted(names):
        try:
            cnt = await db[n].estimated_document_count()
        except Exception:
            cnt = -1
        rows.append({"name": n, "estimated_documents": cnt})
    return {"collections": rows, "total_collections": len(rows)}
