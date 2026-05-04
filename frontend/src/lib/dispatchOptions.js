// Standardised dispatch-timeline options for fabric uploads.
//
// Locofast policy:
//   • Inventory (Ready Stock)  → choose 1–2, 3–5, 6–9, or 10–14 days
//   • Made to Order            → choose 15, 20, 25, ..., 75 days (5-day increments)
//
// The same value populates BOTH bulk and sample dispatch promises — Locofast
// does not split timelines per order type at the catalog layer.

export const READY_STOCK_DISPATCH_OPTIONS = [
  { value: "1-2 days",   label: "1–2 days" },
  { value: "3-5 days",   label: "3–5 days" },
  { value: "6-9 days",   label: "6–9 days" },
  { value: "10-14 days", label: "10–14 days" },
];

export const MADE_TO_ORDER_DISPATCH_OPTIONS = [
  { value: "15 days", label: "15 days" },
  { value: "20 days", label: "20 days" },
  { value: "25 days", label: "25 days" },
  { value: "30 days", label: "30 days" },
  { value: "35 days", label: "35 days" },
  { value: "40 days", label: "40 days" },
  { value: "45 days", label: "45 days" },
  { value: "50 days", label: "50 days" },
  { value: "55 days", label: "55 days" },
  { value: "60 days", label: "60 days" },
  { value: "65 days", label: "65 days" },
  { value: "70 days", label: "70 days" },
  { value: "75 days", label: "75 days" },
];

/**
 * Returns the options array for a given stock_type.
 * Defaults to ready-stock options.
 */
export const getDispatchOptions = (stockType) =>
  stockType === "made_to_order"
    ? MADE_TO_ORDER_DISPATCH_OPTIONS
    : READY_STOCK_DISPATCH_OPTIONS;
