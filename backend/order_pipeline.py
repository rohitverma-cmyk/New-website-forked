"""
Order lifecycle helper
─────────────────────
Single source of truth for which tab an order belongs to.

Pipeline (rendered identically on admin, vendor and customer):
  1. awaiting_confirm           — Bulk order placed, vendor hasn't marked goods ready
                                  (samples skip this stage — they're auto-confirmed)
  2. cancelled                   — terminal
  3. confirmed_pending_dispatch  — Goods marked ready, balance payment pending
  4. prepare_dispatch            — Balance paid (or sample confirmed); vendor must
                                  upload tax invoice → triggers Shiprocket push
                                  → vendor adds e-way bill (skip if < ₹50k or sample)
  5. dispatched                  — E-way bill uploaded OR e-way not required
                                  OR Shiprocket pushed with valid AWB / waybill
  6. delivered                   — Shiprocket marked delivered

Soft-migration policy: existing orders are bucketed at read time by looking
at the same fields (`goods_ready_at`, `payment_status`, `vendor_invoices`,
`eway_bill_no`, `shiprocket_*`) — no DB writes required. New orders behave
identically because we just read the same fields they always wrote.
"""
from typing import Literal

PipelineStage = Literal[
    "awaiting_confirm",
    "cancelled",
    "confirmed_pending_dispatch",
    "prepare_dispatch",
    "dispatched",
    "delivered",
]

EWAY_THRESHOLD_INR = 50_000.0


def _is_all_samples(order: dict) -> bool:
    items = order.get("items") or []
    if not items:
        return False
    return all((it.get("order_type") or "").lower() == "sample" for it in items)


def _has_vendor_invoice(order: dict) -> bool:
    """At least one supplier has uploaded their tax invoice."""
    vis = order.get("vendor_invoices")
    if isinstance(vis, list):
        return any(bool((v or {}).get("url")) for v in vis)
    if isinstance(vis, dict):
        return any(bool((v or {}).get("url")) for v in vis.values())
    return False


def _has_eway_bill(order: dict) -> bool:
    """Either order-level or any shipment-level e-way bill is recorded."""
    if (order.get("eway_bill_no") or "").strip():
        return True
    for sh in (order.get("shiprocket_shipments") or []):
        if (sh.get("eway_bill_no") or "").strip():
            return True
    return False


def _shiprocket_pushed_ok(order: dict) -> bool:
    """Shiprocket has accepted the push (cargo step-1 succeeded or
    courier created). We don't gate on association — soft-fails still
    count as "pushed" so admin can complete manually in the Cargo panel."""
    if order.get("shiprocket_order_id"):
        return True
    return any(
        bool(sh.get("order_id")) and sh.get("success", False)
        for sh in (order.get("shiprocket_shipments") or [])
    )


def _shiprocket_has_awb(order: dict) -> bool:
    if (order.get("shiprocket_waybill_no") or "").strip():
        return True
    return any(
        (sh.get("awb_code") or "").strip()
        for sh in (order.get("shiprocket_shipments") or [])
    )


def _invoice_below_threshold(order: dict) -> bool:
    """E-way bill is not required when invoice value < ₹50,000.
    Uses actual_total when present (post goods-ready), else booked total."""
    inv = float(order.get("actual_total") or order.get("total") or 0)
    return inv > 0 and inv < EWAY_THRESHOLD_INR


