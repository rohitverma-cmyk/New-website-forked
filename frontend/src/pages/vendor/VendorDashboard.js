import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Clock, Truck, IndianRupee, Boxes, FileText, ArrowRight, Package, Loader2, TrendingUp } from "lucide-react";
import VendorLayout from "../../components/vendor/VendorLayout";
import { getVendorStats, getVendorOrders } from "../../lib/api";
import { useVendorAuth } from "../../context/VendorAuthContext";
import { OrderSourceChip } from "../../components/OrderTypeChips";

// ── Helpers ────────────────────────────────────────────────────────
const fmtINR = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};
const fmtMeters = (n) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} m`;

const stageMeta = {
  order_confirmation_needed: { label: "Order Confirmation Needed", tone: "bg-amber-100 text-amber-800" },
  awaiting_customer_full_payment: { label: "Awaiting Customer Full Payment", tone: "bg-blue-100 text-blue-800" },
  update_dispatch_details: { label: "Update Dispatch Details", tone: "bg-indigo-100 text-indigo-800" },
  dispatch_awaited: { label: "Dispatch Awaited", tone: "bg-purple-100 text-purple-800" },
  dispatched: { label: "Dispatched", tone: "bg-purple-100 text-purple-800" },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", tone: "bg-red-100 text-red-700" },
};

const bucketPill = {
  sample: { label: "Sample", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  small_bulk: { label: "Small Bulk", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  large_bulk: { label: "Large Bulk", tone: "bg-orange-50 text-orange-700 border-orange-200" },
};

// ── Hero stat tile ────────────────────────────────────────────────
const HeroStat = ({ icon: Icon, label, value, sub, tone, to, accent, testid }) => {
  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl border ${accent} p-6 transition-all hover:shadow-md hover:-translate-y-0.5`}
      data-testid={testid}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
          <p className="text-4xl font-bold mt-2 text-gray-900 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1.5">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl ${tone} flex items-center justify-center shrink-0`}>
          <Icon size={20} />
        </div>
      </div>
      {to && (
        <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-700 group-hover:text-gray-900">
          View orders <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="group block">{content}</Link>
  ) : content;
};

// ── Action-orders row ─────────────────────────────────────────────
const OrderRow = ({ order, ctaLabel, ctaTo, vendorQty, vendorValue }) => {
  const stage = order.vendor_stage || order.pipeline_stage || "order_confirmation_needed";
  const meta = stageMeta[stage] || stageMeta.order_confirmation_needed;
  const bucket = order.vendor_bucket;
  const bp = bucketPill[bucket];
  return (
    <div className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors" data-testid={`vendor-dash-order-${order.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/vendor/orders"
            className="font-semibold text-blue-600 hover:underline tabular-nums"
            data-testid={`vendor-dash-order-link-${order.id}`}
          >
            {order.order_number}
          </Link>
          {bp && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${bp.tone}`}>{bp.label}</span>
          )}
          <OrderSourceChip order={order} />
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.tone}`}>{meta.label}</span>
        </div>
        <p className="text-sm text-gray-600 mt-1 truncate">
          {(order.items || []).slice(0, 2).map((it) => it.fabric_name).filter(Boolean).join(" · ") || "Order items"}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {fmtMeters(vendorQty)} · {fmtINR(vendorValue)}
        </p>
      </div>
      <Link
        to={ctaTo}
        className="shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 inline-flex items-center gap-1.5"
        data-testid={`vendor-dash-cta-${order.id}`}
      >
        {ctaLabel} <ArrowRight size={12} />
      </Link>
    </div>
  );
};

