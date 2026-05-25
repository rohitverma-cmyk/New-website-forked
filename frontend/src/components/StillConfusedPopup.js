/**
 * StillConfusedPopup
 * ──────────────────
 * Appears once per session after the user has spent ≥35s on any single
 * page (cumulative, reset on navigation). Offers to put them on a call
 * with a Locofast agent. Submitting POSTs to
 * /api/agent-assistance/request which emails mail@locofast.com.
 *
 * Rules:
 *  • One pop-up per session (sessionStorage flag once shown)
 *  • Hidden on admin/vendor/agent/brand portals — customer-facing only
 *  • Pre-fills name/email/phone if user is logged in (CustomerAuth)
 *  • Esc-key + backdrop click close it; closing counts as "shown"
 *  • Works on desktop + mobile (/m/* routes), single component reused
 */
import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { X, Phone, Loader2, MessageCircle } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { useCustomerAuth } from "../context/CustomerAuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const IDLE_TRIGGER_SECONDS = 30;
const SESSION_FLAG = "stillConfusedShown";

// Routes that shouldn't trigger the popup (internal portals + payment
// flows where the popup would obscure the Razorpay handler).
const EXCLUDED_PREFIXES = [
  "/admin",
  "/vendor",
  "/agent",
  "/brand",
  "/checkout",      // user is already converting — don't distract
  "/m/checkout",
];

const isExcludedPath = (pathname) =>
  EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

const StillConfusedPopup = () => {
  const { customer } = useCustomerAuth() || { customer: null };
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);

  // Pre-fill from logged-in customer
  useEffect(() => {
    if (customer) {
      setForm((f) => ({
        ...f,
        name: f.name || customer.name || "",
        email: f.email || customer.email || "",
        phone: f.phone || customer.phone || "",
      }));
    }
  }, [customer]);

  // Inactivity trigger. The popup fires only after the user has been
  // idle for IDLE_TRIGGER_SECONDS — i.e. no mouse move, scroll, keyboard,
  // click, or touch in that window. Active buyers (scrolling specs,
  // clicking variants, comparing fabrics) never see it. Reset state
  // is per-route so navigation doesn't carry a stale "almost-fired"
  // timer onto the next page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    if (isExcludedPath(location.pathname)) return;

    startedAtRef.current = Date.now();
    let lastReset = Date.now();
    const scheduleFire = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!sessionStorage.getItem(SESSION_FLAG)) setOpen(true);
      }, IDLE_TRIGGER_SECONDS * 1000);
    };

    // Throttle mousemove/scroll resets to ~once per 500ms so we're not
    // firing setTimeout thousands of times during natural movement.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 500) return;
      lastReset = now;
      startedAtRef.current = now;
      scheduleFire();
    };

    scheduleFire();
    const opts = { passive: true };
    window.addEventListener("mousemove", onActivity, opts);
    window.addEventListener("scroll", onActivity, opts);
    window.addEventListener("touchstart", onActivity, opts);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
    };
  }, [location.pathname]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_FLAG, "1");
    setOpen(false);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.email && !form.phone) {
      toast.error("Please share an email or phone so we can reach you");
      return;
    }
    setSubmitting(true);
    try {
      const timeOn = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : IDLE_TRIGGER_SECONDS;
      await axios.post(`${API}/agent-assistance/request`, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.message,
        page_url: typeof window !== "undefined" ? window.location.href : "",
        page_title: typeof document !== "undefined" ? document.title : "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
        time_on_page_seconds: timeOn,
        customer_id: customer?.id || "",
      });
      sessionStorage.setItem(SESSION_FLAG, "1");
      setOpen(false);
      toast.success("Our agent will reach out shortly", { duration: 5000 });
    } catch (err) {
      toast.error("Couldn't submit. Try again or write to mail@locofast.com");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={handleDismiss}
      data-testid="still-confused-overlay"
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300"
        onClick={(e) => e.stopPropagation()}
        data-testid="still-confused-popup"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-sky-500 to-indigo-600 text-white px-6 pt-5 pb-7">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10"
            aria-label="Close"
            data-testid="still-confused-close"
          >
            <X size={18} />
          </button>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <MessageCircle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight" data-testid="still-confused-title">
                Still Confused?
              </h3>
              <p className="text-sm text-white/90 mt-1">
                Hop on a quick call with a Locofast sourcing agent — free, no commitment.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-3" data-testid="still-confused-form">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Priya Sharma"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
              data-testid="still-confused-input-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 ..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                data-testid="still-confused-input-phone"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@brand.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                data-testid="still-confused-input-email"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              What do you need help with? <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="e.g. Looking for 14oz denim, 3000m, lead time 21 days"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 resize-none"
              data-testid="still-confused-input-message"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60 hover:shadow-md transition-shadow"
            data-testid="still-confused-submit"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
            {submitting ? "Connecting…" : "Get on a call with an agent"}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
            data-testid="still-confused-no-thanks"
          >
            No thanks, I'll continue browsing
          </button>
        </form>
      </div>
    </div>
  );
};

export default StillConfusedPopup;
