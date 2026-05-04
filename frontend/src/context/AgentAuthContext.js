import { createContext, useContext, useState, useEffect } from "react";

const AgentAuthContext = createContext(null);

export const useAgentAuth = () => useContext(AgentAuthContext);

export const AgentAuthProvider = ({ children }) => {
  const [agent, setAgent] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("lf_agent_token");
    const savedAgent = localStorage.getItem("lf_agent");
    if (saved && savedAgent) {
      try {
        setToken(saved);
        setAgent(JSON.parse(savedAgent));
      } catch {}
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
