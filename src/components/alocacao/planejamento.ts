// src/components/alocacao/planejamento.ts
// Regras de planejamento da Alocação de Recursos, sem React.
//
// Carga de um colaborador num dia = três origens:
//   · tela     — alocações feitas agora e ainda não gravadas (HH ÷ nº de alocados);
//   · erp      — o que já está gravado para ESTA OP (AD_DETALCRONOGRAMAFUNC);
//   · externa  — o que está gravado para OUTRAS OPs no mesmo dia.
// Capacidade = horas configuradas para o dia da semana (padrão 8 h seg–sex).
import type { Tone } from "@/lib/tone";
import type { CargaExterna, Colab, Demanda } from "@/services/alocacaoService";

/* ── Capacidade ──────────────────────────────────────────────── */

export type CapacidadeCfg = {
  /** Horas de trabalho de segunda a sexta. */
  horasSemana: number;
  horasSabado: number;
  /** "HH:MM" */
  inicio: string;
  /** "HH:MM" */
  almocoInicio: string;
  almocoMin: number;
};

export const CAPACIDADE_PADRAO: CapacidadeCfg = {
  horasSemana: 8,
  horasSabado: 0,
  inicio: "07:00",
  almocoInicio: "12:00",
  almocoMin: 60,
};

const CHAVE_CFG = "alocacao:capacidade";

export function lerCapacidade(): CapacidadeCfg {
  try {
    const raw = localStorage.getItem(CHAVE_CFG);
    if (!raw) return CAPACIDADE_PADRAO;
    return normalizarCapacidade({ ...CAPACIDADE_PADRAO, ...JSON.parse(raw) });
  } catch {
    return CAPACIDADE_PADRAO;
  }
}

export function gravarCapacidade(cfg: CapacidadeCfg) {
  try {
    localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg));
  } catch {
    /* armazenamento bloqueado: vale só nesta sessão */
  }
}

const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/;
const limitar = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

export function normalizarCapacidade(c: CapacidadeCfg): CapacidadeCfg {
  return {
    horasSemana: limitar(c.horasSemana, 0, 16, CAPACIDADE_PADRAO.horasSemana),
    horasSabado: limitar(c.horasSabado, 0, 16, CAPACIDADE_PADRAO.horasSabado),
    inicio: hhmm.test(c.inicio) ? c.inicio : CAPACIDADE_PADRAO.inicio,
    almocoInicio: hhmm.test(c.almocoInicio) ? c.almocoInicio : CAPACIDADE_PADRAO.almocoInicio,
    almocoMin: limitar(c.almocoMin, 0, 180, CAPACIDADE_PADRAO.almocoMin),
  };
}

/** "YYYY-MM-DD" → Date local (sem o deslize de fuso do `new Date("YYYY-MM-DD")`). */
export function dataLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isoDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somarDias(ymd: string, n: number): string {
  const d = dataLocal(ymd);
  d.setDate(d.getDate() + n);
  return isoDia(d);
}

export function capacidadeDoDia(cfg: CapacidadeCfg, ymd: string): number {
  const dow = dataLocal(ymd).getDay();
  if (dow === 0) return 0;
  if (dow === 6) return cfg.horasSabado;
  return cfg.horasSemana;
}

/** Máximo de dias no quadro — acima disso a tabela deixa de ser legível e a consulta pesa. */
export const MAX_DIAS_QUADRO = 45;

/** Dias do período com capacidade > 0 (domingo e sábado sem hora ficam de fora). */
export function diasDoPeriodo(ini: string, fim: string, cfg: CapacidadeCfg): string[] {
  if (!ini || !fim || fim < ini) return [];
  const out: string[] = [];
  for (let d = ini; d <= fim && out.length < MAX_DIAS_QUADRO; d = somarDias(d, 1)) {
    if (capacidadeDoDia(cfg, d) > 0) out.push(d);
  }
  return out;
}

/* ── Índice de carga ─────────────────────────────────────────── */

export type Partes = { tela: number; erp: number; externa: number };
export type Celula = Partes & { total: number; capacidade: number; livre: number; pct: number | null; tom: Tone };

/** `codfunc` → dia → horas por origem. Montado uma vez por render. */
export type IndiceCarga = Map<number, Map<string, Partes>>;

