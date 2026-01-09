import React, { createContext, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api";

type User = {
  name: string;
  codusu: number;
  codvend?: number;
  tipousuapp?: any;
} | null;

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

/** Decodifica JWT sem lib externa */
function parseJwt(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function readUserFromStorage(): User {
  try {
    const raw = localStorage.getItem("auth:user");
    if (!raw) return null;
    const obj = JSON.parse(raw);

    // garante shape
    if (!obj?.codusu) return null;
    return {
      name: String(obj.name || ""),
      codusu: Number(obj.codusu),
      codvend: Number(obj.codvend || 0),
      tipousuapp: obj.tipousuapp ?? null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("auth:token")
  );
  const [user, setUser] = useState<User>(readUserFromStorage());

  const login = async (usuario: string, senha: string) => {
    const resp = await api.post("/api/auth/login", { usuario, senha });

    const tk = resp.data?.token;
    if (!tk) throw new Error("Token não retornou no login.");

    // ✅ pega infos do JWT (sem mudar backend)
    const payload = parseJwt(tk);
    const codusu = Number(payload?.codusu);
    const codvend = Number(payload?.codvend || 0);
    const name = String(payload?.name || payload?.usuario || usuario);
    const tipousuapp = payload?.tipousuapp ?? null;

    if (!codusu) {
      // aqui normalmente é porque a query do backend não achou o usuário (codusu veio null)
      throw new Error("CODUSU ausente no token. Verifique o usuário no TSIUSU.");
    }

    const u: User = { name, codusu, codvend, tipousuapp };

    setToken(tk);
    setUser(u);

    localStorage.setItem("auth:token", tk);
    localStorage.setItem("auth:user", JSON.stringify(u));

    // opcional: se você usa interceptor no axios, garante header
    api.defaults.headers.common.Authorization = `Bearer ${tk}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth:token");
    localStorage.removeItem("auth:user");
    delete api.defaults.headers.common.Authorization;
  };

  const value = useMemo(
    () => ({ user, token, login, logout }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
