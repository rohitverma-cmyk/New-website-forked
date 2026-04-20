import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, MessageSquare, Package, ShoppingCart, Clock } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import RFQModal from "../components/RFQModal";
import { getFabrics, getFabricsCount, getCategories, createEnquiry, getFabricFilterOptions } from "../lib/api";
import { trackViewItemList } from "../lib/analytics";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

const FabricsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fabrics, setFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get("page")) || 1);

  // Filters
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "");
  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "");
  const [availabilityFilter, setAvailabilityFilter] = useState(searchParams.get("availability") || "");
  const [gsmRange, setGsmRange] = useState({
    min: searchParams.get("min_gsm") || "",
    max: searchParams.get("max_gsm") || "",
  });
  const [selectedPattern, setSelectedPattern] = useState(searchParams.get("pattern") || "");
  const [selectedColor, setSelectedColor] = useState(searchParams.get("color") || "");
  const [selectedWidth, setSelectedWidth] = useState(searchParams.get("width") || "");
  const [selectedComposition, setSelectedComposition] = useState(searchParams.get("composition") || "");
  const [weightRange, setWeightRange] = useState({
    min: searchParams.get("min_oz") || "",
    max: searchParams.get("max_oz") || "",
  });
  const [priceRange, setPriceRange] = useState({
    min: searchParams.get("min_price") || "",
    max: searchParams.get("max_price") || "",
  });

  // Modal states
  const [modalType, setModalType] = useState(null); // 'sample' | 'bulk'
  const [selectedFabric, setSelectedFabric] = useState(null);
  const [sampleQty, setSampleQty] = useState(1);
  const [bulkQty, setBulkQty] = useState("");
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", company: "", message: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [showRfqModal, setShowRfqModal] = useState(false);

  const fabricTypes = ["woven", "knitted", "non-woven"];
  const [filterOptions, setFilterOptions] = useState({ colors: [], patterns: [], widths: [], compositions: [], has_denim: false });
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Detect if viewing denim category — show oz instead of GSM
  const isDenimCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const cat = categories.find(c => c.id === selectedCategory);
    return cat ? cat.name?.toLowerCase().includes('denim') : false;
  }, [selectedCategory, categories]);

  // Helper function to get unit based on fabric type
  const getUnit = (fabric) => {
    if (!fabric) return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
    // Knitted fabrics use kg for bulk
    if (fabric.fabric_type === 'knitted') {
      return { singular: 'kg', plural: 'kg', short: 'kg', priceLabel: '/kg' };
    }
    return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
  };

  useEffect(() => {
    getCategories().then(res => setCategories(res.data)).catch(console.error);
    getFabricFilterOptions().then(res => setFilterOptions(res.data || { colors: [], patterns: [], widths: [], compositions: [], has_denim: false })).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchFabrics = async () => {
      setLoading(true);
      try {
        const params = {
          page: currentPage,
          limit: ITEMS_PER_PAGE
        };
        if (search) params.search = search;
        if (selectedCategory) params.category_id = selectedCategory;
        if (selectedType) params.fabric_type = selectedType;
        if (gsmRange.min) params.min_gsm = gsmRange.min;
        if (gsmRange.max) params.max_gsm = gsmRange.max;
        if (availabilityFilter === "sample") params.sample_available = true;
        if (availabilityFilter === "bulk") params.bookable_only = true;
        if (availabilityFilter === "instant") params.instant_bookable = true;
        if (availabilityFilter === "enquiry") params.enquiry_only = true;
        if (selectedPattern) params.pattern = selectedPattern;
        if (selectedColor) params.color = selectedColor;
        if (selectedWidth) params.width = selectedWidth.replace(/"/g, '');
        if (selectedComposition) params.composition = selectedComposition;
        if (weightRange.min) params.min_weight_oz = weightRange.min;
        if (weightRange.max) params.max_weight_oz = weightRange.max;
        if (priceRange.min) params.min_price = priceRange.min;
        if (priceRange.max) params.max_price = priceRange.max;

        const [fabricsRes, countRes] = await Promise.all([
          getFabrics(params),
          getFabricsCount(params)
        ]);
        setFabrics(fabricsRes.data);
        setTotalCount(countRes.data.count);
        // GA4: track catalog view
        if (fabricsRes.data.length > 0) {
          const listName = selectedCategory
            ? categories.find(c => c.id === selectedCategory)?.name || 'Filtered Catalog'
            : 'Fabric Catalog';
          trackViewItemList(fabricsRes.data, listName);
        }
      } catch (err) {
        console.error("Error fetching fabrics:", err);
      }
      setLoading(false);
    };

    const timeout = setTimeout(fetchFabrics, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedCategory, selectedType, availabilityFilter, gsmRange, selectedPattern, selectedColor, selectedWidth, weightRange, priceRange, currentPage]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedType) params.set("type", selectedType);
    if (availabilityFilter) params.set("availability", availabilityFilter);
    if (gsmRange.min) params.set("min_gsm", gsmRange.min);
    if (gsmRange.max) params.set("max_gsm", gsmRange.max);
    if (selectedPattern) params.set("pattern", selectedPattern);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedWidth) params.set("width", selectedWidth);
    if (weightRange.min) params.set("min_oz", weightRange.min);
    if (weightRange.max) params.set("max_oz", weightRange.max);
    if (priceRange.min) params.set("min_price", priceRange.min);
    if (priceRange.max) params.set("max_price", priceRange.max);
    if (currentPage > 1) params.set("page", currentPage.toString());
    setSearchParams(params, { replace: true });
  }, [search, selectedCategory, selectedType, availabilityFilter, gsmRange, selectedPattern, selectedColor, selectedWidth, weightRange, priceRange, currentPage, setSearchParams]);

  const goToPage = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("");
    setSelectedType("");
    setAvailabilityFilter("");
    setGsmRange({ min: "", max: "" });
    setSelectedPattern("");
    setSelectedColor("");
    setSelectedWidth("");
    setSelectedComposition("");
    setWeightRange({ min: "", max: "" });
    setPriceRange({ min: "", max: "" });
    setCurrentPage(1);
  };

  const getAvailabilityBadge = (availability) => {
    const badges = {
      "Sample Available": "bg-blue-100 text-blue-700",
      "Bulk Available": "bg-green-100 text-green-700",
      "On Request": "bg-yellow-100 text-yellow-700",
    };
    return badges[availability] || "bg-gray-100 text-gray-700";
  };

  // Modal handlers
  const openModal = (fabric, type) => {
    setSelectedFabric(fabric);
    setModalType(type);
    setSampleQty(1);
    setBulkQty(fabric.moq || "10"); // Default to MOQ or 10
    setFormData({ name: "", email: "", phone: "", company: "", message: "" });
  };

  const closeModal = () => {
    setSelectedFabric(null);
    setModalType(null);
  };

  const proceedToCheckout = () => {
    if (!selectedFabric) return;
    const qty = modalType === "sample" ? sampleQty : bulkQty;
    if (modalType === "bulk" && (!bulkQty || parseInt(bulkQty) <= 0)) {
      toast.error("Please enter a valid quantity");
      return;
    }
    navigate(`/checkout?fabric_id=${selectedFabric.id}&type=${modalType}&qty=${qty}`);
    closeModal();
  };

  // Calculate bulk price based on tiers
  const calculateBulkPrice = (fabric, quantity) => {
    if (!quantity || quantity <= 0) return null;
    const qty = parseInt(quantity);
    const tiers = fabric.pricing_tiers || [];
    const unit = getUnit(fabric);
    
    for (const tier of tiers) {
      if (qty >= tier.min_qty && qty <= tier.max_qty) {
        return { pricePerMeter: tier.price_per_meter, totalPrice: tier.price_per_meter * qty, tierLabel: `${tier.min_qty}-${tier.max_qty}${unit.short}` };
      }
    }
    if (fabric.rate_per_meter) {
      return { pricePerMeter: fabric.rate_per_meter, totalPrice: fabric.rate_per_meter * qty, tierLabel: "Base rate" };
    }
    return null;
  };

  // Cart value calculation - only for enquiry modal now
  const cartValue = useMemo(() => {
    if (!selectedFabric) return null;
    
    if (modalType === "sample") {
      const samplePrice = selectedFabric.sample_price || selectedFabric.rate_per_meter || 0;
      return { pricePerMeter: samplePrice, quantity: sampleQty, totalPrice: samplePrice * sampleQty, label: "Sample" };
    } else if (modalType === "bulk") {
      return calculateBulkPrice(selectedFabric, bulkQty);
    }
    return null;
  }, [selectedFabric, modalType, sampleQty, bulkQty]);

  // Submit handler - only for enquiry now
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFabric) return;
    
    setSubmitting(true);
    try {
      let enquiryData = {
        fabric_id: selectedFabric.id,
        fabric_name: selectedFabric.name,
        ...formData,
      };

      enquiryData.enquiry_type = "general";
      enquiryData.message = formData.message || "General enquiry about this fabric";

      await createEnquiry(enquiryData);
      
      toast.success("Enquiry submitted! We'll get back to you soon.");
      closeModal();
    } catch (err) {
      toast.error("Failed to submit. Please try again.");
    }
    setSubmitting(false);
  };

  // Check what actions are available for a fabric
  const getAvailableActions = (fabric) => {
    const actions = {
      canEnquire: true, // Always available
      canBookSample: fabric.is_bookable && (fabric.sample_price > 0 || fabric.rate_per_meter > 0),
      canBookBulk: fabric.is_bookable && fabric.quantity_available > 0,
      samplePrice: fabric.sample_price || fabric.rate_per_meter,
      hasTiers: fabric.pricing_tiers && fabric.pricing_tiers.length > 0
    };
    return actions;
  };

  // Generate dynamic page title and description based on filters
  const getPageMeta = () => {
    let title = "Fabric Catalog";
    let description = "Browse our extensive collection of quality fabrics from verified Indian mills.";
    
    const categoryName = categories.find(c => c.id === selectedCategory)?.name;
    
    if (categoryName) {
      title = `${categoryName} Fabrics`;
      description = `Explore premium ${categoryName.toLowerCase()} fabrics. Source quality textiles from verified suppliers with transparent pricing and fast delivery.`;
    }
    
    if (selectedType) {
      const typeName = selectedType.charAt(0).toUpperCase() + selectedType.slice(1);
      title = categoryName ? `${typeName} ${categoryName} Fabrics` : `${typeName} Fabrics`;
      description = `Browse ${typeName.toLowerCase()} fabrics${categoryName ? ` in ${categoryName.toLowerCase()} category` : ''}. High-quality textiles for fashion brands and manufacturers.`;
    }
    
    if (search) {
      title = `Search: "${search}" - Fabrics`;
      description = `Search results for "${search}" in our fabric catalog. Find the perfect textile for your needs.`;
    }
    
    if (currentPage > 1) {
      title += ` - Page ${currentPage}`;
    }
    
    return {
      title: `${title} | Locofast - B2B Textile Marketplace`,
      description: description + " MOQ clarity, sample orders available. Get matched within 48 hours."
    };
  };

  const pageMeta = getPageMeta();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Helmet>
        <title>{pageMeta.title}</title>
        <meta name="description" content={pageMeta.description} />
        <meta property="og:title" content={pageMeta.title} />
        <meta property="og:description" content={pageMeta.description} />
        <link rel="canonical" href="https://locofast.com/fabrics" />
      </Helmet>
      <Navbar />
      <main className="flex-grow pt-20" data-testid="fabrics-page">
        <div className="container-main py-6 sm:py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold mb-1">Fabric Catalog</h1>
              <p className="text-sm sm:text-base text-gray-500">
                {loading ? "Loading..." : `${totalCount} fabrics available`}
              </p>
            </div>
          </div>

          {/* Quick Filter Toggle */}
          <div className="flex flex-wrap gap-2 mb-4" data-testid="quick-filters">
            <button
              onClick={() => {
                setAvailabilityFilter("");
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                availabilityFilter === ""
                  ? "bg-gray-900 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
              }`}
              data-testid="quick-filter-all"
            >
              All
            </button>
            <button
              onClick={() => {
                setAvailabilityFilter("bulk");
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                availabilityFilter === "bulk"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              }`}
              data-testid="quick-filter-bulk"
            >
              <Package size={16} />
              Bulk Bookable
            </button>
            <button
              onClick={() => {
                setAvailabilityFilter("sample");
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                availabilityFilter === "sample"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
              }`}
              data-testid="quick-filter-sample"
            >
              <Clock size={16} />
              Sample Bookable
            </button>
            <button
              onClick={() => {
                setAvailabilityFilter("enquiry");
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                availabilityFilter === "enquiry"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
              }`}
              data-testid="quick-filter-enquiry"
            >
              <MessageSquare size={16} />
              Enquiry
            </button>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search fabrics by name, type, composition..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm sm:text-base"
                data-testid="fabrics-search"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                showFilters ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal size={18} />
              Filters
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8 animate-fadeIn">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                {/* Row 1 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-category"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</label>
                  <select
                    value={selectedType}
                    onChange={(e) => { setSelectedType(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-type"
                  >
                    <option value="">All Types</option>
                    {fabricTypes.map((type) => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pattern</label>
                  <select
                    value={selectedPattern}
                    onChange={(e) => { setSelectedPattern(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-pattern"
                  >
                    <option value="">All Patterns</option>
                    {(filterOptions.patterns.length > 0 ? filterOptions.patterns : ["Solid", "Checks", "Stripes", "Print", "Others"]).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Color</label>
                  <select
                    value={selectedColor}
                    onChange={(e) => { setSelectedColor(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-color"
                  >
                    <option value="">All Colors</option>
                    {filterOptions.colors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Row 2 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Width</label>
                  <select
                    value={selectedWidth}
                    onChange={(e) => { setSelectedWidth(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-width"
                  >
                    <option value="">All Widths</option>
                    {(filterOptions.widths.length > 0 ? filterOptions.widths : ['54"', '56"', '58"', '60"', '63"', '65"', '67"']).map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Composition</label>
                  <select
                    value={selectedComposition}
                    onChange={(e) => { setSelectedComposition(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    data-testid="filter-composition"
                  >
                    <option value="">All Compositions</option>
                    {(filterOptions.compositions || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{isDenimCategory ? "Weight (oz)" : "GSM Range"}</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={isDenimCategory ? weightRange.min : gsmRange.min}
                      onChange={(e) => { isDenimCategory ? setWeightRange({ ...weightRange, min: e.target.value }) : setGsmRange({ ...gsmRange, min: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={isDenimCategory ? weightRange.max : gsmRange.max}
                      onChange={(e) => { isDenimCategory ? setWeightRange({ ...weightRange, max: e.target.value }) : setGsmRange({ ...gsmRange, max: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                  </div>
                </div>
                {!isDenimCategory && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Weight (oz)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Min"
                      value={weightRange.min}
                      onChange={(e) => { setWeightRange({ ...weightRange, min: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Max"
                      value={weightRange.max}
                      onChange={(e) => { setWeightRange({ ...weightRange, max: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                  </div>
                </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price (₹/m)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceRange.min}
                      onChange={(e) => { setPriceRange({ ...priceRange, min: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceRange.max}
                      onChange={(e) => { setPriceRange({ ...priceRange, max: e.target.value }); setCurrentPage(1); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-[#2563EB] focus:outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
                  data-testid="clear-filters-btn"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          )}

          {/* Fabrics Grid */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-gray-200 rounded mb-4" />
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : fabrics.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 mb-4">No fabrics found matching your criteria</p>
              <button onClick={clearFilters} className="btn-primary">
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6" data-testid="fabrics-grid">
              {fabrics.map((fabric) => {
                const actions = getAvailableActions(fabric);
                return (
                  <div
                    key={fabric.id}
                    className="group bg-white rounded-lg border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow"
                    data-testid={`fabric-card-${fabric.id}`}
                  >
                    <Link to={`/fabrics/${fabric.slug || fabric.id}`} className="block">
                      <div className="aspect-[3/4] overflow-hidden bg-gray-100 relative">
                        <img
                          src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600"}
                          alt={`${fabric.name} - ${fabric.composition?.map(c => c.material).join(', ') || fabric.category_name} fabric${fabric.color ? ` in ${fabric.color}` : ''}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600";
                          }}
                        />
                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex flex-col gap-1">
                          {fabric.is_bookable && fabric.quantity_available > 0 && (
                            <span className="badge bg-emerald-500 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                              {fabric.quantity_available.toLocaleString()}{getUnit(fabric).short} Available
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                    
                    <div className="p-3 sm:p-4">
                      <p className="text-[10px] sm:text-xs font-medium text-[#2563EB] mb-0.5 sm:mb-1 truncate">{fabric.category_name}</p>
                      <Link to={`/fabrics/${fabric.slug || fabric.id}`}>
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-1 group-hover:text-[#2563EB] transition-colors line-clamp-2">
                          {fabric.name}
                        </h3>
                      </Link>
                      
                      <div className="flex flex-wrap gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-gray-500 mb-2 sm:mb-3">
                        {fabric.gsm > 0 && <span className="px-1 sm:px-1.5 py-0.5 bg-gray-100 rounded">{fabric.gsm} GSM</span>}
                        {fabric.weight_unit === 'ounce' && fabric.ounce && <span className="px-1 sm:px-1.5 py-0.5 bg-gray-100 rounded">{fabric.ounce} oz</span>}
                        {fabric.width && <span className="px-1 sm:px-1.5 py-0.5 bg-gray-100 rounded">{fabric.width}"</span>}
                      </div>

                      {/* Color variant dots */}
                      {fabric.has_multiple_colors && fabric.color_variants?.length > 0 && (
                        <div className="flex gap-1 mb-2" data-testid={`color-dots-${fabric.id}`}>
                          {fabric.color_variants.slice(0, 6).map((cv, i) => (
                            <span key={i} className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: cv.color_hex || '#ccc' }} title={cv.color_name} />
                          ))}
                          {fabric.color_variants.length > 6 && <span className="text-[10px] text-gray-400 self-center">+{fabric.color_variants.length - 6}</span>}
                        </div>
                      )}

                      {/* Pricing info */}
                      {actions.canBookSample && (
                        <div className="flex items-center justify-between text-xs sm:text-sm mb-2 sm:mb-3 pt-2 border-t border-gray-100">
                          <span className="text-gray-500">Sample</span>
                          <span className="font-semibold text-emerald-600">₹{actions.samplePrice?.toLocaleString()}{getUnit(fabric).priceLabel}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-1.5 sm:gap-2">
                        {actions.canBookBulk && (
                          <button
                            onClick={(e) => { e.preventDefault(); openModal(fabric, 'bulk'); }}
                            className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs sm:text-sm font-medium transition-colors"
                            data-testid={`bulk-btn-${fabric.id}`}
                          >
                            <ShoppingCart size={12} className="sm:w-[14px] sm:h-[14px]" />
                            <span className="hidden sm:inline">Book Bulk Now</span>
                            <span className="sm:hidden">Bulk</span>
                          </button>
                        )}
                        {actions.canBookSample && (
                          <button
                            onClick={(e) => { e.preventDefault(); openModal(fabric, 'sample'); }}
                            className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs sm:text-sm font-medium transition-colors"
                            data-testid={`sample-btn-${fabric.id}`}
                          >
                            <Package size={12} className="sm:w-[14px] sm:h-[14px]" />
                            <span className="hidden sm:inline">Book Sample</span>
                            <span className="sm:hidden">Sample</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.preventDefault(); setShowRfqModal(true); }}
                          className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-xs sm:text-sm font-medium transition-colors"
                          data-testid={`enquiry-btn-${fabric.id}`}
                        >
                          <MessageSquare size={12} className="sm:w-[14px] sm:h-[14px]" />
                          <span className="hidden sm:inline">Request a Quote</span>
                          <span className="sm:hidden">Quote</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && !loading && (
            <div className="flex items-center justify-center gap-2 mt-12" data-testid="pagination">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page} className="flex items-center">
                        {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                        <button
                          onClick={() => goToPage(page)}
                          className={`min-w-[40px] h-10 px-3 border rounded font-medium transition-colors ${
                            currentPage === page ? "bg-[#2563EB] text-white border-[#2563EB]" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}
              </div>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* Unified Modal */}
      {selectedFabric && modalType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold">
                {modalType === "sample" ? "Book Sample" : "Book Bulk Order"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{selectedFabric.name}</p>
            </div>

            {/* Sample/Bulk Order Modal */}
            {(modalType === "sample" || modalType === "bulk") && (
              <div className="p-6 space-y-5">
                {/* Fabric Summary */}
                <div className="bg-gray-50 rounded-lg p-4 flex gap-4">
                  <img
                    src={selectedFabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"}
                    alt={selectedFabric.name}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{selectedFabric.name}</p>
                    <p className="text-sm text-gray-600">{selectedFabric.category_name}</p>
                    {modalType === "bulk" && selectedFabric.quantity_available && (
                      <p className="text-xs text-emerald-600 mt-1 font-medium">
                        {selectedFabric.quantity_available.toLocaleString()} {getUnit(selectedFabric).plural} available
                      </p>
                    )}
                  </div>
                </div>

                {/* Quantity Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {modalType === "sample" ? "Sample Quantity" : `Bulk Quantity (${getUnit(selectedFabric).plural})`}
                  </label>
                  {modalType === "sample" ? (
                    <select
                      value={sampleQty}
                      onChange={(e) => setSampleQty(parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                      data-testid="sample-qty-select"
                    >
                      {[1, 2, 3, 4, 5].map((qty) => (
                        <option key={qty} value={qty}>{qty} {getUnit(selectedFabric).singular}{qty > 1 && getUnit(selectedFabric).singular !== 'kg' ? "s" : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      max={selectedFabric.quantity_available || 10000}
                      value={bulkQty}
                      onChange={(e) => setBulkQty(e.target.value)}
                      placeholder={`Enter quantity in ${getUnit(selectedFabric).plural}`}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                      data-testid="bulk-qty-input"
                    />
                  )}
                </div>

                {/* Pricing Tiers for Bulk */}
                {modalType === "bulk" && selectedFabric.pricing_tiers && selectedFabric.pricing_tiers.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-800 mb-2">Bulk Pricing Tiers</p>
                    <div className="space-y-1">
                      {selectedFabric.pricing_tiers.map((tier, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-blue-700">{tier.min_qty} - {tier.max_qty} {getUnit(selectedFabric).plural}</span>
                          <span className="font-medium text-blue-900">₹{tier.price_per_meter}{getUnit(selectedFabric).priceLabel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Summary */}
                {cartValue && (
                  <div className="bg-gray-900 text-white rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-300">
                          {modalType === "sample" ? `${sampleQty} ${getUnit(selectedFabric).singular}${sampleQty > 1 && getUnit(selectedFabric).singular !== 'kg' ? "s" : ""}` : `${bulkQty} ${getUnit(selectedFabric).plural}`}
                          {cartValue.tierLabel && <span className="ml-1">({cartValue.tierLabel})</span>}
                        </p>
                        <p className="text-xs text-gray-400">@ ₹{cartValue.pricePerMeter?.toLocaleString()}{getUnit(selectedFabric).priceLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">₹{cartValue.totalPrice?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">+ 5% GST</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={proceedToCheckout}
                    disabled={modalType === "bulk" && (!bulkQty || parseInt(bulkQty) <= 0)}
                    className="flex-1 py-3 rounded-lg font-medium disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
                    data-testid="proceed-checkout-btn"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}

            {/* Enquiry replaced by unified RFQ Modal */}
          </div>
        </div>
      )}

      {/* Unified RFQ Modal - Same flow as homepage and header */}
      <RFQModal open={showRfqModal} onClose={() => setShowRfqModal(false)} />
    </div>
  );
};

export default FabricsPage;
