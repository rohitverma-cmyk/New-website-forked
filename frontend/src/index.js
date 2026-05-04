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

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
