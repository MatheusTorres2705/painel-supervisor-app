// src/lib/mnoCalc.ts
// Resumo de HH da Meta de Produção, compartilhado entre a MnoPage e a home.
//
// Existe para que os dois números sejam literalmente o mesmo cálculo. A home
// mostrando 12.400 h e a MnoPage 12.847 h destruiria a confiança nas duas.
//
// A MnoPage consome estas funções — não há duas contas. As diferenças de
// representação em relação ao código antigo dela são deliberadas: aqui a
// ausência de base é `null` (a página traduz para 0 + `temRitmo`), porque no
// primeiro dia do mês não existe ritmo, e um "0" seria lido como "não produziu".
import { META_HH_TOTAL, resolveSetor, type Setor } from "./mnoConfig";
import type { Feriados } from "./calendario";
import { diasUteisNoMes, diasUteisEntre, inicioDoDia, ultimoDia } from "./datetime";
import { div } from "./ritmo";
import type { RealizadoSetor, RealizadoDia } from "../services/mnoService";

/** Intervalo fechado nas duas pontas, em datas locais. */
export type PeriodoMno = { ini: Date; fim: Date };

export type ResumoMno = {
  /** Horas do mês, TODAS — inclusive de setores fora da configuração. */
  realizado: number;
  meta: number;
  /** % da meta já realizado. `null` sem meta. */
  atingimento: number | null;
  /** Média por dia útil decorrido. `null` no primeiro dia, sem base. */
  ritmo: number | null;
  /** Fechamento estimado pelo ritmo. `null` quando não há ritmo. */
  projecao: number | null;
  /** % da meta que a projeção alcança. */
  atingProjetado: number | null;
  diasTotal: number;
  diasDecorridos: number;
  /** Horas até ontem por setor mapeado — base do ritmo por setor. */
  porSetor: Map<Setor, number>;
  /**
   * Horas até ontem em setores que a configuração não conhece.
   *
   * Não são descartadas: `SETOR_ALIASES` está vazio, então qualquer nome fora
   * do literal cai aqui. Somem da quebra por setor, mas continuam no total —
   * um total que não fecha precisa poder se explicar.
   */
  naoMapeados: Map<string, number>;
};

/**
 * @param mesRows   realizado por setor no mês (`getRealizadoSetorMes`)
 * @param diaRows   realizado por dia (`getRealizadoDiaSetor`) — base do ritmo
 *
 * DUAS CONVENÇÕES QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. O REALIZADO soma tudo, sem passar por `resolveSetor`. A quebra por setor
 *    descarta o que não casa com a configuração, mas o TOTAL não pode — senão
 *    não bate com o TLC, e o número da fábrica fica menor do que é.
 *
 * 2. O RITMO exclui o dia corrente (`diasUteisDecorridos` vai até ontem).
 *    Um dia pela metade puxaria a média para baixo e a projeção pioraria toda
 *    manhã, melhorando à tarde — oscilação que não é desempenho. A Análise de
 *    Indiretos usa a convenção oposta, e por um motivo bom: lá o custo só
 *    existe por mês, então não há como excluir o dia de hoje do numerador.
 */
export function resumoMno(
  mesRows: RealizadoSetor[],
  diaRows: RealizadoDia[],
  ano: number,
  mes: number,
  feriados: Feriados,
  hoje = new Date(),
): ResumoMno {
  return resumoMnoPeriodo(
    mesRows.filter(r => r.ano === ano && r.mes === mes),
    diaRows,
    { ini: new Date(ano, mes - 1, 1), fim: new Date(ano, mes - 1, ultimoDia(mes, ano)) },
    META_HH_TOTAL,
    feriados,
    hoje,
  );
}

