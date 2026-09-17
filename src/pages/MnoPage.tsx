// src/pages/MnoPage.tsx
// Meta de Produção (MNO) — cópia da rotina do painel-diretoria
// (painel-diretoria/src/pages/MnoPage.tsx).
//
// A LÓGICA é a mesma, e vive nos mesmos arquivos copiados sem alteração:
// lib/mnoConfig, lib/mnoCalc, lib/datetime, lib/ritmo e services/mnoService.
// Os números desta tela e os da diretoria saem da mesma aritmética e das
// mesmas consultas — se divergirem, é bug.
//
// A INTERFACE foi portada para o design system deste projeto: os tokens de lá
// (text-ink, bg-surface-inset, text-ok, border-line…) não existem aqui e
// renderizariam sem cor nenhuma.
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import {
  CalendarClock,
  Factory,
  Gauge,
  LineChart,
  Ship,
  Target,
  TrendingUp,
  X,
} from "lucide-react";

import {
  pad2,
  isDiaUtil,
  diasUteisNoMes,
  inicioDoDia,
  isoLocal,
  dataOracle,
  parseData,
  mesInteiro,
  rangeLabel,
  type IsoRange,
} from "@/lib/datetime";
import { num as fmtNum } from "@/lib/format";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import {
  resumoMnoPeriodo,
  fatorRateioPeriodo,
  type PeriodoMno,
} from "@/lib/mnoCalc";
import {
  getRealizadoSetorMes,
  getRealizadoDiaSetor,
  janela12Meses,
  type RealizadoSetor,
  type RealizadoDia,
} from "@/services/mnoService";
import { getQuadroSetor, type QuadroPessoa } from "@/services/quadroService";
import {
  MNO_SETORES,
  MNO_MODELOS,
  MNO_GALPOES,
  type Setor,
  type Galpao,
  resolveSetor,
  resolveGalpao,
  metaHHModeloSetor,
  META_HH_POR_SETOR,
  META_HH_GALPAO_SETOR,
  META_HH_POR_GALPAO,
  META_HH_TOTAL,
  META_QTD_TOTAL,
} from "@/lib/mnoConfig";
import {
  axisProps,
  chartSemantic,
  gridProps,
  legendProps,
  tooltipProps,
} from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { faixaDe, galpaoDaLinha } from "@/lib/galpoes";
import type { Tone } from "@/lib/tone";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { anosDoIntervalo } from "@/lib/calendario";
import { useCalendario } from "@/hooks/useCalendario";
import { PageHeader } from "@/components/patterns/PageHeader";
import { SeloCalendario } from "@/components/patterns/SeloCalendario";
import { StatCard } from "@/components/patterns/StatCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import {
  PresentationButton,
  PresentationShell,
} from "@/components/patterns/PresentationShell";

const MESES_PT = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOJE = new Date();

/**
 * Horas por pessoa por dia útil, para a capacidade. Mesma premissa do ponto no
 * OPE (`COUNT(*) * 8` em opeService): hora extra não entra.
 */
const HORAS_DIA = 8;

const nf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const nf1 = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFmt = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Mesmos limiares da diretoria: ≥95% ok, ≥80% atenção, abaixo disso crítico.
const atingTom = (pct: number): Tone => (pct >= 95 ? "success" : pct >= 80 ? "warning" : "danger");
const atingTone = (pct: number) =>
  pct >= 95 ? "text-success" : pct >= 80 ? "text-warning" : "text-destructive";
const atingBar = (pct: number) =>
  pct >= 95 ? "bg-success" : pct >= 80 ? "bg-warning" : "bg-destructive";

/** "TODOS" = a fábrica inteira; senão o escopo é um galpão só. */
type EscopoGalpao = Galpao | "TODOS";

/** Ids dos modelos de um galpão, na ordem de MNO_MODELOS. */
const modelosDoGalpao = (g: Galpao) =>
  MNO_MODELOS.filter((m) => m.galpao === g).map((m) => m.id);

