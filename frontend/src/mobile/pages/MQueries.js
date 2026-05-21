/**
 * MQueries — Mobile "My Queries" (submitted RFQs) list.
 *
 * Mirrors the desktop CustomerQueriesTab. Three sub-tabs:
 *   received (RFQs with ≥ 1 quote) · not_received · closed.
 * Tap a card → /m/rfq/:rfqId for the existing quote-comparison page.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Inbox, Plus, Star, MessageSquare } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useRequireMobileAuth } from "../utils/authGuard";
import { getCustomerQueries } from "../../lib/api";

const SUB_TABS = [
  { key: "received", label: "Quotes received" },
  { key: "not_received", label: "Awaiting quotes" },
  { key: "closed", label: "Closed" },
];

const formatRelative = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const titleFor = (rfq) => {
  const cat = (rfq?.category || "").toLowerCase();
  const map = { cotton: "Cotton", viscose: "Viscose", denim: "Denim", knits: "Knits" };
  return map[cat] || (rfq?.category || "Fabric");
};

export default function MQueries() {
  const navigate = useNavigate();
  const { token } = useCustomerAuth();
  useRequireMobileAuth();
  const [subTab, setSubTab] = useState("received");
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    getCustomerQueries(token, subTab)
      .then((r) => { if (alive) setQueries(r.data?.queries || []); })
      .catch(() => { if (alive) setQueries([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, subTab]);

  return (
    <div style={{ background: "var(--m-bg)", minHeight: "100%" }}>
      <div className="m-container" style={{ paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--m-ink)", margin: 0 }}>My queries</h1>
          <button
            onClick={() => navigate("/m/rfq?from=account")}
            className="m-btn m-btn-primary"
            style={{ padding: "8px 14px", fontSize: 13 }}
            data-testid="m-queries-new-btn"
          >
            <Plus size={14} /> New
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 4, scrollbarWidth: "none" }}>
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className="m-chip"
              data-testid={`m-queries-subtab-${t.key}`}
              style={{
                whiteSpace: "nowrap",
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: subTab === t.key ? "var(--m-blue-50)" : "var(--m-surface)",
                color: subTab === t.key ? "var(--m-blue)" : "var(--m-ink-2)",
                borderColor: subTab === t.key ? "#DBEAFE" : "var(--m-border-2)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--m-ink-3)" }}>
            <Loader2 size={20} className="m-spinner" /> Loading…
          </div>
        ) : queries.length === 0 ? (
          <div className="m-card" style={{ padding: 32, textAlign: "center", border: "1px dashed var(--m-border-2)" }} data-testid="m-queries-empty">
            <Inbox size={28} color="var(--m-ink-3)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--m-ink)", margin: 0 }}>
              {subTab === "received" ? "No quotes received yet." : subTab === "not_received" ? "No queries waiting on quotes." : "No closed queries."}
            </p>
            <p style={{ fontSize: 12, color: "var(--m-ink-3)", margin: "4px 0 14px" }}>
              Submit an RFQ to start receiving supplier quotes.
            </p>
            <button onClick={() => navigate("/m/rfq?from=account")} className="m-btn m-btn-primary" style={{ display: "inline-flex" }}>
              <MessageSquare size={14} /> Request a quote
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "4px 0 8px", fontWeight: 600 }}>
              {queries.length} request{queries.length === 1 ? "" : "s"}
            </p>
            <div style={{ display: "grid", gap: 10, paddingBottom: 16 }}>
              {queries.map((q) => (
                <QueryCard key={q.id} rfq={q} onOpen={() => navigate(`/m/rfq/${q.id}`)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const QueryCard = ({ rfq, onOpen }) => {
  const best = rfq.best_quote;
  const subTag = rfq.fabric_requirement_type || (rfq.category === "knits" ? rfq.knit_quality : "");
  return (
    <button
      onClick={onOpen}
      className="m-card"
      style={{ width: "100%", padding: 14, textAlign: "left", border: "1px solid var(--m-border)", background: "var(--m-surface)" }}
      data-testid={`m-query-card-${rfq.rfq_number}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--m-ink)" }}>{titleFor(rfq)}</span>
          <span style={{ color: "var(--m-border-2)" }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink-2)" }}>{rfq.quantity_label || "—"}</span>
        </div>
        {subTag ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            {subTag}
          </span>
        ) : null}
      </div>

      {rfq.message ? (
        <p style={{ fontSize: 12, color: "var(--m-ink-3)", margin: "0 0 8px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {rfq.message}
        </p>
      ) : null}

      {best ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 600, marginBottom: 10 }}>
          <Star size={11} fill="#F59E0B" color="#F59E0B" />
          <span>₹{best.price_per_meter}/m · {best.lead_days}d dispatch</span>
          {rfq.quotes_count > 1 ? <span style={{ opacity: 0.7 }}>+{rfq.quotes_count - 1} more</span> : null}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "0 0 10px", fontStyle: "italic" }}>
          Gathering quotes from suppliers — usually within 24h.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--m-border)", fontSize: 11 }}>
        <span style={{ color: "var(--m-blue)", fontWeight: 700 }}>{rfq.rfq_number}</span>
        <span style={{ color: "var(--m-ink-3)" }}>
          {formatRelative(rfq.created_at)}
        </span>
      </div>
    </button>
  );
};
