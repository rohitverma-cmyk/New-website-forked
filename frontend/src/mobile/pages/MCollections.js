/**
 * MCollections — Mobile curated collections grid.
 *
 * Mirrors desktop /collections. Each card opens MCollectionDetail.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Layers, ChevronRight } from "lucide-react";
import { getCollections } from "../../lib/api";

export default function MCollections() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getCollections()
      .then((r) => { if (alive) setCollections(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ background: "var(--m-bg)", minHeight: "100%" }}>
      <div className="m-container" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--m-ink)", margin: "4px 0 8px" }}>Collections</h1>
        <p style={{ fontSize: 13, color: "var(--m-ink-2)", marginBottom: 14, lineHeight: 1.5 }}>
          Curated fabric stories — themed by use case, season, or sustainability profile.
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--m-ink-3)" }}>
            <Loader2 size={20} className="m-spinner" /> Loading…
          </div>
        ) : collections.length === 0 ? (
          <div className="m-card" style={{ padding: 32, textAlign: "center", border: "1px dashed var(--m-border-2)" }}>
            <Layers size={28} color="var(--m-ink-3)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "var(--m-ink-2)", margin: 0 }}>No collections yet.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {collections.map((c) => <CollectionCard key={c.id} c={c} onTap={() => navigate(`/m/collections/${c.slug || c.id}`)} />)}          </div>
        )}
      </div>
    </div>
  );
}

const CollectionCard = ({ c, onTap }) => (
  <button onClick={onTap} className="m-card" style={{ padding: 0, overflow: "hidden", textAlign: "left", border: "1px solid var(--m-border)", background: "var(--m-surface)" }}>
    {c.image_url && (
      <div style={{ width: "100%", height: 160, overflow: "hidden" }}>
        <img src={c.image_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    )}
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--m-ink)", margin: 0 }}>{c.name}</h3>
        <ChevronRight size={16} color="var(--m-ink-3)" />
      </div>
      {c.description && <p style={{ fontSize: 12, color: "var(--m-ink-2)", margin: "0 0 6px", lineHeight: 1.4 }}>{c.description}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--m-ink-3)" }}>
        <Layers size={12} />
        <span>{c.fabric_count || 0} fabrics</span>
      </div>
    </div>
  </button>
);
