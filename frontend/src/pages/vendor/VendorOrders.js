import { useState, useEffect } from "react";
import { Package, Clock, CheckCircle, Truck, MapPin, Phone } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import { getVendorOrders } from "../../lib/api";
import { toast } from "sonner";

const statusConfig = {
  payment_pending: { label: "Payment Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
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
    if (sourceFilter === "all") return true;
    return (o.source || "inventory") === sourceFilter;
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
                {/* Items */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Items to Prepare</h3>
                  <div className="space-y-3">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium">{item.fabric_name}</p>
                          <p className="text-sm text-gray-500">{item.fabric_code}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {item.order_type}
                          </span>
                          <p className="font-medium mt-1">{item.quantity}m</p>
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
      </div>
    </VendorLayout>
  );
};

export default VendorOrders;
