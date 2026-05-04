// Shared pricing helpers for listing cards.
//
// We deliberately surface the CHEAPEST bulk tier price on listing cards as a
// hook — it's the lowest per-meter rate the buyer can ever pay, so it sets a
// strong anchor and improves click-through. The actual price they pay is
// re-evaluated at checkout based on quantity.

const numericPrice = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Returns the cheapest available bulk price across pricing tiers (if any),
 * with the minimum quantity required to unlock that price.
 *
 * Falls back to fabric.rate_per_meter when no tiers are defined.
 *
 * @returns {{price: number, minQty: number|null, hasTier: boolean} | null}
 */
export const getCheapestBulkPrice = (fabric) => {
  if (!fabric) return null;

  const tiers = Array.isArray(fabric.pricing_tiers) ? fabric.pricing_tiers : [];
  let cheapest = null;
  for (const t of tiers) {
    const p = numericPrice(t?.price_per_meter);
    if (p === null) continue;
    if (!cheapest || p < cheapest.price) {
      cheapest = { price: p, minQty: t?.min_qty ?? null, hasTier: true };
    }
  }
  if (cheapest) return cheapest;

  const base = numericPrice(fabric.rate_per_meter);
  if (base !== null) return { price: base, minQty: null, hasTier: false };

  return null;
};

/**
 * Format a quantity threshold for display, e.g. 5000 -> "5,000m+".
 */
export const formatQtyThreshold = (qty, unit = 'm') => {
  if (!qty || !Number.isFinite(qty)) return '';
  return `${qty.toLocaleString()}${unit}+`;
};
