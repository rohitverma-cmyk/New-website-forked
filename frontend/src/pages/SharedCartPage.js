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
        <div className="container-main py-8 max-w-3xl mx-auto">
          {/* Agent info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <User size={20} className="text-[#2563EB]" />
            <div>
              <p className="text-sm font-medium text-gray-900">Assisted booking by <span className="text-[#2563EB]">{cart?.agent_name || "Locofast Agent"}</span></p>
              <p className="text-xs text-gray-500">This cart was curated for you. Review and proceed to payment.</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold mb-6 flex items-center gap-3">
            <ShoppingCart size={24} />
            Your Cart
          </h1>

          <div className="space-y-3 mb-6">
            {cart?.items?.map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-5 border border-gray-200 flex gap-4" data-testid={`shared-cart-item-${idx}`}>
                {item.image_url && (
                  item.fabric_id ? (
                    <Link to={`/fabrics/${item.fabric_slug || item.fabric_id}`} target="_blank" rel="noreferrer" data-testid={`shared-cart-thumb-link-${idx}`}>
                      <img src={item.image_url} alt={item.fabric_name} className="w-20 h-20 object-cover rounded-lg hover:opacity-80 transition" />
                    </Link>
                  ) : <img src={item.image_url} alt={item.fabric_name} className="w-20 h-20 object-cover rounded-lg" />
                )}
                <div className="flex-1">
                  {item.fabric_id ? (
                    <Link
                      to={`/fabrics/${item.fabric_slug || item.fabric_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gray-900 hover:text-[#2563EB] inline-flex items-center gap-1.5 group"
                      data-testid={`shared-cart-pdp-link-${idx}`}
                    >
                      {item.fabric_name}
                      <ExternalLink size={12} className="text-gray-400 group-hover:text-[#2563EB]" />
                    </Link>
                  ) : (
                    <h3 className="font-medium text-gray-900">{item.fabric_name}</h3>
                  )}
                  <p className="text-xs text-gray-500">{item.category_name}</p>
                  {item.fabric_id && (
                    <Link
                      to={`/fabrics/${item.fabric_slug || item.fabric_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#2563EB] hover:underline mt-0.5 inline-block"
                    >
                      View full specifications →
                    </Link>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <span className="text-gray-600">{item.quantity} meters</span>
                    <span className="text-gray-600">@ ₹{item.price_per_meter}/m</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.order_type === "sample" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {item.order_type}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg text-gray-900">₹{(item.quantity * item.price_per_meter).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">GST (5%)</span>
              <span>₹{(subtotal * 0.05).toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-3 border-t text-lg font-semibold">
              <span>Estimated Total</span>
              <span className="text-emerald-600">₹{(subtotal * 1.05).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Logistics charges will be calculated at checkout.</p>
            <p className="text-xs text-amber-600 mt-1.5">For export orders, additional port charges, custom charges, export documentation &amp; cess may be applicable.</p>
          </div>

          {/* CTA */}
          {piOrderId ? (
            <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200 text-center">
              <FileText size={40} className="mx-auto mb-3 text-emerald-600" />
              <h3 className="text-lg font-semibold text-emerald-800 mb-1">Order Confirmed</h3>
              <p className="text-sm text-emerald-600 mb-4">Your Proforma Invoice is ready for download.</p>
              <button
                onClick={handleDownloadPI}
                className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                data-testid="download-pi-btn"
              >
                <Download size={18} />Download Proforma Invoice
              </button>
              <p className="text-xs text-emerald-500 mt-3">Payment: LC 90 days from date of LR</p>
            </div>
          ) : !isLoggedIn ? (
            <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
              <p className="text-gray-700 mb-4">Please sign in to proceed{isBangladesh ? "" : " with payment"}</p>
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#2563EB] text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                data-testid="shared-cart-login-btn"
              >
                {isBangladesh ? "Sign In & Confirm Order" : "Sign In & Checkout"} <ArrowRight size={16} />
              </button>
            </div>
          ) : isBangladesh ? (
            <button
              onClick={handleProceedToCheckout}
              disabled={confirming}
              className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white py-4 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              data-testid="confirm-export-btn"
            >
              {confirming ? <Loader2 size={18} className="animate-spin" /> : <><FileText size={18} />Confirm Order & Generate PI</>}
            </button>
          ) : (
            <button
              onClick={handleProceedToCheckout}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
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

export default SharedCartPage;
