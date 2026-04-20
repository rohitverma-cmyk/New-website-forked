import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layers, Package, ShoppingCart, Plus, TrendingUp } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import { getVendorStats, getVendorFabrics, getVendorOrders } from "../../lib/api";
import { useVendorAuth } from "../../context/VendorAuthContext";

const VendorDashboard = () => {
  const { vendor, getToken } = useVendorAuth();
  const [stats, setStats] = useState(null);
  const [recentFabrics, setRecentFabrics] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Set auth header for vendor requests
      const token = getToken();
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const [statsRes, fabricsRes, ordersRes] = await Promise.all([
        getVendorStats(),
        getVendorFabrics(),
        getVendorOrders()
      ]);
      
      setStats(statsRes.data);
      setRecentFabrics(fabricsRes.data.slice(0, 5));
      setRecentOrders(ordersRes.data.slice(0, 5));
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    }
    setLoading(false);
  };

  return (
    <VendorLayout>
      <div className="p-8" data-testid="vendor-dashboard">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome, {vendor?.name || "Vendor"}
          </h1>
          <p className="text-gray-500 mt-1">
            {vendor?.company_name} • {stats?.vendor_code || ""}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Fabrics</p>
                <p className="text-3xl font-semibold mt-1">{stats?.total_fabrics || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Layers className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved (Live)</p>
                <p className="text-3xl font-semibold mt-1 text-emerald-600">{stats?.approved_fabrics || 0}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Approval</p>
                <p className="text-3xl font-semibold mt-1 text-yellow-600">{stats?.pending_fabrics || 0}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Enquiries</p>
                <p className="text-3xl font-semibold mt-1">{stats?.total_enquiries || 0}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Fabrics */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold">Recent Fabrics</h2>
              <Link
                to="/vendor/inventory"
                className="text-sm text-emerald-600 hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : recentFabrics.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No fabrics yet</p>
                  <Link
                    to="/vendor/inventory"
                    className="inline-flex items-center gap-2 text-emerald-600 hover:underline mt-2"
                  >
                    <Plus size={16} />
                    Add your first fabric
                  </Link>
                </div>
              ) : (
                recentFabrics.map((fabric) => (
                  <div key={fabric.id} className="p-4 flex items-center gap-4">
                    <img
                      src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"}
                      alt={fabric.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{fabric.name}</p>
                      <p className="text-sm text-gray-500">{fabric.category_name}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      fabric.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                      fabric.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                      fabric.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {fabric.status === "approved" ? "Live" :
                       fabric.status === "pending" ? "Pending" :
                       fabric.status === "rejected" ? "Rejected" : "Draft"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold">Recent Orders</h2>
              <Link
                to="/vendor/orders"
                className="text-sm text-emerald-600 hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : recentOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No orders yet</p>
                  <p className="text-sm text-gray-400 mt-1">Orders will appear here when customers place them</p>
                </div>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-blue-600">{order.order_number}</p>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        order.status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                        order.status === "shipped" ? "bg-purple-100 text-purple-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}m total
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </VendorLayout>
  );
};

export default VendorDashboard;
