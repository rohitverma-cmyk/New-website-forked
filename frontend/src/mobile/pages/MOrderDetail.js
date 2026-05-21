import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, CheckCircle, Circle, Truck, MapPin, Package, Receipt, RefreshCcw, Phone, AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useRequireMobileAuth } from "../utils/authGuard";
import { getCustomerOrder, getOrderTracking } from "../../lib/api";
import { statusLabel, statusTone, statusBackground, ORDER_TIMELINE, ORDER_STATUS, formatDateRelative } from "../lib/orderHelpers";
import { formatPriceINR } from "../lib/format";

export default function MOrderDetail() {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { token, loading: authLoading } = useCustomerAuth();
  useRequireMobileAuth();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const isFresh = params.get("fresh") === "1";

  useEffect(() => {
    if (authLoading || !token) return;
    let alive = true;
    (async () => {
      try {
        const res = await getCustomerOrder(token, orderId);
        if (alive) setOrder(res.data);
        try {
          const trk = await getOrderTracking(token, orderId);
          if (alive) setTracking(trk.data);
        } catch {}
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Order not found");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, token, orderId]);

  if (loading) {
    return (
      <div className="m-container" style={{ paddingTop: 16 }}>
        <div className="m-skeleton" style={{ height: 80, borderRadius: 16 }} />
        <div className="m-skeleton" style={{ height: 200, borderRadius: 16, marginTop: 12 }} />
      </div>
    );
  }
  if (!order) return null;

  const tone = statusTone(order.status);
  const bg = statusBackground(tone);
  const currentStep = ORDER_STATUS[order.status]?.step ?? 0;
  const items = Array.isArray(order.items) ? order.items : [];
  const customer = order.customer || {};

  return (
    <div style={{ paddingBottom: 32 }}>
      {isFresh && (
        <div className="m-container" style={{ paddingTop: 12 }}>
          <div style={{ padding: 14, borderRadius: 14, background: "linear-gradient(135deg, var(--m-green-50), #d1fae5)", border: "1px solid #a7f3d0", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckCircle size={20} color="var(--m-green)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: "var(--m-green)" }}>Order placed successfully!</div>
              <div style={{ fontSize: 13, color: "var(--m-ink-2)", marginTop: 2 }}>We'll email you shipping updates as your order moves.</div>
            </div>
          </div>
        </div>
      )}

      <div className="m-container" style={{ paddingTop: 14 }}>
        <div className="m-kicker">{order.order_number}</div>
        <h1 className="m-title-lg" style={{ marginTop: 4 }}>
          {items.length === 1 ? items[0]?.fabric_name : `${items.length} fabrics`}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg.bg, color: bg.color }}>
            {statusLabel(order.status)}
          </span>
          <span className="m-caption">Placed {formatDateRelative(order.created_at)}</span>
        </div>
      </div>

      {/* Payment pending banner */}
      {order.payment_status !== "paid" && order.status !== "cancelled" && (
        <div className="m-container" style={{ marginTop: 14 }}>
          <div className="m-card" style={{ padding: 14, background: "#fef3c7", borderColor: "#fde68a", display: "flex", gap: 12, alignItems: "center" }}>
            <AlertCircle size={20} color="var(--m-amber)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>Payment pending</div>
              <div style={{ fontSize: 12, color: "#92400e", opacity: 0.8 }}>Complete payment to confirm your order.</div>
            </div>
            <button onClick={() => toast.info("Re-payment is built in Phase 6 — coming next")} className="m-btn m-btn-primary" style={{ padding: "8px 14px", minHeight: 36 }}>
              <CreditCard size={14} /> Pay
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="m-container" style={{ marginTop: 16 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Order timeline</h2>
        <div className="m-card" style={{ padding: 16 }}>
          {ORDER_TIMELINE.map((step, i) => {
            const done = currentStep >= i + 1;
            const active = currentStep === i + 1 || (currentStep === i + 1 - 1 && i === 0);
            const isLast = i === ORDER_TIMELINE.length - 1;
            return (
              <div key={step.key} style={{ display: "flex", gap: 14, position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  {done ? (
                    <CheckCircle size={22} color="var(--m-green)" fill="var(--m-green-50)" strokeWidth={2.5} />
                  ) : active ? (
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--m-orange)", border: "4px solid var(--m-orange-50)" }} />
                  ) : (
                    <Circle size={22} color="var(--m-border-2)" strokeWidth={2} />
                  )}
                  {!isLast && (
                    <div style={{ width: 2, flex: 1, minHeight: 30, background: done ? "var(--m-green)" : "var(--m-border-2)", marginTop: 2 }} />
                  )}
                </div>
                <div style={{ paddingBottom: isLast ? 0 : 24, paddingTop: 1 }}>
                  <div style={{ fontWeight: done || active ? 700 : 500, color: done || active ? "var(--m-ink)" : "var(--m-ink-3)", fontSize: 14 }}>{step.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracking events */}
      {tracking?.events?.length > 0 && (
        <div className="m-container" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 className="m-title">Tracking history</h2>
            {tracking.awb_code && <span className="m-caption">AWB: {tracking.awb_code}</span>}
          </div>
          <div className="m-card" style={{ padding: 16 }}>
            {tracking.events.slice(0, 8).map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 12, marginBottom: 12, borderBottom: i < tracking.events.length - 1 ? "1px dashed var(--m-border)" : "none" }}>
                <Truck size={16} color="var(--m-blue)" style={{ marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--m-ink)" }}>{e.activity || e.raw_status}</div>
                  <div className="m-caption" style={{ marginTop: 2 }}>{e.location} · {formatDateRelative(e.event_time)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="m-container" style={{ marginTop: 16 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Items</h2>
        <div className="m-card" style={{ padding: 4 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: 12, borderBottom: i < items.length - 1 ? "1px solid var(--m-border)" : "none" }}>
              <div style={{ width: 60, height: 60, borderRadius: 10, background: it.fabric_image ? `url(${it.fabric_image}) center/cover` : "linear-gradient(135deg, var(--m-orange-50), #FFE3CE)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--m-orange)" }}>
                {!it.fabric_image && <Package size={22} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--m-ink)", overflow: "hidden", textOverflow: "ellipsis" }}>{it.fabric_name}</div>
                <div className="m-caption" style={{ marginTop: 2 }}>{it.quantity}m · {formatPriceINR(it.rate_per_meter)}/m</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--m-ink)" }}>{formatPriceINR((it.rate_per_meter || 0) * (it.quantity || 0))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping address */}
      <div className="m-container" style={{ marginTop: 16 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Shipping to</h2>
        <div className="m-card" style={{ padding: 14, display: "flex", gap: 12 }}>
          <MapPin size={18} color="var(--m-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: "var(--m-ink-2)" }}>
            <strong style={{ color: "var(--m-ink)" }}>{customer.name}</strong><br/>
            {customer.address}<br/>
            {customer.city}, {customer.state} {customer.pincode}<br/>
            <Phone size={11} style={{ verticalAlign: "-1px", display: "inline", marginRight: 4 }} />{customer.phone}
          </div>
        </div>
      </div>

      {/* Bill summary */}
      <div className="m-container" style={{ marginTop: 16 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Bill summary</h2>
        <div className="m-card" style={{ padding: 14 }}>
          <Row label="Subtotal" value={formatPriceINR(order.subtotal)} />
          {order.tax ? <Row label="GST" value={formatPriceINR(order.tax)} /> : null}
          {order.logistics_charge ? <Row label="Logistics" value={formatPriceINR(order.logistics_charge)} /> : null}
          {order.packaging_charge ? <Row label="Packaging" value={formatPriceINR(order.packaging_charge)} /> : null}
          {order.discount ? <Row label="Discount" value={`− ${formatPriceINR(order.discount)}`} green /> : null}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px dashed var(--m-border-2)", marginTop: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--m-ink)" }}>Total paid</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--m-orange-700)" }}>{formatPriceINR(order.total)}</span>
          </div>
          {order.payment_status === "paid" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: 12, color: "var(--m-green)" }}>
              <CheckCircle size={12} /> Paid via Razorpay
            </div>
          )}
        </div>
      </div>

      <div className="m-container" style={{ marginTop: 20 }}>
        <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-outline" style={{ width: "100%" }}>
          <RefreshCcw size={16} /> Reorder fabric
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, green }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "var(--m-ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: green ? "var(--m-green)" : "var(--m-ink)" }}>{value}</span>
    </div>
  );
}
