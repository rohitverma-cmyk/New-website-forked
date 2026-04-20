import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgentAuth } from "../../context/AgentAuthContext";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const AgentLoginPage = () => {
  const [step, setStep] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAgentAuth();
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success("OTP sent to your email");
      setStep("otp");
    } catch (err) {
      toast.error(err.message || "Failed to send OTP");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.detail || "Invalid OTP");
      login(data.token, data.agent);
      toast.success(`Welcome, ${data.agent.name}!`);
      navigate("/agent");
    } catch (err) {
      toast.error(err.message || "Verification failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg"
            alt="Locofast"
            className="h-8 mx-auto mb-4 brightness-0 invert"
          />
          <h1 className="text-2xl font-bold text-white" data-testid="agent-login-title">Agent Portal</h1>
          <p className="text-slate-400 mt-1">Sign in to manage assisted bookings</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {step === "email" ? (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@locofast.com"
                    className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                    data-testid="agent-email-input"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                data-testid="agent-send-otp-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Send Login Code</span><ArrowRight size={16} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <p className="text-sm text-gray-600 text-center">Enter the 6-digit code sent to <span className="font-medium text-gray-900">{email}</span></p>
              <div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center text-2xl tracking-[0.5em] py-4 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                  autoFocus
                  data-testid="agent-otp-input"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                data-testid="agent-verify-btn"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Verify & Sign In"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setOtp(""); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentLoginPage;
