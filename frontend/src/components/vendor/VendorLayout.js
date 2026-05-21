import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Layers, Package, ShoppingCart, MessageSquare, LogOut, ArrowLeft, IndianRupee } from "lucide-react";
import { useVendorAuth } from "../../context/VendorAuthContext";

const VendorLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor, logout } = useVendorAuth();

  const navItems = [
    { path: "/vendor", label: "Dashboard", icon: LayoutDashboard },
    { path: "/vendor/rfqs", label: "RFQ / Requests", icon: MessageSquare },
    { path: "/vendor/inventory", label: "My Inventory", icon: Layers },
    { path: "/vendor/orders", label: "Orders", icon: ShoppingCart },
    { path: "/vendor/payouts", label: "My Payouts", icon: IndianRupee },
  ];

  const handleLogout = () => {
    logout();
    navigate("/vendor/login");
  };

  const isActive = (path) => {
    if (path === "/vendor") {
      return location.pathname === "/vendor";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-3">
            <ArrowLeft size={16} />
            Back to Site
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Vendor Portal</p>
              <p className="text-xs text-gray-500">{vendor?.company_name || "Vendor"}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="mb-3">
            <p className="font-medium text-gray-900 text-sm">{vendor?.name}</p>
            <p className="text-xs text-gray-500">{vendor?.contact_email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-500 hover:text-red-600 text-sm"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default VendorLayout;
