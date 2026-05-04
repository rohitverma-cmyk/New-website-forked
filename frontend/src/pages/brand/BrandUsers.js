import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import BrandLayout from "./BrandLayout";
import { Users, Loader2, UserPlus, Trash2, X, Copy } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const DESIGNATIONS = [
  "Management",
  "Procurement Manager",
  "Fabric Merchandiser",
  "Merchandiser",
];

const BrandUsers = () => {
  const { user, token } = useBrandAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "brand_user", designation: "Merchandiser" });
  const [busy, setBusy] = useState(false);
  const [tempPw, setTempPw] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/brand/users`, { headers: { Authorization: `Bearer ${token}` } });
      setUsers(await res.json());
    } catch { toast.error("Failed to load users"); }
    setLoading(false);
  };

  useEffect(() => {
    if (!token) { navigate("/enterprise/login"); return; }
    if (user?.role !== "brand_admin") { navigate("/enterprise/fabrics"); return; }
    if (user?.must_reset_password) { navigate("/enterprise/reset-password"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/brand/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Create failed");
      setTempPw({ email: form.email, password: data.temporary_password_for_reference });
      setForm({ email: "", name: "", role: "brand_user", designation: "Merchandiser" });
      load();
    } catch (err) { toast.error(err.message); }
    setBusy(false);
  };

  const suspendUser = async (uid) => {
    if (!window.confirm("Suspend this user?")) return;
    try {
      const res = await fetch(`${API}/api/brand/users/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      toast.success("User suspended");
      load();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <BrandLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><Users size={22} /> Brand Users</h1>
          <p className="text-sm text-gray-500 mt-1">Invite teammates — they get a temp password via email</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          data-testid="brand-add-user-btn"
        >
          <UserPlus size={14} /> Invite user
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Designation</th>
                <th className="px-4 py-2 text-left">Access</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} data-testid={`brand-user-${u.id}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.designation || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${u.role === "brand_admin" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-700"}`}>
                      {u.role === "brand_admin" ? "Admin" : "Buyer"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status === "active" && u.id !== user.id && (
                      <button onClick={() => suspendUser(u.id)} className="text-red-500 hover:text-red-700" data-testid={`brand-suspend-${u.id}`}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="brand-add-user-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Invite user</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-invite-email" />
              <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" data-testid="brand-invite-name" />
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Designation</label>
                <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="brand-invite-designation">
                  {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Access Level</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="brand-invite-role">
                  <option value="brand_user">Buyer — can browse + place orders</option>
                  <option value="brand_admin">Admin — can also invite users</option>
                </select>
              </div>
              <button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50" data-testid="brand-invite-submit">
                {busy ? "Creating..." : "Send invite"}
              </button>
            </form>
          </div>
        </div>
      )}

      {tempPw && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setTempPw(null); setShowAdd(false); }}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-emerald-700 mb-2">Invite sent</h3>
            <p className="text-sm text-gray-600 mb-3">Welcome email with temp password sent to <strong>{tempPw.email}</strong>. Copy this for your records:</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between font-mono text-sm mb-4">
              <span>{tempPw.password}</span>
              <button onClick={() => { navigator.clipboard.writeText(tempPw.password); toast.success("Copied"); }}><Copy size={14} /></button>
            </div>
            <button onClick={() => { setTempPw(null); setShowAdd(false); }} className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium">Done</button>
          </div>
        </div>
      )}
    </BrandLayout>
  );
};

export default BrandUsers;
