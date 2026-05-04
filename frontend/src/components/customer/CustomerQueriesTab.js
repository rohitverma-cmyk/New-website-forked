/**
 * "My Queries" tab body for /account. List + sub-tabs:
 *   - Quotes received   → RFQs that already have ≥ 1 vendor quote
 *   - Quotes not received → RFQs still awaiting first quote
 *   - Closed            → status=closed (or won)
 *
 * Click a card → navigate to /account/queries/:rfqId for the
 * Proceed-payment quote-comparison page.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Inbox } from "lucide-react";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { getCustomerQueries } from "../lib/api";

const SUB_TABS = [
  { key: "received", label: "Quotes received" },
  { key: "not_received", label: "Quotes not received" },
  { key: "closed", label: "Closed" },
];

const formatRelative = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const titleFor = (rfq) => {
  const cat = (rfq?.category || "").toLowerCase();
  const map = { cotton: "Cotton", viscose: "Viscose", denim: "Denim", knits: "Knits" };
  return map[cat] || (rfq?.category || "Fabric");
};

const QueryCard = ({ rfq, onOpen }) => {
  const best = rfq.best_quote;
  const subTag = rfq.fabric_requirement_type || (rfq.category === "knits" ? rfq.knit_quality : "");
  return (
    <div
      onClick={onOpen}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm cursor-pointer transition"
      data-testid={`customer-query-card-${rfq.rfq_number}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-gray-900">{titleFor(rfq)}</p>
            <span className="text-gray-300">|</span>
            <p className="text-gray-700 font-medium">{rfq.quantity_label || "—"}</p>
          </div>
          {rfq.message ? (
            <p className="text-xs text-gray-500 line-clamp-2 max-w-xl">{rfq.message}</p>
          ) : null}
        </div>
        {subTag ? (
          <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium whitespace-nowrap">
            {subTag}
          </span>
        ) : null}
      </div>

      {best ? (
        <div className="mt-3 inline-flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 text-amber-800 rounded-full px-3 py-1">
          <span className="font-semibold">★</span>
          <span>₹ {best.price_per_meter}/m · {best.lead_days} days to dispatch</span>
          {rfq.quotes_count > 1 ? (
            <span className="text-amber-900/70">+{rfq.quotes_count - 1} Quote{rfq.quotes_count > 2 ? "s" : ""}</span>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 text-xs text-gray-500">
          We are getting quotes from suppliers — usually within 24 h.
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4 text-xs">
        <span className="text-blue-700 font-medium">{rfq.rfq_number}</span>
        <div className="flex items-center gap-1.5 text-gray-500">
          Received <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{formatRelative(rfq.created_at)}</span>
        </div>
      </div>
    </div>
  );
};

const CustomerQueriesTab = () => {
  const navigate = useNavigate();
  const { token } = useCustomerAuth();
  const [subTab, setSubTab] = useState("received");
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await getCustomerQueries(token, subTab);
      setQueries(res.data?.queries || []);
    } catch (e) {
      setQueries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, subTab]);

  const filtered = queries.filter((q) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      q.rfq_number?.toLowerCase().includes(s) ||
      q.category?.toLowerCase().includes(s) ||
      q.fabric_requirement_type?.toLowerCase().includes(s)
    );
  });

  return (
    <div data-testid="customer-queries-tab">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                subTab === t.key
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
              data-testid={`customer-queries-subtab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search RFQ # or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none w-60"
            data-testid="customer-queries-search"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500"><Loader2 size={20} className="animate-spin mx-auto mb-2" />Loading queries…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center" data-testid="customer-queries-empty">
          <Inbox size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-700 font-medium">
            {subTab === "received"
              ? "No quotes received yet."
              : subTab === "not_received"
                ? "No queries waiting on quotes."
                : "No closed queries."}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Submit a Request for Quote from any catalogue page to start a query.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{filtered.length} request{filtered.length === 1 ? "" : "s"}</p>
          {filtered.map((q) => (
            <QueryCard
              key={q.id}
              rfq={q}
              onOpen={() => navigate(`/account/queries/${q.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerQueriesTab;
