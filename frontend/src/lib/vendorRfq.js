/**
 * Tiny presentational helpers for the Vendor RFQ list/detail pages.
 * Keeping them out of the page components so JSX stays readable.
 */
export const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "closed", label: "Closed" },
];

export const PERIOD_TABS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

export const FABRIC_STATES = ["Greige", "Dyed", "RFD", "Printed"];
export const QUOTE_BASIS = [
  { key: "x-factory", label: "Ex-factory" },
  { key: "door-delivered", label: "Door-delivered" },
];

export const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export const formatINR = (n) => {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
};

/** Plain-language summary of an RFQ for catalog cards. */
export const rfqTitle = (rfq) => {
  const cat = (rfq?.category || "").toLowerCase();
  const map = {
    cotton: "Cotton",
    viscose: "Viscose",
    denim: "Denim",
    knits: "Knits",
  };
  const base = map[cat] || cat || "Fabric";
  const state = rfq?.fabric_requirement_type || "";
  return state ? `${base} — ${state}` : base;
};

/** Pick a few headline fabric specs out of message/specifications text. */
export const rfqSpecChips = (rfq) => {
  const chips = [];
  if (rfq?.fabric_requirement_type) chips.push(rfq.fabric_requirement_type);
  if (rfq?.knit_quality) chips.push(rfq.knit_quality);
  if (rfq?.denim_specification) {
    const head = rfq.denim_specification.split(",").slice(0, 3).join(", ");
    chips.push(head);
  }
  return chips;
};
