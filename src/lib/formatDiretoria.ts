// src/lib/formatDiretoria.ts
// Cópia literal de painel-diretoria/src/lib/format.ts, com outro nome.
//
// Não foi mesclada ao `lib/format.ts` deste projeto porque as assinaturas
// colidem com semânticas diferentes: aqui `int(v)` CONVERTE para número e
// `num(v, digits)` recebe casas como número; lá `int(v)` FORMATA como texto e
// `num(v, { decimals })` recebe um objeto. Importar do lugar errado compila e
// mostra números errados. As rotinas copiadas da diretoria (OPE) usam este.

// src/lib/format.ts
// Formatação única do painel. Substitui 30+ helpers duplicados (8 de moeda,
// 5 de horas, 6 de percentual, 3 de abreviação) que produziam grafias
// diferentes para o mesmo número — inclusive na MESMA tela.
//
// Dois princípios:
//  1. Formatters são memoizados em escopo de módulo. Antes, cada helper fazia
//     `v.toLocaleString(...)`, o que instancia um Intl.NumberFormat por chamada
//     — dezenas de milhares de vezes por render nas telas pesadas.
//  2. A escolha "abreviado vs completo" é do SLOT, não da página. Ver REGRA
//     no fim do arquivo.

import { parseData } from "./datetime";

export type Nullish = number | string | null | undefined;

/** Placeholder de ausência de valor. Único em todo o painel. */
export const DASH = "—";
/** Minus tipográfico (U+2212): mesma largura dos dígitos tabulares — o hífen não é. */
export const MINUS = "−";

const LOCALE = "pt-BR";

/** Cache de Intl por assinatura de opções. */
const cacheNum = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = JSON.stringify(opts);
  let f = cacheNum.get(k);
  if (!f) { f = new Intl.NumberFormat(LOCALE, opts); cacheNum.set(k, f); }
  return f;
}

/** Normaliza entrada para número finito, ou null. */
function toNum(v: Nullish): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Troca o hífen do locale pelo minus tipográfico e elimina o "menos zero":
 * −0,005 arredondado para 0 casas viraria "−R$ 0", que na tela parece defeito.
 */
function fixMinus(s: string): string {
  const semSinal = s.replace(/^-/, "");
  if (s.startsWith("-") && !/[1-9]/.test(semSinal)) return semSinal;
  return s.replace(/^-/, MINUS);
}

// ── Moeda ────────────────────────────────────────────────────────────────────

