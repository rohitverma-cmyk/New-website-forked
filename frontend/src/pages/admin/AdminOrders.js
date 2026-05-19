import { useState, useEffect } from "react";
import { Package, Clock, CheckCircle, Truck, XCircle, Search, RefreshCw, RotateCw, ChevronDown, Mail, Phone, MapPin, Eye, FileText, Receipt, Wallet, Upload, Pencil, Ban, X, AlertTriangle, Send, Loader2, Plus } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import BulkCreditUpload from "../../components/admin/BulkCreditUpload";
import SetCreditByGstModal from "../../components/admin/SetCreditByGstModal";
import OrderEmailAudit from "../../components/admin/OrderEmailAudit";
import { listOrders, updateOrderStatus, updateOrderPaymentStatus, getOrderStats, sendOrderConfirmation, downloadInvoice, cancelOrder, listCreditWallets, editCreditWallet, pushOrderToShiprocket, getOrderSellerCommissions, adminMarkBalancePaid } from "../../lib/api";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusConfig = {
  payment_pending: { label: "Payment Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  provisional: { label: "Provisional · Advance Paid", color: "bg-amber-100 text-amber-700", icon: Clock },
  goods_ready: { label: "Goods Ready · Balance Pending", color: "bg-orange-100 text-orange-700", icon: CheckCircle },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
  processing: { label: "Processing", color: "bg-indigo-100 text-indigo-700", icon: Package },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle },
  payment_failed: { label: "Payment Failed", color: "bg-red-100 text-red-700", icon: XCircle },
};

const paymentStatusConfig = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700" },
  initiated: { label: "Initiated", color: "bg-yellow-100 text-yellow-700" },
  pending_advance: { label: "Advance Pending", color: "bg-amber-100 text-amber-700" },
  advance_paid: { label: "Advance Paid", color: "bg-amber-100 text-amber-800" },
  balance_pending: { label: "Balance Pending", color: "bg-orange-100 text-orange-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", color: "bg-orange-100 text-orange-700" },
};

