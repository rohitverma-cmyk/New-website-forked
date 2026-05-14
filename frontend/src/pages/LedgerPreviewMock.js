/**
 * LedgerPreviewMock — Static design preview of the unified Credit & Ledger
 * UI that will replace both the standard "/account" credit card and the
 * enterprise "/enterprise/ledger" view. NOT a production page; used only
 * to align with stakeholders before backend schema lands.
 *
 * Route: /ledger-preview (gated by env if needed)
 */
import React from "react";
import { ChevronRight, Download, Filter, Search, IndianRupee, AlertTriangle, CheckCircle2, Clock, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const MOCK = {
  client: "E-Future Apparel Pvt Ltd",
  gst: "07AIKPY4565A1Z0",
  totals: { limit: 4500000, utilized: 2842371, available: 1657629, overdue: 444000 },
  lenders: [
    { name: "Indifi", limit: 2500000, utilized: 1842371, available: 657629, period: 90 },
    { name: "Muthoot", limit: 1000000, utilized: 600000, available: 400000, period: 60 },
    { name: "Mintifi", limit: 500000, utilized: 200000, available: 300000, period: 90 },
    { name: "Stride", limit: 500000, utilized: 200000, available: 300000, period: 30 },
  ],
  disbursements: [
    { date: "2026-02-19", inv: "LF/25-26/462", order: "LF/ORD/042", lender: "Indifi", amount: 498036, advance: 54036, disbursed: 444000, repaid: 0, pending: 444000, due: "2026-05-20", status: "Outstanding" },
    { date: "2026-01-17", inv: "LFU/25-26/121", order: "LF/ORD/038", lender: "Indifi", amount: 528696, advance: 100000, disbursed: 428696, repaid: 428696, pending: 0, due: "2026-04-17", status: "Repaid" },
    { date: "2026-01-05", inv: "LF/25-26/391", order: "LF/ORD/035", lender: "Muthoot", amount: 461352, advance: 90000, disbursed: 371352, repaid: 371352, pending: 0, due: "2026-04-05", status: "Repaid" },
    { date: "2025-12-09", inv: "LF/25-26/365", order: "LF/ORD/031", lender: "Indifi", amount: 464058, advance: 80000, disbursed: 384058, repaid: 384058, pending: 0, due: "2026-03-10", status: "Repaid" },
    { date: "2025-11-28", inv: "LF/25-26/342", order: "LF/ORD/028", lender: "Indifi", amount: 1398315, advance: 200000, disbursed: 1198315, repaid: 1198315, pending: 0, due: "2026-02-26", status: "Repaid" },
  ],
  payments: [
    { date: "2026-02-15", mode: "Razorpay", ref: "pay_NxK8a91...", amount: 250000, against: "LF/25-26/462", lender: "Indifi", source: "Auto-synced from PG" },
    { date: "2026-02-10", mode: "NEFT", ref: "HDFC0000123-UTR4423891", amount: 428696, against: "LFU/25-26/121", lender: "Indifi", source: "Manual sheet upload" },
    { date: "2026-02-01", mode: "RTGS", ref: "ICIC0001234-UTR9981023", amount: 371352, against: "LF/25-26/391", lender: "Muthoot", source: "Manual sheet upload" },
    { date: "2026-01-15", mode: "Razorpay", ref: "pay_MqL2x33...", amount: 384058, against: "LF/25-26/365", lender: "Indifi", source: "Auto-synced from PG" },
  ],
  adjustments: [
    { date: "2026-02-12", type: "Credit Note", ref: "CN/25-26/018", amount: 54036, against: "LF/25-26/462", reason: "Short shipment — 60m undelivered", by: "sandeep.kumar@locofast.com" },
    { date: "2026-01-22", type: "Debit Note", ref: "DN/25-26/005", amount: 12500, against: "LF/25-26/391", reason: "Late dispatch penalty waived back", by: "sandeep.kumar@locofast.com" },
    { date: "2025-12-30", type: "Other", ref: "ADJ/25-26/002", amount: -5000, against: "On-account", reason: "Rate diff settlement", by: "sandeep.kumar@locofast.com" },
  ],
};

const StatCard = ({ label, value, tone = "neutral", sub }) => {
  const tones = {
    neutral: "bg-white",
    primary: "bg-indigo-50",
    success: "bg-emerald-50",
    danger: "bg-rose-50",
  };
  const valueTones = {
    neutral: "text-slate-900",
    primary: "text-indigo-700",
    success: "text-emerald-700",
    danger: "text-rose-700",
  };
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
    "Partially Repaid": { icon: Clock, klass: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const { icon: Icon, klass } = map[status] || map.Outstanding;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${klass}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
};

export default function LedgerPreviewMock() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Credit & Ledger · UI Preview Mock</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{MOCK.client}</h1>
            <div className="mt-1 text-sm text-slate-600">GSTIN: <span className="font-mono">{MOCK.gst}</span> · 4 active lenders · Credit period 30–90 days</div>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download Statement
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Make Repayment <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Credit Limit" value={inr(MOCK.totals.limit)} sub={`Across ${MOCK.lenders.length} lenders`} tone="primary" />
          <StatCard label="Utilized" value={inr(MOCK.totals.utilized)} sub={`${Math.round(MOCK.totals.utilized / MOCK.totals.limit * 100)}% of limit`} />
          <StatCard label="Available to Draw" value={inr(MOCK.totals.available)} tone="success" />
          <StatCard label="Overdue" value={inr(MOCK.totals.overdue)} sub="1 invoice nearing due" tone="danger" />
        </div>

        {/* Lender Breakdown */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Lenders & Limits</h2>
            <p className="text-xs text-slate-500">Allocated credit per lender with current utilisation</p>
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
                {MOCK.lenders.map((l) => {
                  const pct = Math.round((l.utilized / l.limit) * 100);
                  return (
                    <tr key={l.name} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{l.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{inr(l.limit)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{inr(l.utilized)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{inr(l.available)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{l.period}d</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
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

        {/* Disbursements / Invoices */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Disbursements & Invoices</h2>
              <p className="text-xs text-slate-500">Every credit-funded invoice with repayment status</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input placeholder="Invoice / Order ID" className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><Filter className="h-4 w-4" />Filter</button>
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
                {MOCK.disbursements.map((d) => (
                  <tr key={d.inv} className="hover:bg-slate-50">
                    <td className="px-5 py-3 tabular-nums text-slate-700">{d.date}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-900">{d.inv}</td>
                    <td className="px-5 py-3 font-mono text-xs text-indigo-700 hover:underline">{d.order}</td>
                    <td className="px-5 py-3 text-slate-700">{d.lender}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{inr(d.amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">{inr(d.advance)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{inr(d.disbursed)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{inr(d.repaid)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${d.pending > 0 ? "text-rose-700" : "text-slate-400"}`}>{inr(d.pending)}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{d.due}</td>
                    <td className="px-5 py-3"><StatusPill status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments Received */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Payments & Repayments</h2>
              <p className="text-xs text-slate-500">Razorpay auto-synced · NEFT / RTGS / Cash via daily sheet upload</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Auto-synced</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-500" /> Manual upload</span>
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
                  <th className="px-5 py-3 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK.payments.map((p) => (
                  <tr key={p.ref} className="hover:bg-slate-50">
                    <td className="px-5 py-3 tabular-nums text-slate-700">{p.date}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {p.mode === "Razorpay" ? <ArrowDownLeft className="h-3 w-3 text-emerald-600" /> : <ArrowUpRight className="h-3 w-3 text-blue-600" />}
                        {p.mode}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.ref}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{inr(p.amount)}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.against}</td>
                    <td className="px-5 py-3 text-slate-700">{p.lender}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manual Adjustments */}
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/30">
          <div className="flex items-center justify-between border-b border-amber-100 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900">
                Manual Adjustments
                <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">OTP-gated · Sandeep only</span>
              </h2>
              <p className="text-xs text-amber-800/70">Credit notes, debit notes & other ledger corrections. Restricted to <span className="font-mono">sandeep.kumar@locofast.com</span> via OTP login.</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
              + Add Adjustment
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-100/40 text-xs uppercase tracking-wider text-amber-900/80">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Reference No</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-left font-medium">Against</th>
                  <th className="px-5 py-3 text-left font-medium">Reason</th>
                  <th className="px-5 py-3 text-left font-medium">Posted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {MOCK.adjustments.map((a) => {
                  const typeStyle = {
                    "Credit Note": "bg-emerald-100 text-emerald-800",
                    "Debit Note": "bg-rose-100 text-rose-800",
                    "Other": "bg-slate-200 text-slate-800",
                  }[a.type];
                  return (
                    <tr key={a.ref} className="hover:bg-amber-50">
                      <td className="px-5 py-3 tabular-nums text-slate-700">{a.date}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle}`}>{a.type}</span></td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-900">{a.ref}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${a.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{a.amount >= 0 ? "+" : ""}{inr(a.amount)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{a.against}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{a.reason}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{a.by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sheet Specs */}
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-indigo-700" />
              <h3 className="text-base font-bold text-indigo-900">Sheet 1 · Credit Disbursements</h3>
            </div>
            <p className="mb-3 text-xs text-indigo-800/80">Daily / weekly upload. Idempotent on <code className="rounded bg-white px-1">Invoice No</code> — re-uploading updates, never duplicates.</p>
            <ol className="space-y-1 text-xs text-slate-700">
              {[
                "Client Name",
                "GSTIN (15-char) — required",
                "LFB Customer ID — optional",
                "Lender — required (Indifi / Muthoot / Mintifi / Stride / Locofast)",
                "Credit Limit (₹) — per lender row",
                "Credit Period (days) — 30 / 60 / 90",
                "Disbursement Date (YYYY-MM-DD)",
                "Invoice No — required, UNIQUE",
                "Order ID (LF/ORD/XXX) — optional link",
                "Invoice Date",
                "Invoice Amount (₹)",
                "Client Advance (₹)",
                "Credit Note (₹)",
                "Disbursed Amount (₹)",
                "Due Date (YYYY-MM-DD)",
                "Amount Repaid (₹)",
                "Notes — free text",
              ].map((c, i) => (
                <li key={c} className="flex gap-2"><span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{i + 1}.</span>{c}</li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-emerald-700" />
              <h3 className="text-base font-bold text-emerald-900">Sheet 2 · NEFT / RTGS Payments</h3>
            </div>
            <p className="mb-3 text-xs text-emerald-800/80">Use only for offline repayments. Razorpay payments auto-sync via webhook — no manual entry needed.</p>
            <ol className="space-y-1 text-xs text-slate-700">
              {[
                "Payment Date (YYYY-MM-DD)",
                "GSTIN — required",
                "Client Name",
                "Mode — NEFT / RTGS / IMPS / Cheque / Cash / UPI",
                "Bank Reference / UTR No — required, UNIQUE",
                "Amount (₹)",
                "Against Invoice No — optional (else credited 'on account')",
                "Against Order ID (LF/ORD/XXX) — optional",
                "Lender — optional (Locofast inferred if blank)",
                "Payer Bank Name",
                "Notes — free text",
              ].map((c, i) => (
                <li key={c} className="flex gap-2"><span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{i + 1}.</span>{c}</li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
              <h3 className="text-base font-bold text-amber-900">Form 3 · Manual Adjustment</h3>
            </div>
            <p className="mb-3 text-xs text-amber-800/80">OTP-only entry. Auth gated to <code className="rounded bg-white px-1">sandeep.kumar@locofast.com</code>. Each post creates a signed audit row.</p>
            <ol className="space-y-1 text-xs text-slate-700">
              {[
                "Date (auto, server time)",
                "GSTIN — required",
                "Type — Credit Note / Debit Note / Other",
                "Reference No — required, UNIQUE (e.g. CN/25-26/018)",
                "Amount (₹) — signed (CN = +, DN = −)",
                "Against Invoice No — optional",
                "Against Order ID — optional",
                "Lender — optional",
                "Reason — required, free text",
                "Attachment URL — optional (Cloudinary)",
                "Posted By — auto-stamped from OTP session",
              ].map((c, i) => (
                <li key={c} className="flex gap-2"><span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{i + 1}.</span>{c}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <div className="mb-2 font-semibold text-slate-900">How the data flows</div>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Razorpay PG payments</b> → auto-recorded on payment-verify webhook (already live). No sheet needed.</li>
            <li><b>NEFT / RTGS / Cheque / Cash</b> → finance fills Sheet 2 daily → polled or manually uploaded → posts to `credit_payments` table.</li>
            <li><b>Credit Disbursements</b> → finance fills Sheet 1 on every new disbursement → posts to `credit_disbursements` table. Lender limits auto-recompute (sanctioned − sum(disbursed) + sum(repaid)).</li>
            <li><b>Manual Adjustments (CN/DN/Other)</b> → only <span className="font-mono">sandeep.kumar@locofast.com</span> can post via OTP-gated form → posts to `credit_adjustments` table with signed audit trail.</li>
            <li><b>Customer view</b> (this page) → identical UX for standard + enterprise users. Pulls live from all four streams.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
