import { Truck, Beaker, Clock, Factory } from "lucide-react";

/**
 * Surfaces turnaround promises. Lines are chosen contextually based on whether
 * the fabric has ready inventory (bookable + quantity_available > 0).
 *
 * - Ready Stock → Sample 24–48h, Bulk 24–48h dispatch, Team responds in 24h
 * - Enquiry/MTO → Bulk ~30 days manufacturing, Team responds in 24h
 */
const LINES = {
  sample: {
    icon: Beaker,
    label: "Samples dispatched in 24–48 hours",
    tone: "text-blue-700",
  },
  bulk: {
    icon: Truck,
    label: "Bulk: 24–48 hours for packaging & dispatch",
    tone: "text-emerald-700",
  },
  bulk_mto: {
    icon: Factory,
    label: "Bulk dispatched within ~30 days (manufacturing time)",
    tone: "text-amber-700",
  },
  enquiry: {
    icon: Clock,
    label: "Our team responds to enquiries within 24 hours",
    tone: "text-orange-700",
  },
};

const Line = ({ variant, className = "" }) => {
  const c = LINES[variant];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <p
      className={`inline-flex items-center gap-1.5 text-[11px] ${c.tone} ${className}`}
      data-testid={`dispatch-line-${variant}`}
    >
      <Icon size={12} aria-hidden />
      <span>{c.label}</span>
    </p>
  );
};

/** Single line (explicit variant) — used inline next to a CTA / modal header. */
export const DispatchLine = Line;

/** Decides which lines to show based on fabric inventory state. */
const linesForFabric = (fabric) => {
  const hasStock =
    !!fabric &&
    fabric.is_bookable === true &&
    Number(fabric.quantity_available || 0) > 0;
  return hasStock ? ["sample", "bulk", "enquiry"] : ["bulk_mto", "enquiry"];
};

/**
 * Adaptive strip — pass a `fabric` and the relevant lines render.
 * Falls back to "all three" when no fabric is provided.
 */
export const DispatchStrip = ({ fabric, className = "" }) => {
  const variants = fabric ? linesForFabric(fabric) : ["sample", "bulk", "enquiry"];
  return (
    <div
      className={`rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5 ${className}`}
      data-testid="dispatch-strip"
    >
      {variants.map((v) => (
        <Line key={v} variant={v} className="text-xs" />
      ))}
    </div>
  );
};

export default DispatchStrip;
