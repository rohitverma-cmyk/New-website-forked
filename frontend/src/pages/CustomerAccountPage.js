import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, Package, Mail, Phone, Building2, MapPin, Pencil, Save, Loader2, LogOut, ArrowRight, Clock, CheckCircle, Truck, XCircle, MessageSquare, FileText, ShieldCheck } from "lucide-react";
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "queries" ? "queries" : searchParams.get("tab") === "profile" ? "profile" : "orders";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "", phone: "", company: "", gstin: "", address: "", city: "", state: "", pincode: ""
  });
  const [gstVerified, setGstVerified] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isLoggedIn) { navigate("/"); return; }
    fetchProfile();
    fetchOrders();
  }, [isLoggedIn]);

  const fetchProfile = async () => {
    try {
      const res = await getCustomerProfile(token);
      const p = res.data;
      setProfileForm({ name: p.name || "", phone: p.phone || "", company: p.company || "", gstin: p.gstin || "", address: p.address || "", city: p.city || "", state: p.state || "", pincode: p.pincode || "" });
      setGstVerified(!!p.gst_verified);
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
    // Client-side mandatory validation
    const e = {};
    const name = (profileForm.name || "").trim();
    const phone = (profileForm.phone || "").trim();
    const gstin = (profileForm.gstin || "").trim().toUpperCase();
    if (!name) e.name = "Contact Person Name is required";
    if (!phone) e.phone = "Phone is required";
    else if (phone.replace(/\D/g, "").length < 10) e.phone = "Phone must be at least 10 digits";
    if (!gstin) e.gstin = "GST Number is required";
    else if (gstin.length !== 15) e.gstin = "GSTIN must be 15 characters";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSaving(true);
    try {
      const res = await updateCustomerProfile(token, { ...profileForm, gstin });
      const p = res.data;
      setProfileForm({ name: p.name || "", phone: p.phone || "", company: p.company || "", gstin: p.gstin || "", address: p.address || "", city: p.city || "", state: p.state || "", pincode: p.pincode || "" });
      setGstVerified(!!p.gst_verified);
      updateCustomer(p);
      toast.success("Profile updated · GST verified");
      setEditing(false);
      setErrors({});
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to update profile";
      toast.error(msg);
      // Surface server error against gstin field if it's GST-related
      if (/GST|GSTIN/i.test(msg)) setErrors((prev) => ({ ...prev, gstin: msg }));
    }
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
              <p className="text-gray-500 mt-1">
                {(() => {
                  const e = customer?.email || "";
                  const isPlaceholder = e.endsWith("@phone.locofast.local");
                  if (isPlaceholder) return customer?.phone ? `+${customer.phone}` : "Phone-only account";
                  return e;
                })()}
              </p>
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
                      <div key={order.id} onClick={() => navigate(`/account/orders/${order.id}`)} className="bg-white rounded-xl border p-6 hover:shadow-sm hover:border-blue-200 transition-all cursor-pointer" data-testid={`order-card-${order.order_number}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="font-semibold text-gray-900">{order.order_number}</p>
                            <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                            {order.is_parent_order && order.vendor_count > 1 && (
                              <p className="text-[11px] text-blue-600 mt-1" data-testid={`order-parent-badge-${order.order_number}`}>
                                Master order · ships from {order.vendor_count} mills
                              </p>
                            )}
                            {order.parent_order_number && (
                              <p className="text-[11px] text-gray-500 mt-1" data-testid={`order-child-badge-${order.order_number}`}>
                                Shipment from {order.seller_company || "vendor"} · part of {order.parent_order_number}
                              </p>
                            )}
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
                        <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-100">
                          <span className="text-xs font-medium text-[#2563EB] hover:underline inline-flex items-center gap-1">
                            View details <ArrowRight size={12} />
                          </span>
                        </div>
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
                <div>
                  <h2 className="text-lg font-semibold">Profile Details</h2>
                  <p className="text-xs text-gray-500 mt-1">Fields marked <span className="text-red-500">*</span> are mandatory. GST is verified live with the GSTN.</p>
                </div>
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-sm text-[#2563EB] hover:underline" data-testid="edit-profile-btn"><Pencil size={14} />Edit</button>
                ) : (
                  <button onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50" data-testid="save-profile-btn">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? "Verifying GST..." : "Save"}
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Email — mandatory but immutable (login identity).
                    For phone-OTP customers we hide the synthetic placeholder
                    and prompt them to add a real email instead. */}
                {(() => {
                  const e = customer?.email || "";
                  const isPlaceholder = e.endsWith("@phone.locofast.local");
                  return (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Mail size={16} className="text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Email <span className="text-gray-400 font-normal">· optional</span></p>
                        <p className="font-medium">
                          {isPlaceholder
                            ? <span className="text-gray-400 font-normal">Add an email so we can send invoices and updates</span>
                            : e}
                        </p>
                      </div>
                      {!isPlaceholder && <span className="text-xs text-gray-400">login identity</span>}
                    </div>
                  );
                })()}

                {/* GST Number — mandatory, verified */}
                <div className="p-3 bg-gray-50 rounded-lg" data-testid="profile-gstin-row">
                  <div className="flex items-start gap-3">
                    <FileText size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        GST Number <span className="text-red-500">*</span>
                        {gstVerified && !editing && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <ShieldCheck size={12} /> Verified
                          </span>
                        )}
                      </p>
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={profileForm.gstin}
                            onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none text-sm font-mono uppercase ${errors.gstin ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-[#2563EB]"}`}
                            data-testid="profile-gstin"
                          />
                          {errors.gstin ? (
                            <p className="text-xs text-red-600 mt-1">{errors.gstin}</p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-1">Company Name will be auto-filled from the GST registry on save.</p>
                          )}
                        </>
                      ) : (
                        <p className="font-medium font-mono">{profileForm.gstin || <span className="text-gray-400 font-sans">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Company Name — auto-filled from GST, read-only */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building2 size={16} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Company Name <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">· auto-filled from GST</span></p>
                    <p className="font-medium" data-testid="profile-company">
                      {profileForm.company || <span className="text-gray-400 font-normal">Will populate after GST verification</span>}
                    </p>
                  </div>
                </div>

                {/* Contact Person Name — mandatory */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <User size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Contact Person Name <span className="text-red-500">*</span></p>
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={profileForm.name}
                            onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                            placeholder="Full name"
                            className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none text-sm ${errors.name ? "border-red-400" : "border-gray-300 focus:border-[#2563EB]"}`}
                            data-testid="profile-name"
                          />
                          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                        </>
                      ) : (
                        <p className="font-medium">{profileForm.name || <span className="text-gray-400">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Phone — mandatory */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Phone <span className="text-red-500">*</span></p>
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={profileForm.phone}
                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                            placeholder="+91 98765 43210"
                            className={`w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none text-sm ${errors.phone ? "border-red-400" : "border-gray-300 focus:border-[#2563EB]"}`}
                            data-testid="profile-phone"
                          />
                          {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                        </>
                      ) : (
                        <p className="font-medium">{profileForm.phone || <span className="text-gray-400">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Address — optional */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Address <span className="text-gray-400 font-normal">· optional</span></p>
                      {editing ? (
                        <input
                          type="text"
                          value={profileForm.address}
                          onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                          placeholder="Street address"
                          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                          data-testid="profile-address"
                        />
                      ) : (
                        <p className="font-medium">{profileForm.address || <span className="text-gray-400">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                </div>

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
