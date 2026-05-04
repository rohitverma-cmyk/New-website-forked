import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAgentAuth } from "../../context/AgentAuthContext";
import { Search, ShoppingCart, Send, Package, LogOut, Plus, Minus, Trash2, ExternalLink, Copy, Loader2, Eye, Clock, CheckCircle, XCircle, FileText, Store, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { getFabrics, getFabricsCount, getCategories, getFabricFilterOptions } from "../../lib/api";
import { getCheapestBulkPrice, formatQtyThreshold } from "../../lib/pricing";
import { thumbImage } from "../../lib/imageUrl";
import Watermark from "../../components/Watermark";

const API = process.env.REACT_APP_BACKEND_URL;

// Small reusable chip used to display active filters with one-click clear
const FilterChip = ({ label, onClear }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-medium">
    {label}
    <button onClick={onClear} className="hover:bg-blue-100 rounded-full p-0.5" aria-label={`Clear ${label}`}>
      <X size={12} />
    </button>
  </span>
);

const AgentDashboardPage = () => {
  const { agent, token, logout, loading: authLoading } = useAgentAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("catalog"); // catalog | cart | shared | orders

  // Catalog
  const [fabrics, setFabrics] = useState([]);
  const [fabricsLoading, setFabricsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalFabrics, setTotalFabrics] = useState(0);

  // Catalog filters (mirror B2C /fabrics)
  const [categories, setCategories] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ colors: [], patterns: [], widths: [], compositions: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState(""); // bulk | enquiry
  const [gsmRange, setGsmRange] = useState({ min: "", max: "" });
  const [weightRange, setWeightRange] = useState({ min: "", max: "" });
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedWidth, setSelectedWidth] = useState("");
  const [selectedComposition, setSelectedComposition] = useState("");

  // Cart
  const [cart, setCart] = useState([]);

  // Shared carts
  const [sharedCarts, setSharedCarts] = useState([]);
  const [cartsLoading, setCartsLoading] = useState(false);

  // Agent orders
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Share modal
  const [sharing, setSharing] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dispatchCountry, setDispatchCountry] = useState("india");
  const [usdRate, setUsdRate] = useState(null);
  // PI buyer fields (Bangladesh)
  const [showPIForm, setShowPIForm] = useState(false);
  const [piGenerating, setPiGenerating] = useState(false);
  const [buyerInfo, setBuyerInfo] = useState({
    name: "", company: "", email: "", phone: "",
    address: "", city: "", state: "", pincode: "",
    shipping_name: "", shipping_address: "", shipping_city: "", shipping_state: "",
  });

  const fetchFabrics = useCallback(async () => {
    setFabricsLoading(true);
    try {
      const params = { page, limit: 20 };
      if (searchQuery) params.search = searchQuery;
      if (selectedCategory) params.category_id = selectedCategory;
      if (selectedType) params.fabric_type = selectedType;
      if (availabilityFilter === "bulk") params.bookable_only = true;
      if (availabilityFilter === "enquiry") params.enquiry_only = true;
      if (gsmRange.min) params.min_gsm = gsmRange.min;
      if (gsmRange.max) params.max_gsm = gsmRange.max;
      if (weightRange.min) params.min_weight_oz = weightRange.min;
      if (weightRange.max) params.max_weight_oz = weightRange.max;
      if (priceRange.min) params.min_price = priceRange.min;
      if (priceRange.max) params.max_price = priceRange.max;
      if (selectedPattern) params.pattern = selectedPattern;
      if (selectedColor) params.color = selectedColor;
      if (selectedWidth) params.width = selectedWidth.replace(/"/g, '');
      if (selectedComposition) params.composition = selectedComposition;

      const [fabricsRes, countRes] = await Promise.all([
        getFabrics(params),
        getFabricsCount(params),
      ]);
      setFabrics(fabricsRes.data || []);
      setTotalFabrics(countRes.data?.count ?? 0);
    } catch {
      toast.error("Failed to load fabrics");
    }
    setFabricsLoading(false);
  }, [page, searchQuery, selectedCategory, selectedType, availabilityFilter, gsmRange, weightRange, priceRange, selectedPattern, selectedColor, selectedWidth, selectedComposition]);

  const fetchSharedCarts = async () => {
    setCartsLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/shared-carts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSharedCarts(await res.json());
    } catch {}
    setCartsLoading(false);
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API}/api/agent/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(await res.json());
    } catch {}
    setOrdersLoading(false);
  };

  useEffect(() => { fetchFabrics(); }, [fetchFabrics]);
  useEffect(() => { if (activeTab === "shared") fetchSharedCarts(); }, [activeTab]);
  useEffect(() => { if (activeTab === "orders") fetchOrders(); }, [activeTab]);

  // Load categories + filter options once
  useEffect(() => {
    getCategories().then(res => setCategories(res.data || [])).catch(() => {});
    getFabricFilterOptions().then(res => setFilterOptions(res.data || { colors: [], patterns: [], widths: [], compositions: [] })).catch(() => {});
  }, []);

  // Reset to page 1 when any filter changes
  useEffect(() => { setPage(1); }, [searchQuery, selectedCategory, selectedType, availabilityFilter, gsmRange, weightRange, priceRange, selectedPattern, selectedColor, selectedWidth, selectedComposition]);

  const activeFilterCount = [
    selectedCategory, selectedType, availabilityFilter, selectedPattern, selectedColor, selectedWidth, selectedComposition,
    gsmRange.min, gsmRange.max, weightRange.min, weightRange.max, priceRange.min, priceRange.max,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSelectedCategory(""); setSelectedType(""); setAvailabilityFilter("");
    setGsmRange({ min: "", max: "" }); setWeightRange({ min: "", max: "" }); setPriceRange({ min: "", max: "" });
    setSelectedPattern(""); setSelectedColor(""); setSelectedWidth(""); setSelectedComposition("");
  };

  // Fetch USD rate when Bangladesh selected
  useEffect(() => {
    if (dispatchCountry === "bangladesh" && !usdRate) {
      fetch(`${API}/api/agent/exchange-rate`).then(r => r.json()).then(d => setUsdRate(d)).catch(() => {});
    }
  }, [dispatchCountry, usdRate]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !token) navigate("/agent/login");
  }, [authLoading, token, navigate]);

  const addToCart = (fabric, orderType = "bulk") => {
    const existing = cart.find((c) => c.fabric_id === fabric.id && c.order_type === orderType);
    if (existing) {
      toast.info("Already in cart — adjust quantity there");
      setActiveTab("cart");
      return;
    }
    const isSample = orderType === "sample";
    setCart([...cart, {
      fabric_id: fabric.id,
      fabric_name: fabric.name,
      fabric_code: fabric.fabric_code || "",
      category_name: fabric.category_name || "",
      seller_company: fabric.seller_company || "",
      seller_id: fabric.seller_id || "",
      quantity: isSample ? 1 : (parseInt(fabric.moq) || 100),
      price_per_meter: isSample ? (fabric.sample_price || fabric.rate_per_meter || 0) : (fabric.rate_per_meter || 0),
      order_type: orderType,
      image_url: fabric.images?.[0] || "",
      hsn_code: fabric.hsn_code || "",
    }]);
    toast.success(`${fabric.name} added as ${orderType}`);
  };

  const updateCartQty = (fabricId, delta) => {
    setCart(cart.map((c) => c.fabric_id === fabricId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (fabricId) => {
    setCart(cart.filter((c) => c.fabric_id !== fabricId));
  };

  const handleUploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error("Only image files allowed"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await axios.post(
        `${API}/api/agent/upload-payment-proof`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPaymentProofUrl(data.url);
      toast.success("Payment proof uploaded");
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Upload failed';
      toast.error(msg);
    }
    setUploading(false);
  };

  const handleShareCart = async (shareType = "quote") => {
    if (!cart.length) return;
    setSharing(true);
    try {
      // Use axios (not fetch) — fetch's Response body stream can be consumed
      // by browser extensions/interceptors, causing "body stream already read"
      const { data } = await axios.post(
        `${API}/api/agent/shared-cart`,
        { items: cart, customer_email: customerEmail, notes: "", payment_proof_url: paymentProofUrl, dispatch_country: dispatchCountry },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
      );
      const link = `${window.location.origin}/shared-cart/${data.token}`;
      try { await navigator.clipboard.writeText(link); } catch { /* clipboard may fail */ }
      toast.success(`Quote link copied: ${link}`);
      setCart([]);
      setCustomerEmail("");
      setPaymentProofUrl("");
      setDispatchCountry("india");
      setActiveTab("shared");
      fetchSharedCarts();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to generate link";
      toast.error(msg);
    }
    setSharing(false);
  };

  const handleGeneratePI = async () => {
    if (!cart.length) return;
    if (!buyerInfo.name || !buyerInfo.company) {
      toast.error("Buyer name and company are required for PI");
      return;
    }
    setPiGenerating(true);
    try {
      const res = await fetch(`${API}/api/orders/confirm-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((i) => ({
            fabric_id: i.fabric_id, fabric_name: i.fabric_name, fabric_code: i.fabric_code || "",
            category_name: i.category_name || "", seller_id: i.seller_id || "", seller_company: i.seller_company || "",
            quantity: i.quantity, price_per_meter: i.price_per_meter, order_type: i.order_type || "bulk", hsn_code: i.hsn_code || "",
          })),
          customer: {
            name: buyerInfo.name, email: buyerInfo.email, phone: buyerInfo.phone,
            company: buyerInfo.company, address: buyerInfo.address, city: buyerInfo.city,
            state: buyerInfo.state, pincode: buyerInfo.pincode, gst_number: "",
            shipping_name: buyerInfo.shipping_name || buyerInfo.name,
            shipping_address: buyerInfo.shipping_address || buyerInfo.address,
            shipping_city: buyerInfo.shipping_city || buyerInfo.city,
            shipping_state: buyerInfo.shipping_state || buyerInfo.state,
          },
          shared_cart_token: "",
          agent_id: agent?.id || "", agent_email: agent?.email || "", agent_name: agent?.name || "",
          dispatch_country: "bangladesh",
        }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.detail || "Failed to generate PI");
      toast.success(`PI Generated: ${data.pi_number}`);
      // Download PI PDF
      window.open(`${API}/api/orders/${data.order_id}/proforma-invoice`, "_blank");
      setCart([]);
      setShowPIForm(false);
      setBuyerInfo({ name: "", company: "", email: "", phone: "", address: "", city: "", state: "", pincode: "", shipping_name: "", shipping_address: "", shipping_city: "", shipping_state: "" });
      setDispatchCountry("india");
      setActiveTab("orders");
      fetchOrders();
    } catch (err) {
      toast.error(err.message);
    }
    setPiGenerating(false);
  };


  const copyLink = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/shared-cart/${token}`);
    toast.success("Link copied!");
  };

  const cartTotal = cart.reduce((s, c) => s + c.quantity * c.price_per_meter, 0);
  const totalMeters = cart.reduce((s, c) => s + (c.order_type === "bulk" ? c.quantity : 0), 0);
  const METERS_TO_YARDS = 1.0936;

  // Bangladesh charges
  const bdCharges = dispatchCountry === "bangladesh" ? {
    borderLogistics: Math.round(cartTotal * 0.01 * 100) / 100,
    exportDocs: Math.round(cartTotal * 0.004 * 100) / 100,
    customClearance: Math.round(cartTotal * 0.0105 * 100) / 100,
  } : null;
  const bdTotal = bdCharges ? bdCharges.borderLogistics + bdCharges.exportDocs + bdCharges.customClearance : 0;
  const grandTotalINR = cartTotal + bdTotal;
  const inrToUsd = usdRate?.inr_to_usd || 0.0119;
  const grandTotalUSD = Math.round(grandTotalINR * inrToUsd * 100) / 100;
  const totalYards = totalMeters * METERS_TO_YARDS;
  const usdPerYard = totalYards > 0 ? Math.round(grandTotalUSD / totalYards * 100) / 100 : 0;

  const handleLogout = () => { logout(); navigate("/agent/login"); };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      {/* Agent-only minimal header — intentionally NO B2C navbar to keep agent in workflow */}
      <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800" data-testid="agent-header">
        <div className="container-main flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img
              src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg"
              alt="Locofast"
              className="h-6 brightness-0 invert"
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-l border-slate-700 pl-3">Agent Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline" data-testid="agent-header-email">{agent?.email}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 border border-slate-700 hover:border-slate-500 rounded-md transition-colors" data-testid="agent-logout-btn-header">
              <LogOut size={13} />Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow" data-testid="agent-dashboard">
        <div className="container-main py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Agent Dashboard</h1>
              <p className="text-sm text-gray-500">Welcome, {agent?.name || agent?.email}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {[
              { key: "catalog", label: "Browse Catalog", icon: Search },
              { key: "cart", label: `Cart (${cart.length})`, icon: ShoppingCart },
              { key: "shared", label: "Shared Carts", icon: Send },
              { key: "orders", label: "Orders", icon: Package },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                data-testid={`agent-tab-${t.key}`}
              >
                <t.icon size={16} />{t.label}
              </button>
            ))}
          </div>

          {/* ===== CATALOG TAB ===== */}
          {activeTab === "catalog" && (
            <div>
              {/* Count + Search + Filter Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm text-gray-500" data-testid="agent-fabric-count">
                    <span className="font-semibold text-gray-900">{totalFabrics.toLocaleString()}</span> fabrics in catalog
                    {activeFilterCount > 0 && <span className="ml-2 text-blue-600">· {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} applied</span>}
                  </p>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${showFilters || activeFilterCount > 0 ? "border-[#2563EB] bg-blue-50 text-[#2563EB]" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}
                  data-testid="agent-toggle-filters"
                >
                  <SlidersHorizontal size={15} />
                  Filters{activeFilterCount > 0 && <span className="bg-[#2563EB] text-white text-xs px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
                </button>
              </div>

              {/* Search bar */}
              <div className="relative mb-4">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, code, color, composition..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  data-testid="agent-fabric-search"
                />
              </div>

              {/* Active filter chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="agent-active-filter-chips">
                  {selectedCategory && (() => {
                    const c = categories.find(x => x.id === selectedCategory);
                    return c ? <FilterChip label={c.name} onClear={() => setSelectedCategory("")} /> : null;
                  })()}
                  {selectedType && <FilterChip label={selectedType === "knitted" ? "Knits" : selectedType === "woven" ? "Woven" : selectedType} onClear={() => setSelectedType("")} />}
                  {availabilityFilter && <FilterChip label={availabilityFilter === "bulk" ? "Bookable Now" : "Enquiry Only"} onClear={() => setAvailabilityFilter("")} />}
                  {selectedColor && <FilterChip label={`Color: ${selectedColor}`} onClear={() => setSelectedColor("")} />}
                  {selectedPattern && <FilterChip label={`Pattern: ${selectedPattern}`} onClear={() => setSelectedPattern("")} />}
                  {selectedWidth && <FilterChip label={`Width: ${selectedWidth}`} onClear={() => setSelectedWidth("")} />}
                  {selectedComposition && <FilterChip label={`Composition: ${selectedComposition}`} onClear={() => setSelectedComposition("")} />}
                  {(gsmRange.min || gsmRange.max) && <FilterChip label={`GSM ${gsmRange.min || "0"}–${gsmRange.max || "∞"}`} onClear={() => setGsmRange({ min: "", max: "" })} />}
                  {(weightRange.min || weightRange.max) && <FilterChip label={`Weight ${weightRange.min || "0"}–${weightRange.max || "∞"} oz`} onClear={() => setWeightRange({ min: "", max: "" })} />}
                  {(priceRange.min || priceRange.max) && <FilterChip label={`₹${priceRange.min || "0"}–${priceRange.max || "∞"}`} onClear={() => setPriceRange({ min: "", max: "" })} />}
                  <button onClick={clearAllFilters} className="text-xs text-red-600 hover:text-red-700 font-medium underline" data-testid="agent-clear-all-filters">Clear all</button>
                </div>
              )}

              <div className="flex gap-6">
                {/* Filter sidebar */}
                {showFilters && (
                  <aside className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-5 h-fit sticky top-20" data-testid="agent-filter-sidebar">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-sm text-gray-900">Filters</h3>
                      {activeFilterCount > 0 && (
                        <button onClick={clearAllFilters} className="text-xs text-red-600 hover:text-red-700">Clear</button>
                      )}
                    </div>

                    {/* Category */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                      <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-category">
                        <option value="">All categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {/* Type */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{ v: "", l: "All" }, { v: "knitted", l: "Knits" }, { v: "woven", l: "Woven" }].map(t => (
                          <button key={t.v} onClick={() => setSelectedType(t.v)} className={`px-3 py-1 text-xs rounded-full border ${selectedType === t.v ? "bg-[#2563EB] text-white border-[#2563EB]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`} data-testid={`agent-filter-type-${t.v || "all"}`}>{t.l}</button>
                        ))}
                      </div>
                    </div>

                    {/* Availability */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Availability</label>
                      <div className="flex flex-col gap-1">
                        {[{ v: "", l: "All" }, { v: "bulk", l: "Bookable Now" }, { v: "enquiry", l: "Enquiry Only" }].map(a => (
                          <label key={a.v} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="agent-availability" checked={availabilityFilter === a.v} onChange={() => setAvailabilityFilter(a.v)} data-testid={`agent-filter-avail-${a.v || "all"}`} />
                            <span className="text-gray-700">{a.l}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* GSM */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">GSM</label>
                      <div className="flex gap-2">
                        <input type="number" min="0" placeholder="Min" value={gsmRange.min} onChange={(e) => setGsmRange({ ...gsmRange, min: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-gsm-min" />
                        <input type="number" min="0" placeholder="Max" value={gsmRange.max} onChange={(e) => setGsmRange({ ...gsmRange, max: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-gsm-max" />
                      </div>
                    </div>

                    {/* Weight oz (denim) */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Weight (oz, denim)</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.1" min="0" placeholder="Min" value={weightRange.min} onChange={(e) => setWeightRange({ ...weightRange, min: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-oz-min" />
                        <input type="number" step="0.1" min="0" placeholder="Max" value={weightRange.max} onChange={(e) => setWeightRange({ ...weightRange, max: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-oz-max" />
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Price (₹/m)</label>
                      <div className="flex gap-2">
                        <input type="number" min="0" placeholder="Min" value={priceRange.min} onChange={(e) => setPriceRange({ ...priceRange, min: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-price-min" />
                        <input type="number" min="0" placeholder="Max" value={priceRange.max} onChange={(e) => setPriceRange({ ...priceRange, max: e.target.value })} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-price-max" />
                      </div>
                    </div>

                    {/* Color */}
                    {filterOptions.colors?.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Color</label>
                        <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-color">
                          <option value="">All colors</option>
                          {filterOptions.colors.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Pattern */}
                    {filterOptions.patterns?.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Pattern</label>
                        <select value={selectedPattern} onChange={(e) => setSelectedPattern(e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-pattern">
                          <option value="">All patterns</option>
                          {filterOptions.patterns.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Width */}
                    {filterOptions.widths?.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Width</label>
                        <select value={selectedWidth} onChange={(e) => setSelectedWidth(e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-width">
                          <option value="">All widths</option>
                          {filterOptions.widths.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Composition */}
                    {filterOptions.compositions?.length > 0 && (
                      <div className="mb-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Composition</label>
                        <select value={selectedComposition} onChange={(e) => setSelectedComposition(e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-sm focus:border-blue-500 focus:outline-none" data-testid="agent-filter-composition">
                          <option value="">All compositions</option>
                          {filterOptions.compositions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </aside>
                )}

                {/* Results grid */}
                <div className="flex-1 min-w-0">
                  {fabricsLoading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-blue-600" /></div>
                  ) : fabrics.length === 0 ? (
                    <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200" data-testid="agent-no-fabrics">
                      <Package size={48} className="mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No fabrics match these filters</p>
                      {activeFilterCount > 0 && <button onClick={clearAllFilters} className="mt-3 text-sm text-[#2563EB] hover:underline">Clear all filters</button>}
                    </div>
                  ) : (
                    <div className={`grid sm:grid-cols-2 ${showFilters ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4`}>
                      {fabrics.map((f) => (
                        <div key={f.id} className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow" data-testid={`agent-fabric-${f.id}`}>
                          <div className="relative">
                            <img src={thumbImage(f.images?.[0]) || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=300"} alt={f.name} className="w-full h-40 object-cover" loading="lazy" />
                            <Watermark size="sm" />
                          </div>
                          <div className="p-4">
                            <h3 className="font-medium text-sm text-gray-900 truncate">{f.name}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{f.category_name}</p>
                            {/* Vendor pill — prominent on Agent platform (hidden on B2C) */}
                            {f.seller_company ? (
                              <div
                                className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium max-w-full"
                                data-testid={`agent-vendor-${f.id}`}
                                title={f.seller_company}
                              >
                                <Store size={11} className="flex-shrink-0" />
                                <span className="truncate">{f.seller_company}</span>
                              </div>
                            ) : (
                              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 border border-gray-200 text-gray-500 text-[11px] font-medium">
                                <Store size={11} />
                                <span>Locofast direct</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-3">
                              {(() => {
                                const cheapest = getCheapestBulkPrice(f);
                                if (!cheapest) return <span className="text-sm text-gray-400">Price on enquiry</span>;
                                return (
                                  <div className="flex flex-col">
                                    <span className="text-lg font-semibold text-[#2563EB]">₹{cheapest.price.toLocaleString()}<span className="text-xs font-normal text-gray-500">/m</span></span>
                                    {cheapest.hasTier && cheapest.minQty && (
                                      <span className="text-[10px] text-gray-500">from {formatQtyThreshold(cheapest.minQty, "m")}</span>
                                    )}
                                  </div>
                                );
                              })()}
                              <div className="flex gap-1">
                                <button
                                  onClick={() => addToCart(f, "sample")}
                                  className="px-2.5 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                                  data-testid={`add-sample-${f.id}`}
                                >
                                  Sample
                                </button>
                                <button
                                  onClick={() => addToCart(f, "bulk")}
                                  className="px-2.5 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                  data-testid={`add-bulk-${f.id}`}
                                >
                                  Bulk
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {totalFabrics > 20 && (
                    <div className="flex items-center justify-center gap-4 mt-8">
                      <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50">Previous</button>
                      <span className="text-sm text-gray-500">Page {page} of {Math.ceil(totalFabrics / 20)}</span>
                      <button disabled={page * 20 >= totalFabrics} onClick={() => setPage(page + 1)} className="px-4 py-2 border rounded-lg disabled:opacity-50">Next</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== CART TAB ===== */}
          {activeTab === "cart" && (
            <div>
              {cart.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Cart is empty</p>
                  <p className="text-sm mt-1">Browse the catalog to add fabrics</p>
                  <button onClick={() => setActiveTab("catalog")} className="mt-4 px-6 py-2 bg-[#2563EB] text-white rounded-lg text-sm hover:bg-blue-700">Browse Catalog</button>
                </div>
              ) : (
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-3">
                    {cart.map((item) => (
                      <div key={`${item.fabric_id}-${item.order_type}`} className="bg-white rounded-xl p-4 border border-gray-200 flex gap-4" data-testid={`cart-item-${item.fabric_id}`}>
                        {item.image_url && <img src={item.image_url} alt={item.fabric_name} className="w-20 h-20 object-cover rounded-lg" />}
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.fabric_name}</h3>
                          <p className="text-xs text-gray-500">{item.category_name}</p>
                          {/* Vendor pill — agent must know which vendor to coordinate with */}
                          {item.seller_company ? (
                            <div
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium"
                              data-testid={`cart-vendor-${item.fabric_id}`}
                              title={item.seller_company}
                            >
                              <Store size={10} />
                              <span className="truncate max-w-[200px]">{item.seller_company}</span>
                            </div>
                          ) : null}
                          <div className="flex items-center gap-2 mt-1.5">
                            {/* Order type is locked to whatever the agent picked
                                 in Browse Catalog. To switch between Sample/Bulk
                                 the agent should remove the row and re-add from
                                 the catalog — keeps pricing & inventory checks
                                 honest and avoids cart-side mistakes. */}
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}
                              data-testid={`cart-type-${item.fabric_id}`}
                            >
                              {item.order_type === "sample" ? "Sample" : "Bulk"}
                            </span>
                            <span className="text-sm text-[#2563EB] font-semibold">₹{item.price_per_meter}/m</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button onClick={() => removeFromCart(item.fabric_id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1">
                            {/* Step size: bulk moves in 10m increments, samples move in 1m
                                 increments. Samples are still measured in meters — typical
                                 swatch lengths are 1-5m. */}
                            <button onClick={() => updateCartQty(item.fabric_id, item.order_type === "sample" ? -1 : -10)} className="p-1 text-gray-500 hover:text-gray-700"><Minus size={14} /></button>
                            <span className="text-sm font-medium w-12 text-center">{item.quantity}m</span>
                            <button onClick={() => updateCartQty(item.fabric_id, item.order_type === "sample" ? 1 : 10)} className="p-1 text-gray-500 hover:text-gray-700"><Plus size={14} /></button>
                          </div>
                          <span className="text-sm font-semibold">₹{(item.quantity * item.price_per_meter).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-6 border border-gray-200 h-fit sticky top-24">
                    <h3 className="font-semibold text-gray-900 mb-4">Share Cart</h3>

                    {/* Dispatch Country */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Dispatch Country</label>
                      <div className="flex gap-2">
                        {[{ val: "india", label: "India", flag: "🇮🇳" }, { val: "bangladesh", label: "Bangladesh", flag: "🇧🇩" }].map((c) => (
                          <button
                            key={c.val}
                            type="button"
                            onClick={() => setDispatchCountry(c.val)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${dispatchCountry === c.val ? "border-[#2563EB] bg-blue-50 text-[#2563EB]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                            data-testid={`dispatch-${c.val}`}
                          >
                            <span>{c.flag}</span>{c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between"><span className="text-gray-600">Items</span><span>{cart.length}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Subtotal (INR)</span><span className="font-medium">₹{cartTotal.toLocaleString()}</span></div>
                      
                      {dispatchCountry === "bangladesh" && bdCharges && (
                        <>
                          <div className="pt-2 border-t border-dashed border-amber-200">
                            <p className="text-xs font-semibold text-amber-700 mb-1.5">Bangladesh Export Charges</p>
                          </div>
                          <div className="flex justify-between text-amber-700">
                            <span className="text-xs">Border Logistics (1%)</span>
                            <span className="text-xs font-medium">₹{bdCharges.borderLogistics.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-amber-700">
                            <span className="text-xs">Export Documentation (0.40%)</span>
                            <span className="text-xs font-medium">₹{bdCharges.exportDocs.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-amber-700">
                            <span className="text-xs">Custom Clearance (1.05%)</span>
                            <span className="text-xs font-medium">₹{bdCharges.customClearance.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-amber-200 font-semibold">
                            <span className="text-gray-700">Grand Total (INR)</span>
                            <span>₹{grandTotalINR.toLocaleString()}</span>
                          </div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-1">
                            <div className="flex justify-between font-bold text-emerald-800">
                              <span>Total (USD)</span>
                              <span>${grandTotalUSD.toLocaleString()}</span>
                            </div>
                            {usdPerYard > 0 && (
                              <div className="flex justify-between text-xs text-emerald-600 mt-1">
                                <span>Rate</span>
                                <span>${usdPerYard}/yard ({totalYards.toFixed(1)} yards)</span>
                              </div>
                            )}
                            <p className="text-[10px] text-emerald-500 mt-1">Rate: 1 INR = {inrToUsd.toFixed(4)} USD (daily)</p>
                          </div>
                        </>
                      )}
                      
                      {dispatchCountry === "india" && (
                        <div className="flex justify-between font-semibold pt-2 border-t">
                          <span className="text-gray-700">Cart Total</span>
                          <span className="text-[#2563EB]">₹{cartTotal.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Customer Email (optional)</label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                        data-testid="agent-customer-email"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">RTGS/NEFT Payment Proof</label>
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center">
                        {paymentProofUrl ? (
                          <div className="flex items-center gap-3">
                            <img src={`${API}${paymentProofUrl}`} alt="Payment proof" className="w-16 h-16 object-cover rounded" />
                            <div className="flex-1 text-left">
                              <p className="text-xs text-emerald-600 font-medium">Uploaded</p>
                              <button onClick={() => setPaymentProofUrl("")} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                            </div>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <input type="file" accept="image/*" onChange={handleUploadProof} className="hidden" data-testid="agent-payment-proof-input" />
                            <p className="text-xs text-gray-500">{uploading ? "Uploading..." : "Click to upload screenshot"}</p>
                          </label>
                        )}
                      </div>
                    </div>
                    {dispatchCountry === "bangladesh" ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleShareCart("quote")}
                          disabled={sharing || !cart.length}
                          className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          data-testid="agent-share-quote-btn"
                        >
                          {sharing ? <Loader2 size={18} className="animate-spin" /> : <><Send size={16} />Share Quote</>}
                        </button>
                        <button
                          onClick={() => setShowPIForm(true)}
                          disabled={!cart.length}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          data-testid="agent-share-pi-btn"
                        >
                          <FileText size={16} />Share PI
                        </button>
                        <p className="text-xs text-gray-400 text-center">Quote = link for customer to review. PI = signed Proforma Invoice PDF.</p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleShareCart("quote")}
                          disabled={sharing || !cart.length}
                          className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          data-testid="agent-share-cart-btn"
                        >
                          {sharing ? <Loader2 size={18} className="animate-spin" /> : <><Send size={16} />Generate & Copy Link</>}
                        </button>
                        <p className="text-xs text-gray-400 text-center mt-3">Link will be copied to clipboard. Share it with the customer for payment.</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== SHARED CARTS TAB ===== */}
          {activeTab === "shared" && (
            <div>
              {cartsLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-blue-600" /></div>
              ) : sharedCarts.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Send size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No shared carts yet</p>
                  <p className="text-sm mt-1">Build a cart and share the link with a customer</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sharedCarts.map((sc) => (
                    <div key={sc.id} className="bg-white rounded-xl p-5 border border-gray-200" data-testid={`shared-cart-${sc.token}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {sc.status === "completed" ? <CheckCircle size={18} className="text-emerald-500" /> : sc.status === "expired" ? <XCircle size={18} className="text-red-400" /> : <Clock size={18} className="text-amber-500" />}
                          <div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.status === "completed" ? "bg-emerald-100 text-emerald-700" : sc.status === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {sc.status === "completed" ? "Completed" : sc.status === "expired" ? "Expired" : "Pending"}
                            </span>
                            <span className="text-xs text-gray-400 ml-3">{formatDate(sc.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => copyLink(sc.token)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563EB] border border-blue-200 rounded-lg hover:bg-blue-50"><Copy size={14} />Copy Link</button>
                          <a href={`/shared-cart/${sc.token}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"><ExternalLink size={14} />Open</a>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">{sc.items?.length || 0} item{(sc.items?.length || 0) !== 1 ? "s" : ""}</span>
                        {sc.customer_email && <span className="ml-3 text-gray-400">Customer: {sc.customer_email}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sc.items?.slice(0, 3).map((item, i) => (
                          <span key={i} className="text-xs bg-gray-50 border border-gray-100 px-2 py-1 rounded">
                            <span className={`inline-block mr-1 px-1 py-0 rounded text-[10px] font-bold ${item.order_type === 'sample' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.order_type === 'sample' ? 'S' : 'B'}</span>
                            {item.fabric_name} ({item.quantity}m)
                          </span>
                        ))}
                        {sc.items?.length > 3 && <span className="text-xs text-gray-400">+{sc.items.length - 3} more</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== ORDERS TAB ===== */}
          {activeTab === "orders" && (
            <div>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-blue-600" /></div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Package size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No orders yet</p>
                  <p className="text-sm mt-1">Orders placed via your shared carts will appear here</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orders.map((o) => {
                        const isSample = o.items?.[0]?.order_type === 'sample';
                        return (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 font-medium text-[#2563EB]">{o.order_number}</td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${isSample ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isSample ? 'SAMPLE' : 'BULK'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-medium">{o.customer?.name}</p>
                            <p className="text-xs text-gray-500">{o.customer?.email}</p>
                          </td>
                          <td className="px-4 py-4 font-semibold text-emerald-600">₹{o.total?.toLocaleString()}</td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${o.status === "confirmed" || o.status === "delivered" ? "bg-emerald-100 text-emerald-700" : o.status === "shipped" ? "bg-purple-100 text-purple-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">{formatDate(o.created_at)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* PI Form Modal */}
      {showPIForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPIForm(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="pi-form-modal">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold">Generate Proforma Invoice</h3>
                <p className="text-sm text-gray-500">Fill buyer details to create a signed PI</p>
              </div>
              <button onClick={() => setShowPIForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><Trash2 size={18} /></button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-800">Cart: {cart.length} item{cart.length !== 1 ? "s" : ""} · ₹{cartTotal.toLocaleString()} · ${grandTotalUSD} USD</p>
              </div>

              <h4 className="font-medium text-gray-900 text-sm">Bill To</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buyer Name *</label>
                  <input type="text" value={buyerInfo.name} onChange={(e) => setBuyerInfo({ ...buyerInfo, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Contact person" data-testid="pi-buyer-name" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Company Name *</label>
                  <input type="text" value={buyerInfo.company} onChange={(e) => setBuyerInfo({ ...buyerInfo, company: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Dhaka Textiles Ltd" data-testid="pi-buyer-company" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={buyerInfo.email} onChange={(e) => setBuyerInfo({ ...buyerInfo, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="buyer@company.com" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input type="tel" value={buyerInfo.phone} onChange={(e) => setBuyerInfo({ ...buyerInfo, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="+880..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Address</label>
                  <input type="text" value={buyerInfo.address} onChange={(e) => setBuyerInfo({ ...buyerInfo, address: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Street address" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">City</label>
                  <input type="text" value={buyerInfo.city} onChange={(e) => setBuyerInfo({ ...buyerInfo, city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Dhaka" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">State/Division</label>
                  <input type="text" value={buyerInfo.state} onChange={(e) => setBuyerInfo({ ...buyerInfo, state: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Dhaka" />
                </div>
              </div>

              <h4 className="font-medium text-gray-900 text-sm pt-2">Ship To</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Shipping Name</label>
                  <input type="text" value={buyerInfo.shipping_name} onChange={(e) => setBuyerInfo({ ...buyerInfo, shipping_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Same as billing if empty" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Shipping City</label>
                  <input type="text" value={buyerInfo.shipping_city} onChange={(e) => setBuyerInfo({ ...buyerInfo, shipping_city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Dhaka" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Shipping Address</label>
                  <input type="text" value={buyerInfo.shipping_address} onChange={(e) => setBuyerInfo({ ...buyerInfo, shipping_address: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Same as billing if empty" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPIForm(false)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-medium">Cancel</button>
              <button
                onClick={handleGeneratePI}
                disabled={piGenerating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50"
                data-testid="pi-generate-btn"
              >
                {piGenerating ? <Loader2 size={16} className="animate-spin" /> : <><FileText size={16} />Generate Signed PI</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AgentDashboardPage;
