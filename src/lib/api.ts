import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { API_BASE } from "@/lib/apiBase";
import { lerToken, tokenVencido } from "@/auth/token";
import {
  ErroRenovacao,
  dispararSessaoExpirada,
  renovarToken,
} from "@/auth/sessao";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// repõe o Authorization após F5 — e pega o token renovado sem precisar reconfigurar
api.interceptors.request.use((config) => {
  const t = lerToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

type ConfigComMarca = InternalAxiosRequestConfig & { _renovado?: boolean };

/**
 * 401 fora de /api/auth/: a sessão acabou no servidor.
 *
 *  - Token local ainda válido (relógio adiantado, servidor reiniciado): tenta
 *    renovar UMA vez e refaz a requisição.
 *  - Token vencido, ou a renovação recusada: avisa o AuthProvider, que manda
 *    para o login.
 *
 * /api/auth/* passa direto: 401 no login é senha errada, não sessão expirada.
 * A renovação em si usa outro cliente axios, então nunca volta a este interceptor.
 */
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as ConfigComMarca | undefined;
    const url = String(config?.url ?? "");

    if (error.response?.status !== 401 || !config || url.includes("/api/auth/")) {
      return Promise.reject(error);
    }

    const token = lerToken();
    if (token && !tokenVencido(token) && !config._renovado) {
      config._renovado = true;
      try {
        await renovarToken();
        return api.request(config); // o interceptor de requisição aplica o token novo
      } catch (e) {
        // Rede ou Sankhya fora do ar: não derruba a sessão por um problema passageiro.
        if (e instanceof ErroRenovacao && e.motivo === "indisponivel") {
          return Promise.reject(error);
        }
      }
    }

    dispararSessaoExpirada();
    return Promise.reject(error);
  }
);