const vazio = (): Partes => ({ tela: 0, erp: 0, externa: 0 });

function somar(ix: IndiceCarga, codfunc: number, dia: string, parte: keyof Partes, horas: number) {
  if (!dia || !horas) return;
  const dias = ix.get(codfunc) ?? new Map<string, Partes>();
  const p = dias.get(dia) ?? vazio();
  p[parte] += horas;
  dias.set(dia, p);
  ix.set(codfunc, dias);
}

/** Horas que cada alocado recebe de uma demanda (divisão igual, como a gravação). */
export const horasPorAlocado = (d: Demanda) => (d.alocados.length ? d.hhPrev / d.alocados.length : 0);

export function indexarCarga(demandas: Demanda[], colabs: Colab[], externa: CargaExterna): IndiceCarga {
  const ix: IndiceCarga = new Map();
  for (const d of demandas) {
    const h = horasPorAlocado(d);
    for (const cod of d.alocados) somar(ix, cod, d.dtPlan, "tela", h);
  }
  for (const c of colabs) {
    for (const p of c.atividadesERP) somar(ix, c.id, p.dt, "erp", p.qtd / 60);
  }
  for (const [cod, dias] of externa) {
    for (const [dia, min] of dias) somar(ix, cod, dia, "externa", min / 60);
  }
  return ix;
}

export function tomCarga(total: number, capacidade: number): Tone {
  if (total <= 0) return "neutral";
  if (capacidade <= 0) return "danger";
  const pct = (total / capacidade) * 100;
  if (pct > 100.5) return "danger";
  if (pct >= 90) return "warning";
  return "success";
}

export function celula(ix: IndiceCarga, codfunc: number, dia: string, cfg: CapacidadeCfg): Celula {
  const p = ix.get(codfunc)?.get(dia) ?? vazio();
  const total = p.tela + p.erp + p.externa;
  const capacidade = capacidadeDoDia(cfg, dia);
  return {
    ...p,
    total,
    capacidade,
    livre: capacidade - total,
    pct: capacidade > 0 ? (total / capacidade) * 100 : null,
    tom: tomCarga(total, capacidade),
  };
}

/* ── Setor por dia ───────────────────────────────────────────── */

export type CelulaSetor = { demanda: number; livre: number; pct: number | null; tom: Tone; pessoas: number };

/**
 * Cabe no setor? Demanda = HH das demandas do setor planejadas para o dia.
 * Livre = soma da capacidade dos colaboradores do setor MENOS o que já está
 * gravado (esta OP e outras) — ou seja, a folga antes das alocações da tela.
 * Colaborador com cargo em dois setores conta nos dois.
 */
export function celulaSetor(
  codusu: number,
  dia: string,
  demandas: Demanda[],
  colabs: Colab[],
  ix: IndiceCarga,
  cfg: CapacidadeCfg
): CelulaSetor {
  const demanda = demandas
    .filter((d) => d.codusu === codusu && d.dtPlan === dia)
    .reduce((s, d) => s + d.hhPrev, 0);
  const doSetor = colabs.filter((c) => c.codSetores.includes(codusu));
  const cap = capacidadeDoDia(cfg, dia);
  const livre = doSetor.reduce((s, c) => {
    const p = ix.get(c.id)?.get(dia) ?? vazio();
    return s + Math.max(0, cap - p.erp - p.externa);
  }, 0);
  return { demanda, livre, pct: livre > 0 ? (demanda / livre) * 100 : null, tom: tomCarga(demanda, livre), pessoas: doSetor.length };
}

/* ── Status da demanda ───────────────────────────────────────── */

export type StatusFiltro = "todas" | "sem" | "alocadas" | "atrasadas" | "pendentes";

export const atrasoDias = (d: Demanda, hoje: string) =>
  d.dtDemanda && d.dtDemanda < hoje
    ? Math.round((dataLocal(hoje).getTime() - dataLocal(d.dtDemanda).getTime()) / 86_400_000)
    : 0;

/** Alterada na tela e ainda não gravada: tem alocação (é o que o Salvar grava). */
export const pendente = (d: Demanda) => d.alocados.length > 0;
/** Data mudou sem alocação — não há o que gravar, mas o PCP precisa ver. */
export const soDataAlterada = (d: Demanda) => !d.alocados.length && d.dtPlan !== d.dtPlanOriginal;

