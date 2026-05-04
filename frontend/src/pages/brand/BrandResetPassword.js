import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const BrandResetPassword = () => {
  const { token, updateUser, logout } = useBrandAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return; }
    if (newPassword.length < 8) { toast.error("Use at least 8 characters"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/brand/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed");
      updateUser({ must_reset_password: false });
      toast.success("Password updated. Please sign in again.");
      logout();
      navigate("/enterprise/login");
    } catch (err) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow border border-gray-100 p-8" data-testid="brand-reset-card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
            <KeyRound className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Set a new password</h1>
            <p className="text-xs text-gray-500">Required before accessing the portal</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="password" required placeholder="Temporary password"
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none"
            data-testid="brand-reset-current" />
          <input type="password" required placeholder="New password (min 8 chars)"
            value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none"
            data-testid="brand-reset-new" />
          <input type="password" required placeholder="Confirm new password"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none"
            data-testid="brand-reset-confirm" />
          <button type="submit" disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="brand-reset-submit">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BrandResetPassword;
