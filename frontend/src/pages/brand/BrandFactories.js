import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Factory, Plus, Loader2, Mail, CheckCircle, AlertTriangle, X } from "lucide-react";
import BrandLayout from "./BrandLayout";
import { useBrandAuth } from "../../context/BrandAuthContext";

const API = process.env.REACT_APP_BACKEND_URL;

const BrandFactories = () => {
  const { user, token } = useBrandAuth();
  const [factories, setFactories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parentCategories, setParentCategories] = useState([]); // categories the brand can share
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    admin_user_email: "",
    admin_user_name: "",
    admin_user_designation: "Management",
    gst: "",
    address: "",
    phone: "",
    allowed_category_ids: [],
    requested_credit_limit: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const [facRes, meRes, catsRes] = await Promise.all([
          fetch(`${API}/api/brand/factories`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/brand/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/categories`),
        ]);
        if (!facRes.ok) throw new Error("Failed to load factories");
        setFactories(await facRes.json());
        const me = await meRes.json();
        const allCats = await catsRes.json();
        const parentAllowed = new Set(me?.brand?.allowed_category_ids || []);
        setParentCategories(allCats.filter((c) => parentAllowed.has(c.id)));
      } catch (err) {
        toast.error(err.message || "Could not load factories");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const toggleCat = (id) => {
    setForm((f) => ({
      ...f,
      allowed_category_ids: f.allowed_category_ids.includes(id)
        ? f.allowed_category_ids.filter((x) => x !== id)
        : [...f.allowed_category_ids, id],
    }));
  };

  const submitInvite = async (e) => {
    e.preventDefault();
    if (form.allowed_category_ids.length === 0) {
      if (!window.confirm("You haven't shared any categories with the factory — they won't see any fabrics. Proceed anyway?")) return;
    }
    setInviting(true);
    try {
      const body = {
        name: form.name.trim(),
        admin_user_email: form.admin_user_email.trim(),
        admin_user_name: form.admin_user_name.trim(),
        admin_user_designation: form.admin_user_designation,
        gst: form.gst.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        allowed_category_ids: form.allowed_category_ids,
        requested_credit_limit: Number(form.requested_credit_limit) || 0,
      };
      const res = await fetch(`${API}/api/brand/factories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to invite factory");
      toast.success("Factory invited — welcome email sent");
      alert(
        `Factory admin credentials (also emailed):\n\n` +
        `Email:    ${body.admin_user_email}\n` +
        `Password: ${d.temporary_password_for_reference}\n\n` +
        `The factory admin must change the password on first login.\n` +
        `Status: unverified — Locofast ops will review shortly.`
      );
      setFactories((fs) => [{ ...body, id: d.id, verification_status: "unverified", status: "active", user_count: 1, created_at: new Date().toISOString() }, ...fs]);
      setShowInvite(false);
      setForm({ name: "", admin_user_email: "", admin_user_name: "", admin_user_designation: "Management", gst: "", address: "", phone: "", allowed_category_ids: [], requested_credit_limit: "" });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInviting(false);
    }
  };

  // Guard: only brand_admin of brand-type enterprises can access this page
  if (!user || user.role !== "brand_admin" || (user.brand_type || "brand") !== "brand") {
    return (
      <BrandLayout>
        <div className="max-w-3xl mx-auto py-16 text-center">
          <Factory className="mx-auto text-gray-300 mb-3" size={40} />
          <h1 className="text-lg font-semibold text-gray-800">Factory management is only available to brand admins</h1>
          <p className="text-sm text-gray-500 mt-2">If you need a factory account added, please contact your brand admin or Locofast ops.</p>
        </div>
      </BrandLayout>
    );
  }

  return (
    <BrandLayout>
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Factory size={22} /> Our Factories
            </h1>
            <p className="text-sm text-gray-500 mt-1">Invite manufacturing partners to order on your behalf. They get their own portal + credit line.</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm"
            data-testid="invite-factory-btn"
          >
            <Plus size={16} /> Invite Factory
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
        ) : factories.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center" data-testid="factories-empty">
            <Factory className="text-gray-300 mx-auto mb-3" size={40} />
            <h3 className="text-gray-700 font-medium mb-1">No factories invited yet</h3>
            <p className="text-sm text-gray-500">Click "Invite Factory" to onboard your first manufacturing partner.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Factory</th>
                  <th className="px-4 py-3 text-left">Verification</th>
                  <th className="px-4 py-3 text-left">Categories Shared</th>
                  <th className="px-4 py-3 text-left">Users</th>
                  <th className="px-4 py-3 text-left">Invited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {factories.map((f) => (
                  <tr key={f.id} data-testid={`factory-row-${f.id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{f.name}</p>
                      <p className="text-xs text-gray-500">{f.gst || "—"} · {f.phone || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {f.verification_status === "verified" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                          <CheckCircle size={11} /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                          <AlertTriangle size={11} /> Unverified
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{(f.allowed_category_ids || []).length} {((f.allowed_category_ids || []).length === 1) ? "category" : "categories"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{f.user_count || 1}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{f.created_at ? new Date(f.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !inviting && setShowInvite(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Factory size={18} /> Invite Factory</h2>
              <button onClick={() => setShowInvite(false)} disabled={inviting}><X size={18} /></button>
            </div>
            <form onSubmit={submitInvite} className="space-y-3">
              <input required placeholder="Factory Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="invite-factory-name" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="GST Number" value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5"><Mail size={12} /> Factory Admin User</p>
                <div className="space-y-2">
                  <input required placeholder="Admin Email *" type="email" value={form.admin_user_email} onChange={(e) => setForm({ ...form, admin_user_email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="invite-factory-email" />
                  <input required placeholder="Admin Full Name *" value={form.admin_user_name} onChange={(e) => setForm({ ...form, admin_user_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <select value={form.admin_user_designation} onChange={(e) => setForm({ ...form, admin_user_designation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    {["Management", "Merchandiser", "Production", "Procurement", "Finance"].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Share Categories</p>
                <p className="text-[11px] text-gray-500 mb-2">Pick which of your categories this factory can order from. They only see what you share.</p>
                {parentCategories.length === 0 ? (
                  <p className="text-xs text-gray-400">Your brand has no categories allocated yet. Contact Locofast ops.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {parentCategories.map((c) => (
                      <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer ${form.allowed_category_ids.includes(c.id) ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={form.allowed_category_ids.includes(c.id)} onChange={() => toggleCat(c.id)} className="hidden" />
                        <span className={`w-3 h-3 rounded border ${form.allowed_category_ids.includes(c.id) ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}></span>
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Requested Credit Line (₹, optional)</p>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 500000"
                  value={form.requested_credit_limit}
                  onChange={(e) => setForm({ ...form, requested_credit_limit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">Locofast ops approves credit separately — this is only a starting request for review.</p>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <p>The factory is auto-activated but flagged <b>unverified</b> until Locofast ops reviews. Orders can be placed immediately but may be held for verification.</p>
              </div>

              <button type="submit" disabled={inviting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50" data-testid="invite-factory-submit">
                {inviting ? <><Loader2 size={14} className="animate-spin" /> Inviting…</> : "Send Invite & Welcome Email"}
              </button>
            </form>
          </div>
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandFactories;
