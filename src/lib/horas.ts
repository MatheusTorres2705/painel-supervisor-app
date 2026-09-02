// src/lib/horas.ts
// Aritmética de horário. A tela de Hora Extra exibia HRINI/HRFIN crus e nunca
// calculava duração — não havia nenhum total de horas no produto inteiro.
//
// O Sankhya grava esses campos como HHMM (a inserção manda "2232"), mas o
// Oracle pode devolvê-los como número — "0800" volta como 800. O parser abaixo
// tolera "22:32", "2232", "22:32:00", 800 e 2232.

/** Converte um horário do ERP em minutos desde a meia-noite. `null` se inválido. */
export function parseHoraToMin(v: unknown): number | null {
  if (v == null) return null;
  const digits = String(v).trim().replace(/\D/g, "");
  if (!digits) return null;

  const padded =
    digits.length <= 2
      ? `${digits.padStart(2, "0")}00`
      : digits.padStart(4, "0").slice(0, 4);

  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh > 23 || mm > 59) return null;

  return hh * 60 + mm;
}

/** Minutos desde a meia-noite -> "HH:mm". */
export function formatHora(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Horário do ERP -> "HH:mm" para exibição. */
export function horaBR(v: unknown): string {
  return formatHora(parseHoraToMin(v));
}

/**
 * Duração entre dois horários, em minutos.
 * Se o fim for menor que o início, assume que o turno vira o dia (ex.: 22:00 → 02:00).
 */
export function duracaoMin(ini: unknown, fim: unknown): number | null {
  const a = parseHoraToMin(ini);
  const b = parseHoraToMin(fim);
  if (a == null || b == null) return null;

  let d = b - a;
  if (d < 0) d += 24 * 60;
  return d;
}

/** Minutos -> "2h00". */
export function formatDuracao(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Minutos -> horas decimais, para gráficos e somas. */
export function minToHoras(min: number | null | undefined): number {
  if (min == null || !Number.isFinite(min)) return 0;
  return min / 60;
}

/** Rótulo curto do turno: "22:00 → 23:59". */
export function faixaHorario(ini: unknown, fim: unknown): string {
  return `${horaBR(ini)} → ${horaBR(fim)}`;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-09-12" -> "qui, 12/09". Vazio se a data for inválida. */
export function diaCurto(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  // Construtor local (não UTC) para o dia da semana não escorregar.
  const date = new Date(y, m - 1, d);
  return `${DIAS[date.getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** `true` se a data cai em sábado ou domingo. */
export function isFimDeSemana(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** "2026-09" -> "2026-08". */
export function mesAnterior(yyyyMM: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) return "";
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" -> "setembro de 2026". */
export function mesExtenso(yyyyMM: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) return "";
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}
