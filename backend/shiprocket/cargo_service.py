"""Shiprocket Cargo (B2B / LTL) integration.

The standard Shiprocket integration (`apiv2.shiprocket.in`) handles
parcel-style courier shipments. For bulk (production-only) fabric
orders we route to *Shiprocket Cargo* instead — a separate API on
`api-cargo.shiprocket.in` that brokers LTL freight (Delhivery
Enterprise, etc.).

API journey:
  1. POST /api/token/refresh/   →  exchange long-lived refresh token
     for a 24-hour access token (cached in-process).
  2. POST /api/external/order_creation/   →  returns `order_id`,
     `mode_id`, `delivery_partner_id`, `transportar_id` (for eway).
  3. POST /api/order_shipment_association/  →  books pickup and
     returns `id` (shipment id), `waybill_no`, `label_url`.

We expose a single high-level `create_cargo_shipment(order)` that
runs all three steps and returns the same dict shape our existing
courier flow uses, so the order doc absorbs it idempotently.
"""

from __future__ import annotations

import os
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = os.environ.get("SHIPROCKET_CARGO_BASE_URL", "https://api-cargo.shiprocket.in").rstrip("/")
REFRESH_TOKEN = os.environ.get("SHIPROCKET_CARGO_REFRESH_TOKEN", "").strip()
CLIENT_ID = os.environ.get("SHIPROCKET_CARGO_CLIENT_ID", "").strip()
ENABLED = (os.environ.get("SHIPROCKET_CARGO_ENABLED", "false").lower() == "true")

# 24h access token cache. Refresh via the refresh-token endpoint —
# we deliberately refresh slightly early (23h) to avoid edge expiry.
_token_cache: dict = {"access": None, "expires_at": None}
_token_lock = asyncio.Lock()


def is_enabled() -> bool:
    return ENABLED and bool(REFRESH_TOKEN) and bool(CLIENT_ID)


async def _get_access_token(force: bool = False) -> str:
    """Refresh-token flow with in-process caching. Single-flight via lock."""
    async with _token_lock:
        now = datetime.now(timezone.utc)
        if not force and _token_cache["access"] and _token_cache["expires_at"] and _token_cache["expires_at"] > now:
            return _token_cache["access"]
        if not REFRESH_TOKEN:
            raise RuntimeError("SHIPROCKET_CARGO_REFRESH_TOKEN is not configured")
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{BASE_URL}/api/token/refresh/",
                json={"refresh": REFRESH_TOKEN},
                headers={"Content-Type": "application/json"},
            )
            r.raise_for_status()
            access = r.json().get("access")
        if not access:
            raise RuntimeError("Cargo refresh endpoint returned no access token")
        _token_cache["access"] = access
        _token_cache["expires_at"] = now + timedelta(hours=23)
        return access


async def _headers() -> dict:
    token = await _get_access_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _normalize_phone(raw: str) -> str:
    """Cargo API: phone numbers must start with 6, 7, 8 or 9."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("91") and len(digits) > 10:
        digits = digits[-10:]
    if not digits or digits[0] not in "6789":
        # Use a placeholder so downstream validation passes; admin
        # should correct on the order before re-pushing.
        return "9999999999"
    return digits[:10]


def _safe_str(v, limit: int) -> str:
    return ((v or "").strip())[:limit]


def _build_packaging_units(items: list, total_weight_kg: float) -> list:
    """Approximate per-roll dimensions for fabric: 1m × 0.4m × 0.4m,
    1 unit per roll of fabric (≈25kg/roll standard for bulk). If exact
    dims are stored on the item we'd use those, but we don't track
    per-roll dims today — so we synthesize from total quantity.
    """
    total_qty_m = sum(float(it.get("quantity", 0) or 0) for it in items)
    # Treat every ~50 m as one roll
    rolls = max(1, int(round(total_qty_m / 50)))
    per_roll_weight = round(max(0.5, total_weight_kg / rolls), 2)
    return [{
        "units": rolls,
        "weight": per_roll_weight,
        "length": 100,
        "height": 40,
        "width": 40,
    }]


def _estimate_weight_kg(items: list) -> float:
    """Rough: 200 g/m fabric × total meters. Floor at 10kg so cargo
    isn't refused for being too light (LTL minimums)."""
    total_m = sum(float(it.get("quantity", 0) or 0) for it in items)
    return max(10.0, round(total_m * 0.2, 2))


