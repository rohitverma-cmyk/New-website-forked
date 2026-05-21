import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Upload, Check, Video, Package, DollarSign, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getFabrics, getCategories, getSellers, getArticles, createFabric, updateFabric, deleteFabric, uploadToCloudinary, uploadVideoToCloudinary, approveFabric, rejectFabric } from "../../lib/api";
import useCompositionOptions from "../../hooks/useCompositionOptions";
import { getDispatchOptions } from "../../lib/dispatchOptions";
import { CERTIFICATIONS } from "../../lib/certifications";
import { useConfirm, useInputDialog } from "../../components/useConfirm";

const AdminFabrics = () => {
  const confirm = useConfirm();
  const promptInput = useInputDialog();

  const compositionOptions = useCompositionOptions();
  const [fabrics, setFabrics] = useState([]);
  const [filteredFabrics, setFilteredFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFabric, setEditingFabric] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("");
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSeller, setFilterSeller] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Unit helper: Knitted fabrics (by fabric_type) use kg, EXCEPT Denim knits stay in meters
  const isKnittedForm = () => (form?.fabric_type || "").toLowerCase() === "knitted";
  const isKnittedFabric = (fabric) => (fabric?.fabric_type || "").toLowerCase() === "knitted";
  const isDenimFabric = (fabric) => fabric?.category_id === "cat-denim";
  const shouldUseKgUnit = () => isKnittedForm() && !isDenim();
  const shouldUseKgForFabric = (fabric) => isKnittedFabric(fabric) && !isDenimFabric(fabric);
  const getFormUnit = () => shouldUseKgUnit() ? "kg" : "m";
  const getFormUnitLabel = () => shouldUseKgUnit() ? "kilograms" : "meters";
  const getFabricUnit = (fabric) => shouldUseKgForFabric(fabric) ? "kg" : "m";

  const emptyComposition = [
    { material: "", percentage: 0 },
    { material: "", percentage: 0 },
    { material: "", percentage: 0 },
  ];

  const emptyForm = {
    name: "",
    category_id: "",
    seller_id: "",
    article_id: "",
    fabric_type: "woven",
    pattern: "Solid",
    weave_type: "",
    construction: "",
    composition: emptyComposition,
    gsm: "",
    ounce: "",
    weight_unit: "gsm",
    width: "",
    width_type: "",
    // Count fields for non-polyester (ply/count format)
    warp_ply: "1",
    warp_count: "",
    weft_ply: "1",
    weft_count: "",
    yarn_count: "",
    // Denier for polyester
    denier: "",
    color: "",
    finish: "",
    moq: "",
    starting_price: "",
    availability: [],
    stock_type: "ready_stock", // ready_stock or made_to_order
    description: "",
    tags: "",
    images: [],
    videos: [],
    // Inventory fields
    quantity_available: "",
    rate_per_meter: "",
    dispatch_timeline: "",
    sample_delivery_days: "", // New: 1-3, 3-5, 5-7, etc.
    bulk_delivery_days: "",   // New: 1-3, 3-5, 5-7, etc.
    is_bookable: false,
    // Pricing fields
    sample_price: "",
    pricing_tiers: [
      { min_qty: 0, max_qty: 100, price: "" },
      { min_qty: 101, max_qty: 500, price: "" },
      { min_qty: 501, max_qty: 1000, price: "" },
      { min_qty: 1001, max_qty: 2500, price: "" },
      { min_qty: 2501, max_qty: 5000, price: "" },
      { min_qty: 5001, max_qty: 10000, price: "" },
    ],
    // Denim fields
    weft_shrinkage: "",
    stretch_percentage: "",
    // Seller SKU
    seller_sku: "",
    hsn_code: "",
    // Multi-color
    has_multiple_colors: false,
    color_variants: [],
    // Certifications (array of keys from CERTIFICATIONS lib/certifications.js)
    certifications: [],
  };

  const [form, setForm] = useState(emptyForm);

  const fabricTypes = ["woven", "knitted", "non-woven"];
  const patternOptions = ["Solid", "Print", "Stripes", "Checks", "Floral", "Geometric", "Digital", "Random", "Greige", "Others"];
  const finishOptions = ["", "Bio", "Double Bio", "Silicon", "Double Silicon", "Enzyme Wash", "Sulphur Wash", "Acid Wash", "Normal Wash", "Stone Wash"];

  // ===== Category-specific dropdown values =====
  const DENIM_CATEGORY_ID = "cat-denim";
  const COTTON_CATEGORY_ID = "cat-cotton";
  const POLYESTER_CATEGORY_ID = "cat-polyester";
  const isDenim = () => form.category_id === DENIM_CATEGORY_ID;
  const isCotton = () => form.category_id === COTTON_CATEGORY_ID;
  const isPolyesterCategory = () => form.category_id === POLYESTER_CATEGORY_ID;
  const isViscose = () => {
    const cat = categories.find((c) => c.id === form.category_id);
    return (cat?.name || "").toLowerCase() === "viscose";
  };
  const showConstructionField = () => isCotton() || isViscose();
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
  const isKnittedType = () => (form.fabric_type || "").toLowerCase() === "knitted";
  const weaveOptionsForCategory = () => {
    if (isKnittedType()) return knitTypeOptions;  // fabric_type wins over category
    if (isDenim()) return denimWeaveOptions;
    if (isPolyesterCategory()) return polyesterWovenWeaveOptions;
    if (isViscose()) return viscoseWeaveOptions;
    if (isCotton()) return cottonWeaveOptions;
    return null; // no weave control for other categories
  };
  const weaveFieldLabel = () => (isKnittedType() ? "Knit Type" : "Weave Type");

  // Denim fabrics are always spec'd in ounces — auto-force weight_unit = "ounce"
  // and clear any stale GSM value. Kicks in whenever the category flips to Denim.
  useEffect(() => {
    if (isDenim() && form.weight_unit !== "ounce") {
      setForm((prev) => ({ ...prev, weight_unit: "ounce", gsm: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_id]);

  // Auto-generate a denim fabric name in the format:
  //   "M1 M2 M3, Weave type, Weight, Color: Color name"
  // Pulls top 3 materials (in composition order, not %), weave_type, weight, and color.
  const buildDenimName = () => {
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
  
  // Standard fabric/dye colors
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

  // Dropdown options
  const plyOptions = [1, 2]; // Ply can be 1 or 2
  const yarnCountOptions = Array.from({ length: 100 }, (_, i) => i + 1); // 1-100 for yarn count
  const denierOptions = Array.from({ length: 200 }, (_, i) => i + 1); // 1-200 for denier
  const ounceOptions = Array.from({ length: 77 }, (_, i) => (1 + i * 0.25).toFixed(2)).map(v => parseFloat(v)); // 1-20 in 0.25 increments
  const percentageOptions = Array.from({ length: 100 }, (_, i) => i + 1); // 1-100
  const gsmOptions = Array.from({ length: 500 }, (_, i) => i + 1); // 1-500 for GSM (fabrics can be 200-400+ GSM)
  const widthOptions = Array.from({ length: 100 }, (_, i) => i + 1); // 1-100 for width in inches

  const availabilityOptions = [
    { value: "Sample", label: "Sample Available", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { value: "Bulk", label: "Bulk Available", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { value: "On Request", label: "On Request", color: "bg-amber-50 text-amber-700 border-amber-200" },
  ];

  // Delivery days options: 1-3, 3-5, 5-7, ... up to 49-51
  const deliveryDaysOptions = [
    "1-3", "3-5", "5-7", "7-9", "9-11", "11-13", "13-15", "15-17", "17-19", "19-21",
    "21-23", "23-25", "25-27", "27-29", "29-31", "31-33", "33-35", "35-37", "37-39", "39-41",
    "41-43", "43-45", "45-47", "47-49", "49-51"
  ];

  // Check if composition contains polyester
  const isPolyester = () => {
    return form.composition.some(comp => 
      comp.material && comp.material.toLowerCase().includes('polyester')
    );
  };

  const toggleAvailability = (value) => {
    if (form.availability.includes(value)) {
      setForm({ ...form, availability: form.availability.filter(v => v !== value) });
    } else {
      setForm({ ...form, availability: [...form.availability, value] });
    }
  };

  const updatePricingTier = (index, field, value) => {
    const newTiers = [...form.pricing_tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setForm({ ...form, pricing_tiers: newTiers });
  };

  const addPricingTier = () => {
    const lastTier = form.pricing_tiers[form.pricing_tiers.length - 1];
    const newMinQty = lastTier ? (parseInt(lastTier.max_qty) || 0) + 1 : 0;
    setForm({
      ...form,
      pricing_tiers: [...form.pricing_tiers, { min_qty: newMinQty, max_qty: newMinQty + 999, price: "" }]
    });
  };

  const removePricingTier = (index) => {
    if (form.pricing_tiers.length > 1) {
      setForm({
        ...form,
        pricing_tiers: form.pricing_tiers.filter((_, i) => i !== index)
      });
    }
  };

  // Materials that share the stretch-fibre class and use the 0.5→20% dropdown
  const STRETCH_FIBRES = ['spandex', 'elastane', 'lycra', 'stretch'];
  const isStretchFibre = (material) =>
    STRETCH_FIBRES.some((f) => (material || '').toLowerCase().includes(f));

  // 0.5, 1, 1.5, … 20  (40 steps)
  const stretchPercentOptions = Array.from({ length: 40 }, (_, i) => (i + 1) * 0.5);

  const updateComposition = (index, field, value) => {
    const newComp = [...form.composition];
    let next;
    if (field === 'percentage') {
      const n = parseFloat(value);
      next = Number.isFinite(n) ? n : 0;
    } else {
      next = value;
      // If the row was a stretch fibre with a 0.5-step value that now isn't allowed
      // under the regular dropdown, snap it to the nearest integer so the control
      // still reflects a selectable value.
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

  const getCompositionTotal = () => {
    const n = form.composition.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
    // Avoid floating-point UI noise like 99.99999999 when 2 + 2 + 96 is entered
    return Math.round(n * 10) / 10;
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter fabrics when search or filters change
  useEffect(() => {
    let result = [...fabrics];
    
    // Text search - search in name, composition, tags, seller company, category
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(fabric => {
        const nameMatch = fabric.name?.toLowerCase().includes(query);
        const compositionMatch = Array.isArray(fabric.composition) 
          ? fabric.composition.some(c => c.material?.toLowerCase().includes(query))
          : fabric.composition?.toLowerCase().includes(query);
        const tagsMatch = Array.isArray(fabric.tags) && fabric.tags.some(t => t.toLowerCase().includes(query));
        const sellerMatch = fabric.seller_company?.toLowerCase().includes(query);
        const categoryMatch = fabric.category_name?.toLowerCase().includes(query);
        const colorMatch = fabric.color?.toLowerCase().includes(query);
        const skuMatch = fabric.seller_sku?.toLowerCase().includes(query);
        const codeMatch = fabric.fabric_code?.toLowerCase().includes(query);
        
        return nameMatch || compositionMatch || tagsMatch || sellerMatch || categoryMatch || colorMatch || skuMatch || codeMatch;
      });
    }
    
    // Category filter
    if (filterCategory) {
      result = result.filter(fabric => fabric.category_id === filterCategory);
    }
    
    // Seller filter
    if (filterSeller) {
      result = result.filter(fabric => fabric.seller_id === filterSeller);
    }
    
    // Availability filter
    if (filterAvailability) {
      result = result.filter(fabric => 
        Array.isArray(fabric.availability) && fabric.availability.includes(filterAvailability)
      );
    }
    
    // Status filter (for approval workflow)
    if (filterStatus) {
      // "draft" is our UI label for fabrics that were never submitted for
      // approval — backend stores them as null/empty/missing status.
      if (filterStatus === "draft") {
        result = result.filter(fabric => !fabric.status);
      } else {
        result = result.filter(fabric => fabric.status === filterStatus);
      }
    }
    
    setFilteredFabrics(result);
  }, [fabrics, searchQuery, filterCategory, filterSeller, filterAvailability, filterStatus]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterCategory("");
    setFilterSeller("");
    setFilterAvailability("");
    setFilterStatus("");
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fabRes, catRes, selRes, artRes] = await Promise.all([
        getFabrics({ limit: 1000, include_pending: true }), // Load all fabrics for admin
        getCategories(), 
        getSellers(true), 
        getArticles()
      ]);
      setFabrics(fabRes.data);
      setCategories(catRes.data);
      setSellers(selRes.data);
      setArticles(artRes.data);
    } catch (err) {
      toast.error("Failed to load data");
    }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map((file) => uploadToCloudinary(file, "fabrics"));
      const results = await Promise.all(uploadPromises);
      const urls = results.map((res) => res.data.url);
      setForm({ ...form, images: [...form.images, ...urls] });
      toast.success("Images uploaded to cloud storage");
    } catch (err) {
      console.error("Image upload error:", err);
      if (err.response?.status === 401 || err.message?.includes('401')) {
        toast.error("Session expired. Please log in again.");
        localStorage.removeItem("locofast_token");
        localStorage.removeItem("locofast_admin");
        window.location.href = "/admin/login";
      } else {
        toast.error(err.message || "Failed to upload images");
      }
    }
    setUploading(false);
  };

  const removeImage = (index) => {
    setForm({ ...form, images: form.images.filter((_, i) => i !== index) });
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (150MB max)
    const maxSize = 150 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Video file too large. Maximum size is 150MB");
      return;
    }

    // Check file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid video format. Allowed: MP4, WebM, MOV, AVI, MPEG");
      return;
    }

    setUploadingVideo(true);
    setVideoUploadProgress(0);
    
    try {
      const result = await uploadVideoToCloudinary(file, "fabrics", (progress) => {
        setVideoUploadProgress(progress);
      });
      setForm({ ...form, videos: [result.data.url] });
      toast.success("Video uploaded to cloud storage!");
    } catch (err) {
      console.error("Video upload error:", err);
      if (err.response?.status === 401) {
        toast.error("Session expired. Please log in again.");
        window.location.href = "/admin/login";
      } else {
        toast.error(err.message || "Failed to upload video");
      }
    }
    setUploadingVideo(false);
    setVideoUploadProgress(0);
  };

  const addVideoUrl = async () => {
    const url = await promptInput({ title: "Add video", placeholder: "YouTube, Vimeo, or direct link", confirmLabel: "Add" });
    if (url && url.trim()) {
      setForm({ ...form, videos: [url.trim()] });
    }
  };

  const removeVideo = (index) => {
    setForm({ ...form, videos: form.videos.filter((_, i) => i !== index) });
  };

  const openCreateModal = () => {
    setEditingFabric(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || "", composition: [...emptyComposition] });
    setSelectedCategory(categories[0]?.id || "");
    setShowModal(true);
  };

  const openEditModal = (fabric) => {
    setEditingFabric(fabric);
    setSelectedCategory(fabric.category_id || "");
    
    // Parse composition - could be string (legacy) or array (new)
    let compositionData = [...emptyComposition];
    if (Array.isArray(fabric.composition) && fabric.composition.length > 0) {
      compositionData = [
        fabric.composition[0] || { material: "", percentage: 0 },
        fabric.composition[1] || { material: "", percentage: 0 },
        fabric.composition[2] || { material: "", percentage: 0 },
      ];
    } else if (typeof fabric.composition === 'string' && fabric.composition) {
      // Legacy string format - try to parse "100% Cotton" or "65% Poly, 35% Cotton"
      compositionData = [{ material: fabric.composition, percentage: 100 }, { material: "", percentage: 0 }, { material: "", percentage: 0 }];
    }
    
    setForm({
      ...fabric,
      seller_id: fabric.seller_id || "",
      article_id: fabric.article_id || "",
      pattern: fabric.pattern || "Solid",
      weave_type: fabric.weave_type || "",
      construction: fabric.construction || "",
      composition: compositionData,
      gsm: fabric.gsm ? fabric.gsm.toString() : "",
      ounce: fabric.ounce || "",
      weight_unit: fabric.weight_unit || "gsm",
      starting_price: fabric.starting_price || "",
      // Parse warp_count from ply/count format (e.g., "2/40" -> ply=2, count=40)
      warp_ply: fabric.warp_count?.includes('/') ? fabric.warp_count.split('/')[0] : "1",
      warp_count: fabric.warp_count?.includes('/') ? fabric.warp_count.split('/')[1] : (fabric.warp_count || ""),
      weft_ply: fabric.weft_count?.includes('/') ? fabric.weft_count.split('/')[0] : "1",
      weft_count: fabric.weft_count?.includes('/') ? fabric.weft_count.split('/')[1] : (fabric.weft_count || ""),
      yarn_count: fabric.yarn_count || "",
      denier: fabric.denier ? fabric.denier.toString() : "",
      color: fabric.color || "",
      finish: fabric.finish || "",
      availability: Array.isArray(fabric.availability) ? fabric.availability : [],
      stock_type: fabric.stock_type || "ready_stock",
      tags: Array.isArray(fabric.tags) ? fabric.tags.join(", ") : "",
      videos: Array.isArray(fabric.videos) ? fabric.videos : [],
      // Inventory fields
      quantity_available: fabric.quantity_available ? fabric.quantity_available.toString() : "",
      rate_per_meter: fabric.rate_per_meter ? fabric.rate_per_meter.toString() : "",
      dispatch_timeline: fabric.dispatch_timeline || "",
      sample_delivery_days: fabric.sample_delivery_days || "",
      bulk_delivery_days: fabric.bulk_delivery_days || "",
      is_bookable: fabric.is_bookable || false,
      certifications: Array.isArray(fabric.certifications) ? fabric.certifications : [],
      // Pricing fields
      sample_price: fabric.sample_price ? fabric.sample_price.toString() : "",
      pricing_tiers: fabric.pricing_tiers && fabric.pricing_tiers.length > 0 
        ? fabric.pricing_tiers.map(t => ({
            min_qty: t.min_qty || 0,
            max_qty: t.max_qty || 0,
            price: t.price_per_meter ? t.price_per_meter.toString() : ""
          }))
        : [
            { min_qty: 0, max_qty: 100, price: "" },
            { min_qty: 101, max_qty: 500, price: "" },
            { min_qty: 501, max_qty: 1000, price: "" },
            { min_qty: 1001, max_qty: 2500, price: "" },
            { min_qty: 2501, max_qty: 5000, price: "" },
            { min_qty: 5001, max_qty: 10000, price: "" },
          ],
      // Denim fields
      weft_shrinkage: fabric.weft_shrinkage ? fabric.weft_shrinkage.toString() : "",
      stretch_percentage: fabric.stretch_percentage ? fabric.stretch_percentage.toString() : "",
      seller_sku: fabric.seller_sku || "",
      hsn_code: fabric.hsn_code || "",
      has_multiple_colors: fabric.has_multiple_colors || false,
      color_variants: fabric.color_variants || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate composition total
    const compositionTotal = getCompositionTotal();
    const hasComposition = form.composition.some(c => c.material && c.percentage > 0);
    if (hasComposition && compositionTotal !== 100) {
      toast.error(`Composition percentages must total 100% (currently ${compositionTotal}%)`);
      return;
    }
    
    if (!form.name || !form.category_id) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Supplier (seller) is mandatory. We can't ingest a fabric without
    // attribution — orders/credit/dispatch all branch on seller_id, and
    // unattributed inventory pollutes the catalog.
    if (!form.seller_id) {
      toast.error("Please select a Supplier — fabrics cannot be saved without one");
      return;
    }

    if (!form.dispatch_timeline) {
      toast.error("Please select a Dispatch Timeline");
      return;
    }

    // Validate weight - either GSM or Ounce required based on weight_unit
    if (form.weight_unit === "gsm" && !form.gsm) {
      toast.error("Please enter GSM value");
      return;
    }
    if (form.weight_unit === "ounce" && !form.ounce) {
      toast.error("Please enter Ounce value");
      return;
    }

    // Filter out empty composition entries
    const cleanComposition = form.composition.filter(c => c.material && c.percentage > 0);
    
    // Check if polyester composition
    const hasPolyester = cleanComposition.some(comp => 
      comp.material && comp.material.toLowerCase().includes('polyester')
    );

    // Validate count fields (skip entirely for knitted fabrics — count is not applicable)
    if (!isKnittedForm()) {
      if (hasPolyester) {
        if (!form.denier) {
          toast.error("Please enter Denier value for polyester fabric");
          return;
        }
      } else {
        if (!form.warp_count && !form.weft_count) {
          toast.error("Please enter at least Warp Count or Weft Count");
          return;
        }
      }
    }

    // Build warp_count and weft_count in ply/count format
    const warpCountFormatted = form.warp_count ? `${form.warp_ply}/${form.warp_count}` : "";
    const weftCountFormatted = form.weft_count ? `${form.weft_ply}/${form.weft_count}` : "";

    const payload = {
      ...form,
      gsm: form.gsm ? parseInt(form.gsm) : null,
      warp_count: warpCountFormatted,
      weft_count: weftCountFormatted,
      yarn_count: form.yarn_count,
      denier: hasPolyester && form.denier ? parseInt(form.denier) : null,
      composition: cleanComposition,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      videos: form.videos || [],
      // Inventory fields
      quantity_available: form.quantity_available ? parseInt(form.quantity_available) : null,
      rate_per_meter: form.rate_per_meter ? parseFloat(form.rate_per_meter) : null,
      dispatch_timeline: form.dispatch_timeline,
      sample_delivery_days: form.sample_delivery_days,
      bulk_delivery_days: form.bulk_delivery_days,
      is_bookable: form.is_bookable,
      // Pricing fields
      sample_price: form.sample_price ? parseFloat(form.sample_price) : null,
      pricing_tiers: form.pricing_tiers
        .filter(t => t.price && t.price !== "")
        .map(t => ({
          min_qty: parseInt(t.min_qty) || 0,
          max_qty: parseInt(t.max_qty) || 0,
          price_per_meter: parseFloat(t.price) || 0
        })),
      // Denim fields
      weft_shrinkage: form.weft_shrinkage ? parseFloat(form.weft_shrinkage) : null,
      stretch_percentage: form.stretch_percentage ? parseFloat(form.stretch_percentage) : null,
      seller_sku: form.seller_sku,
      hsn_code: form.hsn_code,
      article_id: form.article_id,
      has_multiple_colors: form.has_multiple_colors,
      color_variants: form.has_multiple_colors ? form.color_variants : [],
      certifications: Array.isArray(form.certifications) ? form.certifications : [],
    };
    
    // Remove frontend-only fields
    delete payload.warp_ply;
    delete payload.weft_ply;

    try {
      if (editingFabric) {
        await updateFabric(editingFabric.id, payload);
        toast.success("Fabric updated");
      } else {
        await createFabric(payload);
        toast.success("Fabric created");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save fabric");
    }
  };

  const handleDelete = async (fabric) => {
    if (!(await confirm({ title: "Confirm action", message: `Delete "${fabric.name}"?`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await deleteFabric(fabric.id);
      toast.success("Fabric deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete fabric");
    }
  };

  const handleApprove = async (fabric) => {
    try {
      await approveFabric(fabric.id);
      toast.success(`"${fabric.name}" is now live`);
      fetchData();
    } catch (err) {
      toast.error("Failed to approve fabric");
    }
  };

  const handleReject = async (fabric) => {
    if (!(await confirm({ title: "Confirm action", message: `Reject "${fabric.name}"? The vendor will be notified.`, tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await rejectFabric(fabric.id);
      toast.success("Fabric rejected");
      fetchData();
    } catch (err) {
      toast.error("Failed to reject fabric");
    }
  };

  const handleAppendWeightToNames = async () => {
    const API = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem("token");
    try {
      // 1. Dry run
      const dryRes = await fetch(`${API}/api/migrate/append-weight-to-names`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const dry = await dryRes.json();
      if (!dryRes.ok) throw new Error(dry.detail || "Dry run failed");

      if (dry.will_update === 0) {
        toast.success("All SKUs already have weight in their name — nothing to update.");
        return;
      }

      const preview = (dry.preview || [])
        .slice(0, 5)
        .map((p) => `• ${p.old_name} → ${p.new_name}`)
        .join("\n");
      const ok = await confirm({ title: "Confirm action", message: `Will append GSM/oz to ${dry.will_update} fabric name${dry.will_update === 1 ? "" : "s"} ` +
          `(out of ${dry.total_scanned} scanned).\n\nPreview:\n${preview}${
            dry.will_update > 5 ? `\n...and ${dry.will_update - 5} more` : ""
          }\n\nProceed?`, tone: "danger", confirmLabel: "Confirm" });
      if (!ok) return;

      // 2. Apply
      const applyRes = await fetch(`${API}/api/migrate/append-weight-to-names?apply=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await applyRes.json();
      if (!applyRes.ok) throw new Error(result.detail || "Apply failed");
      toast.success(`Updated ${result.updated} fabric name${result.updated === 1 ? "" : "s"}.`);
      fetchData();
    } catch (err) {
      toast.error(err.message || "Bulk rename failed");
    }
  };

  return (
    <AdminLayout>
      <div data-testid="admin-fabrics-page">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-semibold">Fabrics</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAppendWeightToNames}
              className="inline-flex items-center gap-2 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-100"
              data-testid="bulk-append-weight-btn"
              title="Appends ', <gsm> GSM' (or ', <oz>oz' for denim) to every SKU name whose weight is set but missing from the name. Idempotent."
            >
              Append Weight to Names
            </button>
            <button onClick={openCreateModal} className="btn-primary inline-flex items-center gap-2" data-testid="add-fabric-btn">
              <Plus size={18} />
              Add Fabric
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white border border-gray-100 rounded-lg p-4 mb-6" data-testid="fabric-search-filters">
          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fabrics by name, composition, color, seller, SKU..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="fabric-search-input"
            />
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-gray-500">
              <Filter size={16} />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
              data-testid="filter-category"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Seller Filter */}
            <select
              value={filterSeller}
              onChange={(e) => setFilterSeller(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
              data-testid="filter-seller"
            >
              <option value="">All Sellers</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>{seller.company_name}</option>
              ))}
            </select>

            {/* Availability Filter */}
            <select
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
              data-testid="filter-availability"
            >
              <option value="">All Availability</option>
              <option value="Sample">Sample Available</option>
              <option value="Bulk">Bulk Available</option>
              <option value="On Request">On Request</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
              data-testid="filter-status"
            >
              <option value="">All Status</option>
              <option value="draft">Draft (not submitted)</option>
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved (Live)</option>
              <option value="rejected">Rejected</option>
            </select>

            {/* Clear Filters Button */}
            {(searchQuery || filterCategory || filterSeller || filterAvailability || filterStatus) && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                data-testid="clear-filters-btn"
              >
                Clear all
              </button>
            )}

            {/* Results Count */}
            <div className="ml-auto text-sm text-gray-500">
              Showing {filteredFabrics.length} of {fabrics.length} fabrics
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white p-4 border border-gray-100 animate-pulse flex gap-4 rounded">
                <div className="w-16 h-16 bg-gray-200 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 w-1/3 rounded" />
                  <div className="h-4 bg-gray-200 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredFabrics.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded">
            {fabrics.length === 0 ? (
              <>
                <p className="text-gray-500 mb-4">No fabrics yet</p>
                <button onClick={openCreateModal} className="btn-primary">Add First Fabric</button>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-4">No fabrics match your search criteria</p>
                <button onClick={clearFilters} className="btn-secondary">Clear Filters</button>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-100 overflow-hidden rounded" data-testid="fabrics-table">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left p-4 font-medium text-sm">Fabric</th>
                  <th className="text-left p-4 font-medium text-sm hidden md:table-cell">Seller</th>
                  <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">Category</th>
                  <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">GSM</th>
                  <th className="text-left p-4 font-medium text-sm">Availability</th>
                  <th className="text-left p-4 font-medium text-sm">Status</th>
                  <th className="text-right p-4 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFabrics.map((fabric) => (
                  <tr key={fabric.id} className="border-b border-gray-100 last:border-0" data-testid={`fabric-row-${fabric.id}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 overflow-hidden flex-shrink-0 rounded">
                          <img
                            src={fabric.images[0] || "https://via.placeholder.com/48"}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-medium">{fabric.name}</p>
                          <p className="text-sm text-gray-500">
                            {Array.isArray(fabric.composition) && fabric.composition.length > 0
                              ? fabric.composition.map(c => `${c.percentage}% ${c.material}`).join(', ')
                              : fabric.composition || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      {/* Show contact name + company together so admins can
                          match a vendor uniquely during bulk uploads /
                          data reconciliation. seller_code is rendered below
                          as the canonical machine identifier. */}
                      {(fabric.seller_company || fabric.seller_name) ? (
                        <div className="leading-tight">
                          {fabric.seller_name && (
                            <div className="text-gray-900 text-sm font-medium">{fabric.seller_name}</div>
                          )}
                          {fabric.seller_company && (
                            <div className="text-gray-600 text-xs">{fabric.seller_company}</div>
                          )}
                          {fabric.seller_code && (
                            <div className="text-[#2563EB] text-xs font-mono mt-0.5">{fabric.seller_code}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">No seller</span>
                      )}
                    </td>
                    <td className="p-4 hidden lg:table-cell text-gray-600">{fabric.category_name}</td>
                    <td className="p-4 hidden lg:table-cell font-mono text-sm">{fabric.gsm}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(fabric.availability) ? fabric.availability : []).map((avail, idx) => (
                          <span key={idx} className={`badge ${
                            avail === "Sample" ? "bg-blue-50 text-blue-700" :
                            avail === "Bulk" ? "bg-emerald-50 text-emerald-700" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {avail}
                          </span>
                        ))}
                        {(!fabric.availability || fabric.availability.length === 0) && (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        fabric.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                        fabric.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        fabric.status === "rejected" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {fabric.status === "approved" ? "Live" :
                         fabric.status === "pending" ? "Pending" :
                         fabric.status === "rejected" ? "Rejected" : "Draft"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {/* Approve/Reject buttons for pending fabrics */}
                      {fabric.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(fabric)}
                            className="p-2 text-emerald-600 hover:text-emerald-800 transition-colors"
                            title="Approve"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => handleReject(fabric)}
                            className="p-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Reject"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEditModal(fabric)}
                        className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                        data-testid={`edit-fabric-${fabric.id}`}
                        aria-label="Edit"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(fabric)}
                        className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                        data-testid={`delete-fabric-${fabric.id}`}
                        aria-label="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="fabric-modal">
            <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingFabric ? "Edit Fabric" : "Add Fabric"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Seller Selection — mandatory */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded">
                  <label className="block text-sm font-medium mb-2 text-[#2563EB]">
                    Seller / Supplier <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={form.seller_id}
                    onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
                    className={`w-full px-4 py-2 border rounded bg-white ${
                      form.seller_id ? "border-gray-200" : "border-red-300"
                    }`}
                    data-testid="fabric-seller-select"
                  >
                    <option value="">— Select a supplier —</option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.company_name} - {seller.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Required. Every fabric must be attributed to a registered supplier.</p>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center justify-between">
                      <span>Name *</span>
                      <button
                        type="button"
                        onClick={() => {
                          const n = buildDenimName();
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
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      required
                      placeholder={isDenim() ? "Cotton Polyester Lycra, 3/1 RHT, 10oz, Color: Indigo x White" : "e.g., Cotton Polyester, 200 GSM, Color: Navy"}
                      data-testid="fabric-name-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Category *</label>
                    <select
                      value={form.category_id}
                      onChange={(e) => {
                        setForm({ ...form, category_id: e.target.value });
                        setSelectedCategory(e.target.value);
                      }}
                      className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                      required
                      data-testid="fabric-category-select"
                    >
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Fabric Type *</label>
                    <select
                      value={form.fabric_type}
                      onChange={(e) => setForm({ ...form, fabric_type: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                      data-testid="fabric-type-select"
                    >
                      {fabricTypes.map((type) => (
                        <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Pattern</label>
                    <select
                      value={form.pattern}
                      onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                      data-testid="fabric-pattern-select"
                    >
                      {patternOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  {weaveOptionsForCategory() && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {weaveFieldLabel()} {isDenim() ? "*" : ""}
                      </label>
                      <select
                        value={form.weave_type}
                        onChange={(e) => setForm({ ...form, weave_type: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                        data-testid="fabric-weave-type-select"
                      >
                        {weaveOptionsForCategory().map((w) => (
                          <option key={w} value={w}>{w || `-- Select ${weaveFieldLabel()} --`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Weight: GSM or Ounce (Denim is always ounce-only) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {!isDenim() && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Weight Unit *</label>
                      <select
                        value={form.weight_unit}
                        onChange={(e) => setForm({ ...form, weight_unit: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                        data-testid="fabric-weight-unit-select"
                      >
                        <option value="gsm">GSM</option>
                        <option value="ounce">Ounce</option>
                      </select>
                    </div>
                  )}
                  {isDenim() || form.weight_unit === "ounce" ? (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Ounce (oz/yd²) *
                        {isDenim() && <span className="ml-2 text-xs font-normal text-amber-700">Denim is always measured in oz</span>}
                      </label>
                      <select
                        value={form.ounce}
                        onChange={(e) => setForm({ ...form, ounce: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                        data-testid="fabric-ounce-select"
                      >
                        <option value="">-- Select Ounce --</option>
                        {ounceOptions.map((n) => (
                          <option key={n} value={n}>{n} oz</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-2">GSM *</label>
                      <select
                        value={form.gsm}
                        onChange={(e) => setForm({ ...form, gsm: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                        data-testid="fabric-gsm-select"
                      >
                        <option value="">-- Select GSM --</option>
                        {gsmOptions.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Construction (Cotton + Viscose only) */}
                {showConstructionField() && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Construction
                      <span className="ml-2 text-xs font-normal text-gray-400">e.g., 40 × 40 / 124 × 64</span>
                    </label>
                    <input
                      type="text"
                      value={form.construction}
                      onChange={(e) => setForm({ ...form, construction: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm"
                      placeholder="Construction (e.g., 40 x 40 / 124 x 64)"
                      data-testid="fabric-construction-input"
                    />
                  </div>
                )}

                {/* Composition Editor */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Composition (up to 3 materials)
                    <span className={`ml-2 text-xs ${getCompositionTotal() === 100 ? 'text-emerald-600' : getCompositionTotal() > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      Total: {getCompositionTotal()}%
                    </span>
                  </label>
                  <div className="space-y-2" data-testid="fabric-composition-editor">
                    {form.composition.map((comp, idx) => {
                      const stretch = isStretchFibre(comp.material);
                      const opts = stretch ? stretchPercentOptions : percentageOptions;
                      const label = (v) => (stretch ? `${v}%` : `${v}%`);
                      return (
                        <div key={idx} className="flex gap-2">
                          <select
                            value={comp.material}
                            onChange={(e) => updateComposition(idx, 'material', e.target.value)}
                            className={`flex-1 px-3 py-2 border rounded text-sm bg-white ${stretch ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                            data-testid={`composition-material-${idx}`}
                          >
                            <option value="">Material {idx + 1}</option>
                            {compositionOptions.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <select
                            value={comp.percentage ?? ''}
                            onChange={(e) => updateComposition(idx, 'percentage', e.target.value)}
                            className={`w-28 px-2 py-2 border rounded text-sm bg-white font-medium ${stretch ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-gray-200'}`}
                            data-testid={`composition-percentage-${idx}`}
                            title={stretch ? 'Stretch fibres use 0.5% steps (0.5 – 20%)' : undefined}
                          >
                            <option value="">%</option>
                            {opts.map((n) => (
                              <option key={n} value={n}>{label(n)}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    E.g., Cotton 78%, Polyester 20%, Spandex 2%. Stretch fibres (<b>Spandex / Elastane / Lycra / Stretch</b>) use 0.5% steps from 0.5% to 20%.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Width (inches)</label>
                    <select
                      value={form.width}
                      onChange={(e) => setForm({ ...form, width: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                      data-testid="fabric-width-select"
                    >
                      <option value="">-- Select Width --</option>
                      {widthOptions.map((n) => (
                        <option key={n} value={n}>{n}"</option>
                      ))}
                    </select>
                  </div>
                  {isKnittedForm() && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Width Type</label>
                      <select
                        value={form.width_type}
                        onChange={(e) => setForm({ ...form, width_type: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                        data-testid="fabric-width-type-select"
                      >
                        <option value="">-- Select --</option>
                        <option value="Open Width">Open Width</option>
                        <option value="Circular">Circular</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Count Fields - Conditional: hidden for knitted fabrics (not applicable) */}
                {isKnittedForm() ? null : (!isPolyester() ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Warp Count (Ply/Count) */}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Warp Count {!form.weft_count && <span className="text-red-500">*</span>}
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={form.warp_ply}
                            onChange={(e) => setForm({ ...form, warp_ply: e.target.value })}
                            className="w-20 px-3 py-2 border border-neutral-200 rounded-sm bg-white"
                            data-testid="fabric-warp-ply"
                          >
                            {plyOptions.map((n) => (
                              <option key={n} value={n}>{n} ply</option>
                            ))}
                          </select>
                          <span className="flex items-center text-gray-400">/</span>
                          <select
                            value={form.warp_count}
                            onChange={(e) => setForm({ ...form, warp_count: e.target.value })}
                            className="flex-1 px-3 py-2 border border-neutral-200 rounded-sm bg-white"
                            data-testid="fabric-warp-count"
                          >
                            <option value="">-- Count --</option>
                            {yarnCountOptions.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Weft Count (Ply/Count) */}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Weft Count {!form.warp_count && <span className="text-red-500">*</span>}
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={form.weft_ply}
                            onChange={(e) => setForm({ ...form, weft_ply: e.target.value })}
                            className="w-20 px-3 py-2 border border-neutral-200 rounded-sm bg-white"
                            data-testid="fabric-weft-ply"
                          >
                            {plyOptions.map((n) => (
                              <option key={n} value={n}>{n} ply</option>
                            ))}
                          </select>
                          <span className="flex items-center text-gray-400">/</span>
                          <select
                            value={form.weft_count}
                            onChange={(e) => setForm({ ...form, weft_count: e.target.value })}
                            className="flex-1 px-3 py-2 border border-neutral-200 rounded-sm bg-white"
                            data-testid="fabric-weft-count"
                          >
                            <option value="">-- Count --</option>
                            {yarnCountOptions.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 -mt-3">
                      Format: Ply/Count (e.g., 2/40 means 2-ply, 40 count). At least one of Warp or Weft count is required.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Denier <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={form.denier}
                          onChange={(e) => setForm({ ...form, denier: e.target.value })}
                          className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                          data-testid="fabric-denier"
                        >
                          <option value="">-- Select Denier --</option>
                          {denierOptions.map((n) => (
                            <option key={n} value={n}>{n}D</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Denier value for polyester fabrics (1-200)</p>
                      </div>
                    </div>
                  </>
                ))}

                {/* Shrinkage & Stretch Fields - Available for all fabrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Weft Shrinkage (%)</label>
                    <select
                      value={form.weft_shrinkage}
                      onChange={(e) => setForm({ ...form, weft_shrinkage: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                      data-testid="fabric-weft-shrinkage-select"
                    >
                      <option value="">-- Select --</option>
                      {percentageOptions.map((n) => (
                        <option key={n} value={n}>{n}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Stretch (%)</label>
                    <select
                      value={form.stretch_percentage}
                      onChange={(e) => setForm({ ...form, stretch_percentage: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                      data-testid="fabric-stretch-select"
                    >
                      <option value="">-- Select --</option>
                      {percentageOptions.map((n) => (
                        <option key={n} value={n}>{n}%</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Color</label>
                    <select
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                      data-testid="fabric-color-select"
                    >
                      {(isDenim() ? denimColorOptions : colorOptions).map((c) => (
                        <option key={c} value={c}>{c || "-- Select Color --"}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Finish</label>
                    <select
                      value={form.finish}
                      onChange={(e) => setForm({ ...form, finish: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-sm bg-white"
                      data-testid="fabric-finish-select"
                    >
                      {finishOptions.map((f) => (
                        <option key={f} value={f}>{f || "-- Select Finish --"}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Multi-Color Variants */}
                <div className="p-4 bg-violet-50 border border-violet-100 rounded" data-testid="color-variants-section">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-violet-800">Color Variants</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.has_multiple_colors}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          let variants = form.color_variants;
                          // Auto-add base color as first variant if enabling and no variants yet
                          if (checked && variants.length === 0 && form.color) {
                            variants = [{ color_name: form.color, color_hex: "#000000", image_url: "", quantity_available: form.quantity_available ? parseInt(form.quantity_available) : null, sample_available: form.is_bookable_sample || false }];
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
                      {form.color_variants.map((cv, idx) => (
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
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {/* Image upload */}
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
                            {/* Inventory */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Inventory (m)</label>
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
                            {/* Sample available */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Sample</label>
                              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={cv.sample_available || false}
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
                        onClick={() => setForm({ ...form, color_variants: [...form.color_variants, { color_name: "", color_hex: "#000000", image_url: "", quantity_available: null, sample_available: false }] })}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-violet-700 border border-violet-300 rounded hover:bg-violet-100 transition-colors"
                        data-testid="add-color-variant-btn"
                      >
                        <Plus size={14} />Add Color Variant
                      </button>
                    </div>
                  )}
                  {!form.has_multiple_colors && <p className="text-xs text-violet-500">Enable to add separate colors with individual photos, inventory, and sample availability.</p>}
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">MOQ</label>
                    <input
                      type="text"
                      value={form.moq}
                      onChange={(e) => setForm({ ...form, moq: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder={`e.g., 500 ${getFormUnitLabel()}`}
                      data-testid="fabric-moq-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Starting Price</label>
                    <input
                      type="text"
                      value={form.starting_price}
                      onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded"
                      placeholder={`e.g., ₹150/${getFormUnit()} or On enquiry`}
                      data-testid="fabric-starting-price-input"
                    />
                  </div>
                </div>

                {/* Inventory Section for Bookable Fabrics */}
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package size={18} className="text-emerald-700" />
                      <label className="text-sm font-medium text-emerald-800">Inventory & Booking</label>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_bookable}
                        onChange={(e) => setForm({ ...form, is_bookable: e.target.checked })}
                        className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        data-testid="fabric-is-bookable-checkbox"
                      />
                      <span className="text-sm text-emerald-700 font-medium">Enable direct booking</span>
                    </label>
                  </div>
                  
                  {/* Basic Inventory Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Quantity Available ({getFormUnitLabel()})</label>
                      <input
                        type="number"
                        value={form.quantity_available}
                        onChange={(e) => setForm({ ...form, quantity_available: e.target.value })}
                        className="w-full px-4 py-2 border border-emerald-200 rounded bg-white"
                        placeholder="e.g., 1000"
                        data-testid="fabric-quantity-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Base Rate per meter (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.rate_per_meter}
                        onChange={(e) => setForm({ ...form, rate_per_meter: e.target.value })}
                        className="w-full px-4 py-2 border border-emerald-200 rounded bg-white"
                        placeholder="e.g., 150.00"
                        data-testid="fabric-rate-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Dispatch Timeline (Bulk &amp; Sample) <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.dispatch_timeline}
                        onChange={(e) => setForm({ ...form, dispatch_timeline: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded bg-white focus:border-emerald-500 focus:outline-none"
                        data-testid="fabric-dispatch-select"
                      >
                        <option value="">Select dispatch time…</option>
                        {getDispatchOptions(form.stock_type).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {form.stock_type === "made_to_order"
                          ? "Production lead-time. Same timeline applies to bulk &amp; sample dispatch."
                          : "Ready-stock dispatch. Same timeline applies to bulk &amp; sample dispatch."}
                      </p>
                    </div>
                  </div>

                  {/* Estimated delivery fields removed — Locofast now enforces a global
                      turnaround (24–48 hrs for in-stock, ~30 days for manufacturing). */}

                  {/* Sample Pricing */}
                  <div className="bg-white rounded p-3 mb-4 border border-emerald-200">
                    <label className="block text-sm font-medium text-emerald-800 mb-2">Sample Pricing (1-5 meters)</label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">Price per meter for samples:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={form.sample_price}
                          onChange={(e) => setForm({ ...form, sample_price: e.target.value })}
                          className="w-28 px-3 py-1.5 border border-emerald-200 rounded bg-white text-sm"
                          placeholder="e.g., 200"
                          data-testid="fabric-sample-price-input"
                        />
                        <span className="text-gray-500">/m</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Customers can order 1-5 {getFormUnitLabel()} at this sample rate</p>
                  </div>

                  {/* Bulk Pricing Tiers */}
                  <div className="bg-white rounded p-3 border border-emerald-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-emerald-800">Bulk Pricing Tiers</label>
                      <button
                        type="button"
                        onClick={addPricingTier}
                        className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <Plus size={14} />
                        Add Tier
                      </button>
                    </div>
                    <div className="space-y-2">
                      {form.pricing_tiers.map((tier, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500 w-8">{index + 1}.</span>
                          <input
                            type="number"
                            value={tier.min_qty}
                            onChange={(e) => updatePricingTier(index, 'min_qty', e.target.value)}
                            className="w-20 px-2 py-1.5 border border-gray-200 rounded text-sm"
                            placeholder="Min"
                          />
                          <span className="text-gray-400">to</span>
                          <input
                            type="number"
                            value={tier.max_qty}
                            onChange={(e) => updatePricingTier(index, 'max_qty', e.target.value)}
                            className="w-20 px-2 py-1.5 border border-gray-200 rounded text-sm"
                            placeholder="Max"
                          />
                          <span className="text-gray-500">{getFormUnit()} @</span>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              value={tier.price}
                              onChange={(e) => updatePricingTier(index, 'price', e.target.value)}
                              className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="Price/m"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removePricingTier(index)}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title="Remove tier"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Define quantity brackets with different prices per meter. Leave price empty to skip a tier.</p>
                  </div>

                  <p className="text-xs text-emerald-600 mt-3">Enable booking to allow customers to place orders directly with tiered pricing</p>
                </div>

                {/* Seller SKU */}
                <div>
                  <label className="block text-sm font-medium mb-2">Seller SKU / Serial Number</label>
                  <input
                    type="text"
                    value={form.seller_sku}
                    onChange={(e) => setForm({ ...form, seller_sku: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="Seller's unique identifier for this fabric"
                    data-testid="fabric-seller-sku-input"
                  />
                </div>

                {/* HSN Code */}
                <div>
                  <label className="block text-sm font-medium mb-2">HSN Code (6-digit)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={form.hsn_code}
                    onChange={(e) => setForm({ ...form, hsn_code: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-4 py-2 border border-gray-200 rounded"
                    placeholder="e.g. 540799"
                    data-testid="fabric-hsn-code-input"
                  />
                  <p className="text-xs text-gray-400 mt-1">Used on invoices. 6-digit HSN code for this fabric.</p>
                </div>


                {/* Article Grouping */}
                <div>
                  <label className="block text-sm font-medium mb-2">Article (Color Variant Group)</label>
                  <select
                    value={form.article_id}
                    onChange={(e) => setForm({ ...form, article_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded bg-white"
                    data-testid="fabric-article-select"
                  >
                    <option value="">No article (standalone fabric)</option>
                    {articles.map((article) => (
                      <option key={article.id} value={article.id}>{article.name} ({article.article_code})</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Link this fabric to an article to group color variants together</p>
                </div>

                {/* Availability Multi-Select */}
                <div>
                  <label className="block text-sm font-medium mb-3">Availability</label>
                  <div className="flex flex-wrap gap-3" data-testid="fabric-availability-options">
                    {availabilityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleAvailability(opt.value)}
                        className={`px-4 py-2 rounded border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                          form.availability.includes(opt.value)
                            ? opt.color + " border-current"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {form.availability.includes(opt.value) && <Check size={16} />}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Select all that apply</p>
                </div>

                {/* Stock Type - Ready Stock vs Made to Order */}
                <div>
                  <label className="block text-sm font-medium mb-3">Stock Type</label>
                  <div className="flex gap-4" data-testid="fabric-stock-type">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "ready_stock", dispatch_timeline: "" })}
                      className={`flex-1 px-4 py-3 rounded border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        form.stock_type === "ready_stock"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {form.stock_type === "ready_stock" && <Check size={16} />}
                      Ready Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, stock_type: "made_to_order", dispatch_timeline: "" })}
                      className={`flex-1 px-4 py-3 rounded border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        form.stock_type === "made_to_order"
                          ? "bg-amber-50 text-amber-700 border-amber-400"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {form.stock_type === "made_to_order" && <Check size={16} />}
                      Made to Order
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Ready Stock: Available immediately | Made to Order: Production starts after order
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-sm h-24 resize-none"
                    data-testid="fabric-description-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-sm"
                    placeholder="e.g., cotton, lightweight, summer"
                    data-testid="fabric-tags-input"
                  />
                </div>

                {/* Certifications — multi-select checklist, hidden behind a
                    <details> so the admin form stays compact. Expand only
                    when the fabric actually carries certifications.
                    Using native `details`/`summary` keeps keyboard + screen-
                    reader behaviour correct without any JS state. */}
                <details className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-lg">
                  <summary
                    className="flex items-center justify-between text-sm font-medium text-emerald-900 cursor-pointer"
                    data-testid="cert-section-toggle"
                  >
                    <span>Certifications{" "}
                      <span className="text-xs font-normal text-emerald-700/70">
                        (optional — click to expand)
                      </span>
                    </span>
                    {Array.isArray(form.certifications) && form.certifications.length > 0 && (
                      <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        {form.certifications.length} selected
                      </span>
                    )}
                  </summary>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-3">Tick every certificate this fabric carries. Chips will show on the listing and PDP; buyers can also filter by these.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {CERTIFICATIONS.map((c) => {
                        const checked = Array.isArray(form.certifications) && form.certifications.includes(c.key);
                        return (
                          <label
                            key={c.key}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              checked ? "bg-white border-emerald-300 ring-1 ring-emerald-200" : "bg-white border-gray-200 hover:border-gray-300"
                            }`}
                            data-testid={`cert-checkbox-${c.key}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={(e) => {
                                const prev = Array.isArray(form.certifications) ? form.certifications : [];
                                setForm({
                                  ...form,
                                  certifications: e.target.checked
                                    ? [...prev, c.key]
                                    : prev.filter((k) => k !== c.key),
                                });
                              }}
                            />
                            <div className="leading-tight">
                              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dotClass}`} />
                                {c.label}
                              </div>
                              <div className="text-[10px] text-gray-500">{c.fullName}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </details>

                {/* Images */}
                <div>
                  <label className="block text-sm font-medium mb-2">Images</label>
                  <div className="flex flex-wrap gap-3 mb-3">
                    {form.images.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 bg-neutral-100">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                          aria-label="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-neutral-400 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                        data-testid="fabric-image-upload"
                      />
                      {uploading ? (
                        <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload size={20} className="text-neutral-400" />
                      )}
                    </label>
                  </div>
                </div>

                {/* Video (single per SKU) */}
                <div>
                  <label className="block text-sm font-medium mb-2">Video</label>
                  {form.videos.length > 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded border border-gray-100 mb-2">
                      <Video size={16} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-sm text-gray-600 truncate">{form.videos[0]}</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, videos: [] })}
                        className="p-1 text-gray-400 hover:text-red-500"
                        aria-label="Remove video"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Video Upload Progress */}
                      {uploadingVideo && (
                        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-blue-700">Uploading video...</span>
                            <span className="text-sm font-medium text-blue-800">{videoUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${videoUploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <label className={`btn-primary text-sm inline-flex items-center gap-2 cursor-pointer ${uploadingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Upload size={16} />
                          {uploadingVideo ? 'Uploading...' : 'Upload Video'}
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg"
                            onChange={handleVideoUpload}
                            className="hidden"
                            disabled={uploadingVideo}
                            data-testid="video-upload-input"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={addVideoUrl}
                          className="btn-secondary text-sm inline-flex items-center gap-2"
                          disabled={uploadingVideo}
                          data-testid="add-video-btn"
                        >
                          <Video size={16} />
                          Add URL
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">One video per SKU — upload (MP4, WebM, MOV up to 150MB) or paste URL</p>
                    </>
                  )}
                </div>

                <div className="flex gap-4 pt-4 border-t border-neutral-100">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary flex-1" data-testid="save-fabric-btn">
                    {editingFabric ? "Update Fabric" : "Create Fabric"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminFabrics;
