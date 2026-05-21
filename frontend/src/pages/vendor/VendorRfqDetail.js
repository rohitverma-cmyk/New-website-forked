/**
 * Vendor RFQ Detail — fabric specs + my quotes + submit/edit quote.
 *
 * Layout matches the mobile detail screens: side-by-side Fabric details
 * and Query details cards on top, then a Quotes section with the
 * vendor's own quote (one per RFQ), and a Submit/Edit Quote modal.
 *
 * The "Actions" floating button shown on mobile (Initiate order /
 * Customer details / Manage quote & sample) is replaced on desktop
 * with inline buttons on the right rail because real estate is
 * cheap on a 1024+ canvas. Order initiation is admin-gated and will
 * land in Phase B.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Mail,
  Phone,
  Send,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import {
  getVendorRfqDetail,
  submitVendorQuote,
  updateVendorQuote,
  getFabric,
} from "../../lib/api";
import {
  FABRIC_STATES,
  QUOTE_BASIS,
  formatDate,
  formatINR,
  rfqTitle,
} from "../../lib/vendorRfq";

const SpecRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-b-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 truncate">{value || "—"}</span>
  </div>
);

const SpecCard = ({ title, items, testId }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid={testId}>
    <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
    <div>
      {items.map((it) => (
        <SpecRow key={it.label} label={it.label} value={it.value} />
      ))}
    </div>
  </div>
);

const Chip = ({ children, accent = "violet" }) => {
  const cls = {
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    gray: "bg-gray-50 text-gray-700 border-gray-200",
  }[accent];
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
};

// Mirror of /app/backend/vendor_rfq_router.QuoteSpecs — keep field-set
// in sync. Everything is optional except what's gated server-side.
const SPEC_FIELDS = {
  construction: [
    ["fabric_type", "Fabric type", "select", ["", "woven", "knitted", "non-woven"]],
    ["weave_type", "Weave type", "text"],
    ["pattern", "Pattern", "select", ["", "Solid", "Print", "Stripes", "Checks", "Floral", "Geometric", "Digital", "Random", "Greige", "Others"]],
    ["warp_count", "Warp count", "text"],
    ["weft_count", "Weft count", "text"],
    ["yarn_count", "Yarn count", "text"],
    ["reed", "Reed", "text"],
    ["pick", "Pick", "text"],
    ["construction", "Construction", "text"],
    ["width_inch", "Width (in)", "text"],
    ["width_type", "Width type", "select", ["", "Open Width", "Circular"]],
    ["loom", "Loom", "text"],
    ["gsm", "GSM", "text"],
    ["weight_oz", "Weight (oz)", "text"],
  ],
  knit_denim: [
    ["knit_type", "Knit type", "text"],
    ["denier", "Denier", "text"],
    ["stretch_pct", "Stretch %", "text"],
    ["weft_shrinkage_pct", "Weft shrinkage %", "text"],
    ["color", "Color", "text"],
    ["finish", "Finish", "text"],
  ],
  identifiers: [
    ["seller_sku", "Seller SKU", "text"],
    ["article_id", "Article ID", "text"],
    ["hsn_code", "HSN code", "text"],
  ],
};

const CERTIFICATION_OPTIONS = [
  "BCI", "GOTS", "OEKO-TEX 100", "OEKO-TEX MIA", "GRS", "RCS", "OCS 100", "OCS Blended",
  "RWS", "FSC", "Higg", "ZDHC", "Bluesign", "Cradle to Cradle", "Fair Trade",
  "EU Ecolabel", "Cotton USA", "Better Cotton", "Tencel Lyocell", "Modal Edelweiss",
  "Refibra", "EcoVero", "Naia",
];
const AVAILABILITY_OPTIONS = ["Sample", "Bulk", "On Request"];
const STOCK_TYPES = [
  ["", "—"],
  ["ready_stock", "Ready stock"],
  ["made_to_order", "Made to order"],
];

const blankSpecs = () => ({
  fabric_type: "",
  weave_type: "",
  pattern: "",
  warp_count: "",
  weft_count: "",
  yarn_count: "",
  reed: "",
  pick: "",
  construction: "",
  width_inch: "",
  width_type: "",
  loom: "",
  gsm: "",
  weight_oz: "",
  weight_unit: "GSM",
  knit_type: "",
  denier: "",
  stretch_pct: "",
  weft_shrinkage_pct: "",
  finish: "",
  color: "",
  composition: [{ material: "", percentage: "" }],
  certifications: [],
  hsn_code: "",
  seller_sku: "",
  article_id: "",
  description: "",
  tags: "",
  moq: "",
  sample_price: "",
  pricing_tiers: [{ min: "", max: "", price: "" }],
  dispatch_timeline: "",
  sample_delivery_days: "",
  bulk_delivery_days: "",
  availability: [],
  stock_type: "",
  quantity_available: "",
  notes: "",
});

/** Map RFQ fields → quote spec defaults so the vendor only fills price/lead/certs. */
const prefillFromRfq = (rfq) => {
  if (!rfq) return {};
  const out = {};
  // category slug → fabric_type signal
  const cat = (rfq.category || "").toLowerCase();
  if (cat === "knits") out.fabric_type = "knitted";
  else if (cat) out.fabric_type = "woven";
  // fabric state mirrors what the buyer asked for
  if (rfq.fabric_requirement_type) out.color = rfq.fabric_requirement_type;
  if (rfq.knit_quality) out.knit_type = rfq.knit_quality;
  if (rfq.denim_specification) out.weave_type = rfq.denim_specification.split(",")[0]?.trim() || "";
  // pre-seed description with the buyer's message so the vendor sees context
  if (rfq.message) out.description = rfq.message;
  return out;
};

