import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Loader2, ArrowLeft, FileText, Receipt, TrendingDown, TrendingUp,
  Plus, Trash2, ExternalLink, Building2, Wallet, X, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import api from "../../lib/api";
import { fmtINR } from "../../lib/inr";
import { useConfirm } from "../../components/useConfirm";
import FileUploadInput from "../../components/admin/FileUploadInput";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "invoices", label: "Invoices" },
  { id: "credit_notes", label: "Credit Notes" },
  { id: "debit_notes", label: "Debit Notes" },
  { id: "payments", label: "Payments" },
  { id: "timeline", label: "Timeline" },
];
const CN_REASONS = [
  { v: "short_delivery", l: "Short delivery" },
  { v: "defective", l: "Defective goods" },
  { v: "return", l: "Return" },
  { v: "quality_issue", l: "Quality issue" },
  { v: "discount", l: "Discount adjustment" },
  { v: "other", l: "Other" },
];
const DN_REASONS = [
  { v: "late_payment", l: "Late payment fee" },
  { v: "additional_logistics", l: "Additional logistics" },
  { v: "tax_correction", l: "Tax correction" },
  { v: "other", l: "Other" },
];
const PAYMENT_MODES = ["NEFT", "RTGS", "UPI", "CHEQUE", "CASH", "OTHER"];