// ── Action-orders panel ───────────────────────────────────────────
const ActionPanel = ({ title, hint, orders, emptyMsg, ctaLabel, ctaTo, accent, count, value, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden" data-testid={testid}>
    <div className={`px-5 py-4 border-b border-gray-100 flex items-center justify-between ${accent}`}>
      <div className="min-w-0">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{count}</p>
        <p className="text-[11px] text-gray-500">{fmtINR(value)}</p>
      </div>
    </div>
    <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
      {orders.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">{emptyMsg}</div>
      ) : (
        orders.map((o) => (
          <OrderRow key={o.id} order={o} ctaLabel={ctaLabel} ctaTo={ctaTo} vendorQty={o.__vendor_qty} vendorValue={o.__vendor_value} />
        ))
      )}
    </div>
    {orders.length > 0 && (
      <Link to={ctaTo} className="block px-5 py-3 text-center text-xs font-medium text-gray-700 hover:text-gray-900 border-t border-gray-100">
        Open Orders inbox →
      </Link>
    )}
  </div>
);

// ── Top sellers strip ─────────────────────────────────────────────
const TopProducts = ({ products }) => (
  <div className="bg-white rounded-2xl border border-gray-200" data-testid="vendor-dash-top-products">
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div>
        <h2 className="font-semibold text-gray-900">Top selling products</h2>
        <p className="text-xs text-gray-500 mt-0.5">Highest dispatched metres on Locofast</p>
      </div>
      <TrendingUp className="text-gray-300" size={18} />
    </div>
    {products.length === 0 ? (
      <div className="px-5 py-8 text-center text-sm text-gray-500">
        <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
        No products dispatched yet
      </div>
    ) : (
      <div className="divide-y divide-gray-100">
        {products.map((p, i) => (
          <div key={p.fabric_id} className="px-5 py-3 flex items-center gap-3" data-testid={`vendor-top-product-${p.fabric_id}`}>
            <span className="text-xs font-semibold text-gray-400 w-5 tabular-nums">#{i + 1}</span>
            {p.image_url ? (
              <img src={p.image_url} alt="" className="w-9 h-9 rounded-md object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{p.fabric_name || p.fabric_code || "—"}</p>
              <p className="text-[11px] text-gray-500 truncate">{p.category_name || ""}{p.fabric_code ? ` · ${p.fabric_code}` : ""}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtMeters(p.quantity_sold)}</p>
              <p className="text-[11px] text-gray-500">{p.orders_count} order{p.orders_count === 1 ? "" : "s"}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ── Page ──────────────────────────────────────────────────────────
const VendorDashboard = () => {
  const { vendor } = useVendorAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, ordersRes] = await Promise.all([getVendorStats(), getVendorOrders()]);
        if (cancelled) return;
        setStats(statsRes.data);
        setOrders(ordersRes.data || []);
      } catch (e) {
        // Layout still renders zero-state safely; no toast spam.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Bucket + annotate orders for the action panels.
  // pending     = "Order Confirmation Needed" (large_bulk only)
  // awaiting    = "Awaiting Customer Full Payment" (large_bulk after confirm)
  // dispatch    = "Update Dispatch Details" + "Dispatch Awaited" (all buckets)
  const { pendingApproval, dispatchPending } = useMemo(() => {
    const enrich = (o) => {
      const qty = (o.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
      const val = (o.items || []).reduce((s, it) => s + Number(it.quantity || 0) * Number(it.price_per_meter || 0), 0);
      return { ...o, __vendor_qty: qty, __vendor_value: val };
    };
    const pa = [];
    const dp = [];
    for (const raw of orders) {
      const o = enrich(raw);
      const s = o.vendor_stage || o.pipeline_stage;
      if (s === "order_confirmation_needed") pa.push(o);
      else if (s === "update_dispatch_details" || s === "dispatch_awaited") dp.push(o);
    }
    return { pendingApproval: pa.slice(0, 8), dispatchPending: dp.slice(0, 8) };
  }, [orders]);

  return (
    <VendorLayout>
      <div className="p-8 max-w-[1500px] mx-auto" data-testid="vendor-dashboard">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome, {vendor?.name || "Vendor"}
          </h1>
          <p className="text-gray-500 mt-1">
            {vendor?.company_name || ""}{stats?.vendor_code ? ` • ${stats.vendor_code}` : ""}
          </p>
        </div>

        {/* Hero stats — orders-first */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <HeroStat
            icon={Clock}
            label="Order confirmation needed"
            value={loading ? "…" : (stats?.orders_pending_approval ?? 0)}
            sub={loading ? " " : `${fmtINR(stats?.orders_pending_approval_value)} large-bulk awaiting your confirm`}
            tone="bg-amber-100 text-amber-700"
            accent="border-amber-200 bg-gradient-to-br from-amber-50 to-white"
            to="/vendor/orders"
            testid="vendor-dash-stat-pending"
          />
          <HeroStat
            icon={Truck}
            label="Dispatch pending"
            value={loading ? "…" : (stats?.orders_dispatch_pending ?? 0)}
            sub={loading ? " " : `${fmtINR(stats?.orders_dispatch_pending_value)} ready to ship`}
            tone="bg-indigo-100 text-indigo-700"
            accent="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white"
            to="/vendor/orders"
            testid="vendor-dash-stat-dispatch"
          />
          <HeroStat
            icon={IndianRupee}
            label="Business value generated"
            value={loading ? "…" : fmtINR(stats?.total_business_value)}
            sub={loading ? " " : `${stats?.orders_delivered ?? 0} delivered · ${stats?.total_orders ?? 0} total orders`}
            tone="bg-emerald-100 text-emerald-700"
            accent="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
            testid="vendor-dash-stat-gmv"
          />
        </div>

        {/* Action panels — the meat of the dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ActionPanel
            testid="vendor-dash-panel-pending"
            title={<><Clock size={16} className="text-amber-600" /> Order confirmation needed</>}
            hint="Confirm and enter actual roll quantities for large-bulk orders"
            orders={pendingApproval}
            emptyMsg={loading ? "Loading…" : "Nothing waiting on your confirmation. Nice."}
            ctaLabel="Confirm"
            ctaTo="/vendor/orders"
            accent="bg-amber-50/50"
            count={stats?.orders_pending_approval ?? 0}
            value={stats?.orders_pending_approval_value ?? 0}
          />
          <ActionPanel
            testid="vendor-dash-panel-dispatch"
            title={<><FileText size={16} className="text-indigo-600" /> Update dispatch details</>}
            hint="Upload tax invoice — auto-pushes to Shiprocket"
            orders={dispatchPending}
            emptyMsg={loading ? "Loading…" : "No dispatch tasks pending."}
            ctaLabel="Open"
            ctaTo="/vendor/orders"
            accent="bg-indigo-50/50"
            count={stats?.orders_dispatch_pending ?? 0}
            value={stats?.orders_dispatch_pending_value ?? 0}
          />
        </div>

        {/* Bottom strip: top products (compact) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200 p-6 h-full flex flex-col justify-between" data-testid="vendor-dash-cta-block">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Boxes size={16} className="text-gray-600" /> Keep your catalog fresh</h3>
                <p className="text-sm text-gray-600 mt-1.5 max-w-xl">
                  Approved fabrics are visible to brand buyers right now. Add new variants or update stock to keep your conversion high.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link to="/vendor/inventory" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 inline-flex items-center gap-1.5" data-testid="vendor-dash-inventory-cta">
                  Manage inventory <ArrowRight size={14} />
                </Link>
                <span className="text-xs text-gray-500">
                  <span className="font-semibold text-emerald-700">{stats?.approved_fabrics ?? 0}</span> live ·
                  <span className="font-semibold text-amber-700 ml-1">{stats?.pending_fabrics ?? 0}</span> pending ·
                  <span className="font-semibold text-gray-700 ml-1">{stats?.total_fabrics ?? 0}</span> total
                </span>
              </div>
            </div>
          </div>
          <TopProducts products={stats?.top_products || []} />
        </div>

        {loading && (
          <div className="fixed bottom-6 right-6 bg-white border border-gray-200 shadow-md rounded-full px-3 py-2 text-xs text-gray-600 flex items-center gap-2" data-testid="vendor-dash-loading">
            <Loader2 size={12} className="animate-spin" /> Refreshing
          </div>
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorDashboard;
