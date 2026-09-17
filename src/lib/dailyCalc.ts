// src/lib/dailyCalc.ts
// Contas da daily, sem React: a semana, e o valor de cada indicador por dia e
// no acumulado do mês, a partir das linhas cruas que os serviços já devolvem.
//
// Ficam separadas do serviço porque trocar o recorte (galpão, setores) só
// reagrupa o que já veio do ERP — a consulta cobre a janela inteira.
import type { Feriados } from "@/lib/calendario";
import { isDiaUtil, isoLocal, pad2 } from "@/lib/datetime";
import { galpaoDaLinha } from "@/lib/galpoes";
import { resolveSetor, type Setor } from "@/lib/mnoConfig";
import { SETORES_DAILY, galpaoMno } from "@/lib/dailyConfig";
import type { DadosSetorPeriodo } from "@/services/absenteismoService";
import type { RawAtivRow, RawPontoRow } from "@/services/opeService";
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
 * `linhas` nulo = todos os galpões; `setores` vazio = todos os setores macro.
 * Os setores marcados SOMAM entre si — é a consolidação que a daily de
 * Montagem + Acabamento precisa.
 */
export function totaisPorDia(
  ativos: RawAtivRow[],
  pontos: RawPontoRow[],
  linhas: string[] | null,
  setores: string[]
): Map<string, TotaisDia> {
  const naLinha = (l: string) => linhas == null || linhas.includes(l);
  const noSetor = (s: string) => setores.length === 0 || setores.includes(s);
  const acc = new Map<string, TotaisDia>();
  const pega = (dia: string) => {
    const t = acc.get(dia) ?? { ponto: 0, ativ: 0, retrabalho: 0 };
    acc.set(dia, t);
    return t;
  };
  for (const r of ativos) {
    if (!naLinha(r.linha) || !noSetor(r.setorMacro)) continue;
    const t = pega(r.data);
    t.ativ += r.horas;
    t.retrabalho += r.horasRetrabalho;
  }
  for (const r of pontos) {
    if (!naLinha(r.linha) || !noSetor(r.setorMacro)) continue;
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

/** Setores da Meta de Produção correspondentes aos setores macro marcados. */
export function setoresMnoDe(setores: string[]): Setor[] {
  const alvo = setores.length ? SETORES_DAILY.filter((s) => setores.includes(s.id)) : SETORES_DAILY;
  return [...new Set(alvo.flatMap((s) => s.setoresMno))];
}

export function serieAvanco(rows: RealizadoDia[], recorte: Recorte, dias: string[], mesIni: string, mesFim: string): Serie {
  const serie = serieVazia(dias);
  const galpao = galpaoMno(recorte.galpao);
  const alvos = new Set<string>(setoresMnoDe(recorte.setores));
  let mes = 0;
  let temMes = false;
  for (const r of rows) {
    if (galpao && r.galpao !== galpao) continue;
    const setor = resolveSetor(r.setor);
    if (!setor || !alvos.has(setor)) continue;
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
 * O galpão da pessoa vem da linha do departamento (a mesma regra da aba "Por
 * setor produtivo"): quem não tem linha fica de fora quando um galpão é
 * escolhido.
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
  const noRecorte = (setor: string, linha: string | null) =>
    (recorte.setores.length === 0 || recorte.setores.includes(setor)) &&
    (todosGalpoes || galpaoDaLinha(linha)?.id === recorte.galpao);

  const pessoas = dados.quadro.filter((p) => noRecorte(p.setor, p.linha));
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
