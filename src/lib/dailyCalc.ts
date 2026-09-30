// src/lib/dailyCalc.ts
// Contas da daily, sem React: a semana, e o valor de cada indicador por dia e
// no acumulado do mês, a partir das linhas cruas que os serviços já devolvem.
//
// Ficam separadas do serviço porque trocar o recorte (galpão, setores) só
// reagrupa o que já veio do ERP — a consulta cobre a janela inteira.
import type { Feriados } from "@/lib/calendario";
import { isDiaUtil, isoLocal, pad2 } from "@/lib/datetime";
import { normSetor } from "@/lib/mnoConfig";
import type { DadosSetorPeriodo } from "@/services/absenteismoService";
import { codPlpEfetivo, type GalpaoOpe, type GrupoProducao, type RawAtivRow, type RawPontoRow } from "@/services/opeService";
import type { RealizadoDia } from "@/services/mnoService";

/* ── Semana e janela ─────────────────────────────────────────── */

export const diaLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const somarDias = (ymd: string, n: number) => {
  const d = diaLocal(ymd);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
/** "YYYY-MM-DD" → "DD/MM/YYYY", o formato das consultas. */
export const paraOracle = (ymd: string) => ymd.split("-").reverse().join("/");

/**
 * Segunda a sexta da semana de `ymd`. O quadro da parede tem cinco colunas e a
 * meta de HH é por dia útil; sábado trabalhado aparece no acumulado do mês,
 * não como coluna.
 */
export function semanaDe(ymd: string): string[] {
  const d = diaLocal(ymd);
  const dow = d.getDay(); // 0 = domingo
  const segunda = somarDias(ymd, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 5 }, (_, i) => somarDias(segunda, i));
}

/** Janela da carga: do 1º do mês (do fim da semana) até o fim da semana. */
export function janelaDaSemana(dias: string[]): { ini: string; fim: string; mesIni: string } {
  const fim = dias[dias.length - 1];
  const d = diaLocal(fim);
  const mesIni = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
  const ini = dias[0] < mesIni ? dias[0] : mesIni;
  return { ini, fim, mesIni };
}

/** Dias úteis do mês de `ymd` (seg–sex sem feriado), e quantos já decorreram até `ate`. */
export function diasUteisDoMes(ymd: string, ate: string, feriados: Feriados): { total: number; decorridos: number } {
  const d = diaLocal(ymd);
  const ano = d.getFullYear();
  const mes = d.getMonth();
  let total = 0;
  let decorridos = 0;
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  for (let dia = 1; dia <= ultimo; dia++) {
    const atual = new Date(ano, mes, dia);
    if (!isDiaUtil(atual, feriados)) continue;
    total++;
    if (isoLocal(atual) <= ate) decorridos++;
  }
  return { total, decorridos };
}

/** Dias úteis (seg–sex sem feriado) entre duas datas "YYYY-MM-DD", inclusive. */
export function diasUteisEntreIso(ini: string, fim: string, feriados: Feriados): string[] {
  const out: string[] = [];
  for (let d = ini; d <= fim; d = somarDias(d, 1)) if (isDiaUtil(diaLocal(d), feriados)) out.push(d);
  return out;
}

/* ── Recorte ─────────────────────────────────────────────────── */

export type Recorte = { galpao: string; setores: string[] };

/** Série de um indicador: valor por dia da semana e acumulado do mês. */
export type Serie = { porDia: Record<string, number | null>; mes: number | null };

const serieVazia = (dias: string[]): Serie => ({
  porDia: Object.fromEntries(dias.map((d) => [d, null])),
  mes: null,
});

/* ── OPE, retrabalho ─────────────────────────────────────────── */

export type TotaisDia = { ponto: number; ativ: number; retrabalho: number };

