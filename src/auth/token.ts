// src/auth/token.ts
// Leitura do JWT e do armazenamento da sessão. Sem React e sem rede: é usado
// pelo AuthProvider, pelo interceptor do axios e pela renovação.

export const CHAVE_TOKEN = "auth:token";
export const CHAVE_USUARIO = "auth:user";

export type Usuario = {
  name: string;
  codusu: number;
  codvend?: number;
  tipousuapp?: unknown;
};

/** Decodifica o payload do JWT sem lib externa. Não valida assinatura. */
export function parseJwt(token: string): Record<string, unknown> | null {
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

/** Momento de expiração do token, em ms desde a época. `null` se não houver `exp`. */
export function expiracaoMs(token: string): number | null {
  const exp = Number(parseJwt(token)?.exp);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

/**
 * `true` se o token já venceu (ou vence dentro de `folgaMs`) pelo relógio local.
 * Token sem `exp` legível não é dado como vencido — quem decide é o servidor.
 */
export function tokenVencido(token: string, folgaMs = 0): boolean {
  const exp = expiracaoMs(token);
  return exp != null && exp - folgaMs <= Date.now();
}

/** Dados do usuário a partir do payload. `null` se faltar o CODUSU. */
export function usuarioDoToken(token: string, nomeReserva = ""): Usuario | null {
  const p = parseJwt(token);
  const codusu = Number(p?.codusu);
  if (!codusu) return null;
  return {
    name: String(p?.name || p?.usuario || nomeReserva),
    codusu,
    codvend: Number(p?.codvend || 0),
    tipousuapp: p?.tipousuapp ?? null,
  };
}

// localStorage pode lançar (modo privado, armazenamento bloqueado).
export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function lerUsuario(): Usuario | null {
  try {
    const raw = localStorage.getItem(CHAVE_USUARIO);
    if (!raw) return null;
    const obj = JSON.parse(raw);
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

export function gravarSessao(token: string, usuario: Usuario) {
  try {
    localStorage.setItem(CHAVE_TOKEN, token);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  } catch {
    /* armazenamento indisponível: a sessão vale só enquanto a aba estiver aberta */
  }
}

export function limparSessao() {
  try {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
  } catch {
    /* nada a limpar */
  }
}
