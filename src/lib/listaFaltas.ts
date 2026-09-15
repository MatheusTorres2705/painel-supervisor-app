// src/lib/listaFaltas.ts
// Regras da Lista de Faltas sem React: farol por item e agrupamento por linha e
// barco. Saíram da ListaFaltasPage para o Dashboard usar exatamente as mesmas.
import type { FaltaDetalheRow } from "@/services/comprasService";
import { SEM_LINHA, compararLinhas } from "@/lib/linhasProduto";

/** Converte DD/MM/YYYY ou ISO (YYYY-MM-DD...) para timestamp numérico para comparação */
export function parseDateTs(d: string): number {
  if (!d) return 0;
  const s = d.trim();
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]).getTime();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? 0 : d2.getTime();
}

export type FarolStatus = "vermelho" | "amarelo" | "verde";

export function getFarolRow(r: { nropedcompra: number | null; dtentregav: string; dtinicioprev: string }): FarolStatus {
  if (!r.nropedcompra) return "vermelho";
  const entrega = parseDateTs(r.dtentregav);
  const inicio  = parseDateTs(r.dtinicioprev);
  if (entrega > 0 && inicio > 0 && entrega > inicio) return "amarelo";
  return "verde";
}

export const SEM_CHASSI = "Sem chassi";
export const linhaDe = (r: FaltaDetalheRow) => r.linha || SEM_LINHA;
export const chassiDe = (r: FaltaDetalheRow) => r.chassi || SEM_CHASSI;

export type Contagem = { itens: number; produtos: number; vermelho: number; amarelo: number; verde: number };
export type BarcoGrupo = Contagem & { chave: string; linha: string; chassi: string };
export type LinhaGrupo = Contagem & { linha: string; barcos: BarcoGrupo[] };

/**
 * "Total faltante" = itens em falta (linhas produto × chassi), por farol.
 * Necessidade NÃO é somada aqui: mistura unidades (UN, M, KG) de produtos
 * diferentes, e a soma de um barco não significaria nada.
 */
export function contar(rows: FaltaDetalheRow[]): Contagem {
  const c = { itens: rows.length, produtos: new Set(rows.map(r => r.codprod)).size, vermelho: 0, amarelo: 0, verde: 0 };
  for (const r of rows) c[getFarolRow(r)] += 1;
  return c;
}

/** Pior primeiro: mais itens sem pedido, depois atrasados, depois volume. */
export const porGravidade = (a: Contagem, b: Contagem) =>
  b.vermelho - a.vermelho || b.amarelo - a.amarelo || b.itens - a.itens;

export function agruparPorLinhaEBarco(rows: FaltaDetalheRow[]): LinhaGrupo[] {
  const porLinha = new Map<string, Map<string, FaltaDetalheRow[]>>();
  for (const r of rows) {
    const l = linhaDe(r);
    if (!porLinha.has(l)) porLinha.set(l, new Map());
    const barcos = porLinha.get(l)!;
    const c = chassiDe(r);
    if (!barcos.has(c)) barcos.set(c, []);
    barcos.get(c)!.push(r);
  }
  return [...porLinha.entries()]
    .map(([linha, barcos]) => ({
      linha,
      ...contar([...barcos.values()].flat()),
      barcos: [...barcos.entries()]
        .map(([chassi, rs]) => ({ chave: `${linha}|${chassi}`, linha, chassi, ...contar(rs) }))
        .sort((a, b) => porGravidade(a, b) || a.chassi.localeCompare(b.chassi, "pt-BR", { numeric: true })),
    }))
    .sort((a, b) => compararLinhas(a.linha, b.linha));
}

