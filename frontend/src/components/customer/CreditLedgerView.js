/**
 * CreditLedgerView — Unified credit + ledger panel used by:
 *   - Desktop  /account           (Credit & Ledger tab)
 *   - Mobile   /m/account         (Credit & Ledger tab)
 *   - Enterprise /enterprise/ledger (parity migration)
 *
 * Data: GET /api/credit-ledger/by-gstin/{gstin}
 * Falls back to the legacy `credit_wallets` row if the unified tables are
 * empty (so a fresh buyer with only a wallet still sees their limit).
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { ChevronRight, Download, Filter, Search, AlertTriangle, CheckCircle2, Clock, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const StatCard = ({ label, value, tone = "neutral", sub }) => {
  const tones = { neutral: "bg-white", primary: "bg-indigo-50", success: "bg-emerald-50", danger: "bg-rose-50" };
  const valueTones = { neutral: "text-slate-900", primary: "text-indigo-700", success: "text-emerald-700", danger: "text-rose-700" };
  return (
    <div className={`rounded-2xl border border-slate-200 ${tones[tone]} p-5`}>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueTones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
};

const StatusPill = ({ status }) => {
  const map = {
    Outstanding: { icon: Clock, klass: "bg-amber-50 text-amber-700 border-amber-200" },
    Repaid: { icon: CheckCircle2, klass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    Overdue: { icon: AlertTriangle, klass: "bg-rose-50 text-rose-700 border-rose-200" },
  };
  const { icon: Icon, klass } = map[status] || map.Outstanding;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${klass}`} data-testid={`ledger-status-${status}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
};

export default function CreditLedgerView({ gstin, clientName, dense = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!gstin || gstin.length !== 15) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    axios.get(`${API_URL}/api/credit-ledger/by-gstin/${gstin.toUpperCase()}`)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gstin]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500" data-testid="ledger-loading">Loading credit & ledger…</div>;
  if (!gstin || gstin.length !== 15) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900" data-testid="ledger-no-gst">
        Add and verify your <b>GSTIN</b> on the Profile tab to view your credit limits and ledger.
      </div>
    );
  }
  if (!data) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700" data-testid="ledger-error">Couldn't load ledger. Please refresh in a moment.</div>;

  const { totals, lenders = [], disbursements = [], payments = [], adjustments = [] } = data;
  const hasAny = lenders.length || disbursements.length || payments.length || adjustments.length;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600" data-testid="ledger-empty">
        <div className="mb-2 text-base font-semibold text-slate-900">No credit activity yet</div>
        Your ledger appears here once we record your first disbursement, payment, or credit limit allocation.
      </div>
    );
  }

  const fSearch = (s) => !search || (s || "").toLowerCase().includes(search.toLowerCase());
  const filteredDisb = disbursements.filter(d => fSearch(d.invoice_no) || fSearch(d.order_id));

  return (
    <div className="space-y-6" data-testid="credit-ledger-view">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Credit & Ledger</h2>
          <div className="mt-1 text-xs text-slate-500">
            GSTIN <span className="font-mono">{data.gst_number}</span>
            {(clientName || data.client_name) ? <> · {clientName || data.client_name}</> : null}
            {lenders.length ? <> · {lenders.length} lender{lenders.length > 1 ? "s" : ""}</> : null}
          </div>
        </div>
        <a
          href={`${API_URL}/api/credit-ledger/by-gstin/${data.gst_number}`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          data-testid="ledger-download-btn"
        >
          <Download className="h-4 w-4" /> Raw JSON
        </a>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Credit Limit" value={inr(totals.limit)} sub={lenders.length ? `Across ${lenders.length} lenders` : "—"} tone="primary" />
        <StatCard label="Utilized" value={inr(totals.utilized)} sub={totals.limit > 0 ? `${Math.round((totals.utilized / totals.limit) * 100)}% of limit` : ""} />
        <StatCard label="Available to Draw" value={inr(totals.available)} tone="success" />
        <StatCard label="Overdue" value={inr(totals.overdue)} sub={totals.overdue > 0 ? "Past due date" : "All caught up"} tone={totals.overdue > 0 ? "danger" : "neutral"} />
      </div>

      {/* Lenders */}
      {lenders.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-900">Lenders & Limits</h3>
            <p className="text-xs text-slate-500">Sanctioned credit per lender with current utilisation</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Lender</th>
                  <th className="px-5 py-3 text-right font-medium">Sanctioned</th>
                  <th className="px-5 py-3 text-right font-medium">Utilized</th>
                  <th className="px-5 py-3 text-right font-medium">Available</th>
                  <th className="px-5 py-3 text-right font-medium">Period</th>
                  <th className="px-5 py-3 text-left font-medium">Utilisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lenders.map((l) => {
                  const lim = Number(l.credit_limit || 0);
                  const util = Number(l.utilized || 0);
                  const pct = lim > 0 ? Math.round((util / lim) * 100) : 0;
                  return (
                    <tr key={l.lender} className="hover:bg-slate-50" data-testid={`ledger-lender-${l.lender}`}>
                      <td className="px-5 py-3 font-medium text-slate-900">{l.lender}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{inr(lim)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{inr(util)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{inr(l.available)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{l.credit_period_days || 30}d</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-600">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disbursements */}
      {disbursements.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Disbursements & Invoices</h3>
              <p className="text-xs text-slate-500">Every credit-funded invoice with repayment status</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input placeholder="Invoice / Order ID" value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" data-testid="ledger-search-input" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Disb. Date</th>
                  <th className="px-5 py-3 text-left font-medium">Invoice No</th>
                  <th className="px-5 py-3 text-left font-medium">Order ID</th>
                  <th className="px-5 py-3 text-left font-medium">Lender</th>
                  <th className="px-5 py-3 text-right font-medium">Inv Amount</th>
                  <th className="px-5 py-3 text-right font-medium">Advance</th>
                  <th className="px-5 py-3 text-right font-medium">Disbursed</th>
                  <th className="px-5 py-3 text-right font-medium">Repaid</th>
                  <th className="px-5 py-3 text-right font-medium">Pending</th>
                  <th className="px-5 py-3 text-left font-medium">Due Date</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDisb.map((d) => (
                  <tr key={d.invoice_no} className="hover:bg-slate-50" data-testid={`ledger-disbursement-${d.invoice_no}`}>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{d.disbursement_date || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-900">{d.invoice_no}</td>
                    <td className="px-5 py-3 font-mono text-xs text-indigo-700">{d.order_id || "—"}</td>
                    <td className="px-5 py-3 text-slate-700">{d.lender}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{inr(d.invoice_amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">{inr(d.client_advance)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{inr(d.disbursed_amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{inr(d.amount_repaid)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${d.pending_amount > 0 ? "text-rose-700" : "text-slate-400"}`}>{inr(d.pending_amount)}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{d.due_date || "—"}</td>
                    <td className="px-5 py-3"><StatusPill status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Payments & Repayments</h3>
              <p className="text-xs text-slate-500">Razorpay auto-synced · NEFT / RTGS / Cash via daily sheet</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Auto</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-500" /> Manual</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Mode</th>
                  <th className="px-5 py-3 text-left font-medium">Reference / UTR</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-left font-medium">Against Invoice</th>
                  <th className="px-5 py-3 text-left font-medium">Lender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.utr} className="hover:bg-slate-50" data-testid={`ledger-payment-${p.utr}`}>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{p.payment_date}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {p.mode === "Razorpay" ? <ArrowDownLeft className="h-3 w-3 text-emerald-600" /> : <ArrowUpRight className="h-3 w-3 text-blue-600" />}
                        {p.mode}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.utr}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{inr(p.amount)}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.against_invoice_no || "On-account"}</td>
                    <td className="px-5 py-3 text-slate-700">{p.lender || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustments */}
      {adjustments.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="border-b border-amber-100 px-5 py-4">
            <h3 className="text-base font-semibold text-amber-900">Manual Adjustments</h3>
            <p className="text-xs text-amber-800/70">Credit notes, debit notes & corrections posted by finance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-100/40 text-xs uppercase tracking-wider text-amber-900/80">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Reference</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-left font-medium">Against</th>
                  <th className="px-5 py-3 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {adjustments.map((a) => {
                  const typeStyle = { "Credit Note": "bg-emerald-100 text-emerald-800", "Debit Note": "bg-rose-100 text-rose-800", "Other": "bg-slate-200 text-slate-800" }[a.type];
                  return (
                    <tr key={a.reference_no} className="hover:bg-amber-50" data-testid={`ledger-adjustment-${a.reference_no}`}>
                      <td className="px-5 py-3 tabular-nums text-slate-700">{(a.created_at || "").slice(0, 10)}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle}`}>{a.type}</span></td>
                      <td className="px-5 py-3 font-mono text-xs">{a.reference_no}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${a.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{a.amount >= 0 ? "+" : ""}{inr(a.amount)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{a.against_invoice_no || "On-account"}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{a.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
