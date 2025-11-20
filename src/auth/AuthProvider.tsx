import React, { createContext, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api";

type User = { name: string; codusu?: number; codvend?: number } | null;
type AuthCtx = {
  user: User;
  token: string | null;
  login: (usuario: string, senha: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa de <AuthProvider>");
  return ctx;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User>(localStorage.getItem("auth:name") ? { name: localStorage.getItem("auth:name")! } : null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth:token"));

  const login = async (usuario: string, senha: string) => {
    const { data } = await api.post("/api/auth/login", { usuario, senha });
    const { token, name, codusu, codvend } = data || {};
    if (!token) throw new Error("Token ausente no login");
    setUser({ name, codusu, codvend });
    setToken(token);
    localStorage.setItem("auth:token", token);
    localStorage.setItem("auth:name", name);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth:token");
    localStorage.removeItem("auth:name");
    delete api.defaults.headers.common["Authorization"];
  };

  const value = useMemo(() => ({ user, token, login, logout }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
