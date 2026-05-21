/**
 * Reset-password modal for the admin Enterprises detail panel.
 * Replaces the prompt + confirm + alert chain.
 */
import { useState } from "react";
import { X, Copy, Check, Eye, EyeOff } from "lucide-react";
import api from "../../lib/api";
import { toast } from "sonner";

const BrandResetPasswordModal = ({ open, brandId, user, onClose, onDone }) => {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!open || !user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(
        `/admin/brands/${brandId}/users/${user.id}/reset-password`,
        { new_password: password || null, send_email: sendEmail }
      );
      toast.success(sendEmail ? "Password reset — email sent" : "Password reset");
      setGenerated(res.data?.temporary_password_for_reference || password);
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setShowPw(false);
    setSendEmail(true);
    setBusy(false);
    setGenerated(null);
    setCopied(false);
    onClose?.();
  };

  const handleCopy = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" data-testid="brand-reset-pw-modal">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {generated ? "Password updated" : "Reset password"}
            </h3>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {generated ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700">
              {sendEmail
                ? "The new password has been emailed to the user."
                : "Share this password securely with the user (WhatsApp / in-person)."}{" "}
              They will be forced to change it on next login.
            </p>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={generated}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 font-mono text-sm"
                data-testid="brand-reset-pw-value"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
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
              <span className="text-xs font-medium text-gray-600">
                New password <span className="text-gray-400 font-normal">(leave blank to auto-generate)</span>
              </span>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                  data-testid="brand-reset-pw-input"
                  autoFocus
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
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 text-blue-600"
                data-testid="brand-reset-pw-send-email"
              />
              Email the password to the user
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
                data-testid="brand-reset-pw-submit"
              >
                {busy ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BrandResetPasswordModal;
