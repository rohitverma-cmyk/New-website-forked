import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("locofast_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedAdmin = localStorage.getItem("locofast_admin");
    if (storedAdmin && token) {
      setAdmin(JSON.parse(storedAdmin));
    }
    setLoading(false);
  }, [token]);

  const login = (tokenValue, adminData) => {
    localStorage.setItem("locofast_token", tokenValue);
    localStorage.setItem("locofast_admin", JSON.stringify(adminData));
    setToken(tokenValue);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem("locofast_token");
    localStorage.removeItem("locofast_admin");
    setToken(null);
    setAdmin(null);
  };

  const isAuthenticated = !!token && !!admin;

  return (
    <AuthContext.Provider value={{ admin, token, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
