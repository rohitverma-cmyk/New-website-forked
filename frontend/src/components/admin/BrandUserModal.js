/**
 * Add-User modal for the admin Enterprises (Brands) detail panel.
 * Replaces the old window.prompt() chain. Shows the generated password
 * inline (read-only with copy-to-clipboard) instead of an alert().
 */
import { useState } from "react";
import { X, Copy, Check, Eye, EyeOff } from "lucide-react";
import api from "../../lib/api";
import { toast } from "sonner";

const DESIGNATIONS = [
  "Management",
  "Procurement Manager",
  "Fabric Merchandiser",
  "Merchandiser",
];

const BrandUserModal = ({ open, brandId, brandName, onClose, onCreated }) => {
  const [form, setForm] = useState({
    email: "",
    name: "",
    designation: "Merchandiser",
    role: "brand_user",
    password: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(null); // { email, password }
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.name) {
      toast.error("Email and name are required");
      return;
    }
    if (form.password && form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        email: form.email.trim(),
        name: form.name.trim(),
        designation: form.designation,
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      const res = await api.post(`/admin/brands/${brandId}/users`, payload);
      toast.success("User created — welcome email sent");
      setGenerated({
        email: payload.email,
        password: res.data?.temporary_password_for_reference || "(emailed to user)",
      });
      onCreated?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setForm({ email: "", name: "", designation: "Merchandiser", role: "brand_user", password: "" });
    setShowPw(false);
    setGenerated(null);
    setCopied(false);
    onClose?.();
  };

  const handleCopy = () => {
    if (!generated?.password) return;
    navigator.clipboard.writeText(generated.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" data-testid="brand-user-modal">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {generated ? "User created" : "Add user"}
            </h3>
            <p className="text-xs text-gray-500">{brandName}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {generated ? (
          <div className="p-5 space-y-4" data-testid="brand-user-success">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{generated.email}</span> can now log in at{" "}
              <code className="bg-gray-100 px-1 rounded">/enterprise/login</code>. The
              temporary password has been emailed; share it manually only as a backup.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Temporary password
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={generated.password}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 font-mono text-sm"
                  data-testid="brand-user-temp-password"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                  data-testid="brand-user-copy-password"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                The user will be forced to reset this on first login.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email *</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="user@company.com"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                data-testid="brand-user-email"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Full name *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ankush Mehandiratta"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                data-testid="brand-user-name"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Designation</span>
                <select
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 focus:outline-none"
                  data-testid="brand-user-designation"
                >
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Access level</span>
                <select
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 focus:outline-none"
                  data-testid="brand-user-role"
                >
                  <option value="brand_user">Brand User (buyer)</option>
                  <option value="brand_admin">Brand Admin (manage users)</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Password <span className="text-gray-400 font-normal">(leave blank to auto-generate)</span>
              </span>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="At least 8 characters"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                  data-testid="brand-user-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                data-testid="brand-user-submit"
              >
                {busy ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BrandUserModal;
