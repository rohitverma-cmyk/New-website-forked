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
