// src/lib/dailyConfig.ts
// O quadro da daily da produção: quais indicadores, com que meta, em que
// frequência — e o vocabulário de setor/galpão que o recorte usa.
//
// As metas vêm do quadro da parede e ficam versionadas aqui, como META_OPE
// (lib/opeConfig) e as metas de HH (lib/mnoConfig). Mudar uma meta é editar
// este arquivo; não há cadastro no ERP ainda.
import { GALPOES } from "@/lib/galpoes";
import { META_HH_GALPAO_SETOR, META_HH_POR_SETOR, type Galpao, type Setor } from "@/lib/mnoConfig";
import { META_OPE } from "@/lib/opeConfig";
import { num, pct } from "@/lib/formatDiretoria";
import type { Tone } from "@/lib/tone";

/* ── Vocabulário do recorte ──────────────────────────────────── */

/**
 * O eixo do recorte é o SETOR MACRO do OPE (opeService.SETORES_SQL): é o único
 * que as consultas de OPE, de retrabalho e de absenteísmo sabem filtrar.
 *
 * `setoresMno` liga cada macro aos setores da Meta de Produção (TSIGRU.NOMEGRUPO,
 * lista MNO_SETORES), que é de onde saem as horas de avanço e a meta em HH.
 *
 * PENDENTE DE VALIDAÇÃO COM O PCP: o mapa abaixo é a leitura mais direta dos
 * nomes. "Expedição", "Capotaria" e "Mecânica" não têm setor macro no OPE e
 * hoje ficam fora do avanço da daily — o quadro da parede tem uma linha de
 * avanço para Expedição, que entra quando o mapa for confirmado.
 */
export type SetorDaily = { id: string; label: string; setoresMno: Setor[] };

export const SETORES_DAILY: SetorDaily[] = [
  { id: "MONT", label: "Montagem", setoresMno: ["Montagem"] },
  { id: "ACAB", label: "Acabamento", setoresMno: ["Acabamento", "Componentes"] },
  { id: "MARC", label: "Marcenaria", setoresMno: ["Marcenaria (Pré)", "Marcenaria (Montagem)"] },
  { id: "ELET", label: "Elétrica", setoresMno: ["Elétrica (Montagem)", "Elétrica (Chicotes)"] },
  { id: "LAM", label: "Laminação", setoresMno: ["Laminação", "Pintura"] },
  { id: "REB", label: "Rebarba", setoresMno: ["Rebarba"] },
];

export const SETORES_IDS = SETORES_DAILY.map((s) => s.id);
export const labelSetor = (id: string) => SETORES_DAILY.find((s) => s.id === id)?.label ?? id;

/** Atalhos: as dailies que acontecem juntas (mesmo supervisor). */
export type GrupoDaily = { id: string; label: string; galpao: string | "todos"; setores: string[] };

export const GRUPOS_DAILY: GrupoDaily[] = [
  { id: "mont-acab", label: "Montagem + Acabamento", galpao: "todos", setores: ["MONT", "ACAB"] },
  { id: "marc", label: "Marcenaria", galpao: "todos", setores: ["MARC"] },
  { id: "lam-reb", label: "Laminação + Rebarba", galpao: "todos", setores: ["LAM", "REB"] },
  { id: "elet", label: "Elétrica", galpao: "todos", setores: ["ELET"] },
];

/** Galpões do recorte, no vocabulário de lib/galpoes (id + linhas de produto). */
export const GALPOES_DAILY = [{ id: "todos", label: "Todos os galpões", linhas: [] as string[] }, ...GALPOES.map((g) => ({ id: g.id, label: g.label, linhas: [...g.linhas] }))];

/**
 * O rótulo do galpão na Meta de Produção vem de `TPRPLP.NOME` ("Galpão 1"),
 * enquanto o recorte usa o id de lib/galpoes ("g1"). Os dois convivem no
 * projeto; a tradução mora aqui.
 */
export function galpaoMno(id: string): Galpao | null {
  const g = GALPOES.find((x) => x.id === id);
  if (!g) return null;
  return (["Galpão 1", "Galpão 2", "Galpão 3"] as Galpao[]).find((n) => n === g.label) ?? null;
}

/* ── Indicadores ─────────────────────────────────────────────── */

