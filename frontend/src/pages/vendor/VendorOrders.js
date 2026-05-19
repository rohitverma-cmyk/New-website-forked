import { useState, useEffect, useMemo } from "react";
import { Package, Clock, CheckCircle, Truck, MapPin, Phone, ExternalLink, FileText, Upload, AlertTriangle, Loader2, Boxes, Plus, Trash2 } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import VendorFileUpload from "../../components/vendor/VendorFileUpload";
import { getVendorOrders, vendorMarkGoodsReady, vendorAcceptOrder, vendorCancelOrder } from "../../lib/api";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const statusConfig = {
  payment_pending: { label: "Payment Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  provisional: { label: "Advance Paid · Pending Goods Ready", color: "bg-amber-100 text-amber-700", icon: Clock },
  goods_ready: { label: "Goods Ready · Balance Pending", color: "bg-orange-100 text-orange-700", icon: Boxes },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
  processing: { label: "Processing", color: "bg-indigo-100 text-indigo-700", icon: Package },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
};

const VendorOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  // `all` | `inventory` | `rfq` — splits direct catalog orders from
  // RFQ-quote-converted orders. RFQ orders carry source: 'rfq', everything
  // else (inventory + agent-assisted + brand) defaults to 'inventory'.
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  // Provisional "Mark Goods Ready" modal target order (null = closed)
  const [readyOrder, setReadyOrder] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await getVendorOrders();
      setOrders(res.data);
    } catch (err) {
      toast.error("Failed to load orders");
    }
    setLoading(false);
  };

  const visibleOrders = orders.filter((o) => {
    if (sourceFilter !== "all" && (o.source || "inventory") !== sourceFilter) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    return true;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  return (
    <VendorLayout>
      <div className="p-8" data-testid="vendor-orders">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Orders</h1>
            <p className="text-gray-500 mt-1">Orders containing your fabrics</p>
          </div>
          <div className="flex items-center gap-2" data-testid="vendor-orders-source-filter">
            {[
              { key: "all", label: "All" },
              { key: "inventory", label: "Inventory" },
              { key: "rfq", label: "RFQ" },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSourceFilter(s.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                  sourceFilter === s.key
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
                data-testid={`vendor-orders-source-${s.key}`}
              >
                {s.label}
                <span className="ml-1.5 text-[10px] text-gray-400">
                  {s.key === "all"
                    ? orders.length
                    : orders.filter((o) => (o.source || "inventory") === s.key).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Status tabs — one-tap filtering across order lifecycle */}
        <div className="bg-white rounded-lg border border-gray-200 mb-4" data-testid="vendor-order-status-tabs">
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto">
            {[
              { key: "", label: "All" },
              { key: "payment_pending", label: "Payment Pending" },
              { key: "provisional", label: "Advance Paid" },
              { key: "confirmed", label: "Confirmed" },
              { key: "goods_ready", label: "Goods Ready" },
              { key: "processing", label: "Processing" },
              { key: "shipped", label: "Shipped" },
              { key: "delivered", label: "Delivered" },
              { key: "cancelled", label: "Cancelled" },
            ].map((t) => {
              const scoped = orders.filter((o) => sourceFilter === "all" || (o.source || "inventory") === sourceFilter);
              const count = t.key === "" ? scoped.length : scoped.filter((o) => o.status === t.key).length;
              const active = statusFilter === t.key;
              return (
                <button
                  key={t.key || "all"}
                  type="button"
                  onClick={() => setStatusFilter(t.key)}
                  className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                    active
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                  data-testid={`vendor-order-tab-${t.key || "all"}`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-[10px] ${active ? "text-blue-500" : "text-gray-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading orders...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No orders yet</p>
            <p className="text-sm text-gray-400 mt-1">
              {sourceFilter === "rfq"
                ? "RFQ orders appear here when a customer accepts your quote."
                : "When customers order your fabrics, they'll appear here"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Your Payout</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.map((order) => {
                  const statusInfo = statusConfig[order.status] || statusConfig.confirmed;
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <tr 
                      key={order.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-blue-600">{order.order_number}</p>
                        <span className={`inline-block mt-1 text-[10px] font-semibold tracking-wide rounded-full px-2 py-0.5 border ${
                          (order.source || "inventory") === "rfq"
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`} data-testid={`vendor-order-source-${order.order_number}`}>
                          {(order.source || "inventory") === "rfq" ? "RFQ" : "Inventory"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm">
                          {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}m total
                        </p>
                        {/* Surface the SKU code(s) inline so vendors don't
                            need to open the modal to identify the fabric. */}
                        {order.items?.[0]?.fabric_code && (
                          <p className="text-[11px] text-gray-700 font-mono mt-1 truncate max-w-[180px]" title={order.items.map(i => i.fabric_code).filter(Boolean).join(', ')}>
                            {order.items[0].fabric_code}
                            {order.items.length > 1 ? ` +${order.items.length - 1}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{order.customer?.name}</p>
                        <p className="text-sm text-gray-500">{order.customer?.city}</p>
                      </td>
                      <td className="px-4 py-4">
                        {(order.commission_pct || 0) > 0 ? (
                          <>
                            <p className="text-sm text-amber-600 font-medium">{order.commission_pct}%</p>
                            <p className="text-xs text-gray-400">₹{(order.commission_amount || 0).toLocaleString()}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">—</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-emerald-600">₹{(order.seller_payout || order.subtotal || 0).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedOrder.order_number}</h2>
                    <p className="text-sm text-gray-500">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[selectedOrder.status]?.color || "bg-gray-100"}`}>
                    {statusConfig[selectedOrder.status]?.label || selectedOrder.status}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Vendor 24h Accept/Cancel banner — visible for pending acceptance */}
                {selectedOrder.vendor_acceptance_status === "pending" && (
                  <VendorAcceptanceBanner
                    order={selectedOrder}
                    onAction={(updated) => {
                      setSelectedOrder(updated);
                      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                    }}
                  />
                )}
                {/* Provisional bulk order banner */}
                {selectedOrder.is_provisional && (
                  <ProvisionalBanner
                    order={selectedOrder}
                    onMarkReady={() => setReadyOrder(selectedOrder)}
                  />
                )}
                {/* Non-provisional Mark Ready CTA — supplier uploads rolls + invoice */}
                {!selectedOrder.is_provisional && ["confirmed", "processing"].includes(selectedOrder.status) && (
                  <MarkReadyBanner order={selectedOrder} onMarkReady={() => setReadyOrder(selectedOrder)} />
                )}
                {/* Goods already marked ready — show summary */}
                {!selectedOrder.is_provisional && selectedOrder.status === "goods_ready" && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4" data-testid="vendor-banner-goods-ready-stamped">
                    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle size={14} /> Goods marked ready
                    </p>
                    <p className="text-xs text-emerald-800 mt-1">
                      Locofast Ops will push the shipment to Shiprocket shortly. Need to update rolls or re-upload invoice?
                      <button
                        type="button"
                        onClick={() => setReadyOrder(selectedOrder)}
                        className="ml-1 underline font-medium hover:text-emerald-950"
                        data-testid="vendor-edit-ready-btn"
                      >
                        Edit
                      </button>
                    </p>
                  </div>
                )}

                {/* Items */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Items to Prepare</h3>
                  <div className="space-y-3">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.fabric_name}</p>
                          {item.fabric_code && item.fabric_id ? (
                            <a
                              href={`/fabrics/${item.fabric_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900 mt-0.5 underline underline-offset-2"
                              data-testid={`vendor-order-sku-link-${item.fabric_id}`}
                              title="Open live product page"
                            >
                              <Package size={11} />
                              SKU: <span className="font-mono">{item.fabric_code}</span>
                              <ExternalLink size={10} />
                            </a>
                          ) : item.fabric_code ? (
                            <p className="text-xs text-gray-500 font-mono mt-0.5">SKU: {item.fabric_code}</p>
                          ) : null}
                          {item.color_name ? (
                            <p className="text-[11px] text-gray-500 mt-0.5">Color: {item.color_name}</p>
                          ) : null}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {item.order_type}
                          </span>
                          <p className="font-medium mt-1">{item.quantity}m</p>
                          {item.actual_quantity != null && (
                            <p className="text-[11px] text-emerald-700 mt-0.5">
                              Ready: <strong>{item.actual_quantity}m</strong>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Commission Info */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Sales Price & Your Payout</h3>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Sales Price Total <span className="text-xs text-gray-400">(what customer pays)</span></span>
                      <span className="font-medium">₹{(selectedOrder.subtotal || 0).toLocaleString()}</span>
                    </div>
                    {(selectedOrder.commission_pct || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Locofast Commission ({selectedOrder.commission_pct}%)</span>
                        <span className="font-medium text-amber-700">- ₹{(selectedOrder.commission_amount || 0).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base pt-2 border-t border-amber-200">
                      <span className="font-semibold text-emerald-700">Your Payout</span>
                      <span className="font-bold text-emerald-700 text-lg">₹{(selectedOrder.seller_payout || selectedOrder.subtotal || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>


                {/* Shipping */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Ship To</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="font-medium">{selectedOrder.customer?.name}</p>
                    {selectedOrder.customer?.company && (
                      <p className="text-gray-600">{selectedOrder.customer.company}</p>
                    )}
                    <div className="flex items-start gap-2 mt-2 text-sm text-gray-600">
                      <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                      <span>
                        {selectedOrder.customer?.address}, {selectedOrder.customer?.city}, {selectedOrder.customer?.state} {selectedOrder.customer?.pincode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                      <Phone size={16} />
                      {selectedOrder.customer?.phone}
                    </div>
                  </div>
                </div>

                {/* Vendor invoice upload (tied to payout) */}
                <VendorOrderInvoiceBlock order={selectedOrder} />
              </div>

              <div className="p-6 border-t border-gray-100">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mark Goods Ready modal — provisional bulk orders only */}
        {readyOrder && (
          <MarkGoodsReadyModal
            order={readyOrder}
            onClose={() => setReadyOrder(null)}
            onSuccess={(updated) => {
              setReadyOrder(null);
              setSelectedOrder(updated);
              setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            }}
          />
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorOrders;

// ─── Vendor 24h Accept/Cancel banner ──────────────────────────────
const VendorAcceptanceBanner = ({ order, onAction }) => {
  const [busy, setBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Live countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadline = order.vendor_action_deadline ? new Date(order.vendor_action_deadline).getTime() : null;
  const remainingMs = deadline ? Math.max(0, deadline - now) : null;
  const hrs = remainingMs != null ? Math.floor(remainingMs / 3600000) : null;
  const mins = remainingMs != null ? Math.floor((remainingMs % 3600000) / 60000) : null;
  const expired = remainingMs != null && remainingMs === 0;

  const handleAccept = async () => {
    if (!window.confirm("Confirm you will fulfil this order? You won't be able to cancel after.")) return;
    setBusy(true);
    try {
      const res = await vendorAcceptOrder(order.id);
      toast.success(res.data.all_accepted
        ? "Order accepted — all vendors confirmed"
        : "Order accepted on your behalf");
      onAction(res.data.order);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to accept");
    }
    setBusy(false);
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error("Please share a reason — it goes to the customer email");
      return;
    }
    setBusy(true);
    try {
      const res = await vendorCancelOrder(order.id, cancelReason.trim());
      toast.success("Order cancelled — customer and Locofast Accounts have been notified");
      onAction(res.data.order);
      setShowCancelModal(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to cancel");
    }
    setBusy(false);
  };

  return (
    <div className={`rounded-lg p-4 border ${expired ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`} data-testid="vendor-acceptance-banner">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className={`text-sm font-semibold flex items-center gap-1.5 ${expired ? "text-red-900" : "text-blue-900"}`}>
            <Clock size={14} /> {expired ? "Acceptance window expired" : "Action required: Accept or Cancel order"}
          </p>
          <p className={`text-xs mt-1 ${expired ? "text-red-800" : "text-blue-800"}`}>
            {expired
              ? "The 24h SLA has elapsed. The order will be auto-cancelled on the next sweep. Reach out to Locofast Operations if you can still fulfil."
              : "You have 24 hours from order assignment to confirm or decline this order."}
            {hrs != null && !expired && (
              <span className="ml-1 font-semibold">
                {hrs}h {mins}m remaining
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCancelModal(true)}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
            data-testid="vendor-cancel-order-btn"
          >
            Cancel Order
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy || expired}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
            data-testid="vendor-accept-order-btn"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Confirm Order
          </button>
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()} data-testid="vendor-cancel-modal">
            <h3 className="font-semibold text-base flex items-center gap-1.5 text-red-700">
              <AlertTriangle size={16} /> Cancel order {order.order_number}?
            </h3>
            <p className="text-xs text-gray-600 mt-2">
              The customer will receive a cancellation email. Any advance paid will be refunded. This action is final.
            </p>
            <label className="block text-xs font-medium text-gray-700 mt-3">Reason (will be shared with customer)</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Out of stock for the requested quantity; lead time exceeds customer's window…"
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded text-sm"
              data-testid="vendor-cancel-reason"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                data-testid="vendor-cancel-confirm"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Non-provisional Mark Goods Ready CTA ────────────────────────
const MarkReadyBanner = ({ order, onMarkReady }) => (
  <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4" data-testid="vendor-mark-ready-banner">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
          <Boxes size={14} /> Ready to dispatch? Mark goods ready.
        </p>
        <p className="text-xs text-emerald-800 mt-1">
          Upload your tax invoice and roll breakdown. Locofast Ops will then push the shipment to Shiprocket.
        </p>
      </div>
      <button
        type="button"
        onClick={onMarkReady}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
        data-testid="vendor-mark-goods-ready-btn"
      >
        <Boxes size={14} /> Mark Goods Ready
      </button>
    </div>
  </div>
);

// ─── Provisional bulk-order banner ────────────────────────────────
const ProvisionalBanner = ({ order, onMarkReady }) => {
  const paymentStatus = order.payment_status;
  const advance = Number(order.advance_amount || 0);
  const balance = Number(order.balance_amount || 0);
  const advancePct = order.advance_pct || 10;

  if (paymentStatus === "pending_advance") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4" data-testid="vendor-provisional-banner-pending">
        <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
          <Clock size={14} /> Awaiting customer advance ({advancePct}%)
        </p>
        <p className="text-xs text-amber-800 mt-1">
          The customer hasn't completed the {advancePct}% advance payment yet. You'll be able to mark goods ready once advance is received.
        </p>
      </div>
    );
  }

  if (paymentStatus === "advance_paid") {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4" data-testid="vendor-provisional-banner-ready-action">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <Boxes size={14} /> Advance received — please mark goods ready
            </p>
            <p className="text-xs text-amber-800 mt-1">
              Customer paid <strong>₹{advance.toLocaleString("en-IN")}</strong> ({advancePct}% advance).
              Enter the actual dispatched quantity per item with the roll breakdown. We'll auto-invoice the customer for the balance.
            </p>
          </div>
          <button
            type="button"
            onClick={onMarkReady}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
            data-testid="vendor-mark-goods-ready-btn"
          >
            <Boxes size={14} /> Mark Goods Ready
          </button>
        </div>
      </div>
    );
  }

  if (paymentStatus === "balance_pending") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4" data-testid="vendor-provisional-banner-balance">
        <p className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
          <CheckCircle size={14} /> Goods ready — awaiting balance payment
        </p>
        <p className="text-xs text-orange-800 mt-1">
          Customer balance due: <strong>₹{balance.toLocaleString("en-IN")}</strong>. We've emailed them the
          balance invoice — shipment will be released to Shiprocket once payment is received.
        </p>
        <button
          type="button"
          onClick={onMarkReady}
          className="mt-2 text-xs font-medium text-orange-700 hover:text-orange-900 underline"
          data-testid="vendor-edit-goods-ready-btn"
        >
          Edit dispatched quantities
        </button>
      </div>
    );
  }

  if (paymentStatus === "paid") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4" data-testid="vendor-provisional-banner-paid">
        <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
          <CheckCircle size={14} /> Balance paid — ready to ship
        </p>
        <p className="text-xs text-emerald-800 mt-1">
          Customer has settled the balance. Order is being pushed to Shiprocket.
        </p>
      </div>
    );
  }

  return null;
};

// ─── Mark Goods Ready modal — provisional bulk orders only ───────
const MarkGoodsReadyModal = ({ order, onClose, onSuccess }) => {
  const vendorId = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("vendor_data") || "{}")?.id || ""; }
    catch { return ""; }
  }, []);

  // Items the current vendor is responsible for in this order
  const myItems = useMemo(
    () => (order.items || []).filter((it) => (it.order_type || "bulk") === "bulk" && (!vendorId || (it.seller_id || "") === vendorId)),
    [order, vendorId]
  );

  // Per-item state: { fabricId: { rolls: [{count, length}], note: "" } }
  const [state, setState] = useState(() => {
    const init = {};
    myItems.forEach((it) => {
      const existing = it.dispatch_rolls || [];
      init[it.fabric_id] = {
        rolls: existing.length ? existing.map((r) => ({ count: r.count, length: r.length })) : [{ count: "", length: "" }],
        note: it.dispatch_note || "",
      };
    });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  // Per-vendor tax invoice (required at goods-ready time)
  const existingInvoice = useMemo(
    () => (order.vendor_invoices || []).find((v) => (v.seller_id || "") === vendorId) || null,
    [order, vendorId]
  );
  const [invFile, setInvFile] = useState(
    existingInvoice?.url ? { url: existingInvoice.url, filename: existingInvoice.filename || "" } : null
  );
  const [invNumber, setInvNumber] = useState(existingInvoice?.invoice_number || "");
  const [invDate, setInvDate] = useState(existingInvoice?.invoice_date || new Date().toISOString().slice(0, 10));
  const [invAmount, setInvAmount] = useState(existingInvoice?.amount || "");

  const updateRoll = (fabricId, idx, field, value) => {
    setState((prev) => {
      const rolls = [...(prev[fabricId]?.rolls || [])];
      rolls[idx] = { ...rolls[idx], [field]: value };
      return { ...prev, [fabricId]: { ...prev[fabricId], rolls } };
    });
  };
  const addRoll = (fabricId) => {
    setState((prev) => {
      const rolls = [...(prev[fabricId]?.rolls || []), { count: "", length: "" }];
      return { ...prev, [fabricId]: { ...prev[fabricId], rolls } };
    });
  };
  const removeRoll = (fabricId, idx) => {
    setState((prev) => {
      const rolls = [...(prev[fabricId]?.rolls || [])];
      rolls.splice(idx, 1);
      return { ...prev, [fabricId]: { ...prev[fabricId], rolls: rolls.length ? rolls : [{ count: "", length: "" }] } };
    });
  };
  const setNote = (fabricId, value) => {
    setState((prev) => ({ ...prev, [fabricId]: { ...prev[fabricId], note: value } }));
  };

  const totalFor = (fabricId) => {
    const rolls = state[fabricId]?.rolls || [];
    return rolls.reduce((s, r) => s + (Number(r.count) || 0) * (Number(r.length) || 0), 0);
  };

  const variancePct = (fabricId, ordered) => {
    if (!ordered) return 0;
    const actual = totalFor(fabricId);
    return ((actual - ordered) / ordered) * 100;
  };

  const submit = async () => {
    const items = myItems.map((it) => {
      const rolls = (state[it.fabric_id]?.rolls || [])
        .filter((r) => Number(r.count) > 0 && Number(r.length) > 0)
        .map((r) => ({ count: Number(r.count), length: Number(r.length) }));
      const actual = rolls.reduce((s, r) => s + r.count * r.length, 0);
      return {
        fabric_id: it.fabric_id,
        actual_quantity: actual,
        rolls,
        dispatch_note: state[it.fabric_id]?.note || "",
      };
    });

    // Validate every item has at least one roll
    const missing = myItems.find((it) => !items.find((p) => p.fabric_id === it.fabric_id && p.rolls.length > 0));
    if (missing) {
      toast.error(`Add at least one roll for "${missing.fabric_name}"`);
      return;
    }

    // Validate invoice (required at goods-ready time)
    if (!invFile?.url) {
      toast.error("Please upload your tax invoice PDF/image");
      return;
    }
    if (!invNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!invDate) {
      toast.error("Invoice date is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await vendorMarkGoodsReady(order.id, items, {
        url: invFile.url,
        filename: invFile.filename || "",
        invoice_number: invNumber.trim(),
        invoice_date: invDate,
        amount: invAmount ? Number(invAmount) : null,
      });
      toast.success(res.data?.all_ready
        ? "Goods marked ready — balance invoice emailed to customer"
        : "Quantities saved. Other vendors still need to confirm their items.");
      onSuccess(res.data.order);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to mark goods ready");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="vendor-mark-ready-modal"
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-1.5">
              <Boxes size={18} className="text-amber-600" /> Mark Goods Ready
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Order {order.order_number} · Enter exact dispatched quantity per item with the roll breakdown.
              Customer is auto-invoiced for the balance.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {myItems.length === 0 ? (
            <p className="text-sm text-gray-500">No bulk items assigned to you on this order.</p>
          ) : (
            myItems.map((item) => {
              const total = totalFor(item.fabric_id);
              const ordered = Number(item.quantity || 0);
              const vPct = variancePct(item.fabric_id, ordered);
              const outOfBand = Math.abs(vPct) > 10;
              return (
                <div
                  key={item.fabric_id}
                  className="border border-gray-200 rounded-lg p-4 space-y-3"
                  data-testid={`mark-ready-item-${item.fabric_id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.fabric_name}</p>
                      {item.fabric_code && (
                        <p className="text-xs text-gray-500 font-mono">SKU: {item.fabric_code}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        Ordered: <strong>{ordered}m</strong> @ ₹{item.price_per_meter}/m
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Total entered</p>
                      <p className={`text-lg font-bold ${outOfBand ? "text-red-600" : "text-emerald-700"}`}>
                        {total}m
                      </p>
                      {ordered > 0 && total > 0 && (
                        <p className={`text-[11px] ${outOfBand ? "text-red-600" : "text-gray-500"}`}>
                          {vPct >= 0 ? "+" : ""}{vPct.toFixed(1)}% vs ordered
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Roll rows */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Rolls breakdown</p>
                    {(state[item.fabric_id]?.rolls || []).map((roll, idx) => (
                      <div key={idx} className="flex items-center gap-2" data-testid={`mark-ready-roll-${item.fabric_id}-${idx}`}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="# rolls"
                          value={roll.count}
                          onChange={(e) => updateRoll(item.fabric_id, idx, "count", e.target.value)}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm"
                          data-testid={`mark-ready-roll-count-${item.fabric_id}-${idx}`}
                        />
                        <span className="text-gray-400">×</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="length (m)"
                          value={roll.length}
                          onChange={(e) => updateRoll(item.fabric_id, idx, "length", e.target.value)}
                          className="w-32 px-2 py-1.5 border border-gray-200 rounded text-sm"
                          data-testid={`mark-ready-roll-length-${item.fabric_id}-${idx}`}
                        />
                        <span className="text-xs text-gray-500 flex-1">
                          = {((Number(roll.count) || 0) * (Number(roll.length) || 0)).toFixed(2)}m
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRoll(item.fabric_id, idx)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          aria-label="Remove roll"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addRoll(item.fabric_id)}
                      className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1"
                      data-testid={`mark-ready-add-roll-${item.fabric_id}`}
                    >
                      <Plus size={12} /> Add roll
                    </button>
                  </div>

                  {outOfBand && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Variance is outside the ±10% band. The order will be rejected unless an admin overrides it.
                        Adjust quantities or contact Locofast operations.
                      </span>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Dispatch note (optional) — batch #, lot details, special handling…"
                    value={state[item.fabric_id]?.note || ""}
                    onChange={(e) => setNote(item.fabric_id, e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs"
                    data-testid={`mark-ready-note-${item.fabric_id}`}
                  />
                </div>
              );
            })
          )}

          {/* Tax Invoice (required for vendor payouts) */}
          {myItems.length > 0 && (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-4 space-y-3" data-testid="mark-ready-invoice-block">
              <div>
                <h3 className="font-medium text-gray-900 flex items-center gap-1.5">
                  <FileText size={14} className="text-emerald-600" /> Tax Invoice for Payout
                  <span className="text-red-500 text-xs">*</span>
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Upload your GST tax invoice now. This invoice is what your payout will be drawn against —
                  no separate upload from My Payouts needed.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={invNumber}
                  onChange={(e) => setInvNumber(e.target.value)}
                  placeholder="Invoice number *"
                  className="px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  data-testid="mark-ready-invoice-number"
                />
                <input
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                  data-testid="mark-ready-invoice-date"
                />
              </div>
              <input
                type="number"
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                placeholder="Invoice total (optional — auto-derived from actual quantities × rate)"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm"
                data-testid="mark-ready-invoice-amount"
              />
              <VendorFileUpload
                value={invFile}
                onChange={setInvFile}
                folder="uploads/payouts/vendor-invoices"
                testid="mark-ready-invoice-upload"
              />
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
            data-testid="mark-ready-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || myItems.length === 0}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            data-testid="mark-ready-submit"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Confirm Goods Ready
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Invoice Upload block inside Order detail modal ───────────────
const VendorOrderInvoiceBlock = ({ order }) => {
  const [loading, setLoading] = useState(true);
  const [payout, setPayout] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [fileMeta, setFileMeta] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem("vendor_token");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/vendor/payouts`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        const match = (data.payouts || []).find((p) => p.order_id === order.id);
        if (cancelled) return;
        setPayout(match || null);
        if (match) {
          setInvoiceNumber(match.vendor_invoice_number || "");
          setInvoiceDate(match.vendor_invoice_date || new Date().toISOString().slice(0, 10));
          setAmount(match.vendor_invoice_amount ?? match.supplier_invoice_value ?? match.net_payable ?? "");
          if (match.vendor_invoice_url) {
            setFileMeta({ url: match.vendor_invoice_url, filename: match.vendor_invoice_filename || match.vendor_invoice_url.split("/").pop() });
          }
        }
      } catch (e) {
        // ignore — payout simply doesn't exist yet
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [order.id, token]);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-1">
        <Loader2 size={12} className="animate-spin" /> Checking payout status…
      </div>
    );
  }

  if (!payout) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-700 mb-0.5">Invoice upload not available yet</p>
        Payout becomes available once the customer's payment is settled. You can upload your invoice from
        <strong> My Payouts</strong> after that.
      </div>
    );
  }

  const status = payout.vendor_invoice_status || "not_uploaded";

  const submit = async () => {
    if (!fileMeta?.url) { toast.error("Please upload an invoice file first"); return; }
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/vendor/payouts/${payout.id}/upload-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          invoice_url: fileMeta.url,
          filename: fileMeta.filename || "",
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          amount: amount ? Number(amount) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const data = await res.json();
      toast.success("Invoice submitted. Locofast Accounts has been notified.");
      setPayout(data.payout);
    } catch (e) {
      toast.error(e.message || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-4" data-testid="vendor-order-invoice-block">
      <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-1">
        <FileText size={14} className="text-emerald-600" />
        Tax Invoice for Payout
      </h3>

      <div className="text-[12px] text-gray-700 mb-3 space-y-0.5">
        <p>Your invoice value (incl. {payout.goods_gst_pct ?? 5}% GST on goods): <strong>₹{Number(payout.supplier_invoice_value || payout.gross_subtotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></p>
        <p className="text-red-600">Less: Commission ₹{Number(payout.commission_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} + {payout.commission_gst_pct ?? 18}% GST ₹{Number(payout.gst_on_commission || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
        <p>Net payable to you: <strong className="text-emerald-700">₹{Number(payout.net_payable || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></p>
      </div>

      {status === "uploaded" && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
          <p className="font-semibold text-blue-800 mb-1">Invoice submitted — awaiting payout</p>
          <p className="text-blue-700">
            Submitted on {(payout.vendor_invoice_uploaded_at || "").slice(0, 19).replace("T", " ")}.
          </p>
          {payout.vendor_invoice_url && (
            <a
              href={payout.vendor_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-700 hover:underline mt-1"
              data-testid="vendor-order-invoice-link"
            >
              <ExternalLink size={11} /> View uploaded invoice
            </a>
          )}
        </div>
      )}

      {status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs mb-3">
          <p className="font-semibold text-red-800 flex items-center gap-1">
            <AlertTriangle size={12} /> Previous invoice was rejected
          </p>
          <p className="text-red-700 mt-1">Reason: {payout.vendor_invoice_rejection_reason || "—"}</p>
          <p className="text-red-600 mt-1">Please re-upload a corrected invoice below.</p>
        </div>
      )}

      {payout.status === "paid" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs">
          <p className="font-semibold text-emerald-800 flex items-center gap-1">
            <CheckCircle size={12} /> Payout received
          </p>
          <p className="text-emerald-700 mt-1">UTR: {payout.utr || "—"} · Paid on {(payout.paid_at || "").slice(0, 10)}</p>
        </div>
      )}

      {(status === "not_uploaded" || status === "rejected") && payout.status !== "paid" && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Invoice number *"
              className="px-2.5 py-1.5 border border-gray-200 rounded text-xs"
              data-testid="vendor-order-invoice-number"
            />
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded text-xs"
            />
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Invoice total (default ₹${payout.supplier_invoice_value || payout.net_payable})`}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs mb-2"
          />
          <VendorFileUpload
            value={fileMeta}
            onChange={setFileMeta}
            folder="uploads/payouts/vendor-invoices"
            testid="vendor-order-invoice-upload"
          />
          <button
            onClick={submit}
            disabled={submitting || !fileMeta?.url || !invoiceNumber.trim()}
            className="mt-3 w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="vendor-order-invoice-submit"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Submit invoice for payout
          </button>
        </>
      )}
    </div>
  );
};