def compute_pipeline_stage(order: dict) -> PipelineStage:
    """Bucket the order into one of the 6 pipeline tabs."""
    status = (order.get("status") or "").lower()
    payment_status = (order.get("payment_status") or "").lower()

    # Terminal states first
    if status == "cancelled":
        return "cancelled"
    if status == "delivered":
        return "delivered"

    all_samples = _is_all_samples(order)
    goods_ready = bool(order.get("goods_ready_at"))
    payment_paid = payment_status == "paid"
    has_invoice = _has_vendor_invoice(order)
    sr_pushed_ok = _shiprocket_pushed_ok(order)
    sr_has_awb = _shiprocket_has_awb(order)
    has_eway = _has_eway_bill(order)
    eway_skip = _invoice_below_threshold(order) or all_samples
    sr_shipped = status == "shipped"

    # 6 — Delivered: handled above

    # 5 — Dispatched: courier picked up OR (push+ (eway OR <50k OR sample))
    if sr_shipped or sr_has_awb:
        return "dispatched"
    if sr_pushed_ok and (has_eway or eway_skip):
        return "dispatched"

    # 4 — Prepare Dispatch:
    #     • Bulk: balance_paid AND ready (vendor needs to upload invoice)
    #     • Sample: as soon as paid (no balance step) — goods_ready may be false
    #     • Once invoice uploaded → still here until SR push + eway/skip
    if all_samples and payment_paid:
        return "prepare_dispatch"
    if goods_ready and payment_paid:
        return "prepare_dispatch"
    # Edge: invoice already uploaded but push hasn't fired yet
    if has_invoice and payment_paid:
        return "prepare_dispatch"

    # 3 — Confirmed / Waiting to be Dispatched:
    #     Goods marked ready, but balance payment still pending
    if goods_ready and not payment_paid:
        return "confirmed_pending_dispatch"

    # 1 — Awaiting Confirm: bulk, no goods_ready
    #     Samples skip this — they're auto-confirmed and move straight to
    #     prepare_dispatch once paid. If we somehow land here on a sample,
    #     classify as awaiting_confirm only if no payment yet.
    if all_samples:
        # paid samples are handled above; unpaid → still awaiting until paid
        return "awaiting_confirm"
    return "awaiting_confirm"


# Stable labels used by the UI (rendered identically across admin / vendor / customer).
PIPELINE_LABELS = {
    "awaiting_confirm": "Waiting to be Confirmed",
    "cancelled": "Cancelled",
    "confirmed_pending_dispatch": "Confirmed / Waiting to be Dispatched",
    "prepare_dispatch": "Prepare Dispatch",
    "dispatched": "Dispatched",
    "delivered": "Delivered",
}

PIPELINE_ORDER = [
    "awaiting_confirm",
    "confirmed_pending_dispatch",
    "prepare_dispatch",
    "dispatched",
    "delivered",
    "cancelled",
]


# ─────────────────────────────────────────────────────────────────
# VENDOR-FACING PIPELINE (separate state machine, same source data)
# ─────────────────────────────────────────────────────────────────
# The vendor screens use a quantity-bucketed flow so that bulk orders
# below 500m can be dispatched in a single step (combined rolls + tax
# invoice) and only orders ≥500m carry the provisional 2-phase flow.
# This is purely a re-bucketing of the same underlying fields — no DB
# migration, no behaviour change for admin/customer screens.
#
#   Bucket: sample          (vendor's slice < 5m or all-sample items)
#   Bucket: small_bulk      (5m ≤ vendor slice < 500m)
#   Bucket: large_bulk      (vendor slice ≥ 500m) — provisional 10/90
#
#   Stage flow per bucket
#   ----------------------
#   sample / small_bulk:
#     update_dispatch_details → dispatch_awaited → dispatched → delivered
#
#   large_bulk:
#     order_confirmation_needed
#       → awaiting_customer_full_payment
#       → update_dispatch_details
#       → dispatch_awaited
#       → dispatched
#       → delivered
LARGE_BULK_THRESHOLD_METERS = 500.0
SAMPLE_THRESHOLD_METERS = 5.0


def _vendor_slice_items(order: dict, vendor_id: str, vendor_fabric_ids: set | None = None) -> list[dict]:
    """All line items on the order supplied by this vendor."""
    if vendor_fabric_ids is None:
        vendor_fabric_ids = set()
    return [
        it for it in (order.get("items") or [])
        if it.get("seller_id") == vendor_id or it.get("fabric_id") in vendor_fabric_ids
    ]