export type Frequencia = "D" | "S" | "M";
export type Unidade = "%" | "h" | "un" | "dias";
/** Para onde o número deve ir: mais é melhor (OPE) ou menos é melhor (absenteísmo). */
export type Direcao = "maior" | "menor";

export type Indicador = {
  id: string;
  nome: string;
  /** Sufixo do nome quando o indicador é do recorte (ex.: "Montagem + Acabamento"). */
  frequencia: Frequencia;
  unidade: Unidade;
  melhor: Direcao;
  /** `pronta`: já sai do ERP. `sem-fonte`: o quadro mostra a meta e o selo. */
  fonte: "pronta" | "sem-fonte";
  /** Meta padrão; `metaDe` pode especializar por galpão/setor. */
  meta: number | null;
  /** Tela que detalha o número. */
  rota?: string;
  /** O que falta para ligar, quando não há fonte. */
  observacao?: string;
  /** Explica a conta na própria tela. */
  ajuda?: string;
  /** O indicador não aceita recorte por setor/galpão (ex.: hora extra). */
  semRecorte?: boolean;
  /** Só faz sentido no acumulado (não tem valor diário). */
  soAcumulado?: boolean;
};

/**
 * Ordem do quadro da parede. `meta` vem de lá; onde a meta depende do recorte,
 * `metaDe` abaixo calcula (avanço em HH usa a meta da Meta de Produção).
 */
export const INDICADORES_DAILY: Indicador[] = [
  { id: "opai", nome: "OPAI acumulado", frequencia: "S", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 50, observacao: "Sem tabela mapeada no Sankhya." },
  { id: "ips", nome: "IPS acumulado", frequencia: "M", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 50, observacao: "Sem tabela mapeada no Sankhya." },
  { id: "seguranca", nome: "Desvio de segurança", frequencia: "D", unidade: "un", melhor: "menor", fonte: "sem-fonte", meta: 0, observacao: "Sem tabela mapeada no Sankhya." },
  { id: "sac", nome: "SAC aberta", frequencia: "D", unidade: "dias", melhor: "menor", fonte: "sem-fonte", meta: 5, observacao: "Sem tabela mapeada no Sankhya." },
  {
    id: "retrabalho", nome: "Horas de retrabalho", frequencia: "D", unidade: "h", melhor: "menor", fonte: "pronta", meta: 150, rota: "/ope",
    ajuda: "Horas apontadas como retrabalho (AD_COMPONENTECRONO.RETRABALHO), no recorte escolhido — é o que o OPE chama de Perdas.",
  },
  {
    id: "avanco", nome: "Avanço (HH)", frequencia: "D", unidade: "h", melhor: "maior", fonte: "pronta", meta: null, rota: "/meta-producao",
    ajuda: "Horas apontadas de produção no dia (mesma base da Meta de Produção). A meta do dia é a meta mensal do setor dividida pelos dias úteis do mês.",
  },
  {
    id: "ope", nome: "OPE", frequencia: "D", unidade: "%", melhor: "maior", fonte: "pronta", meta: META_OPE, rota: "/ope",
    ajuda: "Horas apontadas ÷ horas de ponto, no recorte escolhido. Mesma conta da tela de OPE.",
  },
  { id: "barcos", nome: "Quantidade de barcos (acum.)", frequencia: "S", unidade: "un", melhor: "maior", fonte: "sem-fonte", meta: 14, observacao: "Falta a consulta de barcos concluídos/faturados (TPRIPROC/TGFCAB)." },
  { id: "perdas", nome: "Perdas de produção", frequencia: "D", unidade: "h", melhor: "menor", fonte: "sem-fonte", meta: 100, observacao: "Definir a origem: é diferente de horas de retrabalho." },
  {
    id: "absenteismo", nome: "Absenteísmo", frequencia: "D", unidade: "%", melhor: "menor", fonte: "pronta", meta: 3, rota: "/absenteismo",
    ajuda: "Faltantes do dia ÷ pessoas ativas no dia, no setor produtivo (AD_VFALTA × TFPFUN). Mesma base da aba Por setor produtivo.",
  },
  { id: "avaria", nome: "Avaria", frequencia: "M", unidade: "un", melhor: "menor", fonte: "sem-fonte", meta: 1000, observacao: "Sem tabela mapeada no Sankhya." },
  {
    id: "horaextra", nome: "Hora extra", frequencia: "M", unidade: "h", melhor: "menor", fonte: "pronta", meta: 2000, rota: "/hora-extra",
    semRecorte: true, soAcumulado: true,
    ajuda: "Horas aprovadas no mês (AD_BANCOHORAS). A consulta não separa por setor nem galpão: o número é do escopo do supervisor.",
  },
  { id: "otif-componentes", nome: "OTIF Componentes", frequencia: "D", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 95, observacao: "Sem fonte de OTIF; a Lista de Faltas mostra o que está em falta, não o % no prazo." },
  { id: "otif-abastecimento", nome: "OTIF Abastecimento", frequencia: "D", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 95, observacao: "Sem fonte de OTIF." },
  { id: "otif-marcenaria", nome: "OTIF Marcenaria", frequencia: "D", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 95, observacao: "Sem fonte de OTIF." },
  { id: "otif-automotivo", nome: "OTIF Automotivo", frequencia: "D", unidade: "%", melhor: "maior", fonte: "sem-fonte", meta: 95, observacao: "Sem fonte de OTIF." },
];

