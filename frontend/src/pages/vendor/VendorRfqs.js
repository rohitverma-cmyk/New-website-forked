/**
 * Vendor "Requests" page — Pick Pool + Quoted/Submitted/Closed pipeline.
 *
 * Mirrors the mobile RFQ screens:
 *   - Top status pill tabs (All new · Picked · Submitted · Closed)
 *   - Collapsible Business Overview card with date filter and 5 stat tiles
 *   - List of RFQ cards with fabric meta, qty, specs, status badge,
 *     Pick action, and a deep-link to the detail page.
 *
 * Auth flows through the existing vendor JWT in localStorage. Eligible
 * RFQs are filtered server-side by the vendor's `category_ids`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Send,
  Boxes,
  Package,
  Bell,
  Search,
} from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import { getVendorRfqs, getVendorRfqStats, closeVendorRfq } from "../../lib/api";
import {
  STATUS_TABS,
  PERIOD_TABS,
  formatDate,
  formatINR,
  rfqTitle,
} from "../../lib/vendorRfq";

const STAT_ITEMS = [
  { key: "total_queries", label: "Total Queries", icon: Send, accent: "violet" },
  { key: "answered_queries", label: "Answered", icon: CheckCircle2, accent: "violet" },
  { key: "unanswered_queries", label: "Unanswered", icon: Clock, accent: "violet" },
  { key: "orders_count", label: "Orders & Sales", icon: Package, accent: "violet" },
  { key: "samples_shared", label: "Sample Shared", icon: Boxes, accent: "violet" },
];

const StatTile = ({ label, value, sub, Icon }) => (
  <div
    className="bg-white border border-violet-100 rounded-xl p-4 flex items-start justify-between min-w-[180px]"
    data-testid={`vendor-rfq-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
  >
    <div>
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 leading-none">{value}</p>
      {sub ? <p className="text-[11px] text-violet-700 mt-1">{sub}</p> : null}
    </div>
    <div className="w-9 h-9 rounded-lg bg-violet-50 grid place-items-center">
      <Icon size={16} className="text-violet-600" />
    </div>
  </div>
);

const RfqCard = ({ rfq, onSubmitQuote, onClose, onOpen, busy }) => {
  const isSubmitted = rfq.effective_status === "submitted";
  const isClosed = rfq.effective_status === "closed";
  const isShortfall = !!rfq.is_shortfall;
  return (
    <div
      onClick={onOpen}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-violet-300 hover:shadow-sm transition cursor-pointer"
      data-testid={`vendor-rfq-card-${rfq.rfq_number}`}
    >
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{rfqTitle(rfq)}</h3>
            <span className="text-gray-300">|</span>
            <span className="text-gray-700 font-medium">{rfq.quantity_label || "—"}</span>
            {isShortfall && (
              <span className="ml-1 text-[10px] font-bold tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                SHORTFALL
              </span>
            )}
            {!isSubmitted && !isClosed && !isShortfall && (
              <span className="ml-1 text-[10px] font-bold tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                NEW
              </span>
            )}
          </div>
          <p className="text-[12px] text-gray-500 truncate">
            {rfq.full_name} · {rfq.email}
          </p>
          {isShortfall && rfq.linked_fabric_code ? (
            <p className="text-[11px] text-amber-700 mt-1">
              Linked to inventory order — {rfq.linked_inventory_qty || 0} m taken from stock
            </p>
          ) : null}
        </div>
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium whitespace-nowrap">
          {rfq.fabric_requirement_type || "Greige"}
        </span>
      </div>

      {rfq.my_quote && (
        <div className="flex items-center gap-3 text-xs text-gray-600 mb-3 mt-2">
          <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 rounded-full px-2.5 py-1">
            ₹ {formatINR(rfq.my_quote.price_per_meter)} /m
          </span>
          <span className="text-gray-400">·</span>
          <span>{rfq.my_quote.lead_days} days</span>
          <span className="text-gray-400">·</span>
          <span className="capitalize">{rfq.my_quote.basis}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span className="text-[12px] text-violet-700 font-medium">{rfq.rfq_number}</span>
        <div className="flex items-center gap-2">
          {isSubmitted ? (
            <span className="text-[12px] text-blue-600">
              Submitted on {formatDate(rfq.my_quote?.updated_at || rfq.my_quote?.created_at)}
            </span>
          ) : isClosed ? (
            <span className="text-[12px] text-gray-500">Closed</span>
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                disabled={busy}
                className="text-[12px] text-gray-500 hover:text-gray-800 px-2 py-1"
                data-testid={`vendor-rfq-close-${rfq.rfq_number}`}
              >
                Not interested
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmitQuote();
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60"
                data-testid={`vendor-rfq-submit-${rfq.rfq_number}`}
              >
                Submit Quote ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const VendorRfqs = () => {
  const navigate = useNavigate();
  const [statusKey, setStatusKey] = useState("all");
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [period, setPeriod] = useState("7d");
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await getVendorRfqs(statusKey);
      setRfqs(res.data?.rfqs || []);
    } catch (e) {
      console.error(e);
      setRfqs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getVendorRfqStats(period);
      setStats(res.data || null);
    } catch (e) {
      setStats(null);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const handleClose = async (rfqId) => {
    setBusyId(rfqId);
    try {
      await closeVendorRfq(rfqId);
      await fetchList();
    } catch (e) {
      alert(e?.response?.data?.detail || "Could not close this RFQ");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rfqs;
    return rfqs.filter(
      (r) =>
        r.rfq_number?.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
    );
  }, [rfqs, search]);

  return (
    <VendorLayout>
      <div className="p-6 max-w-6xl mx-auto" data-testid="vendor-rfqs-page">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search RFQ #, name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-violet-400 focus:outline-none w-60"
                data-testid="vendor-rfq-search"
              />
            </div>
            <button className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 relative" type="button">
              <Bell size={16} />
            </button>
          </div>
        </div>

        {/* Business Overview */}
        <div className="bg-violet-50/40 border border-violet-100 rounded-2xl p-4 mb-6" data-testid="vendor-rfq-overview">
          <button
            type="button"
            onClick={() => setOverviewOpen((v) => !v)}
            className="flex items-center justify-between w-full"
          >
            <span className="font-semibold text-gray-900">Business Overview</span>
            {overviewOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {overviewOpen && (
            <div className="mt-3">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {PERIOD_TABS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPeriod(p.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      period === p.key
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                    data-testid={`vendor-rfq-period-${p.key}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {STAT_ITEMS.map((s) => {
                  const value = stats?.[s.key] ?? 0;
                  const isOrders = s.key === "orders_count";
                  const sub = isOrders && stats?.orders_value
                    ? `₹ ${formatINR(stats.orders_value)}`
                    : "";
                  return (
                    <StatTile
                      key={s.key}
                      label={s.label}
                      value={value}
                      sub={sub}
                      Icon={s.icon}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Status pill tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="vendor-rfq-tabs">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusKey(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                statusKey === t.key
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
              data-testid={`vendor-rfq-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500" data-testid="vendor-rfq-empty">
            <p className="text-sm">No requests in this view yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Eligibility is set by the categories you carry. Contact admin to
              update your category mapping if you expect to see queries here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <RfqCard
                key={r.id}
                rfq={r}
                busy={busyId === r.id}
                onSubmitQuote={() => navigate(`/vendor/rfqs/${r.id}?action=submit`)}
                onClose={() => handleClose(r.id)}
                onOpen={() => navigate(`/vendor/rfqs/${r.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorRfqs;
