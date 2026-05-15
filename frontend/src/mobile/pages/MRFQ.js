import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, FileText, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import api from "../../lib/api";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import RFQAuthGate from "../../components/RFQAuthGate";

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
  return (
    <RFQAuthGate dense title="Sign in to request a quote" subtitle="Our sourcing team replies within 4 working hours.">
      <MRFQInner />
    </RFQAuthGate>
  );
}

function MRFQInner() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer } = useCustomerAuth();
  // Fabric context (PDP-launched RFQs come with a `fabric` slug/id param).
  const fabricParam = params.get("fabric") || "";
  const fromPDP = !!fabricParam;
  const [fabric, setFabric] = useState(null);
  const [specsEditing, setSpecsEditing] = useState(false);

  const [step, setStep] = useState(1); // 1 = specs+qty, 2 = notes, 3 = success
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fabric_type: "",
    quantity_value: "",
    quantity_unit: "m",
    fabric_url: fabricParam ? `${window.location.origin}/fabrics/${fabricParam}` : "",
    message: "",
  });

  // Fetch fabric detail when launched from a PDP — auto-fill fabric_type
  // (so the user doesn't have to pick again). They can hit "Edit" to
  // override if the source product wasn't quite right.
  useEffect(() => {
    if (!fabricParam) return;
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/fabrics/${fabricParam}`);
        if (!alive) return;
        const f = res.data;
        setFabric(f);
        setForm((prev) => ({
          ...prev,
          fabric_type: prev.fabric_type || (f.category_name || "").split(" ")[0] || prev.fabric_type,
          fabric_url: prev.fabric_url || `${window.location.origin}/fabrics/${f.slug || f.id}`,
        }));
      } catch (e) {
        // PDP fabric isn't found — silently degrade to manual entry
      }
    })();
    return () => { alive = false; };
  }, [fabricParam]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Validation
  const canStep1 = form.fabric_type && form.quantity_value && parseFloat(form.quantity_value) > 0;

  const next = () => {
    if (step === 1 && !canStep1) { toast.error("Pick a fabric type and quantity"); return; }
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(1, step - 1));

  const submit = async () => {
    setSubmitting(true);
    try {
      // Customer's name/email/phone/company/gst are already on the
      // authed profile — backend reads them from JWT. We still send
      // them in the body for the existing endpoint's contract, but
      // they're never asked of the user (unified UX).
      await api.post("/enquiries/rfq-lead", {
        name: customer?.name || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
        company_name: customer?.company || "",
        gst_number: (customer?.gstin || "").toUpperCase(),
        fabric_type: form.fabric_type,
        fabric_url: form.fabric_url,
        location: customer?.city || "",
        quantity_value: parseFloat(form.quantity_value) || 0,
        quantity_unit: form.quantity_unit,
        message: form.message.trim(),
      });
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 2;
  const progress = step === 3 ? 100 : Math.round(((step - 1) / totalSteps) * 100);

  return (
    <div style={{ paddingBottom: 100 }} data-testid="mrfq-form">
      <div className="m-container" style={{ paddingTop: 4 }}>
        {step !== 3 && (
          <>
            <div className="m-kicker">Step {step} of {totalSteps}</div>
            <h1 className="m-title-lg" style={{ marginTop: 4 }}>
              {step === 1 && (fromPDP ? "Confirm fabric & quantity" : "What fabric do you need?")}
              {step === 2 && "Anything else?"}
            </h1>
            <div style={{ height: 4, borderRadius: 2, background: "var(--m-border)", marginTop: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--m-orange)", transition: "width .25s ease" }} />
            </div>
          </>
        )}

        {step === 1 && (
          <div style={{ marginTop: 22 }}>
            {/* PDP context — collapsed specs card with Edit toggle.
                Plain users (no fabric param) get the full picker grid. */}
            {fromPDP && !specsEditing ? (
              <div className="m-card" style={{ padding: 14, border: "1px solid var(--m-border-2)", display: "flex", alignItems: "flex-start", gap: 12 }} data-testid="mrfq-specs-locked">
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--m-orange-50)", color: "var(--m-orange)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Lock size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Specs locked from</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-ink)", marginTop: 2, lineHeight: 1.3 }}>{fabric?.name || "this fabric"}</div>
                  {fabric?.category_name && <div className="m-caption" style={{ marginTop: 4 }}>{fabric.category_name}{fabric.composition ? ` · ${fabric.composition}` : ""}{fabric.weight_gsm ? ` · ${fabric.weight_gsm} GSM` : ""}</div>}
                </div>
                <button onClick={() => setSpecsEditing(true)} style={{ background: "transparent", border: "1px solid var(--m-border-2)", borderRadius: 10, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--m-blue)", fontSize: 12, fontWeight: 600 }} data-testid="mrfq-specs-edit-btn">
                  <Pencil size={12} /> Edit
                </button>
              </div>
            ) : (
              <>
                <FieldLabel>Fabric type</FieldLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {FABRIC_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => update("fabric_type", t.value)}
                      className="m-card"
                      style={{
                        padding: "14px 12px", textAlign: "left", cursor: "pointer",
                        border: form.fabric_type === t.value ? "2px solid var(--m-orange)" : "1px solid var(--m-border-2)",
                        background: form.fabric_type === t.value ? "var(--m-orange-50)" : "var(--m-surface)",
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                      data-testid={`mrfq-fabric-${t.value}`}
                    >
                      <span style={{ fontSize: 22 }}>{t.emoji}</span>
                      <span style={{ fontWeight: 700, color: "var(--m-ink)" }}>{t.value}</span>
                    </button>
                  ))}
                </div>
                {fromPDP && (
                  <button onClick={() => setSpecsEditing(false)} style={{ marginTop: 10, background: "transparent", border: "none", color: "var(--m-blue)", fontSize: 13, fontWeight: 600 }}>
                    ← Use specs from {fabric?.name || "the original fabric"}
                  </button>
                )}
              </>
            )}

            <FieldLabel style={{ marginTop: 22 }}>Quantity</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="m-card" style={{ flex: 2, padding: "4px 14px", border: "1px solid var(--m-border-2)" }}>
                <input
                  type="number" inputMode="numeric" value={form.quantity_value}
                  onChange={(e) => update("quantity_value", e.target.value)}
                  placeholder="e.g. 3000" min={1}
                  style={{ width: "100%", padding: "12px 0", border: "none", outline: "none", fontSize: 16, color: "var(--m-ink)", background: "transparent" }}
                  data-testid="mrfq-qty"
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
            <FieldLabel>Anything we should know?</FieldLabel>
            <div className="m-card" style={{ padding: 12, border: "1px solid var(--m-border-2)" }}>
              <textarea
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                rows={5}
                placeholder="Pantone, GSM, finish, target price, deadline… the more detail, the faster we quote."
                style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", color: "var(--m-ink)", background: "transparent" }}
                data-testid="mrfq-message"
              />
            </div>

            {/* Summary */}
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--m-bg)", border: "1px solid var(--m-border)" }}>
              <div className="m-kicker">Summary</div>
              {fabric?.name && (
                <Row label="From" value={fabric.name} />
              )}
              <Row label="Fabric" value={form.fabric_type} />
              <Row label="Quantity" value={`${form.quantity_value} ${form.quantity_unit}`} />
              <Row label="Contact" value={customer?.email && !customer.email.endsWith("@phone.locofast.local") ? customer.email : (customer?.phone ? `+${customer.phone}` : "")} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ paddingTop: 40, textAlign: "center" }}>
            <div style={{ width: 84, height: 84, margin: "0 auto 20px", borderRadius: "50%", background: "var(--m-green-50)", color: "var(--m-green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={44} strokeWidth={3} />
            </div>
            <h1 className="m-title-xl">Quote requested!</h1>
            <p className="m-body" style={{ marginTop: 8 }}>
              Our sourcing team will email you within <strong>4 working hours</strong> with verified mills + indicative pricing.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
              <button onClick={() => navigate("/m")} className="m-btn m-btn-primary" data-testid="mrfq-done-home">Back to home</button>
              <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-outline">Browse catalog meanwhile</button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom nav */}
      {step !== 3 && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: "calc(var(--m-tab-h) + env(safe-area-inset-bottom, 0px))",
          background: "var(--m-surface)", borderTop: "1px solid var(--m-border)",
          padding: "10px 16px", display: "flex", gap: 10, zIndex: 50,
        }}>
          {step > 1 && (
            <button onClick={back} className="m-btn m-btn-outline" style={{ flex: 1 }} data-testid="mrfq-back">
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {step < 2 ? (
            <button onClick={next} className="m-btn m-btn-primary" style={{ flex: 2 }} data-testid="mrfq-next">
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting || !canStep1} className="m-btn m-btn-primary" style={{ flex: 2 }} data-testid="mrfq-submit">
              {submitting ? <><span className="m-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Submitting…</> : <>Submit RFQ <ArrowRight size={16} /></>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const FieldLabel = ({ children, style }) => (
  <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--m-ink-3)", marginBottom: 8, ...style }}>{children}</label>
);

const Row = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
    <span style={{ color: "var(--m-ink-3)" }}>{label}</span>
    <strong style={{ color: "var(--m-ink)", textAlign: "right", marginLeft: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "—"}</strong>
  </div>
);
