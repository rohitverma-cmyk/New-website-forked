import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, Building2, Mail, Phone, User, MapPin, FileText } from "lucide-react";
import { toast } from "sonner";
import api from "../../lib/api";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

const FABRIC_TYPES = [
  { value: "Cotton", emoji: "🌾" },
  { value: "Denim", emoji: "🧵" },
  { value: "Knits", emoji: "✨" },
  { value: "Viscose", emoji: "🌸" },
  { value: "Polyester", emoji: "⚡" },
  { value: "Sustainable", emoji: "🌱" },
  { value: "Linen", emoji: "🌿" },
  { value: "Other", emoji: "✍️" },
];

const QTY_UNITS = [
  { value: "m", label: "Meters" },
  { value: "kg", label: "Kg" },
  { value: "yd", label: "Yards" },
];

export default function MRFQ() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer } = useCustomerAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fabric_type: "",
    quantity_value: "",
    quantity_unit: "m",
    fabric_url: params.get("fabric") ? `${window.location.origin}/fabrics/${params.get("fabric")}` : "",
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    company_name: customer?.company || "",
    gst_number: customer?.gstin || "",
    location: customer?.city || "",
    message: "",
  });

  useEffect(() => {
    if (customer) {
      setForm((f) => ({
        ...f,
        name: f.name || customer.name || "",
        email: f.email || customer.email || "",
        phone: f.phone || customer.phone || "",
        company_name: f.company_name || customer.company || "",
        gst_number: f.gst_number || customer.gstin || "",
        location: f.location || customer.city || "",
      }));
    }
  }, [customer]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canStep1 = form.fabric_type && form.quantity_value && parseFloat(form.quantity_value) > 0;
  const canStep2 = form.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.phone.replace(/\D/g, "").length >= 10;

  const next = () => {
    if (step === 1 && !canStep1) { toast.error("Pick a fabric type and quantity"); return; }
    if (step === 2 && !canStep2) { toast.error("Name, valid email & phone are required"); return; }
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(1, step - 1));

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/enquiries/rfq-lead", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        company_name: form.company_name.trim(),
        gst_number: form.gst_number.trim().toUpperCase(),
        fabric_type: form.fabric_type,
        fabric_url: form.fabric_url,
        location: form.location.trim(),
        quantity_value: parseFloat(form.quantity_value) || 0,
        quantity_unit: form.quantity_unit,
        message: form.message.trim(),
      });
      setStep(4); // success
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Progress bar
  const progress = step === 4 ? 100 : Math.round(((step - 1) / 3) * 100);

  return (
    <div style={{ paddingBottom: 100 }}>
      <div className="m-container" style={{ paddingTop: 4 }}>
        {step !== 4 && (
          <>
            <div className="m-kicker">Step {step} of 3</div>
            <h1 className="m-title-lg" style={{ marginTop: 4 }}>
              {step === 1 && "What fabric do you need?"}
              {step === 2 && "How can we reach you?"}
              {step === 3 && "Anything else?"}
            </h1>
            <div style={{ height: 4, borderRadius: 2, background: "var(--m-border)", marginTop: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--m-orange)", transition: "width .25s ease" }} />
            </div>
          </>
        )}

        {step === 1 && (
          <div style={{ marginTop: 22 }}>
            <FieldLabel>Fabric type</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FABRIC_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => update("fabric_type", t.value)}
                  className={"m-card"}
                  style={{
                    padding: "14px 12px", textAlign: "left", cursor: "pointer",
                    border: form.fabric_type === t.value ? "2px solid var(--m-orange)" : "1px solid var(--m-border-2)",
                    background: form.fabric_type === t.value ? "var(--m-orange-50)" : "var(--m-surface)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{t.emoji}</span>
                  <span style={{ fontWeight: 700, color: "var(--m-ink)" }}>{t.value}</span>
                </button>
              ))}
            </div>

            <FieldLabel style={{ marginTop: 22 }}>Quantity</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="m-card" style={{ flex: 2, padding: "4px 14px", border: "1px solid var(--m-border-2)" }}>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={form.quantity_value}
                  onChange={(e) => update("quantity_value", e.target.value)}
                  placeholder="5000"
                  style={{ width: "100%", border: "none", outline: "none", fontSize: 18, fontWeight: 600, padding: "12px 0", background: "transparent", color: "var(--m-ink)" }}
                />
              </div>
              <select
                value={form.quantity_unit}
                onChange={(e) => update("quantity_unit", e.target.value)}
                className="m-card"
                style={{ flex: 1, padding: "0 12px", border: "1px solid var(--m-border-2)", fontWeight: 600, color: "var(--m-ink)" }}
              >
                {QTY_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: 22 }}>
            <FieldLabel>Your name *</FieldLabel>
            <TextInput icon={User} value={form.name} onChange={(v) => update("name", v)} placeholder="Full name" autoComplete="name" />

            <FieldLabel style={{ marginTop: 14 }}>Work email *</FieldLabel>
            <TextInput icon={Mail} type="email" value={form.email} onChange={(v) => update("email", v)} placeholder="you@brand.com" autoComplete="email" inputMode="email" />

            <FieldLabel style={{ marginTop: 14 }}>Phone *</FieldLabel>
            <TextInput icon={Phone} type="tel" value={form.phone} onChange={(v) => update("phone", v)} placeholder="10-digit mobile" autoComplete="tel" inputMode="tel" />

            <FieldLabel style={{ marginTop: 14 }}>Company (optional)</FieldLabel>
            <TextInput icon={Building2} value={form.company_name} onChange={(v) => update("company_name", v)} placeholder="Your brand name" />

            <FieldLabel style={{ marginTop: 14 }}>City (optional)</FieldLabel>
            <TextInput icon={MapPin} value={form.location} onChange={(v) => update("location", v)} placeholder="e.g. Bengaluru" />
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 22 }}>
            <FieldLabel>GSTIN (optional)</FieldLabel>
            <TextInput icon={FileText} value={form.gst_number} onChange={(v) => update("gst_number", v.toUpperCase())} placeholder="15-char GSTIN" />
            <p className="m-caption" style={{ marginTop: 6 }}>Sharing your GSTIN helps us route to verified mills + invoice-ready quotes.</p>

            <FieldLabel style={{ marginTop: 18 }}>Anything we should know?</FieldLabel>
            <div className="m-card" style={{ padding: 12, border: "1px solid var(--m-border-2)" }}>
              <textarea
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                rows={5}
                placeholder="Pantone, GSM, finish, target price, deadline… the more detail, the faster we quote."
                style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", color: "var(--m-ink)", background: "transparent" }}
              />
            </div>

            {/* Summary */}
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--m-bg)", border: "1px solid var(--m-border)" }}>
              <div className="m-kicker">Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "var(--m-ink-3)" }}>Fabric</span><strong>{form.fabric_type}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "var(--m-ink-3)" }}>Quantity</span><strong>{form.quantity_value} {form.quantity_unit}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "var(--m-ink-3)" }}>Contact</span><strong>{form.email}</strong>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ paddingTop: 40, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, margin: "0 auto 20px", borderRadius: "50%", background: "var(--m-green-50)", color: "var(--m-green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={44} strokeWidth={3} />
            </div>
            <h1 className="m-title-xl">Quote requested!</h1>
            <p className="m-body" style={{ marginTop: 8 }}>
              Our sourcing team will email you within <strong>4 working hours</strong> with verified mills + indicative pricing.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
              <button onClick={() => navigate("/m")} className="m-btn m-btn-primary">Back to home</button>
              <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-outline">Browse catalog meanwhile</button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom nav */}
      {step !== 4 && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: "calc(var(--m-tab-h) + env(safe-area-inset-bottom, 0px))",
          background: "var(--m-surface)", borderTop: "1px solid var(--m-border)",
          padding: "10px 16px", display: "flex", gap: 10, zIndex: 50,
        }}>
          {step > 1 && (
            <button onClick={back} className="m-btn m-btn-outline" style={{ flex: 1 }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {step < 3 ? (
            <button onClick={next} className="m-btn m-btn-primary" style={{ flex: 2 }}>
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting || !canStep2 || !canStep1} className="m-btn m-btn-primary" style={{ flex: 2 }}>
              {submitting ? <><span className="m-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Submitting…</> : <>Submit RFQ <ArrowRight size={16} /></>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, style }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)", marginBottom: 8, ...style }}>{children}</label>;
}
function TextInput({ icon: Icon, value, onChange, ...rest }) {
  return (
    <div className="m-card" style={{ padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--m-border-2)" }}>
      {Icon && <Icon size={18} color="var(--m-ink-3)" />}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, border: "none", outline: "none", padding: "13px 0", fontSize: 15, background: "transparent", color: "var(--m-ink)" }}
        {...rest}
      />
    </div>
  );
}
