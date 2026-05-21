import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

export function useRequireMobileAuth() {
  const { isLoggedIn, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/m/login?redirect=${redirect}`, { replace: true });
    }
  }, [loading, isLoggedIn, navigate, location.pathname, location.search]);
  return { isLoggedIn, loading };
}
