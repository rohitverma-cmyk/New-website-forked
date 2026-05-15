import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ShoppingCart, Loader2, AlertCircle, ArrowRight, User, FileText, Download, ExternalLink } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import CustomerLoginModal from "../components/CustomerLoginModal";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const SharedCartPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, customer } = useCustomerAuth();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [piOrderId, setPiOrderId] = useState(null);

  const isBangladesh = cart?.dispatch_country === "bangladesh";

  useEffect(() => {
    fetchCart();
  }, [token]);

  const fetchCart = async () => {
    try {
      const res = await fetch(`${API}/api/agent/cart/${token}`);
      const text = await res.text();
      if (!res.ok) {
        const data = JSON.parse(text);
        throw new Error(data.detail || "Cart not found");
      }
      setCart(JSON.parse(text));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleProceedToCheckout = () => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    if (isBangladesh) {
      handleConfirmExportOrder();
      return;
    }
    if (cart?.items?.length > 0) {
      const item = cart.items[0];
      const params = new URLSearchParams({
        fabric_id: item.fabric_id,
        type: item.order_type,
        qty: String(item.quantity),
        shared_cart: token,
        agent_id: cart.agent_id || "",
        agent_email: cart.agent_email || "",
        agent_name: cart.agent_name || "",
      });
      navigate(`/checkout?${params.toString()}`);
    }
  };

  const handleConfirmExportOrder = async () => {
    if (!cart?.items?.length) return;
    setConfirming(true);
    try {
      const item = cart.items[0];
      const res = await fetch(`${API}/api/orders/confirm-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.items.map((i) => ({
            fabric_id: i.fabric_id,
            fabric_name: i.fabric_name,
            fabric_code: i.fabric_code || "",
            category_name: i.category_name || "",
            seller_id: i.seller_id || "",
            seller_company: i.seller_company || "",
            quantity: i.quantity,
            price_per_meter: i.price_per_meter,
            order_type: i.order_type || "bulk",
            hsn_code: i.hsn_code || "",
          })),
          customer: {
            name: customer?.name || customer?.email || "",
            email: customer?.email || "",
            phone: customer?.phone || "",
            company: customer?.company_name || "",
            address: customer?.address || "",
            city: customer?.city || "",
            state: customer?.state || "",
            pincode: customer?.pincode || "",
            gst_number: customer?.gst_number || "",
          },
          shared_cart_token: token,
          agent_id: cart.agent_id || "",
          agent_email: cart.agent_email || "",
          agent_name: cart.agent_name || "",
        }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.detail || "Failed to confirm order");
      setPiOrderId(data.order_id);
      toast.success(`Order confirmed! PI Number: ${data.pi_number}`);
    } catch (err) {
      toast.error(err.message);
    }
    setConfirming(false);
  };

  const handleDownloadPI = () => {
    if (piOrderId) {
      window.open(`${API}/api/orders/${piOrderId}/proforma-invoice`, "_blank");
    }
  };

  const subtotal = cart?.items?.reduce((s, i) => s + i.quantity * i.price_per_meter, 0) || 0;
  // Bulk pricing — May 2026 rule: packaging and logistics are
  // INDEPENDENT line items (no derivation). Mirrors CheckoutPage and the
  // backend's calculate_totals. The buyer sees the same numbers in cart
  // and at checkout.
  const hasBulk = (cart?.items || []).some((it) => (it.order_type || "bulk") === "bulk");
  const totalQty = (cart?.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const sharedCartPackaging = hasBulk ? totalQty * 1 : 0;
  const sharedCartLogisticsOnly = hasBulk
    ? Math.max(subtotal * 0.03, 3000)
    : 100 * (cart?.items?.length || 0);
  const sharedCartTaxBase = subtotal + sharedCartPackaging + sharedCartLogisticsOnly;
  const sharedCartGst = Math.round(sharedCartTaxBase * 0.05 * 100) / 100;
  const sharedCartGrandTotal = sharedCartTaxBase + sharedCartGst;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-20">
          <div className="text-center max-w-md mx-auto px-4">
            <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cart Unavailable</h2>
            <p className="text-gray-600">{error}</p>
            <button onClick={() => navigate("/fabrics")} className="mt-6 px-6 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700">
              Browse Fabrics
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-grow pt-20" data-testid="shared-cart-page">
        <div className="container-main px-3 sm:px-6 py-4 sm:py-8 max-w-3xl mx-auto">
          {/* Agent info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start sm:items-center gap-2.5 sm:gap-3">
            <User size={18} className="text-[#2563EB] shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <p className="text-[13px] sm:text-sm font-medium text-gray-900 leading-snug">Assisted booking by <span className="text-[#2563EB]">{cart?.agent_name || "Locofast Agent"}</span></p>
              <p className="text-[11px] sm:text-xs text-gray-500 leading-snug">This cart was curated for you. Review and proceed to payment.</p>
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center gap-2.5">
            <ShoppingCart size={22} />
            Your Cart
          </h1>

          <div className="space-y-3 mb-5 sm:mb-6">
            {cart?.items?.map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-3 sm:p-5 border border-gray-200 flex gap-3 sm:gap-4" data-testid={`shared-cart-item-${idx}`}>
                {item.image_url && (
                  item.fabric_id ? (
                    <Link to={`/fabrics/${item.fabric_slug || item.fabric_id}`} target="_blank" rel="noreferrer" data-testid={`shared-cart-thumb-link-${idx}`} className="shrink-0">
                      <img src={item.image_url} alt={item.fabric_name} className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg hover:opacity-80 transition" />
                    </Link>
                  ) : <img src={item.image_url} alt={item.fabric_name} className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {item.fabric_id ? (
                    <Link
                      to={`/fabrics/${item.fabric_slug || item.fabric_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[13px] sm:text-base text-gray-900 hover:text-[#2563EB] inline-flex items-start gap-1.5 group leading-snug"
                      data-testid={`shared-cart-pdp-link-${idx}`}
                    >
                      <span className="line-clamp-2">{item.fabric_name}</span>
                      <ExternalLink size={11} className="text-gray-400 group-hover:text-[#2563EB] shrink-0 mt-1" />
                    </Link>
                  ) : (
                    <h3 className="font-medium text-[13px] sm:text-base text-gray-900 leading-snug line-clamp-2">{item.fabric_name}</h3>
                  )}
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">{item.category_name}</p>
                  {item.fabric_id && (
                    <Link
                      to={`/fabrics/${item.fabric_slug || item.fabric_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#2563EB] hover:underline mt-0.5 hidden sm:inline-block"
                    >
                      View full specifications →
                    </Link>
                  )}
                  <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] sm:text-sm">
                    <span className="text-gray-700 font-medium">{item.quantity}m</span>
                    <span className="text-gray-600">@ ₹{item.price_per_meter}/m</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {item.order_type}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm sm:text-lg text-gray-900 whitespace-nowrap">₹{(item.quantity * item.price_per_meter).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 mb-5 sm:mb-6" data-testid="shared-cart-summary">
            <SummaryRow label="Goods Subtotal" value={subtotal} bold />
            {hasBulk && <SummaryRow label="Packaging (₹1/m)" value={sharedCartPackaging} />}
            <SummaryRow label="Logistics" value={sharedCartLogisticsOnly} />
            <div className="flex justify-between gap-3 text-[11px] sm:text-xs text-gray-500 mb-2 border-t border-dashed pt-2">
              <span className="leading-snug">Taxable value <span className="hidden sm:inline">(Goods + Packaging + Logistics)</span></span>
              <span className="tabular-nums whitespace-nowrap">₹{sharedCartTaxBase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <SummaryRow label="GST (5%)" value={sharedCartGst} />
            <div className="flex justify-between gap-3 pt-3 border-t text-base sm:text-lg font-semibold">
              <span>Estimated Total</span>
              <span className="text-emerald-600 tabular-nums whitespace-nowrap" data-testid="shared-cart-grand-total">₹{sharedCartGrandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-2 leading-snug">Final logistics is min ₹3,000 or 3% of goods, whichever is higher (bulk orders).</p>
            <p className="text-[11px] sm:text-xs text-amber-600 mt-1.5 leading-snug">For export orders, additional port charges, custom charges, export documentation &amp; cess may be applicable.</p>
          </div>

          {/* CTA */}
          {piOrderId ? (
            <div className="bg-emerald-50 rounded-xl p-4 sm:p-6 border border-emerald-200 text-center">
              <FileText size={36} className="mx-auto mb-2.5 text-emerald-600" />
              <h3 className="text-base sm:text-lg font-semibold text-emerald-800 mb-1">Order Confirmed</h3>
              <p className="text-xs sm:text-sm text-emerald-600 mb-4">Your Proforma Invoice is ready for download.</p>
              <button
                onClick={handleDownloadPI}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
                data-testid="download-pi-btn"
              >
                <Download size={18} />Download Proforma Invoice
              </button>
              <p className="text-[11px] sm:text-xs text-emerald-500 mt-3">Payment: LC 90 days from date of LR</p>
            </div>
          ) : !isLoggedIn ? (
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 text-center">
              <p className="text-sm sm:text-base text-gray-700 mb-3 sm:mb-4">Please sign in to proceed{isBangladesh ? "" : " with payment"}</p>
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-[#2563EB] text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                data-testid="shared-cart-login-btn"
              >
                {isBangladesh ? "Sign In & Confirm Order" : "Sign In & Checkout"} <ArrowRight size={16} />
              </button>
            </div>
          ) : isBangladesh ? (
            <button
              onClick={handleProceedToCheckout}
              disabled={confirming}
              className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-3.5 sm:py-4 rounded-xl text-sm sm:text-base font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              data-testid="confirm-export-btn"
            >
              {confirming ? <Loader2 size={18} className="animate-spin" /> : <><FileText size={18} />Confirm Order & Generate PI</>}
            </button>
          ) : (
            <button
              onClick={handleProceedToCheckout}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 sm:py-4 rounded-xl text-sm sm:text-base font-semibold hover:bg-emerald-700 transition-colors"
              data-testid="shared-cart-checkout-btn"
            >
              Proceed to Checkout <ArrowRight size={18} />
            </button>
          )}
        </div>
      </main>
      <Footer />
      {showLogin && <CustomerLoginModal open={showLogin} onClose={() => { setShowLogin(false); }} />}
    </div>
  );
};

// Tiny presentational helper for summary rows — keeps the markup tight.
const SummaryRow = ({ label, value, bold }) => (
  <div className="flex justify-between gap-3 text-[13px] sm:text-sm mb-2">
    <span className="text-gray-600">{label}</span>
    <span className={`tabular-nums whitespace-nowrap ${bold ? "font-medium" : ""}`}>₹{Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  </div>
);

export default SharedCartPage;
