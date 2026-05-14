import { useState, useEffect } from "react";
import { ArrowRight, X, FileText, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { trackGenerateLead } from "../lib/analytics";

const API = process.env.REACT_APP_BACKEND_URL;

const FABRIC_TYPES = [
  "Greige Fabric",
  "Dyed Fabric",
  "Printed Fabric",
  "Yarn Dyed Fabric",
  "Denim Fabrics",
];

const LOCATIONS = [
  { value: "", label: "Select", code: "+91" },
  { value: "India", label: "India", code: "+91" },
  { value: "Bangladesh", label: "Bangladesh", code: "+880" },
  { value: "Vietnam", label: "Vietnam", code: "+84" },
  { value: "Sri Lanka", label: "Sri Lanka", code: "+94" },
];

export default function RFQModal({ open, onClose, fabricUrl, fabricName, fabric }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", phone: "", country_code: "+91", gst_number: "", bin_number: "", company_name: "", email: "", fabric_type: "", location: "",
    quantity: "", quantity_unit: "m", notes: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [loggedInCustomer, setLoggedInCustomer] = useState(null);
  // Lets the buyer override the auto-filled fabric specs (composition,
  // weight, width, type) without leaving the quick-RFQ modal. Empty values
  // mean "use the fabric's default" — only overrides are sent to backend.
  const [editingSpec, setEditingSpec] = useState(false);
  const [specOverride, setSpecOverride] = useState({ composition: "", weight: "", width: "", type: "" });

  // If a customer is logged in, prefill contact fields and hide the contact
  // section in the modal — they shouldn't have to retype name/email/phone/GST.
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem("lf_customer_token");
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/customer/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const me = await res.json();
        if (cancelled) return;
        setLoggedInCustomer(me);
        const realEmail = (me.email || "").endsWith("@phone.locofast.local") ? "" : (me.email || "");
        let localPhone = (me.phone || "").replace(/^\+/, "").replace(/^91/, "");
        setForm((prev) => ({
          ...prev,
          name: prev.name || me.name || "",
          email: prev.email || realEmail,
          phone: prev.phone || localPhone || "",
          company_name: prev.company_name || me.company || "",
          gst_number: prev.gst_number || me.gstin || "",
          location: prev.location || (me.gstin ? "India" : ""),
          country_code: prev.country_code || "+91",
        }));
      } catch { /* manual fallback */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Escape key closes the modal — common accessibility expectation.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const isIndia = form.location === "India";
  const isBangladesh = form.location === "Bangladesh";

  const handleLocationChange = (e) => {
    const loc = e.target.value;
    const match = LOCATIONS.find(l => l.value === loc);
    setForm(p => ({
      ...p,
      location: loc,
      country_code: match ? match.code : "+91",
      gst_number: loc !== "India" ? "" : p.gst_number,
      bin_number: loc !== "Bangladesh" ? "" : p.bin_number,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Logged-in users skip GST/BIN client validation — server uses profile
    if (!loggedInCustomer) {
      if (isIndia && !form.gst_number) {
        toast.error("GST Number is required for India");
        return;
      }
      if (isBangladesh && !form.bin_number) {
        toast.error("BIN is required for Bangladesh");
        return;
      }
    }
    setSubmitting(true);
    try {
      // Build a "Spec changes" preamble from any fabric-spec overrides
      // the buyer entered. We surface this prominently in the notes so the
      // sourcing team sees the deltas vs the fabric's catalog spec.
      const overrideBits = [
        specOverride.composition && `Composition: ${specOverride.composition}`,
        specOverride.weight && `Weight: ${specOverride.weight}`,
        specOverride.width && `Width: ${specOverride.width}`,
        specOverride.type && `Type: ${specOverride.type}`,
      ].filter(Boolean);
      const message = overrideBits.length
        ? `[Spec changes requested] ${overrideBits.join(" · ")}${form.notes ? `\n\n${form.notes}` : ""}`
        : (form.notes || "");
      await fetch(`${API}/api/enquiries/rfq-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(localStorage.getItem("lf_customer_token")
            ? { Authorization: `Bearer ${localStorage.getItem("lf_customer_token")}` }
            : {}),
        },
        body: JSON.stringify({
          ...form,
          phone: `${form.country_code}${form.phone}`,
          fabric_type: fabricUrl ? "" : form.fabric_type,
          fabric_url: fabricUrl || "",
          fabric_name: fabricName || "",
          quantity_value: parseFloat(form.quantity) || 0,
          quantity_unit: form.quantity_unit,
          message,
          spec_override: overrideBits.length ? specOverride : null,
        })
      });
      toast.success("Your enquiry has been submitted! Our team will reach out within 24 hours.");
      trackGenerateLead({ source: fabricUrl ? 'SKU Page RFQ' : 'Homepage RFQ', fabric_type: form.fabric_type, fabric_name: fabricName || '', location: form.location });
      onClose();
      // Don't blow away the prefilled values for logged-in users — only reset
      // the per-enquiry fields (fabric_type)
      if (loggedInCustomer) {
        setForm((p) => ({ ...p, fabric_type: "" }));
      } else {
        setForm({ name: "", phone: "", country_code: "+91", gst_number: "", bin_number: "", company_name: "", email: "", fabric_type: "", location: "" });
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-set the quantity unit based on the fabric being enquired on:
  // knits use kg, wovens use meters. Fabric-aware default.
  useEffect(() => {
    if (!fabric) return;
    const cat = (fabric.category_id || fabric.category || "").toLowerCase();
    const fabType = (fabric.fabric_type || "").toLowerCase();
    const isKnits = cat.includes("knit") || fabType.includes("knit");
    setForm((p) => ({ ...p, quantity_unit: isKnits ? "kg" : "m" }));
  }, [fabric]);

  // Hand-off into the full multi-step RFQ wizard with the fabric's specs
  // pre-filled — used by PDP-launched modals when the buyer wants to share
  // more spec detail than this short modal collects.
  const openDetailedRfq = () => {
    const id = fabric && fabric.id ? fabric.id : "";
    onClose();
    if (id) navigate(`/rfq?fabric_id=${id}`);
    else navigate(`/rfq`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="rfq-modal-overlay"
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="rfq-modal"
      >
        <div className="bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] px-6 py-5 text-white sticky top-0 z-10">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" data-testid="rfq-modal-close" aria-label="Close">
            <X size={20} />
          </button>
          <h3 className="text-lg font-semibold pr-8">Request a Quote</h3>
          <p className="text-blue-100 text-sm mt-1">Fill in your details — our sourcing experts will reach out within 24 hours.</p>
          <p className="text-blue-100/90 text-xs mt-1">Bulk production typically dispatches within ~30 days of order confirmation.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1" data-testid="rfq-form">
          {loggedInCustomer ? null : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Your full name" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Location <span className="text-red-500">*</span></label>
                  <select required value={form.location} onChange={handleLocationChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" data-testid="rfq-location">
                    {LOCATIONS.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                  <div className="flex">
                    <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-700 flex items-center" data-testid="rfq-country-code">
                      {form.country_code}
                    </span>
                    <input type="tel" required value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone number" className="w-full px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-phone" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email ID <span className="text-red-500">*</span></label>
                  <input type="email" required value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-email" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.company_name} onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Your company" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-company" />
              </div>

              {isIndia && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GST Number <span className="text-red-500">*</span></label>
                  <input type="text" required value={form.gst_number} onChange={(e) => setForm(p => ({ ...p, gst_number: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-gst" />
                </div>
              )}

              {isBangladesh && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIN (Business Identification Number) <span className="text-red-500">*</span></label>
                  <input type="text" required value={form.bin_number} onChange={(e) => setForm(p => ({ ...p, bin_number: e.target.value }))} placeholder="Enter your BIN" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-bin" />
                </div>
              )}
            </>
          )}

          {fabric ? (
            /* Rich fabric specs preview when launched from a fabric detail page —
               so the buyer can confirm the spec they're enquiring on rather
               than staring at a blank submit screen. */
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3" data-testid="rfq-fabric-specs">
              <div className="flex items-start gap-3">
                {fabric.image_url && (
                  <img src={fabric.image_url} alt={fabric.name} className="w-16 h-16 object-cover rounded-md border border-gray-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-blue-600 font-medium mb-0.5">Enquiry for</p>
                  <a href={fabricUrl} className="text-sm font-semibold text-gray-900 hover:text-[#2563EB] hover:underline line-clamp-2" target="_blank" rel="noopener noreferrer" data-testid="rfq-fabric-link">
                    {fabric.name}
                  </a>
                  {fabric.fabric_code && <p className="text-[11px] text-gray-500 font-mono mt-0.5">{fabric.fabric_code}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSpec((v) => !v)}
                  className="text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
                  data-testid="rfq-edit-spec-btn"
                >
                  {editingSpec ? <>Done</> : <><Pencil size={11} />Edit</>}
                </button>
              </div>

              {/* Spec grid — read-only mode shows the fabric's defaults. */}
              {!editingSpec && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-2 border-t border-gray-200">
                  {Array.isArray(fabric.composition) && fabric.composition.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Composition: </span>
                      <span className="text-gray-900 font-medium">
                        {specOverride.composition || fabric.composition.filter(c => c.material).map(c => `${c.percentage}% ${c.material}`).join(" + ")}
                      </span>
                      {specOverride.composition && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(edited)</span>}
                    </div>
                  )}
                  {(fabric.gsm || specOverride.weight) && <div><span className="text-gray-500">Weight: </span><span className="text-gray-900 font-medium">{specOverride.weight || `${fabric.gsm} GSM`}</span>{specOverride.weight && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(edited)</span>}</div>}
                  {fabric.ounce && !fabric.gsm && !specOverride.weight && <div><span className="text-gray-500">Weight: </span><span className="text-gray-900 font-medium">{fabric.ounce} oz</span></div>}
                  {(fabric.width || specOverride.width) && <div><span className="text-gray-500">Width: </span><span className="text-gray-900 font-medium">{specOverride.width || `${fabric.width}"`}</span>{specOverride.width && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(edited)</span>}</div>}
                  {(fabric.fabric_type || specOverride.type) && <div><span className="text-gray-500">Type: </span><span className="text-gray-900 font-medium capitalize">{specOverride.type || fabric.fabric_type}</span>{specOverride.type && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(edited)</span>}</div>}
                  {fabric.weave_pattern && <div><span className="text-gray-500">Weave: </span><span className="text-gray-900 font-medium">{fabric.weave_pattern}</span></div>}
                  {fabric.knit_type && <div><span className="text-gray-500">Knit: </span><span className="text-gray-900 font-medium">{fabric.knit_type}</span></div>}
                  {fabric.color_or_shade && <div><span className="text-gray-500">Colour: </span><span className="text-gray-900 font-medium">{fabric.color_or_shade}</span></div>}
                  {fabric.starting_price && <div><span className="text-gray-500">Starting price: </span><span className="text-gray-900 font-medium">₹{fabric.starting_price}/{fabric.unit || form.quantity_unit}</span></div>}
                  {Number.isFinite(fabric.moq) && fabric.moq > 0 && <div><span className="text-gray-500">MOQ: </span><span className="text-gray-900 font-medium">{fabric.moq} {fabric.unit || form.quantity_unit}</span></div>}
                </div>
              )}

              {/* Edit mode — small inline form lets buyer override the 4
                  most-customised specs without leaving the quick modal. */}
              {editingSpec && (
                <div className="space-y-2 pt-2 border-t border-gray-200" data-testid="rfq-spec-edit-fields">
                  <p className="text-[10px] text-gray-500 leading-relaxed">Need a different spec? Override below — we'll flag the changes to the sourcing team. Leave blank to keep the catalog spec.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Composition</label>
                      <input
                        type="text"
                        value={specOverride.composition}
                        onChange={(e) => setSpecOverride((p) => ({ ...p, composition: e.target.value }))}
                        placeholder={Array.isArray(fabric.composition) && fabric.composition.length ? fabric.composition.filter(c => c.material).map(c => `${c.percentage}% ${c.material}`).join(" + ") : "e.g. 80% Cotton + 20% Polyester"}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:border-[#2563EB] focus:outline-none bg-white"
                        data-testid="rfq-spec-composition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Weight</label>
                      <input
                        type="text"
                        value={specOverride.weight}
                        onChange={(e) => setSpecOverride((p) => ({ ...p, weight: e.target.value }))}
                        placeholder={fabric.gsm ? `${fabric.gsm} GSM` : fabric.ounce ? `${fabric.ounce} oz` : "e.g. 180 GSM"}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:border-[#2563EB] focus:outline-none bg-white"
                        data-testid="rfq-spec-weight"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Width</label>
                      <input
                        type="text"
                        value={specOverride.width}
                        onChange={(e) => setSpecOverride((p) => ({ ...p, width: e.target.value }))}
                        placeholder={fabric.width ? `${fabric.width}"` : 'e.g. 58"'}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:border-[#2563EB] focus:outline-none bg-white"
                        data-testid="rfq-spec-width"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Type</label>
                      <input
                        type="text"
                        value={specOverride.type}
                        onChange={(e) => setSpecOverride((p) => ({ ...p, type: e.target.value }))}
                        placeholder={fabric.fabric_type || "e.g. Woven, Knit"}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:border-[#2563EB] focus:outline-none bg-white"
                        data-testid="rfq-spec-type"
                      />
                    </div>
                  </div>
                  {(specOverride.composition || specOverride.weight || specOverride.width || specOverride.type) && (
                    <button
                      type="button"
                      onClick={() => setSpecOverride({ composition: "", weight: "", width: "", type: "" })}
                      className="text-[10px] text-gray-500 hover:text-[#2563EB] hover:underline"
                      data-testid="rfq-spec-reset"
                    >
                      Reset to original spec
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : fabricUrl ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium mb-1">Enquiry for</p>
              <a href={fabricUrl} className="text-sm font-medium text-[#2563EB] hover:underline" target="_blank" rel="noopener noreferrer" data-testid="rfq-fabric-link">{fabricName || fabricUrl}</a>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">What fabric type are you looking at? <span className="text-red-500">*</span></label>
              <select required value={form.fabric_type} onChange={(e) => setForm(p => ({ ...p, fabric_type: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" data-testid="rfq-fabric-type">
                <option value="">Select fabric type</option>
                {FABRIC_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
              </select>
            </div>
          )}

          {/* Quantity + Notes — useful regardless of source. Quantity unit
              auto-syncs with the fabric (knit→kg, woven→m) but is editable. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity required <span className="text-red-500">*</span></label>
              <input type="number" min="1" step="1" required value={form.quantity} onChange={(e) => setForm(p => ({ ...p, quantity: e.target.value }))} placeholder="e.g. 5000" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" data-testid="rfq-quantity" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.quantity_unit} onChange={(e) => setForm(p => ({ ...p, quantity_unit: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" data-testid="rfq-quantity-unit">
                <option value="m">meters</option>
                <option value="kg">kilograms</option>
                <option value="yd">yards</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes / customisation <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any spec changes, target price, dispatch needs…" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none" data-testid="rfq-notes" />
          </div>

          <button type="submit" disabled={submitting} className="w-full py-3 bg-[#2563EB] text-white font-medium rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors flex items-center justify-center gap-2" data-testid="rfq-submit">
            {submitting ? "Submitting..." : "Submit RFQ"}
            {!submitting && <ArrowRight size={16} />}
          </button>

          {fabric && fabric.id && (
            <button
              type="button"
              onClick={openDetailedRfq}
              className="w-full -mt-1 py-2 text-xs text-[#2563EB] hover:text-[#1d4ed8] hover:underline inline-flex items-center justify-center gap-1.5"
              data-testid="rfq-open-detailed-form"
            >
              <FileText size={12} /> Need to share more spec detail? Open full RFQ form (specs pre-filled)
            </button>
          )}
          <p className="text-center text-xs text-gray-400">Free quote &middot; No commitment &middot; Expert sourcing support</p>
        </form>
      </div>
    </div>
  );
}
