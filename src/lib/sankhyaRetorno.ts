type SankhyaDatasetRetorno = {
  serviceName?: string;
  status?: string | number;
  statusMessage?: string;
  personalizationMessage?: string;
  transactionId?: string;
};

type ErroApi = {
  response?: { status?: number; data?: { erro?: unknown; detalhe?: unknown; codigo?: unknown } };
  message?: unknown;
};

/** Códigos do backend que significam "a sessão acabou" (ver middleware/auth.js). */
const CODIGOS_SESSAO = new Set(["TOKEN_AUSENTE", "TOKEN_EXPIRADO", "TOKEN_INVALIDO", "CREDENCIAL_INVALIDA"]);

/**
 * Extrai a mensagem mais útil de um erro de chamada ao ERP, na ordem:
 * statusMessage do Sankhya -> `erro` do backend -> message do axios -> fallback.
 * Substitui a cadeia `e?.response?.data?...` com `catch (e: any)` repetida
 * em todas as páginas.
 */
export function mensagemErro(e: unknown, fallback = "Erro desconhecido."): string {
  const err = (e ?? {}) as ErroApi;
  const data = err.response?.data;

  // Sessão vencida: o usuário é levado ao login; se a tela chegar a mostrar a
  // mensagem nesse meio-tempo, que não seja o "Token inválido" cru. O 401 de
  // senha errada no login não tem esses códigos e segue o fluxo normal.
  if (
    err.response?.status === 401 &&
    (CODIGOS_SESSAO.has(String(data?.codigo)) || /^Token (inválido|ausente)$/.test(String(data?.erro ?? "")))
  ) {
    return "Sua sessão expirou. Entre novamente.";
  }

  const detalhe = data?.detalhe;

  const statusMessage =
    detalhe && typeof detalhe === "object"
      ? (detalhe as { statusMessage?: unknown }).statusMessage
      : detalhe;

  for (const candidato of [statusMessage, data?.erro, err.message]) {
    if (typeof candidato === "string" && candidato.trim()) return candidato;
  }
  return fallback;
}

export function htmlToText(html: string) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const txt = doc.body?.textContent || "";
    return txt
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

export function decodeB64Maybe(v?: string) {
  if (!v) return "";
  try {
    // remove quebras de linha, comuns no base64 do Sankhya
    const clean = String(v).replace(/\s+/g, "");
    return atob(clean);
  } catch {
    return "";
  }
}

// extrai só a parte “humana” antes das infos técnicas
export function splitHumanAndTech(txt: string) {
  const marker = "Informac"; // pega "Informac?es..." ou "Informações..."
  const idx = txt.toLowerCase().indexOf(marker.toLowerCase());
  if (idx >= 0) {
    return {
      human: txt.slice(0, idx).trim(),
      tech: txt.slice(idx).trim(),
    };
  }
  return { human: txt.trim(), tech: "" };
}

// tenta montar um resumo: Atenção/Motivo/Solução
export function extractResumo(txt: string) {
  const t = txt.replace(/\r/g, "");
  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);

  const pick = (label: string) => {
    const i = lines.findIndex((l) => l.toLowerCase().startsWith(label.toLowerCase()));
    if (i < 0) return "";
    return lines[i];
  };

  const atencao = pick("Aten") || pick("Atenç") || "";
  const motivo = pick("Motivo") || "";
  const solucao = pick("Soluc") || pick("Soluç") || "";

  const bloco = [atencao, motivo, solucao].filter(Boolean).join("\n");
  return bloco || lines.slice(0, 8).join("\n");
}

export function parseDatasetSaveResponse(data: any) {
  // alguns backends devolvem {STATUS:1}, outros {RETORNO:{status:"1"...}}
  const retorno: SankhyaDatasetRetorno | undefined =
    data?.RETORNO || data?.retorno || data?.Retorno || undefined;

  const rawStatus = retorno?.status ?? data?.STATUS ?? data?.status;
  const status = String(rawStatus ?? "").toUpperCase();

  const ok =
    status === "1" ||
    status === "SUCCESS" ||
    status === "TRUE" ||
    rawStatus === 1 ||
    rawStatus === true;

  if (ok) return { ok: true as const };

  const html = retorno?.statusMessage ?? data?.statusMessage ?? "";
  const txt = htmlToText(html);
  const { human, tech } = splitHumanAndTech(txt);

  const personalization = decodeB64Maybe(retorno?.personalizationMessage);

  return {
    ok: false as const,
    title: "Regra do Sankhya",
    resumo: extractResumo(human || txt),
    human: human || txt,
    tech,
    transactionId: retorno?.transactionId,
    personalization,
    raw: txt,
  };
}
