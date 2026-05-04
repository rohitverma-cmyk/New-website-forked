import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Factory, Send, CheckCircle, XCircle, Clock, Loader2, Inbox, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BrandLayout from "./BrandLayout";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { useBrandCart } from "../../context/BrandCartContext";

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Factory-cart allocations (Option B).
 *
 * Brand-side view: "Sent" — allocations my team has pushed to our factories.
 * Factory-side view: "Incoming" — allocations my parent brand has sent me,
 * with Accept (merges items into my cart) or Reject buttons.
 */
const statusPill = (status) => {
  const map = {
    pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
    accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
    rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border rounded-full ${m.cls}`}>
      <Icon size={11} /> {m.label}
    </span>
  );
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const BrandAllocations = () => {
  const { user, token } = useBrandAuth();
  const { addLine } = useBrandCart();
  const navigate = useNavigate();
  const [enterpriseType, setEnterpriseType] = useState("brand");
  const [loading, setLoading] = useState(true);
  const [handoffs, setHandoffs] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const isFactory = enterpriseType === "factory";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const meRes = await fetch(`${API}/api/brand/me`, { headers: { Authorization: `Bearer ${token}` } });
      const me = await meRes.json();
      const type = me?.brand?.type || "brand";
      setEnterpriseType(type);
      const path = type === "factory" ? "/api/brand/factory-handoffs/incoming" : "/api/brand/factory-handoffs";
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load");
      setHandoffs(await res.json());
    } catch (err) {
      toast.error(err.message || "Could not load allocations");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const acceptHandoff = async (h) => {
    setBusyId(h.id);
    try {
      const res = await fetch(`${API}/api/brand/factory-handoffs/${h.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      // Merge items into this factory's cart (client-side). Same shape as
      // BrandCartContext.addLine so sample/bulk split + merge-by-fabric works.
      for (const it of h.items) {
        addLine({
          fabric_id: it.fabric_id,
          fabric_name: it.fabric_name,
          fabric_code: it.fabric_code,
          category_name: it.category_name,
          image_url: it.image_url,
          quantity: Number(it.quantity),
          unit: it.unit || "m",
          color_name: it.color_name || "",
          color_hex: it.color_hex || "",
          order_type: it.order_type,
          price_per_unit: Number(it.price_per_unit) || 0,
          moq: it.moq || "",
          seller_company: it.seller_company || "",
        });
      }
      toast.success(`Added ${h.items.length} item${h.items.length > 1 ? "s" : ""} to your cart. Review and place the order.`);
      await load();
      navigate("/enterprise/cart");
    } catch (err) {
      toast.error(err.message || "Failed");
    }
    setBusyId(null);
  };

  const rejectHandoff = async (h) => {
    if (!window.confirm(`Reject this allocation from ${h.brand_user_name}?`)) return;
    setBusyId(h.id);
    try {
      const res = await fetch(`${API}/api/brand/factory-handoffs/${h.id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success("Allocation rejected");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed");
    }
    setBusyId(null);
  };

  const counts = useMemo(() => {
    const base = { pending: 0, accepted: 0, rejected: 0 };
    for (const h of handoffs) base[h.status] = (base[h.status] || 0) + 1;
    return base;
  }, [handoffs]);

  return (
    <BrandLayout>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            {isFactory ? <Inbox size={22} /> : <Send size={22} />}
            {isFactory ? "Incoming Allocations" : "SKU Allocations to Factories"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isFactory
              ? "Fabric lists your parent brand has sent for you to purchase. Accept to load them into your cart."
              : "Send your cart to an invited factory. They place and pay for the order against their own credit line."}
          </p>
        </div>
        {!isFactory && (
          <button
            onClick={() => navigate("/enterprise/cart")}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            data-testid="brand-goto-cart-from-allocations"
          >
            Go to cart <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-5" data-testid="allocations-summary">
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-full"><Clock size={11} /> {counts.pending} pending</span>
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full"><CheckCircle size={11} /> {counts.accepted} accepted</span>
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-full"><XCircle size={11} /> {counts.rejected} rejected</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-indigo-600" /></div>
      ) : handoffs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl" data-testid="allocations-empty">
          <Factory size={44} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">
            {isFactory ? "No allocations yet" : "No SKU allocations sent yet"}
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            {isFactory
              ? "When your parent brand shares fabrics, they'll show up here."
              : "Build a cart on /enterprise/cart and use 'Send to Factory' to allocate SKUs for a factory to purchase."}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="allocations-list">
          {handoffs.map((h) => (
            <div key={h.id} className="bg-white border border-gray-200 rounded-xl p-4" data-testid={`allocation-${h.id}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {statusPill(h.status)}
                    <span className="text-xs text-gray-400">· {formatDate(h.created_at)}</span>
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900">
                    {isFactory
                      ? <>From <span className="text-indigo-700">{h.brand_user_name}</span> · {h.items.length} item{h.items.length !== 1 ? "s" : ""}</>
                      : <>To <span className="text-indigo-700">{h.factory_name}</span> · {h.items.length} item{h.items.length !== 1 ? "s" : ""}</>}
                  </h3>
                  {h.note && <p className="text-xs text-gray-600 mt-1 italic">"{h.note}"</p>}
                </div>
                {isFactory && h.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => rejectHandoff(h)}
                      disabled={busyId === h.id}
                      className="px-3 py-1.5 text-xs text-rose-700 border border-rose-200 rounded-md hover:bg-rose-50 disabled:opacity-50"
                      data-testid={`reject-${h.id}`}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => acceptHandoff(h)}
                      disabled={busyId === h.id}
                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md flex items-center gap-1"
                      data-testid={`accept-${h.id}`}
                    >
                      {busyId === h.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Accept &amp; add to cart
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 border-t border-gray-100 pt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {h.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs" data-testid={`allocation-item-${h.id}-${idx}`}>
                    {it.image_url ? (
                      <img src={it.image_url} alt="" className="w-9 h-9 rounded object-cover border border-gray-200" loading="lazy" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{it.fabric_name}</p>
                      <p className="text-gray-500 text-[11px]">
                        {it.quantity}{it.unit || "m"} · {it.order_type}
                        {it.color_name ? ` · ${it.color_name}` : ""}
                        {it.price_per_unit ? ` · ₹${it.price_per_unit}/${it.unit || "m"}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandAllocations;
