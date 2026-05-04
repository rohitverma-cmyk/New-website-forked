import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Eye, EyeOff, Loader2 } from "lucide-react";
import { vendorLogin } from "../../lib/api";
import { useVendorAuth } from "../../context/VendorAuthContext";
import { toast } from "sonner";

const VendorLogin = () => {
  const navigate = useNavigate();
  const { login } = useVendorAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await vendorLogin({ email, password });
      login(res.data.token, res.data.vendor);
      toast.success("Welcome back!");
      navigate("/vendor");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Vendor Portal</h1>
            <p className="text-gray-500 mt-1">Manage your inventory</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none"
                placeholder="vendor@company.com"
                data-testid="vendor-email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none pr-12"
                  placeholder="••••••••"
                  data-testid="vendor-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="vendor-login-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Need vendor access?{" "}
            <a href="mailto:mail@locofast.com" className="text-emerald-600 hover:underline">
              Contact Locofast
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VendorLogin;
