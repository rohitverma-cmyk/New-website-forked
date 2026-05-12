import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Search, Package, Loader2, Upload, Video, Check, HelpCircle } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import CommissionHelpModal from "../../components/vendor/CommissionHelpModal";
import ErrorBoundary from "../../components/ErrorBoundary";
import api, { getVendorFabrics, createVendorFabric, updateVendorFabric, deleteVendorFabric, getVendorCategories, getArticles, uploadToCloudinary, uploadVideoToCloudinary } from "../../lib/api";
import useCompositionOptions from "../../hooks/useCompositionOptions";
import { getDispatchOptions } from "../../lib/dispatchOptions";
import { toast } from "sonner";

const fabricTypes = ["woven", "knitted", "non-woven"];
const patternOptions = ["Solid", "Print", "Stripes", "Checks", "Floral", "Geometric", "Digital", "Random", "Greige", "Others"];
const finishOptions = ["", "Bio", "Double Bio", "Silicon", "Double Silicon", "Enzyme Wash", "Sulphur Wash", "Acid Wash", "Normal Wash", "Stone Wash"];

// ===== Category-specific dropdown values =====
const DENIM_CATEGORY_ID = "cat-denim";
const COTTON_CATEGORY_ID = "cat-cotton";
const POLYESTER_CATEGORY_ID = "cat-polyester";
const denimColorOptions = [
  "", "Black x White", "Black x Black", "Indigo x White", "Indigo x Black",
  "Indigo x Brown", "Dark Indigo x White",
  "Ecru", "RFD", "IBST (Indigo bottom, Sulphur top)", "SBIT (Sulphur bottom, Indigo top)",
];
const denimWeaveOptions = [
  "", "2/1 RHT", "2/1 LHT", "3/1 RHT", "3/1 LHT", "4/1 Satin", "4/1 Satin RHT", "4/1 Satin LHT", "Dobby", "Herringbone",
];
const cottonWeaveOptions = [
  "", "Voile", "Cambric", "Poplin", "2/1 Twill", "3/1 Twill", "2/2 Twill", "4/1 Satin",
  "Dobby", "Herringbone", "-Slub", "+Slub", "Double Cloth", "Oxford", "Canvas",
  "Sheeting", "Crimp Sheeting", "4mm Ripstop", "6mm Ripstop", "Casement", "Lurex",
];
// For Woven + Polyester category
const polyesterWovenWeaveOptions = [
  "", "1x1 Plain", "2x1 Twill", "3x1 Twill", "2x2 Twill", "4x1 Satin",
  "Dobby", "Jacquard", "-Slub", "+Slub", "Magic Slub",
];
// Viscose weave options
const viscoseWeaveOptions = [
  "", "1x1 Plain", "2/1 Twill", "3/1 Twill", "2/2 Twill", "Dobby", "4/1 Satin", "-Slub", "+Slub",
];
// For knitted fabrics, the "weave" field stores the knit structure instead.
const knitTypeOptions = [
  "", "Single Jersey", "Interlock", "Rice Knit", "Dot Knit", "Mesh", "Pique",
  "Honeycomb Pique", "Waffle", "Fleece", "Terry", "Baby Terry", "1x1 Rib", "2x2 Rib",
  "3D Jacquard", "Dobby", "4-Way Lycra", "2-Way Lycra", "Tin Tin", "Sap Matty",
  "Micro PP", "Jacquard Zombie", "Taiwan Lycra", "Football Knit", "Nirmal Knit",
  "Reebok Knit", "Adidas Knit", "Super Malai", "Micro Crepe", "Bubble Crepe",
];
const STRETCH_FIBRES = ['spandex', 'elastane', 'lycra', 'stretch'];
const isStretchFibre = (m) => STRETCH_FIBRES.some((f) => (m || '').toLowerCase().includes(f));
const stretchPercentOptions = Array.from({ length: 40 }, (_, i) => (i + 1) * 0.5);
const colorOptions = [
  "", "White", "Off-White", "Cream", "Ivory", "Beige", "Tan", "Brown", "Dark Brown", "Chocolate",
  "Black", "Charcoal", "Grey", "Light Grey", "Silver",
  "Red", "Maroon", "Burgundy", "Wine", "Coral", "Salmon", "Pink", "Hot Pink", "Magenta", "Fuchsia",
  "Orange", "Peach", "Rust", "Terracotta",
  "Yellow", "Gold", "Mustard", "Lemon", "Butter",
  "Green", "Olive", "Khaki", "Mint", "Sage", "Forest Green", "Hunter Green", "Lime", "Teal",
  "Blue", "Navy", "Royal Blue", "Sky Blue", "Baby Blue", "Cobalt", "Indigo", "Denim",
  "Purple", "Lavender", "Violet", "Plum", "Mauve", "Lilac",
  "Multi-Color", "Melange", "Heather", "Natural", "Raw", "Undyed"
];
const plyOptions = [1, 2];
const yarnCountOptions = Array.from({ length: 100 }, (_, i) => i + 1);
const denierOptions = Array.from({ length: 200 }, (_, i) => i + 1);
const ounceOptions = Array.from({ length: 77 }, (_, i) => (1 + i * 0.25).toFixed(2)).map(v => parseFloat(v));
const percentageOptions = Array.from({ length: 100 }, (_, i) => i + 1);
const gsmOptions = Array.from({ length: 500 }, (_, i) => i + 1);
const widthOptions = Array.from({ length: 100 }, (_, i) => i + 1);
const deliveryDaysOptions = [
  "1-3", "3-5", "5-7", "7-9", "9-11", "11-13", "13-15", "15-17", "17-19", "19-21",
  "21-23", "23-25", "25-27", "27-29", "29-31", "31-33", "33-35", "35-37", "37-39", "39-41",
  "41-43", "43-45", "45-47", "47-49", "49-51"
];
const availabilityOptions = [
  { value: "Sample", label: "Sample Available", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "Bulk", label: "Bulk Available", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "On Request", label: "On Request", color: "bg-amber-50 text-amber-700 border-amber-200" },
];

const emptyComposition = [
  { material: "", percentage: 0 },
  { material: "", percentage: 0 },
  { material: "", percentage: 0 },
];

