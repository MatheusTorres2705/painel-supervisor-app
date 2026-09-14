import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/api";
import {
  CHAVE_TOKEN,
  expiracaoMs,
  gravarSessao,
  lerToken,
  lerUsuario,
  limparSessao,
  tokenVencido,
  usuarioDoToken,
  type Usuario,
} from "@/auth/token";
import {
  ErroRenovacao,
  onSessaoExpirada,
  onTokenRenovado,
  renovarToken,
} from "@/auth/sessao";

type User = Usuario | null;

/** Por que o usuário está fora — a LoginPage mostra o aviso quando é "expirada". */
export type MotivoSaida = "expirada" | null;

type AuthCtx = {
  user: User;
  token: string | null;
  motivoSaida: MotivoSaida;
  login: (usuario: string, senha: string) => Promise<void>;
  logout: () => void;
  /** Encerra a sessão por expiração: vai para o login com aviso. */
  expirarSessao: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa de <AuthProvider>");
  return ctx;
};

/** Renova quando faltar isto para vencer. Cobre o throttling de timers em aba de fundo. */
const JANELA_RENOVACAO_MS = 10 * 60 * 1000;
/** Espera entre tentativas quando a rede ou o Sankhya estão fora. */
const REPETIR_APOS_MS = 60 * 1000;
/**
 * Maior atraso que o `setTimeout` aceita (2³¹−1 ms ≈ 24,8 dias). Acima disso o
 * navegador estoura o valor e dispara o timer NA HORA — com um token de
 * validade longa, cada renovação agendaria a próxima "para daqui a semanas",
 * dispararia imediatamente e viraria um laço de renovações. Por isso todo
 * agendamento é limitado a este teto e reconfere a hora quando dispara.
 */
const MAX_ATRASO_MS = 2_147_483_647;

