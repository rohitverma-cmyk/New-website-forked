import { Navigate } from "react-router-dom";
import { useVendorAuth } from "../context/VendorAuthContext";

const VendorProtectedRoute = ({ children }) => {
  const { vendor, loading } = useVendorAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!vendor) {
    return <Navigate to="/vendor/login" replace />;
  }

  return children;
};

export default VendorProtectedRoute;
