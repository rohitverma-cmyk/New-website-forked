/**
 * AdminOrderReviews
 * ─────────────────
 * /admin/order-reviews — surface for every customer rating submitted on
 * a delivered order. Mirrors the look of other admin tables.
 */
import { useEffect, useState, useMemo } from "react";
import { Star, Download, Search, Loader2, AlertTriangle } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import api from "../../lib/api";
import { toast } from "sonner";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
};

const ratingTone = (r) => {
  if (r >= 5) return "bg-emerald-100 text-emerald-700";
  if (r >= 4) return "bg-blue-100 text-blue-700";
  if (r >= 3) return "bg-amber-100 text-amber-700";
  if (r >= 2) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
};

const StarRow = ({ value }) => (
  <div className="inline-flex gap-0.5" data-testid={`review-stars-${value}`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        size={14}
        className={n <= value ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
      />
    ))}
  </div>
);

const StatCard = ({ label, value, sub, accent }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${accent || "text-gray-900"} tabular-nums`}>{value}</p>
    {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

const AdminOrderReviews = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ items: [], total: 0, stats: { average: 0, count: 0, buckets: {} } });
  const [rating, setRating] = useState(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/order-reviews", {
        params: { rating: rating || undefined, search: search || undefined, limit: 200 },
      });
      setData(data);
    } catch (e) {
      toast.error("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReviews(); /* eslint-disable-next-line */ }, [rating]);

  const onSearchKey = (e) => {
    if (e.key === "Enter") fetchReviews();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/admin/order-reviews/export.csv", {
        params: { rating: rating || undefined, search: search || undefined },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `locofast-reviews-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const buckets = data.stats?.buckets || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const total = data.stats?.count || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <AdminLayout>
      <div className="p-8 max-w-[1400px] mx-auto" data-testid="admin-reviews-page">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Customer Reviews</h1>
          <p className="text-sm text-gray-500 mt-1">
            All ratings &amp; feedback submitted by customers after their order was delivered.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard
            label="Average rating"
            value={<><span>{(data.stats?.average ?? 0).toFixed(1)}</span> <span className="text-sm text-gray-400">/ 5</span></>}
            sub={`${total} review${total === 1 ? "" : "s"}`}
            accent="text-amber-500"
          />
          <StatCard label="5 stars" value={buckets[5] || 0} sub={`${pct(buckets[5] || 0)}% · ★★★★★`} />
          <StatCard label="4 stars" value={buckets[4] || 0} sub={`${pct(buckets[4] || 0)}% · ★★★★☆`} />
          <StatCard label="3 stars" value={buckets[3] || 0} sub={`${pct(buckets[3] || 0)}% · ★★★☆☆`} />
          <StatCard
            label="≤ 2 stars"
            value={(buckets[1] || 0) + (buckets[2] || 0)}
            sub={`${pct((buckets[1] || 0) + (buckets[2] || 0))}% · attention needed`}
            accent="text-red-600"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2" data-testid="admin-reviews-filters">
          {[null, 5, 4, 3, 2, 1].map((r) => {
            const active = rating === r;
            return (
              <button
                key={r ?? "all"}
                onClick={() => setRating(r)}
                className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors flex items-center gap-1 ${
                  active ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100"
                }`}
                data-testid={`admin-reviews-filter-${r ?? "all"}`}
              >
                {r === null ? "All" : <><span className="text-amber-500">{"★".repeat(r)}</span><span className="text-gray-300">{"★".repeat(5 - r)}</span> {r}</>}
              </button>
            );
          })}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search order # or customer name…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              data-testid="admin-reviews-search"
            />
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || total === 0}
            className="bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-gray-800"
            data-testid="admin-reviews-download"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download CSV
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Order ID</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Rating</th>
                <th className="text-left px-4 py-3">Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500"><Loader2 size={16} className="inline animate-spin mr-2" /> Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500" data-testid="admin-reviews-empty">
                  <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  No reviews{rating ? ` with rating ${rating}` : ""} yet
                </td></tr>
              ) : data.items.map((r) => (
                <tr key={r.id || r.order_id} className="hover:bg-gray-50" data-testid={`admin-review-row-${r.order_number}`}>
                  <td className="px-4 py-3 align-top">
                    <a href={`/admin/orders?search=${encodeURIComponent(r.order_number)}`} className="text-blue-600 font-medium text-sm hover:underline">
                      {r.order_number}
                    </a>
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    <p className="font-medium text-gray-900">{r.customer_name || "—"}</p>
                    <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{r.customer_email}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-gray-600">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <StarRow value={r.rating} />
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ratingTone(r.rating)}`}>{r.rating}/5</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-gray-600 max-w-[320px]">
                    {r.feedback ? (
                      <p className="line-clamp-3">"{r.feedback}"</p>
                    ) : (
                      <span className="text-gray-400 italic">No written feedback</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data.items.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-3">
            Showing {data.items.length} of {data.total}
          </p>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminOrderReviews;
