import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { Loader2, Search, CheckCircle, Clock, IndianRupee, RotateCw, FileText, X, Mail, Phone, Plus, AlertCircle, Building2, ExternalLink, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PayoutsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState({ pending: { count: 0, amount: 0 }, processing: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 } });
  const [rows, setRows] = useState([]);
  const [viewerRole, setViewerRole] = useState("admin");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);

  const token = localStorage.getItem("locofast_token");

  const authedFetch = (url, opts = {}) =>
    fetch(`${API}${url}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await authedFetch(`/api/payouts/dashboard${q}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTiles(data.tiles);
      setRows(data.rows);
      setViewerRole(data.viewer_role);
    } catch (e) {
      toast.error(e.message || "Failed to load payouts");
    }
    setLoading(false);
  };

  useEffect(() => { fetchDashboard(); /* eslint-disable-next-line */ }, [statusFilter]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      [r.order_number, r.seller_company, r.utr].some((f) => (f || "").toLowerCase().includes(s))
    );
  }, [rows, search]);

  const handleMaterialize = async () => {
    const t = toast.loading("Scanning all paid orders…");
    try {
      const res = await authedFetch("/api/payouts/materialize-all", { method: "POST" });
      const data = await res.json();
      toast.success(`Scanned ${data.orders_scanned} orders · ${data.payouts_created} new payouts created`, { id: t });
      fetchDashboard();
    } catch {
      toast.error("Failed", { id: t });
    }
  };

  const handleRecalc = async (payoutId) => {
    const t = toast.loading("Recalculating with current commission rules…");
    try {
      const res = await authedFetch(`/api/payouts/${payoutId}/recalculate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      toast.success("Recalculated", { id: t });
      fetchDashboard();
    } catch (e) {
      toast.error(e.message || "Failed", { id: t });
    }
  };

  const tilesUI = [
    { id: "pending", label: "Pending", color: "amber", icon: Clock, ...tiles.pending },
    { id: "processing", label: "Processing", color: "blue", icon: RotateCw, ...tiles.processing },
    { id: "paid", label: "Paid", color: "emerald", icon: CheckCircle, ...tiles.paid },
  ];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Payouts</h1>
            <p className="text-sm text-gray-500 mt-1">
              Calculate and settle dues to sellers. {viewerRole === "accounts" && <span className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium">Accounts mode</span>}
            </p>
          </div>
          <button
            onClick={handleMaterialize}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            data-testid="payouts-rescan-btn"
            title="Re-scan all paid orders for missing payouts"
          >
            <RotateCw size={14} /> Re-scan orders
          </button>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {tilesUI.map((t) => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`bg-white border-2 rounded-xl p-4 text-left transition-all ${
                statusFilter === t.id ? `border-${t.color}-500 shadow` : "border-gray-200 hover:border-gray-300"
              }`}
              data-testid={`payouts-tile-${t.id}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium uppercase tracking-wide text-${t.color}-600`}>{t.label}</span>
                <t.icon size={16} className={`text-${t.color}-500`} />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{fmtINR(t.amount)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.count} payout{t.count !== 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search order #, vendor, UTR…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
              data-testid="payouts-search"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">No payouts in this view.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Advances</th>
                  <th className="px-4 py-3 text-right">Net Payable</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {filteredRows.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50" data-testid={`payouts-row-${p.id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.order_number}</p>
                      <p className="text-[11px] text-gray-500">{(p.order_paid_at || "").slice(0, 10)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.seller_company || "—"}</p>
                      <p className="text-[11px] text-gray-500">{p.payment_terms_snapshot || "No terms set"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{fmtINR(p.gross_subtotal)}</td>
                    <td className="px-4 py-3 text-right text-red-600">−{fmtINR(p.commission_total)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{p.advances_applied > 0 ? `−${fmtINR(p.advances_applied)}` : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtINR(p.net_payable)}</td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge payout={p} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        p.status === "paid" ? "bg-emerald-100 text-emerald-700"
                        : p.status === "processing" ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                      }`}>{p.status}</span>
                      {p.utr && <p className="text-[10px] text-gray-500 mt-0.5">UTR: {p.utr}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedPayout(p)}
                        className="px-2.5 py-1 text-xs text-blue-700 border border-blue-200 rounded hover:bg-blue-50"
                        data-testid={`payouts-view-${p.id}`}
                      >View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedPayout && (
        <PayoutDetailModal
          payout={selectedPayout}
          token={token}
          viewerRole={viewerRole}
          onClose={() => setSelectedPayout(null)}
          onPaid={() => { setShowMarkPaid(false); setSelectedPayout(null); fetchDashboard(); }}
          onRecalc={() => handleRecalc(selectedPayout.id)}
          onChanged={(updated) => {
            setSelectedPayout(updated);
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          }}
          showMarkPaid={showMarkPaid}
          setShowMarkPaid={setShowMarkPaid}
          showAdvance={showAdvance}
          setShowAdvance={setShowAdvance}
          onAdvanceCreated={() => { setShowAdvance(false); fetchDashboard(); }}
        />
      )}
    </AdminLayout>
  );
};

// ─── Detail Modal ────────────────────────────────────────────────
const PayoutDetailModal = ({ payout, token, viewerRole, onClose, onPaid, onRecalc, onChanged, showMarkPaid, setShowMarkPaid, showAdvance, setShowAdvance, onAdvanceCreated }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" data-testid="payouts-detail-modal">
      <div className="bg-white rounded-xl w-full max-w-3xl my-8">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Payout · {payout.order_number}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{payout.seller_company}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-gray-500 tracking-wide">Vendor</p>
              <p className="font-medium">{payout.seller_company}</p>
              {payout.seller_email && <p className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Mail size={10} />{payout.seller_email}</p>}
              {payout.seller_phone && <p className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Phone size={10} />{payout.seller_phone}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase text-gray-500 tracking-wide">Payment Terms</p>
              <p className="font-medium">{payout.payment_terms_snapshot || <span className="text-red-600 inline-flex items-center gap-1"><AlertCircle size={12} />Not configured</span>}</p>
              <p className="text-[11px] text-gray-500">Paid by customer on {(payout.order_paid_at || "").slice(0, 10)}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Comm %</th><th className="px-3 py-2 text-right">Net</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payout.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><p className="font-medium text-gray-800">{it.fabric_name}</p><p className="text-[11px] text-gray-500">{it.fabric_code}</p></td>
                    <td className="px-3 py-2 text-right">{it.quantity}m</td>
                    <td className="px-3 py-2 text-right">₹{Number(it.rate).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">₹{Number(it.gross).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{it.commission_pct}%</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{Number(it.net).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Gross subtotal</span><span>{fmtINR(payout.gross_subtotal)}</span></div>
            <div className="flex justify-between text-red-700"><span>Commission</span><span>−{fmtINR(payout.commission_total)}</span></div>
            {payout.advances_applied > 0 && (
              <div className="flex justify-between text-red-700"><span>Advances ({payout.advance_ids?.length || 0})</span><span>−{fmtINR(payout.advances_applied)}</span></div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-blue-200 pt-2 mt-2"><span>Net payable</span><span className="text-emerald-700" data-testid="payouts-detail-net">{fmtINR(payout.net_payable)}</span></div>
          </div>

          {/* Vendor invoice block */}
          <VendorInvoiceSection payout={payout} token={token} onChanged={onChanged} />

          {payout.status === "paid" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-emerald-800">✓ Paid</p>
              <div className="mt-1 grid grid-cols-3 gap-3 text-[11px]">
                <div><p className="text-emerald-700">UTR</p><p className="font-mono">{payout.utr}</p></div>
                <div><p className="text-emerald-700">Mode</p><p>{payout.paid_via}</p></div>
                <div><p className="text-emerald-700">Date</p><p>{(payout.paid_at || "").slice(0, 19).replace("T", " ")}</p></div>
              </div>
              {payout.notes && <p className="text-[11px] mt-2 text-emerald-700">Notes: {payout.notes}</p>}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-between gap-3">
          <div className="flex gap-2">
            {payout.status !== "paid" && (
              <>
                <button onClick={onRecalc} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"><RotateCw size={12} />Recalculate</button>
                {(payout.payment_terms_snapshot || "").toLowerCase().includes("advance") && (
                  <button onClick={() => setShowAdvance(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"><Plus size={12} />Add Advance</button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {payout.status !== "paid" && (() => {
              const invOk = payout.vendor_invoice_status === "uploaded" && payout.vendor_invoice_url;
              return (
                <button
                  onClick={() => setShowMarkPaid(true)}
                  disabled={!invOk}
                  title={!invOk ? "Vendor must upload tax invoice before payout can be released" : ""}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="payouts-mark-paid-btn"
                ><CheckCircle size={14} />Mark Paid</button>
              );
            })()}
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Close</button>
          </div>
        </div>
      </div>

      {showMarkPaid && <MarkPaidModal payout={payout} token={token} onClose={() => setShowMarkPaid(false)} onSuccess={onPaid} />}
      {showAdvance && <AddAdvanceModal payout={payout} token={token} onClose={() => setShowAdvance(false)} onSuccess={onAdvanceCreated} />}
    </div>
  );
};

const MarkPaidModal = ({ payout, token, onClose, onSuccess }) => {
  const [utr, setUtr] = useState("");
  const [paidVia, setPaidVia] = useState("NEFT");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (utr.trim().length < 4) { toast.error("UTR is required (min 4 chars)"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/payouts/${payout.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ utr: utr.trim(), paid_via: paidVia, paid_at: new Date(paidAt).toISOString(), notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      toast.success(`Payout marked paid · Vendor notified`);
      onSuccess();
    } catch (e) {
      toast.error(e.message || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Mark payout paid</h3>
        <p className="text-xs text-gray-500 mb-4">{payout.order_number} → {payout.seller_company} · {fmtINR(payout.net_payable)}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">UTR / Reference *</label>
            <input value={utr} onChange={(e) => setUtr(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. SBIN025051200001234" data-testid="payouts-utr-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Mode</label>
              <select value={paidVia} onChange={(e) => setPaidVia(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>OTHER</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Paid at</label>
              <input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50" data-testid="payouts-confirm-paid">
            {submitting ? <Loader2 size={14} className="animate-spin inline-block" /> : "Confirm payment"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AddAdvanceModal = ({ payout, token, onClose, onSuccess }) => {
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [paidVia, setPaidVia] = useState("NEFT");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/payouts/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          seller_id: payout.seller_id,
          order_id: payout.order_id,
          amount: amt,
          utr: utr.trim(),
          paid_via: paidVia,
          paid_at: new Date(paidAt).toISOString(),
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      toast.success(`Advance of ${fmtINR(amt)} recorded`);
      onSuccess();
    } catch (e) {
      toast.error(e.message || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Add advance payment</h3>
        <p className="text-xs text-gray-500 mb-4">Tied to {payout.order_number} · {payout.seller_company}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Amount (₹) *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 25000" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">UTR / Reference</label>
            <input value={utr} onChange={(e) => setUtr(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Mode</label>
              <select value={paidVia} onChange={(e) => setPaidVia(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>OTHER</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Paid at</label>
              <input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin inline-block" /> : "Record advance"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayoutsPage;

// ─── Invoice status badge (table column) ────────────────────────
const InvoiceStatusBadge = ({ payout }) => {
  const status = payout.vendor_invoice_status || "not_uploaded";
  if (payout.status === "paid" && status === "uploaded") {
    return (
      <a
        href={payout.vendor_invoice_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
      >
        <FileText size={11} /> Invoice
      </a>
    );
  }
  if (status === "uploaded") {
    return (
      <a
        href={payout.vendor_invoice_url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
        data-testid={`payouts-invoice-link-${payout.id}`}
      >
        <FileText size={10} /> Uploaded <ExternalLink size={9} />
      </a>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
        <XCircle size={10} /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={10} /> Awaiting upload
    </span>
  );
};

// ─── Vendor Invoice section in detail modal ─────────────────────
const VendorInvoiceSection = ({ payout, token, onChanged }) => {
  const [rejecting, setRejecting] = useState(false);
  const status = payout.vendor_invoice_status || "not_uploaded";

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900 flex items-center gap-1 text-sm">
          <FileText size={14} /> Vendor's Tax Invoice
        </h4>
        {status === "uploaded" && payout.vendor_invoice_url && (
          <a
            href={payout.vendor_invoice_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            data-testid="payouts-detail-invoice-link"
          >
            <ExternalLink size={11} /> Open
          </a>
        )}
      </div>

      {status === "not_uploaded" && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 flex items-center gap-2" data-testid="payouts-invoice-missing">
          <AlertTriangle size={14} />
          Vendor has not uploaded their tax invoice yet. Payout cannot be released until they upload.
        </div>
      )}

      {status === "uploaded" && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-gray-500">Invoice #</p>
            <p className="font-medium font-mono">{payout.vendor_invoice_number || "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Invoice date</p>
            <p className="font-medium">{payout.vendor_invoice_date || "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Vendor's claimed amount</p>
            <p className="font-medium">
              {payout.vendor_invoice_amount != null ? `₹${Number(payout.vendor_invoice_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
            </p>
          </div>
          <div className="col-span-3">
            <p className="text-gray-500">Uploaded at</p>
            <p className="font-medium">{(payout.vendor_invoice_uploaded_at || "").slice(0, 19).replace("T", " ")}</p>
          </div>
          {payout.status !== "paid" && (
            <div className="col-span-3 flex justify-end">
              <button
                onClick={() => setRejecting(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded hover:bg-red-50"
                data-testid="payouts-reject-invoice-btn"
              >
                <XCircle size={12} /> Reject invoice
              </button>
            </div>
          )}
        </div>
      )}

      {status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs">
          <p className="font-semibold text-red-800">Invoice rejected · awaiting vendor re-upload</p>
          <p className="text-red-700 mt-1">Reason: {payout.vendor_invoice_rejection_reason || "—"}</p>
          <p className="text-red-600 mt-1">
            Rejected by {payout.vendor_invoice_rejected_by || "—"} on {(payout.vendor_invoice_rejected_at || "").slice(0, 10)}
          </p>
        </div>
      )}

      {rejecting && (
        <RejectInvoiceModal
          payout={payout}
          token={token}
          onClose={() => setRejecting(false)}
          onSuccess={(updated) => { setRejecting(false); onChanged?.(updated); }}
        />
      )}
    </div>
  );
};

const RejectInvoiceModal = ({ payout, token, onClose, onSuccess }) => {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 5) { toast.error("Please provide a clear reason (min 5 chars)"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/payouts/${payout.id}/reject-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const data = await res.json();
      toast.success("Invoice rejected · vendor notified to re-upload");
      onSuccess(data.payout);
    } catch (e) {
      toast.error(e.message || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" data-testid="payouts-reject-modal">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Reject vendor's invoice</h3>
        <p className="text-xs text-gray-500 mb-4">{payout.order_number} · {payout.seller_company}</p>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Rejection reason *</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Invoice amount does not match net payable; GST number is incorrect; HSN code missing…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          data-testid="payouts-reject-reason-input"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          The vendor will receive an email with this reason and be able to re-upload a corrected invoice.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="payouts-reject-confirm"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Reject and notify vendor
          </button>
        </div>
      </div>
    </div>
  );
};
