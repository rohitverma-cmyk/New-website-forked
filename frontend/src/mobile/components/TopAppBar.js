import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Bell, Search } from "lucide-react";

// Locofast brand mark — inline SVG approximation of the interlocked
// double-checkmark/diamond device from the official logo. Two slanted
// strokes form a connected ✓✓ icon, in brand blue.
const LocofastMark = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M5 13.5 L9 18 L14 4"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 13.5 L14.5 18 L19.5 4"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
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
          <div className="m-appbar-logo">
            <span className="m-appbar-logo-mark" aria-label="Locofast">
              <LocofastMark size={18} />
            </span>
            <span>locofast</span>
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
