// src/lib/dailyConfig.ts
// O quadro da daily da produção: quais indicadores, com que meta, em que
// frequência — e o vocabulário de setor/galpão que o recorte usa.
//
// As metas vêm do quadro da parede e ficam versionadas aqui, como META_OPE
// (lib/opeConfig) e as metas de HH (lib/mnoConfig). Mudar uma meta é editar
// este arquivo; não há cadastro no ERP ainda.
import {
  META_HH_GALPAO_SETOR,
  META_HH_POR_SETOR,
  resolveGalpao,
  resolveSetor,
  type Setor,
} from "@/lib/mnoConfig";
import { META_OPE } from "@/lib/opeConfig";
import { num, pct } from "@/lib/formatDiretoria";
import type { Tone } from "@/lib/tone";
import { ehGalpaoDestino, gruposDoGalpao, type GalpaoOpe, type GrupoProducao } from "@/services/opeService";

/* ── Vocabulário do recorte ──────────────────────────────────── */

/*
 * O recorte usa o MESMO vocabulário do OPE: setor = grupo de produção do TSIGRU
 * (CODGRUPO) e galpão = linha de produção do TPRPLP (CODPLP), as duas listas
 * vindas do banco (opeService.getGruposProducao / getGalpoes). Não há lista fixa
 * aqui. É o mesmo TSIGRU.NOMEGRUPO de onde a Meta de Produção tira o avanço, então
 * OPE, avanço e absenteísmo filtram o mesmo universo com o mesmo chip.
 */

/**
 * Atalhos: as dailies que acontecem juntas (mesmo supervisor).
 *
 * Declarados pelos setores da Meta de Produção (MNO_SETORES) e não por CODGRUPO:
 * é assim que o painel já casa o NOMEGRUPO do banco (`resolveSetor`, que ignora
 * acento, caixa e pontuação). Um atalho cujos setores não existam no banco
 * simplesmente não aparece.
 */
export type GrupoDaily = { id: string; label: string; setoresMno: Setor[] };

export const GRUPOS_DAILY: GrupoDaily[] = [
  { id: "mont-acab", label: "Montagem + Acabamento", setoresMno: ["Montagem", "Acabamento"] },
  { id: "marc", label: "Marcenaria", setoresMno: ["Marcenaria (Pré)", "Marcenaria (Montagem)"] },
  { id: "lam-reb", label: "Laminação + Rebarba", setoresMno: ["Laminação", "Rebarba"] },
  { id: "elet", label: "Elétrica", setoresMno: ["Elétrica (Montagem)", "Elétrica (Chicotes)"] },
];

/** Um atalho já traduzido para os CODGRUPO do banco. */
export type AtalhoDaily = { id: string; label: string; setores: string[] };

export function resolverAtalhos(grupos: GrupoProducao[]): AtalhoDaily[] {
  return GRUPOS_DAILY.map((a) => ({
    id: a.id,
    label: a.label,
    setores: grupos
      .filter((g) => {
        const s = resolveSetor(g.nome);
        return s != null && a.setoresMno.includes(s);
      })
      .map((g) => g.codGrupo),
  })).filter((a) => a.setores.length > 0);
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
    ajuda: "Faltantes do dia ÷ pessoas ativas no dia (AD_VFALTA × TFPFUN), com setor e galpão pelo mesmo caminho do ponto do OPE. Não é a base da aba Por setor produtivo do Absenteísmo.",
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
export function metaDoDia(
  ind: Indicador,
  galpao: GalpaoOpe | null,
  setores: string[],
  grupos: GrupoProducao[],
  diasUteisMes: number
): number | null {
  if (ind.id !== "avanco") return ind.meta;
  if (diasUteisMes <= 0) return null;
  const codPlp = galpao?.codPlp ?? null;
  /* Só os setores que o galpão comporta — a mesma regra de `gruposDoGalpao`
     que decide o que a tela do OPE mostra. No galpão de Componentes, só
     Componentes; nos galpões de origem, os setores realocados saem. Nenhum
     setor marcado = todos os que o galpão comporta. */
  const doGalpao = gruposDoGalpao(codPlp, grupos);
  const escolhidos = setores.length ? doGalpao.filter((g) => setores.includes(g.codGrupo)) : doGalpao;
  const mno = [...new Set(escolhidos.map((g) => resolveSetor(g.nome)).filter((s): s is Setor => s != null))];
  if (mno.length === 0) return null;
  /* A meta de HH é por galpão da Meta de Produção (1/2/3). Galpão de DESTINO de
     realocação recebe o setor inteiro, então leva a meta total daquele setor;
     galpão de origem usa a sua própria coluna; o Geral, a meta total. */
  let mensal: number;
  if (codPlp == null || ehGalpaoDestino(codPlp)) {
    mensal = mno.reduce((acc, s) => acc + META_HH_POR_SETOR[s], 0);
  } else {
    const gm = resolveGalpao(galpao?.nome ?? "");
    if (!gm) return null;
    mensal = mno.reduce((acc, s) => acc + META_HH_GALPAO_SETOR[gm][s], 0);
  }
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