/** Valor completo: "R$ 1.234.567,89". Padrão de tabela, tooltip e total. */
export function brl(v: Nullish, o?: { decimals?: 0 | 2; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const d = o?.decimals ?? 2;
  return fixMinus(nf({ style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
}

/** Abreviado: "R$ 1,23 mi". Só para KPI e título — nunca em tabela. */
export function brlCompact(v: Nullish, o?: { decimals?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  return fixMinus(nf({
    style: "currency", currency: "BRL", notation: "compact", compactDisplay: "short",
    maximumFractionDigits: o?.decimals ?? 2,
  }).format(n));
}

/**
 * Escolhe entre completo e abreviado pelo tamanho.
 * Abaixo de R$ 100 mil, "R$ 87.400" é mais curto E mais preciso que "R$ 87,4 mil".
 */
export function brlAuto(v: Nullish, o?: { threshold?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  return Math.abs(n) >= (o?.threshold ?? 1e5) ? brlCompact(n) : brl(n, { decimals: 0 });
}

// ── Números ──────────────────────────────────────────────────────────────────

export function num(v: Nullish, o?: { decimals?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const d = o?.decimals ?? 2;
  return fixMinus(nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
}

/** Inteiro arredondado: "12.346". */
export function int(v: Nullish, o?: { dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  return fixMinus(nf({ maximumFractionDigits: 0 }).format(n));
}

/** "1,2 mi" — sem moeda. Para ticks de eixo. */
export function compact(v: Nullish, o?: { decimals?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  return fixMinus(nf({ notation: "compact", compactDisplay: "short", maximumFractionDigits: o?.decimals ?? 1 }).format(n));
}

/** Sempre com sinal: "+1.234" / "−1.234". Para deltas. */
export function signed(v: Nullish, o?: { decimals?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const s = num(n, { decimals: o?.decimals ?? 0 });
  return n > 0 ? `+${s}` : s;
}

// ── Percentual ───────────────────────────────────────────────────────────────

/**
 * `fraction: true` → recebe 0.152 e mostra "15,2%".
 * Padrão (false)   → recebe 15.2  e mostra "15,2%".
 */
export function pct(v: Nullish, o?: { decimals?: number; fraction?: boolean; dash?: string; signed?: boolean }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const val = o?.fraction ? n * 100 : n;
  const s = `${num(val, { decimals: o?.decimals ?? 1 })}%`;
  return o?.signed && val > 0 ? `+${s}` : s;
}

/** Delta de percentual em pontos: "+3,4 p.p.". */
export function pp(v: Nullish, o?: { decimals?: number; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const s = num(n, { decimals: o?.decimals ?? 1 });
  return `${n > 0 ? "+" : ""}${s} p.p.`;
}

// ── Horas ────────────────────────────────────────────────────────────────────

/** "1.234,5 h". A unidade vem junto — nunca concatenar "h" à mão. */
export function hours(v: Nullish, o?: { decimals?: number; unit?: boolean; dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const s = num(n, { decimals: o?.decimals ?? 1 });
  return o?.unit === false ? s : `${s} h`;
}

/** "1.234:30" — horas decimais em hh:mm. */
export function hoursHM(v: Nullish, o?: { dash?: string }): string {
  const n = toNum(v);
  if (n === null) return o?.dash ?? DASH;
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const [hh, mm] = m === 60 ? [h + 1, 0] : [h, m];
  return `${sign}${int(hh)}:${String(mm).padStart(2, "0")}`;
}

// ── Datas ────────────────────────────────────────────────────────────────────

export function date(v: Date | string | number | null | undefined, o?: { dash?: string }): string {
  const d = parseData(v);
  if (!d) return o?.dash ?? DASH;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** "12/ago" — para eixos e listas densas. */
export function dateShort(v: Date | string | number | null | undefined, o?: { dash?: string }): string {
  const d = parseData(v);
  if (!d) return o?.dash ?? DASH;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${String(d.getDate()).padStart(2, "0")}/${meses[d.getMonth()]}`;
}

export function time(v: Date | string | number | null | undefined, o?: { dash?: string }): string {
  const d = parseData(v);
  if (!d) return o?.dash ?? DASH;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateTime(v: Date | string | number | null | undefined, o?: { dash?: string }): string {
  const d = parseData(v);
  if (!d) return o?.dash ?? DASH;
  return `${date(d)} ${time(d)}`;
}

// ── Tom por sinal ────────────────────────────────────────────────────────────

export type Tone = "ok" | "bad" | "neutral";

/**
 * Cor semântica a partir do sinal. Substitui os `deltaCls` duplicados.
 * `positiveIsGood: false` para métricas onde subir é ruim (custo, absenteísmo).
 */
export function toneOf(v: Nullish, o?: { positiveIsGood?: boolean }): Tone {
  const n = toNum(v);
  if (n === null || n === 0) return "neutral";
  const bom = o?.positiveIsGood ?? true;
  return (n > 0) === bom ? "ok" : "bad";
}

// ─────────────────────────────────────────────────────────────────────────────
// REGRA DE MOEDA — qual slot usa qual formato (aplicada pelo COMPONENTE):
//
//   Valor de StatCard ....... brlAuto    (abrevia ≥ R$ 100 mil)
//   Tick de eixo ............ compact    (sem "R$"; a unidade vai no rótulo)
//   Tooltip de gráfico ...... brl        COMPLETO
//   Célula de tabela ........ brl        COMPLETO
//   Rodapé / total .......... brl        COMPLETO
//   Título / subtítulo ...... brlAuto
//
// Consequência: dentro de uma mesma região nunca convivem duas grafias do
// mesmo número. `brlCompact` não deve ser chamado direto por página nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
