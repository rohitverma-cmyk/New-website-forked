import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Truck, CreditCard, CheckCircle2, AlertCircle, Loader2, Package, Tag, Wallet } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getFabric, createOrder, verifyPayment, sendOrderConfirmation, validateCoupon, getCreditBalance } from "../lib/api";
import { trackBeginCheckout } from "../lib/analytics";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Helper function to get unit based on fabric type
const getUnit = (fabric) => {
  if (!fabric) return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
  // Knitted fabrics use kg for bulk
  if (fabric.fabric_type === 'knitted') {
    return { singular: 'kg', plural: 'kg', short: 'kg', priceLabel: '/kg' };
  }
  return { singular: 'meter', plural: 'meters', short: 'm', priceLabel: '/m' };
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get params from URL
  const fabricId = searchParams.get("fabric_id");
  const orderType = searchParams.get("type") || "bulk"; // sample or bulk
  const quantity = parseInt(searchParams.get("qty") || "1");
  
  // Agent-assisted booking params
  const sharedCartToken = searchParams.get("shared_cart") || "";
  const agentId = searchParams.get("agent_id") || "";
  const agentEmail = searchParams.get("agent_email") || "";
  const agentName = searchParams.get("agent_name") || "";
  
  const [fabric, setFabric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  
  // Customer form
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    city: "",
    state: "",
    pincode: ""
  });
  const [notes, setNotes] = useState("");
  
  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  
  // Pricing
  const [pricePerMeter, setPricePerMeter] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [logistics, setLogistics] = useState(0);
  const [packagingCharge, setPackagingCharge] = useState(0);
  const [logisticsCharge, setLogisticsCharge] = useState(0);
  const [logisticsPerMeter, setLogisticsPerMeter] = useState(0);
  const [total, setTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("razorpay"); // razorpay or credit
  const [creditBalance, setCreditBalance] = useState(null); // { balance, credit_limit, has_credit }

  // GST verification
  const [gstNumber, setGstNumber] = useState("");
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstResult, setGstResult] = useState(null);
  const [gstAddress, setGstAddress] = useState(null);

  // Shipping address toggle
  const [useGstAddress, setUseGstAddress] = useState(true);
  const { customer: loggedInCustomer, isLoggedIn } = useCustomerAuth();

  // Auto-fill from customer profile
  useEffect(() => {
    if (isLoggedIn && loggedInCustomer) {
      setCustomer(prev => ({
        ...prev,
        name: loggedInCustomer.name || prev.name,
        email: loggedInCustomer.email || prev.email,
        phone: loggedInCustomer.phone || prev.phone,
        company: loggedInCustomer.company || prev.company,
        address: loggedInCustomer.address || prev.address,
        city: loggedInCustomer.city || prev.city,
        state: loggedInCustomer.state || prev.state,
        pincode: loggedInCustomer.pincode || prev.pincode,
      }));
      if (loggedInCustomer.email) {
        getCreditBalance(loggedInCustomer.email).then(res => {
          setCreditBalance(res.data);
          if (res.data?.has_credit) setPaymentMethod("credit");
        }).catch(() => {});
      }
    }
  }, [isLoggedIn, loggedInCustomer]);

  const verifyGst = async (gstin) => {
    const cleaned = gstin.trim().toUpperCase();
    if (cleaned.length !== 15 || gstVerifying) return;
    setGstVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/gst/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: cleaned })
      });
      const data = await res.json();
      setGstResult(data);
      if (data.valid) {
        const addr = { address: data.address || '', city: data.city || '', state: data.state || '', pincode: data.pincode || '' };
        setGstAddress(addr);
        setCustomer(prev => ({
          ...prev,
          company: data.trade_name || data.legal_name || prev.company,
          ...(useGstAddress ? addr : {}),
        }));
        toast.success("GST verified — company details auto-filled");
      }
    } catch {
      setGstResult({ valid: false, message: "Verification failed" });
    }
    setGstVerifying(false);
  };

  useEffect(() => {
    if (!fabricId) {
      toast.error("No fabric selected");
      navigate("/fabrics");
      return;
    }
    
    fetchFabric();
  }, [fabricId]);

  useEffect(() => {
    if (fabric) {
      calculatePricing();
    }
  }, [fabric, quantity, orderType, discount]);

  const fetchFabric = async () => {
    try {
      const res = await getFabric(fabricId);
      setFabric(res.data);
      // GA4: track begin_checkout when fabric loads
      if (res.data) {
        trackBeginCheckout(res.data, orderType, quantity, res.data.rate_per_meter ? res.data.rate_per_meter * quantity : 0);
      }
    } catch (err) {
      toast.error("Failed to load fabric details");
      navigate("/fabrics");
    }
    setLoading(false);
  };

  const calculatePricing = () => {
    if (!fabric) return;
    
    let price = 0;
    
    if (orderType === "sample") {
      price = fabric.sample_price || fabric.rate_per_meter || 0;
    } else {
      // Find applicable tier
      const tiers = fabric.pricing_tiers || [];
      for (const tier of tiers) {
        if (quantity >= tier.min_qty && quantity <= tier.max_qty) {
          price = tier.price_per_meter;
          break;
        }
      }
      if (!price) {
        price = fabric.rate_per_meter || 0;
      }
    }
    
    const sub = price * quantity;
    const taxAmount = sub * 0.05; // 5% GST
    
    // Logistics calculation
    let totalLogistics = 0;
    let packaging = 0;
    let logisticsOnly = 0;
    if (orderType === "sample") {
      totalLogistics = 100; // Flat Rs 100 for samples
    } else {
      // Total = max(3% of cart value, Rs 3000)
      totalLogistics = Math.max(sub * 0.03, 3000);
      // Packaging = Rs 1/meter (or kg for knitted)
      packaging = quantity * 1;
      // Logistics = Total - Packaging (ensure non-negative)
      logisticsOnly = Math.max(0, totalLogistics - packaging);
    }
    const logisticsPerUnit = quantity > 0 ? totalLogistics / quantity : 0;
    
    const finalTotal = sub + taxAmount + totalLogistics - discount;
    
    setPricePerMeter(price);
    setSubtotal(sub);
    setTax(taxAmount);
    setLogistics(totalLogistics);
    setPackagingCharge(packaging);
    setLogisticsCharge(logisticsOnly);
    setLogisticsPerMeter(logisticsPerUnit);
    setTotal(Math.max(0, finalTotal));
  };

  // Apply coupon
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Please enter a coupon code");
      return;
    }
    
    setCouponLoading(true);
    setCouponError("");
    
    try {
      const response = await validateCoupon(couponCode, subtotal);
      if (response.data.valid) {
        setAppliedCoupon(response.data.coupon);
        setDiscount(response.data.discount_amount);
        toast.success(`Coupon applied! You saved ₹${response.data.discount_amount.toLocaleString()}`);
      } else {
        setCouponError(response.data.message || "Invalid coupon");
        setAppliedCoupon(null);
        setDiscount(0);
      }
    } catch (err) {
      setCouponError(err.response?.data?.detail || "Failed to validate coupon");
      setAppliedCoupon(null);
      setDiscount(0);
    }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setDiscount(0);
    setCouponCode("");
    setCouponError("");
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setPaymentError(null);

    try {
      // Create order data
      const orderData = {
        items: [{
          fabric_id: fabric.id,
          fabric_name: fabric.name,
          fabric_code: fabric.fabric_code || "",
          category_name: fabric.category_name || "",
          seller_company: fabric.seller_company || "",
          seller_id: fabric.seller_id || "",
          quantity: quantity,
          price_per_meter: pricePerMeter,
          order_type: orderType,
          image_url: fabric.images?.[0] || "",
          hsn_code: fabric.hsn_code || "",
          dispatch_timeline: fabric.dispatch_timeline || (orderType === 'bulk' ? '15-20 days' : 'Ready Stock')
        }],
        customer: { ...customer, gst_number: gstNumber },
        notes: notes,
        logistics_charge: logistics,
        packaging_charge: packagingCharge,
        logistics_only_charge: logisticsCharge,
        payment_method: paymentMethod,
        agent_id: agentId,
        agent_email: agentEmail,
        agent_name: agentName,
        shared_cart_token: sharedCartToken,
        coupon: appliedCoupon ? {
          code: appliedCoupon.code,
          discount_type: appliedCoupon.discount_type,
          discount_value: appliedCoupon.discount_value,
          discount_amount: discount
        } : null,
        discount: discount
      };

      // CREDIT payment path — instant confirmation, no Razorpay
      if (paymentMethod === 'credit') {
        if (!creditBalance?.has_credit || creditBalance.balance < total) {
          toast.error("Insufficient credit balance");
          setSubmitting(false);
          return;
        }
        const response = await createOrder(orderData);
        const orderInfo = response.data;
        toast.success("Order placed via Locofast Credit!");
        navigate(`/order-confirmation/${orderInfo.order_number}`);
        return;
      }

      // RAZORPAY payment path
      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Failed to load payment gateway");
      }

      const response = await createOrder(orderData);
      const orderInfo = response.data;

      // Open Razorpay checkout
      const options = {
        key: orderInfo.razorpay_key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: orderInfo.amount_paise,
        currency: orderInfo.currency,
        name: "Locofast",
        description: `${orderType === "sample" ? "Sample" : "Bulk"} Order - ${fabric.name}`,
        order_id: orderInfo.razorpay_order_id,
        handler: async function (response) {
          // Verify payment
          try {
            const verifyResponse = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if (verifyResponse.data.success) {
              // Send confirmation email (best effort)
              try {
                await sendOrderConfirmation(orderInfo.order_id);
              } catch (emailErr) {
                console.warn("Email sending failed:", emailErr);
              }
              
              // Redirect to confirmation page
              toast.success("Payment successful!");
              navigate(`/order-confirmation/${orderInfo.order_number}`);
            }
          } catch (err) {
            setPaymentError({ message: "Payment verification failed. Please contact support at mail@locofast.com", code: "VERIFY_FAILED" });
            toast.error("Payment verification failed");
          }
        },
        prefill: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone
        },
        notes: {
          order_id: orderInfo.order_id,
          fabric_name: fabric.name
        },
        theme: {
          color: "#2563EB"
        },
        modal: {
          ondismiss: function() {
            setSubmitting(false);
            toast.info("Payment cancelled");
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response) {
        const error = response.error || {};
        const errorCode = error.code || 'UNKNOWN';
        const errorSource = error.source || '';
        const errorStep = error.step || '';
        const errorReason = error.reason || '';
        const errorDesc = error.description || 'Payment failed';
        
        // Build detailed error message
        let userMessage = errorDesc;
        if (errorReason && errorReason !== errorDesc) {
          userMessage = `${errorDesc} (${errorReason.replace(/_/g, ' ')})`;
        }
        
        // Log full details for debugging
        console.error('Payment failed:', { code: errorCode, source: errorSource, step: errorStep, reason: errorReason, description: errorDesc });
        
        setPaymentError({
          message: userMessage,
          code: errorCode,
          source: errorSource,
          reason: errorReason,
          step: errorStep,
          paymentId: error.metadata?.payment_id || '',
          orderId: error.metadata?.order_id || ''
        });
        setSubmitting(false);
      });
      razorpay.open();

    } catch (err) {
      console.error("Checkout error:", err);
      // Show more detailed error message
      const errorMessage = err.response?.data?.detail 
        || err.response?.data?.message 
        || err.message 
        || "Failed to initiate payment";
      setPaymentError({ message: errorMessage, code: "INIT_FAILED" });
      toast.error(errorMessage);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </main>
      </div>
    );
  }

  if (!fabric) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-grow pt-20" data-testid="checkout-page">
        <div className="container-main py-8">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <h1 className="text-3xl font-semibold mb-8">Checkout</h1>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Order Summary Card */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShoppingCart size={20} />
                    Order Summary
                  </h2>
                  
                  <div className="flex gap-4">
                    <img
                      src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200"}
                      alt={fabric.name}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{fabric.name}</h3>
                      <p className="text-sm text-gray-600">{fabric.category_name}</p>
                      {fabric.seller_company && (
                        <p className="text-sm text-gray-500">by {fabric.seller_company}</p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          orderType === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {orderType === "sample" ? "Sample Order" : "Bulk Order"}
                        </span>
                        <span className="text-gray-600">{quantity} {getUnit(fabric).plural}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Estimated Delivery Timeline */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-2 text-sm">
                      <Truck size={16} className="text-emerald-600 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-600">Estimated Delivery:</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            fabric.stock_type === 'made_to_order' 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {fabric.stock_type === 'made_to_order' ? 'Made to Order' : 'Ready Stock'}
                          </span>
                        </div>
                        <span className="font-medium text-gray-900">
                          {orderType === 'sample' 
                            ? (fabric.sample_delivery_days ? `${fabric.sample_delivery_days} days` : (fabric.stock_type === 'made_to_order' ? '7-10 days' : '1-3 days'))
                            : (fabric.bulk_delivery_days ? `${fabric.bulk_delivery_days} days` : (fabric.stock_type === 'made_to_order' ? '15-25 days' : '15-20 days'))
                          }
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {fabric.stock_type === 'made_to_order' 
                            ? 'Production starts after order confirmation. Our team will share exact timeline.'
                            : 'Delivery time depends on your location. Our team will confirm exact timeline post order.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billing & GST */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CreditCard size={20} />
                    Billing Details
                  </h2>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input type="text" required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="Amit Sharma" data-testid="checkout-name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input type="email" required value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                        onBlur={async (e) => {
                          const email = e.target.value;
                          if (email && email.includes('@')) {
                            try { const res = await getCreditBalance(email); setCreditBalance(res.data); if (res.data.has_credit) setPaymentMethod("credit"); } catch { setCreditBalance(null); }
                          }
                        }}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="you@company.com" data-testid="checkout-email" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                      <input type="tel" required value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="+91 98765 43210" data-testid="checkout-phone" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                      <div className="relative">
                        <input
                          type="text"
                          maxLength={15}
                          value={gstNumber}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            setGstNumber(v);
                            if (v.length === 15) verifyGst(v);
                            else setGstResult(null);
                          }}
                          className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none pr-10 ${gstResult?.valid ? 'border-emerald-500 bg-emerald-50/30' : gstResult?.valid === false ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
                          placeholder="22AAAAA0000A1Z5"
                          data-testid="checkout-gst"
                        />
                        {gstVerifying && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />}
                        {gstResult?.valid && <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                        {gstResult?.valid === false && <AlertCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
                      </div>
                      {gstResult?.valid && <p className="text-xs text-emerald-600 mt-1">{gstResult.trade_name || gstResult.legal_name}</p>}
                      {gstResult?.valid === false && <p className="text-xs text-red-500 mt-1">{gstResult.message || 'Invalid GST'}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                      <input type="text" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none bg-gray-50" placeholder="Auto-filled from GST" data-testid="checkout-company" />
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Truck size={20} />
                    Shipping Address
                  </h2>

                  {gstAddress && (
                    <div className="mb-4 space-y-2">
                      <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer ${useGstAddress ? 'border-[#2563EB] bg-blue-50/30' : 'border-gray-200'}`}>
                        <input type="radio" name="addressType" checked={useGstAddress} onChange={() => { setUseGstAddress(true); setCustomer(prev => ({ ...prev, ...gstAddress })); }} />
                        <div>
                          <p className="font-medium text-sm">GST Registered Address</p>
                          <p className="text-xs text-gray-500">{[gstAddress.address, gstAddress.city, gstAddress.state, gstAddress.pincode].filter(Boolean).join(', ')}</p>
                        </div>
                      </label>
                      <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer ${!useGstAddress ? 'border-[#2563EB] bg-blue-50/30' : 'border-gray-200'}`}>
                        <input type="radio" name="addressType" checked={!useGstAddress} onChange={() => { setUseGstAddress(false); setCustomer(prev => ({ ...prev, address: '', city: '', state: '', pincode: '' })); }} />
                        <div>
                          <p className="font-medium text-sm">Ship to a Different Address</p>
                          <p className="text-xs text-gray-500">Enter a custom shipping address below</p>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className={`grid md:grid-cols-2 gap-4 ${gstAddress && useGstAddress ? 'opacity-60 pointer-events-none' : ''}`}>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                      <input type="text" required value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="Street address, building, floor" data-testid="checkout-address" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <input type="text" required value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="Mumbai" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <input type="text" required value={customer.state} onChange={(e) => setCustomer({ ...customer, state: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="Maharashtra" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code *</label>
                      <input type="text" required maxLength={6} value={customer.pincode} onChange={(e) => setCustomer({ ...customer, pincode: e.target.value.replace(/\D/g, '') })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="400001" data-testid="checkout-pincode" />
                    </div>
                  </div>
                </div>

                {/* Logistics - Free */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Truck size={20} />
                    Logistics
                  </h2>
                  <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-600" size={20} />
                      <div>
                        <p className="font-medium text-gray-900">Free Delivery</p>
                        <p className="text-sm text-gray-600">
                          Logistics charges included in the price
                        </p>
                      </div>
                    </div>
                    <span className="font-semibold text-emerald-600">FREE</span>
                  </div>
                </div>

                {/* Coupon Code */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Tag size={20} />
                    Have a Coupon?
                  </h2>
                  
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="text-emerald-600" size={20} />
                        <div>
                          <p className="font-medium text-gray-900">{appliedCoupon.code}</p>
                          <p className="text-sm text-emerald-600">
                            You saved ₹{discount.toLocaleString()}!
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="Enter coupon code"
                          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none uppercase"
                          data-testid="coupon-input"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading}
                          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                          data-testid="apply-coupon-btn"
                        >
                          {couponLoading ? <Loader2 className="animate-spin" size={18} /> : "Apply"}
                        </button>
                      </div>
                      {couponError && (
                        <p className="mt-2 text-sm text-red-600">{couponError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Additional Notes */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h2 className="text-lg font-semibold mb-4">Additional Notes</h2>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                    placeholder="Any special instructions or requirements..."
                  />
                </div>

                {/* Payment Error */}
                {paymentError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="payment-error">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="font-medium text-red-800">Payment Failed</p>
                        <p className="text-sm text-red-600 mt-1">{typeof paymentError === 'string' ? paymentError : paymentError.message}</p>
                        
                        {typeof paymentError === 'object' && (paymentError.code || paymentError.source) && (
                          <div className="mt-2 text-xs text-red-500 space-y-0.5">
                            {paymentError.code && paymentError.code !== 'UNKNOWN' && (
                              <p>Error code: <span className="font-mono">{paymentError.code}</span></p>
                            )}
                            {paymentError.source && (
                              <p>Source: {paymentError.source}</p>
                            )}
                            {paymentError.step && (
                              <p>Step: {paymentError.step.replace(/_/g, ' ')}</p>
                            )}
                            {paymentError.paymentId && (
                              <p>Payment ID: <span className="font-mono">{paymentError.paymentId}</span></p>
                            )}
                          </div>
                        )}
                        
                        <button
                          type="button"
                          onClick={() => { setPaymentError(null); setSubmitting(false); }}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-800 underline"
                          data-testid="retry-payment-btn"
                        >
                          Dismiss & Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method Selector */}
                <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="payment-method">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Payment Method</h3>
                  <div className="space-y-3">
                    <label className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${paymentMethod === 'razorpay' ? 'border-[#2563EB] bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="payment" value="razorpay" checked={paymentMethod === 'razorpay'} onChange={() => setPaymentMethod('razorpay')} className="text-[#2563EB]" />
                      <CreditCard size={20} className="text-gray-600" />
                      <div>
                        <p className="font-medium text-sm text-gray-900">Pay via Razorpay</p>
                        <p className="text-xs text-gray-500">UPI, Cards, Net Banking</p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${paymentMethod === 'credit' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'} ${!creditBalance?.has_credit ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input type="radio" name="payment" value="credit" checked={paymentMethod === 'credit'} onChange={() => creditBalance?.has_credit && setPaymentMethod('credit')} disabled={!creditBalance?.has_credit} className="text-emerald-600" />
                      <Wallet size={20} className="text-emerald-600" />
                      <div className="flex-1">
                        <p className="font-medium text-sm text-gray-900">Pay via Locofast Credit</p>
                        {creditBalance?.has_credit ? (
                          <p className="text-xs text-emerald-600">Available balance: ₹{creditBalance.balance.toLocaleString()}</p>
                        ) : (
                          <p className="text-xs text-gray-400">Enter your email to check credit balance</p>
                        )}
                      </div>
                      {creditBalance?.has_credit && creditBalance.balance < total && (
                        <span className="text-xs text-red-500 font-medium">Insufficient balance</span>
                      )}
                    </label>
                  </div>
                </div>

                {/* Submit Button (Mobile) */}
                <div className="lg:hidden">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="checkout-pay-btn"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Processing...
                      </>
                    ) : paymentMethod === 'credit' ? (
                      <>
                        <Wallet size={20} />
                        Pay with Credit ₹{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </>
                    ) : (
                      <>
                        <CreditCard size={20} />
                        Pay ₹{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Price Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-6 border border-gray-200 sticky top-24">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CreditCard size={20} />
                  Payment Summary
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price per {getUnit(fabric).singular}</span>
                    <span>₹{pricePerMeter.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity</span>
                    <span>{quantity} {getUnit(fabric).plural}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-gray-100">
                    <span className="text-gray-600">Subtotal</span>
                    <span>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">GST (5%)</span>
                    <span>₹{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {orderType === "bulk" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Packaging (₹1/{getUnit(fabric).short})
                        </span>
                        <span>₹{packagingCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Logistics
                        </span>
                        <span>₹{logisticsCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Logistics (Flat)
                      </span>
                      <span>₹{logistics.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Coupon Discount</span>
                      <span>-₹{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-gray-200 text-lg font-semibold">
                    <span>Total</span>
                    <span className="text-emerald-600">₹{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-3">For export orders, additional port charges, custom charges, export documentation &amp; cess may be applicable.</p>
                </div>

                {/* Desktop Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="hidden lg:flex w-full items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                  data-testid="checkout-pay-btn-desktop"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Processing...
                    </>
                  ) : paymentMethod === 'credit' ? (
                    <>
                      <Wallet size={20} />
                      Pay with Credit
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      Pay Now
                    </>
                  )}
                </button>

                {/* Security Badge */}
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  {paymentMethod === 'credit' ? 'Locofast Credit Wallet' : 'Secured by Razorpay'}
                </div>

                {/* Info */}
                <p className="mt-4 text-xs text-gray-500 text-center">
                  By placing this order, you agree to our terms of service and privacy policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutPage;
