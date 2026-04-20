import { createContext, useContext, useState, useEffect } from "react";

const VendorAuthContext = createContext(null);

export const VendorAuthProvider = ({ children }) => {
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing vendor session
    const token = localStorage.getItem("vendor_token");
    const vendorData = localStorage.getItem("vendor_data");
    
    if (token && vendorData) {
      try {
        setVendor(JSON.parse(vendorData));
      } catch (e) {
        localStorage.removeItem("vendor_token");
        localStorage.removeItem("vendor_data");
      }
    }
    setLoading(false);
  }, []);

  const login = (token, vendorData) => {
    localStorage.setItem("vendor_token", token);
    localStorage.setItem("vendor_data", JSON.stringify(vendorData));
    setVendor(vendorData);
  };

  const logout = () => {
    localStorage.removeItem("vendor_token");
    localStorage.removeItem("vendor_data");
    setVendor(null);
  };

  const getToken = () => {
    return localStorage.getItem("vendor_token");
  };

  return (
    <VendorAuthContext.Provider value={{ vendor, loading, login, logout, getToken }}>
      {children}
    </VendorAuthContext.Provider>
  );
};

export const useVendorAuth = () => {
  const context = useContext(VendorAuthContext);
  if (!context) {
    throw new Error("useVendorAuth must be used within VendorAuthProvider");
  }
  return context;
};
