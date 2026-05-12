import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { useBrandCart } from "../../context/BrandCartContext";
import BrandLayout from "./BrandLayout";
import { Loader2, ArrowLeft, ShoppingCart, Beaker, MessageSquare, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import RFQModal from "../../components/RFQModal";
import InventoryShortfallModal from "../../components/InventoryShortfallModal";
import { fmtLacs, fmtINR, fmtCount } from "../../lib/inr";
import { displayFabricName } from "../../lib/fabricDisplay";
import { thumbImage, mediumImage, fabricCoverImage } from "../../lib/imageUrl";
import { DispatchStrip } from "../../components/DispatchBadges";
import { toWebVideoUrl, videoPosterUrl } from "../../lib/videoUrl";
import Watermark from "../../components/Watermark";
import CertificationBadges from "../../components/CertificationBadges";
import CertificationDisclaimer from "../../components/CertificationDisclaimer";

const API = process.env.REACT_APP_BACKEND_URL;

const MAX_SAMPLE_METERS = 5;

// Compact spec row used on the PDP — keeps the grid tidy and avoids
// repeating the same wrapper markup for each attribute.
const SpecRow = ({ label, value, mono = false }) => (
  <div className="flex flex-col gap-0.5 border-b border-gray-100 pb-2">
    <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
    <span className={`text-gray-800 font-medium break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
  </div>
);

const BrandFabricDetail = () => {
  const { id } = useParams();
  const { user, token } = useBrandAuth();
  const { addLine } = useBrandCart();
  const navigate = useNavigate();
  const [fabric, setFabric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [orderType, setOrderType] = useState("bulk");
  const [qty, setQty] = useState(1);
  const [summary, setSummary] = useState(null);
  const [showRfq, setShowRfq] = useState(false);
  const [showShortfallModal, setShowShortfallModal] = useState(false);

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    (async () => {
      try {
        const [fRes, sRes] = await Promise.all([
          fetch(`${API}/api/brand/fabrics/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/brand/credit-summary`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const fd = await fRes.json();
        if (!fRes.ok) throw new Error(fd.detail || "Failed");
        setFabric(fd);
        const summaryData = await sRes.json();
        setSummary(summaryData);
        // #1: If the brand has sample credits, default to Sample order mode —
        // matches the user's expectation that picking "sample" workflow on
        // signup carries through to every fabric they open.
        const sampleAvailable = summaryData?.sample_credits?.available ?? 0;
        if (sampleAvailable > 0) {
          setOrderType("sample");
          // Samples are 1-of, MOQ doesn't apply; show 1 by default
          setQty(1);
        } else {
          // Bulk default — start at MOQ
          const moq = Number(fd.moq || 1);
          setQty(moq);
        }
        const variants = fd.color_variants || [];
        if (fd.has_multiple_colors && variants.length) {
          setSelectedVariant(variants.find((v) => (v.quantity_available ?? 0) > 0) || variants[0]);
        }
        // Default the gallery hero to the first product image so thumbnails
        // and the main image stay in sync from the start.
        const firstImg = (fd.images || [])[0];
        if (firstImg) setActiveImage(firstImg);
      } catch (err) {
        toast.error(err.message || "Fabric not found");
        navigate("/enterprise/fabrics");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token, user]);

  const rate = Number(fabric?.rate_per_meter || fabric?.price_per_meter || 0);
  const samplePrice = Number(fabric?.sample_price || 100);
  const unit = fabric?.fabric_type === "knitted" && fabric?.category_id !== "cat-denim" ? "kg" : "m";

  const moqValue = (() => {
    const m = fabric?.moq;
    if (typeof m === "number") return m;
    if (typeof m === "string") {
      const match = m.match(/^\s*(\d+)/);
      if (match) return Number(match[1]);
    }
    return 1;
  })();

  const lineTotal = orderType === "sample" ? samplePrice * qty : rate * qty;
  const availableCredit = summary?.credit?.available ?? 0;
  const availableSample = summary?.sample_credits?.available ?? 0;

  // Max bookable for bulk = selected variant's stock (if variant-level) else fabric total
  const maxBulkQty = (() => {
    const variantQty = Number(selectedVariant?.quantity_available ?? NaN);
    if (Number.isFinite(variantQty) && variantQty > 0) return variantQty;
    const fabQty = Number(fabric?.quantity_available || 0);
    return fabQty > 0 ? fabQty : Infinity; // no limit recorded
  })();

  // We allow the user to type a qty above the available stock; the
  // shortfall modal then triggers, splitting the order into an inventory
  // line + a shortfall RFQ. So the qty input itself isn't capped at
  // maxBulkQty for ready-stock fabrics.
  const onQtyChange = (raw) => {
    const v = Number(raw) || 1;
    if (orderType === "sample") setQty(Math.max(1, Math.min(MAX_SAMPLE_METERS, v)));
    else setQty(Math.max(1, v));
  };

  // Add inventory portion to cart — pulled out of `addToCart` so the
  // shortfall modal can call it after the RFQ is created.
  const addInventoryLine = (qtyOverride) => {
    const lineQty = Number(qtyOverride ?? qty);
    addLine({
      fabric_id: fabric.id,
      fabric_name: fabric.name,
      fabric_code: fabric.fabric_code || "",
      category_name: fabric.category_name || "",
      image_url: (selectedVariant?.image_url || fabricCoverImage(fabric)) || "",
      seller_company: fabric.seller_company || "",
      quantity: lineQty,
      unit,
      color_name: selectedVariant?.color_name || "",
      color_hex: selectedVariant?.hex || "",
      order_type: orderType,
      price_per_unit: orderType === "sample" ? samplePrice : rate,
      moq: moqValue,
    });
  };

  const addToCart = () => {
    if (!fabric) return;
    if (orderType === "bulk" && qty < moqValue) {
      toast.error(`MOQ for bulk orders is ${moqValue}${unit}`);
      return;
    }
    if (orderType === "sample" && qty > MAX_SAMPLE_METERS) {
      toast.error(`Sample orders are capped at ${MAX_SAMPLE_METERS}${unit} per fabric`);
      return;
    }
    if (orderType === "bulk" && rate <= 0) {
      toast.error("Bulk price not listed — use Request a Quote");
      return;
    }
    // Shortfall trigger: bulk only, ready-stock fabric, qty > available.
    // Made-to-order fabrics skip this (no inventory exists to take).
    const isReadyStock = (fabric.stock_type || "ready_stock") !== "made_to_order";
    if (
      orderType === "bulk" &&
      isReadyStock &&
      Number.isFinite(maxBulkQty) &&
      maxBulkQty > 0 &&
      qty > maxBulkQty
    ) {
      setShowShortfallModal(true);
      return;
    }
    if (orderType === "bulk" && qty > maxBulkQty) {
      toast.error(`Only ${maxBulkQty}${unit} available — request a quote for more.`);
      return;
    }
    addInventoryLine(qty);
    toast.success(`Added to cart · ${orderType === "sample" ? "Sample" : "Bulk"} · ${qty}${unit}`);
    // #2: For samples, jump straight to the cart so the buyer can review
    // and check out without hunting for the cart icon.
    if (orderType === "sample") {
      setTimeout(() => navigate("/enterprise/cart"), 250);
    }
  };

  if (loading) {
    return <BrandLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></BrandLayout>;
  }
  if (!fabric) return null;

  return (
    <BrandLayout>
      {/* Back to catalog — use browser history so the filters/sort/page the
          user had set on /enterprise/fabrics survive the round-trip. Falls
          back to the bare catalog URL when the PDP was opened directly
          (deep-link / refresh) and there's nothing in the history stack. */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/enterprise/fabrics");
        }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
        data-testid="brand-pdp-back-to-catalog"
      >
        <ArrowLeft size={14} /> Back to catalog
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gallery */}
        <div>
          <div className="group aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden relative">
            <img
              src={mediumImage(activeImage || selectedVariant?.image_url || fabricCoverImage(fabric)) || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800"}
              alt={fabric.name}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              onDoubleClick={(e) => e.preventDefault()}
              style={{ WebkitUserDrag: "none", userSelect: "none" }}
            />
            <Watermark size="lg" />
          </div>
          {(fabric.images || []).length > 1 && (
            <div className="grid grid-cols-5 gap-2 mt-3" data-testid="brand-pdp-thumbs">
              {(fabric.images || []).slice(0, 5).map((img, i) => {
                const isActive = (activeImage || fabric.images[0]) === img;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(img)}
                    className={`aspect-square rounded overflow-hidden border-2 transition ${
                      isActive
                        ? "border-blue-500 ring-2 ring-blue-100"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                    aria-label={`Show image ${i + 1}`}
                    data-testid={`brand-pdp-thumb-${i}`}
                  >
                    <img
                      src={thumbImage(img)}
                      alt={`${fabric.name} ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ WebkitUserDrag: "none", userSelect: "none" }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Videos — same module as B2C PDP. Supports YouTube/Vimeo embeds
              and direct file URLs. Falls back to native <video> for the
              latter, with poster + autoplay-on-hover removed for sanity. */}
          {Array.isArray(fabric.videos) && fabric.videos.length > 0 && (
            <div className="mt-5" data-testid="brand-pdp-videos">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Product Video{fabric.videos.length > 1 ? "s" : ""}</h3>
              <div className="grid grid-cols-1 gap-3">
                {fabric.videos.map((videoUrl, idx) => {
                  const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
                  const isVimeo = videoUrl.includes("vimeo.com");
                  return (
                    <div key={idx} className="rounded-lg overflow-hidden bg-black aspect-video relative">
                      {isYouTube ? (
                        <iframe
                          src={videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                          title={`${fabric.name} video ${idx + 1}`}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : isVimeo ? (
                        <iframe
                          src={videoUrl.replace("vimeo.com/", "player.vimeo.com/video/")}
                          title={`${fabric.name} video ${idx + 1}`}
                          className="w-full h-full"
                          allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <video
                          src={toWebVideoUrl(videoUrl)}
                          controls
                          preload="metadata"
                          poster={videoPosterUrl(videoUrl)}
                          className="w-full h-full object-contain"
                        >
                          <source src={toWebVideoUrl(videoUrl)} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Info + Booking */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{fabric.category_name}</p>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">{displayFabricName(fabric)}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-600 mb-4 flex-wrap">
            {fabric.fabric_code && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{fabric.fabric_code}</span>}
            {moqValue > 0 && <span>MOQ: {moqValue} {unit}</span>}
            {/* Vendor "by ..." hidden from customer-facing portals — surfaced
                only in Admin/Agent surfaces via seller_code. */}
          </div>

          {/* Color picker */}
          {fabric.has_multiple_colors && fabric.color_variants?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-600 mb-2">Select colour</p>
              <div className="flex flex-wrap gap-2">
                {fabric.color_variants.map((v, i) => {
                  const qa = Number(v.quantity_available || 0);
                  const samplable = v.sample_available !== false;
                  const disabled = (orderType === "bulk" && qa <= 0) || (orderType === "sample" && !samplable);
                  const selected = selectedVariant?.color_name === v.color_name;
                  return (
                    <button
                      key={i}
                      disabled={disabled}
                      onClick={() => setSelectedVariant(v)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                        selected ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700"
                      } ${disabled ? "opacity-40 cursor-not-allowed" : "hover:border-gray-400"}`}
                      data-testid={`brand-variant-${v.color_name}`}
                    >
                      <span className="w-4 h-4 rounded-full border border-gray-300" style={{ background: v.hex || "#fff" }} />
                      {v.color_name}
                      <span className="text-[10px] text-gray-500">{orderType === "bulk" ? `${qa}${unit}` : samplable ? "sample ✓" : "—"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Order type */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-600 mb-2">Order type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setOrderType("sample"); setQty(1); }}
                className={`p-3 border rounded-lg text-left ${orderType === "sample" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                data-testid="brand-type-sample"
              >
                <p className="text-sm font-medium">Sample</p>
                <p className="text-xs text-gray-500">{fmtINR(samplePrice)}/{unit} · Max {MAX_SAMPLE_METERS}{unit}</p>
              </button>
              <button
                onClick={() => { setOrderType("bulk"); setQty(moqValue); }}
                className={`p-3 border rounded-lg text-left ${orderType === "bulk" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}
                data-testid="brand-type-bulk"
              >
                <p className="text-sm font-medium">Bulk</p>
                <p className="text-xs text-gray-500">{rate > 0 ? `${fmtINR(rate)}/${unit}` : "On enquiry"}</p>
              </button>
            </div>
          </div>

          {/* Qty */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-600 mb-2">
              Quantity ({unit})
              {orderType === "sample" && <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">max {MAX_SAMPLE_METERS}{unit}</span>}
              {orderType === "bulk" && Number.isFinite(maxBulkQty) && (
                <span className="ml-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded" data-testid="brand-max-bulk-hint">
                  available {maxBulkQty}{unit}
                </span>
              )}
            </p>
            <input
              type="number"
              min={1}
              max={orderType === "sample" ? MAX_SAMPLE_METERS : (Number.isFinite(maxBulkQty) ? maxBulkQty : undefined)}
              value={qty}
              onChange={(e) => onQtyChange(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              data-testid="brand-qty-input"
            />
            {orderType === "bulk" && qty > maxBulkQty && Number.isFinite(maxBulkQty) && (
              <p className="text-[11px] text-amber-700 mt-1.5" data-testid="brand-qty-error">
                Only {maxBulkQty}{unit} in stock. We'll take what's here and send an RFQ for the remaining {qty - maxBulkQty}{unit}.
              </p>
            )}
          </div>

          {/* Line preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Line total</span>
              <span className="font-semibold text-gray-900" data-testid="brand-line-total">{fmtINR(lineTotal)}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Taxes + logistics calculated at checkout</p>
          </div>

          {/* Balance info */}
          {orderType === "sample" ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 flex items-center justify-between" data-testid="brand-balance-sample-card">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Sample Credits</p>
                <p className="text-sm text-gray-900 mt-0.5">
                  <strong data-testid="brand-balance-sample">{fmtCount(availableSample)}</strong> credits available
                </p>
              </div>
              <Link to="/enterprise/account" className="text-xs text-amber-700 hover:underline">Top up</Link>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2 flex items-center justify-between" data-testid="brand-balance-credit-card">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Credit Limit</p>
                <p className="text-sm text-gray-900 mt-0.5">
                  <strong data-testid="brand-balance-credit-lacs">{fmtLacs(availableCredit)}</strong>
                  <span className="text-gray-500 text-xs ml-1.5" data-testid="brand-balance-credit">({fmtINR(availableCredit)})</span>
                </p>
              </div>
              <Link to="/enterprise/account" className="text-xs text-emerald-700 hover:underline">View ledger</Link>
            </div>
          )}

          {/* Primary CTAs — Add to Cart + RFQ */}
          <button
            onClick={addToCart}
            className={`w-full ${orderType === "sample" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"} disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2`}
            data-testid="brand-add-to-cart"
          >
            {orderType === "sample" ? <Beaker size={14} /> : <ShoppingCart size={14} />}
            Add {orderType === "sample" ? "Sample" : "Bulk Order"} to Cart
          </button>
          <button
            onClick={() => setShowRfq(true)}
            className="w-full mt-2 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 flex items-center justify-center gap-2"
            data-testid="brand-request-quote"
          >
            <MessageSquare size={14} /> Request a Quote
          </button>

          <DispatchStrip fabric={fabric} className="mt-3" />

          {/* Certifications — only render the section when the fabric has any */}
          {Array.isArray(fabric.certifications) && fabric.certifications.length > 0 && (
            <div className="mt-6 pt-5 border-t border-gray-200" data-testid="brand-pdp-certs">
              <h3 className="text-sm font-semibold mb-3">Certifications</h3>
              <CertificationBadges
                certs={fabric.certifications}
                size="md"
                testIdPrefix="brand-pdp-cert"
              />
              <CertificationDisclaimer className="mt-3" testId="brand-pdp-cert-disclaimer" />
            </div>
          )}

          {/* Technical Specifications — same fields as the public PDP so brand
              users get the full picture (width, weave, GSM/oz, composition,
              pattern, finish, etc.) before placing the order. */}
          <div className="mt-6 pt-5 border-t border-gray-200" data-testid="brand-pdp-specs">
            <h3 className="text-sm font-semibold mb-3">Technical Specifications</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {fabric.fabric_type && (
                <SpecRow label="Fabric Type" value={fabric.fabric_type === "knitted" ? "Knits" : fabric.fabric_type === "woven" ? "Woven" : fabric.fabric_type} />
              )}
              {fabric.weave_type && <SpecRow label="Weave Type" value={fabric.weave_type} />}
              {Array.isArray(fabric.composition) && fabric.composition.some((c) => c.material) && (
                <SpecRow label="Composition" value={fabric.composition.filter((c) => c.material && c.percentage > 0).map((c) => `${c.percentage}% ${c.material}`).join(", ")} />
              )}
              {((fabric.weight_unit === "ounce" && fabric.ounce) || (fabric.weight_unit !== "ounce" && fabric.gsm)) && (
                <SpecRow
                  label={fabric.weight_unit === "ounce" ? "Weight (Oz)" : "GSM"}
                  value={fabric.weight_unit === "ounce" ? fabric.ounce : fabric.gsm}
                />
              )}
              {fabric.width && (
                <SpecRow
                  label="Width"
                  value={`${fabric.width}${typeof fabric.width === "number" || /^\d+$/.test(String(fabric.width)) ? '"' : ""}${fabric.width_type ? ` (${fabric.width_type})` : ""}`}
                />
              )}
              {fabric.color && <SpecRow label="Color" value={fabric.color} />}
              {fabric.pattern && <SpecRow label="Pattern" value={fabric.pattern} />}
              {fabric.finish && <SpecRow label="Finish" value={fabric.finish} />}
              {fabric.moq && <SpecRow label="MOQ" value={`${fabric.moq}${typeof fabric.moq === "number" ? ` ${unit}` : ""}`} />}
              {fabric.dispatch_timeline && <SpecRow label="Dispatch" value={fabric.dispatch_timeline} />}
              {fabric.fabric_code && <SpecRow label="Fabric Code" value={fabric.fabric_code} mono />}
              {/* Vendor name intentionally hidden from customer-facing surfaces.
                  Admin/Agent panels expose seller_code + company for ops use. */}
            </div>
          </div>

          {fabric.description && (
            <div className="mt-6 pt-5 border-t border-gray-200">
              <h3 className="text-sm font-semibold mb-2">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{fabric.description}</p>
            </div>
          )}
        </div>
      </div>
      <RFQModal
        open={showRfq}
        onClose={() => setShowRfq(false)}
        fabricUrl={typeof window !== "undefined" ? window.location.href : ""}
        fabricName={fabric?.name || ""}
      />
      <InventoryShortfallModal
        open={showShortfallModal}
        fabric={fabric}
        requestedQty={qty}
        availableQty={Number.isFinite(maxBulkQty) ? maxBulkQty : 0}
        unit={unit}
        showContactFields={false}
        defaults={{
          full_name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          gst_number: summary?.brand?.gst || "",
          company: user?.brand_name || "",
        }}
        onCancel={() => setShowShortfallModal(false)}
        onConfirm={({ shortfallRfq }) => {
          // Inventory portion → cart line at the listed rate. Shortfall is
          // already filed server-side; surface a toast with the RFQ # and
          // close the modal.
          const inventoryQty = Number.isFinite(maxBulkQty) ? maxBulkQty : 0;
          if (inventoryQty > 0) addInventoryLine(inventoryQty);
          setShowShortfallModal(false);
          toast.success(
            `Took ${inventoryQty}${unit} into cart · RFQ ${shortfallRfq.rfq_number} sent for ${shortfallRfq.shortfall_qty}${unit}`
          );
          setQty(inventoryQty || moqValue);
        }}
      />
    </BrandLayout>
  );
};

export default BrandFabricDetail;
