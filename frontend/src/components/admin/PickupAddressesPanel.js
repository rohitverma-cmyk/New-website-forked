import { useEffect, useState, useCallback } from "react";
import { Plus, Star, Trash2, Pencil, MapPin, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  listSellerPickupAddresses,
  addSellerPickupAddress,
  updateSellerPickupAddress,
  deleteSellerPickupAddress,
  setSellerPickupPrimary,
} from "../../lib/api";

const EMPTY = {
  nickname: "",
  contact_person_name: "",
  contact_phone: "",
  contact_email: "noreply@locofast.com",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  is_primary: false,
};

const validate = (form) => {
  const need = ["nickname", "contact_person_name", "contact_phone", "address_line1", "city", "state", "pincode"];
  const missing = need.filter((k) => !(form[k] || "").trim());
  if (missing.length) return `Missing required: ${missing.join(", ")}`;
  if (!/^[6-9]\d{9}$/.test(form.contact_phone.replace(/\D/g, "").slice(-10))) {
    return "Phone must be a 10-digit number starting with 6/7/8/9 (Shiprocket rule)";
  }
  if (!/^\d{6}$/.test(form.pincode.trim())) return "PIN code must be 6 digits";
  return null;
};

const PickupAddressesPanel = ({ sellerId }) => {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listSellerPickupAddresses(sellerId);
      setAddresses(r.data.addresses || []);
    } catch (e) {
      toast.error("Could not load pickup addresses");
    }
    setLoading(false);
  }, [sellerId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY, is_primary: addresses.length === 0 });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (addr) => {
    setForm({
      nickname: addr.nickname || "",
      contact_person_name: addr.contact_person_name || "",
      contact_phone: addr.contact_phone || "",
      contact_email: addr.contact_email || "noreply@locofast.com",
      address_line1: addr.address_line1 || "",
      address_line2: addr.address_line2 || "",
      city: addr.city || "",
      state: addr.state || "",
      pincode: addr.pincode || "",
      is_primary: !!addr.is_primary,
    });
    setEditingId(addr.id);
    setShowForm(true);
  };

  const save = async () => {
    const err = validate(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateSellerPickupAddress(sellerId, editingId, form);
        toast.success("Pickup address updated");
      } else {
        await addSellerPickupAddress(sellerId, form);
        toast.success("Pickup address added and registered with Shiprocket");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error("Save failed: " + (e?.response?.data?.detail || e.message));
    }
    setSaving(false);
  };

  const makePrimary = async (id) => {
    try {
      await setSellerPickupPrimary(sellerId, id);
      toast.success("Marked as primary");
      load();
    } catch (e) {
      toast.error("Failed to mark primary");
    }
  };

  const remove = async (addr) => {
    if (addr.is_primary) { toast.error("Cannot delete primary — mark another as primary first"); return; }
    if (!window.confirm(`Delete pickup address "${addr.nickname}"? This won't unregister it from Shiprocket.`)) return;
    try {
      await deleteSellerPickupAddress(sellerId, addr.id);
      toast.success("Removed");
      load();
    } catch (e) {
      toast.error("Delete failed: " + (e?.response?.data?.detail || e.message));
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 size={14} className="animate-spin" />Loading…</div>;

  return (
    <div data-testid="pickup-addresses-panel" className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Pickup Addresses (Ship-From)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Shiprocket uses the <strong>Primary</strong> address by default. Add a new address here before an order can be re-routed to it.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-1.5"
          data-testid="add-pickup-btn"
        >
          <Plus size={14} /> Add Pickup
        </button>
      </div>

      {addresses.length === 0 && !showForm && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
          <MapPin className="mx-auto mb-2 text-gray-300" size={24} />
          No pickup addresses yet. Add one — Shiprocket pushes will fail without a registered pickup.
        </div>
      )}

      {addresses.length > 0 && (
        <div className="space-y-2 mb-4">
          {addresses.map((a) => (
            <div
              key={a.id}
              className={`border rounded-lg p-4 ${a.is_primary ? "border-amber-300 bg-amber-50/30" : "border-gray-200"}`}
              data-testid={`pickup-address-${a.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{a.nickname}</h3>
                    {a.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-medium">
                        <Star size={9} fill="currentColor" /> PRIMARY
                      </span>
                    )}
                    {a.registered_with_shiprocket && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">SR Ready</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{a.contact_person_name} · {a.contact_phone}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city}, {a.state} {a.pincode}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!a.is_primary && (
                    <button
                      onClick={() => makePrimary(a.id)}
                      className="px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 rounded"
                      data-testid={`make-primary-${a.id}`}
                      title="Mark as primary — used by default on all new Shiprocket pushes"
                    >
                      <Star size={12} className="inline mr-1" />Make Primary
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(a)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                    data-testid={`edit-pickup-${a.id}`}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => remove(a)}
                    disabled={a.is_primary}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid={`delete-pickup-${a.id}`}
                    title={a.is_primary ? "Cannot delete primary" : "Delete"}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="border border-indigo-200 bg-indigo-50/30 rounded-lg p-5" data-testid="pickup-address-form">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">{editingId ? "Edit Pickup Address" : "Add Pickup Address"}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 hover:bg-gray-200 rounded">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nickname *" value={form.nickname} onChange={(v) => setForm({ ...form, nickname: v })} placeholder="Sonipat Warehouse" testid="pickup-form-nickname" />
            <Field label="Contact name *" value={form.contact_person_name} onChange={(v) => setForm({ ...form, contact_person_name: v })} testid="pickup-form-contact" />
            <Field label="Phone (10-digit, starts 6/7/8/9) *" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} testid="pickup-form-phone" />
            <Field label="Email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} testid="pickup-form-email" />
            <div className="col-span-2">
              <Field label="Address line 1 *" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} testid="pickup-form-address1" />
            </div>
            <div className="col-span-2">
              <Field label="Address line 2" value={form.address_line2} onChange={(v) => setForm({ ...form, address_line2: v })} testid="pickup-form-address2" />
            </div>
            <Field label="City *" value={form.city} onChange={(v) => setForm({ ...form, city: v })} testid="pickup-form-city" />
            <Field label="State *" value={form.state} onChange={(v) => setForm({ ...form, state: v })} testid="pickup-form-state" />
            <Field label="PIN code *" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} testid="pickup-form-pincode" />
            <label className="flex items-center gap-2 text-sm mt-2">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                disabled={addresses.length === 0}
                data-testid="pickup-form-primary"
              />
              <span>Mark as Primary {addresses.length === 0 && <span className="text-xs text-gray-500">(auto-set, first address)</span>}</span>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
              data-testid="pickup-form-save"
            >
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {editingId ? "Save changes" : "Add & register with Shiprocket"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-sm"
              data-testid="pickup-form-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value, onChange, placeholder = "", testid }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
      data-testid={testid}
    />
  </div>
);

export default PickupAddressesPanel;