/**
 * A mesma conta acima, para um intervalo qualquer de datas.
 *
 * `resumoMno` é o caso particular "o mês inteiro, meta da fábrica inteira" —
 * e está escrito como uma chamada a esta função, e não como uma segunda
 * implementação, para que os números da MnoPage (que filtra por galpão e por
 * intervalo livre) e os da Visão Geral continuem sendo a MESMA aritmética.
 *
 * @param periodoRows realizado por setor JÁ limitado ao período pela consulta —
 *   diferente do caso mensal, aqui não há como filtrar depois: as linhas só
 *   trazem ANO/MES, então um recorte de dias dentro do mês não seria separável.
 * @param meta meta de HH do escopo (fábrica ou galpão) JÁ rateada para o período
 *   — ver `fatorRateioPeriodo`.
 */
export function resumoMnoPeriodo(
  periodoRows: RealizadoSetor[],
  diaRows: RealizadoDia[],
  periodo: PeriodoMno,
  meta: number,
  feriados: Feriados,
  hoje = new Date(),
): ResumoMno {
  const ini = inicioDoDia(periodo.ini);
  const fim = inicioDoDia(periodo.fim);
  const realizado = periodoRows.reduce((s, r) => s + r.horas, 0);

  const diasTotal = diasUteisEntre(ini, fim, feriados);
  const hojeRef = inicioDoDia(hoje);
  /* O dia corrente é parcial e fica de fora: um dia pela metade puxaria a média
     para baixo e a projeção pioraria toda manhã, melhorando à tarde. */
  const ontem = new Date(hojeRef); ontem.setDate(ontem.getDate() - 1);
  const diasDecorridos = ini > ontem ? 0 : diasUteisEntre(ini, fim < ontem ? fim : ontem, feriados);

  /* Uma passada só: total até ontem, por setor mapeado, e o que ficou de fora. */
  let realAteOntem = 0;
  const porSetor = new Map<Setor, number>();
  const naoMapeados = new Map<string, number>();
  for (const r of diaRows) {
    const d = new Date(r.ano, r.mes - 1, r.dia);
    if (d < ini || d > fim) continue;   // fora do recorte
    if (d >= hojeRef) continue;         // só até ontem
    realAteOntem += r.horas;
    const setor = resolveSetor(r.setor);
    if (setor) porSetor.set(setor, (porSetor.get(setor) ?? 0) + r.horas);
    else naoMapeados.set(r.setor, (naoMapeados.get(r.setor) ?? 0) + r.horas);
  }

  const ritmo = div(realAteOntem, diasDecorridos);
  const projecao = ritmo == null ? null : ritmo * diasTotal;
  const atingimento = div(realizado, meta);
  const atingProjetado = projecao == null ? null : div(projecao, meta);

  return {
    realizado,
    meta,
    atingimento: atingimento == null ? null : atingimento * 100,
    ritmo,
    projecao,
    atingProjetado: atingProjetado == null ? null : atingProjetado * 100,
    diasTotal,
    diasDecorridos,
    porSetor,
    naoMapeados,
  };
}

/**
 * Quanto da meta MENSAL cabe no período — a meta da planilha é por mês, o
 * filtro da tela é por intervalo de dias.
 *
 * Cada mês tocado entra na proporção dos seus dias úteis dentro do período, e
 * não em dias corridos: a meta é produção, e sábado/domingo não produzem. Mês
 * inteiro → 1; dois meses inteiros → 2; meia semana → a fração dela.
 */
export function fatorRateioPeriodo(periodo: PeriodoMno, feriados: Feriados): number {
  const ini = inicioDoDia(periodo.ini);
  const fim = inicioDoDia(periodo.fim);
  let fator = 0;
  const cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
  while (cur <= fim) {
    const ano = cur.getFullYear(), mes = cur.getMonth() + 1;
    const mesIni = new Date(ano, mes - 1, 1);
    const mesFim = new Date(ano, mes - 1, ultimoDia(mes, ano));
    const duMes = diasUteisNoMes(ano, mes, feriados);
    if (duMes > 0) {
      fator += diasUteisEntre(ini > mesIni ? ini : mesIni, fim < mesFim ? fim : mesFim, feriados) / duMes;
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return fator;
}
