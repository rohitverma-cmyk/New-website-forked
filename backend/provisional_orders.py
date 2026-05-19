"""
Provisional Bulk Order helpers.

Phase 1 of the dual-stage payment flow.  Every bulk order pays only the
configured `advance_pct` (default 10 %) upfront.  Sample orders are
unchanged.  Suppliers later mark "goods ready" with the actual quantity,
which produces the balance invoice the customer pays before Shiprocket
push.

State machine on the order doc:

    payment_status:
      pending_advance  → advance_paid  → balance_pending  → paid
      (legacy values: initiated, paid — preserved for non-provisional)

    status:
      payment_pending → provisional → goods_ready → confirmed → …

Helpers here are pure (no Mongo calls) so they're easy to unit test.
"""
from __future__ import annotations

import os
from typing import Iterable

DEFAULT_ADVANCE_PCT = float(os.environ.get("PROVISIONAL_ADVANCE_PCT", "10"))
# ±10 % variance band when supplier enters actual quantity.  Outside this
# band the goods-ready endpoint will require an admin override.
VARIANCE_PCT = float(os.environ.get("PROVISIONAL_VARIANCE_PCT", "10"))


def is_bulk_order(items: Iterable[dict]) -> bool:
    """An order is bulk if ANY of its items is `order_type: bulk`."""
    for it in items:
        if (it.get("order_type") or "bulk") == "bulk":
            return True
    return False


def resolve_advance_pct(requested_pct: float | None) -> float:
    """Clamp the agent-/customer-requested advance % to [1, 100]. When
    the caller didn't specify (`0` or `None`), use the platform default."""
    try:
        pct = float(requested_pct) if requested_pct else 0
    except (TypeError, ValueError):
        pct = 0
    if pct <= 0:
        pct = DEFAULT_ADVANCE_PCT
    # Never below 1 % (rounding floor), never above 100 % (full upfront).
    return max(1.0, min(100.0, pct))


def split_amounts(total: float, advance_pct: float) -> tuple[float, float]:
    """Returns (advance_amount, balance_amount) rounded to 2 dp."""
    advance = round(total * advance_pct / 100.0, 2)
    balance = round(total - advance, 2)
    return advance, balance


def within_variance(ordered_qty: float, actual_qty: float) -> bool:
    """True iff actual is within ±VARIANCE_PCT of ordered."""
    if ordered_qty <= 0:
        return actual_qty == 0
    diff = abs(actual_qty - ordered_qty) / ordered_qty * 100.0
    return diff <= VARIANCE_PCT


def recalc_item_total(item: dict, actual_qty: float) -> dict:
    """Returns a NEW dict with `actual_quantity` stamped + `actual_total`
    derived from price × actual_qty. Original `quantity` is preserved
    so the customer can see ordered-vs-shipped on the invoice."""
    rate = float(item.get("price_per_meter") or 0)
    actual_total = round(rate * actual_qty, 2)
    out = dict(item)
    out["actual_quantity"] = float(actual_qty)
    out["actual_total"] = actual_total
    return out
