import { useState, useEffect } from "react";
import { Plus, Trash2, X, RefreshCw, Pencil, Percent, Building2, FolderOpen, ShoppingCart, Ruler, ArrowRightLeft, Layers } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout";
import { toast } from "sonner";
import { useConfirm } from "../../components/useConfirm";

const API = process.env.REACT_APP_BACKEND_URL;

// Fabric patterns the catalog uses today. Kept in sync with what
// fabric_router exposes via `pattern` filter and the values seen in
// db.fabrics.distinct('pattern').
const PATTERNS = ["Solid", "Stripes", "Checks", "Print", "Others"];

const RULE_TYPES = [
  { value: "vendor", label: "Vendor-specific", icon: Building2, desc: "Override for a specific seller" },
  { value: "category_pattern", label: "Category + Pattern", icon: Layers, desc: "Different rate when a category meets a pattern (e.g. Cotton + Stripes)" },
  { value: "category", label: "Category-wise", icon: FolderOpen, desc: "Based on fabric category" },
  { value: "cart_value", label: "Cart Value Slab", icon: ShoppingCart, desc: "Based on order value range" },
  { value: "meterage", label: "Meterage Slab", icon: Ruler, desc: "Based on quantity ordered" },
  { value: "source", label: "Inventory vs RFQ", icon: ArrowRightLeft, desc: "Based on order source" },
];