export function passaStatus(d: Demanda, s: StatusFiltro, hoje: string): boolean {
  switch (s) {
    case "sem": return d.alocados.length === 0;
    case "alocadas": return d.alocados.length > 0;
    case "atrasadas": return atrasoDias(d, hoje) > 0;
    case "pendentes": return pendente(d) || soDataAlterada(d);
    default: return true;
  }
}

export type OrdemDemandas = { col: "nome" | "setor" | "hh" | "demanda" | "plan"; dir: "asc" | "desc" };

export function ordenarDemandas(rows: Demanda[], o: OrdemDemandas): Demanda[] {
  const m = o.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (o.col) {
      case "nome": return m * a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
      case "setor": return m * (a.setor.localeCompare(b.setor, "pt-BR") || a.dtDemanda.localeCompare(b.dtDemanda));
      case "hh": return m * (a.hhPrev - b.hhPrev);
      case "plan": return m * (a.dtPlan.localeCompare(b.dtPlan) || a.nome.localeCompare(b.nome));
      default: return m * (a.dtDemanda.localeCompare(b.dtDemanda) || b.hhPrev - a.hhPrev);
    }
  });
}

/* ── Distribuição automática ─────────────────────────────────── */

export type Proposta = { chave: string; nome: string; alocados: number[]; dtPlan: string; dtPlanAntes: string };
export type Sugestao = {
  propostas: Proposta[];
  movidas: number;
  semCandidato: Demanda[];
  semCapacidade: Demanda[];
};

/**
 * Sugere alocação para demandas sem dono, sem mexer no estado.
 *
 *  1. Ordem: demanda mais antiga primeiro; empate, maior HH primeiro.
 *  2. Candidatos: colaboradores cujo cargo atua no setor da demanda.
 *  3. Dia: a partir do dtPlan (ou de hoje, se o dtPlan já passou) até `fim`,
 *     só dias com capacidade.
 *  4. No dia, usa o MENOR número de pessoas que dá conta: com k pessoas cada
 *     uma recebe HH/k, então precisa haver k candidatos com folga ≥ HH/k.
 *     Uma atividade de 24 h vira 3 pessoas × 8 h em vez de ficar sem dono.
 *  5. Não coube em nenhum dia → fica em `semCapacidade`.
 * Cada proposta aceita já consome a folga, para as seguintes não contarem com ela.
 */
export function sugerirDistribuicao(
  alvo: Demanda[],
  colabs: Colab[],
  ix: IndiceCarga,
  cfg: CapacidadeCfg,
  hoje: string,
  fim: string
): Sugestao {
  // Cópia só do total por colaborador × dia, que é o que a folga precisa.
  const usado = new Map<string, number>();
  const chaveUso = (cod: number, dia: string) => `${cod}|${dia}`;
  for (const [cod, dias] of ix) {
    for (const [dia, p] of dias) usado.set(chaveUso(cod, dia), p.tela + p.erp + p.externa);
  }
  const folga = (cod: number, dia: string) => capacidadeDoDia(cfg, dia) - (usado.get(chaveUso(cod, dia)) ?? 0);

  const ordem = alvo
    .filter((d) => d.alocados.length === 0)
    .sort((a, b) => a.dtDemanda.localeCompare(b.dtDemanda) || b.hhPrev - a.hhPrev);

  const res: Sugestao = { propostas: [], movidas: 0, semCandidato: [], semCapacidade: [] };
  const limite = fim && fim >= hoje ? fim : somarDias(hoje, 30);

  for (const d of ordem) {
    const candidatos = colabs.filter((c) => c.codSetores.includes(d.codusu));
    if (!candidatos.length) {
      res.semCandidato.push(d);
      continue;
    }
    const inicio = d.dtPlan && d.dtPlan >= hoje ? d.dtPlan : hoje;
    let escolha: { dia: string; ids: number[] } | null = null;

    for (let dia = inicio; dia <= limite && !escolha; dia = somarDias(dia, 1)) {
      if (capacidadeDoDia(cfg, dia) <= 0) continue;
      const porFolga = candidatos
        .map((c) => ({ id: c.id, livre: folga(c.id, dia) }))
        .filter((x) => x.livre > 0.01)
        .sort((a, b) => b.livre - a.livre);
      for (let k = 1; k <= porFolga.length; k++) {
        if (porFolga[k - 1].livre + 1e-6 >= d.hhPrev / k) {
          escolha = { dia, ids: porFolga.slice(0, k).map((x) => x.id) };
          break;
        }
      }
    }

    if (!escolha) {
      res.semCapacidade.push(d);
      continue;
    }
    const cota = d.hhPrev / escolha.ids.length;
    for (const id of escolha.ids) {
      const k = chaveUso(id, escolha.dia);
      usado.set(k, (usado.get(k) ?? 0) + cota);
    }
    if (escolha.dia !== d.dtPlan) res.movidas++;
    res.propostas.push({ chave: d.chave, nome: d.nome, alocados: escolha.ids, dtPlan: escolha.dia, dtPlanAntes: d.dtPlan });
  }
  return res;
}