/** Card de seção com título e ações — equivalente ao SectionCard de lá. */
function Secao({
  title,
  actions,
  children,
  flush,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Sem padding interno (tabelas encostadas na borda do card). */
  flush?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={flush ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  );
}

export default function MnoPage() {
  const [range, setRange] = useState<IsoRange>(() =>
    mesInteiro(HOJE.getFullYear(), HOJE.getMonth() + 1)
  );
  const [galpaoSel, setGalpaoSel] = useState<EscopoGalpao>("TODOS");
  const [metaDiaData, setMetaDiaData] = useState(""); // yyyy-mm-dd; vazio = meta cheia do mês
  const [rows, setRows] = useState<RealizadoSetor[]>([]);
  const [rowsHist, setRowsHist] = useState<RealizadoSetor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drillSetor, setDrillSetor] = useState<Setor | null>(null);
  const [dailyRows, setDailyRows] = useState<RealizadoDia[]>([]);
  const [loadingDia, setLoadingDia] = useState(true);
  const [apresentacao, setApresentacao] = useState(false);
  const [tick, setTick] = useState(0);
  const [quadro, setQuadro] = useState<QuadroPessoa[]>([]);
  const [quadroLoading, setQuadroLoading] = useState(true);
  const [quadroErro, setQuadroErro] = useState<string | null>(null);

  /* O DateRangePicker já impede o intervalo invertido; a ordenação aqui é a
     última linha de defesa para nunca consultar de-para ao contrário. */
  const periodo = useMemo<PeriodoMno>(() => {
    const a = parseData(range.ini) ?? inicioDoDia(HOJE);
    const b = parseData(range.fim) ?? a;
    return a <= b ? { ini: a, fim: b } : { ini: b, fim: a };
  }, [range]);

  const periodoLabel = rangeLabel(range);
  const escopoLabel = galpaoSel === "TODOS" ? "todos os galpões" : galpaoSel;

  // Realizado agregado do período (setor × galpão × modelo) — a SQL já recorta o intervalo.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getRealizadoSetorMes(dataOracle(periodo.ini), dataOracle(periodo.fim))
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch((e: unknown) => {
        if (alive) {
          setErr(mensagemErro(e, "Falha ao carregar realizado."));
          setRows([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [periodo, tick]);

  /* O histórico é sempre de 12 meses FECHADOS até o mês final do período —
     não acompanha o recorte de dias. */
  useEffect(() => {
    let alive = true;
    const { iniDate, fimDate } = janela12Meses(
      periodo.fim.getMonth() + 1,
      periodo.fim.getFullYear()
    );
    getRealizadoSetorMes(iniDate, fimDate)
      .then((r) => {
        if (alive) setRowsHist(r);
      })
      .catch(() => {
        if (alive) setRowsHist([]);
      });
    return () => {
      alive = false;
    };
  }, [periodo, tick]);

  /* Quadro de pessoas: ativos na data de referência = o fim do período, ou
     hoje se o período ainda não terminou (o fim de um mês em andamento está no
     futuro, e contratações futuras não existem). Carga independente do
     realizado: se falhar, só as colunas Pessoas/Capacidade ficam sem número. */
  const dataRefQuadro = useMemo(() => {
    const hoje = inicioDoDia();
    const fim = inicioDoDia(periodo.fim);
    return dataOracle(fim < hoje ? fim : hoje);
  }, [periodo]);

  useEffect(() => {
    let alive = true;
    setQuadroLoading(true);
    setQuadroErro(null);
    getQuadroSetor(dataRefQuadro)
      .then((r) => {
        if (alive) setQuadro(r);
      })
      .catch((e: unknown) => {
        if (alive) {
          setQuadro([]);
          setQuadroErro(mensagemErro(e, "Falha ao carregar o quadro de pessoas."));
        }
      })
      .finally(() => {
        if (alive) setQuadroLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataRefQuadro, tick]);

  // Realizado por dia do período (para ritmo/projeção e calendário)
  useEffect(() => {
    let alive = true;
    setLoadingDia(true);
    getRealizadoDiaSetor(dataOracle(periodo.ini), dataOracle(periodo.fim))
      .then((r) => {
        if (alive) setDailyRows(r);
      })
      .catch(() => {
        if (alive) setDailyRows([]);
      })
      .finally(() => {
        if (alive) setLoadingDia(false);
      });
    return () => {
      alive = false;
    };
  }, [periodo, tick]);

  /* Filtro de galpão: um `.filter()` sobre as linhas, antes de qualquer conta.
     O cálculo de `lib/mnoCalc` continua puro e sem saber que galpão existe. */
  const noGalpao = useMemo(
    () => (g: string) => galpaoSel === "TODOS" || resolveGalpao(g) === galpaoSel,
    [galpaoSel]
  );
  const galpoesVis = useMemo<Galpao[]>(
    () => (galpaoSel === "TODOS" ? MNO_GALPOES : [galpaoSel]),
    [galpaoSel]
  );

  const realPeriodo = useMemo(() => rows.filter((r) => noGalpao(r.galpao)), [rows, noGalpao]);
  const dailyPeriodo = useMemo(
    () => dailyRows.filter((r) => noGalpao(r.galpao)),
    [dailyRows, noGalpao]
  );

  /* Anos que o calendário precisa cobrir: o filtro de período é livre, e a
     matriz de meta pode apontar uma data avulsa fora dele. */
  const anosCal = useMemo(() => {
    const extra = metaDiaData ? parseData(metaDiaData)?.getFullYear() : undefined;
    return [...new Set([...anosDoIntervalo(periodo.ini, periodo.fim), ...(extra ? [extra] : [])])];
  }, [periodo, metaDiaData]);
  const cal = useCalendario(anosCal);

  // ── Meta do escopo (fábrica ou galpão), rateada para o período ───────────────
  const fator = useMemo(() => fatorRateioPeriodo(periodo, cal.feriados), [periodo, cal.feriados]);
  const rateado = Math.abs(fator - 1) > 0.0001; // período ≠ um mês cheio

  const metaSetorMensal =
    galpaoSel === "TODOS" ? META_HH_POR_SETOR : META_HH_GALPAO_SETOR[galpaoSel];
  const metaHHMensal = galpaoSel === "TODOS" ? META_HH_TOTAL : META_HH_POR_GALPAO[galpaoSel];
  const metaQtdMensal = useMemo(
    () =>
      galpaoSel === "TODOS"
        ? META_QTD_TOTAL
        : MNO_MODELOS.filter((m) => m.galpao === galpaoSel).reduce(
            (acc, m) => acc + m.metaQtd,
            0
          ),
    [galpaoSel]
  );

  const metaHHSetor = useMemo(
    () =>
      Object.fromEntries(MNO_SETORES.map((s) => [s, metaSetorMensal[s] * fator])) as Record<
        Setor,
        number
      >,
    [metaSetorMensal, fator]
  );
  const metaHHTotal = metaHHMensal * fator;
  const metaQtdTotal = metaQtdMensal * fator;

  const realSetor = useMemo(() => {
    const m = new Map<Setor, number>();
    for (const r of realPeriodo) {
      const s = resolveSetor(r.setor);
      if (s) m.set(s, (m.get(s) ?? 0) + r.horas);
    }
    return m;
  }, [realPeriodo]);

  // Setores do banco (NOMEGRUPO) que NÃO casaram com a config — nada é descartado.
  const naoMapeados = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of realPeriodo) {
      if (!resolveSetor(r.setor))
        m.set(r.setor || "(sem setor)", (m.get(r.setor || "(sem setor)") ?? 0) + r.horas);
    }
    return Array.from(m.entries())
      .map(([nome, horas]) => ({ nome, horas }))
      .sort((a, b) => b.horas - a.horas);
  }, [realPeriodo]);

  const realGalpaoSetor = useMemo(() => {
    const m = new Map<string, number>(); // `${galpao}|${setor}`
    for (const r of realPeriodo) {
      const s = resolveSetor(r.setor),
        g = resolveGalpao(r.galpao);
      if (s && g) m.set(`${g}|${s}`, (m.get(`${g}|${s}`) ?? 0) + r.horas);
    }
    return m;
  }, [realPeriodo]);

  /**
   * Pessoas distintas por setor, no escopo do galpão.
   *
   * Chave do setor: o rótulo da meta quando `resolveSetor` casa, senão o nome
   * cru — o mesmo que as linhas "(não mapeado)" usam. Com galpão selecionado, a
   * pessoa entra se alguma linha do departamento dela é daquele galpão; o Set
   * garante que quem tem várias linhas conte uma vez.
   */
  const pessoasPorSetor = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of quadro) {
      if (galpaoSel !== "TODOS" && galpaoDaLinha(p.linha)?.label !== galpaoSel) continue;
      const setor = resolveSetor(p.setor) ?? (p.setor || "(sem setor)");
      let pessoas = m.get(setor);
      if (!pessoas) m.set(setor, (pessoas = new Set()));
      pessoas.add(p.chave);
    }
    return m;
  }, [quadro, galpaoSel]);

  const realGalpao = useMemo(() => {
    const m = new Map<Galpao, number>();
    for (const r of realPeriodo) {
      const g = resolveGalpao(r.galpao);
      if (g) m.set(g, (m.get(g) ?? 0) + r.horas);
    }
    return m;
  }, [realPeriodo]);

  /**
   * Um cálculo só, compartilhado com a diretoria (`lib/mnoCalc`).
   * O realizado total soma TUDO, sem passar por `resolveSetor`: a quebra por
   * setor descarta o não mapeado, mas o total não pode, senão não bate com o TLC.
   */
  const resumo = useMemo(
    () => resumoMnoPeriodo(realPeriodo, dailyPeriodo, periodo, metaHHTotal, cal.feriados),
    [realPeriodo, dailyPeriodo, periodo, metaHHTotal, cal.feriados]
  );

  const realizadoTotal = resumo.realizado;
  const atingTotal = resumo.atingimento ?? 0;
  const diasTotal = resumo.diasTotal;
  const diasDecorridos = resumo.diasDecorridos;

  const metaDiaTotal = diasTotal > 0 ? metaHHTotal / diasTotal : 0;
  /* `temRitmo` decide se a tela exibe o número ou um travessão. No dia 1 não
     há ritmo, e "0" seria lido como "não produziu". */
  const ritmoTotal = resumo.ritmo ?? 0;
  const projecaoTotal = resumo.projecao ?? 0;
  const atingProjetado = resumo.atingProjetado ?? 0;
  const temRitmo = resumo.ritmo != null;

  // Linhas por setor do acompanhamento diário
  const diarioSetores = useMemo(
    () =>
      MNO_SETORES.map((s) => {
        const metaMes = metaHHSetor[s];
        const metaDia = diasTotal > 0 ? metaMes / diasTotal : 0;
        const ritmo = diasDecorridos > 0 ? (resumo.porSetor.get(s) ?? 0) / diasDecorridos : 0;
        const projecao = ritmo * diasTotal;
        const pctProj = metaMes > 0 ? (projecao / metaMes) * 100 : 0;
        return { setor: s, metaDia, ritmo, projecao, metaMes, pctProj };
      }),
    [resumo, diasTotal, diasDecorridos, metaHHSetor]
  );

  // Calendário do período: meta/dia e realizado/dia, com acumulados. Marca o dia atual.
  const calendario = useMemo(() => {
    const hoje = inicioDoDia();
    const totalPorDia = new Map<string, number>();
    for (const r of dailyPeriodo) {
      const k = `${r.ano}-${pad2(r.mes)}-${pad2(r.dia)}`;
      totalPorDia.set(k, (totalPorDia.get(k) ?? 0) + r.horas);
    }
    const out: {
      iso: string;
      label: string;
      dow: number;
      util: boolean;
      feriado: boolean;
      futuro: boolean;
      hoje: boolean;
      metaDia: number;
      realDia: number | null;
      metaAcum: number;
      realAcum: number | null;
      desvio: number | null;
    }[] = [];
    let metaAcum = 0,
      realAcum = 0;
    const cur = inicioDoDia(periodo.ini);
    while (cur <= periodo.fim) {
      const iso = isoLocal(cur);
      const util = isDiaUtil(cur, cal.feriados);
      const feriado = cal.feriados.has(iso);
      const futuro = cur > hoje;
      const metaDia = util ? metaDiaTotal : 0;
      metaAcum += metaDia;
      const realDia = futuro ? null : (totalPorDia.get(iso) ?? 0);
      if (!futuro) realAcum += realDia ?? 0;
      out.push({
        iso,
        label: `${pad2(cur.getDate())}/${pad2(cur.getMonth() + 1)}`,
        dow: cur.getDay(),
        feriado,
        util,
        futuro,
        hoje: cur.getTime() === hoje.getTime(),
        metaDia,
        realDia,
        metaAcum,
        realAcum: futuro ? null : realAcum,
        desvio: futuro ? null : realAcum - metaAcum,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [dailyPeriodo, periodo, metaDiaTotal, cal.feriados]);

  // Totais do rodapé da grade por setor
  const diarioTot = useMemo(() => {
    const metaDia = diarioSetores.reduce((s, d) => s + d.metaDia, 0);
    const ritmo = diarioSetores.reduce((s, d) => s + d.ritmo, 0);
    const projecao = diarioSetores.reduce((s, d) => s + d.projecao, 0);
    const metaMes = diarioSetores.reduce((s, d) => s + d.metaMes, 0);
    return {
      metaDia,
      ritmo,
      projecao,
      metaMes,
      pctProj: metaMes > 0 ? (projecao / metaMes) * 100 : 0,
    };
  }, [diarioSetores]);

  // Histórico 12 meses (meta MENSAL cheia do escopo — o rateio é do período, não daqui)
  const serie = useMemo(() => {
    const aFim = periodo.fim.getFullYear(),
      mFim = periodo.fim.getMonth() + 1;
    const out: { label: string; realizado: number; meta: number; parcial: boolean }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(aFim, mFim - 1 - i, 1);
      const a = d.getFullYear(),
        m = d.getMonth() + 1;
      const realizado = rowsHist
        .filter((r) => r.ano === a && r.mes === m && noGalpao(r.galpao))
        .reduce((s, r) => s + r.horas, 0);
      // o mês corrente ainda está aberto — a barra sai esmaecida
      out.push({
        label: `${MESES_PT[m]}/${String(a).slice(2)}`,
        realizado,
        meta: metaHHMensal,
        parcial: a === HOJE.getFullYear() && m === HOJE.getMonth() + 1,
      });
    }
    return out;
  }, [rowsHist, periodo, noGalpao, metaHHMensal]);

  /* Escala da matriz de meta: sem data = meta cheia do mês; com data = a meta
     daquele dia (meta mensal ÷ dias úteis do mês dele). Sábado e domingo não
     recebem rateio. */
  const metaEscala = useMemo(() => {
    const data = metaDiaData ? parseData(metaDiaData) : null;
    if (!data) return { fator: 1, porDia: false, util: true, dias: 0, label: "" };
    const util = isDiaUtil(data, cal.feriados);
    const dias = diasUteisNoMes(data.getFullYear(), data.getMonth() + 1, cal.feriados);
    return {
      fator: util && dias > 0 ? 1 / dias : 0,
      porDia: true,
      util,
      dias,
      label: `${dataOracle(data)} (${DOW_PT[data.getDay()]})`,
    };
  }, [metaDiaData, cal.feriados]);

  /* Na apresentação a fonte da raiz é escalada, mas os breakpoints do Tailwind
     são em px e não acompanham: em 1600px com escala 1,3 o layout lado a lado
     entraria com tudo 30% maior e as tabelas cortariam colunas. Por isso, na
     TV, as seções empilham e os KPIs param em 3 colunas. */
  const gradeKpi = apresentacao
    ? "grid grid-cols-2 gap-4 md:grid-cols-3"
    : "grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5";
  const gradeLado = apresentacao
    ? "grid grid-cols-1 gap-4"
    : "grid grid-cols-1 gap-4 2xl:grid-cols-[3fr_2fr]";

  /* Os filtros aparecem no cabeçalho E na apresentação: sem isso, rever outro
     período ou outro galpão numa reunião exigiria sair da apresentação.

     Galpão em chips, e não num <select>: o seletor passava despercebido entre
     o período e o botão de apresentação. Mesmo padrão da tela OPE. A faixa de
     modelos vai no chip só fora da TV — com a fonte escalada ela estouraria o
     cabeçalho, e o título da apresentação já diz o galpão escolhido. */
  const chipsGalpao = (comFaixa: boolean) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Galpão">
      <Chip ativo={galpaoSel === "TODOS"} onClick={() => setGalpaoSel("TODOS")}>
        Todos
      </Chip>
      {MNO_GALPOES.map((g) => (
        <Chip key={g} ativo={galpaoSel === g} onClick={() => setGalpaoSel(g)}>
          {g}
          {comFaixa && (
            // Sem `tabular`: os ids têm hífen ("26-27") e os dígitos monoespaçados
            // abriam espaço em volta dele, confundindo-o com o traço da faixa.
            <span className="font-normal opacity-70">{faixaDe(modelosDoGalpao(g))}</span>
          )}
        </Chip>
      ))}
    </div>
  );

  const periodoPicker = (
    <DateRangePicker value={range} onChange={setRange} title="Período do acompanhamento" />
  );

  return (
    <PresentationShell
      active={apresentacao}
      onExit={() => setApresentacao(false)}
      title={`Meta de Produção — ${periodoLabel}${galpaoSel !== "TODOS" ? ` · ${galpaoSel}` : ""}`}
      subtitle="PCP · Acompanhamento diário"
      icon={<Target className="h-5 w-5" />}
      onRefresh={() => setTick((t) => t + 1)}
      status={loading || loadingDia ? "atualizando…" : undefined}
      actions={
        <>
          {periodoPicker}
          {chipsGalpao(false)}
        </>
      }
    >
      <div className="space-y-6">
        {!apresentacao && (
          <PageHeader
            title="Meta de Produção"
            description={`HH que a produção precisa entregar · ${periodoLabel} · ${escopoLabel}`}
            actions={
              <>
                <SeloCalendario cal={cal} carregando={cal.carregando} />
                <PresentationButton onClick={() => setApresentacao(true)} />
              </>
            }
          >
            <div className="w-full space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {periodoPicker}
                <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                {chipsGalpao(true)}
              </div>
              {/* Lotação derivada de MNO_MODELOS: quem escolhe o galpão vê quais
                  modelos entram, sem precisar decorar. */}
              <p className="text-2xs text-muted-foreground">
                {MNO_GALPOES.map((g) => `${g}: ${modelosDoGalpao(g).join(", ")}`).join("  ·  ")}
              </p>
            </div>
          </PageHeader>
        )}

        {err ? <Alert variant="destructive" title="Não foi possível carregar o realizado">{err}</Alert> : null}

        {/* KPIs */}
        <div className={gradeKpi}>
          <StatCard
            label="Meta HH (período)"
            value={`${nf(metaHHTotal)} h`}
            detail={rateado ? "meta mensal rateada por dias úteis" : undefined}
            icon={Target}
          />
          <StatCard
            label="Realizado HH"
            value={`${nf(realizadoTotal)} h`}
            loading={loading}
            icon={TrendingUp}
          />
          <StatCard
            label="Atingimento"
            value={pctFmt(atingTotal)}
            loading={loading}
            tone={atingTom(atingTotal)}
            icon={Gauge}
          />
          <StatCard
            label="Meta qtd barcos"
            value={nf1(metaQtdTotal)}
            detail={rateado ? "proporcional ao período" : undefined}
            icon={Ship}
          />
          <StatCard
            label={galpaoSel === "TODOS" ? "Galpões" : "Galpão"}
            value={galpaoSel === "TODOS" ? String(MNO_GALPOES.length) : galpaoSel}
            icon={Factory}
          />
        </div>

        {/* Confronto por setor + galpão */}
        <div className={gradeLado}>
          <Secao title="Confronto por setor — Meta × Realizado" flush>
            {loading ? (
              <div className="p-4">
                <Skeleton className="h-64" />
              </div>
            ) : (
              <>
                <ConfrontoTable
                  quadro={{ loading: quadroLoading, erro: quadroErro }}
                  linhas={[
                    ...MNO_SETORES.map((s) => ({
                      label: s,
                      meta: metaHHSetor[s],
                      real: realSetor.get(s) ?? 0,
                      ...quadroDaLinha(pessoasPorSetor.get(s)?.size ?? 0, diasTotal),
                      onClick: () => setDrillSetor(s),
                    })),
                    ...naoMapeados.map((n) => ({
                      label: `${n.nome} (não mapeado)`,
                      meta: 0,
                      real: n.horas,
                      ...quadroDaLinha(pessoasPorSetor.get(n.nome)?.size ?? 0, diasTotal),
                    })),
                  ]}
                  primeiraCol="Setor"
                />
                <p className="border-t border-border px-4 py-2 text-2xs text-muted-foreground">
                  Pessoas: quadro ativo em {dataRefQuadro}
                  {galpaoSel !== "TODOS" ? ` · departamentos que atendem o ${galpaoSel}` : ""}.
                  Capacidade: pessoas × {diasTotal} dias úteis × {HORAS_DIA} h, sem hora extra.
                </p>
              </>
            )}
          </Secao>
          <Secao title="Confronto por galpão" flush>
            {loading ? (
              <div className="p-4">
                <Skeleton className="h-64" />
              </div>
            ) : (
              <ConfrontoTable
                // Rateada como a de setor: lado a lado, uma comparando com o mês
                // cheio e a outra com o período diria duas coisas diferentes.
                linhas={galpoesVis.map((g) => ({
                  label: g,
                  meta: META_HH_POR_GALPAO[g] * fator,
                  real: realGalpao.get(g) ?? 0,
                }))}
                primeiraCol="Galpão"
              />
            )}
          </Secao>
        </div>

        {/* Acompanhamento diário */}
        <Secao
          title={
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Acompanhamento diário — ritmo e projeção
            </span>
          }
        >
          <div className={cn("mb-4", gradeKpi)}>
            <StatCard
              label="Dias úteis"
              value={`${diasDecorridos}/${diasTotal}`}
              detail={cal.completo ? "decorridos / total (seg–sex, sem feriados)" : "decorridos / total (seg–sex; feriados não descontados)"}
              icon={CalendarClock}
            />
            <StatCard label="Meta HH/dia" value={`${nf(metaDiaTotal)} h`} icon={Target} />
            <StatCard
              label="Ritmo atual HH/dia"
              value={!temRitmo ? "—" : `${nf(ritmoTotal)} h`}
              loading={loadingDia}
              tone={temRitmo ? (ritmoTotal >= metaDiaTotal ? "success" : "danger") : undefined}
              detail="realizado ÷ dias úteis (até ontem)"
              icon={TrendingUp}
            />
            <StatCard
              label="Projeção fim do período"
              value={!temRitmo ? "—" : `${nf(projecaoTotal)} h`}
              loading={loadingDia}
              icon={LineChart}
            />
            <StatCard
              label="Atingimento projetado"
              value={!temRitmo ? "—" : pctFmt(atingProjetado)}
              loading={loadingDia}
              tone={temRitmo ? atingTom(atingProjetado) : undefined}
              icon={Gauge}
            />
          </div>

          <div className={gradeLado}>
            {/* Tabela por setor: meta/dia × ritmo × projeção */}
            <div className="overflow-x-auto rounded-lg border border-border scrollbar-slim">
              <table className="w-full min-w-[35rem] text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pl-4 pr-3 font-medium">Setor</th>
                    <th className="px-3 py-2.5 text-right font-medium">Meta/dia</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ritmo/dia</th>
                    <th className="px-3 py-2.5 text-right font-medium">Projeção período</th>
                    <th className="px-3 py-2.5 text-right font-medium">Meta período</th>
                    <th className="px-3 py-2.5 text-right font-medium">% projetado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {diarioSetores.map((d) => (
                    <tr key={d.setor} className="hover:bg-muted/40">
                      <td className="py-2 pl-4 pr-3 text-foreground">{d.setor}</td>
                      <td className="tabular px-3 py-2 text-right text-foreground">{nf(d.metaDia)}</td>
                      <td
                        className={cn(
                          "tabular px-3 py-2 text-right font-medium",
                          temRitmo
                            ? d.ritmo >= d.metaDia
                              ? "text-success"
                              : "text-destructive"
                            : "text-muted-foreground/70"
                        )}
                      >
                        {temRitmo ? nf(d.ritmo) : "—"}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-foreground">
                        {temRitmo ? nf(d.projecao) : "—"}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">
                        {nf(d.metaMes)}
                      </td>
                      <td
                        className={cn(
                          "tabular px-3 py-2 text-right font-medium",
                          temRitmo ? atingTone(d.pctProj) : "text-muted-foreground/70"
                        )}
                      >
                        {temRitmo ? pctFmt(d.pctProj) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                  <tr>
                    <td className="py-2.5 pl-4 pr-3 text-foreground">Total</td>
                    <td className="tabular px-3 py-2.5 text-right text-foreground">
                      {nf(diarioTot.metaDia)}
                    </td>
                    <td
                      className={cn(
                        "tabular px-3 py-2.5 text-right",
                        temRitmo
                          ? diarioTot.ritmo >= diarioTot.metaDia
                            ? "text-success"
                            : "text-destructive"
                          : "text-muted-foreground/70"
                      )}
                    >
                      {temRitmo ? nf(diarioTot.ritmo) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-foreground">
                      {temRitmo ? nf(diarioTot.projecao) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-foreground">
                      {nf(diarioTot.metaMes)}
                    </td>
                    <td
                      className={cn(
                        "tabular px-3 py-2.5 text-right",
                        temRitmo ? atingTone(diarioTot.pctProj) : "text-muted-foreground/70"
                      )}
                    >
                      {temRitmo ? pctFmt(diarioTot.pctProj) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/*
              Calendário do período — meta × realizado dia a dia.
              A altura acompanha a tabela de setores ao lado: o wrapper estica
              com a linha do grid e o conteúdo vai em `absolute`, para os dias
              rolarem dentro. No celular (uma coluna) o truque é desligado.
            */}
            <div className={cn("min-h-[20rem]", !apresentacao && "2xl:relative 2xl:min-h-0")}>
              <div className={cn("h-full max-h-[28rem] overflow-auto rounded-lg border border-border scrollbar-slim", !apresentacao && "2xl:absolute 2xl:inset-0 2xl:max-h-none")}>
                <table className="w-full min-w-[26.25rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pl-4 pr-3 font-medium">Dia</th>
                      <th className="px-3 py-2 text-right font-medium">Meta/dia</th>
                      <th className="px-3 py-2 text-right font-medium">Realizado</th>
                      <th className="px-3 py-2 text-right font-medium">Meta acum.</th>
                      <th className="px-3 py-2 text-right font-medium">Real. acum.</th>
                      <th className="px-3 py-2 text-right font-medium">Desvio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingDia
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={6} className="px-3 py-2">
                              <Skeleton className="h-5" />
                            </td>
                          </tr>
                        ))
                      : calendario.map((c) => (
                          <tr
                            key={c.iso}
                            className={
                              c.hoje
                                ? "bg-accent-subtle font-medium"
                                : !c.util
                                  ? "bg-muted/40 text-muted-foreground/70"
                                  : "hover:bg-muted/40"
                            }
                          >
                            <td className="whitespace-nowrap py-1.5 pl-4 pr-3">
                              <span
                                className={
                                  c.hoje
                                    ? "font-semibold text-foreground"
                                    : c.util
                                      ? "text-foreground"
                                      : "text-muted-foreground/70"
                                }
                              >
                                {c.label} {DOW_PT[c.dow]}
                              </span>
                              {c.hoje && (
                                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-2xs text-primary-foreground">
                                  hoje
                                </span>
                              )}
                              {c.feriado && (
                                <span
                                  className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-2xs text-muted-foreground"
                                  title="Feriado no calendário do Sankhya — não recebe meta"
                                >
                                  feriado
                                </span>
                              )}
                            </td>
                            <td className="tabular px-3 py-1.5 text-right">
                              {c.util ? nf(c.metaDia) : "—"}
                            </td>
                            <td className="tabular px-3 py-1.5 text-right">
                              {c.realDia == null ? "" : c.realDia > 0 ? nf(c.realDia) : "—"}
                            </td>
                            <td className="tabular px-3 py-1.5 text-right text-muted-foreground">
                              {nf(c.metaAcum)}
                            </td>
                            <td className="tabular px-3 py-1.5 text-right text-foreground">
                              {c.realAcum == null ? "" : nf(c.realAcum)}
                            </td>
                            <td
                              className={cn(
                                "tabular px-3 py-1.5 text-right",
                                c.desvio == null
                                  ? ""
                                  : c.desvio >= 0
                                    ? "text-success"
                                    : "text-destructive"
                              )}
                            >
                              {c.desvio == null ? "" : nf(c.desvio)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Secao>

        {!apresentacao && (
          <>
            {/* Histórico 12 meses */}
            <Secao title={`Histórico — Meta × Realizado (HH, 12 meses · ${escopoLabel})`}>
              <div className="h-56 md:h-72 2xl:h-80">
                {loading ? (
                  <Skeleton className="h-full" />
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    key={`hist-${range.ini}-${range.fim}-${galpaoSel}`}
                  >
                    <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis {...axisProps} dataKey="label" />
                      <YAxis {...axisProps} tickFormatter={(v: number) => nf(v)} width={56} />
                      <Tooltip
                        {...tooltipProps}
                        formatter={(v, n) => [`${nf(Number(v))} h`, String(n)]}
                      />
                      <Legend {...legendProps} />
                      <Bar
                        dataKey="realizado"
                        name="Realizado"
                        fill={chartSemantic.primary}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                        isAnimationActive={false}
                      >
                        {serie.map((d, i) => (
                          <Cell key={i} fillOpacity={d.parcial ? 0.5 : 1} />
                        ))}
                      </Bar>
                      <Line
                        dataKey="meta"
                        name="Meta"
                        stroke={chartSemantic.warning}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Secao>

            {/* Relatório da meta (matriz setor × modelo por galpão) */}
            <Secao
              title={
                metaEscala.porDia
                  ? `Meta por setor — meta do dia ${metaEscala.label}`
                  : "Meta por setor (HH = HH padrão por barco × meta de quantidade)"
              }
              actions={
                <>
                  <Field label="Meta do dia" className="w-44">
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        value={metaDiaData}
                        onChange={(e) => setMetaDiaData(e.target.value)}
                      />
                    )}
                  </Field>
                  {metaDiaData && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-end"
                      onClick={() => setMetaDiaData("")}
                    >
                      <X className="h-4 w-4" />
                      Limpar
                    </Button>
                  )}
                </>
              }
            >
              {metaEscala.porDia &&
                (metaEscala.util ? (
                  <p className="mb-3 text-2xs text-muted-foreground">
                    Meta mensal rateada pelos {metaEscala.dias} dias úteis do mês. Limpe a data
                    para ver a meta cheia do mês.
                  </p>
                ) : (
                  <Alert variant="warning" className="mb-3">
                    {metaEscala.label} não é dia útil — a meta é rateada só de segunda a sexta,
                    então não há meta para este dia.
                  </Alert>
                ))}
              <MatrizMeta
                galpoes={galpoesVis}
                fator={metaEscala.fator}
                porDia={metaEscala.porDia}
              />
            </Secao>
          </>
        )}

        {/* Detalhamento por setor — FORA do bloco !apresentacao: as linhas da
            tabela de confronto são clicáveis também na TV. */}
        <Dialog open={!!drillSetor} onOpenChange={(v) => (v ? null : setDrillSetor(null))}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {drillSetor ? `Realizado — ${drillSetor} · ${periodoLabel}` : ""}
              </DialogTitle>
            </DialogHeader>
            {drillSetor && (
              <DetalheSetor
                setor={drillSetor}
                realPeriodo={realPeriodo}
                realGalpaoSetor={realGalpaoSetor}
                galpoes={galpoesVis}
                fator={fator}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PresentationShell>
  );
}

/** Pessoas e capacidade teórica de uma linha da tabela de setores. */
function quadroDaLinha(pessoas: number, diasUteis: number) {
  return { pessoas, capacidade: pessoas * diasUteis * HORAS_DIA };
}

type LinhaConfronto = {
  label: string;
  meta: number;
  real: number;
  onClick?: () => void;
  pessoas?: number;
  capacidade?: number;
};

// ── Tabela de confronto (Meta × Realizado × % atingimento) ────────────────────
function ConfrontoTable({
  linhas,
  primeiraCol,
  quadro,
}: {
  linhas: LinhaConfronto[];
  primeiraCol: string;
  /** Quando presente, mostra Pessoas e Capacidade HH (só a tabela de setores). */
  quadro?: { loading: boolean; erro: string | null };
}) {
  const totMeta = linhas.reduce((s, l) => s + l.meta, 0);
  const totReal = linhas.reduce((s, l) => s + l.real, 0);
  const totAt = totMeta > 0 ? (totReal / totMeta) * 100 : 0;
  const totPessoas = linhas.reduce((s, l) => s + (l.pessoas ?? 0), 0);
  const totCapacidade = linhas.reduce((s, l) => s + (l.capacidade ?? 0), 0);

  /** Célula do quadro: esqueleto carregando, travessão com o motivo se falhou. */
  const celulaQuadro = (conteudo: React.ReactNode) =>
    quadro?.loading ? (
      <Skeleton className="ml-auto h-4 w-10" />
    ) : quadro?.erro ? (
      <span className="text-muted-foreground/70" title={quadro.erro}>
        —
      </span>
    ) : (
      conteudo
    );

  /* Capacidade abaixo da meta fica vermelha: o setor não tem gente para a meta
     nem trabalhando todas as horas do período. */
  const capacidadeCls = (cap: number, meta: number) =>
    meta > 0 && cap < meta ? "text-destructive" : "text-foreground";
  const capacidadeTitulo = (cap: number, meta: number) =>
    meta > 0 ? `Capacidade cobre ${pctFmt((cap / meta) * 100)} da meta` : undefined;

  return (
    <div className="overflow-x-auto scrollbar-slim">
      <table className={cn("w-full text-sm", quadro ? "min-w-[42rem]" : "min-w-[32.5rem]")}>
        <thead className="sticky top-0 z-10 bg-muted/50">
          <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2.5 pl-4 pr-3 font-medium">{primeiraCol}</th>
            {quadro ? (
              <>
                <th className="px-3 py-2.5 text-right font-medium">Pessoas</th>
                <th className="px-3 py-2.5 text-right font-medium">Capacidade HH</th>
              </>
            ) : null}
            <th className="px-3 py-2.5 text-right font-medium">Meta HH</th>
            <th className="px-3 py-2.5 text-right font-medium">Realizado</th>
            <th className="px-3 py-2.5 text-right font-medium">Δ</th>
            <th className="w-40 px-3 py-2.5 text-right font-medium">Atingimento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map((l) => {
            const at = l.meta > 0 ? (l.real / l.meta) * 100 : 0;
            const delta = l.real - l.meta;
            return (
              <tr
                key={l.label}
                onClick={l.onClick}
                // Linha clicável acessível por teclado — no original era só onClick.
                tabIndex={l.onClick ? 0 : undefined}
                onKeyDown={
                  l.onClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          l.onClick?.();
                        }
                      }
                    : undefined
                }
                className={cn(
                  "transition-colors hover:bg-muted/40",
                  l.onClick &&
                    "cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                )}
              >
                <td className="py-2 pl-4 pr-3 text-foreground">{l.label}</td>
                {quadro ? (
                  <>
                    <td className="tabular px-3 py-2 text-right text-foreground">
                      {celulaQuadro(nf(l.pessoas ?? 0))}
                    </td>
                    <td
                      className={cn("tabular px-3 py-2 text-right", capacidadeCls(l.capacidade ?? 0, l.meta))}
                      title={quadro.loading || quadro.erro ? undefined : capacidadeTitulo(l.capacidade ?? 0, l.meta)}
                    >
                      {celulaQuadro(nf(l.capacidade ?? 0))}
                    </td>
                  </>
                ) : null}
                <td className="tabular px-3 py-2 text-right text-foreground">{nf(l.meta)}</td>
                <td className="tabular px-3 py-2 text-right text-foreground">{nf(l.real)}</td>
                <td
                  className={cn(
                    "tabular px-3 py-2 text-right",
                    delta >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {nf(delta)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", atingBar(at))}
                        style={{ width: `${Math.max(0, Math.min(100, at))}%` }}
                      />
                    </div>
                    <span className={cn("tabular w-14 text-right font-medium", atingTone(at))}>
                      {pctFmt(at)}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
          <tr>
            <td className="py-2.5 pl-4 pr-3 text-foreground">Total</td>
            {quadro ? (
              <>
                <td className="tabular px-3 py-2.5 text-right text-foreground">
                  {celulaQuadro(nf(totPessoas))}
                </td>
                <td
                  className={cn("tabular px-3 py-2.5 text-right", capacidadeCls(totCapacidade, totMeta))}
                  title={quadro.loading || quadro.erro ? undefined : capacidadeTitulo(totCapacidade, totMeta)}
                >
                  {celulaQuadro(nf(totCapacidade))}
                </td>
              </>
            ) : null}
            <td className="tabular px-3 py-2.5 text-right text-foreground">{nf(totMeta)}</td>
            <td className="tabular px-3 py-2.5 text-right text-foreground">{nf(totReal)}</td>
            <td
              className={cn(
                "tabular px-3 py-2.5 text-right",
                totReal - totMeta >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {nf(totReal - totMeta)}
            </td>
            <td className={cn("tabular px-3 py-2.5 text-right", atingTone(totAt))}>
              {pctFmt(totAt)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Matriz da meta (setor nas linhas, modelos por galpão nas colunas) ─────────
function MatrizMeta({
  galpoes,
  fator,
  porDia,
}: {
  galpoes: Galpao[];
  fator: number;
  porDia: boolean;
}) {
  // Com um dia selecionado os valores encolhem, então ganham casas decimais.
  const fmtHH = (v: number) => (porDia ? nf1(v * fator) : nf(v));
  const fmtQtd = (v: number) => (porDia ? fmtNum(v * fator, 2) : nf1(v));
  return (
    <div className="overflow-x-auto rounded-lg border border-border scrollbar-slim">
      <table className="w-full border-collapse text-2xs">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="sticky left-0 z-10 min-w-[9.375rem] bg-primary px-2 py-2 text-left font-semibold">
              Setor
            </th>
            {galpoes.map((g) => {
              const modelos = MNO_MODELOS.filter((m) => m.galpao === g);
              return (
                <React.Fragment key={g}>
                  {modelos.map((m) => (
                    <th key={m.id} className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                      {m.id}
                    </th>
                  ))}
                  <th className="whitespace-nowrap bg-accent px-2 py-2 text-right font-semibold text-accent-foreground">
                    {g}
                  </th>
                </React.Fragment>
              );
            })}
          </tr>
          <tr className="bg-muted text-muted-foreground">
            <td className="sticky left-0 z-10 bg-muted px-2 py-1.5 font-medium">
              Meta (qtd barcos)
            </td>
            {galpoes.map((g) => {
              const modelos = MNO_MODELOS.filter((m) => m.galpao === g);
              const qt = modelos.reduce((s, m) => s + m.metaQtd, 0);
              return (
                <React.Fragment key={g}>
                  {modelos.map((m) => (
                    <td key={m.id} className="tabular px-2 py-1.5 text-right">
                      {fmtQtd(m.metaQtd)}
                    </td>
                  ))}
                  <td className="tabular bg-accent-subtle px-2 py-1.5 text-right font-semibold text-foreground">
                    {fmtQtd(qt)}
                  </td>
                </React.Fragment>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {MNO_SETORES.map((s, ri) => (
            <tr key={s} className={ri % 2 === 0 ? "bg-card" : "bg-muted/40"}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 font-medium text-foreground">
                {s}
              </td>
              {galpoes.map((g) => {
                const modelos = MNO_MODELOS.filter((m) => m.galpao === g);
                return (
                  <React.Fragment key={g}>
                    {modelos.map((m) => (
                      <td key={m.id} className="tabular px-2 py-1.5 text-right text-foreground">
                        {fmtHH(metaHHModeloSetor(m.id, s))}
                      </td>
                    ))}
                    <td className="tabular bg-accent-subtle px-2 py-1.5 text-right font-semibold text-foreground">
                      {fmtHH(META_HH_GALPAO_SETOR[g][s])}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted font-bold text-foreground">
            <td className="sticky left-0 z-10 bg-muted px-2 py-2">Total</td>
            {galpoes.map((g) => {
              const modelos = MNO_MODELOS.filter((m) => m.galpao === g);
              return (
                <React.Fragment key={g}>
                  {modelos.map((m) => (
                    <td key={m.id} className="tabular px-2 py-2 text-right">
                      {fmtHH(MNO_SETORES.reduce((acc, s) => acc + metaHHModeloSetor(m.id, s), 0))}
                    </td>
                  ))}
                  <td className="tabular bg-accent-subtle px-2 py-2 text-right">
                    {fmtHH(META_HH_POR_GALPAO[g])}
                  </td>
                </React.Fragment>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Detalhe de um setor (realizado por galpão e por modelo) ───────────────────
function DetalheSetor({
  setor,
  realPeriodo,
  realGalpaoSetor,
  galpoes,
  fator,
}: {
  setor: Setor;
  realPeriodo: RealizadoSetor[];
  realGalpaoSetor: Map<string, number>;
  galpoes: Galpao[];
  /** Rateio da meta mensal para o período — o mesmo da tabela de confronto. */
  fator: number;
}) {
  // Realizado do setor por modelo (agrupa os rows do setor)
  const porModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of realPeriodo) {
      if (resolveSetor(r.setor) === setor)
        m.set(r.modelo || "(sem modelo)", (m.get(r.modelo || "(sem modelo)") ?? 0) + r.horas);
    }
    return Array.from(m.entries())
      .map(([modelo, horas]) => ({ modelo, horas }))
      .sort((a, b) => b.horas - a.horas);
  }, [realPeriodo, setor]);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Meta × Realizado por galpão
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pl-4 pr-3 font-medium">Galpão</th>
                <th className="px-3 py-2 text-right font-medium">Meta HH</th>
                <th className="px-3 py-2 text-right font-medium">Realizado</th>
                <th className="px-3 py-2 text-right font-medium">Atingimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {galpoes.map((g) => {
                const meta = META_HH_GALPAO_SETOR[g][setor] * fator;
                const real = realGalpaoSetor.get(`${g}|${setor}`) ?? 0;
                const at = meta > 0 ? (real / meta) * 100 : 0;
                return (
                  <tr key={g}>
                    <td className="py-2 pl-4 pr-3 text-foreground">{g}</td>
                    <td className="tabular px-3 py-2 text-right text-foreground">{nf(meta)}</td>
                    <td className="tabular px-3 py-2 text-right text-foreground">{nf(real)}</td>
                    <td className={cn("tabular px-3 py-2 text-right font-medium", atingTone(at))}>
                      {pctFmt(at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Realizado por modelo (grupo de produto)
        </p>
        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border scrollbar-slim">
          {porModelo.length === 0 ? (
            <EmptyState
              title="Sem apontamento"
              description="Nenhum HH apontado neste setor no período."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-4 pr-3 font-medium">Modelo</th>
                  <th className="px-3 py-2 text-right font-medium">Realizado HH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porModelo.map((r) => (
                  <tr key={r.modelo}>
                    <td className="py-2 pl-4 pr-3 text-foreground">{r.modelo}</td>
                    <td className="tabular px-3 py-2 text-right text-foreground">{nf(r.horas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
