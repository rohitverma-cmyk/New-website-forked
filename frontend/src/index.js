import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "@/index.css";
import App from "@/App";

// --- Service-worker & cache buster ----------------------------------------
// Older CRA builds shipped a service worker (`service-worker.js`) that still
// lives in some buyers' browsers and serves the stale bundle even after we
// redeploy. Nothing in our current source registers one — so it's safe to
// nuke any registration on every page load and purge the associated caches.
// This is fire-and-forget: failures are ignored; a successful purge makes
// the NEXT refresh pick up the newest bundle automatically.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        r.unregister().catch(() => {});
      });
    });
  } catch (e) {
    // Older browsers without getRegistrations — ignore.
  }
}
if (typeof window !== "undefined" && "caches" in window) {
  try {
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        // Only purge caches we own; leaves third-party cache buckets alone.
        if (/workbox|precache|runtime|locofast/i.test(k)) {
          caches.delete(k).catch(() => {});
        }
      });
    });
  } catch (e) {
    // Ignore — nothing to do.
  }
}

// --- Stale chunk auto-recovery --------------------------------------------
// After a fresh deploy, tabs that were opened against the old build still
// reference JS chunk filenames (e.g. `4754.90c8b616.chunk.js`) that no
// longer exist on the server. The lazy import rejects with a ChunkLoadError
// and React Suspense silently leaves the user on a blank screen.
// We catch those errors here and force ONE full reload — the browser then
// re-fetches the new `index.html` with current chunk hashes. A sessionStorage
// flag prevents an infinite reload loop if the error is unrelated to chunks.
if (typeof window !== "undefined") {
  const RELOAD_KEY = "lf_chunk_reload_attempted";
  const isChunkError = (err) => {
    const msg = (err && (err.message || String(err))) || "";
    return (
      /ChunkLoadError/i.test(msg) ||
      /Loading chunk [\d]+ failed/i.test(msg) ||
      /Loading CSS chunk/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg)
    );
  };
  const tryRecover = (err) => {
    if (!isChunkError(err)) return;
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
    sessionStorage.setItem(RELOAD_KEY, "1");
    window.location.reload();
  };
  window.addEventListener("error", (e) => tryRecover(e.error || e));
  window.addEventListener("unhandledrejection", (e) => tryRecover(e.reason));
  // Clear the flag after a successful render so a future stale-chunk event
  // (next deploy) can recover again.
  window.addEventListener("load", () => {
    setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 4000);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
