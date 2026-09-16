// src/lib/absenteismoSetores.ts
// Agregação da aba "Por setor produtivo" do Absenteísmo, sem React.
//
// Separada do serviço porque o filtro de GALPÃO é só recorte: as linhas cruas
// (pessoa × setor × linha) vêm uma vez do ERP e trocar de galpão só reagrupa.
import { galpaoDaLinha, GALPOES } from "@/lib/galpoes";
import type { DadosSetor, FaltaSetorRow } from "@/services/absenteismoService";
import { SEM_SETOR } from "@/services/absenteismoService";

/** Rótulos e ordem dos setores macro — os mesmos códigos do OPE (SETORES_SQL). */
const SETOR_LABEL: Record<string, string> = {
  ACAB: "Acabamento",
  MONT: "Montagem",
  MARC: "Marcenaria",
  ELET: "Elétrica",
  LAM: "Laminação",
  REB: "Rebarba",
};
const ORDEM_SETOR = Object.keys(SETOR_LABEL);

export type PessoaFaltante = { codfunc: number; nome: string; faltas: number; hhPerdido: number };

export type SetorAbsenteismo = {
  codigo: string;
  label: string;
  /** Ativos em algum dia do mês. */
  pessoas: number;
  presentes: number;
  faltantes: number;
  /** presentes ÷ pessoas × 100. `null` sem pessoas. */
  disponivelPct: number | null;
  faltas: number;
  hhPerdido: number;
  pessoasFaltantes: PessoaFaltante[];
};

/** Total do mês — `COUNT(DISTINCT)` de verdade: quem está em dois setores conta uma vez. */
export type TotalAbsenteismoSetor = Omit<SetorAbsenteismo, "codigo" | "label" | "pessoasFaltantes">;

export type ResumoSetores = {
  setores: SetorAbsenteismo[];
  total: TotalAbsenteismoSetor;
  /** Pessoas do quadro que ficaram de fora por não ter linha, quando há galpão filtrado. */
  foraDoGalpao: number;
};

/** Opções do filtro: todos os galpões mais os cadastrados em lib/galpoes. */
export const OPCOES_GALPAO = [{ id: "todos", label: "Todos os galpões" }, ...GALPOES.map((g) => ({ id: g.id, label: g.label }))];

const pctDisp = (presentes: number, pessoas: number) => (pessoas > 0 ? (presentes / pessoas) * 100 : null);

/**
 * Agrupa por setor produtivo, opcionalmente só um galpão.
 *
 * O galpão de uma pessoa vem da LINHA do departamento dela (AD_DEPLINHA →
 * `galpaoDaLinha`). Duas consequências, ambas visíveis na tela:
 *  · departamento que atende linhas de galpões diferentes faz a pessoa contar
 *    em cada galpão — e uma vez só no total de "Todos os galpões";
 *  · quem não tem linha (indiretos, administrativo, e o faltante que não está
 *    no quadro) não pertence a galpão nenhum: aparece em "Todos" e some quando
 *    um galpão é escolhido. `foraDoGalpao` diz quantos são.
 *
 * @param galpao id do galpão ("g1"…) ou "todos".
 */
export function agruparAbsenteismoSetor(dados: DadosSetor | null, galpao: string): ResumoSetores {
  const vazio: ResumoSetores = {
    setores: [],
    total: { pessoas: 0, presentes: 0, faltantes: 0, disponivelPct: null, faltas: 0, hhPerdido: 0 },
    foraDoGalpao: 0,
  };
  if (!dados) return vazio;

  const todos = galpao === "todos";
  const noGalpao = (linha: string | null) => todos || galpaoDaLinha(linha)?.id === galpao;

  // Quem entra no recorte, e em quais setores.
  const setoresDaPessoa = new Map<string, Set<string>>();
  let foraDoGalpao = 0;
  const semLinha = new Set<string>();
  for (const r of dados.quadro) {
    if (!noGalpao(r.linha)) {
      if (!todos && !r.linha) semLinha.add(r.chave);
      continue;
    }
    const s = setoresDaPessoa.get(r.chave) ?? new Set<string>();
    s.add(r.setor);
    setoresDaPessoa.set(r.chave, s);
  }
  for (const chave of semLinha) if (!setoresDaPessoa.has(chave)) foraDoGalpao++;

  type Acc = { pessoas: Set<string>; faltantes: Map<string, PessoaFaltante> };
  const porSetor = new Map<string, Acc>();
  const doSetor = (s: string) => {
    const a = porSetor.get(s) ?? { pessoas: new Set<string>(), faltantes: new Map<string, PessoaFaltante>() };
    porSetor.set(s, a);
    return a;
  };

  const pessoasTotal = new Set<string>();
  for (const [chave, setores] of setoresDaPessoa) {
    for (const setor of setores) doSetor(setor).pessoas.add(chave);
    pessoasTotal.add(chave);
  }

  const faltantesTotal = new Map<string, { faltas: number; hhPerdido: number }>();
  const entra = (f: FaltaSetorRow) => {
    // Faltante que não está no quadro (cadastro sem departamento, por exemplo)
    // só aparece em "Todos": sem linha, não pertence a galpão nenhum.
    if (setoresDaPessoa.has(f.chave)) return true;
    return todos;
  };
  for (const f of dados.faltas) {
    if (!entra(f)) continue;
    const a = doSetor(f.setor);
    a.pessoas.add(f.chave);
    pessoasTotal.add(f.chave);
    a.faltantes.set(f.chave, { codfunc: f.codfunc, nome: f.nome, faltas: f.faltas, hhPerdido: f.hhPerdido });
    const t = faltantesTotal.get(f.chave) ?? { faltas: 0, hhPerdido: 0 };
    faltantesTotal.set(f.chave, { faltas: t.faltas + f.faltas, hhPerdido: t.hhPerdido + f.hhPerdido });
  }

  const setores: SetorAbsenteismo[] = [...porSetor.entries()]
    .map(([codigo, a]) => {
      const pessoas = a.pessoas.size;
      const faltantes = a.faltantes.size;
      const lista = [...a.faltantes.values()].sort((x, y) => y.faltas - x.faltas || y.hhPerdido - x.hhPerdido);
      return {
        codigo,
        label: SETOR_LABEL[codigo] ?? codigo,
        pessoas,
        presentes: pessoas - faltantes,
        faltantes,
        disponivelPct: pctDisp(pessoas - faltantes, pessoas),
        faltas: lista.reduce((s, p) => s + p.faltas, 0),
        hhPerdido: lista.reduce((s, p) => s + p.hhPerdido, 0),
        pessoasFaltantes: lista,
      };
    })
    .sort((a, b) => {
      const rank = (c: string) => (c === SEM_SETOR ? ORDEM_SETOR.length + 1 : ORDEM_SETOR.indexOf(c) === -1 ? ORDEM_SETOR.length : ORDEM_SETOR.indexOf(c));
      return rank(a.codigo) - rank(b.codigo) || a.label.localeCompare(b.label, "pt-BR");
    });

  const pessoas = pessoasTotal.size;
  const faltantes = faltantesTotal.size;
  return {
    setores,
    total: {
      pessoas,
      presentes: pessoas - faltantes,
      faltantes,
      disponivelPct: pctDisp(pessoas - faltantes, pessoas),
      faltas: [...faltantesTotal.values()].reduce((s, p) => s + p.faltas, 0),
      hhPerdido: [...faltantesTotal.values()].reduce((s, p) => s + p.hhPerdido, 0),
    },
    foraDoGalpao,
  };
}
