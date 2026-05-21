// Registers the mobile PWA service worker. Only call from inside /m/* routes.
export function registerMobileSW() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (window.__lf_mobile_sw_registered) return;
  window.__lf_mobile_sw_registered = true;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw-mobile.js", { scope: "/m" })
      .then((reg) => {
        // Optional: log update available
        reg.addEventListener && reg.addEventListener("updatefound", () => {});
      })
      .catch(() => {
        // Silent — PWA install is a progressive enhancement
      });
  });
}
