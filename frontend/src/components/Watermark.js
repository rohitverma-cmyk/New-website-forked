/**
 * Locofast brand watermark overlay.
 *
 * One canonical look only — a small pill (woven-X mark + "Locofast"
 * wordmark) anchored in the bottom-right corner of the image. We
 * intentionally do NOT render any centered/tiled variant anymore — those
 * looked intrusive and confused buyers ("Locof" cropped, "Locofast"
 * stretched across the photo, etc.).
 *
 * Variants kept for opt-in only via REACT_APP_WATERMARK_VARIANT:
 *   "hover-chip" — invisible until card hover (glassmorphic pill)
 *   "label"      — tiny corner text only (legacy)
 *
 * Set REACT_APP_DISABLE_WATERMARK=true to hide site-wide.
 */
import React from "react";

const DISABLED = process.env.REACT_APP_DISABLE_WATERMARK === "true";
const DEFAULT_VARIANT = process.env.REACT_APP_WATERMARK_VARIANT || "corner-pill";

// Official Locofast woven-X monogram, extracted from the brand SVG.
const LocofastMark = ({ size = 14, color = "white", className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="100 0 200 200"
    aria-hidden="true"
    className={className}
    style={{ flexShrink: 0 }}
  >
    <g fill={color}>
      <path d="M113.47 40.0946C107.343 46.2214 107.343 56.155 113.47 62.2818L173.375 122.187L195.563 100L135.657 40.0946C129.53 33.9678 119.597 33.9678 113.47 40.0946Z" />
      <path d="M104.595 84.469C98.4683 90.5958 98.4683 100.529 104.595 106.656L146.751 148.812L168.938 126.625L126.782 84.469C120.655 78.3422 110.722 78.3422 104.595 84.469Z" />
      <path d="M259.905 13.47C253.779 7.34316 243.845 7.34317 237.718 13.47L177.813 73.3754L200 95.5626L259.905 35.6572C266.032 29.5303 266.032 19.5968 259.905 13.47Z" />
      <path d="M215.531 4.59511C209.404 -1.53172 199.471 -1.5317 193.344 4.59513L151.188 46.7508L173.375 68.9379L215.531 26.7823C221.658 20.6555 221.658 10.7219 215.531 4.59511Z" />
      <path d="M286.53 159.905C292.657 153.779 292.657 143.845 286.53 137.718L226.625 77.8128L204.437 100L264.343 159.905C270.47 166.032 280.403 166.032 286.53 159.905Z" />
      <path d="M295.405 115.531C301.532 109.404 301.532 99.4707 295.405 93.3438L253.249 51.1882L231.062 73.3754L273.218 115.531C279.345 121.658 289.278 121.658 295.405 115.531Z" />
      <path d="M140.095 186.53C146.221 192.657 156.155 192.657 162.282 186.53L222.187 126.625L200 104.437L140.095 164.343C133.968 170.47 133.968 180.403 140.095 186.53Z" />
      <path d="M184.469 195.405C190.596 201.532 200.529 201.532 206.656 195.405L248.812 153.249L226.625 131.062L184.469 173.218C178.342 179.345 178.342 189.278 184.469 195.405Z" />
    </g>
  </svg>
);

const Watermark = ({ variant = DEFAULT_VARIANT, className = "" }) => {
  if (DISABLED) return null;

  // ── Option: invisible until hover (kept for niche use) ────────────────
  if (variant === "hover-chip") {
    return (
      <span
        aria-hidden="true"
        data-testid="img-watermark"
        className={`pointer-events-none select-none absolute bottom-2 right-2
                    opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                    backdrop-blur-md bg-white/15 border border-white/30
                    text-white text-[11px] font-semibold tracking-wide ${className}`}
        style={{ zIndex: 1, boxShadow: "0 1px 6px rgba(0,0,0,0.35)" }}
      >
        <LocofastMark size={11} color="white" />
        Locofast
      </span>
    );
  }

  // ── Legacy tiny corner label ──────────────────────────────────────────
  if (variant === "label") {
    return (
      <span
        aria-hidden="true"
        data-testid="img-watermark"
        className={`pointer-events-none select-none absolute bottom-2 right-2 inline-flex items-center gap-1
                    font-semibold text-white/85 text-xs tracking-wide ${className}`}
        style={{
          textShadow: "0 0 2px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.35)",
          letterSpacing: "0.04em",
          zIndex: 1,
        }}
      >
        <LocofastMark size={10} color="white" />
        Locofast
      </span>
    );
  }

  // ── Default — small pill, bottom-right corner ─────────────────────────
  // This is the only "always visible" variant we ship. White-on-dark glass
  // pill with the Locofast woven-X mark + wordmark, sized so it stays out
  // of the way of the actual fabric photo.
  return (
    <div
      aria-hidden="true"
      data-testid="img-watermark"
      className={`pointer-events-none select-none absolute bottom-3 right-3 ${className}`}
      style={{ zIndex: 1 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: "rgba(31, 41, 55, 0.45)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      >
        <LocofastMark size={14} color="rgba(255,255,255,0.95)" />
        <span
          className="font-semibold tracking-wide text-white"
          style={{
            fontSize: "13px",
            textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            letterSpacing: "0.04em",
          }}
        >
          Locofast
        </span>
      </div>
    </div>
  );
};

export default Watermark;
export { LocofastMark };