/**
 * Meta do indicador no recorte, por DIA.
 *
 * O avanço é o único que depende do recorte: a meta de HH é mensal por setor
 * (mnoConfig) e vira meta do dia dividida pelos dias úteis do mês. Os demais
 * têm meta fixa; a do mês é multiplicada pelos dias úteis quando faz sentido
 * somar (horas), e mantida quando é percentual.
 */
export function metaDoDia(ind: Indicador, galpao: string, setores: string[], diasUteisMes: number): number | null {
  if (ind.id !== "avanco") return ind.meta;
  const mno = galpaoMno(galpao);
  /* Nenhum setor marcado = todos, o mesmo universo que `setoresMnoDe` soma no
     realizado. Sem isto o quadro mostrava avanço sem meta ao abrir. */
  const escolhidos = setores.length ? SETORES_DAILY.filter((s) => setores.includes(s.id)) : SETORES_DAILY;
  const alvos = escolhidos.flatMap((s) => s.setoresMno);
  if (alvos.length === 0 || diasUteisMes <= 0) return null;
  const mensal = alvos.reduce((acc, s) => acc + (mno ? META_HH_GALPAO_SETOR[mno][s] : META_HH_POR_SETOR[s]), 0);
  return mensal / diasUteisMes;
}

/** Meta do acumulado do mês: horas somam ao longo dos dias úteis; percentual não. */
export function metaDoMes(ind: Indicador, metaDia: number | null, diasUteisDecorridos: number): number | null {
  if (metaDia == null) return null;
  if (ind.unidade === "%") return metaDia;
  if (ind.id === "horaextra" || ind.id === "avaria" || ind.frequencia === "M") return ind.meta;
  return metaDia * Math.max(0, diasUteisDecorridos);
}

/* ── Farol ───────────────────────────────────────────────────── */

/**
 * Tom da célula. "Maior é melhor" usa a régua de atingimento (lib/tone);
 * "menor é melhor" é o espelho: no alvo ou abaixo é bom, e o vermelho começa
 * quando passa 10% da meta.
 *
 * Meta zero (desvio de segurança) é caso à parte: qualquer número acima de
 * zero é vermelho.
 */
export function farolDaily(valor: number | null, meta: number | null, melhor: Direcao): Tone {
  if (valor == null) return "neutral";
  if (meta == null) return "neutral";
  if (melhor === "menor") {
    if (meta === 0) return valor > 0 ? "danger" : "success";
    const razao = valor / meta;
    if (razao <= 1) return "success";
    if (razao <= 1.1) return "warning";
    return "danger";
  }
  if (meta === 0) return "success";
  const pct = (valor / meta) * 100;
  if (pct >= 100) return "success";
  if (pct >= 90) return "warning";
  return "danger";
}

/** Formata pela unidade do indicador — percentual, horas, dias ou contagem. */
export function formatarValor(v: number | null, unidade: Unidade): string {
  if (v == null) return "—";
  if (unidade === "%") return pct(v, { decimals: 1 });
  if (unidade === "h") return num(v, { decimals: 1 });
  return num(v, { decimals: 0 });
}
