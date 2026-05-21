/**
 * Inventory Shortfall Modal — surfaces when a buyer wants more units of
 * a fabric than are currently in stock. Splits the order:
 *   • Inventory portion → existing cart / checkout flow
 *   • Shortfall portion → RFQ with 24 h first-refusal lock to the SKU's
 *     seller, then opened up to all eligible vendors in that category.
 *
 * Used on:
 *   - Public PDP (FabricDetailPage)  → anonymous + customer-token paths
 *   - Brand portal PDP (BrandFabricDetail) → uses brand profile to fill
 *     contact fields automatically.
 *
 * Props:
 *   open               boolean
 *   fabric             { id, name, fabric_code, ... }   — for context line
 *   requestedQty       int
 *   availableQty       int
 *   unit               'm' | 'kg'
 *   defaults           { full_name, email, phone, gst, company } — pre-fills
 *   showContactFields  bool — hide for logged-in flows where defaults exist
 *   onCancel           ()
 *   onConfirm          ({ shortfallRfq, takeInventory: true }) — caller
 *                       handles cart-add for the inventory side after this
 */
import { useState } from "react";
import { X, Package, Send, Loader2, Lock } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const Row = ({ label, value, accent }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className={`text-sm font-semibold ${accent || "text-gray-900"}`}>{value}</span>
  </div>
);

const InventoryShortfallModal = ({
  open,
  fabric,
  requestedQty,
  availableQty,
  unit = "m",
  defaults = {},
  showContactFields = true,
  onCancel,
  onConfirm,
}) => {
  const [contact, setContact] = useState({
    full_name: defaults.full_name || "",
    email: defaults.email || "",
    phone: defaults.phone || "",
    gst_number: defaults.gst_number || "",
    company: defaults.company || "",
    message: "",
  });
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const shortfallQty = Math.max(0, Number(requestedQty) - Number(availableQty));
  const set = (k, v) => setContact((c) => ({ ...c, [k]: v }));

  const handleConfirm = async (e) => {
    e?.preventDefault?.();
    if (showContactFields) {
      if (!contact.full_name || !contact.email || !contact.phone) {
        toast.error("Name, email and phone are required to send the RFQ");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await api.post("/rfq/shortfall", {
        fabric_id: fabric.id,
        requested_qty: Number(requestedQty),
        available_qty: Number(availableQty),
        shortfall_qty: shortfallQty,
        full_name: contact.full_name || defaults.full_name,
        email: contact.email || defaults.email,
        phone: contact.phone || defaults.phone,
        gst_number: contact.gst_number || defaults.gst_number || "",
        company: contact.company || defaults.company || "",
        message: contact.message || "",
      });
      onConfirm?.({ shortfallRfq: res.data, takeInventory: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create shortfall RFQ");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[92vh] overflow-y-auto"
        data-testid="inventory-shortfall-modal"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              Take what's in stock + RFQ for the rest
            </h3>
            <p className="text-xs text-gray-500 truncate">
              {fabric?.name}
              {fabric?.fabric_code ? ` · ${fabric.fabric_code}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <Row
              label="You requested"
              value={`${Number(requestedQty).toLocaleString("en-IN")} ${unit}`}
            />
            <Row
              label="Available in stock now"
              value={`${Number(availableQty).toLocaleString("en-IN")} ${unit}`}
              accent="text-emerald-700"
            />
            <Row
              label="Shortfall — we'll send to mills"
              value={`${shortfallQty.toLocaleString("en-IN")} ${unit}`}
              accent="text-amber-700"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3" data-testid="shortfall-inventory-block">
              <div className="w-10 h-10 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                <Package size={18} className="text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Take inventory</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {Number(availableQty).toLocaleString("en-IN")} {unit} added to your cart at the
                  listed rate. Dispatched in 24–48 h.
                </p>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3" data-testid="shortfall-rfq-block">
              <div className="w-10 h-10 rounded-full bg-blue-100 grid place-items-center flex-shrink-0">
                <Send size={18} className="text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">RFQ for {shortfallQty} {unit}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  We'll quote within 24 h. Track in <span className="font-semibold">My Account → My Queries</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-gray-500 px-1">
            <Lock size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <span>
              First chance to quote goes to this SKU's mill for 24 h, then opens
              up to all matching mills for the best price.
            </span>
          </div>

          {showContactFields ? (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Your details (for the RFQ)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Name *</span>
                  <input
                    type="text"
                    value={contact.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Full name"
                    data-testid="shortfall-name"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Phone *</span>
                  <input
                    type="tel"
                    value={contact.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="+91…"
                    data-testid="shortfall-phone"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[11px] text-gray-500">Email *</span>
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => set("email", e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="you@company.com"
                    data-testid="shortfall-email"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">GST</span>
                  <input
                    type="text"
                    value={contact.gst_number}
                    onChange={(e) => set("gst_number", e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Company</span>
                  <input
                    type="text"
                    value={contact.company}
                    onChange={(e) => set("company", e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                  />
                </label>
              </div>
              <label className="block mt-3">
                <span className="text-[11px] text-gray-500">Message to mill (optional)</span>
                <textarea
                  rows={2}
                  value={contact.message}
                  onChange={(e) => set("message", e.target.value)}
                  className="mt-0.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Special finish, dispatch deadline, etc."
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || shortfallQty <= 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
            data-testid="shortfall-confirm-btn"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {busy ? "Creating…" : "Confirm — take stock + send RFQ"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryShortfallModal;
