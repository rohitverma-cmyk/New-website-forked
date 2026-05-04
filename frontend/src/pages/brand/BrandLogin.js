import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandAuth } from "../../context/BrandAuthContext";
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

const BrandLogin = () => {
  const { login } = useBrandAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome, ${user.name}`);
      navigate(user.must_reset_password ? "/enterprise/reset-password" : "/enterprise/fabrics");
    } catch (err) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8" data-testid="brand-login-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Building2 className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Enterprise Portal</h1>
              <p className="text-xs text-gray-500">Brands &amp; factories — sign in to your Locofast account</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Work Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                placeholder="you@brand.com" data-testid="brand-login-email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm"
                placeholder="••••••••" data-testid="brand-login-password"
              />
            </div>
            <button
              type="submit" disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              data-testid="brand-login-submit"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : "Sign In"}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-6">
            Don't have an account? Contact your Locofast relationship manager.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BrandLogin;
