import { createContext, useContext, useState, useEffect } from "react";

const AgentAuthContext = createContext(null);

export const useAgentAuth = () => useContext(AgentAuthContext);

// Decode a JWT (no validation — server is the trust boundary). Returns
// the payload object or null if the token is malformed.
const decodeJwt = (t) => {
  try {
    const payload = t.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch { return null; }
};

const isExpired = (t) => {
  const p = decodeJwt(t);
  if (!p?.exp) return true;
  return p.exp * 1000 < Date.now();
};

export const AgentAuthProvider = ({ children }) => {
  const [agent, setAgent] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("lf_agent_token");
    const savedAgent = localStorage.getItem("lf_agent");
    if (saved && savedAgent) {
      // Reject silently-expired tokens before they trigger a server-side
      // 401 toast — clears localStorage so the route guard sends the
      // agent straight to /agent/login on the next render.
      if (isExpired(saved)) {
        localStorage.removeItem("lf_agent_token");
        localStorage.removeItem("lf_agent");
      } else {
        try {
          setToken(saved);
          setAgent(JSON.parse(savedAgent));
        } catch {}
      }
    }
    setLoading(false);
  }, []);

  const login = (tokenStr, agentData) => {
    setToken(tokenStr);
    setAgent(agentData);
    localStorage.setItem("lf_agent_token", tokenStr);
    localStorage.setItem("lf_agent", JSON.stringify(agentData));
  };

  const logout = () => {
    setToken(null);
    setAgent(null);
    localStorage.removeItem("lf_agent_token");
    localStorage.removeItem("lf_agent");
  };

  return (
    <AgentAuthContext.Provider value={{ agent, token, loading, login, logout, isLoggedIn: !!token }}>
      {children}
    </AgentAuthContext.Provider>
  );
};
