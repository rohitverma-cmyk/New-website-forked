// Admin "Edit Order" modal — full CRUD across items, customer, ship-to,
// and vendor with a built-in audit trail viewer.
//
// Key business rules enforced from the backend (do NOT reimplement here):
//   • Item prices stay the same when the vendor changes (per business rule)
//   • Recompute totals server-side (we just display the result)
//   • If Shiprocket was already pushed, the backend cancels & re-pushes
//   • Audit row is created for every save
//
// UX:
//   • Single modal with sticky tab bar — Items / Customer / Shipping / Vendor / History
//   • Each tab is self-contained
//   • Bottom bar shows recomputed total preview vs. current total
//   • Save → PATCH /api/orders/{id}/edit → toast + onSaved callback
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Edit3, History, Truck, User, ShoppingCart, Store, Trash2, Plus, AlertCircle, CheckCircle2, ExternalLink, MapPin, Star } from "lucide-react";
import { toast } from "sonner";
import { adminEditOrder, listOrderEdits, listSellerPickupAddresses } from "../../lib/api";

const API = process.env.REACT_APP_BACKEND_URL;
const TABS = [
  { id: "items", label: "Items", icon: ShoppingCart },
  { id: "customer", label: "Customer", icon: User },
  { id: "ship_to", label: "Shipping", icon: Truck },
  { id: "vendor", label: "Vendor", icon: Store },
  { id: "pickup", label: "Pickup", icon: MapPin },
  { id: "history", label: "History", icon: History },
];