/**
 * Soma ponto, atividades e retrabalho por dia, no recorte.
 *
 * `galpao` nulo = todos os galpões (CODPLP, já realocado pela SQL); `setores`
 * vazio = todos os grupos de produção (CODGRUPO). Os setores marcados SOMAM
 * entre si — é a consolidação que a daily de Montagem + Acabamento precisa.
 */
export function totaisPorDia(
  ativos: RawAtivRow[],
  pontos: RawPontoRow[],
  galpao: string | null,
  setores: string[]
): Map<string, TotaisDia> {
  const noRecorte = (r: { codPlp: string; codGrupo: string }) =>
    (galpao == null || r.codPlp === galpao) && (setores.length === 0 || setores.includes(r.codGrupo));
  const acc = new Map<string, TotaisDia>();
  const pega = (dia: string) => {
    const t = acc.get(dia) ?? { ponto: 0, ativ: 0, retrabalho: 0 };
    acc.set(dia, t);
    return t;
  };
  for (const r of ativos) {
    if (!noRecorte(r)) continue;
    const t = pega(r.data);
    t.ativ += r.horas;
    t.retrabalho += r.horasRetrabalho;
  }
  for (const r of pontos) {
    if (!noRecorte(r)) continue;
    pega(r.data).ponto += r.horasPonto;
  }
  return acc;
}

/** As datas do OPE vêm "DD/MM/YYYY"; a daily trabalha em "YYYY-MM-DD". */
const deOracle = (br: string) => br.split("/").reverse().join("-");

export function serieOpe(totais: Map<string, TotaisDia>, dias: string[], mesIni: string, mesFim: string): { ope: Serie; retrabalho: Serie } {
  const ope = serieVazia(dias);
  const retrab = serieVazia(dias);
  let pontoMes = 0;
  let ativMes = 0;
  let retrabMes = 0;
  for (const [dataBr, t] of totais) {
    const dia = deOracle(dataBr);
    if (dia >= mesIni && dia <= mesFim) {
      pontoMes += t.ponto;
      ativMes += t.ativ;
      retrabMes += t.retrabalho;
    }
    if (dia in ope.porDia) {
      // Ausência de ponto não é zero por cento: fica vazio.
      ope.porDia[dia] = t.ponto > 0 ? (t.ativ / t.ponto) * 100 : null;
      retrab.porDia[dia] = t.retrabalho;
    }
  }
  ope.mes = pontoMes > 0 ? (ativMes / pontoMes) * 100 : null;
  retrab.mes = retrabMes;
  return { ope, retrabalho: retrab };
}

/* ── Avanço (HH) ─────────────────────────────────────────────── */

/** As listas do banco que traduzem nomes (MNO) em códigos (OPE). */
export type ListasDaily = { grupos: GrupoProducao[]; galpoes: GalpaoOpe[] };

/**
 * Avanço em HH no recorte.
 *
 * O realizado vem do MNO com o NOME do setor (TSIGRU.NOMEGRUPO) e do galpão
 * (TPRPLP.NOME) — e sem a realocação de Componentes/Pintura/Mecânica que a SQL
 * do OPE faz. Aqui cada linha vira código pelas listas do banco e passa pela
 * mesma `codPlpEfetivo`: sem isso o Galpão Componente teria as horas de
 * Componentes no OPE e zero no avanço.
 *
 * Fica fora o que o OPE também não conta: setor que não é grupo de produção e
 * barco cujo modelo não cai num galpão da lista.
 */
