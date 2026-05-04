/**
 * Injects Cloudinary delivery optimizations (f_auto, q_auto, width) AND a
 * "Locofast" watermark overlay into image URLs. Non-Cloudinary URLs are
 * returned unchanged so external/seed/Unsplash assets are never modified.
 *
 * Input : https://res.cloudinary.com/<cloud>/image/upload/v123/fabrics/abc.jpg
 * Output: https://res.cloudinary.com/<cloud>/image/upload/
 *           f_auto,q_auto,w_400/
 *           l_text:Arial_60_bold:Locofast,co_white,o_30,g_south_east,x_18,y_18/
 *           v123/fabrics/abc.jpg
 *
 * Originals stored in Cloudinary remain pristine — watermark is render-time
 * only, fully cached at the CDN edge, no quality penalty.
 */

// ---- Watermark config (single source of truth) ---------------------------
// Disable globally by setting REACT_APP_DISABLE_WATERMARK=true (e.g. for
// premium accounts or admin previews).
const WATERMARK_DISABLED = process.env.REACT_APP_DISABLE_WATERMARK === "true";

// Translucent white "Locofast" text, bottom-right, 18px from the corner.
// Font size scales naturally with the requested width (Cloudinary clamps it).
const WATERMARK_LAYER =
  "l_text:Arial_60_bold:Locofast,co_white,o_30,g_south_east,x_18,y_18";


export const optimizeCloudinaryImage = (url, width, { watermark = true } = {}) => {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  // Avoid double-injecting if our transform is already present
  if (/\/image\/upload\/[^/]*(f_auto|q_auto|w_\d+)/.test(url)) return url;
  if (url.includes("l_text:Arial")) return url;

  const w = Number.isFinite(+width) && +width > 0 ? `,w_${+width}` : "";
  const wm = watermark && !WATERMARK_DISABLED ? `/${WATERMARK_LAYER}` : "";
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto${w}${wm}/`);
};

/** Thumbnail for grid cards / lists (~400px) */
export const thumbImage = (url) => optimizeCloudinaryImage(url, 400);

/** Medium image for detail previews (~800px) */
export const mediumImage = (url) => optimizeCloudinaryImage(url, 800);

/** Large / hero image (~1600px) */
export const largeImage = (url) => optimizeCloudinaryImage(url, 1600);

/** Clean (no watermark) version — for admin previews / brand book exports */
export const cleanImage = (url, width) =>
  optimizeCloudinaryImage(url, width, { watermark: false });

/**
 * Returns the best available "cover" image URL for a fabric, falling back
 * through: root images → first color_variant image → undefined.
 *
 * Multi-color SKUs (e.g. denim sold in Indigo ×White) often store imagery on
 * `color_variants[i].image_url` with an empty root `images` array; this helper
 * makes card thumbnails resilient to either storage pattern.
 */
export const fabricCoverImage = (fabric) => {
  if (!fabric) return undefined;
  const rootImg = Array.isArray(fabric.images) ? fabric.images[0] : undefined;
  if (rootImg) return rootImg;
  const variants = Array.isArray(fabric.color_variants) ? fabric.color_variants : [];
  for (const v of variants) {
    if (v && v.image_url) return v.image_url;
    if (v && Array.isArray(v.images) && v.images[0]) return v.images[0];
  }
  return undefined;
};
