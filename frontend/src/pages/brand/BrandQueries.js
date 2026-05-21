import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import BrandLayout from "./BrandLayout";
import {
  Loader2, MessageSquareQuote, Plus, Search, ArrowRight, BadgeCheck,
  Calendar, Layers, FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { fmtINR } from "../../lib/inr";

const API = process.env.REACT_APP_BACKEND_URL;
const TABS = [
  { id: "received", label: "Quotes received" },
  { id: "not_received", label: "Quotes pending" },
  { id: "closed", label: "Closed" },
];

const StatusPill = ({ status }) => {
  const map = {
    new: "bg-blue-100 text-blue-700",
    quoted: "bg-emerald-100 text-emerald-700",
    won: "bg-emerald-100 text-emerald-700",
    closed: "bg-gray-100 text-gray-600",
    lost: "bg-gray-200 text-gray-600",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>{status || "new"}</span>;
};

const QueryCard = ({ q }) => {
  const cat = (q.category || "").toUpperCase();
  const best = q.best_quote;
  const bestPrice = best ? `${fmtINR(best.price_per_meter)}/${(q.quantity_unit || "m").toLowerCase()}` : null;
  return (
    <Link to={`/enterprise/queries/${q.id}`} className="block bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm transition rounded-xl p-4" data-testid={`brand-query-card-${q.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">{cat || "Fabric"}</span>
            <span className="font-mono text-xs text-gray-500">{q.rfq_number}</span>
            <StatusPill status={q.status} />
          </div>
          <p className="font-medium text-gray-900 mt-1 truncate">
            {[q.fabric_requirement_type, q.gsm ? `${q.gsm} GSM` : null, q.weight_oz ? `${q.weight_oz} oz` : null]
              .filter(Boolean).join(" · ") || (q.knit_type || q.weave_type || "Custom RFQ")}
          </p>
          {q.linked_fabric_id && (
            <p className="text-[11px] mt-0.5" data-testid={`brand-query-ref-${q.id}`}>
              <a
                href={`/enterprise/fabrics/${q.linked_fabric_id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                title={q.linked_fabric_name || ""}
              >
                <ExternalLink size={10} />
                Ref: {q.linked_fabric_code || q.linked_fabric_name || "Source fabric"}
              </a>
            </p>
          )}
          <div className="text-xs text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Layers size={11} /> {q.quantity_label || "—"}</span>
            {q.required_by && <span className="inline-flex items-center gap-1"><Calendar size={11} /> by {q.required_by}</span>}
            {q.color && <span className="inline-flex items-center gap-1">Color: {q.color}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500">{q.quotes_count} {q.quotes_count === 1 ? "quote" : "quotes"}</span>
          {bestPrice && (
            <span className="text-xs inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              <BadgeCheck size={11} /> Best {bestPrice}
            </span>
          )}
          <ArrowRight size={14} className="text-emerald-600" />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">{q.created_at ? new Date(q.created_at).toLocaleString() : ""}</p>
    </Link>
  );
};

const BrandQueries = () => {
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("received");
  const [data, setData] = useState({ received: null, not_received: null, closed: null });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    // Pre-fetch all 3 buckets so the count badges are accurate
    ["received", "not_received", "closed"].forEach((s) => {
      fetch(`${API}/api/brand/queries?status=${s}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setData((cur) => ({ ...cur, [s]: d.queries || [] })))
        .catch(() => toast.error("Failed to load queries"));
    });
    // eslint-disable-next-line
  }, [token, user]);

  const list = data[tab];
  const filtered = useMemo(() => {
    if (!list) return null;
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((q) =>
      (q.rfq_number || "").toLowerCase().includes(s) ||
      (q.category || "").toLowerCase().includes(s) ||
      (q.color || "").toLowerCase().includes(s) ||
      (q.fabric_requirement_type || "").toLowerCase().includes(s)
    );
  }, [list, search]);

  return (
    <BrandLayout>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><MessageSquareQuote size={20} /> My Queries</h1>
          <p className="text-sm text-gray-500 mt-1">Track every RFQ your team has filed and the quotes vendors send back.</p>
        </div>
        <Link to="/rfq?from=enterprise" className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="brand-new-query">
          <Plus size={14} /> New Query
        </Link>
      </div>

      <div className="border-b border-gray-200 mb-4" data-testid="brand-queries-tabs">
        <div className="flex gap-1 sm:gap-2 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = data[t.id]?.length;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg flex items-center gap-1.5 border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  active ? "text-emerald-700 border-emerald-600 bg-emerald-50/50" : "text-gray-500 hover:text-gray-700 border-transparent"
                }`} data-testid={`brand-queries-tab-${t.id}`}>
                {t.label} {count != null && <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by RFQ #, fabric, color…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-queries-search" />
      </div>

      {filtered === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center" data-testid="brand-queries-empty">
          <FileText className="mx-auto text-gray-300 mb-2" size={36} />
          <h3 className="text-sm font-semibold text-gray-700">
            {tab === "received" ? "No quotes received yet" : tab === "not_received" ? "No queries waiting" : "No closed queries"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {tab === "received"
              ? "Vendors are reviewing your RFQs. You'll see quotes here as they roll in."
              : tab === "not_received"
              ? "Submit a new query to source fabrics directly from vetted mills."
              : "Won, closed and lost queries will appear here."}
          </p>
          {tab !== "closed" && (
            <Link to="/rfq?from=enterprise" className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg mt-4">
              <Plus size={14} /> Submit a Query
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="brand-queries-list">
          {filtered.map((q) => <QueryCard key={q.id} q={q} />)}
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandQueries;
