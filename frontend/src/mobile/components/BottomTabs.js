import { NavLink } from "react-router-dom";
import { Home, LayoutGrid, FileText, Package, User } from "lucide-react";

const TABS = [
  { to: "/m", label: "Home", icon: Home, end: true },
  { to: "/m/catalog", label: "Catalog", icon: LayoutGrid },
  { to: "/m/rfq", label: "Quote", icon: FileText },
  { to: "/m/orders", label: "Orders", icon: Package },
  { to: "/m/account", label: "Account", icon: User },
];

export default function BottomTabs() {
  return (
    <nav className="m-tabs" aria-label="Primary">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => "m-tab" + (isActive ? " active" : "")}
        >
          <Icon size={22} strokeWidth={2.2} />
          <span className="m-tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