const AdminOrders = () => {
  const [activeTab, setActiveTab] = useState("orders"); // orders | credit
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(null);
  // Cancel modal
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  // Credit
  const [wallets, setWallets] = useState([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditSearch, setCreditSearch] = useState("");
  // Edit modal
  const [editModal, setEditModal] = useState(null);
  const [editPassword, setEditPassword] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editPeriod, setEditPeriod] = useState("30");
  // Bulk upload modal toggle (component handles parsing + commit)
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  // Single-entry "Set credit limit by GST" modal
  const [showSetByGst, setShowSetByGst] = useState(false);
  // Push-to-Shiprocket state (per-order spinner)
  const [pushingShiprocket, setPushingShiprocket] = useState(false);
  // Per-supplier push picker
  const [srPickerOpen, setSrPickerOpen] = useState(false);
  const [srPickerSelected, setSrPickerSelected] = useState([]);
  const [srPickerForce, setSrPickerForce] = useState(false);
  // Mark-as-Paid (manual payment status override) state
  const [markPayOpen, setMarkPayOpen] = useState(false);
  const [markPayForm, setMarkPayForm] = useState({ payment_status: "paid", payment_method: "neft", utr: "", notes: "" });
  const [markPayBusy, setMarkPayBusy] = useState(false);
  // Provisional bulk order: Mark Balance Paid (admin override)
  const [balancePaidBusy, setBalancePaidBusy] = useState(false);
  // Per-seller commission breakdown for the open order
  const [sellerComms, setSellerComms] = useState(null);
  const [commResyncBusy, setCommResyncBusy] = useState(false);

  // Fetch per-seller commissions whenever the selected order changes
  const fetchSellerComms = async (orderId) => {
    try {
      const res = await getOrderSellerCommissions(orderId);
      setSellerComms(res.data);
    } catch {
      setSellerComms(null);
    }
  };
  useEffect(() => {
    if (!selectedOrder?.id) { setSellerComms(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await getOrderSellerCommissions(selectedOrder.id);
        if (!cancelled) setSellerComms(res.data);
      } catch {
        if (!cancelled) setSellerComms(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOrder?.id]);

  // Resync commission for THIS order — re-materializes pending payouts
  // for every supplier in the order using the current rule chain
  // (item stamp → order stamp → live rules), then refreshes the
  // per-seller breakdown card so the admin sees the new figure.
  const handleOrderResyncCommission = async () => {
    if (!selectedOrder?.id) return;
    if (!window.confirm(`Resync commission for ${selectedOrder.order_number || selectedOrder.id}?\n\nRecomputes pending payouts using the latest rules. Paid payouts are left untouched.`)) return;
    setCommResyncBusy(true);
    const t = toast.loading("Resyncing commission for this order…");
    try {
      const token = localStorage.getItem("locofast_token");
      const res = await fetch(`${API_URL}/api/orders/${selectedOrder.id}/resync-commission`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      if (data.updated > 0) {
        toast.success(`${data.updated} supplier payout${data.updated !== 1 ? "s" : ""} updated`, { id: t });
      } else if (data.skipped_paid > 0) {
        toast.warning(`Already paid · skipped (${data.skipped_paid})`, { id: t });
      } else {
        toast.success("Already up-to-date", { id: t });
      }
      await fetchSellerComms(selectedOrder.id);
    } catch (e) {
      toast.error(e.message || "Failed", { id: t });
    } finally {
      setCommResyncBusy(false);
    }
  };


  useEffect(() => { fetchOrders(); fetchStats(); }, [statusFilter]);
  useEffect(() => { if (activeTab === "credit") fetchWallets(); }, [activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await listOrders(params);
      setOrders(res.data.orders || []);
    } catch { toast.error("Failed to load orders"); }
    setLoading(false);
  };

  const fetchStats = async () => {
    try { const res = await getOrderStats(); setStats(res.data); } catch {}
  };

  const fetchWallets = async () => {
    setCreditLoading(true);
    try { const res = await listCreditWallets(); setWallets(res.data || []); } catch { toast.error("Failed to load wallets"); }
    setCreditLoading(false);
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    setUpdatingStatus(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
      fetchOrders(); fetchStats();
    } catch { toast.error("Failed to update status"); }
    setUpdatingStatus(null);
  };

  const handleMarkBalancePaid = async () => {
    if (!selectedOrder) return;
    const bal = Number(selectedOrder.balance_amount || 0);
    if (!window.confirm(
      `Mark balance of ₹${bal.toLocaleString("en-IN")} as paid for ${selectedOrder.order_number}?\n\n` +
      `This will:\n• Move payment_status → paid\n• Trigger inventory deduction\n• Materialize vendor payouts\n• Push the order to Shiprocket\n\n` +
      `Only use this when payment was received outside Razorpay (NEFT/UPI/cash).`
    )) return;
    setBalancePaidBusy(true);
    try {
      const res = await adminMarkBalancePaid(selectedOrder.id);
      toast.success("Balance marked as paid. Shipment pushed to Shiprocket.");
      setSelectedOrder(res.data.order);
      fetchOrders();
      fetchStats();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to mark balance as paid");
    }
    setBalancePaidBusy(false);
  };

  const handleMarkPaymentStatus = async () => {    if (!selectedOrder) return;
    if (markPayForm.payment_status === "paid" && !markPayForm.payment_method) {
      toast.error("Pick the payment method that was actually used");
      return;
    }
    setMarkPayBusy(true);
    try {
      await updateOrderPaymentStatus(selectedOrder.id, markPayForm);
      toast.success(`Payment marked as ${markPayForm.payment_status}`);
      // Patch the modal state so the UI reflects new status immediately
      setSelectedOrder((p) => p ? { ...p, payment_status: markPayForm.payment_status, payment_method: markPayForm.payment_method || p.payment_method } : p);
      setMarkPayOpen(false);
      setMarkPayForm({ payment_status: "paid", payment_method: "neft", utr: "", notes: "" });
      fetchOrders();
      fetchStats();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update payment status");
    }
    setMarkPayBusy(false);
  };

  // Compute the suppliers on the open order — used by the push picker
  const orderSuppliers = (() => {
    if (!selectedOrder) return [];
    const byId = new Map();
    (selectedOrder.items || []).forEach((it) => {
      const sid = (it.seller_id || "").trim();
      if (!byId.has(sid)) byId.set(sid, { seller_id: sid, seller_company: it.seller_company || "", items_count: 0, subtotal: 0 });
      const g = byId.get(sid);
      g.items_count += 1;
      g.subtotal += Number(it.quantity || 0) * Number(it.price_per_meter || 0);
    });
    const shipMap = new Map((selectedOrder.shiprocket_shipments || []).map((s) => [s.seller_id || "", s]));
    return Array.from(byId.values()).map((g) => ({ ...g, shipment: shipMap.get(g.seller_id) || null }));
  })();

  const openPushPicker = () => {
    setSrPickerSelected([]);
    setSrPickerForce(false);
    setSrPickerOpen(true);
  };

  const handlePushSelectedSuppliers = async () => {
    if (!selectedOrder) return;
    if (srPickerSelected.length === 0) { toast.error("Pick at least one supplier"); return; }
    setPushingShiprocket(true);
    try {
      const { data } = await pushOrderToShiprocket(selectedOrder.id, srPickerForce, srPickerSelected);
      const newOnes = data.pushed_in_this_call || [];
      const ok = newOnes.filter((s) => s.success).length;
      const tot = newOnes.length;
      if (ok === tot) toast.success(`Pushed ${ok}/${tot} supplier shipment${tot > 1 ? "s" : ""}`);
      else if (ok > 0) toast.warning(`Pushed ${ok}/${tot} — ${tot - ok} failed`);
      else toast.error("All selected shipments failed. Check supplier pickup nicknames.");
      setSelectedOrder((prev) => prev ? { ...prev, shiprocket_shipments: data.shipments, shiprocket_order_id: data.shiprocket_order_id, shiprocket_shipment_id: data.shipment_id, awb_code: data.awb_code || prev.awb_code, courier_name: data.courier_name || prev.courier_name } : prev);
      setSrPickerOpen(false);
      fetchOrders();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Push failed");
    }
    setPushingShiprocket(false);
  };

  const handlePushToShiprocket = async (force = false) => {
    if (!selectedOrder) return;
    if (force && !window.confirm("Force re-push will create duplicate shipments in Shiprocket. Proceed only if the original SR record was deleted. Continue?")) return;
    setPushingShiprocket(true);
    try {
      const { data } = await pushOrderToShiprocket(selectedOrder.id, force);
      const okCount = (data.shipments || []).filter((s) => s.success).length;
      const totalCount = data.count || (data.shipments || []).length || 1;
      if (data.already_pushed && !force) {
        toast.info(`Already in Shiprocket · ${totalCount} shipment${totalCount > 1 ? "s" : ""}`);
      } else if (okCount === totalCount) {
        toast.success(`Pushed ${okCount}/${totalCount} shipment${totalCount > 1 ? "s" : ""} to Shiprocket`);
      } else if (okCount > 0) {
        toast.warning(`Pushed ${okCount}/${totalCount} — ${totalCount - okCount} failed. Check supplier details.`);
      }
      // Refresh the order list and patch the modal's selectedOrder so the badge updates
      setSelectedOrder((prev) => prev ? {
        ...prev,
        shiprocket_shipments: data.shipments || prev.shiprocket_shipments,
        shiprocket_order_id: data.shiprocket_order_id,
        shiprocket_shipment_id: data.shipment_id,
        awb_code: data.awb_code || prev.awb_code,
        courier_name: data.courier_name || prev.courier_name,
      } : prev);
      fetchOrders();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Failed to push to Shiprocket";
      toast.error(msg);
    }
    setPushingShiprocket(false);
  };

  const handleCancel = async () => {
    if (!cancelModal || !cancelReason) return;
    try {
      await cancelOrder(cancelModal.id, cancelReason);
      toast.success("Order cancelled");
      setCancelModal(null); setCancelReason("");
      fetchOrders(); fetchStats();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to cancel"); }
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    try {
      await editCreditWallet(editModal.gst_number, {
        password: editPassword,
        credit_limit: parseFloat(editLimit) || editModal.credit_limit,
        balance: parseFloat(editBalance) || editModal.balance,
        credit_period_days: parseInt(editPeriod, 10) || 30,
      });
      toast.success("Credit updated");
      setEditModal(null); setEditPassword(""); setEditLimit(""); setEditBalance(""); setEditPeriod("30");
      fetchWallets();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed — check password"); }
  };

  const handleResendConfirmation = async (orderId) => {
    try { await sendOrderConfirmation(orderId); toast.success("Email sent"); } catch { toast.error("Failed"); }
  };

  const filteredOrders = orders.filter(order => {
    if (!search) return true;
    const s = search.toLowerCase();
    return order.order_number?.toLowerCase().includes(s) || order.customer?.name?.toLowerCase().includes(s) || order.customer?.email?.toLowerCase().includes(s) || order.customer?.phone?.includes(search);
  });

  const filteredWallets = wallets.filter(w => {
    if (!creditSearch) return true;
    const s = creditSearch.toLowerCase();
    const sUpper = creditSearch.toUpperCase().replace(/\s+/g, "");
    return (
      w.gst_number?.toUpperCase().includes(sUpper) ||
      w.email?.toLowerCase().includes(s) ||
      w.name?.toLowerCase().includes(s) ||
      w.company?.toLowerCase().includes(s) ||
      w.lender?.toLowerCase().includes(s)
    );
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // Group wallets by lender
  const walletsByLender = {};
  filteredWallets.forEach(w => {
    const lender = w.lender || "Direct / Unassigned";
    if (!walletsByLender[lender]) walletsByLender[lender] = [];
    walletsByLender[lender].push(w);
  });

  return (
    <AdminLayout>
      <div className="p-8" data-testid="admin-orders-page">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8 border-b border-gray-200">
          <button onClick={() => setActiveTab("orders")} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === "orders" ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`} data-testid="tab-orders">
            <Package size={16} className="inline mr-2" />Orders
          </button>
          <button onClick={() => setActiveTab("credit")} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === "credit" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} data-testid="tab-credit">
            <Wallet size={16} className="inline mr-2" />Credit Management
          </button>
        </div>

        {/* ===== ORDERS TAB ===== */}
        {activeTab === "orders" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div><h1 className="text-2xl font-semibold">Orders</h1><p className="text-gray-500 mt-1">Manage orders and track fulfillment</p></div>
              <button onClick={() => { fetchOrders(); fetchStats(); }} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} />Refresh</button>
            </div>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
                <div className="bg-white p-4 rounded-lg border"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-semibold">{stats.total_orders}</p></div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200"><p className="text-sm text-yellow-700">Pending</p><p className="text-2xl font-semibold text-yellow-700">{stats.pending_payment}</p></div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200"><p className="text-sm text-green-700">Paid</p><p className="text-2xl font-semibold text-green-700">{stats.paid}</p></div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200"><p className="text-sm text-blue-700">Confirmed</p><p className="text-2xl font-semibold text-blue-700">{stats.confirmed}</p></div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200"><p className="text-sm text-purple-700">Shipped</p><p className="text-2xl font-semibold text-purple-700">{stats.shipped}</p></div>
                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200"><p className="text-sm text-emerald-700">Delivered</p><p className="text-2xl font-semibold text-emerald-700">{stats.delivered}</p></div>
                <div className="bg-white p-4 rounded-lg border"><p className="text-sm text-gray-500">Revenue</p><p className="text-2xl font-semibold text-emerald-600">₹{stats.total_revenue?.toLocaleString()}</p></div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white">
                <option value="">All Statuses</option>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-lg border overflow-hidden">
              {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> : filteredOrders.length === 0 ? <div className="p-8 text-center text-gray-500">No orders</div> : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b"><tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders.map((order) => {
                      const si = statusConfig[order.status] || statusConfig.payment_pending;
                      const pi = paymentStatusConfig[order.payment_status] || paymentStatusConfig.pending;
                      const SI = si.icon;
                      const isSample = order.items?.[0]?.order_type === 'sample';
                      return (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4"><p className="font-medium text-blue-600">{order.order_number}</p></td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${isSample ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{isSample ? 'SAMPLE' : 'BULK'}</span>
                            {order.payment_method === 'credit' && <span className="ml-1 px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">CREDIT</span>}
                            <span className={`ml-1 px-2 py-1 rounded-full text-xs ${order.booking_type === 'assisted_online' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                              {order.booking_type === 'assisted_online' ? 'Assisted Online' : 'Online'}
                            </span>
                            {order.agent_name && <span className="ml-1 text-xs text-blue-600 font-medium">{order.agent_name}</span>}
                          </td>
                          <td className="px-4 py-4"><p className="font-medium text-gray-900">{order.customer?.name}</p><p className="text-sm text-gray-500">{order.customer?.email}</p></td>
                          <td className="px-4 py-4"><p className="font-semibold text-emerald-600">₹{order.total?.toLocaleString()}</p></td>
                          <td className="px-4 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${pi.color}`}>{pi.label}</span></td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${si.color}`}><SI size={12} />{si.label}</span>
                            {order.cancellation_reason && <p className="text-xs text-red-500 mt-1">{order.cancellation_reason === 'stock_out' ? 'Stock Out' : order.cancellation_reason === 'credit_limit' ? 'Credit Limit' : order.cancellation_reason}</p>}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">{formatDate(order.created_at)}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setSelectedOrder(order)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="View"><Eye size={16} /></button>
                              {order.payment_status === 'paid' && <a href={downloadInvoice(order.id)} target="_blank" rel="noopener noreferrer" className="p-2 text-emerald-500 hover:bg-emerald-50 rounded" title="Invoice"><FileText size={16} /></a>}
                              {order.status !== 'cancelled' && order.status !== 'delivered' && (
                                <button onClick={() => { setCancelModal(order); setCancelReason(""); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Cancel" data-testid={`cancel-btn-${order.order_number}`}><Ban size={16} /></button>
                              )}
                              <div className="relative group">
                                <button className="p-2 text-gray-500 hover:bg-gray-100 rounded"><ChevronDown size={16} /></button>
                                <div className="absolute right-0 mt-1 w-40 bg-white border rounded-lg shadow-lg hidden group-hover:block z-10">
                                  {["confirmed", "processing", "shipped", "delivered"].map((s) => (
                                    <button key={s} onClick={() => handleStatusUpdate(order.id, s)} disabled={updatingStatus === order.id} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 capitalize">{s === order.status ? `✓ ${s}` : s}</button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ===== CREDIT TAB ===== */}
        {activeTab === "credit" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div><h1 className="text-2xl font-semibold">Credit Management</h1><p className="text-gray-500 mt-1">Manage customer credit limits and wallets by lender</p></div>
              <div className="flex gap-3">
                <button onClick={() => setShowSetByGst(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" data-testid="set-credit-by-gst-btn"><Plus size={16} />Set Limit by GST</button>
                <button onClick={() => setShowBulkUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700" data-testid="bulk-upload-btn"><Upload size={16} />Bulk Upload</button>
                <button onClick={fetchWallets} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={16} />Refresh</button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white p-5 rounded-lg border"><p className="text-sm text-gray-500">Total Customers</p><p className="text-3xl font-semibold">{wallets.length}</p></div>
              <div className="bg-emerald-50 p-5 rounded-lg border border-emerald-200"><p className="text-sm text-emerald-700">Total Credit Limit</p><p className="text-3xl font-semibold text-emerald-700">₹{wallets.reduce((s, w) => s + (w.credit_limit || 0), 0).toLocaleString()}</p></div>
              <div className="bg-blue-50 p-5 rounded-lg border border-blue-200"><p className="text-sm text-blue-700">Total Available</p><p className="text-3xl font-semibold text-blue-700">₹{wallets.reduce((s, w) => s + (w.balance || 0), 0).toLocaleString()}</p></div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by GSTIN, name, email, company, lender..." value={creditSearch} onChange={(e) => setCreditSearch(e.target.value)} className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="credit-search" />
            </div>

            {/* Wallets grouped by lender */}
            {creditLoading ? <div className="p-8 text-center text-gray-500">Loading...</div> : Object.keys(walletsByLender).length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white rounded-lg border">No credit wallets yet. Use Bulk Upload to add customers.</div>
            ) : (
              Object.entries(walletsByLender).map(([lender, lenderWallets]) => (
                <div key={lender} className="mb-8" data-testid={`lender-group-${lender}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{lender}</h3>
                    <span className="text-sm text-gray-500">{lenderWallets.length} customer{lenderWallets.length > 1 ? 's' : ''}</span>
                    <span className="text-sm text-emerald-600 font-medium">Total: ₹{lenderWallets.reduce((s, w) => s + (w.credit_limit || 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-white rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b"><tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GSTIN</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit Limit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Used</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Period</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {lenderWallets.map((w) => {
                          const used = (w.credit_limit || 0) - (w.balance || 0);
                          const pct = w.credit_limit ? Math.round((used / w.credit_limit) * 100) : 0;
                          const key = w.gst_number || w.email; // fallback only for legacy rows
                          return (
                            <tr key={key} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                {w.gst_number ? (
                                  <span className="font-mono text-xs text-gray-800">{w.gst_number}</span>
                                ) : (
                                  <span className="text-xs text-amber-600">— legacy (no GST)</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-medium">{w.company || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {w.name || '—'}<br />
                                {w.email}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold">₹{(w.credit_limit || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-600">₹{(w.balance || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-sm text-gray-600">₹{used.toLocaleString()}</span>
                                <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1 ml-auto"><div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{width: `${pct}%`}}></div></div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                  {w.credit_period_days || 30}d
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => { setEditModal(w); setEditLimit(String(w.credit_limit || 0)); setEditBalance(String(w.balance || 0)); setEditPeriod(String(w.credit_period_days || 30)); setEditPassword(""); }}
                                  disabled={!w.gst_number}
                                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={w.gst_number ? "Edit" : "Legacy wallet — backfill GSTIN to edit"}
                                  data-testid={`edit-wallet-${key}`}
                                ><Pencil size={16} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ===== ORDER DETAIL MODAL ===== */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Order {selectedOrder.order_number}</h2>
                  <p className="text-sm text-gray-500">{formatDate(selectedOrder.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedOrder.payment_method === 'credit' && <span className="px-3 py-1 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">Credit</span>}
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[selectedOrder.status]?.color}`}>{statusConfig[selectedOrder.status]?.label}</span>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {selectedOrder.is_provisional && (
                  <div
                    className={`rounded-lg p-4 border ${
                      selectedOrder.payment_status === 'paid'
                        ? 'bg-emerald-50 border-emerald-200'
                        : selectedOrder.payment_status === 'balance_pending'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                    data-testid="admin-provisional-banner"
                  >
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock size={14} /> Provisional Bulk Order ({selectedOrder.advance_pct || 10}% advance)
                    </p>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                      <div>
                        <p className="text-gray-500">Advance</p>
                        <p className="font-semibold">₹{Number(selectedOrder.advance_amount || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Balance</p>
                        <p className="font-semibold">₹{Number(selectedOrder.balance_amount || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Stage</p>
                        <p className="font-semibold uppercase">{selectedOrder.payment_status}</p>
                      </div>
                    </div>
                    {selectedOrder.payment_status === 'pending_advance' && (
                      <p className="text-xs text-amber-800 mt-2">Awaiting customer to complete the advance payment.</p>
                    )}
                    {selectedOrder.payment_status === 'advance_paid' && (
                      <p className="text-xs text-amber-800 mt-2">Advance received — awaiting vendor to mark goods ready.</p>
                    )}
                    {selectedOrder.payment_status === 'balance_pending' && (
                      <p className="text-xs text-orange-800 mt-2">
                        Vendor reported ready quantities. Customer balance invoice has been emailed.
                        Use <strong>Mark Balance Paid</strong> below if the customer paid offline (NEFT/UPI/cash).
                      </p>
                    )}
                  </div>
                )}
                <div><h3 className="font-medium mb-3">Customer</h3><div className="bg-gray-50 rounded-lg p-4 space-y-2"><p className="font-medium">{selectedOrder.customer?.name}</p>{selectedOrder.customer?.company && <p className="text-gray-600">{selectedOrder.customer.company}</p>}<div className="flex items-center gap-2 text-sm text-gray-600"><Mail size={14} />{selectedOrder.customer?.email}</div><div className="flex items-center gap-2 text-sm text-gray-600"><Phone size={14} />{selectedOrder.customer?.phone}</div><div className="flex items-start gap-2 text-sm text-gray-600"><MapPin size={14} className="mt-0.5 flex-shrink-0" /><span>{selectedOrder.customer?.address}, {selectedOrder.customer?.city}, {selectedOrder.customer?.state} {selectedOrder.customer?.pincode}</span></div></div></div>
                {(() => {
                  // Group items by seller_id so multi-supplier orders show
                  // each supplier's slice (items + subtotal + SR shipment).
                  const groups = [];
                  const byId = new Map();
                  (selectedOrder.items || []).forEach((it, idx) => {
                    const sid = (it.seller_id || "_unknown").trim?.() || it.seller_id || "_unknown";
                    if (!byId.has(sid)) {
                      const g = { seller_id: sid === "_unknown" ? "" : sid, seller_company: it.seller_company || "", items: [], subtotal: 0 };
                      byId.set(sid, g);
                      groups.push(g);
                    }
                    const grp = byId.get(sid);
                    grp.items.push({ ...it, _idx: idx });
                    grp.subtotal += Number(it.quantity || 0) * Number(it.price_per_meter || 0);
                  });
                  // Attach SR shipment info (if persisted as array).
                  //
                  // Hardened keying: real seller_ids are mapped only by
                  // their actual id (empty string is reserved for the
                  // "_unknown" group). Without this guard, a shipment row
                  // with `seller_id: ""` could collide with a different
                  // supplier's group whose `seller_id` is also empty in
                  // the items array — causing the SR# of supplier A to
                  // appear next to supplier B's name.
                  const srMap = new Map();
                  (selectedOrder.shiprocket_shipments || []).forEach((sh) => {
                    const k = (sh.seller_id || "").trim();
                    srMap.set(k, sh);
                  });
                  // Also build a name-based fallback for cases where the
                  // shipment row has a blank seller_id but a known
                  // seller_company string — better than showing the wrong
                  // SR# next to the wrong supplier.
                  const srByName = new Map();
                  (selectedOrder.shiprocket_shipments || []).forEach((sh) => {
                    const nm = (sh.seller_company || "").trim().toLowerCase();
                    if (nm && !srByName.has(nm)) srByName.set(nm, sh);
                  });
                  return (
                    <div>
                      <h3 className="font-medium mb-3">
                        Items <span className="text-gray-400 text-xs font-normal">({groups.length} supplier{groups.length > 1 ? "s" : ""})</span>
                      </h3>
                      {groups.map((g, gi) => {
                        // Strict id match first; only fall back to a name
                        // match when the shipment row has no seller_id at
                        // all. This stops Vasu's SR# leaking into the
                        // Locofast Online Services row when only one of
                        // the two pushes actually succeeded.
                        const gid = (g.seller_id || "").trim();
                        let sr = gid ? srMap.get(gid) : null;
                        if (!sr) {
                          const gnm = (g.seller_company || "").trim().toLowerCase();
                          const cand = gnm ? srByName.get(gnm) : null;
                          // Only accept the name-match if THIS shipment row
                          // didn't already get claimed by a different supplier
                          // earlier in the loop (prevents the duplicate-SR
                          // bug seen on prod with multi-supplier orders).
                          if (cand && !(gid && cand.seller_id && cand.seller_id !== gid)) sr = cand;
                        }
                        return (
                          <div key={g.seller_id || `g-${gi}`} className="border rounded-lg mb-3 overflow-hidden" data-testid={`order-supplier-${g.seller_id || gi}`}>
                            <div className="bg-emerald-50 px-4 py-2 flex items-center justify-between text-xs border-b">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-emerald-800">
                                  {g.seller_company || "(Supplier unknown)"}
                                </span>
                                <span className="text-emerald-600">·</span>
                                <span className="text-emerald-700">{g.items.length} item{g.items.length > 1 ? "s" : ""}</span>
                                <span className="text-emerald-600">·</span>
                                <span className="text-emerald-700 font-medium">₹{g.subtotal.toLocaleString()}</span>
                              </div>
                              {sr ? (
                                sr.success ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white text-emerald-700 text-[11px] font-medium">
                                    <Truck size={11} /> SR #{sr.order_id}{sr.awb_code ? ` · AWB ${sr.awb_code}` : ""}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-[11px] font-medium" title={sr.error || ""}>
                                    <AlertTriangle size={11} /> Push failed
                                  </span>
                                )
                              ) : null}
                            </div>
                            <div className="divide-y">
                              {g.items.map((item) => (
                                <div key={item._idx} className="p-4 flex gap-4">
                                  {item.image_url && <img src={item.image_url} alt={item.fabric_name} className="w-16 h-16 object-cover rounded" />}
                                  <div className="flex-1">
                                    <p className="font-medium">{item.fabric_name}</p>
                                    <p className="text-sm text-gray-500">{item.category_name}</p>
                                    <div className="mt-1 flex gap-3 text-sm">
                                      <span className={`px-2 py-0.5 rounded text-xs ${item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{item.order_type}</span>
                                      <span className="text-gray-600">{item.quantity}m × ₹{item.price_per_meter}/m</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium">₹{(item.quantity * item.price_per_meter).toLocaleString()}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div><h3 className="font-medium mb-3">Payment</h3><div className="bg-gray-50 rounded-lg p-4 space-y-2"><div className="flex justify-between"><span className="text-gray-600">Order Value</span><span>₹{selectedOrder.subtotal?.toLocaleString()}</span></div>{selectedOrder.packaging_charge > 0 ? (<><div className="flex justify-between"><span className="text-gray-600">Packaging</span><span>₹{selectedOrder.packaging_charge?.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-gray-600">Logistics</span><span>₹{selectedOrder.logistics_only_charge?.toLocaleString()}</span></div></>) : selectedOrder.logistics_charge > 0 && <div className="flex justify-between"><span className="text-gray-600">Logistics</span><span>₹{selectedOrder.logistics_charge?.toLocaleString()}</span></div>}<div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-dashed border-gray-200"><span>Gross Value</span><span>₹{(Number(selectedOrder.subtotal||0) + Number(selectedOrder.packaging_charge||0) + Number(selectedOrder.logistics_only_charge||selectedOrder.logistics_charge||0)).toLocaleString(undefined,{minimumFractionDigits:2})}</span></div><div className="flex justify-between"><span className="text-gray-600">GST</span><span>₹{selectedOrder.tax?.toLocaleString()}</span></div>{selectedOrder.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-₹{selectedOrder.discount?.toLocaleString()}</span></div>}<div className="flex justify-between pt-2 border-t font-semibold"><span>Total Invoice Value</span><span className="text-emerald-600">₹{selectedOrder.total?.toLocaleString()}</span></div><div className="flex justify-between pt-2 text-sm"><span className="text-gray-600">Method</span><span className="font-medium">{selectedOrder.payment_method === 'credit' ? 'Locofast Credit' : 'Razorpay'}</span></div></div></div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium flex items-center gap-2">
                      Commission &amp; Seller Payout
                      {sellerComms?.sellers?.length > 1 && (
                        <span className="text-[11px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                          {sellerComms.sellers.length} suppliers
                        </span>
                      )}
                      {sellerComms?.paid === false && sellerComms?.sellers?.[0]?.source === "preview" && (
                        <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Preview · locks in on payment</span>
                      )}
                    </h3>
                    <button
                      onClick={handleOrderResyncCommission}
                      disabled={commResyncBusy || !sellerComms?.sellers?.length}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Recompute commission on this order's pending payouts using current rules"
                      data-testid="order-resync-commission-btn"
                    >
                      <RotateCw size={11} className={commResyncBusy ? "animate-spin" : ""} />
                      {commResyncBusy ? "Resyncing…" : "Resync"}
                    </button>
                  </div>
                  {sellerComms?.sellers?.length ? (
                    <div className="space-y-2">
                      {sellerComms.sellers.map((sc, idx) => (
                        <div key={sc.seller_id || idx} className="bg-amber-50 rounded-lg p-4 border border-amber-200" data-testid={`order-commission-${sc.seller_id || idx}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-amber-900 truncate" data-testid="order-detail-vendor-name">{sc.seller_company || "—"}</span>
                              <span className="text-[11px] text-amber-700">· {sc.items_count} item{sc.items_count > 1 ? "s" : ""}</span>
                            </div>
                            {sc.status && sc.status !== "preview" && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${sc.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{sc.status}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-gray-600">Gross subtotal</span><span className="font-medium">₹{Number(sc.gross_subtotal || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Commission %</span><span className="font-semibold text-amber-700">{sc.commission_pct_weighted || 0}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Commission ₹</span><span className="font-medium text-amber-700">−₹{Number(sc.commission_total || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">+ GST on comm</span><span className="text-amber-700">−₹{Number(sc.gst_on_commission || 0).toLocaleString()} <span className="text-[10px] text-gray-400">@{sc.commission_gst_pct || 18}%</span></span></div>
                          </div>
                          <div className="flex justify-between mt-2 pt-2 border-t border-amber-200">
                            <span className="text-emerald-700 font-semibold text-sm">Net payable to supplier</span>
                            <span className="text-emerald-700 font-bold text-sm">₹{Number(sc.net_payable || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                      {sellerComms.sellers.length > 1 && (
                        <div className="bg-gray-50 rounded-lg px-4 py-2 flex justify-between text-sm">
                          <span className="text-gray-600">Total commission (Locofast)</span>
                          <span className="font-semibold text-amber-700">₹{Number(sellerComms.sellers.reduce((sum, s) => sum + (s.commission_total || 0), 0)).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-gray-600">Vendor</span><span className="font-semibold text-amber-800" data-testid="order-detail-vendor-name">{selectedOrder.seller_company || selectedOrder.items?.[0]?.seller_company || '—'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-600">Commission Rate</span><span className="font-semibold text-amber-600">{selectedOrder.commission_pct || 5}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-600">Commission Amount</span><span className="font-medium text-amber-700">₹{(selectedOrder.commission_amount || 0).toLocaleString()}</span></div>
                      <div className="flex justify-between pt-2 border-t border-amber-200"><span className="text-emerald-700 font-semibold">Seller Payout</span><span className="text-emerald-700 font-bold">₹{(selectedOrder.seller_payout || 0).toLocaleString()}</span></div>
                    </div>
                  )}
                  {selectedOrder.pickup_address_id && (
                    <div className="pt-2 mt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Pickup (this order)</p>
                      <p className="text-xs text-amber-800">Custom pickup address selected for this order</p>
                    </div>
                  )}
                </div>
                {selectedOrder.cancellation_reason && <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="text-red-700 font-medium flex items-center gap-2"><AlertTriangle size={16} />Cancelled: {selectedOrder.cancellation_reason === 'stock_out' ? 'Stock Out' : selectedOrder.cancellation_reason === 'credit_limit' ? 'Lack of Credit Limit' : selectedOrder.cancellation_reason}</p></div>}
                <OrderEmailAudit orderId={selectedOrder.id} orderNumber={selectedOrder.order_number} />
              </div>
              <div className="p-6 border-t flex justify-between">
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => handleResendConfirmation(selectedOrder.id)} className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Mail size={16} />Resend Email</button>
                  {selectedOrder.is_provisional && selectedOrder.payment_status === 'balance_pending' && (
                    <button
                      onClick={handleMarkBalancePaid}
                      disabled={balancePaidBusy}
                      className="flex items-center gap-2 px-4 py-2 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 font-medium disabled:opacity-50"
                      data-testid="admin-mark-balance-paid-btn"
                      title={`Mark balance of ₹${Number(selectedOrder.balance_amount || 0).toLocaleString('en-IN')} as paid`}
                    >
                      {balancePaidBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      Mark Balance Paid (₹{Number(selectedOrder.balance_amount || 0).toLocaleString('en-IN')})
                    </button>
                  )}
                  {selectedOrder.payment_status !== 'paid' && !(selectedOrder.is_provisional && selectedOrder.payment_status === 'balance_pending') && (
                    <button
                      onClick={() => { setMarkPayForm({ payment_status: "paid", payment_method: "neft", utr: "", notes: "" }); setMarkPayOpen(true); }}
                      className="flex items-center gap-2 px-4 py-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 font-medium"
                      data-testid="admin-mark-paid-btn"
                    >
                      <CheckCircle size={16} />Mark as Paid
                    </button>
                  )}
                  {selectedOrder.payment_status === 'paid' && <a href={downloadInvoice(selectedOrder.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" data-testid="admin-order-invoice-btn"><FileText size={16} />Invoice</a>}
                  {selectedOrder.linked_invoice?.eway_bill_url && <a href={selectedOrder.linked_invoice.eway_bill_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg" data-testid="admin-order-eway-btn" title={`E-way Bill ${selectedOrder.linked_invoice.eway_bill_number || ''}`}><Receipt size={16} />E-way Bill</a>}
                  {selectedOrder.brand_id && !selectedOrder.linked_invoice && <a href={`/admin/brands/${selectedOrder.brand_id}/financials`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg text-sm" title="Upload E-way Bill via Financials"><Receipt size={16} />Add E-way Bill</a>}

                  {/* Shiprocket push — visible for every order. Shows current state + push/re-push controls. */}
                  {(selectedOrder.shiprocket_shipments?.length > 0) ? (
                    <div className="flex items-center gap-2" data-testid="admin-order-sr-status">
                      {(() => {
                        const ships = selectedOrder.shiprocket_shipments;
                        const ok = ships.filter((s) => s.success).length;
                        const total = ships.length;
                        const allOk = ok === total;
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                              allOk ? "bg-emerald-50 text-emerald-700" : ok > 0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                            }`}
                            title={ships.map((s) => `${s.seller_company || s.seller_id || "?"}: ${s.success ? `SR #${s.order_id}` : (s.error || "failed")}`).join("\n")}
                            data-testid="admin-order-sr-vertical-badge"
                          >
                            <Truck size={14} />
                            {total > 1 ? `${ok}/${total} shipments` : (
                              ships[0].success ? `Shiprocket #${ships[0].order_id}` : "Push failed"
                            )}
                          </span>
                        );
                      })()}
                      <button
                        onClick={() => orderSuppliers.length > 1 ? openPushPicker() : handlePushToShiprocket(true)}
                        disabled={pushingShiprocket}
                        className="px-2 py-2 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50 text-xs"
                        title={orderSuppliers.length > 1 ? "Choose which suppliers to push" : "Force re-push (creates duplicates in Shiprocket)"}
                        data-testid="admin-order-sr-repush"
                      >
                        {pushingShiprocket ? <Loader2 size={14} className="animate-spin" /> : (orderSuppliers.length > 1 ? "Push…" : "Re-push")}
                      </button>
                    </div>
                  ) : selectedOrder.shiprocket_order_id ? (
                    <div className="flex items-center gap-2" data-testid="admin-order-sr-status">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                          selectedOrder.shiprocket_vertical === "cargo"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                        title={`Shipment ID: ${selectedOrder.shiprocket_shipment_id || '—'}${selectedOrder.shiprocket_lrn ? ' · LRN ' + selectedOrder.shiprocket_lrn : ''}`}
                        data-testid="admin-order-sr-vertical-badge"
                      >
                        <Truck size={14} />
                        {selectedOrder.shiprocket_vertical === "cargo" ? "Cargo" : "Shiprocket"} #{selectedOrder.shiprocket_order_id}
                        {selectedOrder.shiprocket_waybill_no && <span className="text-[11px] ml-1 opacity-80">· LR {selectedOrder.shiprocket_waybill_no}</span>}
                        {!selectedOrder.shiprocket_waybill_no && selectedOrder.awb_code && <span className="text-[11px] ml-1 opacity-80">· AWB {selectedOrder.awb_code}</span>}
                      </span>
                      <button
                        onClick={() => handlePushToShiprocket(true)}
                        disabled={pushingShiprocket}
                        className="px-2 py-2 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50 text-xs"
                        title="Force re-push (creates duplicate — use only if SR record was deleted)"
                        data-testid="admin-order-sr-repush"
                      >
                        {pushingShiprocket ? <Loader2 size={14} className="animate-spin" /> : "Re-push"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => orderSuppliers.length > 1 ? openPushPicker() : handlePushToShiprocket(false)}
                      disabled={pushingShiprocket || selectedOrder.status === 'cancelled'}
                      className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                      data-testid="admin-order-sr-push"
                      title={(() => {
                        if (orderSuppliers.length > 1) return `Choose which of the ${orderSuppliers.length} supplier shipments to push`;
                        const isBulk = (selectedOrder.items || []).length > 0 && (selectedOrder.items || []).every(it => (it.order_type || '').toLowerCase() === 'production');
                        return isBulk
                          ? "Create LTL freight shipment in Shiprocket Cargo (B2B)"
                          : "Create courier shipment in Shiprocket (B2C)";
                      })()}
                    >
                      {pushingShiprocket ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      {(() => {
                        if (orderSuppliers.length > 1) return `Push to Shiprocket (${orderSuppliers.length} suppliers)`;
                        const isBulk = (selectedOrder.items || []).length > 0 && (selectedOrder.items || []).every(it => (it.order_type || '').toLowerCase() === 'production');
                        return isBulk ? "Push to Cargo (B2B)" : "Push to Shiprocket";
                      })()}
                    </button>
                  )}
                </div>
                <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== CANCEL MODAL ===== */}
        {cancelModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCancelModal(null)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="cancel-modal">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full"><Ban size={20} className="text-red-600" /></div>
                <div><h3 className="text-lg font-semibold">Cancel Order</h3><p className="text-sm text-gray-500">{cancelModal.order_number}</p></div>
              </div>
              <p className="text-sm text-gray-600 mb-4">Select a reason for cancellation{cancelModal.payment_method === 'credit' ? '. Credit will be refunded to the wallet.' : '.'}</p>
              <div className="space-y-2 mb-6">
                {[
                  { value: 'stock_out', label: 'Stock Out', desc: 'Item is no longer available' },
                  { value: 'credit_limit', label: 'Lack of Credit Limit', desc: 'Customer credit insufficient' },
                  { value: 'customer_request', label: 'Customer Request', desc: 'Buyer requested cancellation' },
                  { value: 'other', label: 'Other', desc: 'Other reason' },
                ].map(r => (
                  <label key={r.value} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${cancelReason === r.value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="cancelReason" value={r.value} checked={cancelReason === r.value} onChange={() => setCancelReason(r.value)} />
                    <div><p className="font-medium text-sm">{r.label}</p><p className="text-xs text-gray-500">{r.desc}</p></div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCancelModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Keep Order</button>
                <button onClick={handleCancel} disabled={!cancelReason} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50" data-testid="confirm-cancel-btn">Cancel Order</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== EDIT CREDIT MODAL ===== */}
        {editModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="edit-credit-modal">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Edit Credit — {editModal.company || editModal.name || editModal.gst_number}</h3>
                {editModal.gst_number && <p className="text-xs text-gray-500 font-mono">GSTIN: {editModal.gst_number}</p>}
                <button onClick={() => setEditModal(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="space-y-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Credit Limit (₹)</label><input type="number" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="edit-credit-limit" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Available Balance (₹)</label><input type="number" value={editBalance} onChange={(e) => setEditBalance(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="edit-credit-balance" /></div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Credit Period</label>
                  <select value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none bg-white" data-testid="edit-credit-period">
                    <option value="30">30 days (1.5% surcharge)</option>
                    <option value="60">60 days (3.0% surcharge)</option>
                    <option value="90">90 days (4.5% surcharge)</option>
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">Surcharge added to invoice when buyer pays via credit. Cash/Razorpay orders are charge-free.</p>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Password (required) *</label><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Enter password to save" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" data-testid="edit-credit-password" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleEditSave} disabled={!editPassword} className="flex-1 px-4 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" data-testid="save-credit-btn">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== BULK UPLOAD MODAL ===== */}
        <BulkCreditUpload
          open={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={fetchWallets}
          currentWallets={wallets}
        />

        {/* ===== SET CREDIT LIMIT BY GST (single-entry) ===== */}
        <SetCreditByGstModal
          open={showSetByGst}
          onClose={() => setShowSetByGst(false)}
          onSuccess={fetchWallets}
          existingWallets={wallets}
        />

        {/* ===== SHIPROCKET SUPPLIER PICKER ===== */}
        {srPickerOpen && selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="sr-picker-modal" onClick={() => !pushingShiprocket && setSrPickerOpen(false)}>
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-semibold text-gray-900">Push to Shiprocket</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Order {selectedOrder.order_number} · pick which supplier shipments to push</p>
                </div>
                <button onClick={() => !pushingShiprocket && setSrPickerOpen(false)} className="p-1 text-gray-400 hover:text-gray-600" disabled={pushingShiprocket}><X size={18} /></button>
              </div>

              <div className="p-5 space-y-2 overflow-y-auto flex-1">
                {orderSuppliers.map((s, idx) => {
                  const sh = s.shipment;
                  const alreadyOk = sh && sh.success;
                  const previouslyFailed = sh && sh.success === false;
                  const isSelected = srPickerSelected.includes(s.seller_id);
                  const disabled = alreadyOk && !srPickerForce;
                  return (
                    <label
                      key={s.seller_id || idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        disabled ? "opacity-50 cursor-not-allowed bg-gray-50" :
                        isSelected ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 hover:border-blue-300"
                      }`}
                      data-testid={`sr-picker-row-${s.seller_id || idx}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={(e) => {
                          if (e.target.checked) setSrPickerSelected([...srPickerSelected, s.seller_id]);
                          else setSrPickerSelected(srPickerSelected.filter((x) => x !== s.seller_id));
                        }}
                        className="mt-1"
                        data-testid={`sr-picker-check-${s.seller_id || idx}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 truncate">{s.seller_company || "(Unknown supplier)"}</p>
                          {alreadyOk && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                              Already pushed · SR #{sh.order_id}
                            </span>
                          )}
                          {previouslyFailed && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700" title={sh.error || ""}>
                              Previous push failed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.items_count} item{s.items_count > 1 ? "s" : ""} · ₹{Number(s.subtotal || 0).toLocaleString()}
                        </p>
                        {previouslyFailed && sh.error && (
                          <p className="text-[11px] text-red-600 mt-1 italic">{sh.error}</p>
                        )}
                      </div>
                    </label>
                  );
                })}

                <label className="flex items-center gap-2 mt-3 pt-3 border-t text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={srPickerForce}
                    onChange={(e) => setSrPickerForce(e.target.checked)}
                    data-testid="sr-picker-force"
                  />
                  <span><strong className="text-amber-700">Force re-push</strong> already-pushed suppliers (creates duplicate shipments in Shiprocket — use only if SR records were deleted)</span>
                </label>
              </div>

              <div className="p-4 border-t flex items-center justify-between gap-2 flex-shrink-0 bg-gray-50">
                <p className="text-xs text-gray-500">
                  {srPickerSelected.length === 0 ? "Select at least one supplier" : `${srPickerSelected.length} of ${orderSuppliers.length} selected`}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSrPickerOpen(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" disabled={pushingShiprocket}>Cancel</button>
                  <button
                    onClick={handlePushSelectedSuppliers}
                    disabled={pushingShiprocket || srPickerSelected.length === 0}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                    data-testid="sr-picker-confirm"
                  >
                    {pushingShiprocket && <Loader2 size={14} className="animate-spin" />}
                    Push {srPickerSelected.length || ""} shipment{srPickerSelected.length === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MARK AS PAID MODAL ===== */}
        {markPayOpen && selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="mark-paid-modal" onClick={() => !markPayBusy && setMarkPayOpen(false)}>
            <div className="bg-white rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Manual Payment Status Update</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Order {selectedOrder.order_number} · Currently <strong className="uppercase">{selectedOrder.payment_status || "pending"}</strong></p>
                </div>
                <button onClick={() => !markPayBusy && setMarkPayOpen(false)} className="p-1 text-gray-400 hover:text-gray-600" disabled={markPayBusy}><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New Payment Status *</label>
                  <select
                    value={markPayForm.payment_status}
                    onChange={(e) => setMarkPayForm({ ...markPayForm, payment_status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    data-testid="mark-paid-status-select"
                  >
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="initiated">Initiated</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                {markPayForm.payment_status === "paid" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method *</label>
                      <select
                        value={markPayForm.payment_method}
                        onChange={(e) => setMarkPayForm({ ...markPayForm, payment_method: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        data-testid="mark-paid-method-select"
                      >
                        <option value="neft">NEFT</option>
                        <option value="rtgs">RTGS</option>
                        <option value="imps">IMPS</option>
                        <option value="upi">UPI</option>
                        <option value="cheque">Cheque</option>
                        <option value="cash">Cash</option>
                        <option value="razorpay">Razorpay (manual confirm)</option>
                        <option value="credit">Locofast Credit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">UTR / Reference No</label>
                      <input
                        value={markPayForm.utr}
                        onChange={(e) => setMarkPayForm({ ...markPayForm, utr: e.target.value })}
                        placeholder="e.g. UTR202605160001"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                        data-testid="mark-paid-utr"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes (for audit trail)</label>
                  <textarea
                    value={markPayForm.notes}
                    onChange={(e) => setMarkPayForm({ ...markPayForm, notes: e.target.value })}
                    rows={2}
                    placeholder="e.g. Bank confirmation received via email from accounts team"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    data-testid="mark-paid-notes"
                  />
                </div>
                {markPayForm.payment_status === "paid" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                    Marking as <strong>paid</strong> will: send the order confirmation email to the customer, materialize vendor payouts, and bump the fulfillment status to <strong>pending</strong> if it was waiting on payment.
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <button onClick={() => setMarkPayOpen(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" disabled={markPayBusy}>Cancel</button>
                <button
                  onClick={handleMarkPaymentStatus}
                  disabled={markPayBusy}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1"
                  data-testid="mark-paid-confirm"
                >
                  {markPayBusy && <Loader2 size={14} className="animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminOrders;