/** Estado inicial: um token já vencido no storage não chega a ser usado. */
function sessaoInicial(): { token: string | null; user: User; motivo: MotivoSaida } {
  const token = lerToken();
  if (token && tokenVencido(token)) {
    limparSessao();
    return { token: null, user: null, motivo: "expirada" };
  }
  return { token, user: token ? lerUsuario() : null, motivo: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [inicial] = useState(sessaoInicial);
  const [token, setToken] = useState<string | null>(inicial.token);
  const [user, setUser] = useState<User>(inicial.user);
  const [motivoSaida, setMotivoSaida] = useState<MotivoSaida>(inicial.motivo);

  // Os ouvintes (interceptor, storage) precisam do token atual sem se reinscrever.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const encerrar = useCallback((motivo: MotivoSaida) => {
    limparSessao();
    delete api.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
    setMotivoSaida(motivo);
  }, []);

  /** Idempotente: vários 401 simultâneos, ou um 401 depois do logout, não repetem nada. */
  const expirarSessao = useCallback(() => {
    if (!tokenRef.current) return;
    tokenRef.current = null;
    encerrar("expirada");
  }, [encerrar]);

  const login = useCallback(async (usuario: string, senha: string) => {
    const resp = await api.post("/api/auth/login", { usuario, senha });

    const tk = resp.data?.token;
    if (!tk) throw new Error("Token não retornou no login.");

    const u = usuarioDoToken(tk, usuario);
    if (!u) {
      // normalmente a query do backend não achou o usuário (codusu veio null)
      throw new Error("CODUSU ausente no token. Verifique o usuário no TSIUSU.");
    }

    gravarSessao(tk, u);
    tokenRef.current = tk;
    setToken(tk);
    setUser(u);
    setMotivoSaida(null);
  }, []);

  const logout = useCallback(() => {
    tokenRef.current = null;
    encerrar(null);
  }, [encerrar]);

  /* ── Interceptor do axios → encerrar; renovação → atualizar estado ── */
  useEffect(() => onSessaoExpirada(expirarSessao), [expirarSessao]);

  useEffect(
    () =>
      onTokenRenovado((novo) => {
        tokenRef.current = novo;
        setToken(novo);
        const u = usuarioDoToken(novo);
        if (u) setUser(u);
      }),
    []
  );

  /* ── Renovação proativa, amarrada ao token atual ── */
  useEffect(() => {
    if (!token) return;

    const exp = expiracaoMs(token);
    if (exp == null) return; // sem `exp` não há o que agendar; o servidor decide

    let timer: number | undefined;
    let semRota = false;
    let cancelado = false;

    const limparTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };

    /** setTimeout com o atraso limitado ao teto do navegador (ver MAX_ATRASO_MS). */
    const agendar = (fn: () => void, atrasoMs: number) => {
      limparTimer();
      timer = window.setTimeout(fn, Math.min(Math.max(atrasoMs, 0), MAX_ATRASO_MS));
    };

    /** Dispara no vencimento; se acordou antes (teto do timer), reagenda. */
    const aoVencer = () => {
      if (cancelado) return;
      if (tokenVencido(token)) expirarSessao();
      else agendar(aoVencer, exp - Date.now());
    };

    /** Dispara na janela de renovação; se acordou antes (teto do timer), reagenda. */
    const aoChegarJanela = () => {
      if (cancelado) return;
      const falta = exp - Date.now() - JANELA_RENOVACAO_MS;
      if (falta > 0) agendar(aoChegarJanela, falta);
      else void tentar();
    };

    const tentar = async () => {
      if (cancelado) return;
      if (tokenVencido(token)) {
        expirarSessao();
        return;
      }
      if (semRota) return;

      try {
        // Sucesso troca o token no estado: este efeito é refeito com o novo `exp`.
        await renovarToken();
      } catch (e) {
        if (cancelado) return;
        const motivo = e instanceof ErroRenovacao ? e.motivo : "indisponivel";
        limparTimer();
        if (motivo === "expirada") {
          expirarSessao();
        } else if (motivo === "sem-rota") {
          // Backend sem /renovar: não insiste; encerra no vencimento.
          semRota = true;
          agendar(aoVencer, exp - Date.now());
        } else {
          // Rede ou Sankhya fora: tenta de novo, sem deslogar, até vencer.
          agendar(() => void tentar(), Math.min(REPETIR_APOS_MS, exp - Date.now()));
        }
      }
    };

    agendar(aoChegarJanela, exp - Date.now() - JANELA_RENOVACAO_MS);

    /* Timers param com o notebook dormindo e atrasam em aba de fundo: ao voltar,
       confere na hora em vez de esperar o agendamento. */
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (tokenVencido(token)) expirarSessao();
      else if (!semRota && tokenVencido(token, JANELA_RENOVACAO_MS)) void tentar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener("online", aoVoltar);

    return () => {
      cancelado = true;
      limparTimer();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener("online", aoVoltar);
    };
  }, [token, expirarSessao]);

  /* ── Outras abas ── */
  useEffect(() => {
    const aoMudarStorage = (e: StorageEvent) => {
      if (e.key !== CHAVE_TOKEN) return;
      if (e.newValue) {
        // Outra aba renovou ou entrou: adota o token para não renovar em dobro.
        if (e.newValue === tokenRef.current) return;
        tokenRef.current = e.newValue;
        setToken(e.newValue);
        setUser(usuarioDoToken(e.newValue) ?? lerUsuario());
        setMotivoSaida(null);
      } else if (tokenRef.current) {
        // Outra aba saiu. Se o token daqui já venceu, foi expiração: mostra o aviso.
        const venceu = tokenVencido(tokenRef.current);
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        setMotivoSaida(venceu ? "expirada" : null);
      }
    };
    window.addEventListener("storage", aoMudarStorage);
    return () => window.removeEventListener("storage", aoMudarStorage);
  }, []);

  const value = useMemo(
    () => ({ user, token, motivoSaida, login, logout, expirarSessao }),
    [user, token, motivoSaida, login, logout, expirarSessao]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
