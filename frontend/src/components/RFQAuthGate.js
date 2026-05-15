/**
 * RFQAuthGate — Inline auth gate that fronts the RFQ flow.
 *
 * Used by both Desktop /rfq and Mobile /m/rfq to satisfy the unified
 * RFQ structure (use cases 1/2/3 of the May 2026 spec):
 *
 *  • If a logged-in customer renders this component, it renders its
 *    children immediately — no gate.
 *  • If guest, it shows a 3-stage flow:
 *      Stage A: enter mobile number → POST /customer/send-whatsapp-otp
 *      Stage B: enter 6-digit OTP → POST /customer/verify-whatsapp-otp
 *               → JWT issued, `is_new` flag tells us next stage.
 *      Stage C (only if `is_new`): collect name + email + GSTIN
 *               → POST /customer/profile/update — runs GST verify
 *               server-side; on success the JWT user is now fully
 *               registered and we render children.
 *  • Existing customer flows skip Stage C entirely.
 *
 * Reusable: pass `dense` for a tighter mobile-style layout. The desktop
 * variant uses default spacing.
 */
import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Phone, KeyRound, User, Mail, FileText, Loader2, CheckCircle2, ArrowRight, Building2 } from "lucide-react";
import { useCustomerAuth } from "../context/CustomerAuthContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function RFQAuthGate({ children, dense = false, title = "Sign in to continue", subtitle }) {
  const { customer, isLoggedIn, login } = useCustomerAuth();
  const [stage, setStage] = useState("phone"); // 'phone' | 'otp' | 'register'
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenStash, setTokenStash] = useState(null); // hold the JWT while we collect profile

  // If already authed AND already has name+email+gstin → render children.
  // If authed but profile is incomplete (phone-only signup that left
  // without completing) → keep the registration form in front.
  const profileComplete = (c) => !!(c?.name && c?.email && !c.email.endsWith("@phone.locofast.local") && c?.gstin);

  if (isLoggedIn && profileComplete(customer)) {
    return children;
  }
  // Authed but incomplete — jump straight to register stage
  if (isLoggedIn && !profileComplete(customer) && stage !== "register") {
    setStage("register");
    setEmail(customer?.email && !customer.email.endsWith("@phone.locofast.local") ? customer.email : "");
    setName(customer?.name || "");
    setGstin(customer?.gstin || "");
    // Pre-fill phone from customer profile if available (e.g. WA-OTP signup);
    // otherwise leave blank so the register form prompts for it (email-OTP signup case).
    if (!phone && customer?.phone) {
      setPhone(String(customer.phone).replace(/^\+?91/, "").replace(/\D/g, "").slice(-10));
    }
  }

  // ── handlers ─────────────────────────────────────────────────
  const sendOtp = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 10) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/customer/send-whatsapp-otp`, { phone: cleaned });
      toast.success("OTP sent to your WhatsApp");
      setStage("otp");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send OTP. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setBusy(true);
    try {
      const cleaned = phone.replace(/\D/g, "");
      const res = await axios.post(`${API_URL}/api/customer/verify-whatsapp-otp`, { phone: cleaned, otp });
      const { token, customer: cust, is_new } = res.data;
      if (is_new || !profileComplete(cust)) {
        // Stash token but don't `login()` yet — we need the registration
        // step to finish so the auth context flips with a complete profile.
        setTokenStash(token);
        setEmail(cust?.email && !cust.email.endsWith("@phone.locofast.local") ? cust.email : "");
        setName(cust?.name || "");
        setGstin(cust?.gstin || "");
        setStage("register");
      } else {
        login(token, cust);
        toast.success("Welcome back!");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid OTP");
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Valid email is required");
    if (gstin.trim().length !== 15) return toast.error("GSTIN must be 15 characters");

    // Phone is required by the backend. Use entered phone, else fallback to customer's saved phone.
    const phoneOnly = (phone.replace(/\D/g, "") || String(customer?.phone || "").replace(/\D/g, ""));
    if (phoneOnly.length < 10) return toast.error("Enter a valid 10-digit mobile number");

    setBusy(true);
    try {
      const tk = tokenStash || localStorage.getItem("lf_customer_token");
      // PUT /api/customer/profile — backend verifies GST + auto-fills
      // company from GSTN API. On success the customer doc is now fully
      // registered. We must send `phone` because it's a required field
      // (we already have it from the OTP step).
      const res = await axios.put(
        `${API_URL}/api/customer/profile`,
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phoneOnly,
          gstin: gstin.trim().toUpperCase(),
        },
        { headers: { Authorization: `Bearer ${tk}` } }
      );
      const updated = res.data?.customer || res.data;
      login(tk, updated);
      toast.success("Account ready");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't complete registration");
    } finally {
      setBusy(false);
    }
  };

  // ── render ───────────────────────────────────────────────────
  // Backdrop-modal pattern: we always mount the underlying page so the
  // visitor sees what they're about to do (RFQ form, checkout summary)
  // peeking through behind a blurred overlay. The auth card slides up
  // from the bottom on mobile (sheet) or sits centered on desktop. The
  // background is `pointer-events: none` so accidental taps don't reach
  // the gated content, but the visuals stay legible.
  //
  // `dense` ⇒ mobile (bottom-sheet)   ·   default ⇒ desktop (centered).

  const stageJSX = (
    <>
        {stage === "phone" && (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <Phone size={12} /> WhatsApp OTP
            </div>
            <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 800, color: "#0F1B2D" }}>{title}</h2>
            <p style={{ marginTop: 6, fontSize: 14, color: "#4A5468" }}>{subtitle || "We'll send a 6-digit code to your WhatsApp. No password needed."}</p>

            <label style={{ display: "block", marginTop: 22, fontSize: 12, fontWeight: 700, color: "#4A5468", textTransform: "uppercase", letterSpacing: ".05em" }}>Mobile number</label>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: "1px solid #D6E0EE", background: "#fff" }}>
              <span style={{ fontWeight: 700, color: "#0F1B2D" }}>+91</span>
              <input
                type="tel" inputMode="tel" autoComplete="tel" autoFocus
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => { if (e.key === "Enter") sendOtp(); }}
                placeholder="98765 43210"
                style={{ border: "none", outline: "none", flex: 1, fontSize: 16, background: "transparent", color: "#0F1B2D" }}
                data-testid="rfq-gate-phone-input"
              />
            </div>

            <button
              onClick={sendOtp} disabled={busy || phone.length < 10}
              style={{ marginTop: 16, width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? .6 : 1 }}
              data-testid="rfq-gate-send-otp"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send OTP <ArrowRight size={16} /></>}
            </button>
          </>
        )}

        {stage === "otp" && (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <KeyRound size={12} /> Enter OTP
            </div>
            <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 800, color: "#0F1B2D" }}>Check your WhatsApp</h2>
            <p style={{ marginTop: 6, fontSize: 14, color: "#4A5468" }}>We sent a 6-digit code to <b>+91 {phone}</b>.</p>

            <input
              type="text" inputMode="numeric" autoFocus
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") verifyOtp(); }}
              placeholder="••••••"
              style={{ marginTop: 22, width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #D6E0EE", outline: "none", fontSize: 22, letterSpacing: "10px", textAlign: "center", fontFamily: "monospace" }}
              data-testid="rfq-gate-otp-input"
            />

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button onClick={() => { setStage("phone"); setOtp(""); }} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid #D6E0EE", background: "#fff", color: "#4A5468", fontWeight: 600 }} data-testid="rfq-gate-otp-back">Change number</button>
              <button onClick={verifyOtp} disabled={busy || otp.length !== 6} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", background: "#2563EB", color: "#fff", fontWeight: 700, opacity: busy ? .6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }} data-testid="rfq-gate-verify-otp">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <>Verify <CheckCircle2 size={16} /></>}
              </button>
            </div>
          </>
        )}

        {stage === "register" && (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "#ECFDF5", color: "#047857", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <Building2 size={12} /> Quick setup
            </div>
            <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 800, color: "#0F1B2D" }}>One more step</h2>
            <p style={{ marginTop: 6, fontSize: 14, color: "#4A5468" }}>Tell us about your business so we can send quotes that match.</p>

            <RegField label="Your name" required>
              <RegInput icon={User} value={name} onChange={setName} placeholder="Full name" autoComplete="name" testid="rfq-gate-name" />
            </RegField>
            <RegField label="Work email" required>
              <RegInput icon={Mail} value={email} onChange={setEmail} placeholder="you@brand.com" type="email" autoComplete="email" testid="rfq-gate-email" />
            </RegField>
            {!(String(customer?.phone || "").replace(/\D/g, "").length >= 10) && (
              <RegField label="Mobile number" required>
                <RegInput
                  icon={Phone}
                  value={phone}
                  onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  type="tel"
                  autoComplete="tel"
                  testid="rfq-gate-phone-reg"
                />
              </RegField>
            )}
            <RegField label="GSTIN — we'll verify & auto-fill your company" required>
              <RegInput icon={FileText} value={gstin} onChange={(v) => setGstin(v.toUpperCase())} placeholder="15-character GSTIN" testid="rfq-gate-gstin" maxLength={15} mono />
            </RegField>

            <button
              onClick={submitRegistration} disabled={busy}
              style={{ marginTop: 18, width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? .6 : 1 }}
              data-testid="rfq-gate-submit-reg"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <>Finish setup <ArrowRight size={16} /></>}
            </button>
            <p style={{ marginTop: 10, fontSize: 11, color: "#8A93A6" }}>By continuing you agree to Locofast's Terms & Privacy Policy.</p>
          </>
        )}
    </>
  );

  return (
    <div data-testid="rfq-auth-gate" style={{ position: "relative" }}>
      {/* Background — gated content rendered behind so the user sees
          what they're signing in for. Blurred + dimmed + non-interactive. */}
      <div
        aria-hidden="true"
        style={{
          filter: "blur(4px) saturate(0.9)",
          WebkitFilter: "blur(4px) saturate(0.9)",
          opacity: 0.55,
          pointerEvents: "none",
          userSelect: "none",
          // Cap height so very long forms don't make the modal vanish in
          // a tall page.
          maxHeight: dense ? "100vh" : "calc(100vh - 20px)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>

      {/* Tinted overlay between content and the modal — gives the auth
          card extra contrast on lighter pages. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "linear-gradient(180deg, rgba(15,27,45,0.30) 0%, rgba(15,27,45,0.50) 100%)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          zIndex: 90,
          pointerEvents: "none",
        }}
      />

      {/* Auth card — bottom-sheet on mobile (`dense`), centered on desktop. */}
      {dense ? (
        <>
          <style>{`@keyframes lf-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              background: "#fff",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: "10px 18px 28px",
              boxShadow: "0 -16px 40px rgba(15,27,45,0.18)",
              maxHeight: "92vh",
              overflowY: "auto",
              animation: "lf-sheet-up .28s ease-out",
            }}
          >
            {/* Drag handle for the sheet affordance */}
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 5,
                borderRadius: 5,
                background: "#D6E0EE",
                margin: "0 auto 14px",
              }}
            />
            {stageJSX}
          </div>
        </>
      ) : (
        <>
          <style>{`@keyframes lf-modal-in { from { opacity: 0; transform: translate(-50%, -42%); } to { opacity: 1; transform: translate(-50%, -50%); } }`}</style>
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 100,
              width: "min(460px, calc(100vw - 32px))",
              background: "#fff",
              borderRadius: 24,
              padding: 32,
              boxShadow: "0 30px 80px rgba(15,27,45,0.25)",
              border: "1px solid #E4ECF7",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "auto",
              animation: "lf-modal-in .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            {stageJSX}
          </div>
        </>
      )}
    </div>
  );
}

const RegField = ({ label, required, children }) => (
  <label style={{ display: "block", marginTop: 14 }}>
    <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A5468", textTransform: "uppercase", letterSpacing: ".05em" }}>
      {label}{required && <span style={{ color: "#DC2626" }}> *</span>}
    </span>
    {children}
  </label>
);

const RegInput = ({ icon: Icon, value, onChange, placeholder, type = "text", autoComplete, testid, maxLength, mono }) => (
  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: "1px solid #D6E0EE", background: "#fff" }}>
    {Icon && <Icon size={16} color="#8A93A6" />}
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      autoComplete={autoComplete} maxLength={maxLength}
      style={{ border: "none", outline: "none", flex: 1, fontSize: 15, background: "transparent", color: "#0F1B2D", fontFamily: mono ? "monospace" : undefined, letterSpacing: mono ? "0.5px" : undefined }}
      data-testid={testid}
    />
  </div>
);
