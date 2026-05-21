/**
 * MCollectionDetail — Mobile fabrics inside a curated collection.
 *
 * Mirrors desktop /collections/:id. Reuses fabric-card pattern.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ChevronRight } from "lucide-react";
import { getCollection, getCollectionFabrics } from "../../lib/api";

export default function MCollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getCollection(id), getCollectionFabrics(id)])
      .then(([cRes, fRes]) => {
        if (!alive) return;
        setCollection(cRes.data);
        setFabrics(fRes.data || []);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div style={{ background: "var(--m-bg)", minHeight: "100%" }}>
      <div className="m-container" style={{ paddingTop: 8 }}>
        {collection?.name && (
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--m-ink)", margin: "4px 0 8px" }}>{collection.name}</h1>
        )}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--m-ink-3)" }}>
            <Loader2 size={20} className="m-spinner" /> Loading…
          </div>
        ) : collection ? (
          <>
            {collection.image_url && (
              <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                <img src={collection.image_url} alt={collection.name} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
              </div>
            )}
            {collection.description && <p style={{ fontSize: 14, color: "var(--m-ink-2)", margin: "0 0 14px", lineHeight: 1.5 }}>{collection.description}</p>}
            <p style={{ fontSize: 11, color: "var(--m-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
              {fabrics.length} fabric{fabrics.length !== 1 ? "s" : ""}
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              {fabrics.map((f) => (
                <button key={f.id} onClick={() => navigate(`/m/fabric/${f.slug || f.id}`)} className="m-card" style={{ padding: 0, display: "flex", alignItems: "stretch", textAlign: "left", overflow: "hidden", background: "var(--m-surface)", border: "1px solid var(--m-border)" }}>
                  {f.image_url && <img src={f.image_url} alt={f.name} style={{ width: 92, objectFit: "cover", flexShrink: 0 }} />}
                  <div style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--m-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>{f.category_name || "Fabric"}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink)", margin: 0, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{f.name}</p>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)", marginTop: 6, display: "inline-block" }}>₹{f.rate_per_meter || f.price_per_meter || 0}<span style={{ fontSize: 10, fontWeight: 500, color: "var(--m-ink-3)" }}>/m</span></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "var(--m-ink-3)" }}>
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={{ textAlign: "center", padding: 50, color: "var(--m-ink-3)" }}>Collection not found.</p>
        )}
      </div>
    </div>
  );
}
