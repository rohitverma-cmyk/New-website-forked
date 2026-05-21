/**
 * MInventory — Mobile Live B2C Inventory (ready-to-ship SKUs only).
 *
 * Mirrors desktop /inventory. Fetches with bookable_only=true so only
 * fabrics with quantity_available > 0 are shown. Each card shows the
 * available meterage and a one-tap "Book Now" → checkout.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Zap, ChevronRight, Loader2, Package } from "lucide-react";
import { getFabrics, getFabricsCount } from "../../lib/api";

export default function MInventory() {
  const navigate = useNavigate();
  const [fabrics, setFabrics] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = { bookable_only: true, limit: 50 };
        if (search.trim()) params.search = search.trim();
        const [f, c] = await Promise.all([getFabrics(params), getFabricsCount(params)]);
        setFabrics((f.data || []).sort((a, b) => (b.quantity_available || 0) - (a.quantity_available || 0)));
        setTotal(c.data?.count || 0);
      } catch (_) {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div style={{ background: "var(--m-bg)", minHeight: "100%" }}>
      <div className="m-container" style={{ paddingTop: 8 }}>
        {/* Banner */}
        <div style={{ background: "linear-gradient(135deg, var(--m-blue) 0%, #1E40AF 100%)", color: "#fff", borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <Zap size={22} fill="#FBBF24" color="#FBBF24" />
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Ready to ship</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{total} SKUs in stock · dispatch in 48–72h</p>
          </div>
        </div>

        {/* Search */}
        <div className="m-card" style={{ padding: "4px 6px 4px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 14, border: "1px solid var(--m-border-2)" }}>
          <Search size={18} color="var(--m-ink-3)" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ready stock…"
            style={{ flex: 1, border: "none", outline: "none", boxShadow: "none", padding: "12px 0", fontSize: 15, background: "transparent", color: "var(--m-ink)" }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--m-ink-3)" }}>
            <Loader2 size={20} className="m-spinner" /> Loading…
          </div>
        ) : fabrics.length === 0 ? (
          <div className="m-card" style={{ padding: 32, textAlign: "center", border: "1px dashed var(--m-border-2)" }}>
            <Package size={28} color="var(--m-ink-3)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "var(--m-ink-2)", margin: 0 }}>No matching ready-stock fabrics.</p>
            {search && <p style={{ fontSize: 12, color: "var(--m-ink-3)", margin: "4px 0 0" }}>Try a different keyword.</p>}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {fabrics.map((f) => <InventoryCard key={f.id} f={f} onTap={() => navigate(`/m/fabric/${f.slug || f.id}`)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const InventoryCard = ({ f, onTap }) => {
  const qty = f.quantity_available || 0;
  const lowStock = qty > 0 && qty < 100;
  return (
    <button onClick={onTap} className="m-card" style={{ padding: 0, display: "flex", alignItems: "stretch", textAlign: "left", overflow: "hidden", background: "var(--m-surface)", border: "1px solid var(--m-border)" }}>
      {f.image_url && (
        <div style={{ width: 92, flexShrink: 0, position: "relative" }}>
          <img src={f.image_url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {lowStock && (
            <span style={{ position: "absolute", top: 6, left: 6, background: "var(--m-amber)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>LOW</span>
          )}
        </div>
      )}
      <div style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>
          {f.category_name || "Fabric"}
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink)", margin: 0, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {f.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--m-ink)" }}>₹{f.rate_per_meter || f.price_per_meter || 0}<span style={{ fontSize: 10, fontWeight: 500, color: "var(--m-ink-3)" }}>/m</span></span>
          <span style={{ fontSize: 11, color: "var(--m-green)", fontWeight: 600 }}>{qty}m in stock</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "var(--m-ink-3)" }}>
        <ChevronRight size={16} />
      </div>
    </button>
  );
};
