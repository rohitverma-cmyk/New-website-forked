import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, Package, Truck, Mail, Phone, MapPin, ArrowRight, Loader2, AlertCircle, Download, FileText } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getOrder, downloadInvoice } from "../lib/api";
import { trackPurchase } from "../lib/analytics";

const OrderConfirmationPage = () => {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (orderNumber) {
      fetchOrder();
    }
  }, [orderNumber]);

  const fetchOrder = async () => {
    try {
      const res = await getOrder(orderNumber);
      setOrder(res.data);
      // GA4: track purchase
      if (res.data) trackPurchase(res.data);
    } catch (err) {
      setError("Order not found");
    }
    setLoading(false);
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

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        <Navbar />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Order Not Found</h1>
            <p className="text-gray-600 mb-6">We couldn't find the order you're looking for.</p>
            <Link to="/fabrics" className="btn-primary">
              Instant Booking
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const customer = order.customer || {};
  const items = order.items || [];
  const isPaid = order.payment_status === "paid";

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-grow pt-20" data-testid="order-confirmation-page">
        <div className="container-main py-8">
          {/* Success Header */}
          <div className="text-center mb-10">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${
              isPaid ? "bg-emerald-100" : "bg-yellow-100"
            }`}>
              {isPaid ? (
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              ) : (
                <Package className="w-10 h-10 text-yellow-600" />
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
              {isPaid ? "Order Confirmed!" : "Order Received"}
            </h1>
            <p className="text-gray-600 text-lg">
              {isPaid 
                ? "Thank you for your order. We'll start processing it right away."
                : "Your order has been received. Payment is pending."
              }
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Left: Order Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Order Info Card */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Order Number</p>
                    <p className="text-2xl font-semibold text-blue-600">{order.order_number}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {isPaid && (
                      <a
                        href={downloadInvoice(order.id || order.order_number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                        data-testid="download-invoice-btn"
                      >
                        <FileText size={16} />
                        Download Invoice
                      </a>
                    )}
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      isPaid 
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {isPaid ? "Paid" : "Payment Pending"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Order Items</h3>
                  <div className="space-y-4">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex gap-4">
                        <img
                          src={item.image_url || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100"}
                          alt={item.fabric_name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{item.fabric_name}</h4>
                          <p className="text-sm text-gray-600">{item.category_name}</p>
                          <div className="mt-1 flex items-center gap-3 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              item.order_type === "sample" 
                                ? "bg-blue-100 text-blue-700" 
                                : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {item.order_type === "sample" ? "Sample" : "Bulk"}
                            </span>
                            <span className="text-gray-600">{item.quantity}m × ₹{item.price_per_meter?.toLocaleString()}/m</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">₹{(item.quantity * item.price_per_meter).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t border-gray-100 pt-6 mt-6">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal</span>
                      <span>₹{order.subtotal?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">GST (5%)</span>
                      <span>₹{order.tax?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-gray-100 text-lg font-semibold">
                      <span>Total</span>
                      <span className="text-emerald-600">₹{order.total?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                
                {/* Estimated Delivery */}
                <div className="border-t border-gray-100 pt-6 mt-6">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                    <Truck size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">Estimated Delivery Timeline</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {items[0]?.order_type === "sample" 
                          ? (items[0]?.sample_delivery_days ? `${items[0].sample_delivery_days} days` : "1-3 days for samples")
                          : (items[0]?.bulk_delivery_days ? `${items[0].bulk_delivery_days} days` : "15-20 days for bulk orders")
                        }
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        Our team will confirm exact delivery date within 24 hours
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin size={18} />
                  Shipping Address
                </h3>
                <div className="text-gray-700">
                  <p className="font-medium">{customer.name}</p>
                  {customer.company && <p className="text-gray-600">{customer.company}</p>}
                  <p>{customer.address}</p>
                  <p>{customer.city}, {customer.state} {customer.pincode}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span className="flex items-center gap-1">
                      <Phone size={14} className="text-gray-400" />
                      {customer.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail size={14} className="text-gray-400" />
                      {customer.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Next Steps */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-6 border border-gray-200 sticky top-24">
                <h3 className="font-semibold text-gray-900 mb-4">What's Next?</h3>
                
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold text-sm">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Order Verification</p>
                      <p className="text-sm text-gray-600">Our team will verify stock availability</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold text-sm">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Confirmation Call</p>
                      <p className="text-sm text-gray-600">You'll receive a call within 24 hours</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold text-sm">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Dispatch & Tracking</p>
                      <p className="text-sm text-gray-600">Tracking details via SMS/Email</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 mt-6 pt-6">
                  <p className="text-sm text-gray-600 mb-4">
                    A confirmation email has been sent to <strong>{customer.email}</strong>
                  </p>
                  
                  <Link
                    to="/fabrics"
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Continue Shopping
                    <ArrowRight size={18} />
                  </Link>
                </div>

                {/* Support */}
                <div className="border-t border-gray-100 mt-6 pt-6 text-center">
                  <p className="text-sm text-gray-500 mb-2">Questions about your order?</p>
                  <a href="mailto:support@locofast.com" className="text-blue-600 text-sm font-medium hover:underline">
                    support@locofast.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrderConfirmationPage;
