type SankhyaDatasetRetorno = {
  serviceName?: string;
  status?: string | number;
  statusMessage?: string;
  personalizationMessage?: string;
  transactionId?: string;
};

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
