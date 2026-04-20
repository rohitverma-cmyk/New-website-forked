import { createContext, useContext, useState, useEffect } from "react";

const CustomerAuthContext = createContext(null);

export const useCustomerAuth = () => useContext(CustomerAuthContext);

export const CustomerAuthProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("lf_customer_token");
    const savedCustomer = localStorage.getItem("lf_customer");
    if (saved && savedCustomer) {
      try {
        setToken(saved);
        setCustomer(JSON.parse(savedCustomer));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = (tokenStr, customerData) => {
    setToken(tokenStr);
    setCustomer(customerData);
    localStorage.setItem("lf_customer_token", tokenStr);
    localStorage.setItem("lf_customer", JSON.stringify(customerData));
  };

  const logout = () => {
    setToken(null);
    setCustomer(null);
    localStorage.removeItem("lf_customer_token");
    localStorage.removeItem("lf_customer");
  };

  const updateCustomer = (data) => {
    setCustomer(data);
    localStorage.setItem("lf_customer", JSON.stringify(data));
  };

  return (
    <CustomerAuthContext.Provider value={{ customer, token, loading, login, logout, updateCustomer, isLoggedIn: !!token }}>
      {children}
    </CustomerAuthContext.Provider>
  );
};
