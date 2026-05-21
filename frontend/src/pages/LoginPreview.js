/**
 * Mockup-only preview of the proposed magic-link customer login flow.
 * No backend wiring — for design review only. Reachable at /dev/login-preview.
 */
import { Mail, KeyRound, Edit3, Lock, Loader2, AlertTriangle } from "lucide-react";
import LocofastLogo from "../components/LocofastLogo";

const Card = ({ title, label, children, footer }) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
      <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">{label}</span>
      <span className="text-[11px] text-gray-400">v1 mock</span>
    </div>
    <div className="p-7">
      <div className="flex justify-center mb-5">
        <LocofastLogo size={26} />
      </div>
      <h2 className="text-xl font-bold text-gray-900 text-center mb-1">{title}</h2>
      {children}
    </div>
    {footer ? (
      <div className="px-7 py-4 border-t border-gray-100 text-center text-[12px] text-gray-500">
        {footer}
      </div>
    ) : null}
  </div>
);

const State1_Prefilled = () => (
  <Card
    title="Welcome back"
    label="State 1 · Token landing"
    footer={
      <>
        Not <b>buyer-rfq-test@example.com</b>?{" "}
        <a className="text-blue-600 hover:underline font-medium">Use a different email</a>
      </>
    }
  >
    <p className="text-sm text-gray-500 text-center mb-5">
      You came in from a Locofast email. Confirm it's you with a 6-digit code.
    </p>
    <label className="block mb-4">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        Your email
      </span>
      <div className="mt-1.5 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
        <Mail size={14} className="text-gray-400" />
        <span className="text-sm text-gray-800 flex-1">buyer-rfq-test@example.com</span>
        <Lock size={12} className="text-gray-400" />
      </div>
    </label>
    <button
      className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 mb-3"
    >
      <KeyRound size={14} /> Send me a 6-digit code
    </button>
    <p className="text-[11px] text-center text-gray-400 flex items-center justify-center gap-1.5">
      <Lock size={11} /> Login link expires in 24 h · OTP still required for security
    </p>
  </Card>
);

const State2_OtpEntry = () => (
  <Card
    title="Enter your code"
    label="State 2 · OTP entry"
    footer="Didn't get it? Resend in 28s"
  >
    <p className="text-sm text-gray-600 text-center mb-5">
      We sent a 6-digit code to{" "}
      <strong>buyer-rfq-test@example.com</strong>
    </p>
    <div className="flex justify-center gap-2 mb-5">
      {["4", "8", "3", "5", "1", "2"].map((d, i) => (
        <input
          key={i}
          type="text"
          maxLength={1}
          defaultValue={d}
          className="w-11 h-12 text-center border-2 border-blue-500 rounded-lg text-lg font-bold text-blue-700 focus:outline-none"
          readOnly
        />
      ))}
    </div>
    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold text-sm">
      Verify & continue
    </button>
    <p className="text-[11px] text-center text-gray-400 mt-3">
      We'll take you back to your RFQ once you're in.
    </p>
  </Card>
);

const State3_DifferentEmail = () => (
  <Card
    title="Sign in"
    label="State 3 · Manual fallback"
    footer={
      <>
        Don't have an account?{" "}
        <a className="text-blue-600 hover:underline font-medium">Get started</a>
      </>
    }
  >
    <p className="text-sm text-gray-500 text-center mb-5">
      Type the email you registered with and we'll send you a code.
    </p>
    <label className="block mb-4">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        Your email
      </span>
      <div className="mt-1.5 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg focus-within:border-blue-500">
        <Mail size={14} className="text-gray-400" />
        <input
          type="email"
          placeholder="you@company.com"
          className="text-sm flex-1 outline-none bg-transparent"
        />
      </div>
    </label>
    <button className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
      <KeyRound size={14} /> Send me a 6-digit code
    </button>
  </Card>
);

const State4_TokenExpired = () => (
  <Card
    title="Login link expired"
    label="State 4 · Expired token fallback"
    footer="Links from emails older than 24 h require manual sign-in."
  >
    <div className="flex justify-center mb-4">
      <div className="w-12 h-12 rounded-full bg-amber-100 grid place-items-center">
        <AlertTriangle size={20} className="text-amber-700" />
      </div>
    </div>
    <p className="text-sm text-gray-600 text-center mb-5">
      The login link in your email is more than 24 hours old. Type your
      email and we'll send you a fresh code.
    </p>
    <label className="block mb-4">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        Your email
      </span>
      <div className="mt-1.5 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg focus-within:border-blue-500">
        <Mail size={14} className="text-gray-400" />
        <input
          type="email"
          placeholder="you@company.com"
          className="text-sm flex-1 outline-none bg-transparent"
        />
      </div>
    </label>
    <button className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
      <KeyRound size={14} /> Send me a 6-digit code
    </button>
  </Card>
);

const LoginPreview = () => (
  <div className="min-h-screen bg-gray-100 py-12 px-6">
    <div className="max-w-[1280px] mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          Magic-link Login Flow — Mockups
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl mx-auto">
          Customer clicks a CTA in any Locofast email → lands on State 1 → State 2 (OTP) → into the
          deep link. Tokens expire after 24 h; expired tokens fall through to State 4. Anyone can
          escape to State 3 from State 1's "Use a different email" link.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
        <State1_Prefilled />
        <State2_OtpEntry />
        <State3_DifferentEmail />
        <State4_TokenExpired />
      </div>
    </div>
  </div>
);

export default LoginPreview;
