/**
 * Returns the fabric's display name with the construction appended where it
 * materially adds information — cotton, viscose, and greige fabrics where
 * buyers care about thread count / construction notation (40×40, 2/40 × 1/20,
 * 76×68 etc.). Avoids duplication if the construction is already in the name.
 */
const CATEGORIES_WITH_CONSTRUCTION = new Set(["cat-cotton", "cat-viscose"]);

export const displayFabricName = (fabric) => {
  if (!fabric) return "";
  const base = fabric.name || "";
  const construction = (fabric.construction || "").trim();
  if (!construction) return base;

  const categoryId = fabric.category_id || "";
  const categoryName = (fabric.category_name || "").toLowerCase();
  const pattern = (fabric.pattern || "").toLowerCase();

  const isEligible =
    CATEGORIES_WITH_CONSTRUCTION.has(categoryId) ||
    categoryName.includes("viscose") ||
    categoryName.includes("cotton") ||
    pattern === "greige";

  if (!isEligible) return base;
  // Avoid duplicating if admin already typed it into the name
  if (base.toLowerCase().includes(construction.toLowerCase())) return base;
  return `${base} · ${construction}`;
};
