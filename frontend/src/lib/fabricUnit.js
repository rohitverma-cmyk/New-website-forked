/**
 * Shared fabric-unit resolution.
 *
 * Polyester knits and other knitted fabrics are sold by weight (kg) in
 * the Indian textile trade; everything else (denim, woven cottons,
 * linens, polyester woven) is sold by length (metres). Denim is the
 * exception — it's knitted but always traded by length.
 *
 * Use these helpers wherever we surface price-per-X, MOQ, quantity
 * input, or order line totals so the customer/agent UI matches what
 * was actually configured by the vendor.
 */

const DENIM_CATEGORY_ID = "cat-denim";

export const isKnittedFabric = (fabric) =>
  (fabric?.fabric_type || "").toLowerCase() === "knitted";

export const isDenimFabric = (fabric) =>
  fabric?.category_id === DENIM_CATEGORY_ID ||
  (fabric?.category_name || "").toLowerCase().includes("denim");

export const shouldUseKgForFabric = (fabric) =>
  isKnittedFabric(fabric) && !isDenimFabric(fabric);

export const getFabricUnit = (fabric) =>
  shouldUseKgForFabric(fabric) ? "kg" : "m";

export const getFabricUnitLabel = (fabric) =>
  shouldUseKgForFabric(fabric) ? "kilograms" : "meters";
