// src/auth/sessao.ts
// Renovação do token e aviso de sessão expirada, sem React.
//
// DOIS CUIDADOS, aprendidos com os outros painéis (ver
// painel-compras-nx-api/docs/PENDENCIAS-SEGURANCA.md):
//
//  1. A renovação usa um axios PRÓPRIO, sem os interceptores do `api`. No
//     painel-diretoria a chamada de refresh passava pelo mesmo interceptor:
//     um 401 do refresh disparava outro refresh, sem fim.
//
//  2. O single-flight é limpo por um `.finally` encadeado FORA da requisição.
//     No painel-comprador o tratamento de erro da própria requisição fazia
//     `await` na promise compartilhada — esperava a si mesmo e travava a tela.
import axios, { type AxiosError } from "axios";

import { API_BASE } from "@/lib/apiBase";
import { gravarSessao, lerToken, lerUsuario, usuarioDoToken } from "@/auth/token";

/** Rota de renovação. Não é /refresh de propósito — ver PENDENCIAS-SEGURANCA.md. */
const ROTA_RENOVAR = "/api/auth/renovar";

/**
 * Por que a renovação falhou:
 *  - `expirada`: o servidor recusou (token vencido ou credencial trocada) — ir para o login.
 *  - `indisponivel`: rede ou Sankhya fora do ar — tentar de novo depois, sem deslogar.
 *  - `sem-rota`: o backend ainda não tem /renovar — não insistir; expira no vencimento.
 */
export type MotivoFalha = "expirada" | "indisponivel" | "sem-rota";

export class ErroRenovacao extends Error {
  readonly motivo: MotivoFalha;
  constructor(motivo: MotivoFalha) {
    super(`Renovação de sessão falhou: ${motivo}`);
    this.name = "ErroRenovacao";
    this.motivo = motivo;
  }
}

const cliente = axios.create({ baseURL: API_BASE, withCredentials: true });

/* ── Eventos ─────────────────────────────────────────────────── */
const aoExpirar = new Set<() => void>();
const aoRenovar = new Set<(token: string) => void>();

export function onSessaoExpirada(cb: () => void): () => void {
  aoExpirar.add(cb);
  return () => aoExpirar.delete(cb);
}

export function dispararSessaoExpirada() {
  aoExpirar.forEach((cb) => cb());
}

export function onTokenRenovado(cb: (token: string) => void): () => void {
  aoRenovar.add(cb);
  return () => aoRenovar.delete(cb);
}

/* ── Renovação ───────────────────────────────────────────────── */
let emAndamento: Promise<string> | null = null;

/**
 * Pede um token novo ao backend. Chamadas simultâneas compartilham a mesma
 * requisição. Resolve com o token novo (já gravado) ou rejeita com `ErroRenovacao`.
 */
export function renovarToken(): Promise<string> {
  if (emAndamento) return emAndamento;

  const atual = lerToken();

  const promessa = (async () => {
    if (!atual) throw new ErroRenovacao("expirada");
    try {
      const { data } = await cliente.post(ROTA_RENOVAR, null, {
        headers: { Authorization: `Bearer ${atual}` },
      });
      const novo: unknown = data?.token;
      if (typeof novo !== "string" || !novo) throw new ErroRenovacao("indisponivel");

      const usuario = usuarioDoToken(novo) ?? lerUsuario();
      if (usuario) gravarSessao(novo, usuario);
      aoRenovar.forEach((cb) => cb(novo));
      return novo;
    } catch (e) {
      if (e instanceof ErroRenovacao) throw e;
      const status = (e as AxiosError).response?.status;
      if (status === 401) throw new ErroRenovacao("expirada");
      if (status === 404) throw new ErroRenovacao("sem-rota");
      throw new ErroRenovacao("indisponivel");
    }
  })();

  emAndamento = promessa;
  // Limpa fora da cadeia da requisição (ver cuidado 2 no topo). O `.catch`
  // final só evita "unhandled rejection" desta cadeia auxiliar.
  promessa
    .finally(() => {
      if (emAndamento === promessa) emAndamento = null;
    })
    .catch(() => {});

  return promessa;
}
