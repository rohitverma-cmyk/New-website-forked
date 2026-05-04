/**
 * Rewrites a Cloudinary video URL to request an H.264/MP4 transcoding so that
 * every browser (Chrome, Safari, Firefox, Edge) can play it, regardless of the
 * original codec the vendor uploaded (HEVC .mov, AVI, WebM, etc.).
 *
 * Input:  https://res.cloudinary.com/<cloud>/video/upload/v123/fabrics/abc.mov
 * Output: https://res.cloudinary.com/<cloud>/video/upload/f_mp4,vc_h264,q_auto/v123/fabrics/abc.mp4
 *
 * Non-Cloudinary URLs are returned as-is.
 */
export const toWebVideoUrl = (url) => {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return url;
  // Avoid double-injecting the transform
  if (/\/video\/upload\/[^/]*f_mp4/.test(url)) return url;

  let rewritten = url.replace("/video/upload/", "/video/upload/f_mp4,vc_h264,q_auto/");
  // Swap the trailing extension to .mp4 so servers/proxies see a consistent
  // extension. Cloudinary will transcode regardless, but this matches the URL
  // intent and helps caching/CDN behaviour.
  rewritten = rewritten.replace(/\.(mov|avi|mkv|webm|m4v|wmv|flv|mpg|mpeg|3gp|hevc|heic)(\?|$)/i, ".mp4$2");
  return rewritten;
};

/**
 * Same URL but explicitly targeting a smaller preview (poster/thumbnail loop).
 */
export const toWebVideoPreviewUrl = (url) => {
  const full = toWebVideoUrl(url);
  if (full === url) return url;
  return full.replace("/video/upload/", "/video/upload/w_800,").replace(",f_mp4", ",f_mp4");
};

/**
 * Derives a JPG poster frame from a Cloudinary video URL (shown as the card
 * thumbnail and as the `poster` attribute on <video> so users see a still
 * instead of a black rectangle before they press play).
 */
export const videoPosterUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return "";
  return url
    .replace("/video/upload/", "/video/upload/so_auto,w_800,f_jpg,q_auto/")
    .replace(/\.(mov|avi|mkv|webm|m4v|wmv|flv|mpg|mpeg|3gp|mp4|hevc|heic)(\?|$)/i, ".jpg$2");
};
