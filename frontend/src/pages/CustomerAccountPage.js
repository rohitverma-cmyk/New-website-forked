import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Package, Mail, Phone, Building2, MapPin, Pencil, Save, Loader2, LogOut, ArrowRight, Clock, CheckCircle, Truck, XCircle, MessageSquare } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { getCustomerProfile, updateCustomerProfile, getCustomerOrders } from "../lib/api";
import CustomerQueriesTab from "../components/customer/CustomerQueriesTab";
import { toast } from "sonner";

const statusConfig = {
  payment_pending: { label: "Payment Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
  processing: { label: "Processing", color: "bg-indigo-100 text-indigo-700", icon: Package },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle },
};

const CustomerAccountPage = () => {
  const { customer, token, isLoggedIn, logout, updateCustomer } = useCustomerAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "", phone: "", company: "", address: "", city: "", state: "", pincode: ""
  });

  useEffect(() => {
    if (!isLoggedIn) { navigate("/"); return; }
    fetchProfile();
    fetchOrders();
  }, [isLoggedIn]);

  const fetchProfile = async () => {
    try {
      const res = await getCustomerProfile(token);
      const p = res.data;
      setProfileForm({ name: p.name || "", phone: p.phone || "", company: p.company || "", address: p.address || "", city: p.city || "", state: p.state || "", pincode: p.pincode || "" });
    } catch {}
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await getCustomerOrders(token);
      setOrders(res.data || []);
    } catch {}
    setOrdersLoading(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await updateCustomerProfile(token, profileForm);
      updateCustomer(res.data);
      toast.success("Profile updated");
      setEditing(false);
    } catch { toast.error("Failed to update"); }
    setSaving(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
    toast.success("Logged out");
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";

  if (!isLoggedIn) return null;

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 min-h-screen bg-gray-50" data-testid="customer-account-page">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">My Account</h1>
              <p className="text-gray-500 mt-1">{customer?.email}</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200" data-testid="logout-btn">
              <LogOut size={16} />Logout
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-8">
            <button onClick={() => setActiveTab("orders")} className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === "orders" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`} data-testid="tab-my-orders">
              <Package size={16} className="inline mr-2" />My Orders
            </button>
            <button onClick={() => setActiveTab("queries")} className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === "queries" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`} data-testid="tab-my-queries">
              <MessageSquare size={16} className="inline mr-2" />My Queries
            </button>
            <button onClick={() => setActiveTab("profile")} className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === "profile" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`} data-testid="tab-profile">
              <User size={16} className="inline mr-2" />Profile
            </button>
          </div>

          {/* ===== QUERIES TAB ===== */}
          {activeTab === "queries" && <CustomerQueriesTab />}

          {/* ===== ORDERS TAB ===== */}
          {activeTab === "orders" && (
            <div>
              {ordersLoading ? (
                <div className="text-center py-16 text-gray-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" />Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border" data-testid="no-orders">
                  <Package size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No orders yet</h3>
                  <p className="text-gray-500 mb-6">Start browsing fabrics and place your first order!</p>
                  <button onClick={() => navigate("/fabrics")} className="inline-flex items-center gap-2 bg-[#2563EB] text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700">
                    Browse Fabrics <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => {
                    const si = statusConfig[order.status] || statusConfig.payment_pending;
                    const SI = si.icon;
                    return (
                      <div key={order.id} className="bg-white rounded-xl border p-6 hover:shadow-sm transition-shadow" data-testid={`order-card-${order.order_number}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="font-semibold text-gray-900">{order.order_number}</p>
                            <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {order.payment_method === 'credit' && <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">Credit</span>}
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${si.color}`}>
                              <SI size={12} />{si.label}
                            </span>
                          </div>
                        </div>
                        {/* Items */}
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex gap-4 py-3 border-t border-gray-100">
                            {item.image_url && <img src={item.image_url} alt={item.fabric_name} className="w-16 h-16 rounded-lg object-cover" />}
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.fabric_name}</p>
                              <p className="text-sm text-gray-500">{item.category_name} | {item.quantity}m x ₹{item.price_per_meter}/m</p>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${item.order_type === "sample" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {item.order_type === "sample" ? "Sample" : "Bulk"}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">₹{(item.quantity * item.price_per_meter).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                          <div className="text-sm text-gray-500">
                            {order.logistics_charge > 0 && <span>Logistics: ₹{order.logistics_charge.toLocaleString()} | </span>}
                            GST: ₹{order.tax?.toLocaleString()}
                          </div>
                          <p className="text-lg font-semibold text-emerald-600">Total: ₹{order.total?.toLocaleString()}</p>
                        </div>
                        {order.cancellation_reason && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                            Cancelled: {order.cancellation_reason === 'stock_out' ? 'Stock Out' : order.cancellation_reason === 'credit_limit' ? 'Credit Limit' : order.cancellation_reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== PROFILE TAB ===== */}
          {activeTab === "profile" && (
            <div className="bg-white rounded-xl border p-8 max-w-2xl" data-testid="profile-section">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Profile Details</h2>
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-sm text-[#2563EB] hover:underline" data-testid="edit-profile-btn"><Pencil size={14} />Edit</button>
                ) : (
                  <button onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50" data-testid="save-profile-btn">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving..." : "Save"}
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail size={16} className="text-gray-400" />
                  <div><p className="text-xs text-gray-500">Email</p><p className="font-medium">{customer?.email}</p></div>
                </div>

                {[
                  { key: "name", label: "Full Name", icon: User, placeholder: "Your name" },
                  { key: "phone", label: "Phone", icon: Phone, placeholder: "+91 98765 43210" },
                  { key: "company", label: "Company", icon: Building2, placeholder: "Your company" },
                  { key: "address", label: "Address", icon: MapPin, placeholder: "Street address" },
                ].map(({ key, label, icon: Icon, placeholder }) => (
                  <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Icon size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">{label}</p>
                      {editing ? (
                        <input
                          type="text"
                          value={profileForm[key]}
                          onChange={(e) => setProfileForm({ ...profileForm, [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                          data-testid={`profile-${key}`}
                        />
                      ) : (
                        <p className="font-medium">{profileForm[key] || <span className="text-gray-400">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                ))}

                {editing && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">City</p>
                      <input type="text" value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} placeholder="City" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm" />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">State</p>
                      <input type="text" value={profileForm.state} onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })} placeholder="State" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm" />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Pincode</p>
                      <input type="text" value={profileForm.pincode} onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })} placeholder="Pincode" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm" />
                    </div>
                  </div>
                )}

                {!editing && (profileForm.city || profileForm.state || profileForm.pincode) && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin size={16} className="text-gray-400" />
                    <div><p className="text-xs text-gray-500">Location</p><p className="font-medium">{[profileForm.city, profileForm.state, profileForm.pincode].filter(Boolean).join(", ") || "Not set"}</p></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default CustomerAccountPage;
