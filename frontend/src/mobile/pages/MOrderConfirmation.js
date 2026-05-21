/**
 * MOrderConfirmation — Mobile "order placed!" success screen.
 *
 * Mirrors desktop /order-confirmation/:orderNumber. Big confirmation,
 * order summary, Download Invoice + Track Shipment + Share CTAs.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Download, Truck, Share2, ChevronRight, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { getOrder, downloadInvoice } from "../../lib/api";

export default function MOrderConfirmation() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getOrder(orderNumber)
      .then((r) => { if (alive) setOrder(r.data); })
      .catch(() => { if (alive) toast.error("Could not load order"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderNumber]);

  const handleDownload = () => {
    // downloadInvoice returns a direct backend URL (already encoded).
    // Open in new tab — browser handles the PDF download with backend's
    // Content-Disposition header.
    const url = downloadInvoice(order.id || orderNumber);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    const shareData = {
      title: `Locofast Order ${orderNumber}`,
      text: `Order ${orderNumber} confirmed on Locofast — ₹${(order?.total || 0).toLocaleString()}`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (_) {}
    } else {
      navigator.clipboard.writeText(shareData.url);
      toast.success("Link copied");
    }
  };

  if (loading) {
    return (
      <div className="m-app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--m-ink-3)" }}>
        <Loader2 className="m-spinner" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="m-app" style={{ minHeight: "100vh", padding: 24, textAlign: "center" }}>
        <p>Order not found.</p>
        <button onClick={() => navigate("/m")} className="m-btn m-btn-primary" style={{ marginTop: 16 }}>Go home</button>
      </div>
    );
  }

  return (
    <div className="m-app" style={{ minHeight: "100vh", background: "var(--m-bg)", paddingBottom: 32 }}>
      {/* Celebration banner */}
      <div style={{ background: "linear-gradient(160deg, var(--m-blue) 0%, #1E40AF 100%)", color: "#fff", padding: "40px 20px 32px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: "rgba(255,255,255,0.15)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <CheckCircle2 size={36} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>Order placed!</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: "6px 0 0" }}>{order.order_number}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", margin: "10px 0 0", lineHeight: 1.5, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
          A confirmation has been sent to <strong>{order.customer?.email}</strong>. We'll notify you when your fabric is dispatched.
        </p>
      </div>

      <div className="m-container" style={{ paddingTop: 16 }}>
        {/* Order summary card */}
        <div className="m-card" style={{ padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Order summary</h3>
          {(order.items || []).map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: i < (order.items.length - 1) ? "1px solid var(--m-border)" : "none" }}>
              {it.image_url && <img src={it.image_url} alt={it.fabric_name} style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink)", margin: 0, lineHeight: 1.3 }}>{it.fabric_name}</p>
                <p style={{ fontSize: 11, color: "var(--m-ink-3)", margin: "2px 0 0" }}>{it.quantity}m × ₹{it.price_per_meter}/m</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)" }}>₹{((it.quantity || 0) * (it.price_per_meter || 0)).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--m-border)", fontSize: 14, fontWeight: 800, color: "var(--m-ink)" }}>
            <span>Total paid</span>
            <span>₹{(order.total || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* CTAs */}
        <button onClick={handleDownload} className="m-btn m-btn-primary" style={{ width: "100%", marginBottom: 10 }}>
          <Download size={16} /> Download invoice (PDF)
        </button>
        <button onClick={() => navigate(`/m/orders/${order.id}`)} className="m-btn m-btn-outline" style={{ width: "100%", marginBottom: 10 }}>
          <Truck size={16} /> Track shipment <ChevronRight size={14} style={{ marginLeft: "auto" }} />
        </button>
        <button onClick={handleShare} className="m-btn m-btn-ghost" style={{ width: "100%", marginBottom: 16 }}>
          <Share2 size={16} /> Share order link
        </button>

        {/* What next */}
        <div className="m-card" style={{ padding: 14, background: "var(--m-blue-50)", border: "1px solid #DBEAFE" }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--m-blue)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
            <Package size={14} /> What happens next
          </h4>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--m-ink-2)", lineHeight: 1.7 }}>
            <li>Vendor receives the order and confirms (≤24h)</li>
            <li>Dispatch within 48–72 h with tracking number</li>
            <li>You get SMS + email updates at each step</li>
          </ol>
        </div>

        <p style={{ textAlign: "center", marginTop: 18 }}>
          <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-ghost" style={{ fontSize: 13 }}>Continue browsing</button>
        </p>
      </div>
    </div>
  );
}
