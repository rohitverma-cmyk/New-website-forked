import { useEffect, useState } from "react";
import { Loader2, UserPlus, KeyRound, Power, X, ShieldCheck, Mail, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/AdminLayout";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin (full access)" },
  { value: "accounts", label: "Accounts / Finance" },
];

const emptyForm = {
  email: "",
  name: "",
  password: "",
  role: "admin",
  is_account_manager: false,
};

const AdminUserManagement = () => {
  const { admin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [superEmail, setSuperEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [resetUser, setResetUser] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/manage-users");
      setUsers(res.data?.users || []);
      setSuperEmail(res.data?.super_admin_email || "");
    } catch (e) {
      const detail = e.response?.data?.detail || "Failed to load users";
      toast.error(detail);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Hard gate: if logged-in admin is not super-admin, show nothing useful
  const meEmail = (admin?.email || "").toLowerCase();
  const isSuper = !!superEmail && meEmail === superEmail;

  const handleCreate = async (e) => {
    e?.preventDefault();
    if (!form.email || !form.name || !form.password) {
      toast.error("Email, name and password are required");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setCreating(true);
    try {
      await api.post("/admin/manage-users", form);
      toast.success(`Created ${form.email}`);
      setForm(emptyForm);
      setShowCreate(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async () => {
    if (!resetUser || !newPwd || newPwd.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await api.post(`/admin/manage-users/${resetUser.id}/reset-password`, { password: newPwd });
      toast.success(`Password updated for ${resetUser.email}`);
      setResetUser(null);
      setNewPwd("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to reset password");
    }
  };

  const toggleActive = async (u) => {
    const next = !(u.active !== false);
    if (next === false && !window.confirm(`Deactivate ${u.email}? They will not be able to log in until re-enabled.`)) return;
    try {
      await api.patch(`/admin/manage-users/${u.id}`, { active: !next ? false : true });
      toast.success(`${u.email} ${next ? "deactivated" : "activated"}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update");
    }
  };

  const updateRole = async (u, role) => {
    try {
      await api.patch(`/admin/manage-users/${u.id}`, { role });
      toast.success(`Role updated to ${role}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const toggleAM = async (u) => {
    try {
      await api.patch(`/admin/manage-users/${u.id}`, { is_account_manager: !u.is_account_manager });
      toast.success(`${u.email} ${!u.is_account_manager ? "promoted to" : "demoted from"} Account Manager`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  if (!isSuper && !loading) {
    return (
      <AdminLayout>
        <div className="max-w-xl mx-auto mt-20 bg-white border border-amber-200 rounded-xl p-8 text-center">
          <ShieldCheck size={36} className="mx-auto text-amber-500 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Restricted</h2>
          <p className="text-sm text-gray-500 mt-1">
            Only the super-admin {superEmail ? <strong>({superEmail})</strong> : null} can manage admin users.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap" data-testid="admin-user-mgmt-header">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <UsersIcon size={20} /> Admin Users
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage internal Locofast users with access to the admin panel. Super-admin only.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm flex items-center gap-2"
          data-testid="open-create-user-btn"
        >
          <UserPlus size={16} /> Create user
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="admin-users-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">User</th>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-left">AM flag</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-gray-500 py-12">No admin users yet.</td></tr>
              )}
              {users.map((u) => {
                const active = u.active !== false;
                const isMe = (u.email || "").toLowerCase() === meEmail;
                const isSuperRow = (u.email || "").toLowerCase() === superEmail;
                return (
                  <tr key={u.id} className="border-t border-gray-100" data-testid={`user-row-${u.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {u.name || "—"}
                        {isSuperRow && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">super</span>
                        )}
                        {isMe && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">you</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono flex items-center gap-1"><Mail size={10} /> {u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role || "admin"}
                        onChange={(e) => updateRole(u, e.target.value)}
                        disabled={isSuperRow}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        data-testid={`role-select-${u.id}`}
                      >
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAM(u)}
                        disabled={isSuperRow}
                        className={`text-xs px-2.5 py-1 rounded-full border ${u.is_account_manager ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200"} disabled:opacity-50`}
                        data-testid={`am-toggle-${u.id}`}
                      >
                        {u.is_account_manager ? "Account Manager" : "Not AM"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                        {active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => { setResetUser(u); setNewPwd(""); }}
                          className="text-xs px-2.5 py-1 border border-gray-200 hover:border-emerald-400 text-gray-700 hover:text-emerald-700 rounded inline-flex items-center gap-1"
                          data-testid={`reset-pwd-${u.id}`}
                        >
                          <KeyRound size={12} /> Reset password
                        </button>
                        {!isSuperRow && (
                          <button
                            onClick={() => toggleActive(u)}
                            className={`text-xs px-2.5 py-1 border rounded inline-flex items-center gap-1 ${active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                            data-testid={`toggle-active-${u.id}`}
                          >
                            <Power size={12} /> {active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Note: Supplier Manager accounts are managed separately on the{" "}
        <a href="/admin/supplier-managers" className="text-emerald-700 underline">Supplier Managers</a> page.
      </p>

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="create-user-modal">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create admin user</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="user@locofast.com" required data-testid="create-email-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Display name" required data-testid="create-name-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password (min 6 chars)</label>
                <input
                  type="text" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="Initial password" required minLength={6}
                  data-testid="create-password-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  data-testid="create-role-select"
                >
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox" checked={form.is_account_manager}
                  onChange={(e) => setForm({ ...form, is_account_manager: e.target.checked })}
                  data-testid="create-am-checkbox"
                /> Also flag as Account Manager
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button
                  type="submit" disabled={creating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50"
                  data-testid="submit-create-user-btn"
                >
                  {creating ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="reset-pwd-modal">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reset password</h3>
              <button onClick={() => setResetUser(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">For <span className="font-mono">{resetUser.email}</span></p>
            <input
              type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              placeholder="New password (min 6 chars)" autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              data-testid="reset-pwd-input"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setResetUser(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
                data-testid="confirm-reset-pwd-btn"
              >
                Update password
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminUserManagement;
