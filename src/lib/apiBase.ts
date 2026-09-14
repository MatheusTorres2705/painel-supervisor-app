// src/lib/apiBase.ts
// Endereço da API num lugar só: usado pelo `api` (lib/api.ts) e pelo cliente
// de renovação (auth/sessao.ts), que precisa ser uma instância separada.
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://sankhya.nxboats.com.br:3200";
