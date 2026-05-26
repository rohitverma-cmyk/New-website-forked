/**
 * Admin → Supplier Managers
 *
 * CRUD for SM accounts. Each SM has many vendors mapped (many-to-many).
 * Vendors are picked from a searchable multi-select sourced from /api/sellers.
 */
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Plus, Trash2, Pencil, Search, Loader2, X, Users, Building2, Check } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { getSellers } from "../../lib/api";

const API = process.env.REACT_APP_BACKEND_URL;

const AdminSupplierManagers = () => {
  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("locofast_token");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [listRes, selRes] = await Promise.all([
        axios.get(`${API}/api/supplier-manager`, { headers: { Authorization: `Bearer ${token}` } }),
        getSellers(true),
      ]);
      setItems(listRes.data.supplier_managers || []);
      setSellers(selRes.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load supplier managers");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((sm) =>
      [sm.name, sm.email, sm.contact_phone].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [items, search]);

  const handleDelete = async (sm) => {
    if (!window.confirm(`Delete supplier manager "${sm.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/supplier-manager/${sm.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Deleted");
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Users size={24} className="text-blue-600" /> Supplier Managers
            </h1>
            <p className="text-gray-500 text-sm mt-1">Internal users who act on behalf of mapped vendors.</p>
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            data-testid="sm-add-btn"
          >
            <Plus size={16} /> Add Supplier Manager
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone…"
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                data-testid="sm-search"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">No supplier managers yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Mapped Vendors</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((sm) => (
                  <tr key={sm.id} className="hover:bg-gray-50" data-testid={`sm-row-${sm.id}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{sm.name}</td>
                    <td className="px-4 py-3 text-gray-700">{sm.email}</td>
                    <td className="px-4 py-3 text-gray-600">{sm.contact_phone || "—"}</td>
                    <td className="px-4 py-3">
                      {sm.vendors?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {sm.vendors.slice(0, 3).map((v) => (
                            <span key={v.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Building2 size={10} /> {v.company_name}
                            </span>
                          ))}
                          {sm.vendors.length > 3 && (
                            <span className="text-[11px] text-gray-500">+{sm.vendors.length - 3} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No vendors mapped</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${sm.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {sm.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => { setEditing(sm); setModalOpen(true); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" data-testid={`sm-edit-${sm.id}`}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(sm)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" data-testid={`sm-delete-${sm.id}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <SMModal
          editing={editing}
          sellers={sellers}
          token={token}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); fetchAll(); }}
        />
      )}
    </AdminLayout>
  );
};

const SMModal = ({ editing, sellers, token, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(editing?.contact_phone || "");
  const [vendorIds, setVendorIds] = useState(editing?.vendor_ids || []);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [vendorSearch, setVendorSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredSellers = useMemo(() => {
    const q = vendorSearch.toLowerCase();
    return sellers.filter((s) =>
      [s.company_name, s.name, s.seller_code, s.contact_email].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [sellers, vendorSearch]);

  const toggleVendor = (id) => {
    setVendorIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return toast.error("Name and email are required");
    if (!editing && (password.length < 6)) return toast.error("Password must be at least 6 characters");
    setSaving(true);
    try {
      if (editing) {
        const body = { name, contact_phone: phone, vendor_ids: vendorIds, is_active: isActive };
        if (password) body.password = password;
        await axios.put(`${API}/api/supplier-manager/${editing.id}`, body, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Updated");
      } else {
        await axios.post(`${API}/api/supplier-manager`, {
          name, email: email.toLowerCase().trim(), password, contact_phone: phone, vendor_ids: vendorIds,
        }, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Supplier manager created");
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" data-testid="sm-modal">
      <div className="bg-white rounded-xl w-full max-w-2xl my-8">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{editing ? "Edit Supplier Manager" : "Add Supplier Manager"}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" data-testid="sm-form-name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email * {editing && <span className="text-gray-400">(locked)</span>}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editing} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" data-testid="sm-form-email" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" data-testid="sm-form-phone" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password {editing && <span className="text-gray-400">(leave blank to keep)</span>} {!editing && "*"}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" data-testid="sm-form-password" />
            </div>
          </div>

          {editing && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Mapped Vendors <span className="text-gray-400">({vendorIds.length} selected)</span>
            </label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} placeholder="Search vendors…" className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100" data-testid="sm-vendor-list">
              {filteredSellers.length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-400">No vendors match.</p>
              ) : (
                filteredSellers.map((s) => {
                  const checked = vendorIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleVendor(s.id)} className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-blue-50 ${checked ? "bg-blue-50" : ""}`} data-testid={`sm-vendor-toggle-${s.id}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.company_name || s.name}</p>
                        <p className="text-[11px] text-gray-500">{s.seller_code} · {s.contact_email}</p>
                      </div>
                      <span className={`w-5 h-5 rounded border ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"} flex items-center justify-center flex-shrink-0`}>
                        {checked && <Check size={12} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1" data-testid="sm-form-save">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editing ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSupplierManagers;
