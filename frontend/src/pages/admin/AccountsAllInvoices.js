/**
 * Accounts › All Invoices — unified ledger view.
 *
 * Surfaces three independent invoice sources in one searchable table:
 *   1. Customer  — GST invoice generated for every paid order
 *      (parent of split orders is skipped; only the sub-orders count)
 *   2. Vendor    — tax invoices uploaded by vendors against payouts
 *   3. Brand     — manually-entered B2B invoices on the credit ledger
 *
 * Filters: type / date range / search / payment method / vendor.
 * Export: CSV of the current filtered view.
 */
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Loader2, Search, Download, FileText, RefreshCw, Filter, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const TYPE_LABELS = {
  customer: { label: "Customer", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  vendor: { label: "Vendor Payout", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  brand: { label: "Brand Credit", chip: "bg-amber-50 text-amber-700 border-amber-200" },
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "All methods" },
  { value: "razorpay", label: "Razorpay" },
  { value: "credit", label: "Credit Line" },
  { value: "sample_credit", label: "Sample Credits" },
  { value: "lc_90_days", label: "LC 90 Days" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
];

export default function AccountsAllInvoices() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ customer: 0, vendor: 0, brand: 0, total: 0 });
  const [amounts, setAmounts] = useState({ customer: 0, vendor: 0, brand: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [tab, setTab] = useState("");              // "" = all, "customer" | "vendor" | "brand"
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState("");

  const token = localStorage.getItem("locofast_token");
  const authedFetch = (url, opts = {}) =>
    fetch(`${API}${url}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

  const fetchSellers = async () => {
    try {
      const res = await authedFetch("/api/sellers?include_inactive=true");
      if (!res.ok) return;
      const data = await res.json();
      setSellers(Array.isArray(data) ? data : (data.sellers || []));
    } catch {
      /* non-critical */
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab) params.set("invoice_type", tab);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (search.trim()) params.set("search", search.trim());
      if (paymentMethod) params.set("payment_method", paymentMethod);
      if (sellerId) params.set("seller_id", sellerId);
      const url = `/api/admin/accounts/invoices${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await authedFetch(url);
      if (!res.ok) throw new Error("Failed to load invoices");
      const data = await res.json();
      setRows(data.rows || []);
      setCounts(data.counts || { customer: 0, vendor: 0, brand: 0, total: 0 });
      setAmounts(data.amounts || { customer: 0, vendor: 0, brand: 0, total: 0 });
    } catch (e) {
      toast.error(e.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSellers(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchInvoices(); /* eslint-disable-next-line */ }, [tab, startDate, endDate, paymentMethod, sellerId]);

  // Debounce search separately
  useEffect(() => {
    const t = setTimeout(() => fetchInvoices(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const displayed = rows;

  const exportCsv = () => {
    if (!displayed.length) {
      toast.info("Nothing to export");
      return;
    }
    const cols = [
      "type", "invoice_number", "invoice_date", "party", "vendor",
      "subtotal", "tax", "amount", "currency", "payment_method", "payment_status",
      "order_number", "parent_order_number", "pdf_url",
    ];
    const escape = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      cols.join(","),
      ...displayed.map((r) => cols.map((c) => escape(r[c])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const tag = tab || "all";
    a.href = url;
    a.download = `invoices_${tag}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${displayed.length} invoice${displayed.length === 1 ? "" : "s"}`);
  };

  const downloadInvoice = (r) => {
    const url = r.pdf_url || "";
    if (!url) {
      toast.error("No PDF available for this invoice");
      return;
    }
    const fullUrl = url.startsWith("http") ? url : `${API}${url}`;
    window.open(fullUrl, "_blank", "noopener");
  };

  const Tile = ({ label, count, amount, active, onClick, testId }) => (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`text-left p-4 rounded-xl border transition-colors ${
        active ? "bg-blue-50 border-blue-300 ring-2 ring-blue-100" : "bg-white border-gray-200 hover:border-gray-300"
      }`}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{count.toLocaleString()}</p>
      <p className="mt-1 text-sm text-gray-600">{fmtINR(amount)}</p>
    </button>
  );

  const sellerOptions = useMemo(
    () => sellers.map((s) => ({ value: s.id, label: s.company_name || s.name || s.id })),
    [sellers]
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6" data-testid="accounts-all-invoices-page">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">All Invoices</h1>
            <p className="text-sm text-gray-500 mt-1">
              Unified view of customer GST invoices, vendor payout invoices, and brand credit invoices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchInvoices}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              data-testid="refresh-btn"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              data-testid="export-csv-btn"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="All Invoices"     count={counts.total}    amount={amounts.total}    active={tab === ""}         onClick={() => setTab("")}         testId="tile-all" />
          <Tile label="Customer GST"     count={counts.customer} amount={amounts.customer} active={tab === "customer"} onClick={() => setTab("customer")} testId="tile-customer" />
          <Tile label="Vendor Payout"    count={counts.vendor}   amount={amounts.vendor}   active={tab === "vendor"}   onClick={() => setTab("vendor")}   testId="tile-vendor" />
          <Tile label="Brand Credit"     count={counts.brand}    amount={amounts.brand}    active={tab === "brand"}    onClick={() => setTab("brand")}    testId="tile-brand" />
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Filter size={14} />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoice # or party name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                data-testid="search-input"
              />
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              data-testid="start-date-input"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              data-testid="end-date-input"
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              data-testid="payment-method-select"
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 lg:col-span-2"
              data-testid="seller-filter-select"
            >
              <option value="">All vendors</option>
              {sellerOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {(search || startDate || endDate || paymentMethod || sellerId) && (
              <button
                type="button"
                onClick={() => {
                  setSearch(""); setStartDate(""); setEndDate(""); setPaymentMethod(""); setSellerId("");
                }}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                data-testid="clear-filters-btn"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading invoices…
            </div>
          ) : displayed.length === 0 ? (
            <div className="p-12 text-center text-gray-500" data-testid="empty-state">
              <FileText size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="font-medium text-gray-700">No invoices match these filters</p>
              <p className="text-sm">Try widening the date range or clearing filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="invoices-table">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Invoice #</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Party</th>
                    <th className="px-4 py-3 text-left">Vendor</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">GST</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayed.map((r, i) => {
                    const typeInfo = TYPE_LABELS[r.type] || { label: r.type, chip: "bg-gray-100 text-gray-700 border-gray-200" };
                    return (
                      <tr key={`${r.type}-${r.invoice_number}-${i}`} className="hover:bg-gray-50 transition-colors" data-testid={`invoice-row-${i}`}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeInfo.chip}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">{r.invoice_number || "—"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.invoice_date || "—"}</td>
                        <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate" title={r.party}>{r.party || "—"}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={r.vendor}>{r.vendor || "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{fmtINR(r.subtotal)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{fmtINR(r.tax)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtINR(r.amount)}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{(r.payment_method || "").replace(/_/g, " ") || "—"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.payment_status || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {r.pdf_url ? (
                            <button
                              type="button"
                              onClick={() => downloadInvoice(r)}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                              data-testid={`download-pdf-${i}`}
                            >
                              <Download size={12} /> PDF
                              {!r.pdf_url.startsWith("/api") && <ExternalLink size={10} />}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">No PDF</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && displayed.length > 0 && (
          <div className="text-xs text-gray-500" data-testid="footer-summary">
            Showing {displayed.length.toLocaleString()} invoice{displayed.length === 1 ? "" : "s"} · combined total {fmtINR(amounts.total)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
