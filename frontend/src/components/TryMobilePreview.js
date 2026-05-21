import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Smartphone, X, ExternalLink, RotateCw } from "lucide-react";

// Floating launcher + side-pane phone frame that mirrors /m inside an iframe.
// Hidden on real mobile devices (they auto-redirect to /m anyway) and on /m/* routes themselves.
export default function TryMobilePreview() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [path, setPath] = useState("/m");

  // Detect viewport (re-check on resize so dev-tools mobile mode hides the button)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Listen for navigation events from inside the iframe so the path label stays in sync.
  useEffect(() => {
    if (!open) return;
    const onMsg = (e) => {
      if (e.data && e.data.__lf_mobile_path) setPath(e.data.__lf_mobile_path);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  // Hide on /m/* routes or on small viewports (real phones already redirect)
  if (pathname.startsWith("/m")) return null;
  if (isMobile) return null;

  const reload = () => setIframeKey((k) => k + 1);
  const openInNewTab = () => window.open("/m", "_blank", "noopener,noreferrer");

  return (
    <>
      {/* Launcher button (desktop only) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Try mobile preview"
          style={{
            position: "fixed", right: 24, bottom: 96, zIndex: 999,
            padding: "12px 18px 12px 14px", borderRadius: 999,
            background: "linear-gradient(135deg, #FF7A3D, #E5631E)",
            color: "#fff", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            fontWeight: 700, fontSize: 14, letterSpacing: "-0.005em",
            boxShadow: "0 10px 28px rgba(255,122,61,0.45), 0 2px 6px rgba(15,27,45,0.12)",
            transition: "transform .15s ease, box-shadow .15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <Smartphone size={18} strokeWidth={2.3} />
          Try mobile preview
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,27,45,0.45)",
            zIndex: 998, backdropFilter: "blur(2px)",
            animation: "lfFadeIn .2s ease",
          }}
        />
      )}

      {/* Side panel with phone frame */}
      {open && (
        <aside
          role="dialog"
          aria-label="Mobile preview"
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: 460, maxWidth: "95vw",
            background: "#0F1B2D",
            zIndex: 999,
            display: "flex", flexDirection: "column",
            boxShadow: "-20px 0 60px rgba(15,27,45,0.35)",
            animation: "lfSlideIn .25s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Panel header */}
          <header style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "linear-gradient(135deg, #FF7A3D, #E5631E)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 14,
            }}>L</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Mobile preview</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {path}
              </div>
            </div>
            <button
              onClick={reload}
              aria-label="Reload"
              style={iconBtn()}
            >
              <RotateCw size={16} />
            </button>
            <button
              onClick={openInNewTab}
              aria-label="Open in new tab"
              style={iconBtn()}
            >
              <ExternalLink size={16} />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={iconBtn()}
            >
              <X size={18} />
            </button>
          </header>

          {/* Phone frame */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 18px", overflow: "hidden",
            background: "radial-gradient(ellipse at top, #1e293b 0%, #0F1B2D 60%)",
          }}>
            <div style={{
              position: "relative",
              width: 390, maxWidth: "100%",
              aspectRatio: "390 / 844",
              maxHeight: "calc(100vh - 130px)",
              borderRadius: 44,
              padding: 10,
              background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
              boxShadow: "0 30px 70px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.06)",
            }}>
              {/* Side button hints */}
              <div style={sideButton({ left: -2, top: 110, height: 30 })} />
              <div style={sideButton({ left: -2, top: 168, height: 56 })} />
              <div style={sideButton({ left: -2, top: 236, height: 56 })} />
              <div style={sideButton({ right: -2, top: 178, height: 90 })} />

              {/* Screen */}
              <div style={{
                position: "relative",
                width: "100%", height: "100%",
                borderRadius: 36, overflow: "hidden",
                background: "#FFF6EE",
              }}>
                {/* Dynamic island */}
                <div style={{
                  position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
                  width: 110, height: 30, borderRadius: 999, background: "#000",
                  zIndex: 5,
                }} />
                <iframe
                  key={iframeKey}
                  src="/m"
                  title="Locofast mobile preview"
                  style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#FFF6EE" }}
                  allow="clipboard-read; clipboard-write; payment"
                  onLoad={(e) => {
                    try {
                      const cw = e.currentTarget.contentWindow;
                      if (!cw) return;
                      // Push path updates back to parent (best-effort, ignore cross-origin errors)
                      const pushPath = () => {
                        try {
                          const p = cw.location.pathname + (cw.location.search || "");
                          window.postMessage({ __lf_mobile_path: p }, "*");
                        } catch (err) { /* same-origin so this should work; ignore otherwise */ }
                      };
                      pushPath();
                      // Listen for pushState/popstate inside the iframe
                      const origPush = cw.history.pushState;
                      const origReplace = cw.history.replaceState;
                      cw.history.pushState = function () { origPush.apply(this, arguments); pushPath(); };
                      cw.history.replaceState = function () { origReplace.apply(this, arguments); pushPath(); };
                      cw.addEventListener("popstate", pushPath);
                    } catch (err) { /* cross-origin guard */ }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Quick links */}
          <footer style={{
            padding: "10px 14px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            display: "flex", gap: 6, flexWrap: "wrap",
          }}>
            {[
              { l: "Home", p: "/m" },
              { l: "Catalog", p: "/m/catalog" },
              { l: "RFQ", p: "/m/rfq" },
              { l: "Login", p: "/m/login" },
              { l: "Account", p: "/m/account" },
            ].map((q) => (
              <button
                key={q.p}
                onClick={() => {
                  setPath(q.p);
                  setIframeKey((k) => k + 1);
                  // Wait next tick so iframe key change actually swaps src
                  setTimeout(() => {
                    const f = document.querySelector('iframe[title="Locofast mobile preview"]');
                    if (f) f.src = q.p;
                  }, 30);
                }}
                style={{
                  background: "rgba(255,255,255,0.08)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "6px 12px", borderRadius: 999,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  letterSpacing: "-0.005em",
                }}
              >
                {q.l}
              </button>
            ))}
          </footer>
        </aside>
      )}

      <style>{`
        @keyframes lfFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lfSlideIn { from { transform: translateX(40px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </>
  );
}

function iconBtn() {
  return {
    width: 34, height: 34, borderRadius: 10,
    background: "rgba(255,255,255,0.08)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "background .15s ease",
  };
}

function sideButton({ left, right, top, height }) {
  return {
    position: "absolute",
    left, right, top, height, width: 3,
    borderRadius: 2,
    background: "linear-gradient(90deg, #2a2a2a, #0a0a0a)",
  };
}
