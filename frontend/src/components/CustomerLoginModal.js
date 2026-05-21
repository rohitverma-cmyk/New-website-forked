import { useState } from "react";
import { X, ArrowRight, Loader2, Mail, KeyRound, MessageCircle, Phone } from "lucide-react";
import {
  sendCustomerOTP, verifyCustomerOTP,
  sendCustomerWhatsAppOTP, verifyCustomerWhatsAppOTP,
} from "../lib/api";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { toast } from "sonner";

/**
 * CustomerLoginModal — single modal, two channels (email + WhatsApp).
 *
 * Step 1: pick channel via pill toggle, enter email OR phone, submit
 * Step 2: enter the 6-digit OTP delivered through the chosen channel
 *
 * If WhatsApp send fails (Gupshup down, template paused, etc.), we surface
 * a "Send via email instead" link on the OTP screen so the user can fall
 * back without re-typing their phone number.
 */
const CustomerLoginModal = ({ open, onClose }) => {
  const { login } = useCustomerAuth();
  const [channel, setChannel] = useState("email");           // "email" | "whatsapp"
  const [step, setStep] = useState("identifier");            // "identifier" | "otp"
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("identifier"); setOtp(""); setEmail(""); setPhone("");
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (channel === "email") {
        if (!email) { setLoading(false); return; }
        await sendCustomerOTP(email);
        toast.success("OTP sent to your email");
      } else {
        if (phone.length !== 10) { setLoading(false); return; }
        await sendCustomerWhatsAppOTP(phone);
        toast.success("OTP sent to your WhatsApp");
      }
      setStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const res = channel === "email"
        ? await verifyCustomerOTP(email, otp)
        : await verifyCustomerWhatsAppOTP(phone, otp);
      login(res.data.token, res.data.customer);
      toast.success(res.data.is_new ? "Welcome to Locofast!" : "Logged in successfully");
      reset();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      if (channel === "email") await sendCustomerOTP(email);
      else await sendCustomerWhatsAppOTP(phone);
      toast.success("New OTP sent");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to resend");
    }
    setLoading(false);
  };

  // Fallback: when WhatsApp is the chosen channel but the user has hit a
  // dead end, let them switch to email mid-flow without losing the modal.
  const switchToEmail = () => { setChannel("email"); setStep("identifier"); setOtp(""); };

  if (!open) return null;

  const sentTo = channel === "email" ? email : `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
  const canSubmit = channel === "email" ? !!email : phone.length === 10;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="customer-login-modal">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-gray-900">
              {step === "identifier" ? "Sign in to Locofast" : "Enter OTP"}
            </h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" data-testid="login-modal-close">
              <X size={20} />
            </button>
          </div>

          {step === "identifier" ? (
            <form onSubmit={handleSendOTP}>
              {/* Channel pill toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-4" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={channel === "email"}
                  onClick={() => setChannel("email")}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                    channel === "email"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="login-channel-email"
                >
                  <Mail size={14} /> Email
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={channel === "whatsapp"}
                  onClick={() => setChannel("whatsapp")}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                    channel === "whatsapp"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="login-channel-whatsapp"
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
              </div>

              {channel === "email" ? (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    Enter your email and we'll send you a one-time login code.
                  </p>
                  <div className="relative mb-4">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                      data-testid="login-email-input"
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    Enter your mobile number to receive an OTP on WhatsApp.
                  </p>
                  <div className="relative mb-4">
                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-gray-700 font-medium pointer-events-none">+91</span>
                    <input
                      type="tel"
                      required
                      autoFocus
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="98765 43210"
                      className="w-full pl-[78px] pr-4 py-3 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm tracking-wide"
                      data-testid="login-phone-input"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors ${
                  channel === "whatsapp"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-[#2563EB] hover:bg-blue-700"
                }`}
                data-testid="send-otp-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {loading ? "Sending..." : channel === "whatsapp" ? "Send OTP via WhatsApp" : "Send Login Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP}>
              <p className="text-sm text-gray-500 mb-1">
                {channel === "whatsapp"
                  ? "We sent a 6-digit code on WhatsApp to"
                  : "We sent a 6-digit code to"}
              </p>
              <p className="text-sm font-medium text-gray-900 mb-4" data-testid="otp-sent-to">{sentTo}</p>
              <div className="relative mb-4">
                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm text-center tracking-[0.3em] font-semibold text-lg"
                  data-testid="otp-input"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors ${
                  channel === "whatsapp"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-[#2563EB] hover:bg-blue-700"
                }`}
                data-testid="verify-otp-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={() => { setStep("identifier"); setOtp(""); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  data-testid="otp-change-identifier"
                >
                  {channel === "whatsapp" ? "Change number" : "Change email"}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-sm text-[#2563EB] hover:underline disabled:opacity-50"
                  data-testid="otp-resend"
                >
                  Resend code
                </button>
              </div>
              {/* Cross-channel fallback link — only on WhatsApp flow. */}
              {channel === "whatsapp" && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={switchToEmail}
                    className="w-full text-center text-xs text-gray-500 hover:text-gray-800"
                    data-testid="otp-fallback-email"
                  >
                    Didn't receive it? <span className="underline">Send via email instead</span>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
        <div className="bg-gray-50 px-6 py-4 text-center">
          <p className="text-xs text-gray-400">
            No password needed. We'll send a one-time code every time.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerLoginModal;