def compute_vendor_bucket(order: dict, vendor_id: str, vendor_fabric_ids: set | None = None) -> str:
    """`sample` / `small_bulk` / `large_bulk` for the vendor's slice.
    Bucket is decided by the vendor-slice total quantity AND the
    line-item `order_type` flag:
      • All-sample lines → `sample` regardless of quantity
      • Any bulk line with vendor slice ≥ 500m → `large_bulk`
      • Otherwise (vendor slice < 500m) → `small_bulk`
    Samples below 5m are also classified as `sample` even if the line
    has no explicit `order_type` flag, matching the customer-side rule.
    """
    items = _vendor_slice_items(order, vendor_id, vendor_fabric_ids)
    if not items:
        return "small_bulk"
    if all((it.get("order_type") or "bulk").lower() == "sample" for it in items):
        return "sample"
    qty = sum(float(it.get("quantity") or 0) for it in items)
    if qty < SAMPLE_THRESHOLD_METERS:
        return "sample"
    if qty >= LARGE_BULK_THRESHOLD_METERS:
        return "large_bulk"
    return "small_bulk"


VendorStage = Literal[
    "order_confirmation_needed",
    "awaiting_customer_full_payment",
    "update_dispatch_details",
    "dispatch_awaited",
    "dispatched",
    "delivered",
    "cancelled",
]


def compute_vendor_stage(order: dict, vendor_id: str, vendor_fabric_ids: set | None = None) -> VendorStage:
    """Vendor-screen stage. See bucket docstring above."""
    status = (order.get("status") or "").lower()
    payment_status = (order.get("payment_status") or "").lower()

    if status == "cancelled":
        return "cancelled"
    if status == "delivered":
        return "delivered"

    sr_pushed = _shiprocket_pushed_ok(order)
    sr_has_awb = _shiprocket_has_awb(order)
    sr_shipped = status == "shipped"
    has_invoice = _has_vendor_invoice(order)
    has_eway = _has_eway_bill(order)
    all_samples = _is_all_samples(order)
    eway_skip = _invoice_below_threshold(order) or all_samples

    # Dispatched: courier picked up OR push+ (eway or skip)
    if sr_shipped or sr_has_awb:
        return "dispatched"
    if sr_pushed and (has_eway or eway_skip):
        return "dispatched"

    # If invoice uploaded but SR push not yet completed → awaiting pickup
    if has_invoice:
        return "dispatch_awaited"

    bucket = compute_vendor_bucket(order, vendor_id, vendor_fabric_ids)
    goods_ready = bool(order.get("goods_ready_at"))
    payment_paid = payment_status == "paid"

    if bucket == "large_bulk":
        # Provisional 10/90 flow
        if not goods_ready:
            return "order_confirmation_needed"
        if not payment_paid:
            return "awaiting_customer_full_payment"
        return "update_dispatch_details"

    # sample / small_bulk: skip the confirmation step. Once paid (which is
    # immediate on these flows), vendor's first action is to upload
    # dispatch details (rolls + tax invoice in one shot).
    if payment_paid or all_samples:
        return "update_dispatch_details"
    # Shouldn't happen — small bulk requires full payment upfront — but
    # render a safe fallback.
    return "update_dispatch_details"


VENDOR_STAGE_LABELS = {
    "order_confirmation_needed": "Order Confirmation Needed",
    "awaiting_customer_full_payment": "Awaiting Customer Full Payment",
    "update_dispatch_details": "Update Dispatch Details",
    "dispatch_awaited": "Dispatch Awaited",
    "dispatched": "Dispatched",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}

VENDOR_STAGE_ORDER = [
    "order_confirmation_needed",
    "awaiting_customer_full_payment",
    "update_dispatch_details",
    "dispatch_awaited",
    "dispatched",
    "delivered",
    "cancelled",
]

VENDOR_BUCKET_LABELS = {
    "sample": "Sample",
    "small_bulk": "Small Bulk",
    "large_bulk": "Large Bulk",
}