const EditOrderModal = ({ order, onClose, onSaved }) => {
  const [active, setActive] = useState("items");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [customer, setCustomer] = useState({});
  const [shipTo, setShipTo] = useState({});
  const [hasShipTo, setHasShipTo] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [pickupAddressId, setPickupAddressId] = useState("");      // chosen pickup id (empty = use primary)
  const [sellerPickups, setSellerPickups] = useState([]);          // list of seller's saved addresses
  const [pickupsLoading, setPickupsLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [allSellers, setAllSellers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [repushShiprocket, setRepushShiprocket] = useState(true);

  const token = localStorage.getItem("locofast_token");

  // Hydrate local state from the order whenever the modal opens
  useEffect(() => {
    if (!order) return;
    setActive("items");
    setItems(JSON.parse(JSON.stringify(order.items || [])));
    setCustomer({ ...(order.customer || {}) });
    setShipTo({ ...(order.ship_to || { name: "", company: "", gst_number: "", address: "", city: "", state: "", pincode: "", phone: "" }) });
    setHasShipTo(!!order.ship_to);
    setSellerId(order.seller_id || (order.items?.[0]?.seller_id) || "");
    setPickupAddressId(order.pickup_address_id || "");
    setNotes(order.notes || "");
    setRepushShiprocket(true);
    // Lazy-load sellers list once per open
    fetch(`${API}/api/sellers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAllSellers(Array.isArray(d) ? d : d?.sellers || []))
      .catch(() => setAllSellers([]));
    // Audit trail
    listOrderEdits(order.id).then((r) => setAudit(r.data?.edits || [])).catch(() => setAudit([]));
  }, [order?.id, order?.updated_at, token]);

  // Whenever the selected vendor changes, reload that vendor's
  // saved pickup addresses. The dropdown in the Pickup tab is
  // strictly bounded to this list.
  useEffect(() => {
    if (!sellerId) { setSellerPickups([]); return; }
    setPickupsLoading(true);
    listSellerPickupAddresses(sellerId)
      .then((r) => setSellerPickups(r.data?.addresses || []))
      .catch(() => setSellerPickups([]))
      .finally(() => setPickupsLoading(false));
  }, [sellerId]);

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + Number(it.price_per_meter || 0) * Number(it.quantity || 0),
      0
    );
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    return { subtotal: Math.round(subtotal * 100) / 100, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  }, [items]);

  const totalChanged =
    order && (totals.subtotal !== Number(order.subtotal) || totals.total !== Number(order.total));

  const save = async () => {
    setSubmitting(true);
    try {
      // Only send the ship_to block when the user has enabled it AND
      // populated at least the address — otherwise we send an empty
      // ship_to (all blanks) so the backend treats it as a clear.
      const cleanedShipTo = hasShipTo
        ? { ...shipTo }
        : { name: "", company: "", gst_number: "", address: "", city: "", state: "", pincode: "", phone: "" };

      const payload = {
        items: items.map((it) => ({
          fabric_id: it.fabric_id,
          fabric_name: it.fabric_name,
          fabric_code: it.fabric_code || "",
          category_id: it.category_id || "",
          category_name: it.category_name || "",
          seller_id: it.seller_id || "",
          seller_company: it.seller_company || "",
          quantity: Number(it.quantity || 0),
          price_per_meter: Number(it.price_per_meter || 0),
          order_type: it.order_type || "production",
          image_url: it.image_url || "",
        })),
        customer: customer,
        ship_to: cleanedShipTo,
        seller_id: sellerId || null,
        pickup_address_id: pickupAddressId || "",
        notes: notes,
        repush_shiprocket: repushShiprocket,
      };
      const res = await adminEditOrder(order.id, payload);
      const data = res.data || {};
      if (data.no_changes) {
        toast.info("No changes detected");
      } else {
        const parts = [];
        if (data.vendor_changed) parts.push("vendor reassigned");
        if (data.shiprocket?.success) parts.push("Shiprocket shipment re-created");
        else if (data.shiprocket?.success === false) parts.push("Shiprocket re-push failed (see logs)");
        toast.success(`Order updated${parts.length ? " · " + parts.join(", ") : ""}`);
      }
      onSaved?.(data.order || order);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Edit failed");
    }
    setSubmitting(false);
  };

  if (!order) return null;
  const editable = !["delivered", "cancelled"].includes(order.status);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="edit-order-modal"
    >
      <div
        className="bg-white rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Edit3 size={18} className="text-indigo-600" /> Edit Order · {order.order_number}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Status: <span className="font-medium">{order.status}</span> ·
              Total: ₹{Number(order.total || 0).toLocaleString("en-IN")} ·
              {order.shiprocket_order_id ? ` SR #${order.shiprocket_order_id}` : " Not pushed to Shiprocket"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={20} className="text-gray-400 hover:text-gray-700" /></button>
        </div>

        {!editable && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            This order is {order.status}. The audit history is still viewable, but edits are disabled.
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 pt-3 border-b flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${
                active === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
              data-testid={`edit-order-tab-${t.id}`}
            >
              <t.icon size={14} /> {t.label}
              {t.id === "history" && audit.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {audit.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {active === "items" && (
            <ItemsTab items={items} setItems={setItems} editable={editable} />
          )}
          {active === "customer" && (
            <CustomerTab customer={customer} setCustomer={setCustomer} editable={editable} />
          )}
          {active === "ship_to" && (
            <ShipToTab
              shipTo={shipTo}
              setShipTo={setShipTo}
              hasShipTo={hasShipTo}
              setHasShipTo={setHasShipTo}
              editable={editable}
            />
          )}
          {active === "vendor" && (
            <VendorTab
              sellers={allSellers}
              sellerId={sellerId}
              setSellerId={setSellerId}
              currentSellerId={order.seller_id || order.items?.[0]?.seller_id || ""}
              editable={editable}
            />
          )}
          {active === "pickup" && (
            <PickupTab
              sellerId={sellerId}
              sellerPickups={sellerPickups}
              pickupsLoading={pickupsLoading}
              pickupAddressId={pickupAddressId}
              setPickupAddressId={setPickupAddressId}
              editable={editable}
              currentVendorCompany={
                allSellers.find((s) => s.id === sellerId)?.company_name ||
                order.seller_company || ""
              }
            />
          )}
          {active === "history" && <HistoryTab audit={audit} />}

          {/* Notes (always visible) */}
          {active !== "history" && (
            <div className="pt-3 border-t">
              <label className="text-xs font-medium text-gray-700 mb-1 block">Internal notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!editable}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                placeholder="Anything else operations should know about this edit?"
                data-testid="edit-order-notes"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 space-y-0.5">
            <div>
              New subtotal: <strong>₹{totals.subtotal.toLocaleString("en-IN")}</strong> · GST: ₹
              {totals.tax.toLocaleString("en-IN")} · <span className="text-emerald-700">Total: ₹{totals.total.toLocaleString("en-IN")}</span>
            </div>
            {totalChanged && (
              <div className="text-amber-600 flex items-center gap-1">
                <AlertCircle size={11} />
                Total {totals.total > Number(order.total) ? "increased" : "decreased"} by ₹
                {Math.abs(totals.total - Number(order.total)).toLocaleString("en-IN")}
              </div>
            )}
            {order.shiprocket_order_id && (
              <label className="flex items-center gap-1.5 mt-1">
                <input
                  type="checkbox"
                  checked={repushShiprocket}
                  onChange={(e) => setRepushShiprocket(e.target.checked)}
                  data-testid="edit-order-repush-shiprocket"
                />
                <span>Cancel old SR shipment & re-push with current vendor + address</span>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={!editable || submitting}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm inline-flex items-center gap-2"
              data-testid="edit-order-save-btn"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Items tab ───────────────────────────────────────────────────────
const ItemsTab = ({ items, setItems, editable }) => {
  const update = (i, k, v) => {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    setItems(next);
  };
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const add = () =>
    setItems([
      ...items,
      {
        fabric_id: "",
        fabric_name: "Manual line",
        fabric_code: "",
        quantity: 1,
        price_per_meter: 0,
        order_type: "production",
        seller_id: items[0]?.seller_id || "",
        seller_company: items[0]?.seller_company || "",
      },
    ]);

  return (
    <div className="space-y-2" data-testid="edit-order-items-tab">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-start border border-gray-200 rounded-lg p-3" data-testid={`edit-order-item-${i}`}>
          <div className="col-span-5">
            <label className="text-[10px] font-medium text-gray-500">Fabric</label>
            <input
              value={it.fabric_name || ""}
              onChange={(e) => update(i, "fabric_name", e.target.value)}
              disabled={!editable}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm disabled:bg-gray-50"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">{it.fabric_code || it.fabric_id}</p>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-gray-500">Qty (m)</label>
            <input
              type="number"
              value={it.quantity}
              onChange={(e) => update(i, "quantity", e.target.value)}
              disabled={!editable}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm disabled:bg-gray-50"
              data-testid={`edit-order-item-qty-${i}`}
            />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-gray-500">Rate ₹/m</label>
            <input
              type="number"
              value={it.price_per_meter}
              onChange={(e) => update(i, "price_per_meter", e.target.value)}
              disabled={!editable}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm disabled:bg-gray-50"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-gray-500">Type</label>
            <select
              value={it.order_type}
              onChange={(e) => update(i, "order_type", e.target.value)}
              disabled={!editable}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm bg-white disabled:bg-gray-50"
            >
              <option value="sample">Sample</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div className="col-span-1 flex items-end justify-end">
            <button
              onClick={() => remove(i)}
              disabled={!editable}
              className="p-2 text-red-500 hover:bg-red-50 rounded disabled:opacity-40"
              data-testid={`edit-order-item-remove-${i}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      {editable && (
        <button
          onClick={add}
          className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
          data-testid="edit-order-add-item"
        >
          <Plus size={14} /> Add line item
        </button>
      )}
    </div>
  );
};

// ── Customer tab ────────────────────────────────────────────────────
const CustomerTab = ({ customer, setCustomer, editable }) => {
  const F = ({ k, label, type = "text" }) => (
    <div>
      <label className="text-[10px] font-medium text-gray-600 mb-0.5 block">{label}</label>
      <input
        type={type}
        value={customer[k] || ""}
        onChange={(e) => setCustomer({ ...customer, [k]: e.target.value })}
        disabled={!editable}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
        data-testid={`edit-order-customer-${k}`}
      />
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid="edit-order-customer-tab">
      <F k="name" label="Name" />
      <F k="company" label="Company" />
      <F k="email" label="Email" type="email" />
      <F k="phone" label="Phone" />
      <F k="gst_number" label="GSTIN (billing)" />
      <div />
      <div className="md:col-span-2"><F k="address" label="Street address" /></div>
      <F k="city" label="City" />
      <F k="state" label="State" />
      <F k="pincode" label="PIN code" />
    </div>
  );
};

// ── Ship-to tab ─────────────────────────────────────────────────────
const ShipToTab = ({ shipTo, setShipTo, hasShipTo, setHasShipTo, editable }) => {
  const F = ({ k, label, readOnly = false }) => (
    <div>
      <label className="text-[10px] font-medium text-gray-600 mb-0.5 block">
        {label}
        {readOnly && hasShipTo && <span className="ml-1 text-[10px] text-emerald-600 font-normal">🔒 from GSTN</span>}
      </label>
      <input
        value={shipTo[k] || ""}
        onChange={(e) => setShipTo({ ...shipTo, [k]: e.target.value })}
        disabled={!editable || !hasShipTo}
        readOnly={readOnly}
        className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm ${
          (!editable || !hasShipTo || readOnly) ? "bg-gray-50" : ""
        }`}
        data-testid={`edit-order-ship-${k}`}
      />
    </div>
  );
  return (
    <div data-testid="edit-order-ship-tab">
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={hasShipTo}
          onChange={(e) => setHasShipTo(e.target.checked)}
          disabled={!editable}
          data-testid="edit-order-ship-enable"
        />
        <span className="text-sm font-medium">Ship to a different address than billing</span>
      </label>
      {!hasShipTo && (
        <p className="text-xs text-gray-500 ml-6">Goods will be shipped to the billing address (CGST/IGST decided by billing state).</p>
      )}
      {hasShipTo && (
        <div className="grid md:grid-cols-2 gap-3 mt-2 p-4 border border-gray-200 rounded-lg bg-gray-50/30">
          <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 flex items-start gap-1.5 mb-1">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span><strong>Consignee GST</strong> drives CGST/IGST on this order (Place of Supply = shipping state).</span>
          </div>
          <F k="gst_number" label="Consignee GSTIN" />
          <F k="name" label="Consignee name" />
          <F k="company" label="Consignee company" />
          <F k="phone" label="Phone" />
          <div className="md:col-span-2"><F k="address" label="Street address" /></div>
          <F k="city" label="City" />
          <F k="state" label="State" />
          <F k="pincode" label="PIN code" />
        </div>
      )}
    </div>
  );
};

// ── Vendor tab ──────────────────────────────────────────────────────
const VendorTab = ({ sellers, sellerId, setSellerId, currentSellerId, editable }) => {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return sellers;
    const s = search.toLowerCase();
    return sellers.filter(
      (v) =>
        v.name?.toLowerCase().includes(s) ||
        v.company_name?.toLowerCase().includes(s) ||
        v.seller_code?.toLowerCase().includes(s) ||
        v.city?.toLowerCase().includes(s)
    );
  }, [sellers, search]);

  const selected = sellers.find((s) => s.id === sellerId);

  return (
    <div className="space-y-3" data-testid="edit-order-vendor-tab">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <strong>Changing vendor reassigns the order</strong> — the old Shiprocket shipment (if any) is cancelled and a new one is created using the new vendor's pickup address. Item prices stay the same.
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search vendors by name / company / seller code / city…"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        data-testid="edit-order-vendor-search"
      />

      {selected && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs">
          <p className="font-semibold text-indigo-900">Selected: {selected.company_name}</p>
          <p className="text-indigo-700 mt-0.5">
            {selected.city}, {selected.state} ·
            {selected.shiprocket_pickup_nickname ? ` SR pickup: ${selected.shiprocket_pickup_nickname}` : " no SR pickup registered yet (auto-creates on push)"}
          </p>
          {!selected.pickup_address && (
            <p className="text-amber-700 mt-1">
              ⚠ Vendor has no pickup address on file — Shiprocket re-push may fall back to Locofast's warehouse. Add it in /admin/sellers/{selected.id}.
            </p>
          )}
        </div>
      )}

      <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y">
        {filtered.length === 0 && <p className="p-4 text-sm text-gray-500">No vendors match.</p>}
        {filtered.slice(0, 50).map((v) => (
          <button
            key={v.id}
            onClick={() => editable && setSellerId(v.id)}
            disabled={!editable}
            className={`w-full text-left p-3 text-sm flex items-center justify-between hover:bg-indigo-50/30 transition ${
              v.id === sellerId ? "bg-indigo-50" : ""
            } ${v.id === currentSellerId ? "ring-1 ring-blue-200" : ""}`}
            data-testid={`edit-order-vendor-row-${v.id}`}
          >
            <div>
              <p className="font-medium">{v.company_name}</p>
              <p className="text-[11px] text-gray-500">
                {v.seller_code} · {v.city || "—"}, {v.state || "—"}
                {v.id === currentSellerId && <span className="ml-2 text-blue-600">· current</span>}
              </p>
            </div>
            {v.id === sellerId && <CheckCircle2 size={14} className="text-indigo-600" />}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Pickup tab ──────────────────────────────────────────────────────
// Admin can only choose from the SELLER's saved pickup addresses.
// To add a new one, they must visit /admin/sellers/<id> → Pickup Addresses tab.
const PickupTab = ({ sellerId, sellerPickups, pickupsLoading, pickupAddressId, setPickupAddressId, editable, currentVendorCompany }) => {
  const primary = sellerPickups.find((a) => a.is_primary);
  const selectedAddr = sellerPickups.find((a) => a.id === pickupAddressId);
  const effective = selectedAddr || primary;

  return (
    <div data-testid="edit-order-pickup-tab">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[12px] text-blue-900 flex items-start gap-2 mb-4">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium mb-0.5">Pickup is bounded to seller's saved addresses</p>
          <p className="text-blue-800/80">
            To use a different pickup, first add it under <strong>Sellers → {currentVendorCompany || "Vendor"} → Pickup Addresses</strong>. The new address gets registered with Shiprocket and becomes available here.
          </p>
        </div>
      </div>

      {!sellerId && (
        <div className="text-sm text-gray-500 p-4 border border-gray-200 rounded-lg">
          No vendor selected. Set vendor first in the Vendor tab.
        </div>
      )}

      {sellerId && pickupsLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Loading vendor's pickup addresses…
        </div>
      )}

      {sellerId && !pickupsLoading && sellerPickups.length === 0 && (
        <div className="border-2 border-dashed border-amber-200 bg-amber-50/40 rounded-lg p-5 text-sm text-amber-800">
          <p className="font-medium mb-1">⚠ No pickup addresses on this vendor</p>
          <p className="text-amber-700 text-[12px]">
            Shiprocket push will fail. Go to <strong>Sellers → {currentVendorCompany || "Vendor"} → Pickup Addresses</strong> and add at least one address first.
          </p>
        </div>
      )}

      {sellerId && !pickupsLoading && sellerPickups.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Choose pickup for this order</label>
          <div className="space-y-2">
            {/* "Use Primary (default)" option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${pickupAddressId === "" ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}
              data-testid="edit-order-pickup-default"
            >
              <input
                type="radio"
                name="pickup"
                value=""
                checked={pickupAddressId === ""}
                onChange={() => setPickupAddressId("")}
                disabled={!editable}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm">Use vendor's Primary</span>
                  {primary && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                      <Star size={9} fill="currentColor" /> {primary.nickname}
                    </span>
                  )}
                </div>
                {primary ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {primary.address_line1}, {primary.city}, {primary.state} {primary.pincode}
                  </p>
                ) : (
                  <p className="text-xs text-red-500 mt-0.5">No primary set — will fall back to legacy nickname</p>
                )}
              </div>
            </label>

            {sellerPickups.map((a) => (
              <label
                key={a.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${pickupAddressId === a.id ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}
                data-testid={`edit-order-pickup-option-${a.id}`}
              >
                <input
                  type="radio"
                  name="pickup"
                  value={a.id}
                  checked={pickupAddressId === a.id}
                  onChange={() => setPickupAddressId(a.id)}
                  disabled={!editable}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm">{a.nickname}</span>
                    {a.is_primary && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                        <Star size={9} fill="currentColor" /> PRIMARY
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{a.contact_person_name} · {a.contact_phone}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.address_line1}, {a.city}, {a.state} {a.pincode}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {effective && (
            <p className="text-[11px] text-gray-500 mt-3" data-testid="edit-order-pickup-effective">
              <strong>Effective Ship-From for this shipment:</strong> {effective.nickname} ({effective.city}, {effective.state})
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── History tab ─────────────────────────────────────────────────────
const HistoryTab = ({ audit }) => {
  if (!audit.length) {
    return <p className="text-sm text-gray-500 text-center py-8" data-testid="edit-order-history-empty">No edits yet.</p>;
  }
  return (
    <div className="space-y-3" data-testid="edit-order-history-tab">
      {audit.map((e) => (
        <div key={e.id} className="border-l-2 border-indigo-200 pl-3 py-1">
          <p className="text-xs">
            <span className="font-semibold">{e.edited_by || "—"}</span>{" "}
            <span className="text-gray-500">edited</span>{" "}
            <span className="font-medium">{(e.changed_fields || []).join(", ")}</span>
          </p>
          <p className="text-[10px] text-gray-400">{(e.edited_at || "").replace("T", " ").slice(0, 19)} UTC</p>
          <details className="mt-1">
            <summary className="text-[11px] text-indigo-600 cursor-pointer hover:underline">View diff</summary>
            <pre className="text-[10px] bg-gray-50 p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(e.diff, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
};

export default EditOrderModal;