/* ── Gantt ───────────────────────────────────────────────────── */

export type Origem = "tela" | "erp" | "externa";
export type ItemGantt = { id: string; label: string; horas: number; origem: Origem; codusu?: number };
export type BlocoGantt = { id: string; label: string; origem: Origem; codusu?: number; ini: number; fim: number; excedente: boolean };
export type RegraGantt = { inicio: number; almocoIni: number; almocoFim: number; fimJornada: number; fimEscala: number };

const horasDe = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
};

/** Hora do relógio em que `trabalho` horas terminam, começando em `inicio` e pulando o almoço. */
function relogioApos(inicio: number, trabalho: number, almIni: number, almFim: number): number {
  if (inicio < almIni && inicio + trabalho > almIni) return almFim + (inicio + trabalho - almIni);
  if (inicio >= almIni && inicio < almFim) return almFim + trabalho;
  return inicio + trabalho;
}

/**
 * Posiciona os itens do dia em sequência (gravados primeiro, depois outras OPs,
 * depois a tela). Um item que atravessa o almoço é partido em dois pedaços.
 * Nada é cortado: o que passa do fim da jornada sai marcado como `excedente`.
 */
export function blocosGantt(itens: ItemGantt[], cfg: CapacidadeCfg, capacidade: number): { blocos: BlocoGantt[]; regra: RegraGantt } {
  const inicio = horasDe(cfg.inicio);
  const almocoIni = horasDe(cfg.almocoInicio);
  const almocoFim = almocoIni + cfg.almocoMin / 60;
  const fimJornada = relogioApos(inicio, capacidade, almocoIni, almocoFim);

  const ordem: Record<Origem, number> = { erp: 0, externa: 1, tela: 2 };
  const blocos: BlocoGantt[] = [];
  let cursor = inicio;

  const empurrar = (it: ItemGantt, a: number, b: number) => {
    if (b - a < 1e-6) return;
    if (a < fimJornada && b > fimJornada) {
      blocos.push({ id: it.id, label: it.label, origem: it.origem, codusu: it.codusu, ini: a, fim: fimJornada, excedente: false });
      blocos.push({ id: it.id, label: it.label, origem: it.origem, codusu: it.codusu, ini: fimJornada, fim: b, excedente: true });
    } else {
      blocos.push({ id: it.id, label: it.label, origem: it.origem, codusu: it.codusu, ini: a, fim: b, excedente: a >= fimJornada });
    }
  };

  for (const it of [...itens].sort((a, b) => ordem[a.origem] - ordem[b.origem])) {
    let restante = Math.max(0, it.horas);
    while (restante > 1e-6) {
      if (cursor >= almocoIni && cursor < almocoFim) cursor = almocoFim;
      const ateAlmoco = cursor < almocoIni ? almocoIni - cursor : Infinity;
      const pedaco = Math.min(restante, ateAlmoco);
      empurrar(it, cursor, cursor + pedaco);
      cursor += pedaco;
      restante -= pedaco;
    }
  }

  const fimEscala = Math.max(Math.ceil(fimJornada), Math.ceil(cursor));
  return { blocos, regra: { inicio, almocoIni, almocoFim, fimJornada, fimEscala: Math.max(fimEscala, Math.ceil(inicio) + 1) } };
}
