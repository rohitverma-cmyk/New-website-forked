import { useNavigate } from "react-router-dom";
import { Store, Package } from "lucide-react";
import {
  formatCompositionShort,
  formatWeight,
  formatWidth,
  formatPriceINR,
  getBulkPrice,
  getSamplePrice,
  getStockBadge,
  getFabricUrl,
  getPrimaryImage,
} from "../lib/format";

export default function FabricCard({ fabric, variant = "rail" }) {
  const navigate = useNavigate();
  if (!fabric) return null;

  const img = getPrimaryImage(fabric);
  const stock = getStockBadge(fabric);
  const sample = getSamplePrice(fabric);
  const bulk = getBulkPrice(fabric);
  const composition = formatCompositionShort(fabric.composition);
  const url = getFabricUrl(fabric);

  // "rail" variant: 78% viewport width, horizontal scroll. "grid" variant: full width, vertical list.
  const widthStyle = variant === "rail" ? { width: "78vw", maxWidth: 320 } : { width: "100%" };

  return (
    <button
      onClick={() => navigate(url)}
      className="m-card"
      style={{
        ...widthStyle,
        textAlign: "left", padding: 0, overflow: "hidden",
        display: "flex", flexDirection: "column", border: "1px solid var(--m-border)",
        background: "var(--m-surface)", cursor: "pointer",
      }}
    >
      <div style={{
        height: variant === "rail" ? 160 : 200,
        background: img
          ? `linear-gradient(180deg, rgba(15,27,45,0) 0%, rgba(15,27,45,0.15) 100%), url(${img}) center/cover no-repeat`
          : "linear-gradient(135deg, #FFF1E6, #FFE3CE)",
        position: "relative",
      }}>
        {!img && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--m-orange)", opacity: 0.5 }}>
            <Package size={40} />
          </div>
        )}
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          {stock && (
            <span style={{
              padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: stock.tone === "green" ? "#fff" : stock.tone === "amber" ? "#fef3c7" : "#fee2e2",
              color: stock.tone === "green" ? "var(--m-green)" : stock.tone === "amber" ? "var(--m-amber)" : "var(--m-red)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}>{stock.label}</span>
          )}
          {fabric.is_bookable && (
            <span style={{
              padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: "var(--m-orange)", color: "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}>⚡ BOOK NOW</span>
          )}
        </div>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-orange-700)" }}>
          {fabric.category_name || "Fabric"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: "var(--m-ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {fabric.name}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {formatWeight(fabric) && <span className="m-chip" style={{ padding: "3px 8px", fontSize: 11 }}>{formatWeight(fabric)}</span>}
          {formatWidth(fabric) && <span className="m-chip" style={{ padding: "3px 8px", fontSize: 11 }}>{formatWidth(fabric)}</span>}
        </div>
        {composition && (
          <div style={{ fontSize: 12, color: "var(--m-ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {composition}
          </div>
        )}
        <div style={{
          marginTop: 8, paddingTop: 10, borderTop: "1px dashed var(--m-border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8,
        }}>
          {sample != null ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sample</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--m-ink)" }}>{formatPriceINR(sample)}<span style={{ fontSize: 11, color: "var(--m-ink-3)", marginLeft: 2 }}>/m</span></div>
            </div>
          ) : <div />}
          {bulk != null ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Bulk</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--m-orange-700)" }}>{formatPriceINR(bulk)}<span style={{ fontSize: 11, color: "var(--m-ink-3)", marginLeft: 2 }}>/m</span></div>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function FabricCardSkeleton({ variant = "rail" }) {
  const w = variant === "rail" ? "78vw" : "100%";
  return (
    <div className="m-card" style={{ width: w, maxWidth: 320, overflow: "hidden" }}>
      <div className="m-skeleton" style={{ height: variant === "rail" ? 160 : 200, borderRadius: 0 }} />
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="m-skeleton" style={{ height: 10, width: "30%" }} />
        <div className="m-skeleton" style={{ height: 14, width: "90%" }} />
        <div className="m-skeleton" style={{ height: 14, width: "70%" }} />
        <div className="m-skeleton" style={{ height: 24, width: "100%", marginTop: 4 }} />
      </div>
    </div>
  );
}