async def create_cargo_shipment(order: dict, db) -> dict:
    """Two-step Cargo create flow. Returns a dict mirroring the courier
    flow's shape: { vertical, shipment_id, order_id, waybill_no, label_url,
    delivery_partner_name, raw_create, raw_associate }.

    `order` is the Mongo order document. `db` is the Motor async db
    handle, used to look up the seller's pickup details if needed.
    """
    if not is_enabled():
        raise RuntimeError("Shiprocket Cargo not enabled or client_id missing")

    items = order.get("items", []) or []
    invoice_value = round(float(order.get("total") or order.get("subtotal") or 0), 2)
    if invoice_value < 1:
        raise RuntimeError(f"Order {order.get('order_number')} has invoice_value < 1 — Cargo rejects")

    # ── Source (vendor pickup) ──
    # Resolution order:
    #   1. order.pickup_address_id → pick from seller's saved addresses
    #   2. seller's PRIMARY pickup address
    #   3. legacy single-field pickup_* on seller doc (back-compat)
    seller_id = (order.get("seller_id") or (items[0].get("seller_id") if items else "") or "").strip()
    seller = await db.sellers.find_one({"id": seller_id}, {"_id": 0}) if seller_id else None
    chosen_addr = None
    if seller:
        sel_addresses = seller.get("pickup_addresses", []) or []
        order_addr_id = order.get("pickup_address_id")
        if order_addr_id:
            chosen_addr = next((a for a in sel_addresses if a.get("id") == order_addr_id), None)
        if not chosen_addr:
            chosen_addr = next((a for a in sel_addresses if a.get("is_primary")), None) or (sel_addresses[0] if sel_addresses else None)

    if chosen_addr:
        src = {
            "name": _safe_str(chosen_addr.get("nickname") or seller.get("company_name") or "Pickup", 50),
            "line1": _safe_str(chosen_addr.get("address_line1"), 150),
            "line2": _safe_str(chosen_addr.get("address_line2", ""), 100),
            "city": _safe_str(chosen_addr.get("city"), 60),
            "state": _safe_str(chosen_addr.get("state"), 60),
            "pincode": _safe_str(chosen_addr.get("pincode"), 6),
            "contact": _safe_str(chosen_addr.get("contact_person_name"), 80),
            "email": _safe_str(chosen_addr.get("contact_email") or "noreply@locofast.com", 80),
            "phone": _normalize_phone(chosen_addr.get("contact_phone")),
        }
    else:
        s = seller or {}
        src_name = _safe_str(s.get("shiprocket_pickup_nickname") or s.get("company_name") or "Locofast WH", 50)
        src = {
            "name": src_name,
            "line1": _safe_str(s.get("pickup_address") or s.get("address") or "Locofast Warehouse", 150),
            "line2": "",
            "city": _safe_str(s.get("pickup_city") or s.get("city") or "Gurgaon", 60),
            "state": _safe_str(s.get("pickup_state") or s.get("state") or "Haryana", 60),
            "pincode": _safe_str(s.get("pickup_pincode") or "122001", 6),
            "contact": _safe_str(s.get("pickup_contact_name") or s.get("name") or "Warehouse Manager", 80),
            "email": _safe_str(s.get("contact_email") or "noreply@locofast.com", 80),
            "phone": _normalize_phone(s.get("pickup_contact_phone") or s.get("contact_phone")),
        }

    # ── Destination (buyer) ──
    ship_to = order.get("ship_to") or order.get("shipping_address") or {}
    cust = order.get("customer") or {}
    dst_company = _safe_str(ship_to.get("company") or cust.get("company") or cust.get("name") or "Buyer", 50)
    dst = {
        "name": dst_company,
        "line1": _safe_str(ship_to.get("address") or ship_to.get("line1") or "—", 150),
        "line2": _safe_str(ship_to.get("address2") or ship_to.get("line2") or "", 100),
        "city": _safe_str(ship_to.get("city") or cust.get("city"), 60),
        "state": _safe_str(ship_to.get("state") or cust.get("state"), 60),
        "pincode": _safe_str(ship_to.get("pincode") or cust.get("pincode"), 6),
        "contact": _safe_str(ship_to.get("name") or cust.get("name") or dst_company, 80),
        "email": _safe_str(cust.get("email") or "noreply@locofast.com", 80),
        "phone": _normalize_phone(ship_to.get("phone") or cust.get("phone")),
    }

    weight = _estimate_weight_kg(items)
    packaging = _build_packaging_units(items, weight)
    no_of_packages = sum(p["units"] for p in packaging)

    # eway bill is mandatory if invoice value > 50k. We don't generate
    # it here — admin needs to provide it. For now we send null and
    # let Shiprocket reject if needed; an `eway_required` flag is
    # returned in the response so we surface it on the order.
    eway_bill_no = order.get("eway_bill_no") or None

    create_payload = {
        "no_of_packages": no_of_packages,
        "invoice_value": invoice_value,
        "approx_weight": f"{weight}",
        "is_insured": False,
        "is_to_pay": False,
        "to_pay_amount": None,
        "source_warehouse_name": src["name"],
        "source_address_line1": src["line1"],
        "source_address_line2": src["line2"],
        "source_pincode": src["pincode"],
        "source_city": src["city"],
        "source_state": src["state"],
        "sender_contact_person_name": src["contact"],
        "sender_contact_person_email": src["email"],
        "sender_contact_person_contact_no": src["phone"],
        "destination_warehouse_name": dst["name"],
        "destination_address_line1": dst["line1"],
        "destination_address_line2": dst["line2"],
        "destination_pincode": dst["pincode"],
        "destination_city": dst["city"],
        "destination_state": dst["state"],
        "recipient_contact_person_name": dst["contact"],
        "recipient_contact_person_email": dst["email"],
        "recipient_contact_person_contact_no": dst["phone"],
        "client_id": int(CLIENT_ID) if CLIENT_ID.isdigit() else CLIENT_ID,
        "packaging_unit_details": packaging,
        "is_cod": False,
        "cod_amount": None,
        "mode_name": "surface",
        "channel_partner": None,
        "po_no": None,
        "po_expiry_date": None,
        "is_appointment_taken": False,
        "source": "API",
        "supporting_docs": [],
    }

    headers = await _headers()

    # ── Step 1: order creation ──
    async with httpx.AsyncClient(timeout=60) as c:
        r1 = await c.post(f"{BASE_URL}/api/external/order_creation/", headers=headers, json=create_payload)
    if r1.status_code not in (200, 201):
        raise RuntimeError(f"Cargo order_creation failed [{r1.status_code}]: {r1.text[:500]}")
    create_resp = r1.json()
    if not create_resp.get("success"):
        raise RuntimeError(f"Cargo order_creation returned success=false: {create_resp}")

    cargo_order_id = create_resp["order_id"]
    mode_id = create_resp["mode_id"]
    delivery_partner_id = create_resp["delivery_partner_id"]
    delivery_partner_name = create_resp.get("delivery_partner_name", "")

    # ── Step 2: shipment association (books the pickup) ──
    pickup_dt = (datetime.now(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    associate_payload = {
        "client_id": int(CLIENT_ID) if CLIENT_ID.isdigit() else CLIENT_ID,
        "order_id": cargo_order_id,
        "remarks": f"Locofast order {order.get('order_number','')}"[:200],
        "recipient_GST": (ship_to.get("gst_number") or cust.get("gst_number") or "") or None,
        "to_pay_amount": "0",
        "mode_id": mode_id,
        "delivery_partner_id": delivery_partner_id,
        "pickup_date_time": pickup_dt,
        "eway_bill_no": eway_bill_no,
        "invoice_value": invoice_value,
        "invoice_number": (order.get("order_number") or order.get("id", ""))[:60],
        "invoice_date": (order.get("created_at") or datetime.now(timezone.utc).isoformat())[:10],
        "supporting_docs": [order.get("invoice_pdf_url")] if order.get("invoice_pdf_url") else [],
        "source": "API",
    }

    async with httpx.AsyncClient(timeout=60) as c:
        r2 = await c.post(
            f"{BASE_URL}/api/order_shipment_association/",
            headers=headers,
            json=associate_payload,
        )
    if r2.status_code not in (200, 201):
        raise RuntimeError(f"Cargo shipment_association failed [{r2.status_code}]: {r2.text[:500]}")
    assoc_resp = r2.json()

    return {
        "vertical": "cargo",
        "shipment_id": assoc_resp.get("id"),
        "order_id": cargo_order_id,
        "waybill_no": assoc_resp.get("waybill_no"),
        "lrn": assoc_resp.get("lrn"),
        "child_waybill_nos": assoc_resp.get("child_waybill_nos", []),
        "label_url": assoc_resp.get("label_url"),
        "delivery_partner_name": delivery_partner_name,
        "transporter_id": create_resp.get("transportar_id"),
        "mode": create_resp.get("mode"),
        "raw_create": create_resp,
        "raw_associate": assoc_resp,
    }


async def get_cargo_shipment(shipment_id: int) -> dict:
    headers = await _headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE_URL}/api/external/get_shipment/{shipment_id}/", headers=headers)
    r.raise_for_status()
    return r.json()
