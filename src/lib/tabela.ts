// src/lib/tabela.ts
// Tipos e utilitários puros de tabela: leitura de célula, normalização e export
// para Excel. Consumidos por ui/table-export.ts (adaptador para o DataTable do
// design system, em ui/table.tsx).
// Ficam aqui, e não no .tsx, porque a regra react-refresh/only-export-components
// trata export de não-componente dentro de um arquivo de componente como erro.

import type { ReactNode } from "react";
import { exportXlsx, type CellValue } from "@/lib/xlsx";

export type ColunaTipo = "text" | "number" | "date";
export type Alinhamento = "left" | "right" | "center";
export type FiltroData = { from: string; to: string };
export type FiltroValor = string | FiltroData;

export type Coluna<T = unknown> = {
  key: string;
  label: string;
  type?: ColunaTipo;                       // afeta ordenação e tipo de filtro
  align?: Alinhamento;                     // padrão: 'right' para number, 'left' para o resto
  render?: (row: T) => ReactNode;          // exibição customizada
  sortValue?: (row: T) => string | number; // sobrescreve `type` na ordenação
  filterValue?: (row: T) => string;        // texto usado no filtro
  exportValue?: (row: T) => string | number;
  filterable?: boolean;                    // padrão true
  filterWords?: boolean;                   // filtra por palavras unidas por E
  sortable?: boolean;                      // padrão true
  exportable?: boolean;                    // padrão true
};

/* Subconjunto de que o popup de filtro precisa — evita genérico no componente. */
export type ColunaFiltro = Pick<Coluna, "label" | "type" | "filterWords">;

export type Ordenacao = { key: string; dir: "asc" | "desc" } | null;

/* Filtro "vazio": texto em branco ou intervalo sem datas. */
export function filtroVazio(value: FiltroValor): boolean {
  if (value == null) return true;
  if (typeof value === "object") return !value.from && !value.to;
  return !String(value).trim();
}

export function dataNoIntervalo(ts: number, { from, to }: FiltroData): boolean {
  if (!ts) return false;
  if (from) {
    const f = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(f) && ts < f) return false;
  }
  if (to) {
    const t = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(t) && ts > t) return false;
  }
  return true;
}

/* Minúsculas e sem acento, para comparação de filtros. */
export function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Padrão: o termo inteiro precisa estar contido na célula.
   Com `porPalavras`: cada palavra vira um filtro unido por E, em qualquer ordem —
   "acabamento componente" acha "ACABAMENTO LINHA COMPONENTES". */
export function textoCombina(cell: string, termo: string, porPalavras?: boolean): boolean {
  const alvo = norm(cell);
  if (!porPalavras) return alvo.includes(norm(termo));
  return norm(termo).split(/\s+/).filter(Boolean).every((p) => alvo.includes(p));
}

/* Converte data (ISO ou dd/mm/aaaa[ hh:mm:ss]) em timestamp comparável. */
export function parseData(value: unknown): number {
  if (!value) return 0;
  const s = String(value).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = br;
    return new Date(+y, +m - 1, +d, +hh, +mm, +ss).getTime();
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/* Valor da célula para exportação: exportValue > filterValue > valor bruto. */
function cellExport<T>(col: Coluna<T>, row: T): CellValue {
  if (col.exportValue) return col.exportValue(row);
  if (col.filterValue) return col.filterValue(row);
  const raw = (row as Record<string, unknown>)[col.key];
  if (raw == null) return "";
  return typeof raw === "number" ? raw : String(raw);
}

/* Exporta as linhas (já filtradas/ordenadas) para .xlsx.
   Usa o gerador próprio do projeto (src/lib/xlsx.ts) — sem dependência externa. */
export function exportToExcel<T>(
  columns: Coluna<T>[],
  rows: T[],
  filename = "export.xlsx",
  sheetName = "Dados",
) {
  const cols = columns.filter((c) => c.exportable !== false);
  const headers = cols.map((c) => c.label);
  const data = (rows || []).map((row) => cols.map((c) => cellExport(c, row)));
  exportXlsx(filename, sheetName, headers, data);
}

/* Nome de arquivo seguro a partir de um título de tela. */
export function slugArquivo(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
