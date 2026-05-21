import { useEffect, useState } from "react";
import { Loader2, Users, Building2, Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import api from "../../lib/api";

const MAX_BRANDS = 3;

const AdminAccountManagers = () => {
  const [ams, setAms] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [editing, setEditing] = useState(null); // {admin_id, selected:[brand_ids]}

  const load = async () => {
    setAms(null);
    try {
      const [a, u, b] = await Promise.all([
        api.get("/admin/account-managers"),
        api.get("/admin/users"),
        api.get("/admin/brands"),
      ]);
      setAms(a.data || []);
      setAdminUsers(u.data || []);
      setBrands(Array.isArray(b.data) ? b.data : (b.data?.brands || []));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load");
      setAms([]);
    }
  };
  useEffect(() => { load(); }, []);

  const promote = async (admin_id, flag) => {
    try {
      await api.put(`/admin/users/${admin_id}/account-manager`, { is_account_manager: flag });
      toast.success(flag ? "Promoted to Account Manager" : "Demoted");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const saveAssignment = async () => {
    try {
      await api.put(`/admin/users/${editing.admin_id}/managed-brands`, { brand_ids: editing.selected });
      toast.success("Brand assignments saved");
      setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const toggleBrand = (brand_id) => {
    setEditing((cur) => {
      const has = cur.selected.includes(brand_id);
      let next;
      if (has) next = cur.selected.filter((b) => b !== brand_id);
      else if (cur.selected.length >= MAX_BRANDS) {
        toast.error(`Max ${MAX_BRANDS} brands per Account Manager`); return cur;
      } else next = [...cur.selected, brand_id];
      return { ...cur, selected: next };
    });
  };

  const nonAms = adminUsers.filter((u) => !u.is_account_manager);
  // Brands already managed by SOMEONE (excluding the AM currently being edited)
  const lockedBrandIds = new Set();
  (ams || []).forEach((am) => {
    if (!editing || am.id !== editing.admin_id) {
      (am.managed_brands || []).forEach((b) => lockedBrandIds.add(b.id));
    }
  });

  // Build brand-groups: every parent brand is one group containing its
  // factories. Standalone factories (no parent) become their own group.
  const parentBrands = brands.filter((b) => (b.type || "brand") !== "factory");
  const factories = brands.filter((b) => b.type === "factory");
  const groups = [
    ...parentBrands.map((b) => ({
      key: b.id, brand: b, factories: factories.filter((f) => f.parent_brand_id === b.id),
    })),
    // Orphan factories (no parent_brand_id, or parent missing) — pickable as standalones
    ...factories
      .filter((f) => !f.parent_brand_id || !parentBrands.find((p) => p.id === f.parent_brand_id))
      .map((f) => ({ key: f.id, brand: f, factories: [] })),
  ];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><Users size={20} /> Account Managers</h1>
        <p className="text-sm text-gray-500 mt-1">Locofast staff who handle dedicated brand relationships. Each AM manages up to {MAX_BRANDS} brands.</p>
      </div>

      {ams === null ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : (
        <>
          {/* Promote Admin Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold mb-3">Promote an admin to Account Manager</h3>
            {nonAms.length === 0 ? (
              <p className="text-xs text-gray-500">All admin users are already Account Managers.</p>
            ) : (
              <div className="space-y-2">
                {nonAms.map((u) => (
                  <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5" data-testid={`promote-${u.id}`}>
                    <div className="text-sm"><span className="font-medium">{u.name || u.email}</span> <span className="text-xs text-gray-500 font-mono">{u.email}</span></div>
                    <button onClick={() => promote(u.id, true)} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1" data-testid={`promote-btn-${u.id}`}>
                      <Plus size={12} /> Make AM
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Existing AMs */}
          <div className="space-y-3">
            {ams.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
                No Account Managers yet. Promote an admin user above to get started.
              </div>
            )}
            {ams.map((am) => (
              <div key={am.id} className="bg-white border border-gray-200 rounded-xl p-5" data-testid={`am-card-${am.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{am.name || am.email}</p>
                    <p className="text-xs text-gray-500 font-mono">{am.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Managing <strong>{am.managed_brands.length}</strong> of {MAX_BRANDS} brand groups
                      ({am.capacity_remaining > 0 ? `${am.capacity_remaining} slot${am.capacity_remaining === 1 ? "" : "s"} left` : "at capacity"})
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {editing?.admin_id !== am.id && (
                      <button onClick={() => setEditing({ admin_id: am.id, selected: am.managed_brands.map((b) => b.id) })} className="text-xs px-3 py-1.5 border border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-lg" data-testid={`assign-${am.id}`}>
                        Manage brands
                      </button>
                    )}
                    <button onClick={() => promote(am.id, false)} className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg" data-testid={`demote-${am.id}`}>
                      Remove AM role
                    </button>
                  </div>
                </div>

                {/* Assigned brand-groups — each chip shows brand name + nested factories */}
                {am.managed_brands.length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    {am.managed_brands.map((b) => (
                      <div key={b.id} className={`p-2 rounded-lg text-xs border ${b.type === "factory" ? "bg-orange-50 border-orange-200" : "bg-emerald-50 border-emerald-200"}`} data-testid={`am-brand-${am.id}-${b.id}`}>
                        <div className="flex items-center gap-1.5">
                          <Building2 size={11} className={b.type === "factory" ? "text-orange-600" : "text-emerald-600"} />
                          <span className={`font-medium ${b.type === "factory" ? "text-orange-700" : "text-emerald-700"}`}>{b.name}</span>
                          {b.type === "factory" && <span className="text-[9px] uppercase tracking-wide opacity-60">Standalone Factory</span>}
                          {b.factories?.length > 0 && (
                            <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full">+{b.factories.length} {b.factories.length === 1 ? "factory" : "factories"}</span>
                          )}
                        </div>
                        {b.factories?.length > 0 && (
                          <ul className="ml-4 mt-1 space-y-0.5">
                            {b.factories.map((f) => (
                              <li key={f.id} className="text-[10px] text-gray-600 inline-flex items-center gap-1 mr-3">
                                <Building2 size={8} className="text-orange-400" /> {f.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Brand-group assignment editor */}
                {editing?.admin_id === am.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-600 mb-2">
                      Pick up to <strong>{MAX_BRANDS} brand groups</strong>. A brand group = a brand together with all its linked factories — selecting the brand automatically gives you finance access to every factory under it.
                    </p>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {groups.map((g) => {
                        const locked = lockedBrandIds.has(g.brand.id);
                        const checked = editing.selected.includes(g.brand.id);
                        const isStandalone = (g.brand.type || "brand") === "factory";
                        return (
                          <label
                            key={g.key}
                            className={`flex items-start gap-2 p-3 border rounded-lg ${
                              locked ? "bg-gray-50 opacity-50 cursor-not-allowed" :
                              checked ? "border-emerald-500 bg-emerald-50/40 cursor-pointer" : "border-gray-200 hover:border-emerald-400 cursor-pointer"
                            }`}
                            data-testid={`brand-group-pick-${g.brand.id}`}
                          >
                            <input
                              type="checkbox" checked={checked} disabled={locked}
                              onChange={() => !locked && toggleBrand(g.brand.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-medium ${isStandalone ? "text-orange-700" : "text-gray-900"}`}>{g.brand.name}</span>
                                {isStandalone && <span className="text-[9px] uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Standalone Factory</span>}
                                {!isStandalone && g.factories.length > 0 && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                    +{g.factories.length} {g.factories.length === 1 ? "factory" : "factories"}
                                  </span>
                                )}
                                {locked && <span className="text-[10px] text-gray-500">already assigned</span>}
                              </div>
                              {g.factories.length > 0 && (
                                <ul className="mt-1.5 ml-1 space-y-0.5">
                                  {g.factories.map((f) => (
                                    <li key={f.id} className="text-[11px] text-gray-600 inline-flex items-center gap-1 mr-3">
                                      <Building2 size={9} className="text-orange-400" /> {f.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3">
                      <p className="text-[11px] text-gray-500">
                        Selected: <strong className="text-gray-700">{editing.selected.length}</strong> / {MAX_BRANDS}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900">Cancel</button>
                        <button onClick={saveAssignment} className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1" data-testid={`save-assignment-${am.id}`}>
                          <Save size={12} /> Save assignments
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminAccountManagers;
