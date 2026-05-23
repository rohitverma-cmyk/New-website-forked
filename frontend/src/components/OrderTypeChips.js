/**
 * Shared chip pair: <Sample|Bulk> + <Inventory|RFQ>.
 * Rendered everywhere we list an order so vendors/admins can scan the
 * order type and the lead origin without opening the detail modal.
 */
import { FlaskConical, Layers, Sparkles, Tag } from "lucide-react";

const isAllSamples = (order) => {
  const items = order?.items || [];
  if (!items.length) return false;
  return items.every((it) => (it.order_type || "bulk").toLowerCase() === "sample");
};

export const getOrderTypeLabel = (order) => (isAllSamples(order) ? "Sample" : "Bulk");
export const getOrderSourceLabel = (order) => ((order?.source || "inventory") === "rfq" ? "RFQ" : "Inventory");

/** Pill style preset — size variants tuned for the surfaces we use. */
const SIZE_CLASS = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-[11px] px-2 py-0.5",
};

export const OrderTypeChip = ({ order, size = "xs" }) => {
  const sample = isAllSamples(order);
  const tone = sample
    ? "bg-sky-50 text-sky-700 border border-sky-200"
    : "bg-orange-50 text-orange-700 border border-orange-200";
  const Icon = sample ? FlaskConical : Layers;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${SIZE_CLASS[size]} ${tone}`}
      data-testid={`order-type-chip-${sample ? "sample" : "bulk"}`}
    >
      <Icon size={size === "sm" ? 11 : 10} /> {sample ? "Sample" : "Bulk"}
    </span>
  );
};

export const OrderSourceChip = ({ order, size = "xs" }) => {
  const isRfq = (order?.source || "inventory") === "rfq";
  const tone = isRfq
    ? "bg-violet-50 text-violet-700 border border-violet-200"
    : "bg-gray-50 text-gray-700 border border-gray-200";
  const Icon = isRfq ? Sparkles : Tag;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${SIZE_CLASS[size]} ${tone}`}
      data-testid={`order-source-chip-${isRfq ? "rfq" : "inventory"}`}
    >
      <Icon size={size === "sm" ? 11 : 10} /> {isRfq ? "RFQ" : "Inventory"}
    </span>
  );
};

/** Inline pair used in row layouts — convenience for the common case. */
export const OrderTypeChipPair = ({ order, size = "xs" }) => (
  <span className="inline-flex items-center gap-1.5 flex-wrap">
    <OrderTypeChip order={order} size={size} />
    <OrderSourceChip order={order} size={size} />
  </span>
);
