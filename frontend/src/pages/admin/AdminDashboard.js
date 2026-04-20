import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layers, FolderOpen, Building2, Package, MessageSquare, Palette, ShoppingCart } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getStats } from "../../lib/api";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ 
    fabrics: 0, categories: 0, sellers: 0, active_sellers: 0,
    collections: 0, articles: 0, enquiries: 0, new_enquiries: 0,
    bookable_fabrics: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await getStats();
        setStats(res.data);
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: "Total Fabrics", value: stats.fabrics, icon: Layers, link: "/admin/fabrics", color: "bg-blue-50 text-blue-600" },
    { label: "Articles", value: stats.articles, icon: Palette, link: "/admin/articles", color: "bg-indigo-50 text-indigo-600" },
    { label: "Categories", value: stats.categories, icon: FolderOpen, link: "/admin/categories", color: "bg-amber-50 text-amber-600" },
    { label: "Active Sellers", value: stats.active_sellers, icon: Building2, link: "/admin/sellers", color: "bg-purple-50 text-purple-600" },
    { label: "Collections", value: stats.collections, icon: Package, link: "/admin/collections", color: "bg-rose-50 text-rose-600" },
    { label: "Bookable", value: stats.bookable_fabrics, icon: ShoppingCart, link: "/admin/fabrics", color: "bg-emerald-50 text-emerald-600" },
    { label: "Enquiries", value: stats.enquiries, icon: MessageSquare, link: "/admin/enquiries", color: "bg-cyan-50 text-cyan-600" },
  ];

  return (
    <AdminLayout>
      <div data-testid="admin-dashboard">
        <h1 className="text-3xl font-serif font-medium mb-8">Dashboard</h1>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 border border-neutral-100 animate-pulse">
                <div className="h-12 w-12 bg-neutral-200 rounded mb-4" />
                <div className="h-8 w-16 bg-neutral-200 mb-2" />
                <div className="h-4 w-24 bg-neutral-200" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4" data-testid="stats-grid">
            {statCards.map((stat, index) => (
              <Link
                key={index}
                to={stat.link}
                className="bg-white p-4 border border-neutral-100 hover:border-neutral-200 transition-colors rounded"
                data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className={`w-10 h-10 ${stat.color} flex items-center justify-center mb-3 rounded`}>
                  <stat.icon size={20} />
                </div>
                <p className="text-2xl font-semibold mb-1">{stat.value}</p>
                <p className="text-neutral-500 text-xs">{stat.label}</p>
              </Link>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-xl font-serif font-medium mb-6">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/admin/fabrics" className="btn-primary" data-testid="quick-action-fabrics">
              Manage Fabrics
            </Link>
            <Link to="/admin/categories" className="btn-secondary" data-testid="quick-action-categories">
              Manage Categories
            </Link>
            <Link to="/admin/enquiries" className="btn-secondary" data-testid="quick-action-enquiries">
              View Enquiries
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