export function serieAvanco(
  rows: RealizadoDia[],
  recorte: Recorte,
  listas: ListasDaily,
  dias: string[],
  mesIni: string,
  mesFim: string
): Serie {
  const serie = serieVazia(dias);
  const grupoPorNome = new Map(listas.grupos.map((g) => [normSetor(g.nome), g.codGrupo]));
  const galpaoPorNome = new Map(listas.galpoes.map((g) => [normSetor(g.nome), g.codPlp]));
  let mes = 0;
  let temMes = false;
  for (const r of rows) {
    const codGrupo = grupoPorNome.get(normSetor(r.setor));
    const codPlpBruto = galpaoPorNome.get(normSetor(r.galpao));
    if (!codGrupo || !codPlpBruto) continue;
    if (recorte.setores.length && !recorte.setores.includes(codGrupo)) continue;
    if (recorte.galpao !== "todos" && codPlpEfetivo(codPlpBruto, codGrupo) !== recorte.galpao) continue;
    const dia = `${r.ano}-${pad2(r.mes)}-${pad2(r.dia)}`;
    if (dia >= mesIni && dia <= mesFim) {
      mes += r.horas;
      temMes = true;
    }
    if (dia in serie.porDia) serie.porDia[dia] = (serie.porDia[dia] ?? 0) + r.horas;
  }
  serie.mes = temMes ? mes : null;
  return serie;
}

/* ── Absenteísmo ─────────────────────────────────────────────── */

/** Ativo no dia: admitido até ele e não demitido antes dele. */
const ativoNoDia = (p: { dtadm: string; dtdem: string }, dia: string) =>
  (!p.dtadm || p.dtadm <= dia) && (!p.dtdem || p.dtdem >= dia);

/**
 * % de absenteísmo do dia = faltantes ÷ ativos, no recorte.
 *
 * Setor e galpão da pessoa vêm do departamento pelo mesmo caminho do ponto do
 * OPE (TFPDEP.AD_CODGRUPO / AD_CODPLP, com a realocação) — ver
 * `getDadosSetorPeriodo`. A aba do Absenteísmo usa outra base e não é esta conta.
 */
export function serieAbsenteismo(
  dados: DadosSetorPeriodo | null,
  recorte: Recorte,
  dias: string[],
  diasUteisMes: string[],
  ate: string
): Serie {
  const serie = serieVazia(dias);
  if (!dados) return serie;
  const todosGalpoes = recorte.galpao === "todos";
  const noRecorte = (setor: string, codPlp: string) =>
    (recorte.setores.length === 0 || recorte.setores.includes(setor)) &&
    (todosGalpoes || codPlp === recorte.galpao);

  const pessoas = dados.quadro.filter((p) => noRecorte(p.setor, p.codPlp));
  const chavesNoRecorte = new Set(pessoas.map((p) => p.chave));
  const faltas = dados.faltas.filter((f) => chavesNoRecorte.has(f.chave));

  const faltantesPorDia = new Map<string, Set<string>>();
  for (const f of faltas) {
    const s2 = faltantesPorDia.get(f.dia) ?? new Set<string>();
    s2.add(f.chave);
    faltantesPorDia.set(f.dia, s2);
  }

  const doDia = (dia: string) => {
    const ativos = pessoas.filter((p) => ativoNoDia(p, dia)).length;
    return { ativos, faltantes: faltantesPorDia.get(dia)?.size ?? 0 };
  };

  /* Dia que ainda não aconteceu fica vazio: sem falta lançada ele daria 0% —
     um verde que a daily leria como "ninguém faltou" num dia do futuro. */
  for (const dia of dias) {
    if (dia > ate) continue;
    const { ativos, faltantes } = doDia(dia);
    if (ativos === 0) continue;
    serie.porDia[dia] = (faltantes / ativos) * 100;
  }

  /* No mês, a média é ponderada sobre TODOS os dias úteis decorridos —
     faltantes-dia ÷ pessoas-dia. Contar só os dias com falta inflaria a média
     (o denominador perderia os dias sem ninguém faltando). */
  let ativosMes = 0;
  let faltantesMes = 0;
  for (const dia of diasUteisMes) {
    const { ativos, faltantes } = doDia(dia);
    ativosMes += ativos;
    faltantesMes += faltantes;
  }
  serie.mes = ativosMes > 0 ? (faltantesMes / ativosMes) * 100 : null;
  return serie;
}
