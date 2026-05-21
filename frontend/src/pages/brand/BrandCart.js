import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { useBrandCart } from "../../context/BrandCartContext";
import BrandLayout from "./BrandLayout";
import { ShoppingCart, Trash2, ArrowRight, ArrowLeft, CheckCircle, Loader2, MapPin, Beaker, Upload, Factory, Send, X, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { fmtINR, fmtLacs, fmtCount } from "../../lib/inr";
import { thumbImage } from "../../lib/imageUrl";
import { DispatchStrip, DispatchLine } from "../../components/DispatchBadges";

const API = process.env.REACT_APP_BACKEND_URL;

const LineRow = ({ l, onQty, onRemove }) => {
  const isSample = l.order_type === "sample";
  const lineTotal = Number(l.price_per_unit) * Number(l.quantity);
  return (
    <div className="flex items-start gap-3 p-3 border-b border-gray-100 last:border-b-0" data-testid={`brand-cart-line-${l.id}`}>
      <img
        src={thumbImage(l.image_url) || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200"}
        alt={l.fabric_name}
        className="w-16 h-16 object-cover rounded border border-gray-200 flex-shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-blue-600 font-semibold">{l.category_name}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{l.fabric_name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
          {l.fabric_code && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{l.fabric_code}</span>}
          {l.color_name && (
            <span className="inline-flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
              <span className="w-2 h-2 rounded-full border border-gray-300" style={{ background: l.color_hex || "#fff" }} />
              {l.color_name}
            </span>
          )}
          <span>{l.unit === "kg" ? "kg" : "m"} · ₹{l.price_per_unit}/{l.unit}</span>
          {isSample && <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Max 5{l.unit}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <input
          type="number"
          min={1}
          max={isSample ? 5 : undefined}
          value={l.quantity}
          onChange={(e) => onQty(l.id, Number(e.target.value))}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"
          data-testid={`brand-cart-qty-${l.id}`}
        />
        <p className="text-sm font-semibold text-gray-900">{fmtINR(lineTotal)}</p>
        <button onClick={() => onRemove(l.id)} className="text-red-400 hover:text-red-600" data-testid={`brand-cart-remove-${l.id}`}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

const BrandCart = () => {
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const { bulkLines, sampleLines, bulkSubtotal, sampleSubtotal, updateQty, removeLine, clear } = useBrandCart();

  const [summary, setSummary] = useState(null);
  const [address, setAddress] = useState({
    ship_to_name: "", ship_to_phone: "", ship_to_address: "",
    ship_to_city: "", ship_to_state: "", ship_to_pincode: "",
    notes: "",
  });
  const [saveDefault, setSaveDefault] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(null);
  const [enterpriseType, setEnterpriseType] = useState("brand");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showAddNew, setShowAddNew] = useState(false);

  // Pick a saved address card → autofill the address state used by checkout
  const pickSavedAddress = (a) => {
    setSelectedAddressId(a.id);
    setAddress({
      ship_to_name: a.name || user?.name || "",
      ship_to_phone: a.phone || "",
      ship_to_address: a.address || "",
      ship_to_city: a.city || "",
      ship_to_state: a.state || "",
      ship_to_pincode: a.pincode || "",
      notes: address.notes || "",
    });
  };
  const [factory, setFactory] = useState({
    po_file_url: "",
    tech_pack_url: "",
    qty_color_matrix: "",
    po_uploading: false,
    tp_uploading: false,
  });

  // Brand → Factory SKU allocation (Option B: brand prepares cart, factory checks out)
  const [brandFactories, setBrandFactories] = useState([]);
  const [showSendModal, setShowSendModal] = useState(false);
  const [pickedFactoryId, setPickedFactoryId] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);

  // Bulk-order payment method. When credit is insufficient we auto-flip to
  // "razorpay" (UPI/Card/NetBanking), otherwise we default back to credit
  // whenever the user's credit balance becomes adequate again.
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState("credit");

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    (async () => {
      try {
        const s = await fetch(`${API}/api/brand/credit-summary`, { headers: { Authorization: `Bearer ${token}` } });
        setSummary(await s.json());
        const me = await fetch(`${API}/api/brand/me`, { headers: { Authorization: `Bearer ${token}` } });
        const meData = await me.json();
        setEnterpriseType(meData?.brand?.type || "brand");

        // Load full saved-address book (own + factory addresses)
        const adRes = await fetch(`${API}/api/brand/addresses`, { headers: { Authorization: `Bearer ${token}` } });
        const adData = await adRes.json();
        const saved = adData?.addresses || [];
        setSavedAddresses(saved);

        // Auto-pick default address (or first one) when present
        const def = saved.find((x) => x.is_default) || saved[0];
        if (def) {
          pickSavedAddress(def);
        } else {
          // Fall back to legacy default_ship_to or empty form for "Add new" flow
          const defAddr = meData?.brand?.default_ship_to || {};
          if (defAddr.address) {
            setAddress((a) => ({
              ...a,
              ship_to_name: defAddr.name || user.name || "",
              ship_to_phone: defAddr.phone || "",
              ship_to_address: defAddr.address || "",
              ship_to_city: defAddr.city || "",
              ship_to_state: defAddr.state || "",
              ship_to_pincode: defAddr.pincode || "",
            }));
          } else {
            setAddress((a) => ({ ...a, ship_to_name: user.name || "" }));
            setShowAddNew(true);
          }
        }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  // Load factories for the Send-to-Factory allocation flow. All brand users
  // (not just admins) can send a cart to a factory — admins are notified by
  // email so they can monitor what their team delegates. Factory-type
  // enterprises don't see this (they can't sub-delegate).
  useEffect(() => {
    if (!token || enterpriseType !== "brand") {
      setBrandFactories([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API}/api/brand/factories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setBrandFactories(await res.json());
      } catch { /* non-fatal — button simply stays hidden */ }
    })();
  }, [token, enterpriseType]);

  const sendToFactory = async () => {
    if (!pickedFactoryId) { toast.error("Select a factory"); return; }
    const items = [...sampleLines, ...bulkLines].map((l) => ({
      fabric_id: l.fabric_id,
      fabric_name: l.fabric_name,
      fabric_code: l.fabric_code || "",
      category_name: l.category_name || "",
      image_url: l.image_url || "",
      quantity: Number(l.quantity),
      unit: l.unit || "m",
      color_name: l.color_name || "",
      color_hex: l.color_hex || "",
      order_type: l.order_type,
      price_per_unit: Number(l.price_per_unit) || 0,
      moq: l.moq || "",
      seller_company: l.seller_company || "",
    }));
    if (items.length === 0) { toast.error("Cart is empty"); return; }
    setSending(true);
    try {
      const res = await fetch(`${API}/api/brand/factory-handoffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ factory_id: pickedFactoryId, items, note: sendNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to send");
      const factoryName = brandFactories.find((f) => f.id === pickedFactoryId)?.name || "factory";
      toast.success(`Sent ${items.length} item${items.length > 1 ? "s" : ""} to ${factoryName}. They'll see it on their Allocations tab.`);
      setShowSendModal(false);
      setPickedFactoryId("");
      setSendNote("");
      // Clear the cart — brand has handed these off.
      clear();
      // Nudge to the Allocations page so brand admin can track status
      navigate("/enterprise/allocations");
    } catch (err) {
      toast.error(err.message || "Failed to send");
    }
    setSending(false);
  };

  // Charges — mirror backend
  const bulkQty = bulkLines.reduce((s, l) => s + Number(l.quantity), 0);
  const bulkTax = +(bulkSubtotal * 0.05).toFixed(2);
  const bulkPackaging = bulkQty * 1;
  const bulkLogistics = Math.max(bulkSubtotal * 0.03, bulkLines.length ? 3000 : 0);
  const bulkTotal = +(bulkSubtotal + bulkTax + Math.max(bulkLogistics, bulkPackaging)).toFixed(2);

  const sampleTax = +(sampleSubtotal * 0.05).toFixed(2);
  const sampleCourier = sampleLines.length ? 100 : 0;
  const sampleTotal = +(sampleSubtotal + sampleTax + sampleCourier).toFixed(2);

  const availableCredit = summary?.credit?.available ?? 0;
  const availableSample = summary?.sample_credits?.available ?? 0;

  const bulkEnough = bulkLines.length === 0 || bulkTotal <= availableCredit + 0.01;
  const sampleEnough = sampleLines.length === 0 || Math.round(sampleTotal) <= availableSample;

  // Auto-switch payment method when credit can't cover the bulk total.
  useEffect(() => {
    if (bulkLines.length === 0) return;
    if (!bulkEnough && bulkPaymentMethod === "credit") setBulkPaymentMethod("razorpay");
    // If credit becomes adequate again (e.g. user removed items), snap back
    // to the default unless they explicitly chose Razorpay.
    if (bulkEnough && bulkPaymentMethod === "razorpay" && availableCredit > 0) {
      // keep user's choice; only reset if they had no credit at all
      if (availableCredit <= 0) setBulkPaymentMethod("razorpay");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkEnough, availableCredit, bulkLines.length]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const validateAddress = () => {
    const a = address;
    if (!a.ship_to_name.trim()) return "Please enter a contact name";
    if (!a.ship_to_phone.trim() || a.ship_to_phone.trim().length < 10) return "Enter a valid 10-digit phone";
    if (!a.ship_to_address.trim()) return "Enter a delivery address";
    if (!a.ship_to_city.trim()) return "Enter city";
    if (!a.ship_to_state.trim()) return "Enter state";
    if (!a.ship_to_pincode.trim() || !/^\d{6}$/.test(a.ship_to_pincode.trim())) return "Enter a valid 6-digit pincode";
    return null;
  };

  const placeOrders = async () => {
    if (!bulkLines.length && !sampleLines.length) return toast.error("Cart is empty");
    const err = validateAddress();
    if (err) return toast.error(err);
    if (enterpriseType === "factory") {
      if (!factory.po_file_url) return toast.error("Please upload the Purchase Order PDF");
      if (!factory.tech_pack_url) return toast.error("Please upload the Tech Pack PDF");
      if (!factory.qty_color_matrix.trim()) return toast.error("Please enter the Size × Color × Quantity breakdown");
    }
    // Credit check only applies when the user picked the credit path.
    if (bulkPaymentMethod === "credit" && !bulkEnough)
      return toast.error(`Not enough credit for bulk (₹${availableCredit.toFixed(2)} available). Switch to Pay via UPI / Card above.`);
    if (!sampleEnough) return toast.error(`Not enough sample credits (${availableSample} available)`);

    setPlacing(true);
    const placed = [];
    try {
      if (saveDefault) {
        await fetch(`${API}/api/brand/default-ship-to`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: address.ship_to_name,
            phone: address.ship_to_phone,
            address: address.ship_to_address,
            city: address.ship_to_city,
            state: address.ship_to_state,
            pincode: address.ship_to_pincode,
          }),
        });
      }

      const base = {
        ship_to_address: address.ship_to_address,
        ship_to_city: address.ship_to_city,
        ship_to_state: address.ship_to_state,
        ship_to_pincode: address.ship_to_pincode,
        notes: address.notes,
      };

      // Submit sample order first (independent, always uses sample credits)
      if (sampleLines.length > 0) {
        const res = await fetch(`${API}/api/brand/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...base,
            order_type: "sample",
            items: sampleLines.map((l) => ({
              fabric_id: l.fabric_id, quantity: l.quantity,
              color_name: l.color_name, color_hex: l.color_hex,
            })),
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || "Sample order failed");
        placed.push({ type: "sample", ...d });
      }

      if (bulkLines.length > 0) {
        const bulkPayload = {
          ...base,
          order_type: "bulk",
          items: bulkLines.map((l) => ({
            fabric_id: l.fabric_id, quantity: l.quantity,
            color_name: l.color_name, color_hex: l.color_hex,
          })),
        };

        if (bulkPaymentMethod === "razorpay") {
          // 1. Create the Razorpay order on our backend (authoritative amount)
          const createRes = await fetch(`${API}/api/brand/orders/razorpay/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(bulkPayload),
          });
          const createData = await createRes.json();
          if (!createRes.ok) throw new Error(createData.detail || "Could not start payment");

          // 2. Launch Razorpay Checkout (UPI / Card / NetBanking / Wallet)
          const ready = await loadRazorpayScript();
          if (!ready) throw new Error("Razorpay script failed to load");
          const rpResult = await new Promise((resolve, reject) => {
            const rp = new window.Razorpay({
              key: createData.key_id,
              amount: createData.amount_paise,
              currency: createData.currency,
              order_id: createData.razorpay_order_id,
              name: "Locofast",
              description: `Bulk order · ₹${createData.amount_inr.toLocaleString("en-IN")}`,
              prefill: { email: user?.email || "", contact: address.ship_to_phone || "" },
              notes: { brand_id: user?.brand_id || "" },
              theme: { color: "#059669" },
              handler: (resp) => resolve(resp),
              modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
            });
            rp.open();
          });

          // 3. Replay /brand/orders with the signed RP payload — backend
          //    re-validates signature + amount, debits nothing, creates order.
          const orderRes = await fetch(`${API}/api/brand/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              ...bulkPayload,
              payment_method: "razorpay",
              razorpay_order_id: rpResult.razorpay_order_id,
              razorpay_payment_id: rpResult.razorpay_payment_id,
              razorpay_signature: rpResult.razorpay_signature,
            }),
          });
          const orderData = await orderRes.json();
          if (!orderRes.ok) throw new Error(orderData.detail || "Order creation failed");
          placed.push({ type: "bulk", ...orderData });
        } else {
          // Credit path — backend debits FIFO
          const res = await fetch(`${API}/api/brand/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...bulkPayload, payment_method: "credit" }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.detail || "Bulk order failed");
          placed.push({ type: "bulk", ...d });
        }
      }

      clear();
      setSuccess(placed);
    } catch (err) {
      toast.error(err.message || "Order placement failed");
      if (placed.length > 0) {
        // Some orders succeeded — sync cart state
        clear();
        setSuccess(placed);
        toast.info("Some orders were placed before the error — check the Orders page");
      }
    }
    setPlacing(false);
  };

  if (success) {
    return (
      <BrandLayout>
        <div className="max-w-md mx-auto bg-white border border-emerald-200 rounded-2xl p-8 text-center" data-testid="brand-cart-success">
          <CheckCircle size={48} className="mx-auto text-emerald-600 mb-3" />
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Orders placed</h2>
          <p className="text-sm text-gray-500 mb-4">Confirmation emailed to you, your brand admin and our ops team.</p>
          <DispatchStrip className="mb-4" />
          <ul className="text-sm text-left space-y-2 bg-gray-50 rounded-lg p-3 mb-4">
            {success.map((o, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase mr-2 ${o.type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{o.type}</span>
                  <span className="font-mono">{o.order_number}</span>
                </span>
                <span className="font-semibold">{fmtINR(o.total)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Link to="/enterprise/orders" className="block w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium">View all orders</Link>
            <Link to="/enterprise/fabrics" className="block w-full bg-white border border-gray-300 py-2.5 rounded-lg text-sm">Back to catalog</Link>
          </div>
        </div>
      </BrandLayout>
    );
  }

  if (!bulkLines.length && !sampleLines.length) {
    return (
      <BrandLayout>
        <div className="max-w-md mx-auto text-center py-16">
          <ShoppingCart className="text-gray-300 mx-auto mb-4" size={56} />
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Your cart is empty</h2>
          <p className="text-sm text-gray-500 mb-4">Browse the catalogue to add samples or bulk orders.</p>
          <Link to="/enterprise/fabrics" className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            Browse Fabrics <ArrowRight size={14} />
          </Link>
        </div>
      </BrandLayout>
    );
  }

  return (
    <BrandLayout>
      {/* #3: Back-to-catalog so brands don't lose their browsing context after
          adding to cart. Uses history when available so filters survive. */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/enterprise/fabrics");
        }}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3 transition-colors"
        data-testid="brand-cart-back"
      >
        <ArrowLeft size={14} /> Back to catalog
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <ShoppingCart size={22} /> Shopping Cart
        </h1>
        <p className="text-sm text-gray-500 mt-1">Review, enter a shipping address, and place your orders</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ─── Left: items + address ─── */}
        <div className="space-y-5">
          {sampleLines.length > 0 && (
            <div className="bg-white border border-blue-200 rounded-xl overflow-hidden" data-testid="brand-cart-sample-section">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-800">
                  <Beaker size={14} />
                  <h3 className="text-sm font-semibold">Sample Requests · {sampleLines.length}</h3>
                </div>
                <span className="text-xs text-blue-700">Debited from sample credits · Max 5{sampleLines[0]?.unit || "m"} per line</span>
              </div>
              {sampleLines.map((l) => (
                <LineRow key={l.id} l={l} onQty={updateQty} onRemove={removeLine} />
              ))}
            </div>
          )}

          {bulkLines.length > 0 && (
            <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden" data-testid="brand-cart-bulk-section">
              <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800">
                  <ShoppingCart size={14} />
                  <h3 className="text-sm font-semibold">Bulk Orders · {bulkLines.length}</h3>
                </div>
                <span className="text-xs text-emerald-700">Debited FIFO from credit limit</span>
              </div>
              {bulkLines.map((l) => (
                <LineRow key={l.id} l={l} onQty={updateQty} onRemove={removeLine} />
              ))}
            </div>
          )}

          {/* ── Send to Factory (Option B: SKU allocation) ─────────────────────
             Visible to all brand users under a brand-type enterprise with at
             least one invited factory. Brand admins get an email whenever
             any teammate sends an allocation. Factory users don't see this —
             they see the "Allocations" tab instead. */}
          {enterpriseType === "brand" && brandFactories.length > 0 && (sampleLines.length + bulkLines.length) > 0 && (
            <div
              className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between gap-4"
              data-testid="brand-send-to-factory-cta"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                  <Factory size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-indigo-900">Allocate to a factory instead</h4>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Send this exact cart to one of your invited factories. They'll see it under Allocations and can place the order against their own credit line.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSendModal(true)}
                className="flex-shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                data-testid="brand-open-send-to-factory"
              >
                <Send size={14} /> Send to Factory
              </button>
            </div>
          )}

          {/* Address — saved-address picker + Add-new */}
          <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="brand-cart-address">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <MapPin size={14} /> Shipping Address
              </h3>
              {savedAddresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddNew((s) => !s)}
                  className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1 hover:underline"
                  data-testid="brand-cart-add-new-toggle"
                >
                  {showAddNew ? <><X size={11} /> Cancel</> : <><Plus size={11} /> Add new address</>}
                </button>
              )}
            </div>

            {savedAddresses.length === 0 || showAddNew ? (
              <>
                {savedAddresses.length === 0 && (
                  <p className="text-xs text-gray-500 mb-3">No saved addresses yet. Fill the form below — we'll save it for next time.</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input required placeholder="Contact name *" value={address.ship_to_name} onChange={(e) => setAddress({ ...address, ship_to_name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-ship-name" />
                  <input required placeholder="Phone *" value={address.ship_to_phone} onChange={(e) => setAddress({ ...address, ship_to_phone: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-ship-phone" />
                  <textarea required placeholder="Address * (street, landmark, etc.)" value={address.ship_to_address} onChange={(e) => setAddress({ ...address, ship_to_address: e.target.value })} rows={2} className="sm:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" data-testid="brand-ship-address" />
                  <input required placeholder="City *" value={address.ship_to_city} onChange={(e) => setAddress({ ...address, ship_to_city: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-ship-city" />
                  <input required placeholder="State *" value={address.ship_to_state} onChange={(e) => setAddress({ ...address, ship_to_state: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-ship-state" />
                  <input required placeholder="Pincode *" maxLength={6} value={address.ship_to_pincode} onChange={(e) => setAddress({ ...address, ship_to_pincode: e.target.value.replace(/\D/g, "") })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-ship-pincode" />
                  <textarea placeholder="Order notes (optional)" value={address.notes} onChange={(e) => setAddress({ ...address, notes: e.target.value })} rows={2} className="sm:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
                </div>
                <label className="flex items-center gap-2 mt-3 text-xs text-gray-600">
                  <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                  Save as default shipping address for my enterprise
                </label>
              </>
            ) : (
              <div className="space-y-2" data-testid="brand-cart-saved-addresses">
                {savedAddresses.map((a) => {
                  const selected = selectedAddressId === a.id;
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => pickSavedAddress(a)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition ${selected ? "border-emerald-500 bg-emerald-50/40" : "border-gray-200 hover:border-emerald-300"}`}
                      data-testid={`brand-cart-saved-${a.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {a.label && <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">{a.label}</span>}
                            <span className="font-medium text-sm text-gray-900">{a.name || "—"}</span>
                            {a.is_default && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Default</span>}
                            {a.source === "factory" && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">Factory · {a.factory_name}</span>}
                            {a.source === "gst" && !a.factory_name && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">GST-seeded</span>}
                          </div>
                          <p className="text-xs text-gray-700 mt-1">{a.address}</p>
                          <p className="text-[11px] text-gray-500">{[a.city, a.state, a.pincode].filter(Boolean).join(", ")}{a.phone ? ` · ${a.phone}` : ""}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${selected ? "border-emerald-500 bg-emerald-500" : "border-gray-300"}`}>
                          {selected && <Check size={10} className="text-white m-0.5" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
                <textarea placeholder="Order notes (optional)" value={address.notes} onChange={(e) => setAddress({ ...address, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none mt-2" />
              </div>
            )}
          </div>

          {/* Factory-only attachments */}
          {enterpriseType === "factory" && (
            <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="brand-cart-factory-attachments">
              <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                <Upload size={14} /> PO &amp; Tech Pack
              </h3>
              <p className="text-[11px] text-gray-500 mb-3">
                Factories must attach a Purchase Order and Tech Pack to every order, plus the size/color/quantity breakdown.
              </p>
              <div className="space-y-3">
                {[
                  { key: "po_file_url", upKey: "po_uploading", label: "Purchase Order (PDF)*", testid: "factory-po" },
                  { key: "tech_pack_url", upKey: "tp_uploading", label: "Tech Pack (PDF)*", testid: "factory-tp" },
                ].map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <label className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-xs cursor-pointer ${factory[f.upKey] ? "bg-gray-50 border-gray-200 text-gray-400" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`} data-testid={`${f.testid}-label`}>
                      {factory[f.upKey] ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {factory[f.upKey] ? "Uploading…" : factory[f.key] ? "Replace" : `Upload ${f.label}`}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        disabled={factory[f.upKey]}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setFactory((s) => ({ ...s, [f.upKey]: true }));
                          try {
                            const fd = new FormData();
                            fd.append("file", file);
                            const res = await fetch(`${API}/api/brand/upload-attachment`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                              body: fd,
                            });
                            const d = await res.json();
                            if (!res.ok) throw new Error(d.detail || "Upload failed");
                            setFactory((s) => ({ ...s, [f.key]: d.url, [f.upKey]: false }));
                            toast.success(`${f.label} uploaded`);
                          } catch (err) {
                            toast.error(err.message || "Upload failed");
                            setFactory((s) => ({ ...s, [f.upKey]: false }));
                          }
                          e.target.value = "";
                        }}
                        data-testid={`${f.testid}-input`}
                      />
                    </label>
                    {factory[f.key] && (
                      <a href={factory[f.key]} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline truncate max-w-[200px]" data-testid={`${f.testid}-link`}>
                        View uploaded file
                      </a>
                    )}
                  </div>
                ))}
                <div>
                  <p className="text-[11px] font-medium text-gray-600 mb-1">Size × Color × Quantity*</p>
                  <textarea
                    rows={4}
                    placeholder={"e.g.\nIndigo · M 500pcs, L 300pcs, XL 200pcs\nEcru · M 200pcs"}
                    value={factory.qty_color_matrix}
                    onChange={(e) => setFactory((s) => ({ ...s, qty_color_matrix: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none font-mono"
                    data-testid="factory-qty-matrix"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Right: order summary ─── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 self-start sticky top-20" data-testid="brand-cart-summary">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Summary</h3>

          {sampleLines.length > 0 && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-2">Samples ({sampleLines.length})</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtINR(sampleSubtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tax (5%)</span><span>{fmtINR(sampleTax)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Courier</span><span>{fmtINR(sampleCourier)}</span></div>
                <div className="flex justify-between font-semibold pt-1"><span>Total</span><span data-testid="brand-cart-sample-total">{fmtINR(sampleTotal)}</span></div>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Debited from sample credits · <strong data-testid="brand-cart-sample-balance">{fmtCount(availableSample)}</strong> available
              </p>
              {!sampleEnough && <p className="text-[11px] text-red-600 mt-1">Insufficient sample credits</p>}
            </div>
          )}

          {bulkLines.length > 0 && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-2">Bulk ({bulkLines.length})</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtINR(bulkSubtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tax (5%)</span><span>{fmtINR(bulkTax)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Logistics + packaging</span><span>{fmtINR(Math.max(bulkLogistics, bulkPackaging))}</span></div>
                <div className="flex justify-between font-semibold pt-1"><span>Total</span><span data-testid="brand-cart-bulk-total">{fmtINR(bulkTotal)}</span></div>
              </div>

              {/* Payment method toggle — shown whenever the brand has bulk lines. */}
              <div className="mt-3 space-y-1.5" data-testid="brand-bulk-payment-method">
                <p className="text-[11px] font-semibold text-gray-700">Pay with</p>
                <label className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer ${bulkPaymentMethod === "credit" ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-gray-300"} ${!bulkEnough ? "opacity-60" : ""}`}>
                  <input
                    type="radio"
                    name="bulk-pay"
                    value="credit"
                    checked={bulkPaymentMethod === "credit"}
                    onChange={() => setBulkPaymentMethod("credit")}
                    disabled={!bulkEnough}
                    data-testid="brand-pay-credit"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Locofast Credit Line</p>
                    <p className="text-[10px] text-gray-500">
                      {bulkEnough
                        ? <>Debited FIFO · <strong data-testid="brand-cart-credit-balance">{fmtLacs(availableCredit)}</strong> available</>
                        : <>Insufficient balance ({fmtINR(availableCredit)})</>}
                    </p>
                  </div>
                </label>
                <label className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer ${bulkPaymentMethod === "razorpay" ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input
                    type="radio"
                    name="bulk-pay"
                    value="razorpay"
                    checked={bulkPaymentMethod === "razorpay"}
                    onChange={() => setBulkPaymentMethod("razorpay")}
                    data-testid="brand-pay-razorpay"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Pay via UPI / Card / Net-banking</p>
                    <p className="text-[10px] text-gray-500">Powered by Razorpay · Instant confirmation</p>
                  </div>
                </label>
                {!bulkEnough && bulkPaymentMethod === "razorpay" && (
                  <p className="text-[10px] text-indigo-700 mt-1">Auto-selected because credit balance is low.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4 pt-2">
            <span className="text-sm font-semibold text-gray-900">Grand total</span>
            <span className="text-xl font-bold text-gray-900" data-testid="brand-cart-grand-total">{fmtINR(sampleTotal + bulkTotal)}</span>
          </div>

          <button
            onClick={placeOrders}
            disabled={placing || (bulkPaymentMethod === "credit" && !bulkEnough && bulkLines.length > 0) || (!sampleEnough && sampleLines.length > 0)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            data-testid="brand-place-order"
          >
            {placing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {bulkLines.length > 0 && bulkPaymentMethod === "razorpay"
              ? `Pay ₹${Math.round(bulkTotal).toLocaleString("en-IN")} & Place Order`
              : `Place ${sampleLines.length > 0 && bulkLines.length > 0 ? "Orders" : "Order"}`}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Confirmation emails go to you, your team admin, the sellers and Locofast ops.
          </p>
          <div className="mt-3 space-y-1">
            {sampleLines.length > 0 && <DispatchLine variant="sample" />}
            {bulkLines.length > 0 && <DispatchLine variant="bulk" />}
          </div>
        </div>
      </div>

      {/* ── Send-to-Factory modal ────────────────────────────────────────── */}
      {showSendModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !sending && setShowSendModal(false)}
          data-testid="brand-send-to-factory-modal"
        >
          <div
            className="bg-white rounded-xl w-full max-w-md shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-gray-900">
                <Factory size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold">Send cart to factory</h3>
              </div>
              <button onClick={() => !sending && setShowSendModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Factory</label>
                <select
                  value={pickedFactoryId}
                  onChange={(e) => setPickedFactoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  data-testid="brand-send-factory-select"
                >
                  <option value="">Select a factory…</option>
                  {brandFactories.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.verification_status === "unverified" ? " · pending verification" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Note to factory (optional)</label>
                <textarea
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. For SS26 collection. Please order by 15th May."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                  data-testid="brand-send-note"
                />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                <p className="font-medium text-gray-800 mb-1">You're sending {sampleLines.length + bulkLines.length} item{sampleLines.length + bulkLines.length !== 1 ? "s" : ""}</p>
                <ul className="space-y-0.5 text-gray-600 max-h-28 overflow-y-auto">
                  {[...sampleLines, ...bulkLines].map((l) => (
                    <li key={l.id} className="truncate">• {l.fabric_name} — {l.quantity}{l.unit || "m"} ({l.order_type}){l.color_name ? `, ${l.color_name}` : ""}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-gray-500">Your cart will be cleared once sent. The factory places and pays for the order itself.</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSendModal(false)}
                disabled={sending}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={sendToFactory}
                disabled={sending || !pickedFactoryId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
                data-testid="brand-confirm-send-to-factory"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandCart;
