// Mobile-friendly formatters for fabric data shapes returned by /api/fabrics.

export function formatCompositionShort(composition, fallback = "") {
  if (!composition) return fallback;
  if (typeof composition === "string") return composition;
  if (!Array.isArray(composition)) return fallback;
  return composition
    .filter((c) => c && c.material)
    .map((c) => `${Math.round(c.percentage || 0)}% ${c.material}`)
    .join(" · ");
}

export function formatCompositionPills(composition) {
  if (!composition) return [];
  if (typeof composition === "string") return [composition];
  if (!Array.isArray(composition)) return [];
  return composition
    .filter((c) => c && c.material)
    .map((c) => `${Math.round(c.percentage || 0)}/${c.material.split(" ")[0]}`);
}

export function formatWeight(fabric) {
  if (!fabric) return "";
  if (fabric.weight_unit === "ounce" && fabric.ounce) return `${fabric.ounce} oz`;
  if (fabric.gsm) return `${fabric.gsm} GSM`;
  return "";
}

export function formatWidth(fabric) {
  if (!fabric) return "";
  const w = fabric.width;
  if (!w) return "";
  // Strip 'inches' if already there
  const clean = String(w).replace(/\s*inches?$/i, "");
  if (/^\d+(\.\d+)?$/.test(clean.trim())) return `${clean.trim()}"`;
  return clean;
}

export function formatPriceINR(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return null;
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function getBulkPrice(fabric) {
  if (!fabric) return null;
  // Pricing tiers (list of {min_qty, rate}) — cheapest tier wins
  if (Array.isArray(fabric.pricing_tiers) && fabric.pricing_tiers.length) {
    const lowest = fabric.pricing_tiers
      .map((t) => parseFloat(t.rate))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b)[0];
    if (lowest) return lowest;
  }
  if (fabric.rate_per_meter) return parseFloat(fabric.rate_per_meter);
  return null;
}

export function getSamplePrice(fabric) {
  if (!fabric) return null;
  if (fabric.sample_price != null && fabric.sample_price !== "") {
    const num = parseFloat(fabric.sample_price);
    return isNaN(num) ? null : num;
  }
  return null;
}

export function getStockBadge(fabric) {
  if (!fabric) return null;
  const qty = fabric.quantity_available;
  if (qty == null || qty === "") return null;
  const num = parseFloat(qty);
  if (isNaN(num) || num <= 0) return { label: "Out of stock", tone: "red" };
  if (num < 1000) return { label: `${Math.round(num).toLocaleString("en-IN")}m · Low stock`, tone: "amber" };
  return { label: `${Math.round(num).toLocaleString("en-IN")}m available`, tone: "green" };
}

export function getFabricUrl(fabric) {
  if (!fabric) return "/m/catalog";
  return `/m/fabric/${fabric.slug || fabric.id}`;
}

export function getPrimaryImage(fabric) {
  if (!fabric) return null;
  if (Array.isArray(fabric.images) && fabric.images.length) return fabric.images[0];
  return null;
}

export function formatRelativeAvailability(fabric) {
  const arr = fabric?.availability || [];
  if (arr.includes("Sample")) return "Sample-ready";
  if (arr.includes("Bulk")) return "Bulk only";
  if (arr.includes("On Request")) return "On request";
  return null;
}
