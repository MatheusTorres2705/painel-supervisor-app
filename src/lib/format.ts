// src/lib/format.ts
// Formatação e exportação compartilhadas. `toBR` estava definido 4 vezes com 3
// comportamentos diferentes para nulo; `exportCsv` estava escrito 5 vezes.

/** Placeholder padrão para valor ausente em toda a UI. */
export const EMPTY = "—";

/** Uma linha crua devolvida por `obterReg`. */
export type ErpRow = Record<string, unknown>;

/** Coerção segura de coluna do ERP para texto. */
export function txt(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Coerção segura de coluna do ERP para número (0 se não for numérico). */
export function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `YYYY-MM-DD` -> `DD/MM/YYYY`. Tolerante a nulo e a formato inesperado. */
export function toBR(ymd?: string | null): string {
  if (!ymd) return EMPTY;
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  if (!y || !m || !d) return String(ymd);
  return `${d}/${m}/${y}`;
}

/** Data de hoje em `YYYY-MM-DD` (fuso local, não UTC). */
export function todayYMD(): string {
  return toYMD(new Date());
}

/** `Date` -> `YYYY-MM-DD` no fuso local. */
export function toYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Número no padrão pt-BR. */
export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return EMPTY;
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Horas-homem: uma casa decimal + sufixo. */
export function hh(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return EMPTY;
  return `${num(v, 1)} h`;
}

/** Percentual. */
export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return EMPTY;
  return `${num(v, digits)}%`;
}

/** Escapa um campo para CSV (RFC 4180). */
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Gera e baixa um CSV. `filename` recebe a data automaticamente.
 * Usa BOM para o Excel pt-BR abrir acentuação corretamente.
 */
export function exportCsv(
  filename: string,
  header: string[],
  rows: unknown[][]
): void {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${todayYMD()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
