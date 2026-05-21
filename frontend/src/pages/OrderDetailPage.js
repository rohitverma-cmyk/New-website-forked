/**
 * Customer Order Detail page — `/account/orders/:orderId`
 *
 * Surfaces:
 *  - Production-timeline strip (Payment → Paid → Processing → Shipped → Delivered, cancelled fork)
 *  - Pay-now CTA for `payment_pending` orders (resumes the original Razorpay order)
 *  - Download Invoice (only for paid orders)
 *  - Shiprocket public tracking link when an AWB has been allocated
 *  - Item list + totals breakdown + customer / shipping snapshot
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Package, CheckCircle, Truck, XCircle, Clock,
  CreditCard, Download, ExternalLink, MapPin, Phone, Mail, FileText, Box, History
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import TrackingHistoryDrawer from "../components/TrackingHistoryDrawer";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { getCustomerOrder, getOrderPayContext, verifyPayment } from "../lib/api";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Five canonical states surfaced to the buyer. Internal statuses
// (confirmed, processing, shipped) collapse onto these stages as the order
// moves forward. Cancelled is a terminal off-track state.
const TIMELINE = [
  { key: "payment_pending", label: "Payment", icon: CreditCard },
  { key: "paid", label: "Paid", icon: CheckCircle },
  { key: "processing", label: "Processing", icon: Box },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
];

const stageIndexFor = (order) => {
  if (!order) return 0;
  const status = order.status || "";
  if (status === "delivered") return 4;
  if (status === "shipped") return 3;
  if (["processing", "confirmed"].includes(status)) return 2;
  if (status === "paid" || order.payment_status === "paid") return 1;
  return 0;
};

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatRupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const TimelineStrip = ({ order }) => {
  const cancelled = order?.status === "cancelled";
  const idx = cancelled ? -1 : stageIndexFor(order);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6" data-testid="order-timeline">
      {cancelled ? (
        <div className="flex items-center gap-3 text-red-700">
          <XCircle size={20} />
          <div>
            <p className="font-medium">Order cancelled</p>
            <p className="text-xs text-red-600">{order.cancellation_reason || "No reason provided"}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            {TIMELINE.map((stage, i) => {
              const Icon = stage.icon;
              const reached = i <= idx;
              const current = i === idx;
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center text-center" data-testid={`timeline-stage-${stage.key}`}>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition ${
                      reached
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : current
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "bg-gray-50 border-gray-200 text-gray-300"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <p className={`text-[11px] mt-2 font-medium ${reached ? "text-gray-900" : "text-gray-400"}`}>
                    {stage.label}
                  </p>
                </div>
              );
            })}
          </div>
          {/* Connector line — placed under the dots via negative margin trick */}
          <div className="relative -mt-[58px] mb-6 mx-[6%]">
            <div className="h-[2px] bg-gray-200 w-full" />
            <div
              className="h-[2px] bg-emerald-500 absolute top-0 left-0 transition-all"
              style={{ width: `${(Math.max(0, idx) / (TIMELINE.length - 1)) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-10 text-center">
            {order.payment_status === "paid"
              ? `Paid on ${formatDate(order.paid_at)} · Order placed ${formatDate(order.created_at)}`
              : `Order created ${formatDate(order.created_at)} — payment pending`}
          </p>
        </>
      )}
    </div>
  );
};

const OrderDetailPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { token, isLoggedIn, customer } = useCustomerAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [trackingDrawerOpen, setTrackingDrawerOpen] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCustomerOrder(token, orderId);
      setOrder(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Order not found");
      setOrder(null);
    }
    setLoading(false);
  }, [token, orderId]);

  useEffect(() => {
    if (!isLoggedIn) { navigate("/"); return; }
    fetchOrder();
  }, [isLoggedIn, fetchOrder, navigate]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const handlePayNow = async () => {
    setPaying(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Failed to load payment gateway");

      const ctx = (await getOrderPayContext(token, orderId)).data;
      const opts = {
        key: ctx.razorpay_key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: ctx.amount_paise,
        currency: ctx.currency,
        name: "Locofast",
        description: `Order ${ctx.order_number}`,
        order_id: ctx.razorpay_order_id,
        handler: async (rpResp) => {
          try {
            const v = await verifyPayment({
              razorpay_order_id: rpResp.razorpay_order_id,
              razorpay_payment_id: rpResp.razorpay_payment_id,
              razorpay_signature: rpResp.razorpay_signature,
            });
            if (v.data.success) {
              toast.success("Payment successful!");
              fetchOrder();
            }
          } catch {
            toast.error("Payment verification failed");
          }
        },
        prefill: { name: ctx.customer?.name, email: ctx.customer?.email, contact: ctx.customer?.phone },
        theme: { color: "#2563EB" },
        modal: { ondismiss: () => { setPaying(false); toast.info("Payment cancelled"); } },
      };
      const rp = new window.Razorpay(opts);
      rp.on("payment.failed", () => toast.error("Payment failed"));
      rp.open();
    } catch (e) {
      toast.error(e.message || "Could not resume payment");
    } finally {
      setPaying(false);
    }
  };

  const handleDownloadInvoice = async () => {
    try {
      // Hit the public invoice endpoint — paid-only check is enforced server-side.
      const url = `${API_URL}/api/orders/${order.id}/invoice`;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      toast.error("Could not download invoice");
    }
  };

  if (!isLoggedIn) return null;

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="pt-24 pb-16 min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-gray-400" />
        </main>
        <Footer />
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Navbar />
        <main className="pt-24 pb-16 min-h-screen bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <Package size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-900">Order not found</p>
            <button onClick={() => navigate("/account")} className="mt-4 text-[#2563EB] hover:underline text-sm">
              Back to My Orders
            </button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const isPaid = order.payment_status === "paid";
  const isPending = order.payment_status !== "paid" && order.status !== "cancelled";
  const awb = order.awb_code;
  const trackingUrl = awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null;

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 min-h-screen bg-gray-50" data-testid="order-detail-page">
        <div className="max-w-4xl mx-auto px-6">
          <button
            onClick={() => navigate("/account")}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
            data-testid="order-detail-back"
          >
            <ArrowLeft size={14} /> Back to My Orders
          </button>

          {/* Header card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Order</p>
                <h1 className="text-xl font-semibold text-gray-900" data-testid="order-detail-number">{order.order_number}</h1>
                <p className="text-xs text-gray-500 mt-1">Placed on {formatDate(order.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isPending && (
                  <button
                    onClick={handlePayNow}
                    disabled={paying}
                    className="inline-flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                    data-testid="order-detail-pay-now"
                  >
                    {paying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    Pay now · {formatRupees(order.total)}
                  </button>
                )}
                {isPaid && (
                  <button
                    onClick={handleDownloadInvoice}
                    className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    data-testid="order-detail-download-invoice"
                  >
                    <Download size={14} /> Download invoice
                  </button>
                )}
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-50"
                    data-testid="order-detail-track-link"
                  >
                    <Truck size={14} /> Track shipment
                    <ExternalLink size={12} />
                  </a>
                )}
                {/* Tracking-history drawer button — visible whenever the
                    order has progressed past payment, even before an AWB
                    is allocated (early scans like 'Pickup Scheduled' may
                    arrive before AWB assignment). */}
                {(order.awb_code || order.shiprocket_last_event || ["processing", "shipped", "delivered"].includes(order.status)) && (
                  <button
                    type="button"
                    onClick={() => setTrackingDrawerOpen(true)}
                    className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    data-testid="order-detail-tracking-history-btn"
                  >
                    <History size={14} /> Tracking history
                  </button>
                )}
              </div>
            </div>

            {awb && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-800 inline-flex items-center gap-2" data-testid="order-detail-awb">
                <Truck size={12} /> AWB: <span className="font-mono font-medium">{awb}</span>
                {order.courier_name && <span className="text-emerald-700">· {order.courier_name}</span>}
              </div>
            )}

            {isPending && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
                <Clock size={12} /> Payment pending — your order will be confirmed once payment is received.
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="mb-4">
            <TimelineStrip order={order} />
          </div>

          {/* Items */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Items</h2>
            <div className="divide-y divide-gray-100">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex gap-4 py-3" data-testid={`order-item-${i}`}>
                  {item.image_url && <img src={item.image_url} alt={item.fabric_name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.fabric_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.category_name || "Fabric"} · {item.quantity}{item.unit || "m"} × {formatRupees(item.price_per_meter)}/{item.unit || "m"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${item.order_type === "sample" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {item.order_type === "sample" ? "Sample" : "Bulk"}
                      </span>
                      {item.color_name && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                          <span className="w-2.5 h-2.5 rounded-full border" style={{ background: item.color_hex || "#ddd" }} />
                          {item.color_name}
                        </span>
                      )}
                      {item.dispatch_timeline && (
                        <span className="text-[10px] text-gray-500">· {item.dispatch_timeline}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatRupees(item.quantity * item.price_per_meter)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals + customer */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Payment summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd className="text-gray-900">{formatRupees(order.subtotal)}</dd></div>
                {order.discount > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Discount{order.coupon?.code ? ` (${order.coupon.code})` : ""}</dt><dd className="text-emerald-700">− {formatRupees(order.discount)}</dd></div>
                )}
                {order.packaging_charge > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Packaging</dt><dd className="text-gray-900">{formatRupees(order.packaging_charge)}</dd></div>
                )}
                {order.logistics_only_charge > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Logistics</dt><dd className="text-gray-900">{formatRupees(order.logistics_only_charge)}</dd></div>
                )}
                {!order.packaging_charge && order.logistics_charge > 0 && (
                  <div className="flex justify-between"><dt className="text-gray-600">Logistics</dt><dd className="text-gray-900">{formatRupees(order.logistics_charge)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-gray-600">GST</dt><dd className="text-gray-900">{formatRupees(order.tax)}</dd></div>
                <div className="flex justify-between border-t border-gray-100 pt-2 mt-2 font-semibold"><dt className="text-gray-900">Total</dt><dd className="text-emerald-700">{formatRupees(order.total)}</dd></div>
                <div className="flex justify-between text-xs text-gray-500"><dt>Payment method</dt><dd>{order.payment_method === "credit" ? "Locofast Credit" : "Razorpay"}</dd></div>
                {order.invoice_number && (
                  <div className="flex justify-between text-xs text-gray-500"><dt>Invoice no.</dt><dd className="font-mono">{order.invoice_number}</dd></div>
                )}
              </dl>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Shipping</h2>
              <div className="text-sm space-y-2">
                <p className="font-medium text-gray-900">{order.customer?.name || customer?.name || "—"}</p>
                <p className="text-gray-600 text-xs flex items-center gap-2"><Mail size={12} /> {order.customer?.email}</p>
                {order.customer?.phone && (
                  <p className="text-gray-600 text-xs flex items-center gap-2"><Phone size={12} /> {order.customer.phone}</p>
                )}
                {order.customer?.gst_number && (
                  <p className="text-gray-600 text-xs flex items-center gap-2"><FileText size={12} /> GST: <span className="font-mono">{order.customer.gst_number}</span></p>
                )}
                {(order.customer?.address || order.customer?.city) && (
                  <p className="text-gray-600 text-xs flex items-start gap-2">
                    <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                    <span>
                      {[order.customer?.address, order.customer?.city, order.customer?.state, order.customer?.pincode].filter(Boolean).join(", ")}
                    </span>
                  </p>
                )}
                {order.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                    <p className="font-medium text-gray-700 mb-1">Order notes</p>
                    <p>{order.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <TrackingHistoryDrawer
        open={trackingDrawerOpen}
        onClose={() => setTrackingDrawerOpen(false)}
        orderId={order.id}
      />
      <Footer />
    </>
  );
};

export default OrderDetailPage;
