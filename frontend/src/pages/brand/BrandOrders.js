import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import BrandLayout from "./BrandLayout";
import { ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const BrandOrders = () => {
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    (async () => {
      try {
        const res = await fetch(`${API}/api/brand/orders`, { headers: { Authorization: `Bearer ${token}` } });
        setOrders(await res.json());
      } catch { toast.error("Failed to load orders"); }
      setLoading(false);
    })();
  }, [token, user, navigate]);

  const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <BrandLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><ShoppingBag size={22} /> Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Orders placed via brand credit</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          No orders yet. Head to the catalog to place your first order.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="brand-orders-table">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Order #</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Items</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Paid with</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} data-testid={`brand-order-${o.id}`}>
                  <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{o.order_type}</span></td>
                  <td className="px-4 py-3 text-gray-700">{(o.items || []).length}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtINR(o.total)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{o.payment_method === "sample_credit" ? "Sample Credits" : "Credit Line"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandOrders;
