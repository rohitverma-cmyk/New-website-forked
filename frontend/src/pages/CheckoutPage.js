import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Truck, CreditCard, CheckCircle2, AlertCircle, Loader2, Package, Tag, Wallet, X } from "lucide-react";
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
  // Color variant (for multi-color SKUs)
  const colorName = searchParams.get("color") || "";
  const colorHex = searchParams.get("color_hex") || "";
  
  // Agent-assisted booking params
  const sharedCartToken = searchParams.get("shared_cart") || "";
  const agentId = searchParams.get("agent_id") || "";
  const agentEmail = searchParams.get("agent_email") || "";
  const agentName = searchParams.get("agent_name") || "";
  
  const [fabric, setFabric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // ── Multi-item shared-cart support ──────────────────────────────────
  // When the user lands here from a shared cart link, the agent might
  // have curated 2+ items across multiple vendors. We fetch the whole
  // cart and keep the list in `cartItems`. Single-item PDP checkouts
  // still use the `fabric` state below (cartItems stays empty).
  const [cartItems, setCartItems] = useState([]); // [{fabric_id, fabric_name, quantity, price_per_meter, order_type, image_url, seller_id, seller_company, ...}]
  const isMultiItem = cartItems.length > 0;
  
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
  // Inline 'Apply for Credit' modal state — visible from checkout when no
  // credit line exists for the verified GSTIN.
  const [showCreditApply, setShowCreditApply] = useState(false);
  const [creditApplyForm, setCreditApplyForm] = useState({ requested_amount_inr: "", turnover: "", message: "" });
  const [creditApplying, setCreditApplying] = useState(false);

  // GST verification
  const [gstNumber, setGstNumber] = useState("");
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstResult, setGstResult] = useState(null);

  // ── Email → GST auto-fill bootstrap ──────────────────────────────────
  // For buyers who are the authorized email on a wallet but whose
  // customer profile doesn't carry a GST yet (e.g. shared-cart flow,
  // first-time checkout), resolve the GSTIN from their email so the
  // credit balance card can light up automatically.
  useEffect(() => {
    const email = (customer.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (gstNumber && gstNumber.length === 15) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/credit/lookup-by-email?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.found && data.gst_number) {
          setGstNumber(data.gst_number);
          if (data.company && !customer.company) {
            setCustomer((p) => ({ ...p, company: data.company }));
          }
        }
      } catch { /* silent — user can still type GST manually */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.email]);

  // ── Auto-fire credit lookup whenever a valid 15-char GSTIN is present ─
  // This handles the case where GST is auto-filled from the customer's
  // brand profile (logged-in flow / shared-cart flow) and Sandbox
  // verification was never triggered. Without this, "Pay via Locofast
  // Credit" stays "No credit line found yet" even when the wallet exists.
  useEffect(() => {
    const cleaned = (gstNumber || "").trim().toUpperCase();
    if (cleaned.length !== 15) return;
    // Skip if we already have a balance for this GSTIN (avoid re-lookup
    // every keystroke once verified).
    if (creditBalance?.gst_number === cleaned) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCreditBalance({ gst_number: cleaned });
        if (cancelled) return;
        setCreditBalance(res.data);
        if (res.data?.has_credit) setPaymentMethod("credit");
      } catch { /* silently ignore — UI shows Apply-for-Credit fallback */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstNumber]);
  const [gstAddress, setGstAddress] = useState(null);

  // Shipping address toggle
  const [useGstAddress, setUseGstAddress] = useState(true);
  // Separate "Ship To" payload populated ONLY when the buyer chooses
  // "Ship to a different address". Drives the order-doc `ship_to` field
  // which, in turn, drives CGST/IGST routing on the invoice (POS = ship
  // state, per CGST §10).
  const [shipTo, setShipTo] = useState({
    name: '', company: '', gst_number: '', address: '', city: '', state: '', pincode: '', phone: ''
  });
  const [shipGstVerifying, setShipGstVerifying] = useState(false);
  const [shipGstResult, setShipGstResult] = useState(null); // {valid, trade_name, legal_name, address, city, state, pincode, message}
  const { customer: loggedInCustomer, isLoggedIn } = useCustomerAuth();

  // Auto-fill from customer profile
  useEffect(() => {
    if (isLoggedIn && loggedInCustomer) {
      // Phone-only customers get a synthetic email like
      // `phone+91xxxxx@phone.locofast.local` so backend lookups work.
      // Never surface this placeholder in the checkout form — the
      // customer will see the prompt to add a real email instead.
      const isSyntheticEmail = (em) => typeof em === "string" && em.endsWith("@phone.locofast.local");
      setCustomer(prev => ({
        ...prev,
        name: loggedInCustomer.name || prev.name,
        email: isSyntheticEmail(loggedInCustomer.email) ? "" : (loggedInCustomer.email || prev.email),
        phone: loggedInCustomer.phone || prev.phone,
        company: loggedInCustomer.company || prev.company,
        address: loggedInCustomer.address || prev.address,
        city: loggedInCustomer.city || prev.city,
        state: loggedInCustomer.state || prev.state,
        pincode: loggedInCustomer.pincode || prev.pincode,
      }));
      if (loggedInCustomer.gstin) {
        getCreditBalance({ gst_number: loggedInCustomer.gstin }).then(res => {
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
        // ── Credit lookup by GST ─────────────────────────────────────
        // Credit lines are mapped to a business (GSTIN), not a personal
        // email. Pull the balance for this GST and switch the default
        // payment method to credit if a balance is available.
        try {
          const creditRes = await getCreditBalance({ gst_number: cleaned });
          setCreditBalance(creditRes.data);
          if (creditRes.data?.has_credit) setPaymentMethod("credit");
        } catch { setCreditBalance(null); }
        toast.success("GST verified — company details auto-filled");
      } else {
        // GST changed / failed → clear any previous credit lookup
        setCreditBalance(null);
      }
    } catch {
      setGstResult({ valid: false, message: "Verification failed" });
    }
    setGstVerifying(false);
  };

  // ── Verify the SHIPPING address GSTIN ───────────────────────────────
  // Different from `verifyGst` (which handles the billing GST). When the
  // customer ships to a different address we MUST capture the
  // consignee's GSTIN so the invoice correctly determines CGST vs IGST
  // (Place of Supply = shipping state, per CGST §10). On a successful
  // verify we auto-fill firm name + address + state and LOCK the state
  // field so the buyer can't drift it off the GSTN-registered state.
  const verifyShipGst = async (gstin) => {
    const cleaned = (gstin || '').trim().toUpperCase();
    if (cleaned.length !== 15 || shipGstVerifying) return;
    setShipGstVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/gst/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: cleaned })
      });
      const data = await res.json();
      setShipGstResult(data);
      if (data.valid) {
        setShipTo(prev => ({
          ...prev,
          gst_number: cleaned,
          company: data.trade_name || data.legal_name || prev.company,
          name: prev.name || data.trade_name || data.legal_name || '',
          address: data.address || prev.address,
          city: data.city || prev.city,
          state: data.state || prev.state,
          pincode: data.pincode || prev.pincode,
        }));
        toast.success("Shipping GST verified — address auto-filled");
      }
    } catch {
      setShipGstResult({ valid: false, message: "Verification failed" });
    }
    setShipGstVerifying(false);
  };

  // ── Submit a credit application directly from checkout ─────────────
  // Lightweight version of the credit-app form: prefills name / email /
  // phone / company / GST from what the user has already entered. Posts
  // to the public `/api/credit/apply` endpoint.
  const submitCreditApplication = async () => {
    if (!customer.name || !customer.email || !customer.phone) {
      toast.error("Fill name, email & phone first"); return;
    }
    if (!gstResult?.valid) { toast.error("Verify GST before applying"); return; }
    setCreditApplying(true);
    try {
      const res = await fetch(`${API_URL}/api/credit/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          company: customer.company || gstResult.trade_name || gstResult.legal_name || "",
          gst_number: gstNumber,
          turnover: creditApplyForm.turnover,
          message: `Requested limit: ₹${creditApplyForm.requested_amount_inr || '—'}\n${creditApplyForm.message || ''}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit");
      toast.success("Credit application submitted — our team will reach out within 1 working day");
      setShowCreditApply(false);
      setCreditApplyForm({ requested_amount_inr: "", turnover: "", message: "" });
    } catch (err) {
      toast.error(err.message || "Failed to submit credit application");
    } finally { setCreditApplying(false); }
  };

  useEffect(() => {
    // Multi-item path — when a shared cart token is present, fetch the
    // full cart and load every item. Single fabric_id fallback handles
    // both the legacy single-item shared-cart redirect AND direct PDP
    // checkout where there's no token.
    if (sharedCartToken) {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/api/agent/cart/${sharedCartToken}`);
          if (!res.ok) throw new Error("Cart not found");
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          if (items.length > 1) {
            setCartItems(items);
            setLoading(false);
            return;
          }
          // Single-item cart — still use the legacy fabric flow below
        } catch {
          // fall through to single fabric_id load
        }
        if (fabricId) fetchFabric();
        else setLoading(false);
      })();
      return;
    }

    if (!fabricId) {
      toast.error("No fabric selected");
      navigate("/fabrics");
      return;
    }

    fetchFabric();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricId, sharedCartToken]);

  useEffect(() => {
    if (isMultiItem) {
      calculateMultiItemPricing();
    } else if (fabric) {
      calculatePricing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabric, quantity, orderType, discount, cartItems]);

  // Multi-vendor pricing: sum subtotals across items, apply the same
  // sample / bulk logistics formula on the aggregate. This keeps the
  // customer-facing total identical to what they would have seen if the
  // agent had built a single-vendor cart of the same value.
  // Tax base (Feb 2026+): 5% GST is computed on goods + packaging +
  // logistics — per Schedule II of the CGST Act, all of these are part
  // of the value of supply.
  const calculateMultiItemPricing = () => {
    if (cartItems.length === 0) return;
    const sub = cartItems.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.price_per_meter) || 0),
      0
    );
    const hasBulk = cartItems.some((it) => (it.order_type || "bulk") === "bulk");
    let totalLogistics = 0;
    let packaging = 0;
    let logisticsOnly = 0;
    if (!hasBulk) {
      totalLogistics = 100 * cartItems.length;
    } else {
      const totalQty = cartItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      totalLogistics = Math.max(sub * 0.03, 3000);
      packaging = totalQty * 1;
      logisticsOnly = Math.max(0, totalLogistics - packaging);
    }
    const taxBase = sub + packaging + totalLogistics;
    const taxAmount = Math.round(taxBase * 0.05 * 100) / 100;
    const finalTotal = taxBase + taxAmount - discount;
    setSubtotal(sub);
    setTax(taxAmount);
    setLogistics(totalLogistics);
    setPackagingCharge(packaging);
    setLogisticsCharge(logisticsOnly);
    setTotal(Math.max(0, finalTotal));
  };

  const [fetchError, setFetchError] = useState(false);

  const fetchFabric = async () => {
    try {
      const res = await getFabric(fabricId);
      setFabric(res.data);
      setFetchError(false);
      // GA4: track begin_checkout when fabric loads
      if (res.data) {
        trackBeginCheckout(res.data, orderType, quantity, res.data.rate_per_meter ? res.data.rate_per_meter * quantity : 0);
      }
    } catch (err) {
      // Ignore browser/StrictMode aborts (request canceled, no real failure)
      const isAbort = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.message === 'canceled';
      if (!isAbort) {
        setFetchError(true);
        toast.error("Failed to load fabric details");
      }
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

    // Tax base (Feb 2026+) = goods + packaging + logistics
    const taxBase = sub + packaging + totalLogistics;
    const taxAmount = Math.round(taxBase * 0.05 * 100) / 100; // 5% GST
    const finalTotal = taxBase + taxAmount - discount;

    setPricePerMeter(price);
    setSubtotal(sub);
    setTax(taxAmount);
    setLogistics(totalLogistics);
    setPackagingCharge(packaging);
    setLogisticsCharge(logisticsOnly);
    setLogisticsPerMeter(logisticsPerUnit);
    setTotal(Math.max(0, finalTotal));
  };

  // Credit surcharge: 1.5% per month × (period/30). Only when paying via
  // Locofast credit. Cash/Razorpay orders are charge-free.
  const creditPeriodDays = creditBalance?.credit_period_days || 30;
  const creditCharge = paymentMethod === "credit"
    ? Math.round(total * 0.015 * (creditPeriodDays / 30) * 100) / 100
    : 0;
  const grandTotal = total + creditCharge;

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
    // Hard-gate: GST must be present and verified for every B2B checkout
    if (!gstNumber || gstNumber.trim().length !== 15) {
      toast.error("GST Number is required (15 characters)");
      return;
    }
    if (!gstResult?.valid) {
      toast.error("Please verify your GST before placing the order");
      return;
    }
    // If shipping to a different address, the consignee GST must be
    // verified — it's what drives the CGST/IGST decision on the invoice.
    if (gstAddress && !useGstAddress) {
      if (!shipTo.gst_number || shipTo.gst_number.length !== 15 || !shipGstResult?.valid) {
        toast.error("Please verify the consignee GST for the shipping address");
        return;
      }
      if (!shipTo.address || !shipTo.city || !shipTo.state || !shipTo.pincode) {
        toast.error("Complete the shipping address before placing the order");
        return;
      }
    }
    setSubmitting(true);
    setPaymentError(null);

    try {
      // Build items payload — multi-item from shared cart OR single-item from PDP
      const itemsPayload = isMultiItem
        ? cartItems.map((it) => ({
            fabric_id: it.fabric_id,
            fabric_name: it.fabric_name || "",
            fabric_code: it.fabric_code || "",
            category_name: it.category_name || "",
            seller_company: it.seller_company || "",
            seller_id: it.seller_id || "",
            quantity: Number(it.quantity) || 0,
            price_per_meter: Number(it.price_per_meter) || 0,
            order_type: it.order_type || "bulk",
            image_url: it.image_url || "",
            hsn_code: it.hsn_code || "",
            color_name: it.color_name || "",
            color_hex: it.color_hex || "",
            dispatch_timeline: it.dispatch_timeline || (it.order_type === "bulk" ? "15-20 days" : "Ready Stock"),
          }))
        : [{
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
            color_name: colorName || "",
            color_hex: colorHex || "",
            dispatch_timeline: fabric.dispatch_timeline || (orderType === 'bulk' ? '15-20 days' : 'Ready Stock')
          }];

      const orderData = {
        items: itemsPayload,
        customer: { ...customer, gst_number: gstNumber },
        ship_to: (gstAddress && !useGstAddress) ? {
          name: shipTo.name || customer.name,
          company: shipTo.company,
          gst_number: shipTo.gst_number,
          address: shipTo.address,
          city: shipTo.city,
          state: shipTo.state,
          pincode: shipTo.pincode,
          phone: shipTo.phone || customer.phone,
        } : null,
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
        description: isMultiItem
          ? `Locofast cart · ${cartItems.length} item${cartItems.length !== 1 ? "s" : ""}`
          : `${orderType === "sample" ? "Sample" : "Bulk"} Order - ${fabric?.name || ""}`,
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

  if (!fabric && !isMultiItem) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center bg-white rounded-xl border border-gray-200 p-8" data-testid="checkout-fabric-load-error">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {fetchError ? "Couldn't load fabric details" : "Fabric not found"}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {fetchError
                ? "There was a problem fetching this fabric. Please check your connection and try again."
                : "The fabric you're trying to check out is unavailable."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {fetchError && (
                <button
                  onClick={() => { setLoading(true); setFetchError(false); fetchFabric(); }}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  data-testid="checkout-retry-btn"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => navigate("/fabrics")}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                data-testid="checkout-back-to-catalog-btn"
              >
                Back to Catalog
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
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
                    {isMultiItem && (
                      <span className="ml-2 text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {cartItems.length} items
                      </span>
                    )}
                  </h2>

                  {isMultiItem ? (
                    <div className="space-y-3" data-testid="checkout-multi-items">
                      {cartItems.map((it, idx) => (
                        <div key={idx} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0">
                          <img
                            src={it.image_url || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200"}
                            alt={it.fabric_name}
                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 text-sm truncate">{it.fabric_name}</h3>
                            {it.category_name && <p className="text-xs text-gray-500">{it.category_name}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                it.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                              }`}>{it.order_type === "sample" ? "Sample" : "Bulk"}</span>
                              <span className="text-gray-600">{it.quantity} {it.unit || "m"}</span>
                              <span className="text-gray-500">@ ₹{Number(it.price_per_meter).toLocaleString()}</span>
                              {it.color_name && (
                                <span className="inline-flex items-center gap-1 text-gray-600">
                                  <span className="w-2.5 h-2.5 rounded-full border border-gray-300" style={{ backgroundColor: it.color_hex || '#ccc' }} />
                                  {it.color_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm font-semibold whitespace-nowrap">
                            ₹{(Number(it.quantity) * Number(it.price_per_meter)).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      {/* Multi-vendor heads-up */}
                      {(() => {
                        const sellers = new Set(cartItems.map((it) => it.seller_id).filter(Boolean));
                        if (sellers.size <= 1) return null;
                        return (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2" data-testid="checkout-multi-vendor-note">
                            <Truck size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-800">
                              Items in this order ship from <strong>{sellers.size} different mills</strong>. You'll receive {sellers.size} separate shipments with individual tracking links once dispatched.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
                  <div className="flex gap-4">
                    <img
                      src={fabric.images?.[0] || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200"}
                      alt={fabric.name}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{fabric.name}</h3>
                      <p className="text-sm text-gray-600">{fabric.category_name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          orderType === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {orderType === "sample" ? "Sample Order" : "Bulk Order"}
                        </span>
                        <span className="text-gray-600">{quantity} {getUnit(fabric).plural}</span>
                        {colorName && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700" data-testid="checkout-selected-color">
                            <span
                              className="w-3 h-3 rounded-full border border-gray-300"
                              style={{ backgroundColor: colorHex || '#ccc' }}
                            />
                            {colorName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  </>
                  )}
                  
                  {/* Estimated Delivery Timeline — only shown in single-item flow
                       where we have the full fabric record. Multi-item carts get
                       a vendor-count note above instead. */}
                  {!isMultiItem && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-2 text-sm">
                      <Truck size={16} className="text-emerald-600 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-600">Stock Status:</span>
                          {(() => {
                            const ready = fabric.is_bookable === true && Number(fabric.quantity_available || 0) > 0;
                            const mto = fabric.stock_type === 'made_to_order';
                            const label = ready ? 'Ready Stock' : (mto ? 'Made to Order' : 'Enquiry Only');
                            const tone = ready
                              ? 'bg-emerald-100 text-emerald-800'
                              : (mto ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800');
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {orderType === 'sample'
                            ? 'Samples dispatched in 24–48 hours'
                            : (fabric.is_bookable && Number(fabric.quantity_available || 0) > 0
                                ? 'Bulk: 24–48 hours for packaging & dispatch'
                                : 'Bulk dispatched within ~30 days (manufacturing time)')}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {fabric.stock_type === 'made_to_order'
                            ? 'Production starts after order confirmation. Our team will share exact timeline.'
                            : 'Post-dispatch transit time depends on your location.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  )}
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
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="you@company.com" data-testid="checkout-email" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                      <input type="tel" required value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none" placeholder="+91 98765 43210" data-testid="checkout-phone" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GST Number <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          required
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
                        <input type="radio" name="addressType" checked={useGstAddress} onChange={() => { setUseGstAddress(true); setCustomer(prev => ({ ...prev, ...gstAddress })); }} data-testid="ship-addr-same" />
                        <div>
                          <p className="font-medium text-sm">GST Registered Address</p>
                          <p className="text-xs text-gray-500">{[gstAddress.address, gstAddress.city, gstAddress.state, gstAddress.pincode].filter(Boolean).join(', ')}</p>
                        </div>
                      </label>
                      <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer ${!useGstAddress ? 'border-[#2563EB] bg-blue-50/30' : 'border-gray-200'}`}>
                        <input type="radio" name="addressType" checked={!useGstAddress} onChange={() => { setUseGstAddress(false); }} data-testid="ship-addr-different" />
                        <div>
                          <p className="font-medium text-sm">Ship to a Different Address</p>
                          <p className="text-xs text-gray-500">Provide the consignee's GSTIN — we'll auto-fill the registered address.</p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Same-as-billing path — read-only echo, no editable inputs */}
                  {(!gstAddress || useGstAddress) && (
                    <div className="grid md:grid-cols-2 gap-4 opacity-90">
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
                  )}

                  {/* DIFFERENT-ADDRESS path — GST-first form. Buyer must
                      enter the consignee's GSTIN; we auto-fill the
                      address from GSTN and LOCK the state field so the
                      CGST/IGST determination is always correct. */}
                  {gstAddress && !useGstAddress && (
                    <div className="space-y-4" data-testid="ship-to-different-form">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>GST required for shipping</strong> — we use the consignee's GSTIN to determine whether this is an intra-state (CGST+SGST) or inter-state (IGST) supply on your tax invoice.
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Consignee GST Number *</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            maxLength={15}
                            value={shipTo.gst_number}
                            onChange={(e) => {
                              const v = e.target.value.toUpperCase().replace(/\s+/g, "");
                              setShipTo(prev => ({ ...prev, gst_number: v }));
                              if (v.length !== 15) setShipGstResult(null);
                              if (v.length === 15) verifyShipGst(v);
                            }}
                            placeholder="22AAAAA0000A1Z5"
                            className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none pr-10 font-mono tracking-wider ${shipGstResult?.valid ? 'border-emerald-500 bg-emerald-50/30' : shipGstResult?.valid === false ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
                            data-testid="ship-gst-input"
                          />
                          {shipGstVerifying && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />}
                          {shipGstResult?.valid && <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                          {shipGstResult?.valid === false && <AlertCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
                        </div>
                        {shipGstResult?.valid && <p className="text-xs text-emerald-600 mt-1">{shipGstResult.trade_name || shipGstResult.legal_name}</p>}
                        {shipGstResult?.valid === false && <p className="text-xs text-red-500 mt-1">{shipGstResult.message || 'Invalid GST'}</p>}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Consignee / Firm Name *</label>
                          <input
                            type="text"
                            required
                            value={shipTo.name}
                            onChange={(e) => setShipTo({ ...shipTo, name: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none bg-gray-50"
                            placeholder={shipGstResult?.valid ? '' : 'Verify GST to auto-fill'}
                            data-testid="ship-name-input"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                          <input
                            type="text"
                            required
                            value={shipTo.address}
                            onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            placeholder={shipGstResult?.valid ? '' : 'Verify GST to auto-fill'}
                            data-testid="ship-address-input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                          <input
                            type="text"
                            required
                            value={shipTo.city}
                            onChange={(e) => setShipTo({ ...shipTo, city: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            data-testid="ship-city-input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            State *
                            {shipGstResult?.valid && (
                              <span className="ml-2 text-[10px] text-emerald-600 font-normal">🔒 locked from GSTN</span>
                            )}
                          </label>
                          <input
                            type="text"
                            required
                            value={shipTo.state}
                            readOnly={!!shipGstResult?.valid}
                            onChange={(e) => setShipTo({ ...shipTo, state: e.target.value })}
                            className={`w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none ${shipGstResult?.valid ? 'bg-gray-100 cursor-not-allowed text-gray-700' : ''}`}
                            data-testid="ship-state-input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code *</label>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={shipTo.pincode}
                            onChange={(e) => setShipTo({ ...shipTo, pincode: e.target.value.replace(/\D/g, '') })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            data-testid="ship-pincode-input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Consignee Phone</label>
                          <input
                            type="text"
                            value={shipTo.phone}
                            onChange={(e) => setShipTo({ ...shipTo, phone: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            placeholder="+91 98xxxxxxxx"
                            data-testid="ship-phone-input"
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
                    {creditBalance?.has_credit ? (
                      (() => {
                        // Show an email-mismatch warning (orange) if the
                        // currently logged-in / entered email doesn't match
                        // the wallet's authorized buyer.
                        const authorized = (creditBalance.authorized_email_masked || "").toLowerCase();
                        const enteredLocal = (customer.email || "").toLowerCase().split("@")[0] || "";
                        const masked = authorized.split("@")[0] || "";
                        // Heuristic: if first char of entered local-part doesn't
                        // match first char of masked local-part, we treat as mismatch.
                        const looksMismatched = !!(authorized && enteredLocal && (
                          enteredLocal[0] !== masked[0] || enteredLocal.slice(-1) !== masked.replace(/\*+/g, "").slice(-1)
                        ));
                        return (
                          <label className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${paymentMethod === 'credit' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'}`} data-testid="pay-credit-option">
                            <input type="radio" name="payment" value="credit" checked={paymentMethod === 'credit'} onChange={() => setPaymentMethod('credit')} className="text-emerald-600 mt-1" />
                            <Wallet size={20} className="text-emerald-600 mt-1" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-gray-900">Pay via Locofast Credit · {creditPeriodDays}-day terms</p>
                              <p className="text-xs text-emerald-600">Available balance: ₹{creditBalance.balance.toLocaleString()}{creditBalance.company ? ` · ${creditBalance.company}` : ''}</p>
                              {creditBalance.authorized_email_masked && (
                                <p className={`text-[11px] mt-0.5 ${looksMismatched ? 'text-orange-600' : 'text-gray-500'}`}>
                                  Authorized buyer: <span className="font-mono">{creditBalance.authorized_email_masked}</span>
                                  {looksMismatched && <span className="ml-1">— please sign in with the authorized email to charge this credit line.</span>}
                                </p>
                              )}
                              {creditBalance.balance < grandTotal && (
                                <p className="text-xs text-red-500 font-medium mt-1">Insufficient balance for this order (₹{grandTotal.toLocaleString()})</p>
                              )}
                            </div>
                          </label>
                        );
                      })()
                    ) : (
                      // No credit line on this GST → invite the buyer to apply.
                      // Required disclosure: turnover threshold for eligibility.
                      <div className="flex items-start gap-4 p-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/40" data-testid="apply-credit-cta">
                        <Wallet size={20} className="text-gray-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">Pay via Locofast Credit</p>
                          <p className="text-xs text-gray-500 mt-0.5">No credit line found {gstNumber && gstNumber.length === 15 ? `for GSTIN ${gstNumber}` : 'yet'}.</p>
                          <button
                            type="button"
                            onClick={() => setShowCreditApply(true)}
                            className="mt-2 inline-flex items-center text-xs font-semibold text-[#2563EB] hover:text-blue-700 underline underline-offset-2"
                            data-testid="apply-credit-btn"
                          >
                            Apply for Credit →
                          </button>
                          <p className="text-[11px] text-gray-400 mt-1">* Turnover requirement &gt;₹2 Cr needed for credit</p>
                        </div>
                      </div>
                    )}
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
                        Pay with Credit ₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  {isMultiItem ? (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Items</span>
                      <span data-testid="checkout-multi-items-count">
                        {cartItems.length} from {new Set(cartItems.map((it) => it.seller_id).filter(Boolean)).size || 1} mill{(new Set(cartItems.map((it) => it.seller_id).filter(Boolean)).size || 1) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ) : (
                    <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price per {getUnit(fabric).singular}</span>
                    <span>₹{pricePerMeter.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity</span>
                    <span>{quantity} {getUnit(fabric).plural}</span>
                  </div>
                    </>
                  )}
                  <div className="flex justify-between pt-3 border-t border-gray-100">
                    <span className="text-gray-600">Goods Subtotal</span>
                    <span>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {(isMultiItem ? packagingCharge > 0 : orderType === "bulk") ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Packaging{!isMultiItem && ` (₹1/${getUnit(fabric).short})`}
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
                  <div className="flex justify-between text-gray-500 text-xs pt-1 border-t border-dashed border-gray-100">
                    <span>Taxable value (Goods + Packaging + Logistics)</span>
                    <span>₹{(subtotal + packagingCharge + logistics).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">GST (5%)</span>
                    <span>₹{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Coupon Discount</span>
                      <span>-₹{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {creditCharge > 0 && (
                    <div className="flex justify-between text-orange-600" data-testid="credit-charge-line">
                      <span>Credit Charges ({(0.015 * (creditPeriodDays / 30) * 100).toFixed(1)}% / {creditPeriodDays}d)</span>
                      <span>+₹{creditCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-gray-200 text-lg font-semibold">
                    <span>Total</span>
                    <span className="text-emerald-600">₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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

      {/* ── Apply for Credit modal (inline on checkout) ───────────────── */}
      {showCreditApply && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreditApply(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="credit-apply-modal">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Apply for Locofast Credit</h3>
                <p className="text-xs text-gray-500 mt-0.5">Our team will reach out to <strong>{customer.company || gstResult?.trade_name || '—'}</strong> within 1 working day.</p>
              </div>
              <button onClick={() => setShowCreditApply(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-1">
                <div><span className="text-gray-500">Applicant:</span> <span className="font-medium">{customer.name}</span></div>
                <div><span className="text-gray-500">GSTIN:</span> <span className="font-mono">{gstNumber}</span></div>
                <div><span className="text-gray-500">Email:</span> {customer.email} · <span className="text-gray-500">Phone:</span> {customer.phone}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual turnover (₹) <span className="text-red-500">*</span></label>
                <select
                  value={creditApplyForm.turnover}
                  onChange={(e) => setCreditApplyForm({ ...creditApplyForm, turnover: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-blue-500 focus:outline-none"
                  data-testid="credit-apply-turnover"
                >
                  <option value="">Select range…</option>
                  <option value="under_2cr">Under ₹2 Cr (not eligible)</option>
                  <option value="2_5cr">₹2 – 5 Cr</option>
                  <option value="5_10cr">₹5 – 10 Cr</option>
                  <option value="10_25cr">₹10 – 25 Cr</option>
                  <option value="25cr_plus">Above ₹25 Cr</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Requested credit limit (₹)</label>
                <input
                  type="number"
                  min={0}
                  step={50000}
                  value={creditApplyForm.requested_amount_inr}
                  onChange={(e) => setCreditApplyForm({ ...creditApplyForm, requested_amount_inr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. 2000000"
                  data-testid="credit-apply-amount"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Use case</label>
                <textarea
                  rows={2}
                  value={creditApplyForm.message}
                  onChange={(e) => setCreditApplyForm({ ...creditApplyForm, message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-blue-500 focus:outline-none resize-none"
                  placeholder="What will you use the credit for?"
                  data-testid="credit-apply-usecase"
                />
              </div>
              <p className="text-[11px] text-gray-400">* Turnover requirement &gt;₹2 Cr needed for credit. Approval typically takes 3-5 working days.</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreditApply(false)} className="flex-1 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button
                  type="button"
                  onClick={submitCreditApplication}
                  disabled={creditApplying || !creditApplyForm.turnover}
                  className="flex-1 py-2 bg-[#2563EB] text-white rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                  data-testid="credit-apply-submit"
                >
                  {creditApplying ? "Submitting…" : "Submit Application"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckoutPage;
