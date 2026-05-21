/**
 * MRfqDetail — Mobile buyer-side RFQ thread + quotes view.
 *
 * Mirrors the desktop CustomerQueryDetail at /account/queries/:rfqId.
 * Reads from `GET /api/customer/queries/:rfqId` (same endpoint, same
 * payload). Each quote card lets the buyer accept and pay via Razorpay
 * using `placeOrderFromQuote` — identical flow to desktop.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, MessageSquare, IndianRupee, Truck, Star } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { getCustomerQueryDetail, placeOrderFromQuote, verifyPayment, sendOrderConfirmation } from "../../lib/api";
import { useRequireMobileAuth } from "../utils/authGuard";

// Razorpay loader — same as desktop's loadRazorpayScript
const loadRazorpayScript = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

export default function MRfqDetail() {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const { token, customer } = useCustomerAuth();
  useRequireMobileAuth();

  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !rfqId) return;
    let alive = true;
    setLoading(true);
    getCustomerQueryDetail(token, rfqId)
      .then((r) => { if (alive) { setRfq(r.data); setError(""); } })
      .catch((e) => { if (alive) setError(e?.response?.data?.detail || "Could not load query"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rfqId, token]);

  const handlePay = async (quote) => {
    if (busy) return;
    setBusy(true);
    try {
      // Same quantity-resolution rules as desktop CustomerQueryDetail
      const rawQty = rfq.quantity_meters || rfq.quantity_kg || "1000";
      let qty = 1000;
      if (typeof rawQty === "string" && rawQty.includes("_")) {
        const parts = rawQty.split("_");
        qty = parseInt(parts[parts.length - 1], 10) || qty;
        if (parts[parts.length - 1] === "plus") qty = parseInt(parts[0], 10) || qty;
      } else {
        qty = parseInt(rawQty, 10) || qty;
      }

      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay"); setBusy(false); return; }

      const res = await placeOrderFromQuote(token, quote.id, { quantity: qty, payment_method: "razorpay" });
      const info = res.data || {};
      const rp = new window.Razorpay({
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
              navigate(`/m/order-confirmation/${info.order_number}`);
            }
          } catch (err) {
            toast.error("Payment verification failed");
          }
        },
        prefill: { name: customer?.name || "", email: customer?.email || "", contact: customer?.phone || "" },
        theme: { color: "#2563EB" },
        modal: { ondismiss: () => { setBusy(false); toast.info("Payment cancelled"); } },
      });
      rp.open();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start payment");
      setBusy(false);
    }
  };

  return (
    <div className="m-app">
      <div style={{ padding: "8px 16px 0" }}>
        <button onClick={() => navigate("/m/account")} className="m-icon-btn" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="m-container" style={{ paddingTop: 10, paddingBottom: 32 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--m-ink-3)" }}>
            <Loader2 size={20} className="m-spinner" /> Loading…
          </div>
        ) : error ? (
          <div className="m-card" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", padding: 14, fontSize: 14 }}>{error}</div>
        ) : rfq ? (
          <>
            {/* Header */}
            <div style={{ background: "var(--m-blue)", color: "#fff", borderRadius: 14, padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,0.15)", display: "grid", placeItems: "center" }}>
                <MessageSquare size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                  {(rfq.category || "Fabric").charAt(0).toUpperCase() + (rfq.category || "Fabric").slice(1)}
                  {rfq.fabric_requirement_type ? ` — ${rfq.fabric_requirement_type}` : ""}
                </h1>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>{rfq.rfq_number}</p>
              </div>
            </div>

            {/* Spec cards */}
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              <SpecGroup title="Fabric details" items={[
                ["Category", (rfq.category || "").toUpperCase()],
                ["Type", rfq.fabric_requirement_type || "Greige"],
                rfq.knit_quality ? ["Knit quality", rfq.knit_quality] : null,
                rfq.denim_specification ? ["Denim spec", rfq.denim_specification] : null,
              ].filter(Boolean)} />
              <SpecGroup title="Order details" items={[
                ["Quantity", rfq.quantity_label],
                ["Submitted", new Date(rfq.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })],
                rfq.gst_number ? ["GST", rfq.gst_number] : null,
              ].filter(Boolean)} />
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--m-ink)", margin: "8px 0 4px" }}>
              Quotes <span style={{ fontSize: 12, color: "var(--m-ink-3)", fontWeight: 500 }}>· Taxes extra</span>
            </h2>
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", marginBottom: 12 }}>
              Received <span style={{ background: "var(--m-bg)", padding: "2px 8px", borderRadius: 999, marginLeft: 4 }}>{(rfq.quotes || []).length}</span>
            </p>

            {(!rfq.quotes || rfq.quotes.length === 0) ? (
              <div className="m-card" style={{ padding: 24, textAlign: "center", border: "1px dashed var(--m-border-2)" }}>
                <p style={{ fontSize: 14, color: "var(--m-ink-2)", margin: 0 }}>No quotes received yet.</p>
                <p style={{ fontSize: 12, color: "var(--m-ink-3)", margin: "4px 0 0" }}>We're gathering quotes from suppliers — usually within 24 h.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {rfq.quotes.map((q) => <QuoteCard key={q.id} q={q} rfq={rfq} onPay={() => handlePay(q)} busy={busy} />)}
              </div>
            )}

            <p style={{ fontSize: 11, color: "var(--m-ink-3)", fontStyle: "italic", textAlign: "center", marginTop: 18 }}>
              We're getting quotes from more suppliers
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

const SpecGroup = ({ title, items }) => (
  <div className="m-card" style={{ padding: 14 }}>
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)", margin: "0 0 8px" }}>{title}</h3>
    {items.map(([label, val]) => (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
        <span style={{ color: "var(--m-ink-3)" }}>{label}</span>
        <span style={{ color: "var(--m-ink)", fontWeight: 500 }}>{val}</span>
      </div>
    ))}
  </div>
);

const QuoteCard = ({ q, rfq, onPay, busy }) => (
  <div className="m-card" style={{ padding: 14 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Star size={14} color="var(--m-amber)" fill="var(--m-amber)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)" }}>{q.seller_company || q.seller_name || "Supplier"}</span>
      </div>
      <span style={{ fontSize: 11, color: "var(--m-ink-3)" }}>{q.lead_time_days ? `${q.lead_time_days}d lead` : ""}</span>
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
      <IndianRupee size={16} color="var(--m-ink)" />
      <span style={{ fontSize: 22, fontWeight: 800, color: "var(--m-ink)" }}>{q.price_per_meter}</span>
      <span style={{ fontSize: 12, color: "var(--m-ink-3)" }}>/m</span>
    </div>
    {q.notes && <p style={{ fontSize: 12, color: "var(--m-ink-2)", margin: "0 0 10px" }}>{q.notes}</p>}
    <button onClick={onPay} disabled={busy} className="m-btn m-btn-primary" style={{ width: "100%" }}>
      {busy ? <><span className="m-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Processing…</> : <><Truck size={14} /> Accept & Pay</>}
    </button>
  </div>
);
