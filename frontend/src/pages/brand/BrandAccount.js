import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import BrandLayout from "./BrandLayout";
import { Loader2, TrendingUp, Plus, Building2, Wallet, Beaker, Info } from "lucide-react";
import { toast } from "sonner";
import { fmtLacs, fmtINR, fmtCount } from "../../lib/inr";

const API = process.env.REACT_APP_BACKEND_URL;

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const BrandAccount = () => {
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topupAmt, setTopupAmt] = useState(1000);
  const [topupBusy, setTopupBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`${API}/api/brand/credit-summary`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/brand/ledger`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSummary(await sRes.json());
      setLedger(await lRes.json());
    } catch {
      toast.error("Failed to load account");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  const topup = async () => {
    if (!topupAmt || topupAmt < 100) return toast.error("Minimum ₹100");
    setTopupBusy(true);
    const ok = await loadRazorpay();
    if (!ok) { setTopupBusy(false); return toast.error("Failed to load payment SDK"); }
    try {
      const res = await fetch(`${API}/api/brand/sample-credits/topup/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_inr: Number(topupAmt) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Top-up init failed");
      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount_paise,
        currency: data.currency,
        order_id: data.razorpay_order_id,
        name: "Locofast Brand — Sample Credits",
        description: `Add ${data.amount_inr} sample credits`,
        prefill: { email: user.email, name: user.name },
        theme: { color: "#d97706" },
        handler: async (response) => {
          try {
            const v = await fetch(`${API}/api/brand/sample-credits/topup/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(response),
            });
            const vd = await v.json();
            if (!v.ok) throw new Error(vd.detail || "Verification failed");
            toast.success(vd.message);
            load();
          } catch (err) { toast.error(err.message); }
        },
        modal: { ondismiss: () => setTopupBusy(false) },
      });
      rzp.open();
    } catch (err) {
      toast.error(err.message);
    }
    setTopupBusy(false);
  };

  if (loading || !summary) {
    return (
      <BrandLayout>
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
      </BrandLayout>
    );
  }

  const c = summary.credit;
  const s = summary.sample_credits;
  const creditUtilPct = c.total_allocated > 0 ? Math.min(100, (c.total_utilized / c.total_allocated) * 100) : 0;
  const sampleUtilPct = s.total > 0 ? Math.min(100, (s.used / s.total) * 100) : 0;

  return (
    <BrandLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Credit & Sample Accounts</h1>
        <p className="text-sm text-gray-500 mt-1">Two separate balances — one for bulk orders (money), one for sample orders (quota)</p>
      </div>

      {/* === TWO BIG TILES — visually distinct, clearly labelled === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">

        {/* ─── Credit Limit tile (emerald, money/bulk orders) ─── */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-6 shadow-sm" data-testid="brand-credit-limit-tile">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-emerald-100 text-xs uppercase tracking-wide font-semibold">
              <Wallet size={13} /> Credit Limit
            </div>
            <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">For bulk orders</span>
          </div>
          <div className="mt-2">
            <div className="text-4xl font-bold tracking-tight" data-testid="brand-credit-limit-lacs">
              {fmtLacs(c.available)}
            </div>
            <div className="text-sm text-emerald-100 mt-1" data-testid="brand-credit-limit-inr">
              Available · {fmtINR(c.available)}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between text-xs text-emerald-100">
              <span>Utilised</span>
              <span className="font-medium text-white">{fmtINR(c.total_utilized)} of {fmtINR(c.total_allocated)}</span>
            </div>
            <div className="mt-1.5 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-white/80 rounded-full" style={{ width: `${creditUtilPct}%` }} />
            </div>
          </div>
          <p className="text-[11px] text-emerald-100/80 mt-3 leading-relaxed flex items-start gap-1">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            This is real rupee credit from your embedded lenders (Stride / Muthoot / Mintifi). Used FIFO when you place bulk orders.
          </p>
        </div>

        {/* ─── Sample Credits tile (amber, count/sample orders) ─── */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-6 shadow-sm" data-testid="brand-sample-credits-tile">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-amber-50 text-xs uppercase tracking-wide font-semibold">
              <Beaker size={13} /> Sample Credits
            </div>
            <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">For sample orders only</span>
          </div>
          <div className="mt-2">
            <div className="text-4xl font-bold tracking-tight" data-testid="brand-sample-available">
              {fmtCount(s.available)}
            </div>
            <div className="text-sm text-amber-50 mt-1">sample credits available</div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between text-xs text-amber-50">
              <span>Utilised</span>
              <span className="font-medium text-white">{fmtCount(s.used)} of {fmtCount(s.total)}</span>
            </div>
            <div className="mt-1.5 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-white/80 rounded-full" style={{ width: `${sampleUtilPct}%` }} />
            </div>
          </div>
          <p className="text-[11px] text-amber-50/90 mt-3 leading-relaxed flex items-start gap-1">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            ₹1 = 1 sample credit. Drawn down only when you book fabric samples. Top up anytime below.
          </p>
        </div>
      </div>

      {/* === Credit Lines breakdown === */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8" data-testid="brand-credit-lines-table">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Credit Lines</h3>
            <p className="text-xs text-gray-500">Orders debit FIFO — oldest line used fully before moving to the next</p>
          </div>
          <span className="text-xs text-gray-500">{c.lines.length} active</span>
        </div>
        {c.lines.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No credit lines yet. Your Locofast RM will upload soon.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Lender</th>
                <th className="px-4 py-2 text-right">Allocated</th>
                <th className="px-4 py-2 text-right">Utilised</th>
                <th className="px-4 py-2 text-right">Available</th>
                <th className="px-4 py-2 text-left">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {c.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs">
                      <Building2 size={10} /> {l.lender_name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{fmtINR(l.amount_inr)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{fmtINR(l.utilized_inr)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtINR(l.amount_inr - l.utilized_inr)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* === Self-serve sample top-up === */}
      <div className="bg-white border border-amber-200 rounded-xl p-5 mb-10" data-testid="brand-topup-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Plus size={14} /> Add sample credits
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">₹1 = 1 credit · Pay via Razorpay · Credits added instantly on payment confirmation</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-gray-300 rounded-lg">
              <span className="pl-3 pr-1 text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min={100}
                step={100}
                value={topupAmt}
                onChange={(e) => setTopupAmt(e.target.value)}
                className="w-28 py-2 pr-3 outline-none text-sm"
                data-testid="brand-topup-amount"
              />
            </div>
            <button
              onClick={topup}
              disabled={topupBusy}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              data-testid="brand-topup-submit"
            >
              {topupBusy ? "..." : "Pay & add"}
            </button>
          </div>
        </div>
      </div>

      {/* === Ledger === */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="brand-ledger">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
        </div>
        {ledger.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Event</th>
                <th className="px-4 py-2 text-left">Detail</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ledger.map((e) => {
                const isSample = e.type.startsWith("sample");
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.type === "credit_allocated" ? "bg-emerald-100 text-emerald-700" :
                        e.type === "debit_order" ? "bg-red-50 text-red-700" :
                        e.type === "sample_credit_added" ? "bg-amber-100 text-amber-700" :
                        e.type === "sample_credit_used" ? "bg-orange-50 text-orange-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {e.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {e.lender_name && <>via <strong>{e.lender_name}</strong> · </>}
                      {e.order_id && <>order <span className="font-mono">{String(e.order_id).slice(0, 8)}</span></>}
                      {e.debits && <span> · FIFO: {e.debits.map(d => `${d.lender_name} ₹${d.amount}`).join(" + ")}</span>}
                      {e.note && !e.lender_name && !e.order_id && e.note}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {["credit_allocated", "sample_credit_added"].includes(e.type)
                        ? <span className="text-emerald-700">+{isSample ? `${fmtCount(e.amount)} credits` : fmtINR(e.amount)}</span>
                        : <span className="text-red-600">-{isSample ? `${fmtCount(e.amount)} credits` : fmtINR(e.amount)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </BrandLayout>
  );
};

export default BrandAccount;
