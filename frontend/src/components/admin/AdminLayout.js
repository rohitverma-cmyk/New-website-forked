import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Layers, FolderOpen, Building2, Package, MessageSquare, LogOut, ArrowLeft, Palette, Search, FileText, ShoppingCart, Tag, ClipboardList, Wallet, Users, Percent, Briefcase, IndianRupee } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const AdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout } = useAuth();

  const isAccountsRole = admin?.role === "accounts";

  // Accounts users get a focused nav surface — only Payouts + read-only
  // Sellers + Orders, nothing else. Everything is gated server-side too;
  // hiding the items here just keeps the UI clean.
  const accountsNav = [
    { path: "/admin/payouts", label: "Payouts", icon: IndianRupee },
    { path: "/admin/orders", label: "Orders (read)", icon: ShoppingCart },
    { path: "/admin/sellers", label: "Vendors", icon: Building2 },
  ];

  const fullNav = [
    { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/orders", label: "Orders", icon: ShoppingCart },
    { path: "/admin/payouts", label: "Payouts", icon: IndianRupee },
    { path: "/admin/customers", label: "Customers", icon: Users },
    { path: "/admin/rfq", label: "RFQ", icon: ClipboardList },
    { path: "/admin/fabrics", label: "Fabrics", icon: Layers },
    { path: "/admin/articles", label: "Articles", icon: Palette },
    { path: "/admin/categories", label: "Categories", icon: FolderOpen },
    { path: "/admin/sellers", label: "Sellers", icon: Building2 },
    { path: "/admin/brands", label: "Enterprises", icon: Briefcase },
    { path: "/admin/account-managers", label: "Acc. Managers", icon: Users },
    { path: "/admin/reviews", label: "Reviews", icon: MessageSquare },
    { path: "/admin/collections", label: "Collections", icon: Package },
    { path: "/admin/coupons", label: "Coupons", icon: Tag },
    { path: "/admin/enquiries", label: "Enquiries", icon: MessageSquare },
    { path: "/admin/credit", label: "Credit", icon: Wallet },
    { path: "/admin/agents", label: "Agents", icon: Users },
    { path: "/admin/commission", label: "Commission", icon: Percent },
    { path: "/admin/blog", label: "Blog", icon: FileText },
    { path: "/admin/seo", label: "SEO Content", icon: Search },
  ];

  const navItems = isAccountsRole ? accountsNav : fullNav;

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-neutral-50 flex" data-testid="admin-layout">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-100 fixed h-full flex flex-col" data-testid="admin-sidebar">
        <div className="p-6 border-b border-neutral-100">
          <Link to="/" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors text-sm mb-4">
            <ArrowLeft size={16} />
            Back to Site
          </Link>
          <img 
            src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg" 
            alt="Locofast" 
            className="h-7 mb-1"
          />
          <p className="text-neutral-500 text-sm">Admin Panel</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" data-testid="admin-nav-scroll">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-sm transition-colors ${
                isActive(item.path)
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-100">
          <div className="px-4 py-2 mb-2">
            <p className="font-medium text-sm">{admin?.name}</p>
            <p className="text-neutral-500 text-xs truncate">{admin?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-neutral-600 hover:bg-neutral-100 rounded-sm transition-colors"
            data-testid="logout-btn"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8" data-testid="admin-content">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
