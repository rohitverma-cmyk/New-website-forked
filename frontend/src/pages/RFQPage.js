/**
 * RFQ Page — 4-step wizard for buyers to request a quote.
 *
 * Step 1: Category + Fabric Type + Quantity
 * Step 2: Fabric Specification (composition, GSM/oz, weave, color, finish, etc.)
 * Step 3: Reference photos + target price + dispatch date + sample
 * Step 4: Delivery address + Contact (skipped if customer is logged in)
 *
 * Logged-in customers' contact + GST is pulled from their profile via JWT
 * server-side, so step 4 is reduced to delivery only.
 */
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, CheckCircle, Send, Lock, Plus, X, Upload, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { uploadToCloudinary } from "../lib/api";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = [
  { id: "cotton",  name: "Cotton",  icon: "🧵", defaultFabricType: "woven" },
  { id: "knits",   name: "Knits",   icon: "🧶", defaultFabricType: "knitted" },
  { id: "denim",   name: "Denim",   icon: "👖", defaultFabricType: "woven" },
  { id: "viscose", name: "Viscose", icon: "✨", defaultFabricType: "woven" },
];

const FABRIC_REQ_TYPES = ["Greige", "Dyed", "RFD", "Printed"];
const FABRIC_TYPES = ["woven", "knitted", "non-woven"];
const STRETCH_OPTIONS = ["non_stretch", "2_way", "4_way", "comfort_stretch", "power_stretch"];
const WEAVE_OPTIONS = ["Plain", "Twill", "Satin", "Dobby", "Jacquard", "Oxford", "Poplin", "Basket", "Herringbone", "Other"];
const KNIT_OPTIONS = ["Single Jersey", "Interlock", "Pique", "Rib 1x1", "Rib 2x2", "French Terry", "Fleece", "Loopknit", "Waffle", "Mesh", "Honeycomb", "Other"];
const WASH_TYPES = ["Indigo", "Sulphur Black", "Raw", "Stone Wash", "Enzyme Wash", "Bleach Wash", "Acid Wash", "Pigment Dyed", "Other"];
const COMMON_MATERIALS = ["Cotton", "Polyester", "Viscose", "Lycra", "Spandex", "Nylon", "Linen", "Modal", "Tencel", "Wool", "Silk", "Acrylic", "Bamboo", "Hemp"];
const CERTIFICATIONS = ["GOTS", "OEKO-TEX", "GRS", "BCI", "USDA Organic", "Cradle to Cradle"];

const EMPTY_COMPOSITION = [
  { material: "", percentage: 0 },
  { material: "", percentage: 0 },
  { material: "", percentage: 0 },
];

const EMPTY_FORM = {
  // Step 1
  category: "",
  fabric_type: "woven",
  fabric_requirement_type: "",
  quantity_value: "",
  quantity_unit: "m",   // m | kg | yd

  // Step 2
  sub_category: "",
  composition: EMPTY_COMPOSITION,
  gsm: "",
  weight_oz: "",        // denim
  width_inches: "",
  color: "",
  pantone_code: "",
  weave_type: "",
  knit_type: "",
  thread_count: "",
  yarn_count: "",
  stretch: "",
  finish: "",
  end_use: "",
  certifications: [],
  knit_quality: "",
  denim_specification: "",
  wash_type: "",

  // Step 3
  reference_images: [],
  target_price_per_unit: "",
  required_by: "",
  sample_needed: false,
  message: "",

  // Step 4 — delivery
  delivery_city: "",
  delivery_state: "",
  delivery_pincode: "",

  // Step 4 — contact (only if not logged in)
  full_name: "",
  email: "",
  phone: "",
  gst_number: "",
  website: "",
};

const Section = ({ title, children, hint }) => (
  <div>
    <h3 className="text-sm font-semibold text-neutral-800 mb-1">{title}</h3>
    {hint && <p className="text-xs text-neutral-500 mb-3">{hint}</p>}
    <div className="space-y-3">{children}</div>
  </div>
);