const emptyForm = {
  name: "", fabric_code: "", category_id: "", description: "",
  fabric_type: "woven", pattern: "Solid", weave_type: "", construction: "",
  composition: [...emptyComposition],
  gsm: "", ounce: "", weight_unit: "gsm", width: "", width_type: "",
  warp_ply: "1", warp_count: "", weft_ply: "1", weft_count: "",
  yarn_count: "", denier: "",
  color: "", finish: "",
  weft_shrinkage: "", stretch_percentage: "",
  moq: "", starting_price: "",
  availability: [], stock_type: "ready_stock",
  tags: "", images: [], videos: [],
  quantity_available: "", rate_per_meter: "", dispatch_timeline: "",
  sample_delivery_days: "", bulk_delivery_days: "",
  is_bookable: false, sample_price: "",
  pricing_tiers: [
    { min_qty: 0, max_qty: 100, price: "" },
    { min_qty: 101, max_qty: 500, price: "" },
    { min_qty: 501, max_qty: 1000, price: "" },
    { min_qty: 1001, max_qty: 2500, price: "" },
    { min_qty: 2501, max_qty: 5000, price: "" },
    { min_qty: 5001, max_qty: 10000, price: "" },
  ],
  seller_sku: "", article_id: "",
  has_multiple_colors: false, color_variants: [],
};

