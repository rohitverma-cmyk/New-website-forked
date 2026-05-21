import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Share2, Heart, Zap, Package, Truck, Shield, ShoppingBag, MessageCircle, FileText } from "lucide-react";
import api from "../../lib/api";
import {
  formatCompositionShort,
  formatWeight,
  formatWidth,
  formatPriceINR,
  getBulkPrice,
  getSamplePrice,
  getStockBadge,
} from "../lib/format";
import BottomSheet from "../components/BottomSheet";

export default function MFabricDetail() {
  const { slugOrId } = useParams();
  const navigate = useNavigate();
  const [fabric, setFabric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageIdx, setImageIdx] = useState(0);
  const [variantIdx, setVariantIdx] = useState(0);
  const [orderType, setOrderType] = useState(null); // 'sample' | 'bulk'
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        // Try slug first, fall back to id
        let res;
        try {
          res = await api.get(`/fabrics/${slugOrId}`);
        } catch (e) {
          // Already an id maybe; the slug endpoint accepts both
          throw e;
        }
        if (alive) setFabric(res.data);
      } catch (err) {
        console.error("Fabric fetch failed:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slugOrId]);

  if (loading) {
    return (
      <div className="m-container" style={{ paddingTop: 16 }}>
        <div className="m-skeleton" style={{ width: "100%", height: 320, borderRadius: 16 }} />
        <div className="m-skeleton" style={{ width: "60%", height: 14, marginTop: 16 }} />
        <div className="m-skeleton" style={{ width: "90%", height: 22, marginTop: 12 }} />
        <div className="m-skeleton" style={{ width: "100%", height: 70, marginTop: 16 }} />
      </div>
    );
  }

  if (!fabric) {
    return (
      <div className="m-container" style={{ paddingTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔎</div>
        <div className="m-title">Fabric not found</div>
        <button onClick={() => navigate("/m/catalog")} className="m-btn m-btn-primary" style={{ marginTop: 16 }}>Browse catalog</button>
      </div>
    );
  }

  const variants = Array.isArray(fabric.color_variants) ? fabric.color_variants : [];
  const currentVariant = variants[variantIdx] || null;
  // Compose image list: variant images if set, else main fabric images
  const baseImages = (currentVariant && Array.isArray(currentVariant.images) && currentVariant.images.length
    ? currentVariant.images
    : (fabric.images || []));
  const images = baseImages.length ? baseImages : [];

  const sample = getSamplePrice(fabric);
  const bulk = getBulkPrice(fabric);
  const stock = getStockBadge(fabric);
  const composition = formatCompositionShort(fabric.composition);

  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: fabric.name, url }); } catch (e) {}
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  };

  const startBooking = (type) => {
    setOrderType(type);
    setQty(type === "sample" ? 1 : Math.max(parseFloat(fabric.moq) || 100, 50));
  };

  const confirmBooking = () => {
    const params = new URLSearchParams({
      fabric: fabric.id,
      qty: String(qty),
      type: orderType,
    });
    if (currentVariant) params.set("variant", currentVariant.id || String(variantIdx));
    navigate(`/m/checkout?${params.toString()}`);
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Custom transparent app bar overlay */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px" }}>
          <button onClick={() => navigate(-1)} style={iconButtonStyle()} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onShare} style={iconButtonStyle()} aria-label="Share">
              <Share2 size={18} />
            </button>
            <button style={iconButtonStyle()} aria-label="Save">
              <Heart size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Image carousel */}
      <ImageCarousel images={images} activeIdx={imageIdx} onChange={setImageIdx} fabricName={fabric.name} />

      <div className="m-container" style={{ paddingTop: 14 }}>
        {/* Title block */}
        <div className="m-kicker">{fabric.category_name || "Fabric"}</div>
        <h1 className="m-title-lg" style={{ marginTop: 6 }}>{fabric.name}</h1>
        {composition && (
          <p className="m-body" style={{ marginTop: 6 }}>{composition}</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {formatWeight(fabric) && <span className="m-chip">{formatWeight(fabric)}</span>}
          {formatWidth(fabric) && <span className="m-chip">{formatWidth(fabric)}</span>}
          {fabric.color && !variants.length && <span className="m-chip">🎨 {fabric.color}</span>}
          {fabric.fabric_type && <span className="m-chip" style={{ textTransform: "capitalize" }}>{fabric.fabric_type}</span>}
          {fabric.finish && <span className="m-chip">{fabric.finish}</span>}
        </div>
        {stock && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "6px 10px", borderRadius: 999,
            background: stock.tone === "green" ? "var(--m-green-50)" : stock.tone === "amber" ? "#fef3c7" : "#fee2e2",
            color: stock.tone === "green" ? "var(--m-green)" : stock.tone === "amber" ? "var(--m-amber)" : "var(--m-red)",
            fontSize: 12, fontWeight: 700,
          }}>
            <Package size={13} /> {stock.label}
          </div>
        )}
      </div>

      {/* Pricing card */}
      {(sample != null || bulk != null) && (
        <div className="m-container" style={{ marginTop: 16 }}>
          <div className="m-card" style={{ padding: 16, display: "flex", gap: 12 }}>
            {sample != null && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)" }}>Sample / meter</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--m-ink)", marginTop: 2 }}>{formatPriceINR(sample)}</div>
              </div>
            )}
            {sample != null && bulk != null && (
              <div style={{ width: 1, background: "var(--m-border-2)" }} />
            )}
            {bulk != null && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--m-ink-3)" }}>Bulk / meter</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--m-orange-700)", marginTop: 2 }}>{formatPriceINR(bulk)}</div>
                {fabric.moq && <div className="m-caption" style={{ marginTop: 2 }}>MOQ: {fabric.moq}</div>}
              </div>
            )}
          </div>
          {fabric.is_bookable && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "var(--m-orange-50)", color: "var(--m-orange-700)", fontSize: 12, fontWeight: 700 }}>
              <Zap size={12} /> Ready stock · Book now
            </div>
          )}
        </div>
      )}

      {/* Color variants */}
      {variants.length > 0 && (
        <section className="m-container" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div className="m-kicker">Colors</div>
            <div className="m-caption">{variants.length} variants</div>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
            {variants.map((v, i) => {
              const swatch = (v.images && v.images[0]) || (fabric.images && fabric.images[0]);
              return (
                <button
                  key={i}
                  onClick={() => { setVariantIdx(i); setImageIdx(0); }}
                  style={{
                    flex: "0 0 auto", width: 64, padding: 0, background: "transparent", border: "none", textAlign: "center", cursor: "pointer",
                  }}
                >
                  <div style={{
                    width: 60, height: 60, borderRadius: 12, overflow: "hidden",
                    border: variantIdx === i ? "2px solid var(--m-orange)" : "2px solid transparent",
                    boxShadow: variantIdx === i ? "0 0 0 2px rgba(255,122,61,0.18)" : "none",
                    background: swatch ? `url(${swatch}) center/cover` : "var(--m-border)",
                  }} />
                  <div style={{ fontSize: 10, fontWeight: 600, color: variantIdx === i ? "var(--m-orange-700)" : "var(--m-ink-2)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name || v.color || `Color ${i+1}`}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Specs */}
      <section className="m-container" style={{ marginTop: 20 }}>
        <h2 className="m-title" style={{ marginBottom: 10 }}>Specifications</h2>
        <div className="m-card" style={{ padding: 4 }}>
          {[
            ["Composition", composition],
            ["Weight", formatWeight(fabric)],
            ["Width", formatWidth(fabric)],
            ["Fabric type", fabric.fabric_type],
            ["Weave", fabric.weave_type],
            ["Construction", fabric.construction],
            ["Finish", fabric.finish],
            ["Pattern", fabric.pattern],
            ["MOQ", fabric.moq],
            ["Sample SLA", fabric.sample_delivery_days && `${fabric.sample_delivery_days} days`],
            ["Bulk SLA", fabric.bulk_delivery_days && `${fabric.bulk_delivery_days} days`],
            ["Article code", fabric.fabric_code || fabric.article_id || fabric.seller_code],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--m-border)", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--m-ink-3)" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--m-ink)", textAlign: "right", textTransform: k === "Fabric type" ? "capitalize" : "none" }}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Description */}
      {fabric.description && (
        <section className="m-container" style={{ marginTop: 20 }}>
          <h2 className="m-title" style={{ marginBottom: 8 }}>About this fabric</h2>
          <p className="m-body" style={{ lineHeight: 1.55, color: "var(--m-ink-2)" }}>{fabric.description}</p>
        </section>
      )}

      {/* Seller / Certifications */}
      {(fabric.seller_company || fabric.seller_name) && (
        <section className="m-container" style={{ marginTop: 20 }}>
          <div className="m-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--m-orange-50)", color: "var(--m-orange-700)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
              {(fabric.seller_company || fabric.seller_name || "S").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--m-ink-3)" }}>Sold by</div>
              <div style={{ fontWeight: 700, color: "var(--m-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fabric.seller_company || fabric.seller_name}
              </div>
            </div>
            <span className="m-chip m-chip-blue"><Shield size={12} /> Verified</span>
          </div>
        </section>
      )}

      {/* Logistics SLA */}
      <section className="m-container" style={{ marginTop: 20 }}>
        <div className="m-card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Truck size={18} color="var(--m-orange)" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--m-ink)" }}>Dispatch SLA</div>
              <div className="m-caption">Samples in 48–72h · Bulk made-to-order 21–30 days</div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky bottom CTAs */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: "calc(var(--m-tab-h) + env(safe-area-inset-bottom, 0px))",
        background: "var(--m-surface)", borderTop: "1px solid var(--m-border)",
        padding: "10px 16px", display: "flex", gap: 10, zIndex: 50,
        boxShadow: "0 -4px 20px rgba(15,27,45,0.06)",
      }}>
        <button onClick={() => navigate("/m/rfq?fabric=" + fabric.id)} className="m-btn m-btn-outline" style={{ flex: "0 0 auto", padding: "0 14px", aspectRatio: "1" }} aria-label="Ask for a quote">
          <MessageCircle size={20} />
        </button>
        {sample != null && (
          <button onClick={() => startBooking("sample")} className="m-btn m-btn-outline" style={{ flex: 1 }}>
            <Package size={16} /> Sample
          </button>
        )}
        <button onClick={() => startBooking(bulk != null ? "bulk" : (sample != null ? "sample" : "sample"))} className="m-btn m-btn-primary" style={{ flex: 1.4 }}>
          <ShoppingBag size={16} /> Book {fabric.is_bookable ? "Now" : "Bulk"}
        </button>
      </div>

      {/* Booking quantity sheet */}
      <BottomSheet
        open={!!orderType}
        onClose={() => setOrderType(null)}
        title={orderType === "sample" ? "Order sample" : "Book bulk"}
        footer={
          <button onClick={confirmBooking} className="m-btn m-btn-primary" style={{ width: "100%" }}>
            Continue to checkout
          </button>
        }
      >
        <div style={{ padding: "8px 0" }}>
          <div className="m-kicker">{orderType === "sample" ? "Quantity (meters)" : "Quantity (meters)"}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "4px 4px 4px 18px", border: "1px solid var(--m-border-2)", borderRadius: 14 }}>
            <button onClick={() => setQty(Math.max(orderType === "sample" ? 1 : 50, qty - (orderType === "sample" ? 1 : 50)))} style={qtyBtn()}>−</button>
            <input
              type="number"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "0", 10)))}
              style={{ flex: 1, textAlign: "center", border: "none", outline: "none", fontSize: 22, fontWeight: 800, color: "var(--m-ink)", padding: "12px 4px", background: "transparent" }}
            />
            <button onClick={() => setQty(qty + (orderType === "sample" ? 1 : 50))} style={qtyBtn()}>+</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {(orderType === "sample" ? [1, 3, 5, 10] : [100, 250, 500, 1000]).map((n) => (
              <button key={n} onClick={() => setQty(n)} className={"m-chip" + (qty === n ? " m-chip-on" : "")} style={{ padding: "7px 12px" }}>
                {n}m
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "var(--m-bg)", border: "1px solid var(--m-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
              <span style={{ color: "var(--m-ink-3)" }}>Rate / meter</span>
              <span style={{ fontWeight: 600, color: "var(--m-ink)" }}>{formatPriceINR(orderType === "sample" ? sample : bulk) || "On request"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
              <span style={{ color: "var(--m-ink-3)" }}>Quantity</span>
              <span style={{ fontWeight: 600, color: "var(--m-ink)" }}>{qty}m</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", borderTop: "1px dashed var(--m-border-2)", marginTop: 6 }}>
              <span style={{ fontWeight: 700, color: "var(--m-ink)" }}>Subtotal</span>
              <span style={{ fontWeight: 800, color: "var(--m-orange-700)", fontSize: 18 }}>
                {(() => {
                  const rate = orderType === "sample" ? sample : bulk;
                  if (rate == null) return "—";
                  return formatPriceINR(rate * qty);
                })()}
              </span>
            </div>
          </div>
          <p className="m-caption" style={{ marginTop: 12 }}>
            <FileText size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            Final pricing confirmed at checkout. GST + shipping applied as per address.
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

function iconButtonStyle() {
  return {
    width: 40, height: 40, borderRadius: "50%",
    background: "rgba(255,255,255,0.92)", color: "var(--m-ink)",
    border: "none", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 8px rgba(15,27,45,0.12)", cursor: "pointer",
    backdropFilter: "blur(8px)",
  };
}

function qtyBtn() {
  return { width: 44, height: 44, border: "none", background: "transparent", color: "var(--m-ink)", fontSize: 20, fontWeight: 700, cursor: "pointer" };
}

function ImageCarousel({ images, activeIdx, onChange, fabricName }) {
  if (!images || images.length === 0) {
    return (
      <div style={{ width: "100%", height: 320, background: "linear-gradient(135deg, var(--m-orange-50), #FFE3CE)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--m-orange-700)" }}>
        <Package size={60} />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 360, position: "relative", overflow: "hidden", background: "var(--m-bg)" }}>
      <div style={{ display: "flex", height: "100%", overflowX: "auto", scrollSnapType: "x mandatory", scrollBehavior: "smooth" }}
           onScroll={(e) => {
             const w = e.currentTarget.clientWidth;
             const i = Math.round(e.currentTarget.scrollLeft / w);
             if (i !== activeIdx) onChange(i);
           }}>
        {images.map((src, i) => (
          <div key={i} style={{ flex: "0 0 100%", height: "100%", scrollSnapAlign: "start" }}>
            <img src={src} alt={`${fabricName} ${i+1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(15,27,45,0.6)", backdropFilter: "blur(6px)" }}>
          {images.map((_, i) => (
            <div key={i} style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? "#fff" : "rgba(255,255,255,0.5)", transition: "width .2s ease" }} />
          ))}
        </div>
      )}
    </div>
  );
}
