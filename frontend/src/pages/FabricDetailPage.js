import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ChevronLeft, ChevronRight, Send, X, ZoomIn, Package, Truck, FileCheck, MapPin, CheckCircle2, ShoppingCart, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ExpandableText from "../components/ExpandableText";
import RFQModal from "../components/RFQModal";
import { getFabric, createEnquiry, getFabricSEO, getRelatedFabrics, getOtherSellers } from "../lib/api";
import { trackViewItem, trackAddToCart, trackRFQIntent } from "../lib/analytics";

const FabricDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fabric, setFabric] = useState(null);
  const [seoContent, setSeoContent] = useState(null);
  const [relatedFabrics, setRelatedFabrics] = useState([]);
  const [otherSellers, setOtherSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedColorVariant, setSelectedColorVariant] = useState(-1);
  const [showZoom, setShowZoom] = useState(false);
  const [showRfqModal, setShowRfqModal] = useState(false);
  
  const [orderModalType, setOrderModalType] = useState(null); // 'sample' | 'bulk' | null
  const [showBookModal, setShowBookModal] = useState(false);
  const [sampleQty, setSampleQty] = useState(1);
  const [bulkQty, setBulkQty] = useState("");
  const [orderForm, setOrderForm] = useState({
    name: "", email: "", phone: "", gst_number: ""
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [fabricRes, seoRes, relatedRes] = await Promise.all([
          getFabric(id),
          getFabricSEO(id).catch(() => ({ data: null })),
          getRelatedFabrics(id).catch(() => ({ data: [] }))
        ]);
        setFabric(fabricRes.data);
        setSeoContent(seoRes.data);
        setRelatedFabrics(relatedRes.data || []);
        // GA4: track product view
        if (fabricRes.data) trackViewItem(fabricRes.data);
        // Fetch other sellers for same product
        if (fabricRes.data?.article_id) {
          getOtherSellers(id).then(res => setOtherSellers(res.data || [])).catch(() => {});
        }
      } catch (err) {
        console.error("Error fetching fabric:", err);
        toast.error("Failed to load fabric details");
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  // Check available actions
  const getAvailableActions = () => {
    if (!fabric) return { canBookSample: false, canBookBulk: false };
    return {
      canBookSample: fabric.is_bookable && (fabric.sample_price > 0 || fabric.rate_per_meter > 0),
      canBookBulk: fabric.is_bookable && fabric.quantity_available > 0,
      samplePrice: fabric.sample_price || fabric.rate_per_meter,
      hasTiers: fabric.pricing_tiers && fabric.pricing_tiers.length > 0
    };
  };

  const actions = getAvailableActions();

  // Helper function to get unit based on category
  const getUnit = () => {
    if (!fabric) return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
    // Knits category uses kg
    if (fabric.category_id === 'cat-knits') {
      return { singular: 'kg', plural: 'kg', short: 'kg', priceLabel: '/kg' };
    }
    return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
  };

  const unit = getUnit();

  // Calculate bulk price based on tiers
  const calculateBulkPrice = (quantity) => {
    if (!fabric || !quantity || quantity <= 0) return null;
    const qty = parseInt(quantity);
    const tiers = fabric.pricing_tiers || [];
    
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

  const bulkPrice = useMemo(() => calculateBulkPrice(bulkQty), [bulkQty, fabric]);


  // Cart value calculation
  const cartValue = useMemo(() => {
    if (!fabric || !orderModalType) return null;
    
    if (orderModalType === "sample") {
      const samplePrice = fabric.sample_price || fabric.rate_per_meter || 0;
      return { pricePerMeter: samplePrice, quantity: sampleQty, totalPrice: samplePrice * sampleQty, label: "Sample" };
    } else if (orderModalType === "bulk") {
      return calculateBulkPrice(bulkQty);
    }
    return null;
  }, [fabric, orderModalType, sampleQty, bulkQty]);

  // Handle order submit
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!fabric) return;
    
    setSubmitting(true);
    try {
      let enquiryData = {
        fabric_id: fabric.id,
        fabric_name: fabric.name,
        fabric_code: fabric.fabric_code,
        source: "fabric_detail_page",
        ...orderForm,
      };

      if (orderModalType === "sample") {
        enquiryData.enquiry_type = "sample_order";
        enquiryData.quantity_required = `${sampleQty} ${unit.plural} (sample)`;
        enquiryData.message = `Sample Order: ${sampleQty}${unit.short} × ₹${cartValue?.pricePerMeter?.toLocaleString()}${unit.priceLabel} = ₹${cartValue?.totalPrice?.toLocaleString()}\n\n${orderForm.message || ""}`;
      } else if (orderModalType === "bulk") {
        enquiryData.enquiry_type = "bulk_order";
        enquiryData.quantity_required = `${bulkQty} ${unit.plural}`;
        enquiryData.message = `Bulk Order: ${bulkQty}${unit.short} × ₹${cartValue?.pricePerMeter?.toLocaleString()}${unit.priceLabel} = ₹${cartValue?.totalPrice?.toLocaleString()}\n\n${orderForm.message || ""}`;
      }

      await createEnquiry(enquiryData);
      
      const successMsg = orderModalType === "sample" 
        ? "Sample order submitted! We'll contact you shortly." 
        : "Bulk order submitted! We'll contact you shortly.";
      toast.success(successMsg);
      setOrderModalType(null);
      setOrderForm({ name: "", email: "", phone: "", company: "", message: "" });
    } catch (err) {
      toast.error("Failed to submit order. Please try again.");
    }
    setSubmitting(false);
  };

  const openOrderModal = (type) => {
    setOrderModalType(type);
    setSampleQty(1);
    setBulkQty(fabric?.moq || "10");
    setOrderForm({ name: "", email: "", phone: "", gst_number: "" });
  };

  const closeOrderModal = () => {
    setOrderModalType(null);
  };

  const submitBookingEnquiry = async () => {
    if (!fabric) return;
    
    // Validate required fields
    if (!orderForm.name || !orderForm.email || !orderForm.phone) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    const qty = orderModalType === "sample" ? sampleQty : bulkQty;
    if (orderModalType === "bulk" && (!bulkQty || parseInt(bulkQty) <= 0)) {
      toast.error("Please enter a valid quantity");
      return;
    }
    
    setOrderSubmitting(true);
    try {
      const enquiryData = {
        name: orderForm.name,
        email: orderForm.email,
        phone: orderForm.phone,
        company: orderForm.gst_number, // Store GST in company field
        source: "instant_booking",
        enquiry_type: orderModalType === "sample" ? "sample_booking" : "bulk_booking",
        message: `**${orderModalType === "sample" ? "Sample" : "Bulk"} Booking Request**
Product: ${fabric.name}
Product ID: ${fabric.id}
Fabric Code: ${fabric.fabric_code || "N/A"}
Category: ${fabric.category_name || "N/A"}
Quantity: ${qty} ${unit.plural}
${cartValue ? `Price: ₹${cartValue.pricePerMeter?.toLocaleString()}${unit.priceLabel}` : ""}
${cartValue ? `Total: ₹${cartValue.totalPrice?.toLocaleString()} + GST` : ""}
GST Number: ${orderForm.gst_number || "Not provided"}`
      };

      await createEnquiry(enquiryData);
      
      toast.success(`${orderModalType === "sample" ? "Sample" : "Bulk"} booking enquiry submitted! We'll contact you shortly.`);
      closeOrderModal();
      setOrderForm({ name: "", email: "", phone: "", gst_number: "" });
    } catch (err) {
      toast.error("Failed to submit enquiry. Please try again.");
    }
    setOrderSubmitting(false);
  };

  const getAvailabilityBadge = (avail) => {
    switch (avail) {
      case "Sample":
        return "bg-blue-50 text-blue-700";
      case "Bulk":
        return "bg-emerald-50 text-emerald-700";
      case "On Request":
        return "bg-amber-50 text-amber-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  // Generate schema markup
  const generateSchemaMarkup = () => {
    if (!fabric) return null;
    
    const schemas = [];
    
    // Breadcrumb Schema
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": window.location.origin
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Fabrics",
          "item": `${window.location.origin}/fabrics`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": fabric.category_name,
          "item": `${window.location.origin}/fabrics`
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": fabric.name
        }
      ]
    };
    schemas.push(breadcrumbSchema);
    
    // Product Schema - Enhanced for rich snippets
    const productSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": fabric.name,
      "description": seoContent?.seo_intro || fabric.description || `${fabric.name} - ${fabric.composition?.map(c => `${c.percentage}% ${c.material}`).join(', ') || ''} fabric available for bulk and sample orders.`,
      "category": fabric.category_name,
      "brand": {
        "@type": "Brand",
        "name": "Locofast"
      },
      "manufacturer": {
        "@type": "Organization",
        "name": "Locofast"
      },
      "material": fabric.composition?.map(c => c.material).join(', ') || undefined,
      "color": fabric.color || undefined,
      "weight": fabric.gsm ? `${fabric.gsm} GSM` : (fabric.ounce ? `${fabric.ounce} oz` : undefined),
      "width": fabric.width ? `${fabric.width} inches` : undefined
    };
    
    if (fabric.images?.length > 0) {
      productSchema.image = fabric.images.map(img => 
        img.startsWith('http') ? img : `${window.location.origin}${img}`
      );
    }
    
    if (fabric.fabric_code) {
      productSchema.sku = fabric.fabric_code;
    }

    // Add offers/pricing if available
    if (fabric.sample_price || fabric.rate_per_meter) {
      productSchema.offers = {
        "@type": "Offer",
        "priceCurrency": "INR",
        "price": fabric.sample_price || fabric.rate_per_meter,
        "priceValidUntil": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        "availability": fabric.is_bookable && fabric.quantity_available > 0 
          ? "https://schema.org/InStock" 
          : "https://schema.org/PreOrder",
        "seller": {
          "@type": "Organization",
          "name": "Locofast"
        }
      };
    }

    // Add aggregate rating placeholder (can be populated if reviews exist)
    if (fabric.rating) {
      productSchema.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": fabric.rating,
        "reviewCount": fabric.review_count || 1
      };
    }
    
    schemas.push(productSchema);
    
    // FAQ Schema
    if (seoContent?.seo_faq?.length > 0) {
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": seoContent.seo_faq.map(faq => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
      };
      schemas.push(faqSchema);
    }
    
    return schemas;
  };

  if (loading) {
    return (
      <main className="pt-20 min-h-screen" data-testid="fabric-detail-loading">
        <div className="container-main py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
            <div className="aspect-square bg-gray-200 rounded" />
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 w-1/4 rounded" />
              <div className="h-10 bg-gray-200 w-3/4 rounded" />
              <div className="h-4 bg-gray-200 w-full rounded" />
              <div className="h-4 bg-gray-200 w-2/3 rounded" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!fabric) {
    return (
      <main className="pt-20 min-h-screen flex items-center justify-center" data-testid="fabric-not-found">
        <div className="text-center">
          <h1 className="text-2xl font-serif font-medium mb-4">Fabric not found</h1>
          <Link to="/fabrics" className="btn-primary">Back to Catalog</Link>
        </div>
      </main>
    );
  }

  const images = fabric.images.length > 0 ? fabric.images : ["https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800"];
  const schemaMarkup = generateSchemaMarkup();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{seoContent?.meta_title || `${fabric.name} | Locofast`}</title>
        <meta name="description" content={seoContent?.meta_description || fabric.description} />
        <link rel="canonical" href={seoContent?.canonical_url ? `https://locofast.com${seoContent.canonical_url}` : `https://locofast.com/fabrics/${fabric.id}`} />
        {seoContent?.is_indexed === false && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        {schemaMarkup && schemaMarkup.map((schema, idx) => (
          <script key={idx} type="application/ld+json">
            {JSON.stringify(schema)}
          </script>
        ))}
      </Helmet>

      <Navbar />
      
      {/* Zoom Modal */}
      {showZoom && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowZoom(false)}
          data-testid="zoom-modal"
        >
          <button
            onClick={() => setShowZoom(false)}
            className="absolute top-4 right-4 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Close zoom"
          >
            <X size={24} />
          </button>
          
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrentImage(currentImage === 0 ? images.length - 1 : currentImage - 1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCurrentImage(currentImage === images.length - 1 ? 0 : currentImage + 1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                aria-label="Next image"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
          
          <img
            src={images[currentImage]}
            alt={fabric.name}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {currentImage + 1} / {images.length}
          </div>
        </div>
      )}

      <main className="flex-grow pt-20" data-testid="fabric-detail-page">
        {/* Breadcrumb */}
        <div className="border-b border-neutral-100 bg-white">
          <div className="container-main py-4">
            <nav className="flex items-center gap-2 text-sm text-neutral-500">
              <Link to="/" className="hover:text-neutral-900">Home</Link>
              <span>/</span>
              <Link to="/fabrics" className="hover:text-neutral-900">Fabrics</Link>
              <span>/</span>
              <span className="text-neutral-900">{fabric.name}</span>
            </nav>
          </div>
        </div>

        <div className="container-main py-12">
          {/* Top Section: H1 + Intro */}
          <div className="mb-12">
            <h1 className="text-3xl md:text-4xl font-semibold mb-4" data-testid="fabric-h1">
              {seoContent?.seo_h1 || fabric.name}
            </h1>
            {(seoContent?.seo_intro || fabric.description) && (
              <div className="max-w-4xl" data-testid="seo-intro">
                <ExpandableText 
                  text={seoContent?.seo_intro || fabric.description} 
                  maxLines={2}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Image Gallery */}
            <div className="space-y-4" data-testid="fabric-images">
              {/* Main Image */}
              <div 
                className="aspect-square overflow-hidden bg-neutral-100 relative cursor-zoom-in group"
                onClick={() => setShowZoom(true)}
              >
                <img
                  src={selectedColorVariant >= 0 && fabric?.color_variants?.[selectedColorVariant]?.image_url ? fabric.color_variants[selectedColorVariant].image_url : images[currentImage]}
                  alt={`${fabric.name} - ${fabric.composition?.map(c => c.material).join(', ') || fabric.category_name} fabric${fabric.color ? ` in ${fabric.color}` : ''}${fabric.gsm ? `, ${fabric.gsm} GSM` : ''}`}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  data-testid="main-image"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600";
                  }}
                />
                
                {/* Zoom indicator */}
                <div className="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={18} className="text-gray-600" />
                </div>
                
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrentImage(currentImage === 0 ? images.length - 1 : currentImage - 1); }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white flex items-center justify-center rounded-full shadow-soft transition-colors"
                      data-testid="prev-image-btn"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrentImage(currentImage === images.length - 1 ? 0 : currentImage + 1); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white flex items-center justify-center rounded-full shadow-soft transition-colors"
                      data-testid="next-image-btn"
                      aria-label="Next image"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-3" data-testid="image-thumbnails">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setCurrentImage(idx); setSelectedColorVariant(-1); }}
                      className={`w-20 h-20 overflow-hidden border-2 transition-colors ${
                        currentImage === idx ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                      }`}
                      aria-label={`View image ${idx + 1} of ${images.length}`}
                    >
                      <img 
                        src={img} 
                        alt={`${fabric.name} thumbnail ${idx + 1}`} 
                        className="w-full h-full object-cover" 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600";
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Color Variant Swatches */}
              {fabric.has_multiple_colors && fabric.color_variants?.length > 0 && (
                <div data-testid="color-swatches">
                  <p className="text-sm font-medium text-gray-700 mb-2">Available Colors</p>
                  <div className="flex flex-wrap gap-2">
                    {fabric.color_variants.map((cv, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (cv.image_url) {
                            // Find if this image is already in the images array
                            const imgIdx = images.indexOf(cv.image_url);
                            if (imgIdx >= 0) {
                              setCurrentImage(imgIdx);
                            } else {
                              // Temporarily replace current image
                              setCurrentImage(0);
                              // We'll use a state to track selected color variant
                              setSelectedColorVariant(idx);
                            }
                          }
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                          selectedColorVariant === idx
                            ? "border-[#2563EB] bg-blue-50 shadow-sm"
                            : "border-gray-200 hover:border-gray-400"
                        }`}
                        data-testid={`color-swatch-${idx}`}
                        title={`${cv.color_name}${cv.quantity_available != null ? ` — ${cv.quantity_available} in stock` : ''}`}
                      >
                        <span
                          className="w-6 h-6 rounded-full border border-gray-300 flex-shrink-0"
                          style={{ backgroundColor: cv.color_hex || '#ccc' }}
                        />
                        <span className="text-sm font-medium text-gray-700">{cv.color_name}</span>
                        {cv.quantity_available != null && (
                          <span className="text-xs text-gray-400 ml-1">({cv.quantity_available}m)</span>
                        )}
                        {cv.sample_available && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Sample</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos Section */}
              {fabric.videos && fabric.videos.length > 0 && (
                <div className="mt-6" data-testid="fabric-videos">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Product Videos</h3>
                  <div className="space-y-4">
                    {fabric.videos.map((videoUrl, idx) => (
                      <div key={idx} className="rounded-lg overflow-hidden bg-black aspect-video">
                        {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                          <iframe
                            src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                            title={`${fabric.name} video ${idx + 1}`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : videoUrl.includes('vimeo.com') ? (
                          <iframe
                            src={videoUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
                            title={`${fabric.name} video ${idx + 1}`}
                            className="w-full h-full"
                            allow="autoplay; fullscreen; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <video
                            src={videoUrl}
                            controls
                            className="w-full h-full"
                            preload="metadata"
                          >
                            Your browser does not support the video tag.
                          </video>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Details */}
            <div data-testid="fabric-details">
              <div className="mb-6">
                <p className="subheading mb-2">{fabric.category_name}</p>
                <div className="flex items-center gap-3 flex-wrap mb-4">
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="border-t border-gray-100 pt-6 mb-6" data-testid="fabric-specs">
                <h2 className="text-lg font-semibold mb-4">Technical Specifications</h2>
                <div className="grid grid-cols-2 gap-4">
                  {fabric.fabric_type && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Fabric Type</p>
                      <p className="font-medium capitalize">{fabric.fabric_type}</p>
                    </div>
                  )}
                  {Array.isArray(fabric.composition) && fabric.composition.length > 0 && fabric.composition.some(c => c.material) && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Composition</p>
                      <p className="font-medium">
                        {fabric.composition.filter(c => c.material && c.percentage > 0).map(c => `${c.percentage}% ${c.material}`).join(', ')}
                      </p>
                    </div>
                  )}
                  {((fabric.weight_unit === 'ounce' && fabric.ounce) || (fabric.weight_unit !== 'ounce' && fabric.gsm)) && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">
                        {fabric.weight_unit === 'ounce' ? 'Weight (Ounce)' : 'GSM'}
                      </p>
                      <p className="font-medium tech-data">
                        {fabric.weight_unit === 'ounce' ? fabric.ounce : fabric.gsm}
                      </p>
                    </div>
                  )}
                  {fabric.width && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Width</p>
                      <p className="font-medium">{fabric.width}</p>
                    </div>
                  )}
                  {fabric.color && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Color</p>
                      <p className="font-medium">{fabric.color}</p>
                    </div>
                  )}
                  {fabric.finish && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Finish</p>
                      <p className="font-medium">{fabric.finish}</p>
                    </div>
                  )}
                  {fabric.moq && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">MOQ</p>
                      <p className="font-medium">{fabric.moq}</p>
                    </div>
                  )}
                  {fabric.starting_price && (
                    <div className="border-b border-gray-100 pb-3">
                      <p className="text-xs text-gray-400 mb-1">Starting Price</p>
                      <p className="font-medium text-[#2563EB]">{fabric.starting_price}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Description - Expandable for long text */}
              {fabric.description && (
                <div className="border-t border-gray-100 pt-6 mb-6" data-testid="fabric-description">
                  <h2 className="text-lg font-semibold mb-4">Product Description</h2>
                  <ExpandableText 
                    text={fabric.description} 
                    maxLines={2}
                  />
                </div>
              )}

              {/* CTA - Contextual Buttons */}
              <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mb-8">
                {/* Pricing Info */}
                {actions.canBookSample && (
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                    <div>
                      <p className="text-sm text-gray-500">Sample Price</p>
                      <p className="text-2xl font-bold text-emerald-600">₹{actions.samplePrice?.toLocaleString()}<span className="text-sm font-normal text-gray-500">{unit.priceLabel}</span></p>
                    </div>
                    {fabric.quantity_available > 0 && (
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Total Available</p>
                        <p className="text-lg font-semibold text-gray-900">{fabric.quantity_available?.toLocaleString()}{unit.short}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {actions.hasTiers && (
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <p className="text-sm text-gray-500 mb-2">Bulk Pricing Available</p>
                    <div className="flex flex-wrap gap-2">
                      {fabric.pricing_tiers?.slice(0, 3).map((tier, idx) => (
                        <span key={idx} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                          {tier.min_qty}-{tier.max_qty}{unit.short}: ₹{tier.price_per_meter}{unit.priceLabel}
                        </span>
                      ))}
                      {fabric.pricing_tiers?.length > 3 && (
                        <span className="text-xs text-gray-500">+{fabric.pricing_tiers.length - 3} more tiers</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Delivery Timeline */}
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    <Truck size={18} className="text-emerald-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Estimated Delivery</p>
                      <div className="text-sm text-gray-600 mt-1 space-y-1">
                        {/* Stock Type Badge */}
                        <div className="mb-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            fabric.stock_type === 'made_to_order' 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {fabric.stock_type === 'made_to_order' ? 'Made to Order' : 'Ready Stock'}
                          </span>
                        </div>
                        <p>
                          <span className="font-medium">Samples:</span>{' '}
                          {fabric.sample_delivery_days 
                            ? `${fabric.sample_delivery_days} days`
                            : (fabric.stock_type === 'made_to_order' ? '7-10 days' : '1-3 days')}
                        </p>
                        {actions.canBookBulk && (
                          <p>
                            <span className="font-medium">Bulk Orders:</span>{' '}
                            {fabric.bulk_delivery_days 
                              ? `${fabric.bulk_delivery_days} days`
                              : (fabric.stock_type === 'made_to_order' ? '15-25 days' : '15-20 days')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="font-medium mb-2 text-gray-900">Interested in this fabric?</p>
                <p className="text-sm text-gray-500 mb-4">
                  {actions.canBookBulk ? "Order samples or bulk quantities directly" : "Get pricing, samples, and availability information"}
                </p>
                
                <div className="flex flex-col gap-3">
                  {actions.canBookBulk && (
                    <div>
                      <button
                        onClick={() => { setOrderModalType("bulk"); setBulkQty(fabric.moq || "100"); setShowBookModal(true); }}
                        className="w-full bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors inline-flex items-center justify-center gap-2"
                        data-testid="book-bulk-btn"
                      >
                        <ShoppingCart size={18} />
                        Book Bulk Now
                      </button>
                      <p className="text-xs text-emerald-600 text-center mt-1.5 font-medium">Dispatch in 1-2 days (standard shipping timelines apply)</p>
                    </div>
                  )}
                  {actions.canBookSample && (
                    <button
                      onClick={() => { setOrderModalType("sample"); setSampleQty(1); setShowBookModal(true); }}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2"
                      data-testid="book-sample-btn"
                    >
                      <Package size={18} />
                      Book Sample (1-5m)
                    </button>
                  )}
                  <button
                    onClick={() => { trackRFQIntent(fabric.name, 'fabric_detail'); setShowRfqModal(true); }}
                    className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
                    data-testid="enquiry-btn"
                  >
                    <MessageSquare size={18} />
                    Request a Quote
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Applications / Use Cases */}
          {seoContent?.seo_applications?.length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="seo-applications">
              <h2 className="text-2xl font-semibold mb-6">Applications & Use Cases</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {seoContent.seo_applications.map((app, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 p-4 rounded-lg text-center">
                    <p className="text-gray-700 font-medium">{app}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Order Details */}
          {seoContent?.seo_bulk_details && Object.keys(seoContent.seo_bulk_details).length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="bulk-details">
              <h2 className="text-2xl font-semibold mb-6">Bulk Order Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white border border-gray-100 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Package size={20} className="text-[#2563EB]" />
                    <p className="text-xs text-gray-400 uppercase tracking-wide">MOQ</p>
                  </div>
                  <p className="font-semibold text-gray-900">{seoContent.seo_bulk_details.moq}</p>
                </div>
                <div className="bg-white border border-gray-100 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Truck size={20} className="text-[#2563EB]" />
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Lead Time</p>
                  </div>
                  <p className="font-semibold text-gray-900">{seoContent.seo_bulk_details.lead_time}</p>
                </div>
                <div className="bg-white border border-gray-100 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <FileCheck size={20} className="text-[#2563EB]" />
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Sampling</p>
                  </div>
                  <p className="font-semibold text-gray-900">{seoContent.seo_bulk_details.sampling}</p>
                </div>
                <div className="bg-white border border-gray-100 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <MapPin size={20} className="text-[#2563EB]" />
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Dispatch</p>
                  </div>
                  <p className="font-semibold text-gray-900">{seoContent.seo_bulk_details.dispatch_region}</p>
                </div>
              </div>
            </div>
          )}

          {/* Why This Fabric */}
          {seoContent?.seo_why_fabric?.length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="why-fabric">
              <h2 className="text-2xl font-semibold mb-6">Why This Fabric</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {seoContent.seo_why_fabric.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-white border border-gray-100 p-4 rounded-lg">
                    <CheckCircle2 size={20} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">{bullet}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How Ordering Works - Static Component */}
          <div className="border-t border-gray-200 pt-12 mt-12" data-testid="how-ordering-works">
            <h2 className="text-2xl font-semibold mb-6">How Ordering Works</h2>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-[#2563EB]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#2563EB] font-bold">1</span>
                </div>
                <h3 className="font-medium mb-2">Submit Requirement</h3>
                <p className="text-sm text-gray-500">Share your fabric needs and quantity requirements</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#2563EB]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#2563EB] font-bold">2</span>
                </div>
                <h3 className="font-medium mb-2">Get Quote</h3>
                <p className="text-sm text-gray-500">Receive pricing and availability within 24 hours</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#2563EB]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#2563EB] font-bold">3</span>
                </div>
                <h3 className="font-medium mb-2">Sample Review</h3>
                <p className="text-sm text-gray-500">Request samples to verify quality before bulk order</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#2563EB]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#2563EB] font-bold">4</span>
                </div>
                <h3 className="font-medium mb-2">Place Order</h3>
                <p className="text-sm text-gray-500">Confirm order with secure payment and tracking</p>
              </div>
            </div>
          </div>

          {/* Other Sellers — Compare Prices */}
          {otherSellers.length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="other-sellers">
              <h2 className="text-2xl font-semibold mb-2">Compare Prices</h2>
              <p className="text-gray-500 text-sm mb-6">{otherSellers.length} other option{otherSellers.length > 1 ? 's' : ''} available for this fabric</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Price</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">MOQ</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Delivery</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {otherSellers.map((s) => (
                      <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          {s.rate_per_meter ? (
                            <span className="font-semibold text-emerald-700">₹{s.rate_per_meter}/{s.category_id === 'cat-knits' ? 'kg' : 'm'}</span>
                          ) : (
                            <span className="text-sm text-gray-400">On request</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.moq || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.dispatch_timeline || s.bulk_delivery_days || '—'}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/fabrics/${s.slug || s.id}`}
                            className="text-sm font-medium text-[#2563EB] hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Related Fabrics */}
          {relatedFabrics.length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="related-fabrics">
              <h2 className="text-2xl font-semibold mb-6">Related Fabrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {relatedFabrics.map((related) => (
                  <Link
                    key={related.id}
                    to={`/fabrics/${related.slug || related.id}`}
                    className="bg-white border border-gray-100 rounded-lg overflow-hidden hover:border-[#2563EB] transition-colors group"
                  >
                    <div className="aspect-square bg-gray-100 overflow-hidden">
                      {related.images?.[0] ? (
                        <img
                          src={related.images[0]}
                          alt={related.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm text-gray-900 truncate">{related.name}</p>
                      <p className="text-xs text-gray-500">
                        {related.gsm ? `${related.gsm} GSM` : related.ounce ? `${related.ounce} oz` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* FAQ Section */}
          {seoContent?.seo_faq?.length > 0 && (
            <div className="border-t border-gray-200 pt-12 mt-12" data-testid="faq-section">
              <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
              <div className="space-y-4 max-w-3xl">
                {seoContent.seo_faq.map((faq, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded-lg p-5">
                    <h3 className="font-medium text-gray-900 mb-2">{faq.question}</h3>
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final CTA */}
          <div className="border-t border-gray-200 pt-12 mt-12 text-center" data-testid="final-cta">
            <h2 className="text-2xl font-semibold mb-4">Ready to Source This Fabric?</h2>
            <p className="text-gray-500 mb-6 max-w-xl mx-auto">
              Get in touch with our sourcing team for pricing, samples, and availability. We respond within 24 hours.
            </p>
            <button
              onClick={() => setShowRfqModal(true)}
              className="btn-primary inline-flex items-center gap-2"
              data-testid="final-cta-rfq-btn"
            >
              <Send size={18} />
              Request a Quote
            </button>
          </div>

          {/* Internal Links */}
          <div className="border-t border-gray-200 pt-8 mt-12">
            <div className="flex flex-wrap gap-4 text-sm">
              <Link to="/fabrics" className="text-[#2563EB] hover:underline">← All Fabrics</Link>
              <Link to="/fabrics/" className="text-[#2563EB] hover:underline">Browse by Category</Link>
              <Link to="/rfq" className="text-[#2563EB] hover:underline">Request a Quote</Link>
            </div>
          </div>
        </div>

        {/* RFQ Modal - Same flow as homepage and header, with fabric URL */}
        <RFQModal 
          open={showRfqModal} 
          onClose={() => setShowRfqModal(false)} 
          fabricUrl={`${window.location.origin}/fabrics/${fabric.id}`}
          fabricName={fabric.name}
        />

        {/* Order Modal (Sample/Bulk) - Simple Enquiry Form */}
        {orderModalType && !showBookModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeOrderModal}>
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {orderModalType === "sample" ? "Book Sample" : "Book Bulk Order"}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">{fabric.name}</p>
                  </div>
                  <button onClick={closeOrderModal} className="p-2 hover:bg-gray-100 rounded-full">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Product Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex gap-4">
                    <img
                      src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"}
                      alt={fabric.name}
                      className="w-20 h-20 object-cover rounded"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{fabric.name}</p>
                      <p className="text-sm text-gray-600">{fabric.category_name}</p>
                      <p className="text-xs text-gray-500 mt-1">Product ID: {fabric.id.substring(0, 8)}...</p>
                      {fabric.fabric_code && (
                        <p className="text-xs text-gray-500">Code: {fabric.fabric_code}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quantity Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  {orderModalType === "sample" ? (
                    <select
                      value={sampleQty}
                      onChange={(e) => setSampleQty(parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      data-testid="detail-sample-qty"
                    >
                      {[1, 2, 3, 4, 5].map((qty) => (
                        <option key={qty} value={qty}>{qty} {unit.singular}{qty > 1 && unit.singular !== 'kg' ? "s" : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={bulkQty}
                      onChange={(e) => setBulkQty(e.target.value)}
                      placeholder={`Enter quantity in ${unit.plural}`}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      data-testid="detail-bulk-qty"
                    />
                  )}
                </div>

                {/* Price Summary */}
                {cartValue && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-blue-700">
                          {orderModalType === "sample" ? `${sampleQty} ${unit.singular}${sampleQty > 1 && unit.singular !== 'kg' ? "s" : ""}` : `${bulkQty} ${unit.plural}`}
                        </p>
                        <p className="text-xs text-blue-600">@ ₹{cartValue.pricePerMeter?.toLocaleString()}{unit.priceLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-900">₹{cartValue.totalPrice?.toLocaleString()}</p>
                        <p className="text-xs text-blue-600">+ 5% GST</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Form */}
                <div className="space-y-4 pt-2">
                  <p className="text-sm font-medium text-gray-700">Your Details</p>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Name *</label>
                    <input
                      type="text"
                      value={orderForm.name}
                      onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })}
                      placeholder="Your full name"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      required
                      data-testid="booking-name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={orderForm.email}
                      onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      required
                      data-testid="booking-email"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      value={orderForm.phone}
                      onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })}
                      placeholder="9876543210"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      required
                      data-testid="booking-phone"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">GST Number (Optional)</label>
                    <input
                      type="text"
                      value={orderForm.gst_number}
                      onChange={(e) => setOrderForm({ ...orderForm, gst_number: e.target.value })}
                      placeholder="22AAAAA0000A1Z5"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      data-testid="booking-gst"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeOrderModal}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitBookingEnquiry}
                    disabled={orderSubmitting || !orderForm.name || !orderForm.email || !orderForm.phone}
                    className="flex-1 py-3 rounded-lg font-medium disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700"
                    data-testid="submit-booking-btn"
                  >
                    {orderSubmitting ? "Submitting..." : "Submit Enquiry"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quantity Picker Modal */}
      {showBookModal && orderModalType && fabric && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBookModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="book-modal">
            <h3 className="text-lg font-semibold mb-1">
              {orderModalType === "sample" ? "Book Sample" : "Book Bulk Order"}
            </h3>
            <p className="text-sm text-gray-500 mb-5">{fabric.name}</p>

            {orderModalType === "bulk" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity ({unit.plural})
                  </label>
                  <input
                    type="number"
                    value={bulkQty}
                    onChange={(e) => setBulkQty(e.target.value)}
                    min={fabric.moq || 1}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-semibold focus:border-emerald-500 focus:outline-none"
                    placeholder={`Min ${fabric.moq || 100}`}
                    autoFocus
                    data-testid="bulk-qty-input"
                  />
                  {fabric.moq && <p className="text-xs text-gray-400 mt-1">Minimum order: {fabric.moq}</p>}
                </div>
                {bulkPrice && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Rate</span>
                      <span className="font-medium">₹{bulkPrice.pricePerMeter}/{unit.short}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tier</span>
                      <span className="text-xs text-gray-400">{bulkPrice.tierLabel}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Estimated Total</span>
                      <span className="text-emerald-600">₹{bulkPrice.totalPrice?.toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {fabric.quantity_available > 0 && (
                  <p className="text-xs text-gray-400">Available stock: {fabric.quantity_available?.toLocaleString()} {unit.plural}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sample Quantity ({getUnit(fabric).plural})
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setSampleQty(q)}
                        className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${sampleQty === q ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                        data-testid={`sample-qty-${q}`}
                      >
                        {q}{unit.short}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between font-semibold">
                    <span>Sample Price</span>
                    <span className="text-blue-600">₹{((actions.samplePrice || 0) * sampleQty).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowBookModal(false)} className="flex-1 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
              <button
                onClick={() => {
                  const qty = orderModalType === "sample" ? sampleQty : parseInt(bulkQty) || fabric.moq || 100;
                  const price = orderModalType === "sample" ? (actions.samplePrice || 0) : (fabric.rate_per_meter || 0);
                  trackAddToCart(fabric, orderModalType, qty, price);
                  navigate(`/checkout/?fabric_id=${fabric.id}&type=${orderModalType}&qty=${qty}`);
                }}
                disabled={orderModalType === "bulk" && (!bulkQty || parseInt(bulkQty) < 1)}
                className={`flex-1 px-4 py-3 text-white rounded-lg font-medium text-sm disabled:opacity-50 ${orderModalType === "sample" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                data-testid="proceed-checkout-btn"
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default FabricDetailPage;