const AdminCommission = () => {
  const confirm = useConfirm();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);

  const [form, setForm] = useState({
    rule_type: "vendor",
    vendor_id: "",
    vendor_name: "",
    category_id: "",
    category_name: "",
    pattern: "",
    min_value: "",
    max_value: "",
    source: "inventory",
    commission_pct: "",
    is_active: true,
  });

  const token = localStorage.getItem("locofast_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => { fetchRules(); fetchMeta(); }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/commission/rules`, { headers });
      setRules(await res.json());
    } catch { toast.error("Failed to load rules"); }
    setLoading(false);
  };

  const fetchMeta = async () => {
    try {
      const [sellersRes, catsRes] = await Promise.all([
        fetch(`${API}/api/sellers`, { headers }),
        fetch(`${API}/api/categories`, { headers }),
      ]);
      setSellers(await sellersRes.json());
      setCategories(await catsRes.json());
    } catch {}
  };

  const resetForm = () => setForm({ rule_type: "vendor", vendor_id: "", vendor_name: "", category_id: "", category_name: "", pattern: "", min_value: "", max_value: "", source: "inventory", commission_pct: "", is_active: true });

  const handleSave = async () => {
    if (!form.commission_pct || isNaN(form.commission_pct)) {
      toast.error("Commission % is required"); return;
    }
    if (form.rule_type === "category_pattern" && (!form.category_name || !form.pattern)) {
      toast.error("Category + Pattern rule needs both a category and a pattern"); return;
    }
    const payload = {
      ...form,
      commission_pct: parseFloat(form.commission_pct),
      min_value: form.min_value ? parseFloat(form.min_value) : null,
      max_value: form.max_value ? parseFloat(form.max_value) : null,
    };

    try {
      const url = editRule ? `${API}/api/commission/rules/${editRule.id}` : `${API}/api/commission/rules`;
      const method = editRule ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success(editRule ? "Rule updated" : "Rule created");
      setShowCreate(false);
      setEditRule(null);
      resetForm();
      fetchRules();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm({ title: "Confirm action", message: "Delete this commission rule?", tone: "danger", confirmLabel: "Confirm" }))) return;
    try {
      await fetch(`${API}/api/commission/rules/${id}`, { method: "DELETE", headers });
      toast.success("Rule deleted");
      fetchRules();
    } catch { toast.error("Failed to delete"); }
  };

  const openEdit = (rule) => {
    setForm({
      rule_type: rule.rule_type,
      vendor_id: rule.vendor_id || "",
      vendor_name: rule.vendor_name || "",
      category_id: rule.category_id || "",
      category_name: rule.category_name || "",
      pattern: rule.pattern || "",
      min_value: rule.min_value ?? "",
      max_value: rule.max_value ?? "",
      source: rule.source || "inventory",
      commission_pct: rule.commission_pct,
      is_active: rule.is_active !== false,
    });
    setEditRule(rule);
    setShowCreate(true);
  };

  const typeInfo = (type) => RULE_TYPES.find(t => t.value === type) || RULE_TYPES[0];

  const groupedRules = RULE_TYPES.map(t => ({
    ...t,
    rules: rules.filter(r => r.rule_type === t.value)
  }));

  return (
    <AdminLayout>
      <div className="p-8" data-testid="admin-commission-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Commission Structure</h1>
            <p className="text-gray-500 mt-1">Manage vendor commission rates. Default: <span className="font-semibold text-gray-600">0%</span> — no commission is applied until you configure rules below.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { resetForm(); setEditRule(null); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700" data-testid="add-rule-btn">
              <Plus size={16} />Add Rule
            </button>
            <button onClick={fetchRules} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Priority explanation */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800 font-medium mb-1">Commission Priority (most specific wins)</p>
          <p className="text-xs text-blue-600">{"Vendor-specific > Category + Pattern > Category > Cart Value Slab > Meterage Slab > Inventory/RFQ > Default (0%)"}</p>
        </div>

        {/* Rules grouped by type */}
        {loading ? <div className="text-center py-12 text-gray-500">Loading...</div> : (
          <div className="space-y-6">
            {groupedRules.map((group) => (
              <div key={group.value} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b">
                  <group.icon size={18} className="text-gray-500" />
                  <div>
                    <span className="font-medium text-gray-900">{group.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{group.desc}</span>
                  </div>
                  <span className="ml-auto text-xs text-gray-400">{group.rules.length} rule{group.rules.length !== 1 ? "s" : ""}</span>
                </div>
                {group.rules.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">No rules configured</div>
                ) : (
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      {group.rules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-gray-50" data-testid={`rule-${rule.id}`}>
                          <td className="px-5 py-3">
                            {rule.rule_type === "vendor" && <span className="text-sm font-medium">{rule.vendor_name || rule.vendor_id}</span>}
                            {rule.rule_type === "category_pattern" && (
                              <span className="text-sm font-medium">
                                {rule.category_name}
                                <span className="text-gray-400 mx-1">·</span>
                                <span className="text-gray-700">{rule.pattern}</span>
                              </span>
                            )}
                            {rule.rule_type === "category" && <span className="text-sm font-medium">{rule.category_name}</span>}
                            {rule.rule_type === "cart_value" && <span className="text-sm">₹{(rule.min_value || 0).toLocaleString()} — ₹{rule.max_value ? rule.max_value.toLocaleString() : "∞"}</span>}
                            {rule.rule_type === "meterage" && <span className="text-sm">{rule.min_value || 0}m — {rule.max_value ? `${rule.max_value}m` : "∞"}</span>}
                            {rule.rule_type === "source" && <span className="text-sm font-medium capitalize">{rule.source}</span>}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="inline-flex items-center gap-1 text-lg font-bold text-amber-600">
                              {rule.commission_pct}%
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                              {rule.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(rule)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Pencil size={15} /></button>
                              <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CREATE/EDIT MODAL */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditRule(null); }}>
            <div className="bg-white rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="commission-rule-modal">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold">{editRule ? "Edit Rule" : "Add Commission Rule"}</h3>
                <button onClick={() => { setShowCreate(false); setEditRule(null); }}><X size={20} className="text-gray-400" /></button>
              </div>

              <div className="space-y-4">
                {/* Rule Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Rule Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {RULE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, rule_type: t.value })}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-all ${form.rule_type === t.value ? "border-[#2563EB] bg-blue-50 text-[#2563EB]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        <t.icon size={16} />{t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional fields */}
                {form.rule_type === "vendor" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                    <select
                      value={form.vendor_id}
                      onChange={(e) => {
                        const s = sellers.find(s => s.id === e.target.value);
                        setForm({ ...form, vendor_id: e.target.value, vendor_name: s?.company_name || "" });
                      }}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white"
                      data-testid="rule-vendor-select"
                    >
                      <option value="">Select vendor...</option>
                      {sellers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                    </select>
                  </div>
                )}

                {form.rule_type === "category" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <select
                      value={form.category_name}
                      onChange={(e) => {
                        const c = categories.find(c => c.name === e.target.value);
                        setForm({ ...form, category_name: e.target.value, category_id: c?.id || "" });
                      }}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white"
                      data-testid="rule-category-select"
                    >
                      <option value="">Select category...</option>
                      {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {form.rule_type === "category_pattern" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                      <select
                        value={form.category_name}
                        onChange={(e) => {
                          const c = categories.find(c => c.name === e.target.value);
                          setForm({ ...form, category_name: e.target.value, category_id: c?.id || "" });
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white"
                        data-testid="rule-cp-category-select"
                      >
                        <option value="">Select category...</option>
                        {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Pattern</label>
                      <select
                        value={form.pattern}
                        onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white"
                        data-testid="rule-cp-pattern-select"
                      >
                        <option value="">Select pattern...</option>
                        {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {(form.rule_type === "cart_value" || form.rule_type === "meterage") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Min {form.rule_type === "cart_value" ? "(₹)" : "(meters)"}</label>
                      <input type="number" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg" placeholder="0" data-testid="rule-min" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max {form.rule_type === "cart_value" ? "(₹)" : "(meters)"}</label>
                      <input type="number" value={form.max_value} onChange={(e) => setForm({ ...form, max_value: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg" placeholder="No limit" data-testid="rule-max" />
                    </div>
                  </div>
                )}

                {form.rule_type === "source" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                    <div className="flex gap-3">
                      {["inventory", "rfq"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm({ ...form, source: s })}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${form.source === s ? "border-[#2563EB] bg-blue-50 text-[#2563EB]" : "border-gray-200 text-gray-600"}`}
                        >
                          {s === "inventory" ? "Inventory (Direct Booking)" : "RFQ Lead"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commission % */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commission %</label>
                  <div className="relative">
                    <Percent size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={form.commission_pct}
                      onChange={(e) => setForm({ ...form, commission_pct: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg pr-10 text-lg font-semibold"
                      placeholder="5"
                      data-testid="rule-commission-pct"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowCreate(false); setEditRule(null); }} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700" data-testid="save-rule-btn">{editRule ? "Update Rule" : "Create Rule"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCommission;