const Field = ({ label, children, optional = false, required = false }) => (
  <div>
    <label className="block text-sm font-medium text-neutral-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {optional && <span className="text-neutral-400 font-normal ml-1">(optional)</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none transition-colors text-sm";

const RFQPage = () => {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedRfqNumber, setSubmittedRfqNumber] = useState("");
  const [loggedInCustomer, setLoggedInCustomer] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAccount = searchParams.get("from") === "account";

  const [form, setForm] = useState(EMPTY_FORM);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  // Pull profile if customer is logged in (skip step 4 contact fields)
  useEffect(() => {
    const token = localStorage.getItem("lf_customer_token");
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/customer/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const me = await res.json();
        if (cancelled) return;
        setLoggedInCustomer(me);
        const realEmail = (me.email || "").endsWith("@phone.locofast.local") ? "" : (me.email || "");
        update({
          full_name: form.full_name || me.name || "",
          email: form.email || realEmail,
          phone: form.phone || me.phone || "",
          gst_number: form.gst_number || me.gstin || "",
          delivery_city: form.delivery_city || me.city || "",
          delivery_state: form.delivery_state || me.state || "",
          delivery_pincode: form.delivery_pincode || me.pincode || "",
        });
      } catch { /* silently ignore — manual entry fallback */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-flip default unit based on fabric_type:
  //   woven → meters, knitted/non-woven → kilograms
  useEffect(() => {
    if (form.fabric_type === "knitted" || form.fabric_type === "non-woven") {
      if (form.quantity_unit === "m") update({ quantity_unit: "kg" });
    } else if (form.fabric_type === "woven") {
      if (form.quantity_unit === "kg") update({ quantity_unit: "m" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fabric_type]);

  const compositionTotal = useMemo(
    () => form.composition.reduce((s, c) => s + (Number(c.percentage) || 0), 0),
    [form.composition]
  );

  const isCotton = form.category === "cotton";
  const isViscose = form.category === "viscose";
  const isDenim = form.category === "denim";
  const isKnits = form.category === "knits";

  // ---------- Step navigation ----------
  const validateStep1 = () => {
    if (!form.category) return toast.error("Pick a category first") && false;
    const qty = parseFloat(form.quantity_value);
    if (!qty || qty <= 0) return toast.error("Enter a valid quantity") && false;
    if ((isCotton || isViscose) && !form.fabric_requirement_type) {
      return toast.error("Select Greige / Dyed / RFD / Printed") && false;
    }
    return true;
  };
  const validateStep2 = () => {
    // composition optional but if any row filled, sum must be 100
    const filled = form.composition.filter((c) => c.material && Number(c.percentage) > 0);
    if (filled.length > 0 && Math.round(compositionTotal * 10) / 10 !== 100) {
      return toast.error(`Composition must total 100% (currently ${compositionTotal}%)`) && false;
    }
    return true;
  };
  const validateStep3 = () => {
    return true; // all fields optional in this step
  };
  const validateContact = () => {
    if (loggedInCustomer) return true;
    if (!form.full_name.trim()) return toast.error("Please enter your full name") && false;
    if (!form.email.trim()) return toast.error("Please enter your email") && false;
    if (!form.phone.trim()) return toast.error("Please enter your phone") && false;
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep(Math.max(1, step - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ---------- Composition handlers ----------
  const updateComposition = (idx, field, value) => {
    const next = [...form.composition];
    next[idx] = { ...next[idx], [field]: field === "percentage" ? Number(value) || 0 : value };
    update({ composition: next });
  };
  const addCompositionRow = () => {
    if (form.composition.length >= 5) return;
    update({ composition: [...form.composition, { material: "", percentage: 0 }] });
  };
  const removeCompositionRow = (idx) => {
    update({ composition: form.composition.filter((_, i) => i !== idx) });
  };

  // ---------- Image upload ----------
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingImage(true);
    try {
      const urls = [];
      for (const file of files) {
        const res = await uploadToCloudinary(file, "rfq-references");
        if (res?.data?.url) urls.push(res.data.url);
      }
      update({ reference_images: [...form.reference_images, ...urls] });
      toast.success(`${urls.length} image${urls.length === 1 ? "" : "s"} uploaded`);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!validateContact()) return;
    setSubmitting(true);
    try {
      const cleanComposition = form.composition
        .filter((c) => c.material && Number(c.percentage) > 0)
        .map((c) => ({ material: c.material, percentage: Number(c.percentage) }));

      const payload = {
        category: form.category,
        fabric_requirement_type: form.fabric_requirement_type || "",
        quantity_value: parseFloat(form.quantity_value) || 0,
        quantity_unit: form.quantity_unit,
        // legacy fields kept blank — backend now also accepts quantity_value
        knit_quality: form.knit_quality || "",
        knit_type: form.knit_type || "",
        denim_specification: form.denim_specification || "",
        wash_type: form.wash_type || "",
        weight_oz: parseFloat(form.weight_oz) || 0,
        sub_category: form.sub_category || "",
        composition: cleanComposition,
        gsm: parseFloat(form.gsm) || 0,
        width_inches: parseFloat(form.width_inches) || 0,
        color: form.color || "",
        pantone_code: form.pantone_code || "",
        weave_type: form.weave_type || "",
        thread_count: form.thread_count || "",
        yarn_count: form.yarn_count || "",
        stretch: form.stretch || "",
        finish: form.finish || "",
        end_use: form.end_use || "",
        certifications: form.certifications || [],
        reference_images: form.reference_images || [],
        target_price_per_unit: parseFloat(form.target_price_per_unit) || 0,
        required_by: form.required_by || "",
        sample_needed: !!form.sample_needed,
        delivery_city: form.delivery_city || "",
        delivery_state: form.delivery_state || "",
        delivery_pincode: form.delivery_pincode || "",
        full_name: form.full_name || "",
        email: form.email || "",
        phone: form.phone || "",
        gst_number: form.gst_number || "",
        website: form.website || "",
        message: form.message || "",
      };

      // Prefer brand token over customer token so enterprise users land
      // their RFQs inside the brand portal's "My Queries" view.
      const brandToken = localStorage.getItem("lf_brand_token");
      const token = brandToken || localStorage.getItem("lf_customer_token");
      const res = await fetch(`${API_URL}/api/rfq/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit");
      setSubmitted(true);
      setSubmittedRfqNumber(data.rfq_number);
      toast.success(`RFQ ${data.rfq_number} submitted!`);
      if (brandToken) setTimeout(() => navigate("/enterprise/queries"), 1500);
      else if (fromAccount) setTimeout(() => navigate("/account?tab=queries"), 1500);
    } catch (err) {
      toast.error(err.message || "Failed to submit RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  // Number of steps shown — logged-in users skip the contact portion of step 4
  const totalSteps = 4;

  // ---------- Success screen ----------
  if (submitted) {
    return (
      <>
        <Navbar />
        <Helmet><title>RFQ Submitted | Locofast</title></Helmet>
        <main className="pt-32 pb-20 min-h-screen bg-gradient-to-b from-emerald-50/40 to-white">
          <div className="max-w-xl mx-auto px-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-semibold text-neutral-900 mb-3">RFQ Submitted</h1>
            <p className="text-neutral-600 mb-2">
              Reference: <span className="font-mono font-semibold text-neutral-900">{submittedRfqNumber}</span>
            </p>
            <p className="text-neutral-500 text-sm mb-8">Our team will review your requirement and get back within 24 hours.</p>
            <div className="flex gap-3 justify-center">
              <Link to="/account?tab=queries" className="px-5 py-2.5 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-blue-600">View My Queries</Link>
              <Link to="/" className="px-5 py-2.5 border border-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-50">Back to Home</Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <Helmet><title>Request a Quote | Locofast</title></Helmet>
      <main className="pt-24 pb-16 min-h-screen bg-gray-50" data-testid="rfq-page">
        <div className="max-w-3xl mx-auto px-6">
          {/* Top progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-neutral-500 uppercase tracking-wide font-medium">Step {step} of {totalSteps}</p>
              {step > 1 && (
                <button onClick={handleBack} className="text-xs text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1">
                  <ArrowLeft size={14} /> Back
                </button>
              )}
            </div>
            <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#2563EB] transition-all duration-300" style={{ width: `${(step / totalSteps) * 100}%` }} />
            </div>
          </div>

          {/* ============================ STEP 1 ============================ */}
          {step === 1 && (
            <div data-testid="rfq-step-1">
              <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 mb-2">What fabric do you need?</h1>
              <p className="text-neutral-600 mb-6">Pick a category and tell us how much you need.</p>

              <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-6">
                <Section title="Category" hint="We route your RFQ to vendors specialising in this category">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => update({ category: c.id, fabric_type: c.defaultFabricType })}
                        className={`p-4 rounded-xl border-2 transition-all ${form.category === c.id ? "border-[#2563EB] bg-blue-50" : "border-neutral-200 hover:border-neutral-300"}`}
                        data-testid={`cat-${c.id}`}
                      >
                        <div className="text-3xl mb-1">{c.icon}</div>
                        <div className="text-sm font-medium">{c.name}</div>
                      </button>
                    ))}
                  </div>
                </Section>

                {form.category && (
                  <>
                    <Section title="Fabric type">
                      <div className="grid grid-cols-3 gap-2">
                        {FABRIC_TYPES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => update({ fabric_type: t })}
                            className={`px-3 py-2 rounded-lg border text-sm capitalize ${form.fabric_type === t ? "border-[#2563EB] bg-blue-50 text-[#2563EB] font-medium" : "border-neutral-200 hover:border-neutral-300"}`}
                            data-testid={`ftype-${t}`}
                          >{t.replace("-", " ")}</button>
                        ))}
                      </div>
                    </Section>

                    {(isCotton || isViscose) && (
                      <Section title="Fabric requirement">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {FABRIC_REQ_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => update({ fabric_requirement_type: t })}
                              className={`px-3 py-2 rounded-lg border text-sm ${form.fabric_requirement_type === t ? "border-[#2563EB] bg-blue-50 text-[#2563EB] font-medium" : "border-neutral-200 hover:border-neutral-300"}`}
                              data-testid={`freq-${t.toLowerCase()}`}
                            >{t}</button>
                          ))}
                        </div>
                      </Section>
                    )}

                    <Section title="Quantity" hint="Enter the exact quantity you need">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={form.quantity_value}
                          onChange={(e) => update({ quantity_value: e.target.value })}
                          placeholder="e.g. 8500"
                          className={`${inputCls} flex-1`}
                          data-testid="rfq-quantity-value"
                        />
                        <select
                          value={form.quantity_unit}
                          onChange={(e) => update({ quantity_unit: e.target.value })}
                          className="px-3 py-2 rounded-lg border border-neutral-200 focus:border-[#2563EB] focus:outline-none text-sm bg-white"
                          data-testid="rfq-quantity-unit"
                        >
                          <option value="m">meters</option>
                          <option value="kg">kilograms</option>
                          <option value="yd">yards</option>
                        </select>
                      </div>
                      <p className="text-xs text-neutral-500">
                        Default unit auto-set from fabric type ({form.fabric_type === "woven" ? "meters" : "kilograms"}).
                        Use yards for international buyers.
                      </p>
                    </Section>
                  </>
                )}
              </div>

              <button onClick={handleNext} className="mt-5 w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2" data-testid="rfq-next-1">
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ============================ STEP 2 ============================ */}
          {step === 2 && (
            <div data-testid="rfq-step-2">
              <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 mb-2">Fabric specification</h1>
              <p className="text-neutral-600 mb-6">More detail = better-matched quotes. Skip what you don't need.</p>

              <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-6">
                <Section title="Composition" hint={`Total must equal 100% — currently ${Math.round(compositionTotal * 10) / 10}%`}>
                  <div className="space-y-2">
                    {form.composition.map((c, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          list="rfq-materials"
                          value={c.material}
                          onChange={(e) => updateComposition(i, "material", e.target.value)}
                          placeholder={`Material ${i + 1}`}
                          className={`${inputCls} flex-1`}
                          data-testid={`comp-material-${i}`}
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={c.percentage || ""}
                          onChange={(e) => updateComposition(i, "percentage", e.target.value)}
                          placeholder="%"
                          className={`${inputCls} w-20 text-center`}
                          data-testid={`comp-pct-${i}`}
                        />
                        {form.composition.length > 1 && (
                          <button type="button" onClick={() => removeCompositionRow(i)} className="text-neutral-400 hover:text-red-600 p-1">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <datalist id="rfq-materials">
                      {COMMON_MATERIALS.map((m) => <option key={m} value={m} />)}
                    </datalist>
                    {form.composition.length < 5 && (
                      <button type="button" onClick={addCompositionRow} className="text-xs text-[#2563EB] hover:underline inline-flex items-center gap-1">
                        <Plus size={12} /> Add material
                      </button>
                    )}
                  </div>
                </Section>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {!isDenim && (
                    <Field label="GSM" optional>
                      <input type="number" min="20" max="2000" value={form.gsm} onChange={(e) => update({ gsm: e.target.value })} placeholder="180" className={inputCls} data-testid="rfq-gsm" />
                    </Field>
                  )}
                  {isDenim && (
                    <Field label="Weight (oz)" optional>
                      <input type="number" min="4" max="20" step="0.1" value={form.weight_oz} onChange={(e) => update({ weight_oz: e.target.value })} placeholder="11.5" className={inputCls} data-testid="rfq-weight-oz" />
                    </Field>
                  )}
                  <Field label="Width (inches)" optional>
                    <input type="number" min="20" max="120" value={form.width_inches} onChange={(e) => update({ width_inches: e.target.value })} placeholder="58" className={inputCls} data-testid="rfq-width" />
                  </Field>
                  <Field label="Color / Shade" optional>
                    <input type="text" value={form.color} onChange={(e) => update({ color: e.target.value })} placeholder="Indigo Blue" className={inputCls} data-testid="rfq-color" />
                  </Field>
                  <Field label="Pantone Code" optional>
                    <input type="text" value={form.pantone_code} onChange={(e) => update({ pantone_code: e.target.value })} placeholder="19-3933 TPX" className={inputCls} data-testid="rfq-pantone" />
                  </Field>
                  <Field label={form.fabric_type === "knitted" ? "Knit Type" : "Weave Type"} optional>
                    <select value={form.fabric_type === "knitted" ? form.knit_type : form.weave_type} onChange={(e) => update(form.fabric_type === "knitted" ? { knit_type: e.target.value } : { weave_type: e.target.value })} className={`${inputCls} bg-white`} data-testid="rfq-weave-knit">
                      <option value="">Select…</option>
                      {(form.fabric_type === "knitted" ? KNIT_OPTIONS : WEAVE_OPTIONS).map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </Field>
                  <Field label="Stretch" optional>
                    <select value={form.stretch} onChange={(e) => update({ stretch: e.target.value })} className={`${inputCls} bg-white`} data-testid="rfq-stretch">
                      <option value="">Select…</option>
                      {STRETCH_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </Field>
                  <Field label="Thread Count" optional>
                    <input type="text" value={form.thread_count} onChange={(e) => update({ thread_count: e.target.value })} placeholder="60x60" className={inputCls} data-testid="rfq-thread-count" />
                  </Field>
                  <Field label="Yarn Count" optional>
                    <input type="text" value={form.yarn_count} onChange={(e) => update({ yarn_count: e.target.value })} placeholder="30s x 20s" className={inputCls} data-testid="rfq-yarn-count" />
                  </Field>
                  <Field label="Finish" optional>
                    <input type="text" value={form.finish} onChange={(e) => update({ finish: e.target.value })} placeholder="Bio, Silicon, Enzyme Wash" className={inputCls} data-testid="rfq-finish" />
                  </Field>
                  <Field label="End Use" optional>
                    <input type="text" value={form.end_use} onChange={(e) => update({ end_use: e.target.value })} placeholder="Shirts, Dresses, Trousers" className={inputCls} data-testid="rfq-end-use" />
                  </Field>
                  {isDenim && (
                    <Field label="Wash Type" optional>
                      <select value={form.wash_type} onChange={(e) => update({ wash_type: e.target.value })} className={`${inputCls} bg-white`} data-testid="rfq-wash">
                        <option value="">Select…</option>
                        {WASH_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </Field>
                  )}
                </div>

                <Section title="Certifications" hint="Tick any required by your end customer">
                  <div className="flex flex-wrap gap-2">
                    {CERTIFICATIONS.map((c) => {
                      const on = form.certifications.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => update({ certifications: on ? form.certifications.filter((x) => x !== c) : [...form.certifications, c] })}
                          className={`px-3 py-1.5 rounded-full border text-xs ${on ? "border-emerald-400 bg-emerald-50 text-emerald-700 font-medium" : "border-neutral-200 hover:border-neutral-300"}`}
                        >{c}</button>
                      );
                    })}
                  </div>
                </Section>

                {isDenim && (
                  <Field label="Denim Specification (free-text)" optional>
                    <textarea rows={2} value={form.denim_specification} onChange={(e) => update({ denim_specification: e.target.value })} placeholder="65% Cotton 35% Poly 11oz Indigo Black" className={inputCls + " resize-none"} data-testid="rfq-denim-spec" />
                  </Field>
                )}
                {isKnits && (
                  <Field label="Knit Quality (free-text)" optional>
                    <input type="text" value={form.knit_quality} onChange={(e) => update({ knit_quality: e.target.value })} placeholder="4 Way Lycra 220-230 GSM" className={inputCls} data-testid="rfq-knit-quality" />
                  </Field>
                )}
              </div>

              <button onClick={handleNext} className="mt-5 w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2" data-testid="rfq-next-2">
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ============================ STEP 3 ============================ */}
          {step === 3 && (
            <div data-testid="rfq-step-3">
              <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 mb-2">References & target price</h1>
              <p className="text-neutral-600 mb-6">Photos and a target price help vendors quote sharper.</p>

              <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-6">
                <Section title="Reference photos" hint="Upload swatches, mood-board references, or a competitor SKU">
                  <div className="flex flex-wrap gap-3">
                    {form.reference_images.map((url, i) => (
                      <div key={i} className="relative w-24 h-24 rounded-lg border border-neutral-200 overflow-hidden">
                        <img src={url} alt="reference" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => update({ reference_images: form.reference_images.filter((_, j) => j !== i) })} className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-[10px]">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 border-2 border-dashed border-neutral-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#2563EB] hover:bg-blue-50 transition-colors text-neutral-400">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploadingImage} data-testid="rfq-image-upload" />
                      {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload size={18} />}
                      <span className="text-[10px] mt-1">{uploadingImage ? "Uploading…" : "Add"}</span>
                    </label>
                  </div>
                </Section>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={`Target price per ${form.quantity_unit}`} optional>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">₹</span>
                      <input type="number" min="0" step="0.5" value={form.target_price_per_unit} onChange={(e) => update({ target_price_per_unit: e.target.value })} placeholder="120" className={inputCls + " pl-7"} data-testid="rfq-target-price" />
                    </div>
                  </Field>
                  <Field label="Required by" optional>
                    <input type="date" value={form.required_by} onChange={(e) => update({ required_by: e.target.value })} className={inputCls} data-testid="rfq-required-by" />
                  </Field>
                </div>

                <label className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={form.sample_needed} onChange={(e) => update({ sample_needed: e.target.checked })} className="mt-0.5" data-testid="rfq-sample-needed" />
                  <div className="text-sm">
                    <p className="font-medium text-neutral-900">I need a sample first</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Vendors will quote sample pricing alongside bulk pricing.</p>
                  </div>
                </label>

                <Field label="Additional notes" optional>
                  <textarea rows={3} value={form.message} onChange={(e) => update({ message: e.target.value })} placeholder="Any other context — tolerance, delivery, packaging…" className={inputCls + " resize-none"} data-testid="rfq-message" />
                </Field>
              </div>

              <button onClick={handleNext} className="mt-5 w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2" data-testid="rfq-next-3">
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ============================ STEP 4 ============================ */}
          {step === 4 && (
            <div data-testid="rfq-step-4">
              <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 mb-2">Delivery {loggedInCustomer ? "& review" : "& contact"}</h1>
              <p className="text-neutral-600 mb-6">{loggedInCustomer ? "Confirm where to ship and submit." : "Where should we deliver and how can we reach you?"}</p>

              <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-6">
                <Section title="Delivery address" hint="Used for vendor quotes that include shipping">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="City" optional>
                      <input type="text" value={form.delivery_city} onChange={(e) => update({ delivery_city: e.target.value })} placeholder="Mumbai" className={inputCls} data-testid="rfq-city" />
                    </Field>
                    <Field label="State" optional>
                      <input type="text" value={form.delivery_state} onChange={(e) => update({ delivery_state: e.target.value })} placeholder="Maharashtra" className={inputCls} data-testid="rfq-state" />
                    </Field>
                    <Field label="Pincode" optional>
                      <input type="text" value={form.delivery_pincode} onChange={(e) => update({ delivery_pincode: e.target.value })} placeholder="400001" maxLength={10} className={inputCls} data-testid="rfq-pincode" />
                    </Field>
                  </div>
                </Section>

                {loggedInCustomer ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3" data-testid="rfq-loggedin-card">
                    <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900 mb-2">
                        Submitting as
                        <Link to="/account" className="ml-2 text-xs text-blue-600 hover:underline font-normal">(edit profile)</Link>
                      </p>
                      <div className="text-sm text-blue-900 space-y-0.5">
                        {form.full_name && <p><span className="text-blue-700/70">Name:</span> <span className="font-medium">{form.full_name}</span></p>}
                        {form.email && <p><span className="text-blue-700/70">Email:</span> <span className="font-medium break-all">{form.email}</span></p>}
                        {form.phone && <p><span className="text-blue-700/70">Phone:</span> <span className="font-medium">+{form.phone.replace(/^\+/, "")}</span></p>}
                        {form.gst_number && <p><span className="text-blue-700/70">GST:</span> <span className="font-medium font-mono text-xs">{form.gst_number}</span></p>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Section title="Contact details">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Full name" required>
                        <input type="text" value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} placeholder="Your full name" className={inputCls} data-testid="rfq-fullname" />
                      </Field>
                      <Field label="Email" required>
                        <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} placeholder="you@company.com" className={inputCls} data-testid="rfq-email" />
                      </Field>
                      <Field label="Phone" required>
                        <input type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} data-testid="rfq-phone" />
                      </Field>
                      <Field label="GSTIN" optional>
                        <input type="text" value={form.gst_number} onChange={(e) => update({ gst_number: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength={15} className={inputCls + " font-mono uppercase"} data-testid="rfq-gst" />
                      </Field>
                      <Field label="Website" optional>
                        <input type="url" value={form.website} onChange={(e) => update({ website: e.target.value })} placeholder="https://yourcompany.com" className={inputCls} data-testid="rfq-website" />
                      </Field>
                    </div>
                  </Section>
                )}
              </div>

              <button onClick={handleSubmit} disabled={submitting} className="mt-5 w-full bg-[#2563EB] text-white py-3 rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-60" data-testid="rfq-submit">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send size={16} /> Submit RFQ</>}
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default RFQPage;
