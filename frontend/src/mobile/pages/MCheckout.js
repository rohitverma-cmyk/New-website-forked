import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, MapPin, Shield, CreditCard, Lock, Package, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { getFabric, createOrder, verifyPayment, sendOrderConfirmation, getCustomerProfile } from "../../lib/api";
import { formatPriceINR, getBulkPrice, getSamplePrice, getPrimaryImage } from "../lib/format";

const LOGISTICS_RATE_BULK = 5;       // ₹/m
const LOGISTICS_RATE_SAMPLE = 100;   // ₹ flat
const PACKAGING_FLAT = 0;            // included
const GST_RATE = 0.05;               // 5% on textiles

export default function MCheckout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customer, token, updateCustomer, loading: authLoading } = useCustomerAuth();
  // Mobile checkout supports GUEST orders (matches desktop). Logged-in
  // users get their profile auto-filled; guests fill the form manually.
  // No hard login gate here.

  const fabricId = searchParams.get("fabric");
  const variantId = searchParams.get("variant");
  const qty = Math.max(1, parseInt(searchParams.get("qty") || "1", 10));
  const orderType = searchParams.get("type") === "sample" ? "sample" : "bulk";

  const [fabric, setFabric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Address form (prefilled from profile)
  const [addr, setAddr] = useState({
    name: "", phone: "", email: "",
    address: "", city: "", state: "", pincode: "",
    gst_number: "",
  });
  const [addrErrors, setAddrErrors] = useState({});

  // Load fabric + (optional) profile prefill
  useEffect(() => {
    if (authLoading || !fabricId) return;
    let alive = true;
    (async () => {
      try {
        // Profile fetch is best-effort — guests have no token and we just
        // skip the prefill. Order creation works for both authed + guest.
        const fRes = await getFabric(fabricId);
        const pRes = token ? await getCustomerProfile(token).catch(() => null) : null;
        if (!alive) return;
        setFabric(fRes.data);
        const c = pRes?.data || customer || {};
        if (token && c && updateCustomer) updateCustomer(c);
        setAddr({
          name: c.name || "",
          phone: c.phone || "",
          email: c.email || "",
          address: c.address || "",
          city: c.city || "",
          state: c.state || "",
          pincode: c.pincode || "",
          gst_number: c.gstin || "",
        });
      } catch (err) {
        setError(err?.response?.data?.detail || "Couldn't load checkout");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, token, fabricId]); // eslint-disable-line

  // Pricing
  const rate = orderType === "sample" ? getSamplePrice(fabric) : getBulkPrice(fabric);
  const subtotal = rate ? rate * qty : 0;
  const logistics = orderType === "sample" ? LOGISTICS_RATE_SAMPLE : LOGISTICS_RATE_BULK * qty;
  const packaging = PACKAGING_FLAT;
  const tax = Math.round(subtotal * GST_RATE * 100) / 100;
  const total = Math.round((subtotal + logistics + packaging + tax) * 100) / 100;

  // Variant resolution (for color)
  const variants = Array.isArray(fabric?.color_variants) ? fabric.color_variants : [];
  const variant = variantId
    ? variants.find((v, i) => v.id === variantId || String(i) === variantId) || null
    : null;
  const color = variant?.name || variant?.color || fabric?.color || "";
  const colorHex = variant?.hex || fabric?.color_hex || "";
  const fabricImage = (variant && Array.isArray(variant.images) && variant.images[0]) || getPrimaryImage(fabric);

  const validate = () => {
    const errs = {};
    if (!addr.name.trim()) errs.name = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email.trim())) errs.email = "Valid email required";
    if (addr.phone.replace(/\D/g, "").length < 10) errs.phone = "10-digit phone";
    if (!addr.address.trim()) errs.address = "Required";
    if (!addr.city.trim()) errs.city = "Required";
    if (!addr.state.trim()) errs.state = "Required";
    if (!/^\d{6}$/.test(addr.pincode.trim())) errs.pincode = "6-digit pincode";
    setAddrErrors(errs);
    return Object.keys(errs).length === 0;
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

  const placeOrder = async () => {
    if (!validate()) {
      toast.error("Please complete shipping address");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!fabric || !rate) {
      toast.error("Pricing unavailable. Please request a quote instead.");
      return;
    }
    setSubmitting(true);
    try {
      const orderData = {
        items: [{
          fabric_id: fabric.id,
          fabric_slug: fabric.slug,
          fabric_name: fabric.name,
          fabric_image: fabricImage || "",
          quantity: qty,
          rate_per_meter: rate,
          order_type: orderType,
          color: color || "",
          color_hex: colorHex || "",
          dispatch_timeline: orderType === "sample" ? "48-72 hours" : (fabric.dispatch_timeline || "15-20 days"),
        }],
        customer: {
          name: addr.name.trim(),
          email: addr.email.trim().toLowerCase(),
          phone: addr.phone.trim(),
          address: addr.address.trim(),
          city: addr.city.trim(),
          state: addr.state.trim(),
          pincode: addr.pincode.trim(),
          gst_number: addr.gst_number.trim().toUpperCase(),
        },
        notes: "",
        logistics_charge: logistics,
        packaging_charge: packaging,
        logistics_only_charge: logistics,
        payment_method: "razorpay",
        coupon: null,
        discount: 0,
      };

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Failed to load payment gateway");

      const response = await createOrder(orderData);
      const orderInfo = response.data;

      const options = {
        key: orderInfo.razorpay_key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: orderInfo.amount_paise,
        currency: orderInfo.currency,
        name: "Locofast",
        description: `${orderType === "sample" ? "Sample" : "Bulk"} - ${fabric.name}`,
        order_id: orderInfo.razorpay_order_id,
        handler: async (resp) => {
          try {
            const verifyResp = await verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            if (verifyResp.data.success) {
              try { await sendOrderConfirmation(orderInfo.order_id); } catch {}
              toast.success("Payment successful!");
              navigate(`/m/orders/${orderInfo.order_number}?fresh=1`, { replace: true });
            } else {
              toast.error("Payment verification failed");
              setSubmitting(false);
            }
          } catch (err) {
            toast.error("Payment verification failed. Please contact support@locofast.com");
            setSubmitting(false);
          }
        },
        prefill: { name: addr.name, email: addr.email, contact: addr.phone },
        notes: { order_id: orderInfo.order_id, fabric_name: fabric.name },
        theme: { color: "#FF7A3D" },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            toast.info("Payment cancelled \u00b7 your order is in 'Payment pending'");
            navigate(`/m/orders/${orderInfo.order_number}`, { replace: true });
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        const err = resp.error || {};
        toast.error(err.description || "Payment failed");
        setSubmitting(false);
      });
      rzp.open();
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Couldn't place order";
      toast.error(msg);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="m-container" style={{ paddingTop: 16 }}>
        <div className="m-skeleton" style={{ height: 120, borderRadius: 16 }} />
        <div className="m-skeleton" style={{ height: 320, borderRadius: 16, marginTop: 12 }} />
      </div>
    );
  }

  if (error || !fabric) {
    return (
      <div className="m-container" style={{ paddingTop: 40, textAlign: "center" }}>
        <AlertCircle size={32} color="var(--m-red)" />
        <div className="m-title" style={{ marginTop: 10 }}>{error || "Fabric not found"}</div>
        <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-primary" style={{ marginTop: 16 }}>Back to catalog</button>
      </div>
    );
  }

  if (!rate) {
    return (
      <div className="m-container" style={{ paddingTop: 40, textAlign: "center" }}>
        <Package size={32} color="var(--m-orange)" />
        <div className="m-title" style={{ marginTop: 10 }}>Pricing on request</div>
        <p className="m-body" style={{ marginTop: 6 }}>This fabric needs a custom quote. Our team will get back within 4 working hours.</p>
        <button onClick={() => navigate(`/m/rfq?fabric=${fabric.id}`)} className="m-btn m-btn-primary" style={{ marginTop: 16 }}>Request a quote</button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 110, background: "var(--m-bg)", minHeight: "100vh" }}>
      {/* App bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--m-surface)", borderBottom: "1px solid var(--m-border)", padding: "12px 16px", paddingTop: "calc(12px + env(safe-area-inset-top, 0px))", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--m-bg)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--m-ink)" }}>Checkout</div>
          <div style={{ fontSize: 12, color: "var(--m-ink-3)" }}>Step 2 of 2</div>
        </div>
        <div style={{ flex: 1 }} />
        <Lock size={16} color="var(--m-ink-3)" />
      </div>

      {/* Order summary card */}
      <div className="m-container" style={{ paddingTop: 14 }}>
        <div className="m-card" style={{ padding: 12, display: "flex", gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: fabricImage ? `url(${fabricImage}) center/cover` : "linear-gradient(135deg, var(--m-orange-50), #FFE3CE)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--m-orange)" }}>
            {!fabricImage && <Package size={26} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="m-chip m-chip-orange" style={{ padding: "3px 8px", fontSize: 11 }}>{orderType === "sample" ? "Sample" : "Bulk"}</span>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--m-ink)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {fabric.name}
            </div>
            <div className="m-caption" style={{ marginTop: 2 }}>
              {qty}m {color && `\u00b7 ${color}`} {colorHex && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: colorHex, verticalAlign: "middle", marginLeft: 4 }} />}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="m-caption">{formatPriceINR(rate)}/m</div>
            <div style={{ fontWeight: 700, color: "var(--m-ink)" }}>{formatPriceINR(subtotal)}</div>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      <div className="m-container" style={{ marginTop: 18 }}>
        <h2 className="m-title" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={16} color="var(--m-orange)" /> Shipping address
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Input label="Full name *" value={addr.name} onChange={(v) => setAddr({ ...addr, name: v })} error={addrErrors.name} autoComplete="name" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Email *" value={addr.email} onChange={(v) => setAddr({ ...addr, email: v })} error={addrErrors.email} type="email" inputMode="email" autoComplete="email" />
            <Input label="Phone *" value={addr.phone} onChange={(v) => setAddr({ ...addr, phone: v })} error={addrErrors.phone} type="tel" inputMode="tel" autoComplete="tel" />
          </div>
          <Input label="Address *" value={addr.address} onChange={(v) => setAddr({ ...addr, address: v })} error={addrErrors.address} autoComplete="street-address" placeholder="Building, street, area" />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <Input label="City *" value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} error={addrErrors.city} autoComplete="address-level2" />
            <Input label="Pincode *" value={addr.pincode} onChange={(v) => setAddr({ ...addr, pincode: v.replace(/\D/g, "").slice(0, 6) })} error={addrErrors.pincode} inputMode="numeric" autoComplete="postal-code" />
          </div>
          <Input label="State *" value={addr.state} onChange={(v) => setAddr({ ...addr, state: v })} error={addrErrors.state} autoComplete="address-level1" />
          <Input label="GSTIN (optional)" value={addr.gst_number} onChange={(v) => setAddr({ ...addr, gst_number: v.toUpperCase() })} placeholder="15-character GSTIN" />
        </div>
      </div>

      {/* Payment method */}
      <div className="m-container" style={{ marginTop: 22 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Payment</h2>
        <div className="m-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, border: "2px solid var(--m-orange)" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--m-orange-50)", color: "var(--m-orange)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CreditCard size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "var(--m-ink)" }}>Razorpay</div>
            <div className="m-caption">Cards, UPI, Netbanking, Wallets</div>
          </div>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--m-orange)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
      </div>

      {/* Bill summary */}
      <div className="m-container" style={{ marginTop: 22 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Bill summary</h2>
        <div className="m-card" style={{ padding: 14 }}>
          <Row label={`Subtotal (${qty}m)`} value={formatPriceINR(subtotal)} />
          <Row label="Logistics" value={formatPriceINR(logistics)} />
          {packaging > 0 && <Row label="Packaging" value={formatPriceINR(packaging)} />}
          <Row label="GST (5%)" value={formatPriceINR(tax)} />
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px dashed var(--m-border-2)", marginTop: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--m-ink)" }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: "var(--m-orange-700)" }}>{formatPriceINR(total)}</span>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="m-container" style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="m-chip m-chip-blue"><Shield size={12} /> GST invoice</span>
        <span className="m-chip m-chip-blue"><Lock size={12} /> Secure checkout</span>
        <span className="m-chip"><Package size={12} /> Dispatch SLA</span>
      </div>

      {/* Sticky pay button */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: "env(safe-area-inset-bottom, 0px)",
        background: "var(--m-surface)", borderTop: "1px solid var(--m-border)",
        padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", zIndex: 50,
        boxShadow: "0 -4px 20px rgba(15,27,45,0.06)",
      }}>
        <div style={{ flex: 1 }}>
          <div className="m-caption">Total</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-orange-700)", lineHeight: 1.1 }}>{formatPriceINR(total)}</div>
        </div>
        <button onClick={placeOrder} disabled={submitting} className="m-btn m-btn-primary" style={{ flex: 1.5 }}>
          {submitting ? <><span className="m-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Processing…</> : <>Pay {formatPriceINR(total)} <ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "var(--m-ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--m-ink)" }}>{value}</span>
    </div>
  );
}

function Input({ label, value, onChange, error, ...rest }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--m-ink-3)", marginBottom: 4 }}>{label}</label>
      <div className="m-card" style={{ padding: "2px 12px", border: error ? "1px solid var(--m-red)" : "1px solid var(--m-border-2)" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", padding: "12px 0", fontSize: 15, background: "transparent", color: "var(--m-ink)" }}
          {...rest}
        />
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--m-red)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
