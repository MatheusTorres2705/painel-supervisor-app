// src/lib/opeAuditoria.ts
// Regras da auditoria do OPE, sem React. Partem das mesmas linhas de detalhe que
// a tela OPE já consulta (getPontoDetalhe / getAtivDetalhe) e as agrupam do jeito
// que se audita: ponto por colaborador, atividades por barco — com a conferência
// contra o número do card, para dizer se a soma do detalhe fecha.
import type { AtivDetalheRow, PontoDetalheRow } from "@/services/opeService";
import { pctAvanco, statusAvanco, type OpAvanco, type StatusOP } from "@/services/opsService";
import { parseData } from "@/lib/datetime";

/** Horas de ponto por dia registrado — a mesma premissa do SQL agregado (`COUNT(*) * 8`). */
export const HORAS_POR_DIA_PONTO = 8;

const ts = (ddmmyyyy: string) => parseData(ddmmyyyy)?.getTime() ?? 0;

/* ── Ponto ───────────────────────────────────────────────────── */

export type DiaPonto = { data: string; heHoras: number };
export type ColaboradorPonto = {
  codigo: string;
  nome: string;
  departamentos: string[];
  dias: DiaPonto[];
  qtdDias: number;
  horasPonto: number;
  heHoras: number;
  primeiroDia: string;
  ultimoDia: string;
};

/**
 * Um colaborador por linha. O detalhe traz uma linha por colaborador × dia
 * (× departamento, se houver mais de um) — o dia conta uma vez só.
 */
export function pontoPorColaborador(rows: PontoDetalheRow[]): ColaboradorPonto[] {
  const porCodigo = new Map<string, { nome: string; deps: Set<string>; dias: Map<string, number> }>();
  for (const r of rows) {
    const k = r.codigo || r.nome;
    const e = porCodigo.get(k) ?? { nome: r.nome, deps: new Set<string>(), dias: new Map<string, number>() };
    if (r.departamento) e.deps.add(r.departamento);
    // HE já vem por (colaborador, dia): repetir o dia (outro departamento) não soma de novo.
    e.dias.set(r.data, Math.max(e.dias.get(r.data) ?? 0, r.heHoras || 0));
    porCodigo.set(k, e);
  }
  return [...porCodigo.entries()].map(([codigo, e]) => {
    const dias = [...e.dias.entries()].map(([data, heHoras]) => ({ data, heHoras })).sort((a, b) => ts(a.data) - ts(b.data));
    return {
      codigo,
      nome: e.nome,
      departamentos: [...e.deps].sort(),
      dias,
      qtdDias: dias.length,
      horasPonto: dias.length * HORAS_POR_DIA_PONTO,
      heHoras: dias.reduce((s, d) => s + d.heHoras, 0),
      primeiroDia: dias[0]?.data ?? "",
      ultimoDia: dias[dias.length - 1]?.data ?? "",
    };
  });
}

/* ── Atividades ──────────────────────────────────────────────── */

export type BarcoAtividades = {
  barco: string;
  linha: string;
  horas: number;
  /** % das horas do recorte. */
  participacao: number;
  qtdAtividades: number;
  qtdDias: number;
  setores: string[];
  linhas: AtivDetalheRow[];
};

export function atividadesPorBarco(rows: AtivDetalheRow[]): BarcoAtividades[] {
  const total = rows.reduce((s, r) => s + (r.horas || 0), 0);
  const porBarco = new Map<string, AtivDetalheRow[]>();
  for (const r of rows) {
    const k = r.projeto || "(sem barco)";
    const arr = porBarco.get(k) ?? [];
    arr.push(r);
    porBarco.set(k, arr);
  }
  return [...porBarco.entries()]
    .map(([barco, linhas]) => {
      const horas = linhas.reduce((s, r) => s + (r.horas || 0), 0);
      return {
        barco,
        linha: linhas.find((r) => r.linha)?.linha ?? "",
        horas,
        participacao: total > 0 ? (horas / total) * 100 : 0,
        qtdAtividades: new Set(linhas.map((r) => `${r.codSetor}|${r.codAtividade}`)).size,
        qtdDias: new Set(linhas.map((r) => r.data)).size,
        setores: [...new Set(linhas.map((r) => r.setorMacro || r.setor).filter(Boolean))].sort(),
        linhas: [...linhas].sort((a, b) => ts(b.data) - ts(a.data) || b.horas - a.horas),
      };
    })
    .sort((a, b) => b.horas - a.horas);
}

/* ── Conferência com o card ─────────────────────────────────── */

export type Conferencia = { soma: number; total: number; diferenca: number; confere: boolean };

/** A soma do detalhe fecha com o número do card? Tolerância de meia hora (arredondamentos do SQL). */
export function conferencia(soma: number, total: number | null | undefined): Conferencia | null {
  if (total == null || !Number.isFinite(total)) return null;
  const diferenca = soma - total;
  return { soma, total, diferenca, confere: Math.abs(diferenca) < 0.5 };
}

/* ── Avanço do cronograma por barco ─────────────────────────── */

export type AvancoBarco = { previsto: number; real: number; status: StatusOP; ops: number };

/**
 * Índice por identificação do barco (PRJ.IDENTIFICACAO — a mesma chave que o
 * detalhe de atividades chama de PROJETO). Várias OPs do mesmo barco entram na média.
 */
export function avancoPorBarco(ops: OpAvanco[]): Map<string, AvancoBarco> {
  const acc = new Map<string, { prev: number; real: number; n: number }>();
  for (const o of ops) {
    const k = o.identificacao;
    if (!k) continue;
    const e = acc.get(k) ?? { prev: 0, real: 0, n: 0 };
    e.prev += pctAvanco(o.avancoPrev);
    e.real += pctAvanco(o.avancoReal);
    e.n++;
    acc.set(k, e);
  }
  const out = new Map<string, AvancoBarco>();
  for (const [k, e] of acc) {
    const previsto = Math.round(e.prev / e.n);
    const real = Math.round(e.real / e.n);
    out.set(k, { previsto, real, status: statusAvanco(previsto, real), ops: e.n });
  }
  return out;
}

/** Acima disso o avanço não é consultado: a consulta do cronograma é pesada por mês. */
export const MAX_MESES_AVANCO = 3;

/** Meses ("YYYY-MM") cobertos por um período em "DD/MM/YYYY". `null` se passar do limite. */
export function mesesDoPeriodo(ini: string, fim: string): { ini: string; fim: string; qtd: number } | null {
  const a = parseData(ini);
  const b = parseData(fim);
  if (!a || !b) return null;
  const [x, y] = a <= b ? [a, b] : [b, a];
  const qtd = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) + 1;
  const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { ini: chave(x), fim: chave(y), qtd };
}
