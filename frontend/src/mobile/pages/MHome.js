import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Zap, CreditCard, Gift, FileText, ArrowRight, ChevronRight, Truck, Shield } from "lucide-react";
import api from "../../lib/api";
import FabricCard, { FabricCardSkeleton } from "../components/FabricCard";
import CategoryPill from "../components/CategoryPill";

export default function MHome() {
  const navigate = useNavigate();
  const [fabrics, setFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          api.get("/fabrics", { params: { limit: 12 } }),
          api.get("/categories"),
        ]);
        if (!alive) return;
        setFabrics(Array.isArray(fRes.data) ? fRes.data : []);
        setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      } catch (err) {
        console.error("Home fetch failed:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const trending = fabrics.slice(0, 8);
  const bookableCount = fabrics.filter((f) => f.is_bookable).length;

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Hero */}
      <section style={{ padding: "12px 16px 4px" }}>
        <div className="m-kicker" style={{ display: "inline-flex" }}>For Fashion Brands</div>
        <h1 className="m-title-xl" style={{ marginTop: 8 }}>
          Hundreds of ready-to-sew fabrics.
        </h1>
        <p className="m-body" style={{ marginTop: 8 }}>
          Sample today, refill the winners. Dispatch in 48–72h · 5,000 free credits on signup.
        </p>
      </section>

      {/* Search shortcut card */}
      <section style={{ padding: "12px 16px 0" }}>
        <button
          onClick={() => navigate("/m/catalog?focus=search")}
          className="m-card"
          style={{
            width: "100%", padding: 14, display: "flex", alignItems: "center", gap: 12,
            background: "var(--m-surface)", border: "1px solid var(--m-border)",
            textAlign: "left", cursor: "pointer",
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg, var(--m-orange), var(--m-orange-700))",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>
            <Search size={20} strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--m-ink)" }}>Search fabrics</div>
            <div className="m-caption" style={{ marginTop: 2 }}>Try "12oz denim", "slub cotton", "180 GSM"…</div>
          </div>
          <ChevronRight size={20} color="var(--m-ink-3)" />
        </button>
      </section>

      {/* Quick filter chips */}
      <section className="m-rail" style={{ marginTop: 12 }}>
        {[
          { label: "⚡ Book Now", to: "/m/catalog?bookable=1", tone: "orange" },
          { label: "🔥 Trending", to: "/m/catalog?sort=trending" },
          { label: "🧵 Denim", to: "/m/catalog?q=denim" },
          { label: "🌾 Cotton", to: "/m/catalog?q=cotton" },
          { label: "✨ Stretch", to: "/m/catalog?q=stretch" },
          { label: "🌱 Sustainable", to: "/m/catalog?q=sustainable" },
        ].map((c) => (
          <button
            key={c.label}
            onClick={() => navigate(c.to)}
            className={"m-chip" + (c.tone === "orange" ? " m-chip-orange" : "")}
            style={{ padding: "9px 14px", fontWeight: 600 }}
          >
            {c.label}
          </button>
        ))}
      </section>

      {/* Promo strip */}
      <section className="m-container" style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: Zap, color: "var(--m-orange)", bg: "var(--m-orange-50)", title: "Samples in 48–72h", sub: "Ready stock dispatch" },
            { icon: CreditCard, color: "var(--m-blue)", bg: "var(--m-blue-50)", title: "Embedded credit", sub: "Approved at checkout" },
            { icon: Gift, color: "var(--m-green)", bg: "var(--m-green-50)", title: "5,000 free credits", sub: "For new brands" },
            { icon: FileText, color: "#0F1B2D", bg: "#EAEEF5", title: "SLA in writing", sub: "Every PO, predictable" },
          ].map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="m-card" style={{ padding: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: p.bg, color: p.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={18} strokeWidth={2.2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)", lineHeight: 1.25 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "var(--m-ink-3)", marginTop: 2 }}>{p.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Categories rail */}
      {categories.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div className="m-container" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div className="m-kicker">Catalog</div>
              <h2 className="m-title" style={{ marginTop: 2 }}>Browse by category</h2>
            </div>
            <button onClick={() => navigate("/m/catalog")} style={{ background: "none", border: "none", color: "var(--m-blue)", fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 2 }}>
              All <ChevronRight size={14} />
            </button>
          </div>
          <div className="m-rail">
            {categories.map((c) => (
              <CategoryPill key={c.id} category={c} count={c.fabric_count} />
            ))}
            {["Dyed / Printed", "Knits"].map((name) => (
              <CategoryPill key={name} category={{ id: name, name }} comingSoon />
            ))}
          </div>
        </section>
      )}

      {/* Trending fabrics */}
      <section style={{ marginTop: 24 }}>
        <div className="m-container" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div className="m-kicker" style={{ color: "#dc2626" }}>🔥 Trending</div>
            <h2 className="m-title" style={{ marginTop: 2 }}>Best-selling fabrics</h2>
          </div>
          <button onClick={() => navigate("/m/catalog")} style={{ background: "none", border: "none", color: "var(--m-blue)", fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 2 }}>
            View all <ChevronRight size={14} />
          </button>
        </div>
        <div className="m-rail">
          {loading ? (
            <>
              <FabricCardSkeleton />
              <FabricCardSkeleton />
              <FabricCardSkeleton />
            </>
          ) : trending.length ? (
            trending.map((f) => <FabricCard key={f.id} fabric={f} variant="rail" />)
          ) : (
            <div className="m-container m-body">No fabrics yet. Check back soon.</div>
          )}
        </div>
      </section>

      {/* Logistics SLAs */}
      <section className="m-container" style={{ marginTop: 28 }}>
        <div className="m-kicker">Dispatch SLA</div>
        <h2 className="m-title" style={{ marginTop: 2 }}>Predictable timelines, in writing</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {[
            { num: "48–72h", lbl: "Sample dispatch", color: "var(--m-orange)", bg: "var(--m-orange-50)" },
            { num: "7 days", lbl: "Lab-dip / strike-off", color: "var(--m-ink)", bg: "#F4F1EB" },
            { num: "21 days", lbl: "Greige made-to-order", color: "var(--m-ink)", bg: "#F4F1EB" },
            { num: "30 days", lbl: "Denim made-to-order", color: "var(--m-blue)", bg: "var(--m-blue-50)" },
          ].map((p) => (
            <div key={p.lbl} className="m-card" style={{ padding: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: p.bg, color: p.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Truck size={16} strokeWidth={2.2} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: p.color, letterSpacing: "-0.01em" }}>{p.num}</div>
              <div style={{ fontSize: 11, color: "var(--m-ink-3)", marginTop: 2 }}>{p.lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="m-chip m-chip-blue"><Shield size={12} /> GST-verified</span>
          <span className="m-chip m-chip-blue"><Shield size={12} /> Factory-audited</span>
          <span className="m-chip">500+ sellers</span>
          <span className="m-chip">India · Bangladesh</span>
        </div>
      </section>

      {/* Final CTA */}
      <section className="m-container" style={{ marginTop: 28, marginBottom: 12 }}>
        <div
          style={{
            padding: 20, borderRadius: "var(--m-radius-lg)",
            background: "linear-gradient(135deg, #0F1B2D, #1e293b)",
            color: "#fff", position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,122,61,0.3), transparent 70%)" }} />
          <div style={{ position: "relative" }}>
            <div className="m-kicker" style={{ color: "#FFB58A" }}>Free for brands</div>
            <h2 className="m-title-lg" style={{ marginTop: 6, color: "#fff" }}>
              Sample to delivery, on one platform.
            </h2>
            <p className="m-body" style={{ marginTop: 8, color: "rgba(255,255,255,0.75)" }}>
              5,000 free sample credits · Same-day catalog · Dispatch SLA in writing
            </p>
            <button
              onClick={() => navigate("/m/rfq")}
              className="m-btn m-btn-primary"
              style={{ marginTop: 14, width: "100%" }}
            >
              Request a Quote <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate("/m/catalog")}
              style={{
                marginTop: 8, width: "100%", padding: "12px 18px", borderRadius: 12,
                background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              Browse Catalog
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
