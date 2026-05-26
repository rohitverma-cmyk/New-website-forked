import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Bell, Search } from "lucide-react";

// Locofast brand mark — official square favicon asset (interlocked weave).
// Lives under /public/brand/. We use <img> so the asset is cacheable + the
// design team owns the artwork (vs. inline SVG which drifts over time).
const LocofastMark = ({ size = 24 }) => (
  <img
    src="/brand/locofast-mark.png"
    alt="Locofast"
    width={size}
    height={size}
    style={{ display: "block", objectFit: "contain" }}
    draggable={false}
  />
);

export default function TopAppBar({ title, showBack, showSearch = true, showNotifications = true, onSearchClick, hasNotifications = false, right = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/m" || location.pathname === "/m/";
  // Auto-decision: show back button on every non-home route unless the
  // page explicitly opts out by passing showBack={false}. Previously this
  // defaulted to false everywhere, leaving secondary screens (e.g.
  // /m/rfq triggered from the fabric-detail chat icon) with no way back.
  const effectiveShowBack = typeof showBack === "boolean" ? showBack : !isHome;

  return (
    <header className="m-appbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        {effectiveShowBack && !isHome ? (
          <button className="m-icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="m-appbar-logo" style={{ height: 30, display: "flex", alignItems: "center" }}>
            <img
              src="/brand/locofast-logo.png"
              alt="Locofast"
              style={{ height: 26, width: "auto", display: "block" }}
              draggable={false}
            />
          </div>
        )}
        {title && (
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-ink)", marginLeft: showBack ? 4 : 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
        )}
      </div>
      <div className="m-appbar-actions">
        {right}
        {showSearch && (
          <button className="m-icon-btn" onClick={onSearchClick || (() => navigate("/m/catalog?focus=search"))} aria-label="Search">
            <Search size={20} />
          </button>
        )}
        {showNotifications && (
          <button className="m-icon-btn" onClick={() => navigate("/m/notifications")} aria-label="Notifications">
            <Bell size={20} />
            {hasNotifications && <span className="m-dot" />}
          </button>
        )}
      </div>
    </header>
  );
}
