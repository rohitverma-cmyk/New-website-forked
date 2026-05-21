import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import LocofastLogo from "../../components/LocofastLogo";

/**
 * Enterprise (Brand & Factory) login page.
 *
 * Desktop: split-pane.
 *   Left  = cream "By the Numbers" hero (matches LinkedIn promo collateral)
 *   Right = login card
 * Mobile: stacked, hero collapses to a compressed strip on top.
 *
 * Stats are static here — driven by the marketing team. If we ever want
 * them live, swap the constants for a `/api/marketing/stats` fetch.
 */

const HERO_STATS = [
  {
    value: "500+",
    label: "Verified mills",
    sub: "GST-audited, factory-checked, on one platform.",
    accent: "text-emerald-600",
  },
  {
    value: "48–72h",
    label: "Sample dispatch",
    sub: "From ready stock — no MOQ, no premium.",
    accent: "text-gray-900",
  },
  {
    value: "700+",
    label: "Brands & manufacturers",
    sub: "Already sourcing on Locofast.",
    accent: "text-emerald-600",
  },
];

const HeroPanel = () => (
  <div
    className="hidden lg:flex flex-col justify-between px-12 py-10 bg-[#F1ECDC]"
    data-testid="brand-login-hero"
  >
    {/* Top row */}
    <div className="flex items-center justify-between">
      <LocofastLogo size={28} />
      <span className="bg-amber-200/70 text-amber-900 text-[10px] font-bold tracking-widest px-3 py-1.5 rounded-full uppercase">
        For sourcing heads
      </span>
    </div>

    {/* Headline */}
    <div className="my-10">
      <p className="text-[10px] font-bold tracking-[0.2em] text-amber-700 uppercase mb-4">
        By the numbers
      </p>
      <h2 className="font-serif text-gray-900 text-4xl xl:text-5xl 2xl:text-6xl font-bold leading-[1.05] tracking-tight">
        The fabric supply chain,{" "}
        <span className="italic font-medium">finally</span>{" "}
        on a dashboard.
      </h2>
      <p className="text-gray-700 text-sm mt-5 max-w-md">
        One platform to manage your entire supply base — without middlemen
        or platform fees.
      </p>
    </div>

    {/* Stats */}
    <div className="space-y-5">
      {HERO_STATS.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-end justify-between gap-6 pb-5 ${
            i === HERO_STATS.length - 1 ? "" : "border-b border-amber-900/15"
          }`}
        >
          <span
            className={`font-serif text-5xl xl:text-6xl font-bold ${s.accent} leading-none`}
            style={{ letterSpacing: "-0.02em" }}
          >
            {s.value}
          </span>
          <div className="text-right max-w-[210px]">
            <p className="text-[15px] font-semibold text-gray-900 leading-tight">
              {s.label}
            </p>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">{s.sub}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const HeroStripMobile = () => (
  <div className="lg:hidden bg-[#F1ECDC] px-5 py-6" data-testid="brand-login-hero-mobile">
    <div className="flex items-center justify-between mb-4">
      <LocofastLogo size={22} />
      <span className="bg-amber-200/70 text-amber-900 text-[9px] font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
        For sourcing heads
      </span>
    </div>
    <h2 className="font-serif text-gray-900 text-2xl font-bold leading-tight">
      The fabric supply chain,{" "}
      <span className="italic font-medium">finally</span> on a dashboard.
    </h2>
    <div className="grid grid-cols-3 gap-3 mt-5">
      {HERO_STATS.map((s) => (
        <div key={s.label} className="text-center">
          <p className={`font-serif font-bold text-2xl ${s.accent} leading-none`}>{s.value}</p>
          <p className="text-[10px] text-gray-700 mt-1 leading-tight">{s.label}</p>
        </div>
      ))}
    </div>
  </div>
);

const BrandLogin = () => {
  const { login } = useBrandAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome, ${user.name}`);
      navigate(user.must_reset_password ? "/enterprise/reset-password" : "/enterprise/fabrics");
    } catch (err) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.15fr_1fr]" data-testid="brand-login-page">
      <HeroPanel />
      <HeroStripMobile />

      <div className="flex items-center justify-center bg-white px-5 py-10 lg:px-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-5 flex justify-center">
            <LocofastLogo size={26} />
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Enterprise Portal
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              Sign in to manage catalogs, sample credits and credit lines for
              your team.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="brand-login-card">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                Work email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-sm transition"
                placeholder="you@brand.com"
                data-testid="brand-login-email"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-sm transition"
                placeholder="••••••••"
                data-testid="brand-login-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition"
              data-testid="brand-login-submit"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <Lock size={14} /> Sign in
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2 text-[11px] text-gray-500">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>SSO-ready · TLS encrypted · Audited every quarter</span>
          </div>

          <p className="text-xs text-gray-400 text-center mt-8">
            Don't have an account?{" "}
            <a href="/contact" className="text-blue-600 hover:underline font-medium">
              Talk to your relationship manager
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default BrandLogin;