/** Map a linked SKU's full spec → quote spec (used for shortfall RFQs). */
const prefillFromFabric = (fabric) => {
  if (!fabric) return {};
  const c = fabric.composition_data || fabric.composition || [];
  return {
    fabric_type: fabric.fabric_type || "",
    weave_type: fabric.weave_type || "",
    pattern: fabric.pattern || "",
    warp_count: fabric.warp_count || "",
    weft_count: fabric.weft_count || "",
    yarn_count: fabric.yarn_count || "",
    reed: fabric.reed || "",
    pick: fabric.pick || "",
    construction: fabric.construction || "",
    width_inch: String(fabric.width_inches || fabric.width_inch || ""),
    width_type: fabric.width_type || "",
    loom: fabric.loom || "",
    gsm: String(fabric.gsm || ""),
    weight_oz: String(fabric.weight_oz || ""),
    weight_unit: fabric.weight_unit || "GSM",
    knit_type: fabric.knit_type || "",
    denier: String(fabric.denier || ""),
    stretch_pct: String(fabric.stretch_pct || ""),
    weft_shrinkage_pct: String(fabric.weft_shrinkage_pct || ""),
    finish: fabric.finish || "",
    color: fabric.color || "",
    composition: Array.isArray(c) && c.length ? c : [{ material: "", percentage: "" }],
    certifications: fabric.certifications || [],
    hsn_code: fabric.hsn_code || "",
    seller_sku: fabric.seller_sku || "",
    article_id: fabric.article_id || "",
    description: fabric.description || "",
    tags: Array.isArray(fabric.tags) ? fabric.tags.join(", ") : (fabric.tags || ""),
    moq: fabric.moq || "",
    sample_price: fabric.sample_price || "",
    pricing_tiers: (fabric.pricing_tiers && fabric.pricing_tiers.length)
      ? fabric.pricing_tiers
      : [{ min: "", max: "", price: "" }],
    dispatch_timeline: fabric.dispatch_timeline || "",
    sample_delivery_days: fabric.sample_delivery_days || "",
    bulk_delivery_days: fabric.bulk_delivery_days || "",
    availability: fabric.availability || [],
    stock_type: fabric.stock_type || "",
    quantity_available: String(fabric.quantity_available || ""),
  };
};

