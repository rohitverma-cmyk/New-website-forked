import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { useBrandCart } from "../../context/BrandCartContext";
import { Building2, Package, Users, LogOut, ShoppingBag, Wallet, ShoppingCart, Mail, Phone, HelpCircle, Factory, Send, Inbox } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const BrandLayout = ({ children }) => {
  const { user, logout } = useBrandAuth();
  const { itemCount } = useBrandCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [support, setSupport] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/brand/support`)
      .then((r) => r.ok ? r.json() : null)
      .then(setSupport)
      .catch(() => {});
  }, []);

  const nav = [
    { to: "/enterprise/fabrics", label: "Catalog", icon: Package },
    { to: "/enterprise/orders", label: "Orders", icon: ShoppingBag },
    ...(user?.role === "brand_admin" ? [{ to: "/enterprise/users", label: "Users", icon: Users }] : []),
    // Factories tab is only for brand-admin of brand-type enterprises (not visible inside a factory's own portal)
    ...(user?.role === "brand_admin" && (user?.brand_type || "brand") === "brand"
      ? [{ to: "/enterprise/factories", label: "Factories", icon: Factory }]
      : []),
    // Allocations tab:
    //   - All brand users (of a brand-type enterprise) can see the
    //     "Allocations" tab to track SKUs their team has sent to factories
    //   - Factory users see "Allocations" — incoming lists from parent brand
    ...((user?.brand_type === "factory") || ((user?.brand_type || "brand") === "brand")
      ? [{ to: "/enterprise/allocations", label: "Allocations", icon: user?.brand_type === "factory" ? Inbox : Send }]
      : []),
  ];

  const handleLogout = () => { logout(); navigate("/enterprise/login"); };
  const isActive = (p) => pathname === p || pathname.startsWith(p + "/");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/enterprise/fabrics" className="flex items-center gap-3" data-testid="brand-header-home">
            {user?.brand_logo_url ? (
              <img src={user.brand_logo_url} alt={user.brand_name} className="w-9 h-9 rounded-lg object-cover border border-gray-200" data-testid="brand-header-logo" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Building2 className="text-white" size={18} />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900" data-testid="brand-header-name">{user?.brand_name}</p>
              <p className="text-[11px] text-gray-500">{user?.designation || (user?.role === "brand_admin" ? "Admin" : "Buyer")}</p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} data-testid={`brand-nav-${n.to.split("/").pop()}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(n.to) ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-100"
                }`}>
                <n.icon size={14} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            {/* Cart — always visible, badge shows item count */}
            <Link to="/enterprise/cart" data-testid="brand-nav-cart"
              className={`relative p-2 rounded-md transition-colors ${isActive("/enterprise/cart") ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
              title="Cart">
              <ShoppingCart size={16} />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center" data-testid="brand-cart-count">
                  {itemCount}
                </span>
              )}
            </Link>
            {/* Wallet — unobtrusive link to /brand/account */}
            <Link to="/enterprise/account" title="Credit & Sample balances" data-testid="brand-nav-account"
              className={`p-2 rounded-md transition-colors ${isActive("/enterprise/account") ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}>
              <Wallet size={16} />
            </Link>
            <span className="text-sm text-gray-600 hidden md:block">{user?.name}</span>
            <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600" data-testid="brand-logout">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>

      {/* Support footer — reassuring placeholder for escalations */}
      <footer className="mt-auto bg-white border-t border-gray-200" data-testid="brand-support-footer">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <HelpCircle size={13} />
            <span>Need help with an order, credit line or sample?</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <a href={`mailto:${support?.email || "support@locofast.com"}`} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-emerald-700" data-testid="brand-support-email">
              <Mail size={12} /> {support?.email || "support@locofast.com"}
            </a>
            <a href={`tel:${(support?.phone || "+91 120 4938200").replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-emerald-700" data-testid="brand-support-phone">
              <Phone size={12} /> {support?.phone || "+91 120 4938200"}
            </a>
            {support?.hours && <span className="text-gray-400 hidden sm:inline">· {support.hours}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BrandLayout;
