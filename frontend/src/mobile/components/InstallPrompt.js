import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, X } from "lucide-react";

// Pages that have their own sticky bottom action bar — suppressing the
// install banner here prevents it from overlapping the page's primary
// CTAs (e.g. "Book Bulk" on /m/fabric/:id, "Pay" on /m/checkout). The
// banner re-appears as soon as the user navigates away.
const SUPPRESS_PREFIXES = ["/m/fabric/", "/m/checkout", "/m/rfq/", "/m/order"];

export default function InstallPrompt() {
  const location = useLocation();
  const suppressed = SUPPRESS_PREFIXES.some((p) => location.pathname.startsWith(p));
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("lf_pwa_dismiss")) return;

    // Standalone (already installed) — hide
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: no beforeinstallprompt — show manual hint
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos && !isStandalone) {
      setTimeout(() => { setIosHint(true); setVisible(true); }, 8000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("lf_pwa_dismiss", String(Date.now()));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
    localStorage.setItem("lf_pwa_dismiss", String(Date.now()));
  };

  if (!visible || suppressed) return null;

  return (
    <div className="m-install-banner" role="region" aria-label="Install app">
      <Download size={20} style={{ flexShrink: 0, color: "var(--m-orange)" }} />
      <div style={{ flex: 1, lineHeight: 1.35 }}>
        {iosHint ? (
          <>
            <strong>Install Locofast</strong><br />
            <span style={{ opacity: 0.8, fontSize: 12 }}>Tap Share → "Add to Home Screen"</span>
          </>
        ) : (
          <>
            <strong>Add Locofast to Home Screen</strong><br />
            <span style={{ opacity: 0.8, fontSize: 12 }}>Faster access, works offline</span>
          </>
        )}
      </div>
      {!iosHint && deferredPrompt && (
        <button onClick={install}>Install</button>
      )}
      <button className="m-install-close" onClick={dismiss} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
}
