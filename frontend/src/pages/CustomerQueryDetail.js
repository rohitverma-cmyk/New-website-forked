/**
 * Customer Quote-Comparison page (/account/queries/:rfqId).
 * Mirrors the staging mobile screens, ported to desktop:
 *
 *   - Header: fabric name + RFQ #
 *   - Side-by-side Fabric details + Order details cards
 *   - "Showing rates for" pill (default "Cash" — credit-line rates land
 *     in Phase C)
 *   - Quotes received list. Cheapest gets a "Best Price" badge.
 *     Each card has a "Proceed payment ›" CTA that creates an order
 *     against that specific quote and opens Razorpay.
 *
 * Order id stamped with `source: "rfq"` so vendor + admin views can
 * distinguish Inventory vs RFQ orders. Loser quotes auto-marked `lost`,
 * winner stamped `won`. RFQ moves to `won` status (Closed bucket).
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Star, Truck, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { getCustomerQueryDetail, placeOrderFromQuote, verifyPayment, sendOrderConfirmation } from "../lib/api";

const SpecRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-b-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 truncate">{value || "—"}</span>
  </div>
);

const Chip = ({ children, accent = "gray" }) => {
  const cls = {
    gray: "bg-gray-50 text-gray-700 border-gray-200",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }[accent];
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
};

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const QuoteCard = ({ quote, rfq, onPay, busy }) => {
  const isBest = !!quote.is_best_price;
  const isWon = quote.status === "won" || rfq?.winning_quote_id === quote.id;
  const isLost = quote.status === "lost";
  return (
    <div
      className={`bg-white rounded-xl border p-5 transition ${
        isWon
          ? "border-emerald-300 shadow-sm"
          : isBest
            ? "border-amber-300 shadow-sm"
            : "border-gray-200"
      } ${isLost ? "opacity-60" : ""}`}
      data-testid={`customer-quote-card-${quote.id.slice(0, 8)}`}
    >
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {isWon ? (
            <span className="inline-flex items-center gap-1 bg-emerald-600 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm">
              ✓ Order placed
            </span>
          ) : isLost ? (
            <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-600 rounded-full px-3.5 py-1.5 text-xs font-semibold">
              Not selected
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPay(quote)}
              className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm disabled:opacity-60"
              data-testid={`customer-quote-pay-${quote.id.slice(0, 8)}`}
            >
              Proceed payment ›
            </button>
          )}
          {isBest && !isWon && !isLost ? (
            <span className="inline-flex items-center gap-1 bg-orange-500 text-white rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide">
              <Star size={11} fill="currentColor" /> Best Price
            </span>
          ) : null}
        </div>
        <Chip accent="blue">{(rfq.category || "").toUpperCase() || "Fabric"}</Chip>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900">₹ {quote.price_per_meter}</span>
          <span className="text-gray-500">/ m</span>
          <Chip>{quote.basis === "x-factory" ? "x-factory" : "Door-delivered"}</Chip>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {quote.lead_days} days to dispatch
          </span>
        </div>
      </div>

      {(quote.specs?.warp_count || quote.specs?.gsm) && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-600">
          {quote.specs.warp_count && quote.specs.weft_count && (
            <Chip>{quote.specs.warp_count} × {quote.specs.weft_count}</Chip>
          )}
          {quote.specs.reed && quote.specs.pick && (
            <Chip>{quote.specs.reed} × {quote.specs.pick}</Chip>
          )}
          {quote.specs.width_inch && <Chip>{quote.specs.width_inch} inch</Chip>}
          {quote.specs.loom && <Chip>{quote.specs.loom}</Chip>}
          {quote.specs.gsm && <Chip accent="amber">{quote.specs.gsm} GSM</Chip>}
        </div>
      )}

      {quote.sample_available && (
        <Chip accent="amber">Sample available</Chip>
      )}

      {quote.notes && (
        <p className="text-xs text-gray-600 mt-3 whitespace-pre-line">{quote.notes}</p>
      )}
    </div>
  );
};

const CustomerQueryDetail = () => {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const { token, customer, isLoggedIn } = useCustomerAuth();
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/");
      return;
    }
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId, isLoggedIn]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await getCustomerQueryDetail(token, rfqId);
      setRfq(res.data);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load query");
    } finally {
      setLoading(false);
    }
  };

  const handleProceedPayment = async (quote) => {
    if (busy) return;
    setBusy(true);
    try {
      // Quantity defaults to whatever the RFQ asked for; if RFQ stored a
      // bucket like "5000_20000" we take the upper bound for billing.
      const rawQty =
        rfq.quantity_meters || rfq.quantity_kg || "1000";
      let qty = 1000;
      if (typeof rawQty === "string" && rawQty.includes("_")) {
        const parts = rawQty.split("_");
        qty = parseInt(parts[parts.length - 1], 10) || qty;
        if (parts[parts.length - 1] === "plus") qty = parseInt(parts[0], 10) || qty;
      } else {
        qty = parseInt(rawQty, 10) || qty;
      }

      const ok = await loadRazorpayScript();
      if (!ok) {
        toast.error("Failed to load payment gateway");
        setBusy(false);
        return;
      }

      const res = await placeOrderFromQuote(token, quote.id, {
        quantity: qty,
        payment_method: "razorpay",
      });
      const info = res.data || {};

      const options = {
        key: info.razorpay_key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: info.amount_paise,
        currency: info.currency,
        name: "Locofast",
        description: `RFQ ${rfq.rfq_number} · ${qty} m @ ₹${quote.price_per_meter}/m`,
        order_id: info.razorpay_order_id,
        handler: async (response) => {
          try {
            const v = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (v.data.success) {
              try { await sendOrderConfirmation(info.order_id); } catch (_) {}
              toast.success("Payment successful");
              navigate(`/order-confirmation/${info.order_number}`);
            }
          } catch (err) {
            toast.error("Payment verification failed");
          }
        },
        prefill: {
          name: customer?.name || "",
          email: customer?.email || "",
          contact: customer?.phone || "",
        },
        theme: { color: "#2563EB" },
        modal: { ondismiss: () => { setBusy(false); toast.info("Payment cancelled"); } },
      };
      const rp = new window.Razorpay(options);
      rp.open();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start payment");
      setBusy(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 min-h-screen bg-gray-50" data-testid="customer-query-detail-page">
        <div className="max-w-4xl mx-auto px-6">
          <button
            onClick={() => navigate("/account")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft size={14} /> Back to My Account
          </button>

          {loading ? (
            <div className="text-center py-16 text-gray-500">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" />
              Loading query…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
              {error}
            </div>
          ) : rfq ? (
            <>
              <div className="bg-blue-600 text-white rounded-xl px-6 py-5 mb-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/15 grid place-items-center">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">
                    {(rfq.category || "Fabric").charAt(0).toUpperCase() + (rfq.category || "Fabric").slice(1)}
                    {rfq.fabric_requirement_type ? ` — ${rfq.fabric_requirement_type}` : ""}
                  </h1>
                  <p className="text-sm text-white/80">{rfq.rfq_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="customer-rfq-fabric-card">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Fabric details</h3>
                  <SpecRow label="Category" value={(rfq.category || "").toUpperCase()} />
                  <SpecRow label="Type" value={rfq.fabric_requirement_type || "Greige"} />
                  {rfq.knit_quality ? <SpecRow label="Knit quality" value={rfq.knit_quality} /> : null}
                  {rfq.denim_specification ? <SpecRow label="Denim spec" value={rfq.denim_specification} /> : null}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="customer-rfq-order-card">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Order details</h3>
                  <SpecRow label="Quantity" value={rfq.quantity_label} />
                  <SpecRow label="Submitted" value={new Date(rfq.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
                  {rfq.gst_number ? <SpecRow label="GST" value={rfq.gst_number} /> : null}
                </div>
              </div>

              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Showing rates for</p>
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2">
                  <Truck size={14} className="text-gray-400" /> Cash
                </div>
              </div>

              <h2 className="text-lg font-semibold mb-1">
                Quotes <span className="text-xs text-gray-500 font-normal">Taxes extra</span>
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Received <span className="ml-1 bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{(rfq.quotes || []).length}</span>
              </p>

              {(!rfq.quotes || rfq.quotes.length === 0) ? (
                <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500">
                  <p className="text-sm">No quotes received yet.</p>
                  <p className="text-xs text-gray-400 mt-1">We are getting quotes from more suppliers — usually within 24 h.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rfq.quotes.map((q) => (
                    <QuoteCard key={q.id} quote={q} rfq={rfq} onPay={handleProceedPayment} busy={busy} />
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 italic text-center mt-6">
                We are getting quotes from more suppliers
              </p>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default CustomerQueryDetail;
