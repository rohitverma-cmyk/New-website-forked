import { createContext, useContext, useEffect, useState } from "react";

const API = process.env.REACT_APP_BACKEND_URL;
const BrandAuthContext = createContext();

export const BrandAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("lf_brand_token");
    const u = localStorage.getItem("lf_brand_user");
    if (t && u) {
      try {
        setUser(JSON.parse(u));
        setToken(t);
      } catch {
        localStorage.removeItem("lf_brand_token");
        localStorage.removeItem("lf_brand_user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await fetch(`${API}/api/brand/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    localStorage.setItem("lf_brand_token", data.token);
    localStorage.setItem("lf_brand_user", JSON.stringify(data.user));
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("lf_brand_token");
    localStorage.removeItem("lf_brand_user");
    setUser(null);
    setToken(null);
  };

  const updateUser = (patch) => {
    const next = { ...user, ...patch };
    setUser(next);
    localStorage.setItem("lf_brand_user", JSON.stringify(next));
  };

  return (
    <BrandAuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isLoggedIn: !!token }}>
      {children}
    </BrandAuthContext.Provider>
  );
};

export const useBrandAuth = () => useContext(BrandAuthContext);