const initialForm = (existing, rfqDefaults = {}, fabricDefaults = {}) => {
  const seed = blankSpecs();
  // Layer order: blank → RFQ defaults → linked SKU defaults → existing quote
  Object.assign(seed, rfqDefaults, fabricDefaults);
  const e = existing?.specs || {};
  Object.keys(seed).forEach((k) => {
    if (e[k] === undefined || e[k] === null || e[k] === "") return;
    seed[k] = e[k];
  });
  if (Array.isArray(e.composition) && e.composition.length) seed.composition = e.composition;
  if (Array.isArray(e.pricing_tiers) && e.pricing_tiers.length) seed.pricing_tiers = e.pricing_tiers;
  if (Array.isArray(e.certifications)) seed.certifications = e.certifications;
  if (Array.isArray(e.availability)) seed.availability = e.availability;
  return {
    price_per_meter: existing?.price_per_meter || "",
    lead_days: existing?.lead_days || "",
    basis: existing?.basis || "x-factory",
    fabric_state: existing?.fabric_state || "Greige",
    sample_available: !!existing?.sample_available,
    notes: existing?.notes || "",
    specs: seed,
  };
};

/** Collapsible section shell — sits inside the modal body. */
const Section = ({ title, hint, defaultOpen = false, children, testId }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 pt-4" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {hint ? <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p> : null}
        </div>
        <span className={`text-xs text-gray-500 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
};

const QuoteModal = ({ rfq, existing, onClose, onSaved }) => {
  const rfqDefaults = useMemo(() => prefillFromRfq(rfq), [rfq]);
  const [linkedFabric, setLinkedFabric] = useState(null);
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const fabricDefaults = useMemo(() => prefillFromFabric(linkedFabric), [linkedFabric]);
  const [form, setForm] = useState(() => initialForm(existing, rfqDefaults, fabricDefaults));
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;
  const isShortfall = !!rfq?.is_shortfall;

  // Pricing unit comes from the RFQ category — knits per kg, wovens per
  // meter. Yards override this for international buyers.
  const priceUnit =
    (rfq?.quantity_unit && String(rfq.quantity_unit).toLowerCase()) ||
    ((rfq?.category || "").toLowerCase() === "knits" ? "kg" : "m");

  // For shortfall RFQs we lazily fetch the linked SKU so the vendor's
  // form is pre-filled with the exact same specs the buyer is already
  // taking from stock — they only need to confirm price + lead.
  useEffect(() => {
    if (!isShortfall || existing) return;
    const fid = rfq?.linked_fabric_id;
    if (!fid) return;
    let cancelled = false;
    setLoadingPrefill(true);
    getFabric(fid)
      .then((res) => { if (!cancelled) setLinkedFabric(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPrefill(false); });
    return () => { cancelled = true; };
  }, [isShortfall, rfq?.linked_fabric_id, existing]);

  // Re-seed form once defaults arrive (only on first paint of an empty
  // quote — never overwrites a user's in-progress edits).
  useEffect(() => {
    if (existing) return;
    setForm(initialForm(existing, rfqDefaults, fabricDefaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqDefaults, fabricDefaults]);

  const set = (k, value) => setForm((f) => ({ ...f, [k]: value }));
  const setSpec = (key, value) =>
    setForm((f) => ({ ...f, specs: { ...f.specs, [key]: value } }));

  const handleSave = async () => {
    if (!form.price_per_meter || Number(form.price_per_meter) <= 0) {
      alert(`Enter a valid price per ${priceUnit}`);
      return;
    }
    if (!form.lead_days || Number(form.lead_days) < 1) {
      alert("Enter a valid lead time in days");
      return;
    }
    setSaving(true);
    try {
      // Strip pure-empty composition / pricing rows before submit;
      // coerce numeric specs to numbers where the schema expects them.
      const cleanComposition = (form.specs.composition || []).filter(
        (r) => r && (r.material || r.percentage)
      );
      const cleanTiers = (form.specs.pricing_tiers || []).filter(
        (r) => r && (r.min || r.max || r.price)
      );
      const specs = {
        ...form.specs,
        composition: cleanComposition,
        pricing_tiers: cleanTiers,
        moq: form.specs.moq === "" || form.specs.moq == null ? null : Number(form.specs.moq),
        sample_price:
          form.specs.sample_price === "" || form.specs.sample_price == null
            ? null
            : Number(form.specs.sample_price),
        quantity_available:
          form.specs.quantity_available === "" || form.specs.quantity_available == null
            ? null
            : Number(form.specs.quantity_available),
      };
      const payload = {
        price_per_meter: Number(form.price_per_meter),
        lead_days: Number(form.lead_days),
        basis: form.basis,
        fabric_state: form.fabric_state,
        sample_available: !!form.sample_available,
        notes: form.notes || "",
        specs,
      };
      if (isEdit) {
        await updateVendorQuote(existing.id, { ...payload, status: "submitted" });
      } else {
        await submitVendorQuote(rfq.id, payload);
      }
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.detail || "Could not save quote");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="vendor-quote-modal"
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{isEdit ? "Edit Quote" : "Submit Quote"}</h3>
            <p className="text-xs text-gray-500">{rfq?.rfq_number} · {rfqTitle(rfq)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Price (₹/{priceUnit}) *</span>
              <input
                type="number"
                step="0.01"
                value={form.price_per_meter}
                onChange={(e) => set("price_per_meter", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                placeholder="45.80"
                data-testid="quote-price"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Lead time (days) *</span>
              <input
                type="number"
                value={form.lead_days}
                onChange={(e) => set("lead_days", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                placeholder="4"
                data-testid="quote-lead"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Basis</span>
              <select
                value={form.basis}
                onChange={(e) => set("basis", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-violet-400 focus:outline-none"
                data-testid="quote-basis"
              >
                {QUOTE_BASIS.map((b) => (
                  <option key={b.key} value={b.key}>{b.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Fabric state</span>
              <select
                value={form.fabric_state}
                onChange={(e) => set("fabric_state", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-violet-400 focus:outline-none"
                data-testid="quote-fabric-state"
              >
                {FABRIC_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          {/* PRIORITY: certifications — vendor's unique competitive lever */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold mb-2">
              Certifications <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CERTIFICATION_OPTIONS.map((c) => {
                const selected = (form.specs.certifications || []).includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const list = form.specs.certifications || [];
                      const next = selected ? list.filter((x) => x !== c) : [...list, c];
                      setSpec("certifications", next);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                      selected
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sample availability + notes — quick toggles */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sample_available}
                onChange={(e) => set("sample_available", e.target.checked)}
                className="h-4 w-4 text-violet-600"
                data-testid="quote-sample"
              />
              Sample available on request
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Notes for buyer</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                placeholder="MOQ confirmed, GST extra, finishing options, etc."
                data-testid="quote-notes"
              />
            </label>
          </div>

          {/* Pre-filled, collapsed sections — vendor only opens if they need to override */}
          {(loadingPrefill || isShortfall || rfqDefaults.fabric_type) && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[12px] text-amber-900">
              {loadingPrefill ? (
                <span>Loading SKU specs from the linked inventory…</span>
              ) : isShortfall ? (
                <span>
                  <strong>Auto-filled from the inventory SKU.</strong> Review the
                  pre-filled fabric specs below — open any section only if you need
                  to override.
                </span>
              ) : (
                <span>
                  <strong>Auto-filled from the buyer's RFQ.</strong> Open any
                  section only to override or add details the buyer didn't specify.
                </span>
              )}
            </div>
          )}

          <Section
            title="Construction"
            hint="Fabric type, weave, count, GSM, width — usually auto-filled."
            testId="section-construction"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SPEC_FIELDS.construction.map(([k, label, type, opts]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-gray-500">{label}</span>
                  {type === "select" ? (
                    <select
                      value={form.specs[k] || ""}
                      onChange={(e) => setSpec(k, e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:border-violet-400 focus:outline-none"
                    >
                      {opts.map((o) => (
                        <option key={o} value={o}>{o || "—"}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.specs[k] || ""}
                      onChange={(e) => setSpec(k, e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                      data-testid={`quote-spec-${k}`}
                    />
                  )}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Knit / denim / finishing" hint="Knit type, denier, stretch, color, finish.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SPEC_FIELDS.knit_denim.map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-gray-500">{label}</span>
                  <input
                    type="text"
                    value={form.specs[k] || ""}
                    onChange={(e) => setSpec(k, e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                    data-testid={`quote-spec-${k}`}
                  />
                </label>
              ))}
            </div>
          </Section>

          <Section title="Composition" hint="Material breakdown — must total 100%.">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setSpec("composition", [...(form.specs.composition || []), { material: "", percentage: "" }])}
                className="text-xs text-blue-600 hover:underline"
              >+ Add row</button>
            </div>
            {(form.specs.composition || []).map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Material (e.g. Cotton)"
                  value={row.material || ""}
                  onChange={(e) => {
                    const list = [...form.specs.composition];
                    list[i] = { ...list[i], material: e.target.value };
                    setSpec("composition", list);
                  }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="%"
                  value={row.percentage || ""}
                  onChange={(e) => {
                    const list = [...form.specs.composition];
                    list[i] = { ...list[i], percentage: e.target.value };
                    setSpec("composition", list);
                  }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const list = [...form.specs.composition];
                    list.splice(i, 1);
                    setSpec("composition", list.length ? list : [{ material: "", percentage: "" }]);
                  }}
                  className="text-gray-400 hover:text-red-500 text-sm"
                >✕</button>
              </div>
            ))}
            <p className="text-[11px] text-gray-400">Total should equal 100%.</p>
          </Section>

          <Section title="Commercial details" hint="MOQ, sample price, dispatch & availability.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-gray-500">MOQ</span>
                <input
                  type="number"
                  value={form.specs.moq || ""}
                  onChange={(e) => setSpec("moq", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Sample price (₹)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.specs.sample_price || ""}
                  onChange={(e) => setSpec("sample_price", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Stock type</span>
                <select
                  value={form.specs.stock_type || ""}
                  onChange={(e) => setSpec("stock_type", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:border-violet-400 focus:outline-none"
                >
                  {STOCK_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Qty in stock</span>
                <input
                  type="number"
                  value={form.specs.quantity_available || ""}
                  onChange={(e) => setSpec("quantity_available", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Dispatch timeline</span>
                <input
                  type="text"
                  placeholder="e.g. 5-7 days"
                  value={form.specs.dispatch_timeline || ""}
                  onChange={(e) => setSpec("dispatch_timeline", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Sample delivery (days)</span>
                <input
                  type="text"
                  value={form.specs.sample_delivery_days || ""}
                  onChange={(e) => setSpec("sample_delivery_days", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVAILABILITY_OPTIONS.map((opt) => {
                const selected = (form.specs.availability || []).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const list = form.specs.availability || [];
                      setSpec("availability", selected ? list.filter((x) => x !== opt) : [...list, opt]);
                    }}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      selected
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600"
                    }`}
                  >
                    {selected ? "✓ " : ""}{opt}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Pricing tiers (volume breaks)" hint="Optional — quantity-based discounts.">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setSpec("pricing_tiers", [...(form.specs.pricing_tiers || []), { min: "", max: "", price: "" }])}
                className="text-xs text-blue-600 hover:underline"
              >+ Add tier</button>
            </div>
            {(form.specs.pricing_tiers || []).map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2 mb-2">
                <input
                  type="number"
                  placeholder="Min qty"
                  value={row.min || ""}
                  onChange={(e) => {
                    const list = [...form.specs.pricing_tiers];
                    list[i] = { ...list[i], min: e.target.value };
                    setSpec("pricing_tiers", list);
                  }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Max qty"
                  value={row.max || ""}
                  onChange={(e) => {
                    const list = [...form.specs.pricing_tiers];
                    list[i] = { ...list[i], max: e.target.value };
                    setSpec("pricing_tiers", list);
                  }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Price ₹/${priceUnit}`}
                  value={row.price || ""}
                  onChange={(e) => {
                    const list = [...form.specs.pricing_tiers];
                    list[i] = { ...list[i], price: e.target.value };
                    setSpec("pricing_tiers", list);
                  }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const list = [...form.specs.pricing_tiers];
                    list.splice(i, 1);
                    setSpec("pricing_tiers", list.length ? list : [{ min: "", max: "", price: "" }]);
                  }}
                  className="text-gray-400 hover:text-red-500 text-sm"
                >✕</button>
              </div>
            ))}
          </Section>

          <Section title="Identifiers & description" hint="SKU, HSN, article ID, marketing copy.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
              {SPEC_FIELDS.identifiers.map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-gray-500">{label}</span>
                  <input
                    type="text"
                    value={form.specs[k] || ""}
                    onChange={(e) => setSpec(k, e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-[11px] text-gray-500">Description</span>
              <textarea
                rows={2}
                value={form.specs.description || ""}
                onChange={(e) => setSpec("description", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
              />
            </label>
            <label className="block mt-2">
              <span className="text-[11px] text-gray-500">Tags (comma separated)</span>
              <input
                type="text"
                value={form.specs.tags || ""}
                onChange={(e) => setSpec("tags", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
              />
            </label>
          </Section>
        </div>
        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            data-testid="quote-save-btn"
          >
            <Send size={14} /> {saving ? "Saving…" : isEdit ? "Update Quote" : "Submit Quote"}
          </button>
        </div>
      </div>
    </div>
  );
};

const VendorRfqDetail = () => {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await getVendorRfqDetail(rfqId);
      setRfq(res.data);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load RFQ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId]);

  // ?action=submit deep-link from the list page → auto-open the modal
  useEffect(() => {
    if (!loading && rfq && searchParams.get("action") === "submit") {
      setShowModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rfq]);

  // Pricing unit driven by category (knits → kg, wovens → m). Yards
  // override for international buyers via quantity_unit.
  const priceUnit =
    (rfq?.quantity_unit && String(rfq.quantity_unit).toLowerCase()) ||
    ((rfq?.category || "").toLowerCase() === "knits" ? "kg" : "m");

  const fabricItems = useMemo(() => {
    if (!rfq) return [];
    return [
      { label: "Category", value: (rfq.category || "").toUpperCase() },
      { label: "Fabric type", value: rfq.fabric_requirement_type || "Greige" },
      { label: "Knit quality", value: rfq.knit_quality },
      { label: "Denim spec", value: rfq.denim_specification },
    ].filter((r) => r.value);
  }, [rfq]);

  const queryItems = useMemo(() => {
    if (!rfq) return [];
    return [
      { label: "Quantity", value: rfq.quantity_label },
      { label: "Required state", value: rfq.fabric_requirement_type || "Greige" },
      { label: "Submitted", value: formatDate(rfq.created_at) },
      { label: "RFQ #", value: rfq.rfq_number },
    ];
  }, [rfq]);

  const myQuote = rfq?.my_quote || null;

  return (
    <VendorLayout>
      <div className="p-6 max-w-5xl mx-auto" data-testid="vendor-rfq-detail-page">
        <button
          onClick={() => navigate("/vendor/rfqs")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft size={14} /> Back to Requests
        </button>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        ) : rfq ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{rfqTitle(rfq)}</h1>
                <p className="text-sm text-violet-700 font-medium">{rfq.rfq_number}</p>
              </div>
              <div className="flex items-center gap-2">
                {myQuote ? (
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
                    data-testid="vendor-edit-quote-btn"
                  >
                    <Edit3 size={14} /> Edit Quote
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
                    data-testid="vendor-submit-quote-btn"
                  >
                    <Send size={14} /> Submit Quote
                  </button>
                )}
              </div>
            </div>

            {rfq.is_shortfall ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex gap-3" data-testid="vendor-shortfall-banner">
                <div className="w-9 h-9 rounded-full bg-amber-100 grid place-items-center flex-shrink-0">
                  <Sparkles size={16} className="text-amber-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 mb-0.5">
                    Linked to inventory order — first-refusal RFQ
                  </p>
                  <p className="text-xs text-amber-800">
                    Buyer has already taken <strong>{rfq.linked_inventory_qty || 0} m</strong> of{" "}
                    {rfq.linked_fabric_code || "this SKU"} from stock; this RFQ covers the remaining{" "}
                    <strong>{rfq.quantity_meters} m</strong>. You have 24 h before this opens up to
                    other mills.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800" data-testid="vendor-direct-banner">
                Direct RFQ — no linked inventory. Compete with other mills on price, lead and specs.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <SpecCard
                title="Fabric details"
                items={fabricItems.length ? fabricItems : [{ label: "Category", value: "—" }]}
                testId="vendor-rfq-fabric-card"
              />
              <SpecCard title="Query details" items={queryItems} testId="vendor-rfq-query-card" />
            </div>

            {rfq.message && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900 mb-6 whitespace-pre-line" data-testid="vendor-rfq-message">
                <p className="font-semibold mb-1 flex items-center gap-1.5"><Sparkles size={13} /> Buyer notes</p>
                {rfq.message}
              </div>
            )}

            {/* Quotes */}
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Quotes <span className="text-xs text-gray-500 font-normal">Taxes extra</span></h2>
            </div>
            {myQuote ? (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4" data-testid="vendor-rfq-my-quote">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <Chip accent="violet">{myQuote.fabric_state || "Greige"}</Chip>
                  <Chip accent="blue">
                    <CheckCircle2 size={12} /> Submitted
                  </Chip>
                </div>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-2xl font-bold text-gray-900">₹ {formatINR(myQuote.price_per_meter)}</span>
                  <span className="text-gray-500">/ {priceUnit}</span>
                  <Chip accent="gray">{myQuote.basis === "x-factory" ? "Ex-factory" : "Door-delivered"}</Chip>
                  <Chip accent="amber">{myQuote.lead_days} days</Chip>
                  {myQuote.sample_available && <Chip accent="violet">Sample available</Chip>}
                </div>
                {myQuote.specs && (
                  <div className="flex flex-wrap gap-2">
                    {myQuote.specs.warp_count && myQuote.specs.weft_count && (
                      <Chip>
                        {myQuote.specs.warp_count} × {myQuote.specs.weft_count}
                      </Chip>
                    )}
                    {myQuote.specs.reed && myQuote.specs.pick && (
                      <Chip>
                        {myQuote.specs.reed} × {myQuote.specs.pick}
                      </Chip>
                    )}
                    {myQuote.specs.loom && <Chip>{myQuote.specs.loom}</Chip>}
                    {myQuote.specs.width_inch && <Chip>{myQuote.specs.width_inch} inch</Chip>}
                    {myQuote.specs.gsm && <Chip accent="amber">{myQuote.specs.gsm} GSM</Chip>}
                    {myQuote.specs.finish && <Chip>{myQuote.specs.finish}</Chip>}
                  </div>
                )}
                {myQuote.notes && (
                  <p className="text-xs text-gray-600 mt-3 whitespace-pre-line">{myQuote.notes}</p>
                )}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-500 mb-4">
                <p className="text-sm">You haven't quoted on this query yet.</p>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="mt-3 inline-flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
                  data-testid="vendor-submit-quote-empty"
                >
                  <Send size={14} /> Submit Quote
                </button>
              </div>
            )}

            {/* Customer details */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Customer contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="font-medium">{rfq.full_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">GST</p>
                  <p className="font-medium">{rfq.gst_number || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400" />
                  <a href={`mailto:${rfq.email}`} className="text-blue-600 hover:underline">{rfq.email}</a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400" />
                  <a href={`tel:${rfq.phone}`} className="text-blue-600 hover:underline">{rfq.phone}</a>
                </div>
              </div>
            </div>

            {showModal && (
              <QuoteModal
                rfq={rfq}
                existing={myQuote}
                onClose={() => setShowModal(false)}
                onSaved={async () => {
                  setShowModal(false);
                  await fetchDetail();
                }}
              />
            )}
          </>
        ) : null}
      </div>
    </VendorLayout>
  );
};

export default VendorRfqDetail;
