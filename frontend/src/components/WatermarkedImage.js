/**
 * Wraps any <img> in a relatively-positioned container and overlays a
 * translucent "Locofast" wordmark in the bottom-right corner. Works for ALL
 * image sources (Cloudinary, backend `/api/uploads/...`, Unsplash, etc.) —
 * the overlay is rendered in CSS so the underlying image quality is never
 * touched.
 *
 * Why CSS rather than baking into the file:
 *   • Most fabric photos on this deployment are served from the backend's
 *     `/api/uploads/...` route, not Cloudinary, so URL-transform watermarks
 *     can't reach them.
 *   • Avoids any image-processing cost on upload or backfill of 200+ assets.
 *   • Originals on disk stay pristine — useful for admin exports / quality
 *     checks and reversible if the watermark scheme ever changes.
 *
 * The overlay reinforces the brand on screenshots / WhatsApp shares /
 * competitor recon, which is the realistic threat model. It is NOT a theft-
 * proof defence — anyone can right-click → save and get the clean original.
 * If full protection is ever needed we can add server-side Pillow burn-in.
 */
import React from "react";

const DISABLED = process.env.REACT_APP_DISABLE_WATERMARK === "true";

const WatermarkedImage = React.forwardRef(function WatermarkedImage(
  {
    src,
    alt = "",
    className = "",
    wrapperClassName = "",
    style,
    watermark = true,
    watermarkSize = "md", // "sm" | "md" | "lg"
    ...rest
  },
  ref
) {
  const showWm = watermark && !DISABLED && !!src;

  if (!showWm) {
    return <img ref={ref} src={src} alt={alt} className={className} style={style} {...rest} />;
  }

  const sizeClass =
    watermarkSize === "sm"
      ? "text-[10px] tracking-wide"
      : watermarkSize === "lg"
      ? "text-base tracking-wider"
      : "text-xs tracking-wide";

  return (
    <span className={`relative inline-block ${wrapperClassName}`} data-testid="watermarked-img">
      <img ref={ref} src={src} alt={alt} className={className} style={style} {...rest} />
      <span
        aria-hidden="true"
        className={`pointer-events-none select-none absolute bottom-2 right-2 px-1.5 py-0.5 font-semibold text-white/70 ${sizeClass}`}
        style={{
          textShadow:
            "0 0 2px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.35)",
          letterSpacing: "0.04em",
        }}
      >
        Locofast
      </span>
    </span>
  );
});

export default WatermarkedImage;
