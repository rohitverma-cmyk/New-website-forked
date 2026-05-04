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
import { useNavigate, useParams } from "react-router-dom";
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

const initialForm = (existing) => ({
  price_per_meter: existing?.price_per_meter || "",
  lead_days: existing?.lead_days || "",
  basis: existing?.basis || "x-factory",
  fabric_state: existing?.fabric_state || "Greige",
  sample_available: !!existing?.sample_available,
  notes: existing?.notes || "",
  specs: {
    warp_count: existing?.specs?.warp_count || "",
    weft_count: existing?.specs?.weft_count || "",
    reed: existing?.specs?.reed || "",
    pick: existing?.specs?.pick || "",
    width_inch: existing?.specs?.width_inch || "",
    loom: existing?.specs?.loom || "",
    gsm: existing?.specs?.gsm || "",
    finish: existing?.specs?.finish || "",
    notes: existing?.specs?.notes || "",
  },
});

const QuoteModal = ({ rfq, existing, onClose, onSaved }) => {
  const [form, setForm] = useState(() => initialForm(existing));
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setSpec = (key, value) =>
    setForm((f) => ({ ...f, specs: { ...f.specs, [key]: value } }));

  const handleSave = async () => {
    if (!form.price_per_meter || Number(form.price_per_meter) <= 0) {
      alert("Enter a valid price per meter");
      return;
    }
    if (!form.lead_days || Number(form.lead_days) < 1) {
      alert("Enter a valid lead time in days");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        price_per_meter: Number(form.price_per_meter),
        lead_days: Number(form.lead_days),
        basis: form.basis,
        fabric_state: form.fabric_state,
        sample_available: !!form.sample_available,
        notes: form.notes || "",
        specs: { ...form.specs },
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
              <span className="text-xs font-medium text-gray-600">Price (₹/m) *</span>
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

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold mb-2">Finished fabric specs (optional)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                ["warp_count", "Warp count"],
                ["weft_count", "Weft count"],
                ["reed", "Reed"],
                ["pick", "Pick"],
                ["width_inch", "Width (in)"],
                ["loom", "Loom"],
                ["gsm", "GSM"],
                ["finish", "Finish"],
              ].map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-gray-500">{label}</span>
                  <input
                    type="text"
                    value={form.specs[k]}
                    onChange={(e) => setSpec(k, e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                    data-testid={`quote-spec-${k}`}
                  />
                </label>
              ))}
            </div>
          </div>

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
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              placeholder="MOQ confirmed, MRP excludes GST, etc."
              data-testid="quote-notes"
            />
          </label>
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
                  <span className="text-gray-500">/ m</span>
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