// ─────────────────────────────────────────────────  SUMMARY CARD
const SummaryCard = ({ label, value, tone = "gray", icon: Icon, hint }) => (
  <div className={`rounded-xl p-4 border ${
    tone === "green" ? "bg-emerald-50 border-emerald-200" :
    tone === "red" ? "bg-red-50 border-red-200" :
    tone === "amber" ? "bg-amber-50 border-amber-200" :
    tone === "blue" ? "bg-blue-50 border-blue-200" :
    "bg-gray-50 border-gray-200"
  }`}>
    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-600">
      {Icon && <Icon size={12} />} {label}
    </div>
    <p className={`text-2xl font-bold mt-1 ${
      tone === "green" ? "text-emerald-700" :
      tone === "red" ? "text-red-700" :
      tone === "amber" ? "text-amber-700" :
      tone === "blue" ? "text-blue-700" :
      "text-gray-900"
    }`}>{value}</p>
    {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
  </div>
);

// ─────────────────────────────────────────────────  INVOICE TAB
const InvoicesTab = ({ brandId, data, reload }) => {
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ invoice_number: "", order_id: "", invoice_date: "", due_date: "", subtotal: 0, gst: 0, other_charges: 0, amount: 0, credit_period_days: 30, file_url: "", eway_bill_number: "", eway_bill_url: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.invoice_number.trim()) return toast.error("Invoice number required");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Amount must be > 0");
    setBusy(true);
    try {
      await api.post(`/admin/brands/${brandId}/invoices`, { ...form, amount: Number(form.amount), subtotal: Number(form.subtotal), gst: Number(form.gst), other_charges: Number(form.other_charges), credit_period_days: Number(form.credit_period_days) });
      toast.success("Invoice added");
      setShowAdd(false);
      setForm({ invoice_number: "", order_id: "", invoice_date: "", due_date: "", subtotal: 0, gst: 0, other_charges: 0, amount: 0, credit_period_days: 30, file_url: "", eway_bill_number: "", eway_bill_url: "", notes: "" });
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const del = async (inv) => {
    if (!(await confirm({ title: "Delete invoice?", message: `Invoice ${inv.invoice_number} will be removed. Linked payments must be cancelled first.`, tone: "danger", confirmText: "Delete" }))) return;
    try { await api.delete(`/admin/brands/${brandId}/invoices/${inv.id}`); toast.success("Deleted"); reload(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="invoices-tab">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">{data.invoices.length} invoice{data.invoices.length === 1 ? "" : "s"} · Outstanding {fmtINR(data.summary.outstanding)}</p>
        <button onClick={() => setShowAdd((s) => !s)} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5" data-testid="add-invoice-btn">
          <Plus size={12} /> {showAdd ? "Cancel" : "Add invoice"}
        </button>
      </div>
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Invoice Number *" v={form.invoice_number} on={(x) => setForm({ ...form, invoice_number: x })} testid="inv-number" />
          <Field label="Linked Order ID" v={form.order_id} on={(x) => setForm({ ...form, order_id: x })} testid="inv-order" />
          <Field label="Invoice Date" type="date" v={form.invoice_date} on={(x) => setForm({ ...form, invoice_date: x })} />
          <Field label="Due Date" type="date" v={form.due_date} on={(x) => setForm({ ...form, due_date: x })} testid="inv-due" />
          <Field label="Credit Period (days)" type="number" v={form.credit_period_days} on={(x) => setForm({ ...form, credit_period_days: x })} />
          <Field label="Subtotal (₹)" type="number" v={form.subtotal} on={(x) => setForm({ ...form, subtotal: x })} />
          <Field label="GST (₹)" type="number" v={form.gst} on={(x) => setForm({ ...form, gst: x })} />
          <Field label="Other Charges (₹)" type="number" v={form.other_charges} on={(x) => setForm({ ...form, other_charges: x })} />
          <Field label="Total Amount (₹) *" type="number" v={form.amount} on={(x) => setForm({ ...form, amount: x })} testid="inv-amount" />
          <div className="sm:col-span-3">
            <FileUploadInput
              label="Invoice PDF (drag-drop or click)"
              value={form.file_url}
              onChange={(url) => setForm({ ...form, file_url: url })}
              folder="uploads/financials/invoices"
              testid="inv-file-upload"
            />
          </div>
          <Field label="E-way Bill Number" v={form.eway_bill_number} on={(x) => setForm({ ...form, eway_bill_number: x })} testid="inv-eway-num" />
          <div className="sm:col-span-2">
            <FileUploadInput
              label="E-way Bill PDF"
              value={form.eway_bill_url}
              onChange={(url) => setForm({ ...form, eway_bill_url: url })}
              folder="uploads/financials/eway"
              testid="inv-eway-upload"
            />
          </div>
          <Field label="Notes" v={form.notes} on={(x) => setForm({ ...form, notes: x })} colSpan={3} />
          <div className="sm:col-span-3 flex justify-end">
            <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg" data-testid="inv-save">
              {busy ? "Saving…" : "Save invoice"}
            </button>
          </div>
        </div>
      )}
      {data.invoices.length === 0 ? <Empty msg="No invoices yet" /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Invoice #</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.invoices.map((inv) => (
                <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                  <td className="px-3 py-2 font-medium font-mono">{inv.invoice_number}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{inv.invoice_date || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{inv.due_date || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtINR(inv.amount)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtINR(inv.amount_paid || 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtINR((inv.amount || 0) - (inv.amount_paid || 0))}</td>
                  <td className="px-3 py-2"><StatusPill status={inv.status} /></td>
                  <td className="px-3 py-2 text-right">
                    {inv.file_url && <a href={inv.file_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline mr-2" title="Invoice PDF" data-testid={`inv-file-${inv.id}`}><FileText size={12} className="inline" /></a>}
                    {inv.eway_bill_url && <a href={inv.eway_bill_url} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline mr-2" title={`E-way Bill ${inv.eway_bill_number || ''}`} data-testid={`inv-eway-${inv.id}`}><Receipt size={12} className="inline" /></a>}
                    <button onClick={() => del(inv)} className="text-red-500 hover:bg-red-50 p-1 rounded" data-testid={`del-inv-${inv.id}`}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────  CN/DN TAB (shared)
const NoteTab = ({ brandId, data, reload, type }) => {
  const isCn = type === "credit";
  const list = isCn ? data.credit_notes : data.debit_notes;
  const reasons = isCn ? CN_REASONS : DN_REASONS;
  const numField = isCn ? "cn_number" : "dn_number";
  const dateField = isCn ? "cn_date" : "dn_date";
  const endpoint = isCn ? "credit-notes" : "debit-notes";
  const Icon = isCn ? TrendingDown : TrendingUp;
  const tone = isCn ? "blue" : "amber";
  const total = isCn ? data.summary.credit_notes_total : data.summary.debit_notes_total;
  const confirm = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ number: "", invoice_id: "", date: "", amount: 0, reason: reasons[0].v, notes: "", file_url: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.number.trim() || !form.amount || Number(form.amount) <= 0) return toast.error("Number + amount required");
    setBusy(true);
    try {
      const payload = { [numField]: form.number, invoice_id: form.invoice_id || null, [dateField]: form.date || null, amount: Number(form.amount), reason: form.reason, notes: form.notes, file_url: form.file_url };
      await api.post(`/admin/brands/${brandId}/${endpoint}`, payload);
      toast.success("Saved");
      setShowAdd(false);
      setForm({ number: "", invoice_id: "", date: "", amount: 0, reason: reasons[0].v, notes: "", file_url: "" });
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const del = async (n) => {
    if (!(await confirm({ title: `Delete ${isCn ? "credit" : "debit"} note?`, message: `${n[numField]} will be removed.`, tone: "danger", confirmText: "Delete" }))) return;
    try { await api.delete(`/admin/brands/${brandId}/${endpoint}/${n.id}`); toast.success("Deleted"); reload(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid={`${type}-notes-tab`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">{list.length} note{list.length === 1 ? "" : "s"} · Total {fmtINR(total)}</p>
        <button onClick={() => setShowAdd((s) => !s)} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5" data-testid={`add-${type}-note-btn`}>
          <Plus size={12} /> {showAdd ? "Cancel" : `Add ${isCn ? "credit" : "debit"} note`}
        </button>
      </div>
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={`${isCn ? "CN" : "DN"} Number *`} v={form.number} on={(x) => setForm({ ...form, number: x })} testid={`${type}-num`} />
          <Field label="Linked Invoice ID" v={form.invoice_id} on={(x) => setForm({ ...form, invoice_id: x })} />
          <Field label="Date" type="date" v={form.date} on={(x) => setForm({ ...form, date: x })} />
          <Field label="Amount (₹) *" type="number" v={form.amount} on={(x) => setForm({ ...form, amount: x })} testid={`${type}-amt`} />
          <label className="block">
            <span className="text-xs text-gray-600 mb-1 block">Reason *</span>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid={`${type}-reason`}>
              {reasons.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <div className="sm:col-span-3">
            <FileUploadInput
              label="Note PDF"
              value={form.file_url}
              onChange={(url) => setForm({ ...form, file_url: url })}
              folder={`uploads/financials/${isCn ? "cn" : "dn"}`}
              testid={`${type}-file-upload`}
            />
          </div>
          <Field label="Notes / details" v={form.notes} on={(x) => setForm({ ...form, notes: x })} colSpan={3} testid={`${type}-notes`} />
          <div className="sm:col-span-3 flex justify-end">
            <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg" data-testid={`${type}-save`}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {list.length === 0 ? <Empty msg={`No ${isCn ? "credit" : "debit"} notes yet`} /> : (
        <div className="space-y-2">
          {list.map((n) => (
            <div key={n.id} className={`bg-white border rounded-xl p-3 flex items-start justify-between gap-3 border-${tone === "blue" ? "blue" : "amber"}-200`} data-testid={`${type}-note-${n.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon size={14} className={tone === "blue" ? "text-blue-600" : "text-amber-600"} />
                  <span className="font-mono text-sm font-medium">{n[numField]}</span>
                  <span className="text-[10px] uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{n.reason?.replaceAll("_", " ")}</span>
                  <span className="text-xs text-gray-500">{n[dateField]}</span>
                  {n.invoice_id && <span className="text-[10px] text-gray-500">↳ inv {n.invoice_id.slice(0, 8)}…</span>}
                </div>
                {n.notes && <p className="text-xs text-gray-600 mt-1">{n.notes}</p>}
              </div>
              <div className="text-right">
                <p className={`font-semibold ${tone === "blue" ? "text-blue-700" : "text-amber-700"}`}>{fmtINR(n.amount)}</p>
                {n.file_url && <a href={n.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline"><ExternalLink size={10} className="inline" /></a>}
                {isCn && (
                  <button onClick={() => del(n)} className="text-xs text-red-500 ml-2" data-testid={`del-${type}-note-${n.id}`}><Trash2 size={11} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────  PAYMENTS TAB
const PaymentsTab = ({ brandId, data, reload }) => {
  const confirm = useConfirm();
  const unpaidInvoices = data.invoices.filter((i) => (i.amount || 0) - (i.amount_paid || 0) > 0.01);
  const [showAdd, setShowAdd] = useState(false);
  const initial = { payment_date: "", amount: 0, mode: "NEFT", reference: "", allocations: {}, notes: "", file_url: "" };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const totalAlloc = Object.values(form.allocations).reduce((s, a) => s + (Number(a) || 0), 0);
  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Amount must be > 0");
    if (totalAlloc - 0.01 > Number(form.amount)) return toast.error(`Allocations ₹${totalAlloc.toFixed(2)} exceed payment ₹${Number(form.amount).toFixed(2)}`);
    const allocations = Object.entries(form.allocations).filter(([_, a]) => Number(a) > 0).map(([invoice_id, amount]) => ({ invoice_id, amount: Number(amount) }));
    setBusy(true);
    try {
      await api.post(`/admin/brands/${brandId}/payments`, {
        payment_date: form.payment_date || null, amount: Number(form.amount), mode: form.mode,
        reference: form.reference, allocations, notes: form.notes, file_url: form.file_url,
      });
      toast.success("Payment recorded");
      setShowAdd(false); setForm(initial); reload();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const del = async (p) => {
    if (!(await confirm({ title: "Cancel payment?", message: `${fmtINR(p.amount)} payment will be reversed and invoice balances restored.`, tone: "danger", confirmText: "Cancel payment" }))) return;
    try { await api.delete(`/admin/brands/${brandId}/payments/${p.id}`); toast.success("Reversed"); reload(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="payments-tab">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">{data.payments.length} payment{data.payments.length === 1 ? "" : "s"} · {fmtINR(data.summary.payments_received)} received</p>
        <button onClick={() => setShowAdd((s) => !s)} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5" data-testid="add-payment-btn">
          <Plus size={12} /> {showAdd ? "Cancel" : "Record payment"}
        </button>
      </div>
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Payment Date" type="date" v={form.payment_date} on={(x) => setForm({ ...form, payment_date: x })} />
            <Field label="Amount (₹) *" type="number" v={form.amount} on={(x) => setForm({ ...form, amount: x })} testid="pay-amount" />
            <label className="block">
              <span className="text-xs text-gray-600 mb-1 block">Mode *</span>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} data-testid="pay-mode">
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <Field label="Reference / UTR" v={form.reference} on={(x) => setForm({ ...form, reference: x })} testid="pay-ref" />
            <div className="sm:col-span-2">
              <FileUploadInput
                label="Receipt / Bank Slip PDF"
                value={form.file_url}
                onChange={(url) => setForm({ ...form, file_url: url })}
                folder="uploads/financials/payments"
                testid="pay-file-upload"
              />
            </div>
            <Field label="Notes" v={form.notes} on={(x) => setForm({ ...form, notes: x })} colSpan={3} />
          </div>
          {unpaidInvoices.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-2">Allocate to specific invoices ({fmtINR(totalAlloc)} of {fmtINR(form.amount || 0)} allocated)</p>
              <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                {unpaidInvoices.map((inv) => {
                  const balance = (inv.amount || 0) - (inv.amount_paid || 0);
                  return (
                    <div key={inv.id} className="p-2 flex items-center gap-2 text-xs" data-testid={`alloc-row-${inv.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono">{inv.invoice_number}</p>
                        <p className="text-gray-500">Balance {fmtINR(balance)}</p>
                      </div>
                      <input type="number" min={0} max={balance} step="0.01" placeholder="0" className="w-28 px-2 py-1 border border-gray-300 rounded text-right"
                        value={form.allocations[inv.id] || ""}
                        onChange={(e) => setForm({ ...form, allocations: { ...form.allocations, [inv.id]: e.target.value } })}
                        data-testid={`alloc-input-${inv.id}`} />
                      <button onClick={() => setForm({ ...form, allocations: { ...form.allocations, [inv.id]: balance } })} className="text-[10px] text-emerald-700 hover:underline">All</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end mt-3">
            <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg" data-testid="pay-save">
              {busy ? "Saving…" : "Save payment"}
            </button>
          </div>
        </div>
      )}
      {data.payments.length === 0 ? <Empty msg="No payments recorded yet" /> : (
        <div className="space-y-2">
          {data.payments.map((p) => (
            <div key={p.id} className="bg-white border border-emerald-200 rounded-xl p-3" data-testid={`payment-row-${p.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Wallet size={14} className="text-emerald-600" />
                    <span className="font-medium">{p.mode}</span>
                    {p.reference && <span className="text-xs text-gray-500 font-mono">{p.reference}</span>}
                    <span className="text-xs text-gray-500"><Calendar size={10} className="inline mr-0.5" />{p.payment_date}</span>
                  </div>
                  {p.allocations?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {p.allocations.map((a, i) => (
                        <li key={i} className="text-xs text-gray-600">↳ {fmtINR(a.amount)} → <span className="font-mono">{a.invoice_number}</span></li>
                      ))}
                    </ul>
                  )}
                  {p.unallocated > 0 && <p className="text-[11px] text-amber-700 mt-1">⚠ {fmtINR(p.unallocated)} unallocated (treat as advance)</p>}
                  {p.notes && <p className="text-xs text-gray-500 mt-1">{p.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-700">{fmtINR(p.amount)}</p>
                  <button onClick={() => del(p)} className="text-xs text-red-500 mt-1 inline-flex items-center gap-1" data-testid={`del-pay-${p.id}`}><Trash2 size={10} /> Reverse</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────  TIMELINE TAB
const TimelineTab = ({ data }) => {
  if (data.timeline.length === 0) return <Empty msg="No financial activity yet" />;
  return (
    <div className="space-y-2" data-testid="timeline-tab">
      {data.timeline.map((e, i) => (
        <div key={`${e.type}-${e.id}`} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start gap-3 text-sm" data-testid={`timeline-${i}`}>
          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
            e.type === "invoice" ? "bg-emerald-500" :
            e.type === "credit_note" ? "bg-blue-500" :
            e.type === "debit_note" ? "bg-amber-500" :
            "bg-purple-500"
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">{e.type.replace("_", " ")}</span>
              {e.number && <span className="font-mono text-xs">{e.number}</span>}
              {e.mode && <span className="text-xs">{e.mode}</span>}
              {e.reference && <span className="text-xs font-mono text-gray-500">{e.reference}</span>}
              {e.status && <StatusPill status={e.status} />}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{e.date}{e.due_date ? ` · due ${e.due_date}` : ""}{e.reason ? ` · ${e.reason.replaceAll("_", " ")}` : ""}</p>
            {e.notes && <p className="text-xs text-gray-600 mt-0.5">{e.notes}</p>}
          </div>
          <div className="text-right">
            <p className={`font-semibold ${e.type === "payment" || e.type === "credit_note" ? "text-emerald-700" : "text-gray-900"}`}>
              {e.type === "payment" || e.type === "credit_note" ? "+" : ""}{fmtINR(e.amount)}
            </p>
            {e.balance != null && e.balance > 0 && <p className="text-[10px] text-gray-500">bal {fmtINR(e.balance)}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────  Helpers
const Field = ({ label, type = "text", v, on, colSpan, testid }) => (
  <label className={`block ${colSpan ? `sm:col-span-${colSpan}` : ""}`}>
    <span className="text-xs text-gray-600 mb-1 block">{label}</span>
    <input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid={testid} />
  </label>
);
const Empty = ({ msg }) => <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">{msg}</div>;
const StatusPill = ({ status }) => {
  const c = {
    paid: "bg-emerald-100 text-emerald-700", partially_paid: "bg-amber-100 text-amber-700",
    unpaid: "bg-red-100 text-red-700", cancelled: "bg-gray-200 text-gray-600",
  }[status] || "bg-gray-100 text-gray-700";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c}`}>{(status || "").replaceAll("_", " ")}</span>;
};

// ─────────────────────────────────────────────────  MAIN
const AdminBrandFinancials = () => {
  const { brandId } = useParams();
  const [tab, setTab] = useState("summary");
  const [data, setData] = useState(null);
  const [brand, setBrand] = useState(null);

  const reload = async () => {
    try {
      const [fin, br] = await Promise.all([
        api.get(`/admin/brands/${brandId}/financials`),
        api.get(`/admin/brands/${brandId}`),
      ]);
      setData(fin.data);
      setBrand(br.data?.brand || null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load");
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [brandId]);

  if (!data) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></AdminLayout>;

  const s = data.summary;

  return (
    <AdminLayout>
      <Link to="/admin/brands" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-3"><ArrowLeft size={14} /> Back to brands</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><Building2 size={20} /> {brand?.name || "Brand"} — Financials</h1>
          <p className="text-sm text-gray-500 mt-1">Manage invoices, credit/debit notes, and payments. Brand-side users see this read-only.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6" data-testid="financials-summary">
        <SummaryCard label="Invoiced" value={fmtINR(s.invoiced_total)} icon={FileText} />
        <SummaryCard label="Payments Received" value={fmtINR(s.payments_received)} tone="green" icon={Wallet} />
        <SummaryCard label="Credit Notes" value={fmtINR(s.credit_notes_total)} tone="blue" icon={TrendingDown} />
        <SummaryCard label="Debit Notes" value={fmtINR(s.debit_notes_total)} tone="amber" icon={TrendingUp} />
        <SummaryCard label="Outstanding" value={fmtINR(s.outstanding)} tone={s.outstanding > 0 ? "red" : "green"} icon={Receipt} hint="Invoiced − Paid − CN + DN" />
      </div>

      <div className="border-b border-gray-200 mb-5">
        <div className="flex gap-1 overflow-x-auto" data-testid="financial-tabs">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id ? "text-emerald-700 border-emerald-600 bg-emerald-50/50" : "text-gray-500 hover:text-gray-700 border-transparent"
              }`} data-testid={`fin-tab-${t.id}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "summary" && <TimelineTab data={data} />}
      {tab === "invoices" && <InvoicesTab brandId={brandId} data={data} reload={reload} />}
      {tab === "credit_notes" && <NoteTab brandId={brandId} data={data} reload={reload} type="credit" />}
      {tab === "debit_notes" && <NoteTab brandId={brandId} data={data} reload={reload} type="debit" />}
      {tab === "payments" && <PaymentsTab brandId={brandId} data={data} reload={reload} />}
      {tab === "timeline" && <TimelineTab data={data} />}
    </AdminLayout>
  );
};

export default AdminBrandFinancials;
