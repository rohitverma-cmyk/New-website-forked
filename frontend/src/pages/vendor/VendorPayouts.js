import { useEffect, useState, useMemo } from "react";
import { Loader2, IndianRupee, Clock, CheckCircle, FileText, AlertTriangle, RefreshCw, X, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import VendorLayout from "../../components/vendor/VendorLayout";
import VendorFileUpload from "../../components/vendor/VendorFileUpload";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL = {
  pending: { label: "Awaiting your invoice", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  uploaded: { label: "Invoice submitted — awaiting payout", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  rejected: { label: "Invoice rejected — please re-upload", tone: "bg-red-50 text-red-700 border-red-200" },
  paid: { label: "Paid", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const computeStage = (payout) => {
  if (payout.status === "paid") return "paid";
  const inv = payout.vendor_invoice_status || "not_uploaded";
  if (inv === "uploaded") return "uploaded";
  if (inv === "rejected") return "rejected";
  return "pending";
};

const VendorPayouts = () => {
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");

  const token = localStorage.getItem("vendor_token");

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/vendor/payouts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPayouts(data.payouts || []);
    } catch (e) {
      toast.error(e.message || "Failed to load payouts");
    }
    setLoading(false);
  };

  useEffect(() => { fetchPayouts(); /* eslint-disable-next-line */ }, []);

  const stats = useMemo(() => {
    const out = {
      pending: { count: 0, amount: 0 },
      uploaded: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
    };
    for (const p of payouts) {
      const s = computeStage(p);
      out[s].count += 1;
      out[s].amount += Number(p.net_payable || 0);
    }
    return out;
  }, [payouts]);

  const filtered = useMemo(() => {
    if (filter === "all") return payouts;
    return payouts.filter((p) => computeStage(p) === filter);
  }, [payouts, filter]);

  return (
    <VendorLayout>
      <div className="p-8" data-testid="vendor-payouts-page">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <IndianRupee size={22} className="text-emerald-600" />
              My Payouts
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Upload your tax invoice for each paid order. Locofast Accounts releases payment after verifying the invoice.
            </p>
          </div>
          <button
            onClick={fetchPayouts}
            className="flex items-center gap-2 text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            data-testid="vendor-payouts-refresh"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { key: "pending", label: "Invoice pending", icon: Clock, color: "amber", ...stats.pending },
            { key: "uploaded", label: "Awaiting payout", icon: FileText, color: "blue", ...stats.uploaded },
            { key: "rejected", label: "Rejected", icon: AlertTriangle, color: "red", ...stats.rejected },
            { key: "paid", label: "Paid", icon: CheckCircle, color: "emerald", ...stats.paid },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`text-left bg-white border-2 rounded-xl p-4 transition ${
                filter === t.key ? `border-${t.color}-500 shadow-sm` : "border-gray-200 hover:border-gray-300"
              }`}
              data-testid={`vendor-payouts-tile-${t.key}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wide text-${t.color}-600`}>
                  {t.label}
                </span>
                <t.icon size={14} className={`text-${t.color}-500`} />
              </div>
              <p className="mt-1.5 text-xl font-bold text-gray-900">{fmtINR(t.amount)}</p>
              <p className="text-[11px] text-gray-500">{t.count} order{t.count !== 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2">
          {["all", "pending", "uploaded", "rejected", "paid"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === s
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
              data-testid={`vendor-payouts-filter-${s}`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]?.label || s}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              {filter === "all"
                ? "No payouts yet — they appear here when a customer pays for one of your orders."
                : "No payouts in this view."}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Net you receive</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {filtered.map((p) => {
                  const stage = computeStage(p);
                  const meta = STATUS_LABEL[stage];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50" data-testid={`vendor-payouts-row-${p.id}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-blue-700">{p.order_number}</p>
                        <p className="text-[11px] text-gray-500">{(p.order_paid_at || p.created_at || "").slice(0, 10)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">{fmtINR(p.gross_subtotal)}</td>
                      <td className="px-4 py-3 text-right text-red-600">−{fmtINR(p.commission_total)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtINR(p.net_payable)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.tone}`}>
                          {meta.label}
                        </span>
                        {p.utr && stage === "paid" && (
                          <p className="text-[10px] text-gray-500 mt-0.5">UTR: {p.utr}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(p)}
                          className={`px-2.5 py-1 text-xs rounded border ${
                            stage === "pending" || stage === "rejected"
                              ? "text-white bg-emerald-600 border-emerald-600 hover:bg-emerald-700"
                              : "text-blue-700 border-blue-200 hover:bg-blue-50"
                          }`}
                          data-testid={`vendor-payouts-action-${p.id}`}
                        >
                          {stage === "pending" || stage === "rejected" ? "Upload invoice" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <VendorPayoutDetail
          payout={selected}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setPayouts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelected(updated);
          }}
        />
      )}
    </VendorLayout>
  );
};

const VendorPayoutDetail = ({ payout, onClose, onChanged }) => {
  const stage = computeStage(payout);
  const canUpload = stage === "pending" || stage === "rejected";
  const [invoiceNumber, setInvoiceNumber] = useState(payout.vendor_invoice_number || "");
  const [invoiceDate, setInvoiceDate] = useState(
    payout.vendor_invoice_date || new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(payout.vendor_invoice_amount ?? payout.net_payable ?? "");
  const [fileMeta, setFileMeta] = useState(
    payout.vendor_invoice_url
      ? { url: payout.vendor_invoice_url, filename: payout.vendor_invoice_filename || payout.vendor_invoice_url.split("/").pop() }
      : null
  );
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem("vendor_token");

  const submit = async () => {
    if (!fileMeta?.url) { toast.error("Please upload an invoice file first"); return; }
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/vendor/payouts/${payout.id}/upload-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          invoice_url: fileMeta.url,
          filename: fileMeta.filename || "",
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          amount: amount ? Number(amount) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const data = await res.json();
      toast.success("Invoice submitted. Locofast Accounts has been notified.");
      onChanged?.(data.payout);
    } catch (e) {
      toast.error(e.message || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
      data-testid="vendor-payout-detail"
    >
      <div className="bg-white rounded-xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Payout · {payout.order_number}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Net payable: {fmtINR(payout.net_payable)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(payout.items || []).map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{it.fabric_name}</p>
                      <p className="text-[11px] text-gray-500">{it.fabric_code}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{it.quantity}m</td>
                    <td className="px-3 py-2 text-right">₹{Number(it.rate).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">₹{Number(it.gross).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{Number(it.net).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Gross subtotal</span><span>{fmtINR(payout.gross_subtotal)}</span></div>
            <div className="flex justify-between text-red-700"><span>Locofast commission</span><span>−{fmtINR(payout.commission_total)}</span></div>
            {payout.advances_applied > 0 && (
              <div className="flex justify-between text-red-700">
                <span>Advances already received</span><span>−{fmtINR(payout.advances_applied)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-blue-200 pt-2 mt-2">
              <span>Raise invoice for</span>
              <span className="text-emerald-700">{fmtINR(payout.net_payable)}</span>
            </div>
          </div>

          {stage === "rejected" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-800 flex items-center gap-1">
                <AlertTriangle size={14} /> Previous invoice was rejected
              </p>
              <p className="text-xs text-red-700 mt-1">
                Reason: {payout.vendor_invoice_rejection_reason || "—"}
              </p>
              <p className="text-[11px] text-red-600 mt-1">
                Please correct and upload a fresh invoice below.
              </p>
            </div>
          )}

          {stage === "uploaded" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                <FileText size={14} /> Invoice submitted
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Submitted on {(payout.vendor_invoice_uploaded_at || "").slice(0, 19).replace("T", " ")}.
                Our Accounts team is verifying. You'll receive an email and WhatsApp once payment is released.
              </p>
              {payout.vendor_invoice_url && (
                <a
                  href={payout.vendor_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline mt-2"
                  data-testid="vendor-payouts-uploaded-link"
                >
                  <ExternalLink size={11} /> View uploaded invoice
                </a>
              )}
            </div>
          )}

          {stage === "paid" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1">
                <CheckCircle size={14} /> Payout received
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-[11px]">
                <div><p className="text-emerald-700">UTR</p><p className="font-mono">{payout.utr || "—"}</p></div>
                <div><p className="text-emerald-700">Mode</p><p>{payout.paid_via || "—"}</p></div>
                <div><p className="text-emerald-700">Paid on</p><p>{(payout.paid_at || "").slice(0, 19).replace("T", " ")}</p></div>
              </div>
            </div>
          )}

          {canUpload && (
            <div className="border-2 border-dashed border-emerald-200 rounded-lg p-4 bg-emerald-50/30">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 mb-2">
                <Upload size={14} className="text-emerald-600" /> Upload your tax invoice
              </p>
              <p className="text-[11px] text-gray-600 mb-3">
                Upload your GST tax invoice raised in Locofast's name. Payout is released only after Accounts verifies the invoice.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Invoice number *</label>
                  <input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-2025-0042"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    data-testid="vendor-invoice-number-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Invoice date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Invoice total (₹) — optional, must match net payable
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(payout.net_payable || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>

              <VendorFileUpload
                label="Invoice file"
                value={fileMeta}
                onChange={setFileMeta}
                folder="uploads/payouts/vendor-invoices"
                testid="vendor-invoice-upload"
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !fileMeta?.url || !invoiceNumber.trim()}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
                  data-testid="vendor-invoice-submit"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Submit invoice
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorPayouts;
