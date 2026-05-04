import { useState } from "react";
import { X, ArrowRight, Loader2, Mail, KeyRound } from "lucide-react";
import { sendCustomerOTP, verifyCustomerOTP } from "../lib/api";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { toast } from "sonner";

const CustomerLoginModal = ({ open, onClose }) => {
  const { login } = useCustomerAuth();
  const [step, setStep] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await sendCustomerOTP(email);
      toast.success("OTP sent to your email");
      setStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    try {
      const res = await verifyCustomerOTP(email, otp);
      login(res.data.token, res.data.customer);
      toast.success(res.data.is_new ? "Welcome to Locofast!" : "Logged in successfully");
      setEmail(""); setOtp(""); setStep("email");
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await sendCustomerOTP(email);
      toast.success("New OTP sent");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to resend");
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="customer-login-modal">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {step === "email" ? "Sign in to Locofast" : "Enter OTP"}
            </h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          {step === "email" ? (
            <form onSubmit={handleSendOTP}>
              <p className="text-sm text-gray-500 mb-4">
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
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                data-testid="send-otp-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {loading ? "Sending..." : "Send Login Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP}>
              <p className="text-sm text-gray-500 mb-1">
                We sent a 6-digit code to
              </p>
              <p className="text-sm font-medium text-gray-900 mb-4">{email}</p>
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
                className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                data-testid="verify-otp-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <div className="flex items-center justify-between mt-4">
                <button type="button" onClick={() => { setStep("email"); setOtp(""); }} className="text-sm text-gray-500 hover:text-gray-700">
                  Change email
                </button>
                <button type="button" onClick={handleResend} disabled={loading} className="text-sm text-[#2563EB] hover:underline disabled:opacity-50">
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="bg-gray-50 px-6 py-4 text-center">
          <p className="text-xs text-gray-400">No password needed. We'll email you a login code every time.</p>
        </div>
      </div>
    </div>
  );
};

export default CustomerLoginModal;
