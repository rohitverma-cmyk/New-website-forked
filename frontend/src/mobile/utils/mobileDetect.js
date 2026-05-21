// Detect mobile-class devices for the auto-redirect heuristic.
// Tuned to be conservative: only redirect REAL phones, never tablets/desktops.
export function isMobileDevice() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const hasTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  const isPhoneUA = /Android.*Mobile|iPhone|iPod|Mobile Safari|Opera Mini|IEMobile/i.test(ua);
  const isNarrow = window.innerWidth <= 480;
  // Both UA and narrow viewport must agree — avoids redirecting tablets or dev tools.
  return isPhoneUA && hasTouch && isNarrow;
}

export function shouldAutoRedirectToMobile(pathname) {
  // Skip redirect if user explicitly opted out
  if (localStorage.getItem("lf_force_desktop") === "1") return false;
  // Already in mobile app — never redirect again
  if (pathname.startsWith("/m")) return false;
  // Don't redirect logged-in admin / vendor / agent / enterprise users
  const protectedRoots = ["/admin", "/vendor", "/agent", "/enterprise", "/brand"];
  if (protectedRoots.some((p) => pathname.startsWith(p))) return false;
  // Don't redirect API-style routes (sitemap, robots)
  if (pathname.startsWith("/api") || pathname.endsWith(".xml") || pathname.endsWith(".txt")) return false;
  // Only redirect known buyer-facing routes
  const buyerRoots = [
    "/", "/fabrics", "/collections", "/inventory", "/about-us", "/how-it-works",
    "/contact", "/faq", "/account", "/rfq", "/request-quote",
    "/checkout", "/order-confirmation", "/customers", "/blog",
  ];
  return buyerRoots.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Build the equivalent /m/* URL for a given desktop path.
export function mapToMobilePath(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  // Direct mappings
  if (path === "/") return "/m" + search;
  if (path === "/fabrics") return "/m/catalog" + search;
  if (path.startsWith("/fabrics/")) {
    const slug = path.replace("/fabrics/", "");
    return `/m/fabric/${slug}` + search;
  }
  if (path === "/account") return "/m/account" + search;
  if (path.startsWith("/account/orders/")) {
    const id = path.replace("/account/orders/", "");
    return `/m/orders/${id}` + search;
  }
  if (path === "/rfq" || path === "/request-quote") return "/m/rfq" + search;
  if (path.startsWith("/account/queries/")) {
    const id = path.replace("/account/queries/", "");
    return `/m/rfq/${id}` + search;
  }
  if (path === "/checkout") return "/m/checkout" + search;
  if (path.startsWith("/order-confirmation/")) {
    const id = path.replace("/order-confirmation/", "");
    return `/m/order-confirmation/${id}` + search;
  }
  if (path === "/inventory") return "/m/inventory" + search;
  if (path === "/collections") return "/m/collections" + search;
  if (path.startsWith("/collections/")) {
    const id = path.replace("/collections/", "");
    return `/m/collections/${id}` + search;
  }
  // Fallback — send to mobile home
  return "/m" + search;
}
