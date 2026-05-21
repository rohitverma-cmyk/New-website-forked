import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, Mail, KeyRound, ArrowRight, Shield } from "lucide-react";
import { toast } from "sonner";
import api, { sendCustomerOTP, verifyCustomerOTP } from "../../lib/api";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

export default function MLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isLoggedIn } = useCustomerAuth();
  const [step, setStep] = useState("email"); // 'email' | 'otp'
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef([]);
  const redirect = searchParams.get("redirect") || "/m";

  useEffect(() => {
    if (isLoggedIn) navigate(redirect, { replace: true });
  }, [isLoggedIn, navigate, redirect]);

  // Resend timer
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const sendOtp = async (resend = false) => {
    if (!validateEmail(email)) {
      toast.error("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      await sendCustomerOTP(email.trim().toLowerCase());
      setStep("otp");
      setResendIn(45);
      if (!resend) {
        toast.success("OTP sent to your email");
      } else {
        toast.success("New OTP sent");
      }
      // Auto-focus first OTP box
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to send OTP";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (code) => {
    setLoading(true);
    try {
      const res = await verifyCustomerOTP(email.trim().toLowerCase(), code);
      const { token, customer } = res.data;
      login(token, customer);
      toast.success("Welcome to Locofast");
      navigate(redirect, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Invalid OTP";
      toast.error(msg);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const onOtpChange = (idx, val) => {
    const sanitized = val.replace(/\D/g, "").slice(0, 1);
    const next = otp.slice();
    next[idx] = sanitized;
    setOtp(next);
    if (sanitized && idx < 5) otpRefs.current[idx + 1]?.focus();
    // Auto-submit when all 6 entered
    if (idx === 5 && sanitized) {
      const code = next.join("");
      if (code.length === 6) verifyOtp(code);
    }
  };

  const onOtpKey = (idx, e) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    } else if (e.key === "Enter") {
      const code = otp.join("");
      if (code.length === 6) verifyOtp(code);
    }
  };

  const onOtpPaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setOtp(pasted.split(""));
      verifyOtp(pasted);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--m-bg)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Header */}
      <div style={{ padding: "8px 16px 0" }}>
        <button
          onClick={() => (step === "otp" ? setStep("email") : navigate(-1))}
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--m-surface)", border: "1px solid var(--m-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--m-ink)" }}
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="m-container" style={{ paddingTop: 12 }}>
        {/* Locofast mark — brand blue with inline double-check icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--m-blue-50)", color: "var(--m-blue)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(37,99,235,0.20)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13.5 L9 18 L14 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 13.5 L14.5 18 L19.5 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontWeight: 800, fontSize: 19, color: "var(--m-ink)", letterSpacing: "-0.01em" }}>locofast</div>
        </div>

        {step === "email" ? (
          <>
            <h1 className="m-title-xl" style={{ marginBottom: 4, fontSize: 24 }}>Welcome back</h1>
            <p className="m-body" style={{ marginBottom: 18 }}>Sign in to track orders, manage RFQs, and reorder fabric in one tap.</p>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)", marginBottom: 6 }}>Email address</label>
            <div className="m-card" style={{ padding: "4px 6px 4px 14px", display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--m-border-2)", outline: "none" }}>
              <Mail size={18} color="var(--m-ink-3)" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendOtp(); }}
                placeholder="you@brand.com"
                style={{ flex: 1, border: "none", outline: "none", boxShadow: "none", WebkitAppearance: "none", padding: "12px 0", fontSize: 16, background: "transparent", color: "var(--m-ink)" }}
              />
            </div>

            <button
              onClick={() => sendOtp(false)}
              disabled={loading || !email}
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: 14 }}
            >
              {loading ? <><span className="m-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending…</> : <>Send OTP <ArrowRight size={16} /></>}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "var(--m-ink-3)", fontSize: 12 }}>
              <Shield size={14} />
              <span>We'll email you a 6-digit code. No passwords required.</span>
            </div>

            <p style={{ marginTop: 18, fontSize: 12, color: "var(--m-ink-3)", lineHeight: 1.4, textAlign: "center" }}>
              By continuing, you agree to Locofast's{" "}
              <Link to="/terms" style={{ color: "var(--m-blue)", textDecoration: "underline" }}>Terms</Link> and{" "}
              <Link to="/privacy" style={{ color: "var(--m-blue)", textDecoration: "underline" }}>Privacy Policy</Link>.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-title-xl" style={{ marginBottom: 4, fontSize: 24 }}>Check your inbox</h1>
            <p className="m-body" style={{ marginBottom: 18 }}>
              We sent a 6-digit code to <strong style={{ color: "var(--m-ink)" }}>{email}</strong>.
            </p>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)", marginBottom: 10 }}>
              <KeyRound size={12} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
              Verification code
            </label>

            <div style={{ display: "flex", gap: 6, maxWidth: 320, margin: "0 auto" }} onPaste={onOtpPaste}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={d}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => onOtpKey(i, e)}
                  style={{
                    flex: 1, minWidth: 0, height: 50,
                    textAlign: "center",
                    fontSize: 22, fontWeight: 800, color: "var(--m-ink)",
                    border: d ? "2px solid var(--m-blue)" : "1px solid var(--m-border-2)",
                    borderRadius: 10, background: "var(--m-surface)",
                    outline: "none", padding: 0,
                  }}
                />
              ))}
            </div>

            <button
              onClick={() => { const code = otp.join(""); if (code.length === 6) verifyOtp(code); }}
              disabled={loading || otp.join("").length !== 6}
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: 16 }}
            >
              {loading ? <><span className="m-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Verifying…</> : <>Verify & sign in <ArrowRight size={16} /></>}
            </button>

            <div style={{ marginTop: 14, textAlign: "center" }}>
              {resendIn > 0 ? (
                <span style={{ fontSize: 13, color: "var(--m-ink-3)" }}>Resend code in {resendIn}s</span>
              ) : (
                <button onClick={() => sendOtp(true)} disabled={loading} style={{ background: "none", border: "none", color: "var(--m-blue)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Didn't get it? Resend code
                </button>
              )}
            </div>

            <button
              onClick={() => setStep("email")}
              style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "var(--m-ink-3)", fontSize: 13, cursor: "pointer" }}
            >
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