const VendorInventoryInner = () => {
  const compositionOptions = useCompositionOptions();
  const [fabrics, setFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingFabric, setEditingFabric] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [commissionMap, setCommissionMap] = useState({});        // { fabricId: { commission_pct, commission_amount, rule_applied } }
  const [modalCommission, setModalCommission] = useState(null);  // Live commission preview inside the modal
  const [commissionHelp, setCommissionHelp] = useState(null);    // { categoryName, sellerId, pct } | null

  const isKnittedForm = () => (form?.fabric_type || "").toLowerCase() === "knitted";
  const isKnittedFabric = (fabric) => (fabric?.fabric_type || "").toLowerCase() === "knitted";
  const isDenimFabric = (fabric) => fabric?.category_id === DENIM_CATEGORY_ID;
  const shouldUseKgUnit = () => isKnittedForm() && form.category_id !== DENIM_CATEGORY_ID;
  const shouldUseKgForFabric = (fabric) => isKnittedFabric(fabric) && !isDenimFabric(fabric);
  const unit = shouldUseKgUnit() ? "kg" : "m";
  const unitLabel = shouldUseKgUnit() ? "kilograms" : "meters";
  const getFabricUnit = (fabric) => shouldUseKgForFabric(fabric) ? "kg" : "m";

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fabRes, catRes, artRes] = await Promise.all([
        getVendorFabrics(), getVendorCategories(), getArticles().catch(() => ({ data: [] }))
      ]);
      setFabrics(fabRes.data);
      setCategories(catRes.data);
      setArticles(artRes.data || []);
      fetchCommissions(fabRes.data);
    } catch { toast.error("Failed to load inventory"); }
    setLoading(false);
  };

  // Query platform commission for every fabric in parallel.
  // Uses the existing /api/commission/calculate-preview endpoint which honours
  // vendor > category > slab > default priority.
  const fetchCommissions = async (list) => {
    const sample = list.filter((f) => f.rate_per_meter > 0);
    if (sample.length === 0) return;
    const results = await Promise.all(
      sample.map((f) =>
        api
          .post("/commission/calculate-preview", {
            items: [{
              quantity: f.moq ? parseInt(f.moq) || 100 : 100,
              price_per_meter: f.rate_per_meter,
              seller_id: f.seller_id || "",
              category_name: f.category_name || "",
            }],
          })
          .then((r) => [f.id, r.data])
          .catch(() => [f.id, null])
      )
    );
    setCommissionMap((prev) => {
      const next = { ...prev };
      for (const [id, data] of results) if (data) next[id] = data;
      return next;
    });
  };

  // Live preview inside the Add/Edit modal — fires on category/price/MOQ change
  useEffect(() => {
    if (!showModal) return;
    const price = parseFloat(form.rate_per_meter);
    if (!form.category_id || !price || price <= 0) {
      setModalCommission(null);
      return;
    }
    const cat = categories.find((c) => c.id === form.category_id);
    const t = setTimeout(() => {
      api
        .post("/commission/calculate-preview", {
          items: [{
            quantity: form.moq ? parseInt(form.moq) || 100 : 100,
            price_per_meter: price,
            seller_id: editingFabric?.seller_id || "",
            category_name: cat?.name || "",
          }],
        })
        .then((r) => setModalCommission(r.data))
        .catch(() => setModalCommission(null));
    }, 280);
    return () => clearTimeout(t);
  }, [showModal, form.category_id, form.rate_per_meter, form.moq, categories, editingFabric]);

  const isPolyester = () => form.composition.some(c => c.material?.toLowerCase().includes('polyester'));
  const isDenim = () => form.category_id === DENIM_CATEGORY_ID;
  const isCotton = () => form.category_id === COTTON_CATEGORY_ID;
  const isPolyesterCategory = () => form.category_id === POLYESTER_CATEGORY_ID;
  const isViscose = () => {
    const cat = categories.find((c) => c.id === form.category_id);
    return (cat?.name || "").toLowerCase() === "viscose";
  };
  const showConstructionField = () => isCotton() || isViscose();
  const isKnittedType = () => (form.fabric_type || "").toLowerCase() === "knitted";
  const weaveOptionsForCategory = () => {
    if (isKnittedType()) return knitTypeOptions;  // fabric_type wins over category
    if (isDenim()) return denimWeaveOptions;
    if (isPolyesterCategory()) return polyesterWovenWeaveOptions;
    if (isViscose()) return viscoseWeaveOptions;
    if (isCotton()) return cottonWeaveOptions;
    return null;
  };
  const weaveFieldLabel = () => (isKnittedType() ? "Knit Type" : "Weave Type");

  // Denim is always measured in ounces — auto-force weight_unit when Denim is chosen
  useEffect(() => {
    if (isDenim() && form.weight_unit !== "ounce") {
      setForm((prev) => ({ ...prev, weight_unit: "ounce", gsm: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_id]);

  // Auto-generate name: "M1 M2 M3, [Weave], Weight, Color: <color>"
  const buildFabricName = () => {
    const mats = (form.composition || [])
      .map((c) => (c.material || "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    const weave = (form.weave_type || "").trim();
    const weight = form.weight_unit === "ounce"
      ? (form.ounce ? `${form.ounce}oz` : "")
      : (form.gsm ? `${form.gsm} GSM` : "");
    const color = (form.color || "").trim();
    const parts = [mats, weave, weight].filter(Boolean);
    const base = parts.join(", ");
    if (!base) return "";
    return color ? `${base}, Color: ${color}` : base;
  };

  const getCompositionTotal = () => {
    const n = form.composition.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
    return Math.round(n * 10) / 10;
  };

  const updateComposition = (index, field, value) => {
    const newComp = [...form.composition];
    let next;
    if (field === 'percentage') {
      const n = parseFloat(value);
      next = Number.isFinite(n) ? n : 0;
    } else {
      next = value;
      const prev = newComp[index] || {};
      const wasStretch = isStretchFibre(prev.material);
      const isStretchNow = isStretchFibre(value);
      if (wasStretch && !isStretchNow && prev.percentage && !Number.isInteger(prev.percentage)) {
        newComp[index] = { ...prev, percentage: Math.round(prev.percentage) };
      }
    }
    newComp[index] = { ...newComp[index], [field]: next };
    setForm({ ...form, composition: newComp });
  };

  const toggleAvailability = (value) => {
    setForm(prev => ({
      ...prev,
      availability: prev.availability.includes(value)
        ? prev.availability.filter(v => v !== value)
        : [...prev.availability, value]
    }));
  };

  const updatePricingTier = (index, field, value) => {
    const newTiers = [...form.pricing_tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setForm({ ...form, pricing_tiers: newTiers });
  };

  const addPricingTier = () => {
    const last = form.pricing_tiers[form.pricing_tiers.length - 1];
    const newMin = last ? (parseInt(last.max_qty) || 0) + 1 : 0;
    setForm({ ...form, pricing_tiers: [...form.pricing_tiers, { min_qty: newMin, max_qty: newMin + 999, price: "" }] });
  };

  const removePricingTier = (index) => {
    if (form.pricing_tiers.length > 1) setForm({ ...form, pricing_tiers: form.pricing_tiers.filter((_, i) => i !== index) });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(files.map(f => uploadToCloudinary(f, "fabrics")));
      setForm(prev => ({ ...prev, images: [...prev.images, ...results.map(r => r.data.url)] }));
      toast.success("Images uploaded");
    } catch {
      toast.error("Failed to upload images. Please try again.");
    }
    setUploading(false);
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 150 * 1024 * 1024) { toast.error("Video too large (max 150MB)"); return; }
    setUploadingVideo(true);
    setVideoUploadProgress(0);
    try {
      const result = await uploadVideoToCloudinary(file, "fabrics", p => setVideoUploadProgress(p));
      setForm(prev => ({ ...prev, videos: [...prev.videos, result.data.url] }));
      toast.success("Video uploaded");
    } catch { toast.error("Failed to upload video"); }
    setUploadingVideo(false);
    setVideoUploadProgress(0);
  };

  const openAddModal = () => { setEditingFabric(null); setForm({ ...emptyForm, composition: [...emptyComposition] }); setShowModal(true); };

  const openEditModal = (fabric) => {
    setEditingFabric(fabric);
    let compositionData = [...emptyComposition];
    if (Array.isArray(fabric.composition) && fabric.composition.length > 0) {
      compositionData = [fabric.composition[0] || { material: "", percentage: 0 }, fabric.composition[1] || { material: "", percentage: 0 }, fabric.composition[2] || { material: "", percentage: 0 }];
    } else if (typeof fabric.composition === 'string' && fabric.composition) {
      compositionData = [{ material: fabric.composition, percentage: 100 }, { material: "", percentage: 0 }, { material: "", percentage: 0 }];
    }
    setForm({
      ...emptyForm,
      name: fabric.name || "", fabric_code: fabric.fabric_code || "", category_id: fabric.category_id || "",
      description: fabric.description || "", fabric_type: fabric.fabric_type || "woven",
      pattern: fabric.pattern || "Solid", weave_type: fabric.weave_type || "", construction: fabric.construction || "", composition: compositionData,
      gsm: fabric.gsm ? fabric.gsm.toString() : "", ounce: fabric.ounce || "",
      weight_unit: fabric.weight_unit || "gsm", width: fabric.width || "", width_type: fabric.width_type || "",
      warp_ply: fabric.warp_count?.includes('/') ? fabric.warp_count.split('/')[0] : "1",
      warp_count: fabric.warp_count?.includes('/') ? fabric.warp_count.split('/')[1] : (fabric.warp_count || ""),
      weft_ply: fabric.weft_count?.includes('/') ? fabric.weft_count.split('/')[0] : "1",
      weft_count: fabric.weft_count?.includes('/') ? fabric.weft_count.split('/')[1] : (fabric.weft_count || ""),
      yarn_count: fabric.yarn_count || "", denier: fabric.denier ? fabric.denier.toString() : "",
      color: fabric.color || "", finish: fabric.finish || "",
      weft_shrinkage: fabric.weft_shrinkage ? fabric.weft_shrinkage.toString() : "",
      stretch_percentage: fabric.stretch_percentage ? fabric.stretch_percentage.toString() : "",
      moq: fabric.moq || "", starting_price: fabric.starting_price || "",
      availability: Array.isArray(fabric.availability) ? fabric.availability : [],
      stock_type: fabric.stock_type || "ready_stock",
      tags: Array.isArray(fabric.tags) ? fabric.tags.join(", ") : (fabric.tags || ""),
      images: fabric.images || [], videos: Array.isArray(fabric.videos) ? fabric.videos : [],
      quantity_available: fabric.quantity_available ? fabric.quantity_available.toString() : "",
      rate_per_meter: fabric.rate_per_meter ? fabric.rate_per_meter.toString() : "",
      dispatch_timeline: fabric.dispatch_timeline || "",
      sample_delivery_days: fabric.sample_delivery_days || "",
      bulk_delivery_days: fabric.bulk_delivery_days || "",
      is_bookable: fabric.is_bookable || false,
      sample_price: fabric.sample_price ? fabric.sample_price.toString() : "",
      pricing_tiers: fabric.pricing_tiers?.length > 0
        ? fabric.pricing_tiers.map(t => ({ min_qty: t.min_qty || 0, max_qty: t.max_qty || 0, price: t.price_per_meter ? t.price_per_meter.toString() : "" }))
        : emptyForm.pricing_tiers,
      seller_sku: fabric.seller_sku || "", article_id: fabric.article_id || "",
      has_multiple_colors: !!fabric.has_multiple_colors,
      color_variants: fabric.color_variants || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error("Fabric name is required"); return; }

    const compositionTotal = getCompositionTotal();
    const hasComp = form.composition.some(c => c.material && c.percentage > 0);
    if (hasComp && compositionTotal !== 100) { toast.error(`Composition must total 100% (currently ${compositionTotal}%)`); return; }

    if (form.weight_unit === "gsm" && !form.gsm) { toast.error("Please enter GSM"); return; }
    if (form.weight_unit === "ounce" && !form.ounce) { toast.error("Please enter Ounce"); return; }

    if (!form.dispatch_timeline) { toast.error("Please select a Dispatch Timeline"); return; }

    const cleanComp = form.composition.filter(c => c.material && c.percentage > 0);
    const hasPoly = cleanComp.some(c => c.material?.toLowerCase().includes('polyester'));

    const warpFormatted = form.warp_count ? `${form.warp_ply}/${form.warp_count}` : "";
    const weftFormatted = form.weft_count ? `${form.weft_ply}/${form.weft_count}` : "";

    setSubmitting(true);
    try {
      const payload = {
        name: form.name, fabric_code: form.fabric_code, category_id: form.category_id,
        description: form.description, fabric_type: form.fabric_type, pattern: form.pattern,
        weave_type: form.weave_type || "",
        construction: form.construction || "",
        composition: cleanComp, gsm: form.gsm ? parseInt(form.gsm) : null, ounce: form.ounce,
        weight_unit: form.weight_unit, width: form.width, width_type: form.width_type || "",
        warp_count: warpFormatted, weft_count: weftFormatted,
        yarn_count: form.yarn_count, denier: hasPoly && form.denier ? parseInt(form.denier) : null,
        color: form.color, finish: form.finish,
        weft_shrinkage: form.weft_shrinkage ? parseFloat(form.weft_shrinkage) : null,
        stretch_percentage: form.stretch_percentage ? parseFloat(form.stretch_percentage) : null,
        moq: form.moq, starting_price: form.starting_price,
        availability: form.availability, stock_type: form.stock_type,
        tags: typeof form.tags === 'string' ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : form.tags,
        images: form.images, videos: form.videos,
        quantity_available: form.quantity_available ? parseInt(form.quantity_available) : 0,
        rate_per_meter: form.rate_per_meter ? parseFloat(form.rate_per_meter) : 0,
        dispatch_timeline: form.dispatch_timeline,
        sample_delivery_days: form.sample_delivery_days, bulk_delivery_days: form.bulk_delivery_days,
        is_bookable: form.is_bookable,
        sample_price: form.sample_price ? parseFloat(form.sample_price) : null,
        pricing_tiers: form.pricing_tiers.filter(t => t.price).map(t => ({
          min_qty: parseInt(t.min_qty) || 0, max_qty: parseInt(t.max_qty) || 0, price_per_meter: parseFloat(t.price) || 0
        })),
        seller_sku: form.seller_sku, article_id: form.article_id,
        has_multiple_colors: !!form.has_multiple_colors,
        color_variants: form.has_multiple_colors ? (form.color_variants || []) : [],
      };

      if (editingFabric) {
        await updateVendorFabric(editingFabric.id, payload);
        toast.success("Fabric updated");
      } else {
        await createVendorFabric(payload);
        toast.success("Fabric submitted for approval");
      }
      setShowModal(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
    setSubmitting(false);
  };

  const handleDelete = async (fabric) => {
    if (!window.confirm(`Delete "${fabric.name}"?`)) return;
    try { await deleteVendorFabric(fabric.id); toast.success("Deleted"); fetchData(); }
    catch { toast.error("Failed to delete"); }
  };

  const filteredFabrics = fabrics.filter(f =>
    f.name?.toLowerCase().includes(search.toLowerCase()) ||
    f.fabric_code?.toLowerCase().includes(search.toLowerCase()) ||
    f.seller_sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <VendorLayout>
      <div className="p-8" data-testid="vendor-inventory">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">My Inventory</h1>
            <p className="text-gray-500 mt-1">{fabrics.length} fabrics</p>
          </div>
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" data-testid="add-fabric-btn">
            <Plus size={20} /> Add Fabric
          </button>
        </div>

        <div className="relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, code, or SKU..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none" data-testid="search-input" />
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" /></div>
        ) : filteredFabrics.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{search ? "No fabrics match your search" : "No fabrics yet"}</p>
            {!search && <button onClick={openAddModal} className="inline-flex items-center gap-2 text-emerald-600 hover:underline mt-2"><Plus size={16} /> Add your first fabric</button>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fabric</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GSM / Oz</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sales Price (Bulk)<br /><span className="normal-case text-[10px] text-gray-400 font-normal">what customer pays</span></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sales Price (Sample)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="col-commission">
                    <div className="inline-flex items-center gap-1">
                      Platform commission
                      <button
                        type="button"
                        onClick={() => setCommissionHelp({ sellerId: fabrics[0]?.seller_id || "", categoryName: "", pct: null })}
                        className="text-gray-400 hover:text-orange-500 transition-colors"
                        data-testid="col-commission-help"
                        title="How is commission calculated?"
                      >
                        <HelpCircle size={13} />
                      </button>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Your Payout<br /><span className="normal-case text-[10px] text-gray-400 font-normal">after commission</span></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFabrics.map((fabric) => (
                  <tr key={fabric.id} className="hover:bg-gray-50" data-testid={`fabric-row-${fabric.id}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <img src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"} alt={fabric.name} className="w-12 h-12 rounded-lg object-cover" />
                        <div>
                          <p className="font-medium text-gray-900">{fabric.name}</p>
                          <p className="text-sm text-gray-500">{fabric.seller_sku || fabric.fabric_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{fabric.category_name || "-"}</td>
                    <td className="px-4 py-4 text-gray-600">{fabric.gsm ? `${fabric.gsm} GSM` : fabric.ounce ? `${fabric.ounce} oz` : "-"}</td>
                    <td className="px-4 py-4"><span className={`font-medium ${fabric.quantity_available > 0 ? "text-emerald-600" : "text-gray-400"}`}>{fabric.quantity_available || 0}{getFabricUnit(fabric)}</span></td>
                    <td className="px-4 py-4">₹{fabric.rate_per_meter?.toLocaleString() || 0}/{getFabricUnit(fabric)}</td>
                    <td className="px-4 py-4">{fabric.sample_price ? `₹${fabric.sample_price.toLocaleString()}/${getFabricUnit(fabric)}` : "-"}</td>
                    <td className="px-4 py-4" data-testid={`commission-cell-${fabric.id}`}>
                      {commissionMap[fabric.id] ? (
                        <button
                          type="button"
                          onClick={() => setCommissionHelp({
                            sellerId: fabric.seller_id || "",
                            categoryName: fabric.category_name || "",
                            pct: commissionMap[fabric.id].commission_pct,
                          })}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded-full text-xs font-semibold hover:bg-orange-100 transition-colors"
                          title={`${commissionMap[fabric.id].rule_applied || "Default"} — click for details`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                          {commissionMap[fabric.id].commission_pct}%
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {/* Vendor payout / take-home per unit AFTER platform commission.
                        Makes the "what you actually receive" crystal clear so the
                        vendor doesn't have to do the math themselves. */}
                    <td className="px-4 py-4" data-testid={`payout-cell-${fabric.id}`}>
                      {fabric.rate_per_meter ? (() => {
                        const pct = commissionMap[fabric.id]?.commission_pct ?? 0;
                        const payout = fabric.rate_per_meter * (1 - pct / 100);
                        return (
                          <div className="leading-tight">
                            <div className="text-emerald-700 font-semibold text-sm">₹{payout.toLocaleString(undefined, { maximumFractionDigits: 2 })}/{getFabricUnit(fabric)}</div>
                            {pct > 0 && (
                              <div className="text-[10px] text-gray-400">after {pct}% commission</div>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${fabric.status === "approved" ? "bg-emerald-100 text-emerald-700" : fabric.status === "pending" ? "bg-yellow-100 text-yellow-700" : fabric.status === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                        {fabric.status === "approved" ? "Live" : fabric.status === "pending" ? "Pending Approval" : fabric.status === "rejected" ? "Rejected" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal(fabric)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" data-testid={`edit-${fabric.id}`}><Pencil size={18} /></button>
                        <button onClick={() => handleDelete(fabric)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" data-testid={`delete-${fabric.id}`}><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Comprehensive Fabric Form Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-xl">
                <h2 className="text-xl font-semibold">{editingFabric ? "Edit Fabric" : "Add New Fabric"}</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6" data-testid="vendor-fabric-form">
                {/* Section 1: Basic Info */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                        <span>Fabric Name *</span>
                        <button
                          type="button"
                          onClick={() => {
                            const n = buildFabricName();
                            if (!n) { toast.error("Add composition, weight & color first"); return; }
                            setForm({ ...form, name: n });
                            toast.success("Name generated");
                          }}
                          className="text-xs font-medium text-[#2563EB] hover:underline"
                          data-testid="fabric-generate-name-btn"
                          title="Auto-generate name from composition, weave (if set), weight & color"
                        >
                          Auto-generate
                        </button>
                      </label>
                      <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                        placeholder={isDenim() ? "Cotton Polyester Lycra, 3/1 RHT, 10oz, Color: Indigo x White" : "e.g., Cotton Polyester, 200 GSM, Color: Navy"}
                        data-testid="fabric-name-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Seller SKU</label>
                      <input type="text" value={form.seller_sku} onChange={e => setForm({ ...form, seller_sku: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" placeholder="Your unique ID" data-testid="seller-sku-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="category-select">
                        <option value="">Select category</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Fabric Specs */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Fabric Specifications</h3>
                  <div className={`grid ${weaveOptionsForCategory() ? 'grid-cols-4' : 'grid-cols-3'} gap-4 mb-4`}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fabric Type *</label>
                      <select value={form.fabric_type} onChange={e => setForm({ ...form, fabric_type: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="fabric-type-select">
                        {fabricTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
                      <select value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="pattern-select">
                        {patternOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    {weaveOptionsForCategory() && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {weaveFieldLabel()} {isDenim() ? "*" : ""}
                        </label>
                        <select value={form.weave_type} onChange={e => setForm({ ...form, weave_type: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="weave-type-select">
                          {weaveOptionsForCategory().map(w => <option key={w} value={w}>{w || `-- Select ${weaveFieldLabel()} --`}</option>)}
                        </select>
                      </div>
                    )}
                    {showConstructionField() && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Construction <span className="text-xs font-normal text-gray-400">e.g., 40 x 40 / 124 x 64</span>
                        </label>
                        <input type="text" value={form.construction} onChange={e => setForm({ ...form, construction: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                          placeholder="Construction (e.g., 40 x 40 / 124 x 64)"
                          data-testid="construction-input" />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                      <select value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="color-select">
                        {(isDenim() ? denimColorOptions : colorOptions).map(c => <option key={c} value={c}>{c || "-- Select --"}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {!isDenim() && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weight Unit *</label>
                        <select value={form.weight_unit} onChange={e => setForm({ ...form, weight_unit: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="weight-unit-select">
                          <option value="gsm">GSM</option>
                          <option value="ounce">Ounce</option>
                        </select>
                      </div>
                    )}
                    {isDenim() || form.weight_unit === "ounce" ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ounce (oz/yd²) *
                          {isDenim() && <span className="ml-2 text-[11px] font-normal text-amber-700">Denim is always in oz</span>}
                        </label>
                        <select value={form.ounce} onChange={e => setForm({ ...form, ounce: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="ounce-select">
                          <option value="">-- Select --</option>
                          {ounceOptions.map(n => <option key={n} value={n}>{n} oz</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GSM *</label>
                        <select value={form.gsm} onChange={e => setForm({ ...form, gsm: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="gsm-select">
                          <option value="">-- Select --</option>
                          {gsmOptions.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Width (inches)</label>
                      <select value={form.width} onChange={e => setForm({ ...form, width: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="width-select">
                        <option value="">-- Select --</option>
                        {widthOptions.map(n => <option key={n} value={n}>{n}"</option>)}
                      </select>
                    </div>
                    {isKnittedForm() && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Width Type</label>
                        <select value={form.width_type || ""} onChange={e => setForm({ ...form, width_type: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="width-type-select">
                          <option value="">-- Select --</option>
                          <option value="Open Width">Open Width</option>
                          <option value="Circular">Circular</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Composition */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Composition
                      <span className={`ml-2 text-xs ${getCompositionTotal() === 100 ? 'text-emerald-600' : getCompositionTotal() > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        Total: {getCompositionTotal()}%
                      </span>
                    </label>
                    <div className="space-y-2" data-testid="composition-editor">
                      {form.composition.map((comp, idx) => {
                        const stretch = isStretchFibre(comp.material);
                        const opts = stretch ? stretchPercentOptions : percentageOptions;
                        return (
                          <div key={idx} className="flex gap-2">
                            <select value={comp.material} onChange={e => updateComposition(idx, 'material', e.target.value)}
                              className={`flex-1 px-3 py-2 border rounded-lg text-sm bg-white ${stretch ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <option value="">Material {idx + 1}</option>
                              {compositionOptions.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <select value={comp.percentage ?? ''} onChange={e => updateComposition(idx, 'percentage', e.target.value)}
                              className={`w-28 px-2 py-2 border rounded-lg text-sm bg-white font-medium ${stretch ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-gray-200'}`}
                              title={stretch ? 'Stretch fibres use 0.5% steps (0.5 – 20%)' : undefined}>
                              <option value="">%</option>
                              {opts.map(n => <option key={n} value={n}>{n}%</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Count Fields — hidden for knitted fabrics (not applicable) */}
                  {isKnittedForm() ? null : (!isPolyester() ? (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Warp Count</label>
                        <div className="flex gap-2">
                          <select value={form.warp_ply} onChange={e => setForm({ ...form, warp_ply: e.target.value })} className="w-20 px-2 py-2.5 border border-gray-200 rounded-lg bg-white text-sm">
                            {plyOptions.map(n => <option key={n} value={n}>{n} ply</option>)}
                          </select>
                          <span className="flex items-center text-gray-400">/</span>
                          <select value={form.warp_count} onChange={e => setForm({ ...form, warp_count: e.target.value })} className="flex-1 px-2 py-2.5 border border-gray-200 rounded-lg bg-white text-sm" data-testid="warp-count-select">
                            <option value="">-- Count --</option>
                            {yarnCountOptions.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weft Count</label>
                        <div className="flex gap-2">
                          <select value={form.weft_ply} onChange={e => setForm({ ...form, weft_ply: e.target.value })} className="w-20 px-2 py-2.5 border border-gray-200 rounded-lg bg-white text-sm">
                            {plyOptions.map(n => <option key={n} value={n}>{n} ply</option>)}
                          </select>
                          <span className="flex items-center text-gray-400">/</span>
                          <select value={form.weft_count} onChange={e => setForm({ ...form, weft_count: e.target.value })} className="flex-1 px-2 py-2.5 border border-gray-200 rounded-lg bg-white text-sm" data-testid="weft-count-select">
                            <option value="">-- Count --</option>
                            {yarnCountOptions.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Denier *</label>
                        <select value={form.denier} onChange={e => setForm({ ...form, denier: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="denier-select">
                          <option value="">-- Select --</option>
                          {denierOptions.map(n => <option key={n} value={n}>{n}D</option>)}
                        </select>
                      </div>
                    </div>
                  ))}

                  {/* Shrinkage, Stretch, Finish */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Weft Shrinkage %</label>
                      <select value={form.weft_shrinkage} onChange={e => setForm({ ...form, weft_shrinkage: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="shrinkage-select">
                        <option value="">-- Select --</option>
                        {percentageOptions.map(n => <option key={n} value={n}>{n}%</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stretch %</label>
                      <select value={form.stretch_percentage} onChange={e => setForm({ ...form, stretch_percentage: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="stretch-select">
                        <option value="">-- Select --</option>
                        {percentageOptions.map(n => <option key={n} value={n}>{n}%</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Finish</label>
                      <select value={form.finish} onChange={e => setForm({ ...form, finish: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="finish-select">
                        {finishOptions.map(f => <option key={f} value={f}>{f || "-- Select --"}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2b: Multi-Color Variants */}
                <div className="border-t border-gray-100 pt-6">
                  <div className="p-4 bg-violet-50 border border-violet-100 rounded" data-testid="color-variants-section">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-violet-800">Color Variants</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!form.has_multiple_colors}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            let variants = form.color_variants || [];
                            if (checked && variants.length === 0 && form.color) {
                              variants = [{
                                color_name: form.color, color_hex: "#000000", image_url: "",
                                quantity_available: form.quantity_available ? parseInt(form.quantity_available) : null,
                                sample_available: !!form.is_bookable,
                              }];
                            }
                            setForm({ ...form, has_multiple_colors: checked, color_variants: variants });
                          }}
                          className="rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                          data-testid="has-multiple-colors-checkbox"
                        />
                        <span className="text-sm text-violet-700 font-medium">This SKU has multiple colors</span>
                      </label>
                    </div>
                    {form.has_multiple_colors && (
                      <div className="space-y-3">
                        {(form.color_variants || []).map((cv, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-lg border border-violet-200 space-y-3" data-testid={`color-variant-${idx}`}>
                            <div className="flex items-center gap-3">
                              <input
                                type="color"
                                value={cv.color_hex || "#000000"}
                                onChange={(e) => {
                                  const updated = [...form.color_variants];
                                  updated[idx] = { ...cv, color_hex: e.target.value };
                                  setForm({ ...form, color_variants: updated });
                                }}
                                className="w-8 h-8 rounded cursor-pointer border-0"
                                title="Pick color"
                              />
                              {isDenim() ? (
                                <select
                                  value={cv.color_name || ""}
                                  onChange={(e) => {
                                    const updated = [...form.color_variants];
                                    updated[idx] = { ...cv, color_name: e.target.value };
                                    setForm({ ...form, color_variants: updated });
                                  }}
                                  className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm font-medium bg-white"
                                  data-testid={`cv-name-${idx}`}
                                >
                                  {denimColorOptions.map((c) => (
                                    <option key={c} value={c}>{c || "-- Select Color --"}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={cv.color_name || ""}
                                  onChange={(e) => {
                                    const updated = [...form.color_variants];
                                    updated[idx] = { ...cv, color_name: e.target.value };
                                    setForm({ ...form, color_variants: updated });
                                  }}
                                  placeholder="Color name (e.g., Khaki)"
                                  className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm font-medium"
                                  data-testid={`cv-name-${idx}`}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, color_variants: form.color_variants.filter((_, i) => i !== idx) })}
                                className="p-1.5 text-red-400 hover:text-red-600"
                                aria-label={`Remove ${cv.color_name || 'variant'}`}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Photo</label>
                                {cv.image_url ? (
                                  <div className="relative w-full h-20 rounded border overflow-hidden group">
                                    <img src={cv.image_url} alt={cv.color_name} className="w-full h-full object-cover" />
                                    <button type="button" onClick={() => { const updated = [...form.color_variants]; updated[idx] = { ...cv, image_url: "" }; setForm({ ...form, color_variants: updated }); }} className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-violet-200 rounded cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors">
                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const res = await uploadToCloudinary(file, "fabrics");
                                        const updated = [...form.color_variants];
                                        updated[idx] = { ...cv, image_url: res.data.url };
                                        setForm({ ...form, color_variants: updated });
                                        toast.success(`${cv.color_name || 'Color'} image uploaded`);
                                      } catch { toast.error("Upload failed"); }
                                    }} />
                                    <Upload size={16} className="text-violet-400" />
                                  </label>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Inventory ({unit})</label>
                                <input
                                  type="number"
                                  value={cv.quantity_available ?? ""}
                                  onChange={(e) => {
                                    const updated = [...form.color_variants];
                                    updated[idx] = { ...cv, quantity_available: e.target.value ? parseInt(e.target.value) : null };
                                    setForm({ ...form, color_variants: updated });
                                  }}
                                  placeholder="Stock"
                                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
                                  data-testid={`cv-stock-${idx}`}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Sample</label>
                                <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!cv.sample_available}
                                    onChange={(e) => {
                                      const updated = [...form.color_variants];
                                      updated[idx] = { ...cv, sample_available: e.target.checked };
                                      setForm({ ...form, color_variants: updated });
                                    }}
                                    className="rounded"
                                    data-testid={`cv-sample-${idx}`}
                                  />
                                  <span className="text-xs text-gray-600">Available</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, color_variants: [...(form.color_variants || []), { color_name: "", color_hex: "#000000", image_url: "", quantity_available: null, sample_available: false }] })}
                          className="w-full py-2 border-2 border-dashed border-violet-300 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 flex items-center justify-center gap-1"
                          data-testid="add-color-variant-btn"
                        >
                          <Plus size={14} /> Add Color Variant
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Images & Videos */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Images & Videos</h3>
                  <div className="space-y-4">
                    {/* Images */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Product Images</label>
                      <div className="flex flex-wrap gap-3 mb-3">
                        {form.images.map((url, idx) => (
                          <div key={idx} className="relative w-20 h-20">
                            <img src={url} alt="" className="w-full h-full object-cover rounded-lg border" />
                            <button type="button" onClick={() => setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"><X size={12} /></button>
                          </div>
                        ))}
                        <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500">
                          <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
                          {uploading ? <Loader2 size={20} className="animate-spin text-emerald-600" /> : <Upload size={20} className="text-gray-400" />}
                        </label>
                      </div>
                    </div>
                    {/* Videos */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Videos</label>
                      <div className="flex flex-wrap gap-3 mb-3">
                        {form.videos.map((url, idx) => (
                          <div key={idx} className="relative flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border text-sm">
                            <Video size={16} className="text-gray-500" />
                            <span className="max-w-[150px] truncate">{url.split('/').pop()}</span>
                            <button type="button" onClick={() => setForm(prev => ({ ...prev, videos: prev.videos.filter((_, i) => i !== idx) }))}
                              className="text-red-500 hover:text-red-700"><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                        <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" disabled={uploadingVideo} />
                        {uploadingVideo ? <><Loader2 size={16} className="animate-spin" /> Uploading {videoUploadProgress}%</> : <><Video size={16} /> Upload Video</>}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Section 4: Inventory & Pricing */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Inventory & Pricing</h3>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stock ({unitLabel})</label>
                      <input type="number" value={form.quantity_available} onChange={e => setForm({ ...form, quantity_available: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" placeholder="1000" data-testid="stock-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sales Price (₹/{unit})<span className="text-red-500">*</span></label>
                      <input type="number" step="0.01" value={form.rate_per_meter} onChange={e => setForm({ ...form, rate_per_meter: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" placeholder="150" data-testid="rate-input" />
                      <p className="text-[11px] text-gray-500 mt-1">This is what the customer sees and pays per {unit}. Your payout is shown below.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">MOQ</label>
                      <input type="text" value={form.moq} onChange={e => setForm({ ...form, moq: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" placeholder={`500 ${unitLabel}`} />
                    </div>
                  </div>

                  {/* Live platform commission */}
                  {modalCommission && parseFloat(form.rate_per_meter) > 0 && (
                    <div className="mb-4 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-orange-100 px-4 py-3 flex items-center justify-between gap-4"
                         data-testid="modal-commission-box">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center bg-orange-500 text-white text-xs font-bold rounded-full px-3 py-1 min-w-[44px]">
                          {modalCommission.commission_pct}%
                        </span>
                        <div className="text-[13px] text-orange-900 leading-tight">
                          <div className="font-semibold">Platform commission: {modalCommission.commission_pct}%</div>
                          <div className="text-[11px] text-orange-800 mt-0.5">
                            {modalCommission.rule_applied || "Applies on every sale of this fabric"}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-gray-600 leading-tight">
                        <div className="text-gray-500">Customer pays</div>
                        <div className="text-gray-700 font-medium line-through">₹{parseFloat(form.rate_per_meter).toFixed(2)}/{unit}</div>
                        <div className="text-gray-500 mt-1">You receive</div>
                        <div className="text-emerald-700 font-bold text-base leading-tight">
                          ₹{(parseFloat(form.rate_per_meter) * (1 - modalCommission.commission_pct / 100)).toFixed(2)}/{unit}
                        </div>
                      </div>
                    </div>
                  )}
                  {modalCommission && parseFloat(form.rate_per_meter) > 0 && (
                    <div className="mb-4 -mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const cat = categories.find((c) => c.id === form.category_id);
                          setCommissionHelp({
                            sellerId: editingFabric?.seller_id || "",
                            categoryName: cat?.name || "",
                            pct: modalCommission.commission_pct,
                          });
                        }}
                        className="text-xs text-orange-700 hover:text-orange-900 underline underline-offset-2 flex items-center gap-1"
                        data-testid="modal-commission-help"
                      >
                        <HelpCircle size={12} /> How is this calculated?
                      </button>
                    </div>
                  )}

                  {/* Delivery Days */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sample Delivery (days)</label>
                      <select value={form.sample_delivery_days} onChange={e => setForm({ ...form, sample_delivery_days: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="sample-delivery-select">
                        <option value="">Select</option>
                        {deliveryDaysOptions.map(o => <option key={o} value={o}>{o} days</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bulk Delivery (days)</label>
                      <select value={form.bulk_delivery_days} onChange={e => setForm({ ...form, bulk_delivery_days: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white" data-testid="bulk-delivery-select">
                        <option value="">Select</option>
                        {deliveryDaysOptions.map(o => <option key={o} value={o}>{o} days</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Sample Price */}
                  <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                    <label className="block text-sm font-medium text-blue-800 mb-2">Sample Price (1-5 {unitLabel})</label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">₹</span>
                      <input type="number" step="0.01" value={form.sample_price} onChange={e => setForm({ ...form, sample_price: e.target.value })}
                        className="w-32 px-3 py-2 border border-blue-300 rounded-lg bg-white text-sm" placeholder="200" data-testid="sample-price-input" />
                      <span className="text-gray-500">/{unit}</span>
                    </div>
                  </div>

                  {/* Bulk Pricing Tiers */}
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-emerald-800">Bulk Pricing Tiers</label>
                      <button type="button" onClick={addPricingTier} className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><Plus size={14} /> Add Tier</button>
                    </div>
                    <div className="space-y-2">
                      {form.pricing_tiers.map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <input type="number" value={tier.min_qty} onChange={e => updatePricingTier(i, 'min_qty', e.target.value)} className="w-20 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                          <span className="text-gray-400">to</span>
                          <input type="number" value={tier.max_qty} onChange={e => updatePricingTier(i, 'max_qty', e.target.value)} className="w-20 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                          <span className="text-gray-500">{unit} @</span>
                          <span className="text-gray-500">₹</span>
                          <input type="number" step="0.01" value={tier.price} onChange={e => updatePricingTier(i, 'price', e.target.value)} className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm" placeholder={`₹/${unit}`} />
                          <button type="button" onClick={() => removePricingTier(i)} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section 5: Availability & Booking */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Availability</h3>
                  <div className="flex flex-wrap gap-3 mb-4" data-testid="availability-options">
                    {availabilityOptions.map(opt => (
                      <button key={opt.value} type="button" onClick={() => toggleAvailability(opt.value)}
                        className={`px-4 py-2 rounded-lg border text-sm flex items-center gap-2 transition-all ${form.availability.includes(opt.value) ? opt.color : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                        {form.availability.includes(opt.value) && <Check size={14} />}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="is_bookable" checked={form.is_bookable} onChange={e => setForm({ ...form, is_bookable: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded" data-testid="bookable-checkbox" />
                    <label htmlFor="is_bookable" className="text-sm font-medium text-gray-700">Enable direct booking for this fabric</label>
                  </div>
                </div>

                {/* Section: Stock Type & Dispatch Timeline */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Stock Type &amp; Dispatch</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4" data-testid="vendor-stock-type">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "ready_stock", dispatch_timeline: "" })}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        form.stock_type === "ready_stock"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                      data-testid="vendor-stock-type-ready"
                    >
                      {form.stock_type === "ready_stock" && <Check size={16} />}
                      Ready Stock (Inventory)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "made_to_order", dispatch_timeline: "" })}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        form.stock_type === "made_to_order"
                          ? "bg-amber-50 text-amber-700 border-amber-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                      data-testid="vendor-stock-type-mto"
                    >
                      {form.stock_type === "made_to_order" && <Check size={16} />}
                      Made to Order
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dispatch Timeline (Bulk &amp; Sample) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.dispatch_timeline}
                      onChange={(e) => setForm({ ...form, dispatch_timeline: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:border-emerald-500 focus:outline-none"
                      data-testid="vendor-dispatch-select"
                    >
                      <option value="">Select dispatch time…</option>
                      {getDispatchOptions(form.stock_type).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {form.stock_type === "made_to_order"
                        ? "Production lead time. Same timeline applies to bulk & sample dispatch."
                        : "Ready-stock dispatch. Same timeline applies to bulk & sample dispatch."}
                    </p>
                  </div>
                </div>

                {/* Section 6: Description & Tags */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Description & Tags</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg h-20 resize-none" placeholder="Describe your fabric..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                      <input type="text" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg" placeholder="denim, stretch, premium" />
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50" data-testid="submit-fabric-btn">
                    {submitting ? "Saving..." : editingFabric ? "Update Fabric" : "Submit for Approval"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      <CommissionHelpModal
        open={!!commissionHelp}
        onClose={() => setCommissionHelp(null)}
        sellerId={commissionHelp?.sellerId}
        categoryName={commissionHelp?.categoryName}
        appliedPct={commissionHelp?.pct}
      />
    </VendorLayout>
  );
};

const VendorInventoryWithBoundary = () => (
  <ErrorBoundary fallbackTitle="Inventory page hit an unexpected error">
    <VendorInventoryInner />
  </ErrorBoundary>
);

export default VendorInventoryWithBoundary;
