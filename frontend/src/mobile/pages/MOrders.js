import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Package, ShoppingBag, AlertCircle } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useRequireMobileAuth } from "../utils/authGuard";
import { getCustomerOrders } from "../../lib/api";
import { statusLabel, statusTone, statusBackground, formatDateRelative } from "../lib/orderHelpers";
import { formatPriceINR } from "../lib/format";

export default function MOrders() {
  const navigate = useNavigate();
  const { token, loading: authLoading } = useCustomerAuth();
  useRequireMobileAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !token) return;
    let alive = true;
    (async () => {
      try {
        const res = await getCustomerOrders(token);
        if (alive) setOrders(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (alive) setError(err?.response?.data?.detail || "Failed to load orders");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, token]);

  if (authLoading || loading) {
    return (
      <div className="m-container" style={{ paddingTop: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="m-skeleton" style={{ height: 110, borderRadius: 16, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-container" style={{ paddingTop: 40, textAlign: "center" }}>
        <AlertCircle size={32} color="var(--m-red)" style={{ marginBottom: 10 }} />
        <div className="m-title">Couldn't load orders</div>
        <p className="m-body" style={{ marginTop: 6 }}>{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="m-container" style={{ paddingTop: 60, textAlign: "center" }}>
        <div style={{ width: 80, height: 80, margin: "0 auto 16px", borderRadius: "50%", background: "var(--m-orange-50)", color: "var(--m-orange)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShoppingBag size={36} />
        </div>
        <div className="m-title-lg">No orders yet</div>
        <p className="m-body" style={{ marginTop: 8, marginBottom: 20 }}>
          Sample today, refill the winners. Order your first fabric in a few taps.
        </p>
        <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-primary">
          Browse Catalog <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="m-container" style={{ paddingTop: 8 }}>
      <div style={{ padding: "4px 0 14px" }}>
        <div className="m-kicker">Your orders</div>
        <h1 className="m-title-lg" style={{ marginTop: 4 }}>{orders.length} order{orders.length === 1 ? "" : "s"}</h1>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.map((o) => <OrderCard key={o.id} order={o} onClick={() => navigate(`/m/orders/${o.id}`)} />)}
      </div>
    </div>
  );
}

function OrderCard({ order, onClick }) {
  const tone = statusTone(order.status);
  const bg = statusBackground(tone);
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsLabel = items.length === 1 ? items[0]?.fabric_name || "1 fabric" : `${items.length} fabrics`;
  const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

  return (
    <button onClick={onClick} className="m-card" style={{ width: "100%", padding: 14, textAlign: "left", display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", border: "1px solid var(--m-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)" }}>
            {order.order_number}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--m-ink)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {itemsLabel}
          </div>
          <div style={{ fontSize: 12, color: "var(--m-ink-3)", marginTop: 2 }}>
            {totalQty > 0 ? `${totalQty}m · ` : ""}{formatDateRelative(order.created_at)}
          </div>
        </div>
        <span style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg.bg, color: bg.color, whiteSpace: "nowrap" }}>
          {statusLabel(order.status)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px dashed var(--m-border)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-ink)" }}>{formatPriceINR(order.total)}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--m-blue)", fontWeight: 600, fontSize: 13 }}>
          {order.payment_status === "paid" ? "View details" : "Complete payment"}
          <ChevronRight size={14} />
        </div>
      </div>
    </button>
  );
}
