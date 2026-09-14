// src/components/ui/table-export.ts
// Exportação para .xlsx a partir de colunas de tabela.
//
// Portado de painel-diretoria/src/components/ui/table-export.ts. Lá o tipo base
// é o `Column<T>` do DataTable do design system de lá, que não existe aqui; o
// `TableColumn<T>` abaixo tem só o que as telas copiadas usam. A lógica de
// exportação (`rotulo`, `valor`, `exportTabela`) é a mesma.
import type { ReactNode } from "react";
import { exportToExcel, type Coluna } from "@/lib/tabela";

export { slugArquivo } from "@/lib/tabela";

export type TableColumn<T> = {
  id: string;
  header: ReactNode;
  /** Valor da célula — base de exportação e de ordenação por texto. */
  accessor: (row: T) => string | number | null | undefined;
  /** Renderização customizada; padrão: o `accessor`. */
  cell?: (row: T) => ReactNode;
  align?: "left" | "right";
  /** 2 e 3 somem em telas estreitas (sm/md), como no DataTable de lá. */
  priority?: 2 | 3;
};

/**
 * Coluna com o que a exportação precisa a mais que a tela.
 *
 * `exportHeader` existe porque `header` é ReactNode: um cabeçalho com ícone ou
 * `<span>` não vira texto de célula. Sem ele, cai para o header quando é string
 * e, no limite, para o `id` — nunca para "[object Object]".
 */
export type ExportColumn<T> = TableColumn<T> & {
  /** Valor cru da célula no arquivo. Padrão: o `accessor`. */
  exportValue?: (row: T) => string | number;
  /** Rótulo da coluna no arquivo, quando `header` não for texto. */
  exportHeader?: string;
  /** `false` deixa a coluna fora do arquivo. */
  exportable?: boolean;
};

function rotulo<T>(c: ExportColumn<T>): string {
  if (c.exportHeader) return c.exportHeader;
  return typeof c.header === "string" || typeof c.header === "number" ? String(c.header) : c.id;
}

/** Valor exportado: `exportValue` quando houver, senão o `accessor` cru. */
function valor<T>(c: ExportColumn<T>, row: T): string | number {
  if (c.exportValue) return c.exportValue(row);
  const raw = c.accessor(row);
  if (raw == null) return "";
  return typeof raw === "number" ? raw : String(raw);
}

/**
 * Exporta as linhas JÁ filtradas/ordenadas — o arquivo reflete o que está na
 * tela, não a consulta bruta.
 */
export function exportTabela<T>(
  columns: ExportColumn<T>[],
  rows: T[],
  filename = "export.xlsx",
  sheetName = "Dados",
) {
  const cols: Coluna<T>[] = columns
    .filter((c) => c.exportable !== false)
    .map((c) => ({ key: c.id, label: rotulo(c), exportValue: (row: T) => valor(c, row) }));
  exportToExcel(cols, rows, filename, sheetName);
}
