/**
 * INR currency helpers.
 *
 * Locofast's brand portal shows two distinct numbers that must never be confused:
 *
 *   1. Credit Limit — a rupee amount from embedded lender lines. Large. Display
 *      as Indian lacs (₹X.XX L) as the hero number, with the exact rupees
 *      underneath for precision.
 *   2. Sample Credits — a count-based quota (₹1 = 1 credit). Display as an
 *      integer with no currency symbol, sub-labelled "sample credits".
 */

export const toLacs = (rupees) => Number(rupees || 0) / 100000;

/** Big "₹6.00 L" style headline used for credit limits. */
export const fmtLacs = (rupees, decimals = 2) => {
  const n = Number(rupees || 0);
  return `₹${(n / 100000).toFixed(decimals)} L`;
};

/** Full ₹6,00,000.00 style (Indian grouping). Used as sub-text under the lacs headline. */
export const fmtINR = (rupees, withDecimals = true) =>
  `₹${Number(rupees || 0).toLocaleString("en-IN", {
    maximumFractionDigits: withDecimals ? 2 : 0,
    minimumFractionDigits: withDecimals ? 2 : 0,
  })}`;

/** Plain integer count for sample credits (no currency symbol). */
export const fmtCount = (n) => Number(n || 0).toLocaleString("en-IN");
