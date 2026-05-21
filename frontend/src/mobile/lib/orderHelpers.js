// Order status formatting + visual mapping for the mobile app.

export const ORDER_STATUS = {
  payment_pending: { label: "Awaiting payment", tone: "amber", step: 0 },
  placed: { label: "Order placed", tone: "blue", step: 1 },
  confirmed: { label: "Confirmed", tone: "blue", step: 1 },
  processing: { label: "Processing", tone: "blue", step: 2 },
  in_production: { label: "In production", tone: "blue", step: 2 },
  ready_to_ship: { label: "Ready to ship", tone: "blue", step: 3 },
  shipped: { label: "Shipped", tone: "orange", step: 3 },
  out_for_delivery: { label: "Out for delivery", tone: "orange", step: 4 },
  delivered: { label: "Delivered", tone: "green", step: 5 },
  cancelled: { label: "Cancelled", tone: "red", step: -1 },
  refunded: { label: "Refunded", tone: "red", step: -1 },
};

export function statusLabel(s) {
  if (!s) return "—";
  return ORDER_STATUS[s]?.label || s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function statusTone(s) {
  return ORDER_STATUS[s]?.tone || "blue";
}

export function statusBackground(tone) {
  switch (tone) {
    case "green": return { bg: "var(--m-green-50)", color: "var(--m-green)" };
    case "orange": return { bg: "var(--m-orange-50)", color: "var(--m-orange-700)" };
    case "amber": return { bg: "#fef3c7", color: "var(--m-amber)" };
    case "red": return { bg: "#fee2e2", color: "var(--m-red)" };
    default: return { bg: "var(--m-blue-50)", color: "var(--m-blue)" };
  }
}

export const ORDER_TIMELINE = [
  { key: "placed", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

export function formatDateRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
