/**
 * Fabric certification catalogue. Single source of truth for certification
 * keys, display labels, short badges, descriptions, and chip colors used
 * across the admin form, vendor form, catalog card, PDP, and filter
 * sidebar.
 *
 * Keys are stable strings persisted in `fabric.certifications` on the
 * backend — do NOT rename an existing key without a data migration.
 *
 * Colour themes are grouped by certification family so buyers can read
 * the catalog at a glance:
 *   • green/emerald — organic-fiber family (GOTS, OCS 100/Blended, Organic Exchange)
 *   • lime         — Better Cotton & farm-level (BCI, Cotton USA, CMiA, Supima)
 *   • sky/indigo   — recycled / circular (GRS, RCS, FSC)
 *   • amber/orange — chemistry & safety (OEKO-TEX, Supplier to Zero)
 *   • rose/pink    — social & labour (Fairtrade, SMETA, SLCP)
 *   • teal         — impact measurement (Higg Index)
 *   • slate/blue   — ISO standards
 *   • purple/red   — branded fibre (Tencel, Modal, LYCRA, DuPont Sorona)
 */

export const CERTIFICATIONS = [
  // ── Better Cotton & farm-level ─────────────────────────────────────────
  {
    key: "bci",
    label: "BCI",
    fullName: "Better Cotton Initiative",
    short: "BCI",
    description: "Cotton sourced from farms using better water, soil and worker-welfare practices.",
    chipClass: "bg-lime-50 text-lime-800 border-lime-200",
    dotClass: "bg-lime-600",
  },
  {
    key: "cotton_usa",
    label: "Cotton USA",
    fullName: "Cotton USA",
    short: "Cotton USA",
    description: "Traceable American-grown cotton adhering to US sustainability and labour standards.",
    chipClass: "bg-lime-50 text-lime-800 border-lime-200",
    dotClass: "bg-lime-700",
  },
  {
    key: "cmia",
    label: "CMIA",
    fullName: "Cotton Made in Africa",
    short: "CMIA",
    description: "Sustainable cotton grown and processed in sub-Saharan Africa under the CmiA standard.",
    chipClass: "bg-lime-50 text-lime-800 border-lime-200",
    dotClass: "bg-lime-800",
  },
  {
    key: "supima",
    label: "Supima",
    fullName: "Supima",
    short: "Supima",
    description: "Premium extra-long staple American Pima cotton, trademark-protected.",
    chipClass: "bg-lime-50 text-lime-800 border-lime-200",
    dotClass: "bg-lime-900",
  },

  // ── Organic fiber family ───────────────────────────────────────────────
  {
    key: "gots",
    label: "GOTS",
    fullName: "Global Organic Textile Standard",
    short: "GOTS",
    description: "Stringent end-to-end organic-textile standard covering fibre, processing and social criteria.",
    chipClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-700",
  },
  {
    key: "ocs_100",
    label: "OCS 100",
    fullName: "Organic Content Standard — 100%",
    short: "OCS 100",
    description: "Certified 100% organic fibre content, verified from farm to finished product.",
    chipClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-600",
  },
  {
    key: "ocs_blended",
    label: "OCS Blended",
    fullName: "Organic Blended Content Standard",
    short: "OCS B",
    description: "Minimum 5% certified organic fibres blended with conventional or synthetic materials.",
    chipClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  {
    key: "organic_exchange",
    label: "Organic Exchange",
    fullName: "Organic Exchange",
    short: "Org Exchange",
    description: "Predecessor to OCS — tracks organic fibres through the supply chain.",
    chipClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-800",
  },

  // ── Recycled / circular ────────────────────────────────────────────────
  {
    key: "grs",
    label: "GRS",
    fullName: "Global Recycled Standard",
    short: "GRS",
    description: "Verified recycled content with a traceable supply chain and social / environmental safeguards.",
    chipClass: "bg-sky-50 text-sky-800 border-sky-200",
    dotClass: "bg-sky-600",
  },
  {
    key: "rcs",
    label: "RCS",
    fullName: "Recycled Claim Standard",
    short: "RCS",
    description: "Tracks recycled-content claims through the supply chain (less stringent than GRS).",
    chipClass: "bg-sky-50 text-sky-800 border-sky-200",
    dotClass: "bg-sky-700",
  },
  {
    key: "fsc",
    label: "FSC",
    fullName: "Forest Stewardship Council",
    short: "FSC",
    description: "Responsibly sourced cellulosic fibres (Viscose / Lyocell / etc.) from FSC-certified forests.",
    chipClass: "bg-sky-50 text-sky-800 border-sky-200",
    dotClass: "bg-sky-800",
  },

  // ── Chemistry, safety & impact ─────────────────────────────────────────
  {
    key: "oeko_tex",
    label: "OEKO-TEX",
    fullName: "OEKO-TEX Standard 100 — Confidence in Textiles",
    short: "OEKO-TEX",
    description: "Tested free of harmful substances according to OEKO-TEX® Standard 100.",
    chipClass: "bg-amber-50 text-amber-900 border-amber-200",
    dotClass: "bg-amber-600",
  },
  {
    key: "supplier_to_zero",
    label: "Supplier to Zero",
    fullName: "ZDHC Supplier to Zero",
    short: "S2Z",
    description: "Commitment to Zero Discharge of Hazardous Chemicals in wet-processing operations.",
    chipClass: "bg-amber-50 text-amber-900 border-amber-200",
    dotClass: "bg-amber-700",
  },
  {
    key: "higg",
    label: "Higg Index",
    fullName: "Higg Index",
    short: "Higg",
    description: "Standardised measurement of the environmental and social impact of the product.",
    chipClass: "bg-teal-50 text-teal-800 border-teal-200",
    dotClass: "bg-teal-600",
  },

  // ── Social & labour ────────────────────────────────────────────────────
  {
    key: "fairtrade",
    label: "Fairtrade",
    fullName: "Fairtrade International",
    short: "Fairtrade",
    description: "Guarantees fair prices & decent working conditions for farmers and workers.",
    chipClass: "bg-rose-50 text-rose-800 border-rose-200",
    dotClass: "bg-rose-600",
  },
  {
    key: "smeta",
    label: "SMETA",
    fullName: "Sedex Members Ethical Trade Audit",
    short: "SMETA",
    description: "Ethical-trade audit covering labour, health-and-safety, environment and business ethics.",
    chipClass: "bg-rose-50 text-rose-800 border-rose-200",
    dotClass: "bg-rose-700",
  },
  {
    key: "slcp",
    label: "SLCP",
    fullName: "Social & Labour Convergence Programme",
    short: "SLCP",
    description: "Converged social-and-labour assessment shared across brands and factories.",
    chipClass: "bg-rose-50 text-rose-800 border-rose-200",
    dotClass: "bg-rose-800",
  },

  // ── ISO management standards ──────────────────────────────────────────
  {
    key: "iso_14001",
    label: "ISO 14001",
    fullName: "ISO 14001 — Environmental Management",
    short: "ISO 14001",
    description: "Certified environmental-management system at the manufacturing facility.",
    chipClass: "bg-slate-50 text-slate-800 border-slate-200",
    dotClass: "bg-slate-600",
  },
  {
    key: "iso_45001",
    label: "ISO 45001",
    fullName: "ISO 45001 — Occupational Health & Safety",
    short: "ISO 45001",
    description: "Certified occupational-health-and-safety management system.",
    chipClass: "bg-slate-50 text-slate-800 border-slate-200",
    dotClass: "bg-slate-700",
  },

  // ── Branded / ingredient fibres ────────────────────────────────────────
  {
    key: "tencel",
    label: "Tencel",
    fullName: "TENCEL™ Lyocell / Modal",
    short: "Tencel",
    description: "Lenzing-branded cellulosic fibres produced in a closed-loop, solvent-recovered process.",
    chipClass: "bg-purple-50 text-purple-800 border-purple-200",
    dotClass: "bg-purple-600",
  },
  {
    key: "lenzing_modal",
    label: "Lenzing Modal",
    fullName: "Lenzing Modal",
    short: "Modal",
    description: "Beech-wood Modal cellulosic fibre from Lenzing — soft hand-feel & durability.",
    chipClass: "bg-purple-50 text-purple-800 border-purple-200",
    dotClass: "bg-purple-700",
  },
  {
    key: "lycra",
    label: "LYCRA",
    fullName: "LYCRA® Fibre",
    short: "LYCRA",
    description: "Trademarked elastane fibre from The LYCRA Company — verified stretch & recovery.",
    chipClass: "bg-red-50 text-red-800 border-red-200",
    dotClass: "bg-red-600",
  },
  {
    key: "dupont_sorona",
    label: "Sorona",
    fullName: "DuPont™ Sorona®",
    short: "Sorona",
    description: "Bio-based partially-renewable polymer with soft hand and inherent stretch.",
    chipClass: "bg-purple-50 text-purple-800 border-purple-200",
    dotClass: "bg-purple-800",
  },
];

export const CERT_BY_KEY = Object.fromEntries(CERTIFICATIONS.map((c) => [c.key, c]));

// Resolve a list of certification keys (as persisted on the fabric) into
// the display records above. Unknown keys are dropped silently so legacy
// data never breaks rendering.
export const resolveCerts = (keys) => {
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => CERT_BY_KEY[k]).filter(Boolean);
};
