/**
 * Shared country list (name · ISO code · dial code).
 * Used by customer profile to auto-populate phone country code based
 * on the selected country. Kept small + India-first since 95%+ of users.
 */

export const COUNTRIES = [
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "AE", name: "UAE", dial: "+971", flag: "🇦🇪" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
  { code: "LK", name: "Sri Lanka", dial: "+94", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", dial: "+977", flag: "🇳🇵" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
];

export const DEFAULT_COUNTRY = "IN";

export const getCountry = (code) =>
  COUNTRIES.find((c) => c.code === (code || DEFAULT_COUNTRY)) || COUNTRIES[0];

/**
 * Strip any leading dial code from a phone string so the local portion
 * is editable without duplicating "+91" when prefix is shown separately.
 */
export const stripDialCode = (phone, country) => {
  if (!phone) return "";
  const trimmed = String(phone).trim();
  const c = getCountry(country);
  const re = new RegExp(`^\\${c.dial}\\s*`);
  return trimmed.replace(re, "").trim();
};
