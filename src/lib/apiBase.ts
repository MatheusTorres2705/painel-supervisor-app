// src/lib/apiBase.ts
// Endereço da API num lugar só: usado pelo `api` (lib/api.ts) e pelo cliente
// de renovação (auth/sessao.ts), que precisa ser uma instância separada.
// Vazio = URLs relativas: a requisição sai para a mesma origem da página e o
// proxy /api resolve o upstream (Caddy em https://sankhya.nxboats.com.br:3120,
// `server.proxy` do vite.config.ts em dev local). Assim o front não fixa
// esquema nem porta — sem mixed content ao ser servido em HTTPS, e sem CORS.
// `??` e não `||`: com `||` a string vazia cairia num fallback absoluto.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
