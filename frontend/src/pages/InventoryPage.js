import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, Package, ShoppingCart, Clock, ArrowLeft, Check, Info } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getFabrics, getFabricsCount, getCategories, createEnquiry } from "../lib/api";
import { toast } from "sonner";

const InventoryPage = () => {
  const [fabrics, setFabrics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortBy, setSortBy] = useState("price_low");
  const [orderModal, setOrderModal] = useState(null);
  const [orderType, setOrderType] = useState("sample"); // "sample" or "bulk"
  const [sampleQty, setSampleQty] = useState(1);
  const [bulkQty, setBulkQty] = useState("");
  const [enquiryForm, setEnquiryForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: ""
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCategories().then(res => setCategories(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    const fetchBookableFabrics = async () => {
      setLoading(true);
      try {
        const params = {
          bookable_only: true,
          limit: 100
        };
        if (search) params.search = search;
        if (selectedCategory) params.category_id = selectedCategory;

        // Use allSettled so a slow/failing /count endpoint doesn't blank the
        // page when the fabrics list itself succeeded. Prod has seen
        // intermittent 520s on /count under load — show what we have.
        const [fabricsResult, countResult] = await Promise.allSettled([
          getFabrics(params),
          getFabricsCount(params)
        ]);

        if (fabricsResult.status === "rejected") {
          throw fabricsResult.reason;
        }
        let sortedFabrics = [...(fabricsResult.value.data || [])];

        // Sort fabrics
        if (sortBy === "price_low") {
          sortedFabrics.sort((a, b) => (a.rate_per_meter || 0) - (b.rate_per_meter || 0));
        } else if (sortBy === "price_high") {
          sortedFabrics.sort((a, b) => (b.rate_per_meter || 0) - (a.rate_per_meter || 0));
        } else if (sortBy === "stock_high") {
          sortedFabrics.sort((a, b) => (b.quantity_available || 0) - (a.quantity_available || 0));
        } else if (sortBy === "newest") {
          sortedFabrics.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        setFabrics(sortedFabrics);
        // Fall back to fabrics.length if count failed — better than showing 0
        // alongside a populated list.
        setTotalCount(
          countResult.status === "fulfilled"
            ? (countResult.value.data?.count ?? sortedFabrics.length)
            : sortedFabrics.length
        );
      } catch (err) {
        console.error("Error fetching inventory:", err);
        toast.error("Failed to load inventory");
      }
      setLoading(false);
    };

    const timeout = setTimeout(fetchBookableFabrics, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedCategory, sortBy]);

  // Calculate price based on quantity and pricing tiers
  const calculateBulkPrice = (fabric, quantity) => {
    if (!quantity || quantity <= 0) return null;
    
    const qty = parseInt(quantity);
    const tiers = fabric.pricing_tiers || [];
    
    // Find matching tier
    for (const tier of tiers) {
      if (qty >= tier.min_qty && qty <= tier.max_qty) {
        return {
          pricePerMeter: tier.price_per_meter,
          totalPrice: tier.price_per_meter * qty,
          tierLabel: `${tier.min_qty}-${tier.max_qty}m`
        };
      }
    }
    
    // If no tier matches, use base rate
    if (fabric.rate_per_meter) {
      return {
        pricePerMeter: fabric.rate_per_meter,
        totalPrice: fabric.rate_per_meter * qty,
        tierLabel: "Base rate"
      };
    }
    
    return null;
  };

  // Calculate cart value based on order type
  const cartValue = useMemo(() => {
    if (!orderModal) return null;
    
    if (orderType === "sample") {
      const samplePrice = orderModal.sample_price || orderModal.rate_per_meter || 0;
      return {
        pricePerMeter: samplePrice,
        quantity: sampleQty,
        totalPrice: samplePrice * sampleQty,
        label: "Sample"
      };
    } else {
      const bulkCalc = calculateBulkPrice(orderModal, bulkQty);
      if (bulkCalc) {
        return {
          pricePerMeter: bulkCalc.pricePerMeter,
          quantity: parseInt(bulkQty),
          totalPrice: bulkCalc.totalPrice,
          label: bulkCalc.tierLabel
        };
      }
    }
    return null;
  }, [orderModal, orderType, sampleQty, bulkQty]);

  const openOrderModal = (fabric) => {
    setOrderModal(fabric);
    setOrderType("sample");
    setSampleQty(1);
    setBulkQty("");
    setEnquiryForm({ name: "", email: "", phone: "", company: "", message: "" });
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (!orderModal || !cartValue) return;
    
    setSubmitting(true);
    try {
      await createEnquiry({
        fabric_id: orderModal.id,
        fabric_name: orderModal.name,
        ...enquiryForm,
        enquiry_type: orderType === "sample" ? "sample_order" : "bulk_order",
        quantity_required: `${cartValue.quantity} meters`,
        message: `${orderType === "sample" ? "Sample" : "Bulk"} Order Request\nQuantity: ${cartValue.quantity} meters\nPrice/m: ₹${cartValue.pricePerMeter.toLocaleString()}\nTotal Value: ₹${cartValue.totalPrice.toLocaleString()}\n\n${enquiryForm.message || "No additional notes"}`
      });
      toast.success("Order submitted! We'll contact you shortly.");
      setOrderModal(null);
    } catch (err) {
      toast.error("Failed to submit order. Please try again.");
    }
    setSubmitting(false);
  };

  const formatComposition = (composition) => {
    if (!Array.isArray(composition) || composition.length === 0) return null;
    return composition
      .filter(c => c.material && c.percentage > 0)
      .map(c => `${c.percentage}% ${c.material}`)
      .join(', ');
  };

  const getDisplayPrice = (fabric) => {
    // Show sample price if available, otherwise base rate
    if (fabric.sample_price) {
      return { price: fabric.sample_price, label: "sample" };
    }
    if (fabric.rate_per_meter) {
      return { price: fabric.rate_per_meter, label: "from" };
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-grow pt-20" data-testid="inventory-page">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white py-16">
          <div className="container-main">
            <Link to="/" className="inline-flex items-center gap-2 text-emerald-100 hover:text-white mb-4 text-sm">
              <ArrowLeft size={16} />
              Back to Home
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/10 rounded-lg">
                <Package size={28} />
              </div>
              <div>
                <p className="text-emerald-100 text-sm font-medium">Ready to Order</p>
                <h1 className="text-3xl md:text-4xl font-semibold">Bookable Inventory</h1>
              </div>
            </div>
            <p className="text-emerald-100 max-w-2xl">
              Fabrics available for instant booking. Order samples (1-5m) or bulk quantities with tiered pricing.
            </p>
            <div className="flex items-center gap-6 mt-6 text-sm">
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-300" />
                <span>Sample Orders (1-5m)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-300" />
                <span>Bulk Pricing Tiers</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={18} className="text-emerald-300" />
                <span>Fast Dispatch</span>
              </div>
            </div>
          </div>
        </div>

        <div className="container-main py-8">
          {/* Filters Bar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  data-testid="inventory-search"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none bg-white min-w-[160px]"
                data-testid="inventory-category-filter"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none bg-white min-w-[160px]"
                data-testid="inventory-sort"
              >
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="stock_high">Stock: High to Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{totalCount}</span> items available for order
              </p>
              {(search || selectedCategory) && (
                <button
                  onClick={() => { setSearch(""); setSelectedCategory(""); }}
                  className="text-sm text-emerald-600 hover:text-emerald-700"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Inventory Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-10 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : fabrics.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookable inventory found</h3>
              <p className="text-gray-500 mb-6">
                {search || selectedCategory 
                  ? "Try adjusting your filters to find available inventory."
                  : "Check back soon for new stock arrivals."}
              </p>
              <Link to="/fabrics" className="btn-primary inline-block">
                Browse All Fabrics
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="inventory-grid">
              {fabrics.map((fabric) => {
                const displayPrice = getDisplayPrice(fabric);
                return (
                  <div 
                    key={fabric.id} 
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
                    data-testid={`inventory-item-${fabric.id}`}
                  >
                    <Link to={`/fabrics/${fabric.slug || fabric.id}`} className="block aspect-[4/3] overflow-hidden relative">
                      <img
                        src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600"}
                        alt={fabric.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                          In Stock
                        </span>
                      </div>
                      {fabric.quantity_available > 0 && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2.5 py-1 bg-white/90 backdrop-blur text-gray-700 text-xs font-medium rounded-full">
                            {fabric.quantity_available.toLocaleString()}m available
                          </span>
                        </div>
                      )}
                    </Link>

                    <div className="p-5">
                      <p className="text-xs font-medium text-emerald-600 mb-1">{fabric.category_name}</p>
                      <Link to={`/fabrics/${fabric.slug || fabric.id}`}>
                        <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-emerald-600 transition-colors line-clamp-2">
                          {fabric.name}
                        </h3>
                      </Link>
                      {/* Vendor name intentionally hidden on public surfaces. */}

                      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                        {fabric.gsm > 0 && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded">{fabric.gsm} GSM</span>
                        )}
                        {fabric.weight_unit === 'ounce' && fabric.ounce && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded">{fabric.ounce} oz</span>
                        )}
                        {fabric.width && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded">{fabric.width}" width</span>
                        )}
                      </div>

                      {formatComposition(fabric.composition) && (
                        <p className="text-sm text-gray-600 mb-3">{formatComposition(fabric.composition)}</p>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div>
                          <p className="text-xs text-gray-400">{displayPrice?.label === "sample" ? "Sample price" : "Price"}</p>
                          <p className="text-lg font-bold text-emerald-600">
                            ₹{displayPrice?.price?.toLocaleString() || "—"}<span className="text-sm font-normal text-gray-500">/m</span>
                          </p>
                        </div>
                        {fabric.dispatch_timeline && (
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Dispatch</p>
                            <div className="flex items-center gap-1 text-sm text-gray-700">
                              <Clock size={14} />
                              <span>{fabric.dispatch_timeline} days</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {fabric.pricing_tiers && fabric.pricing_tiers.length > 0 && (
                        <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                          <Info size={12} />
                          Bulk pricing available
                        </p>
                      )}

                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => openOrderModal(fabric)}
                          className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5"
                          data-testid={`order-btn-${fabric.id}`}
                        >
                          <ShoppingCart size={16} />
                          Order Now
                        </button>
                        <Link
                          to={`/fabrics/${fabric.slug || fabric.id}`}
                          className="px-4 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!loading && fabrics.length > 0 && (
          <div className="bg-emerald-50 border-y border-emerald-100 py-12 mt-8">
            <div className="container-main text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Can't find what you're looking for?</h2>
              <p className="text-gray-600 mb-6">Browse our full catalog or submit a custom sourcing request.</p>
              <div className="flex items-center justify-center gap-4">
                <Link to="/fabrics" className="btn-secondary">
                  Browse Full Catalog
                </Link>
                <Link to="/assisted-sourcing" className="btn-primary">
                  Request Custom Sourcing
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />

      {/* Order Modal */}
      {orderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOrderModal(null)}>
          <div 
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold">Place Order</h2>
              <p className="text-sm text-gray-500 mt-1">{orderModal.name}</p>
            </div>

            <form onSubmit={handleSubmitOrder} className="p-6 space-y-5">
              {/* Fabric Summary */}
              <div className="bg-gray-50 rounded-lg p-4 flex gap-4">
                <img
                  src={orderModal.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"}
                  alt={orderModal.name}
                  className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{orderModal.name}</p>
                  <p className="text-sm text-gray-600">{orderModal.category_name}</p>
                  {orderModal.quantity_available && (
                    <p className="text-xs text-gray-500 mt-1">{orderModal.quantity_available.toLocaleString()}m in stock</p>
                  )}
                </div>
              </div>

              {/* Order Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Order Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOrderType("sample")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      orderType === "sample" 
                        ? "border-emerald-500 bg-emerald-50" 
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium text-gray-900">Sample Order</p>
                    <p className="text-sm text-gray-500">1-5 meters</p>
                    {orderModal.sample_price && (
                      <p className="text-emerald-600 font-semibold mt-1">₹{orderModal.sample_price.toLocaleString()}/m</p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType("bulk")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      orderType === "bulk" 
                        ? "border-emerald-500 bg-emerald-50" 
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium text-gray-900">Bulk Order</p>
                    <p className="text-sm text-gray-500">6+ meters</p>
                    {orderModal.pricing_tiers?.length > 0 && (
                      <p className="text-emerald-600 text-xs mt-1">Tiered pricing available</p>
                    )}
                  </button>
                </div>
              </div>

              {/* Quantity Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity {orderType === "sample" ? "(meters)" : "(meters)"}
                </label>
                {orderType === "sample" ? (
                  <select
                    value={sampleQty}
                    onChange={(e) => setSampleQty(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none bg-white"
                    data-testid="sample-qty-select"
                  >
                    {[1, 2, 3, 4, 5].map(qty => (
                      <option key={qty} value={qty}>{qty} meter{qty > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min="6"
                    value={bulkQty}
                    onChange={(e) => setBulkQty(e.target.value)}
                    placeholder="Enter quantity (min 6 meters)"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none"
                    data-testid="bulk-qty-input"
                  />
                )}
              </div>

              {/* Pricing Tiers Info (for bulk) */}
              {orderType === "bulk" && orderModal.pricing_tiers?.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-800 mb-2">Bulk Pricing Tiers</p>
                  <div className="space-y-1">
                    {orderModal.pricing_tiers.map((tier, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-blue-700">{tier.min_qty} - {tier.max_qty} meters</span>
                        <span className="font-medium text-blue-900">₹{tier.price_per_meter?.toLocaleString()}/m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cart Value */}
              {cartValue && (
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-emerald-700">Order Summary ({cartValue.label})</p>
                      <p className="text-xs text-emerald-600">{cartValue.quantity} meters × ₹{cartValue.pricePerMeter.toLocaleString()}/m</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-emerald-600">Total Value</p>
                      <p className="text-2xl font-bold text-emerald-700">₹{cartValue.totalPrice.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Details */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      required
                      value={enquiryForm.name}
                      onChange={(e) => setEnquiryForm({ ...enquiryForm, name: e.target.value })}
                      placeholder="Your Name *"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                      data-testid="order-name"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={enquiryForm.company}
                      onChange={(e) => setEnquiryForm({ ...enquiryForm, company: e.target.value })}
                      placeholder="Company"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                      data-testid="order-company"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      required
                      value={enquiryForm.email}
                      onChange={(e) => setEnquiryForm({ ...enquiryForm, email: e.target.value })}
                      placeholder="Email *"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                      data-testid="order-email"
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      required
                      value={enquiryForm.phone}
                      onChange={(e) => setEnquiryForm({ ...enquiryForm, phone: e.target.value })}
                      placeholder="Phone *"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                      data-testid="order-phone"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <textarea
                    value={enquiryForm.message}
                    onChange={(e) => setEnquiryForm({ ...enquiryForm, message: e.target.value })}
                    rows={2}
                    placeholder="Additional notes (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none resize-none text-sm"
                    data-testid="order-message"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderModal(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !cartValue}
                  className="flex-1 btn-primary py-2.5 disabled:opacity-50"
                  data-testid="submit-order-btn"
                >
                  {submitting ? "Submitting..." : `Submit ${orderType === "sample" ? "Sample" : "Bulk"} Order`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
