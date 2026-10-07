// src/pages/OpeDetalhamentoModal.tsx
// OPE — Operacional de Produção. Cópia da rotina do painel-diretoria
// (painel-diretoria/src/pages/OpeDetalhamentoModal.tsx). O nome do arquivo foi
// mantido para facilitar a comparação entre os dois projetos, embora a tela não
// seja um modal.
//
// A LÓGICA vem dos arquivos copiados: services/opeService, lib/opeConfig,
// lib/galpoes, lib/tabela e lib/xlsx. Toda conta abaixo (agregação, farol,
// matriz, média móvel, teto do eixo) está linha a linha igual à de lá.
//
// A INTERFACE foi portada para o design system deste projeto. Diferenças:
//  · o período usa o DateRangePicker (aplica ao confirmar, como o "Aplicar" de lá);
//  · rótulos clicáveis viraram <button> — lá eram <span onClick>, sem teclado;
//  · os formatadores vêm de lib/formatDiretoria (ver o cabeçalho de lá);
//  · os detalhamentos de ponto e de atividades (lá, listas cruas) viraram a
//    AUDITORIA do OPE (components/ope/OpeAuditoriaDialog): ponto agrupado por
//    colaborador, atividades por barco com o avanço do cronograma e conferência
//    contra o número clicado. Toda célula das grades "Setores" e "OPE por setor
//    e galpão" abre a auditoria do seu recorte (setor, setor × galpão, totais),
//    Perdas abre a aba de retrabalho, e os cards OPE / Horas de ponto /
//    Atividades também abrem. Mesmas consultas de detalhe de lá.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

import { num, pct, signed, DASH } from "@/lib/formatDiretoria";
import { dataOracle, isoLocal, parseData, type IsoRange } from "@/lib/datetime";
import {
  farolOpe,
  OPE_FAROL_CLS,
  opeTitulo,
  META_OPE,
  OPE_ANOMALIA,
} from "@/lib/opeConfig";
import { faixaDe } from "@/lib/galpoes";
import {
  getOpeDados,
  agregar,
  buildDailySeries,
  gruposDoGalpao,
  totaisOpe,
  type AggRow,
  type DailyPoint,
  type GalpaoOpe,
  type GrupoProducao,
  type RawAtivRow,
  type RawPontoRow,
  type RecorteOpe,
} from "@/services/opeService";
import {
  axisProps,
  chartSemantic,
  gridProps,
  tooltipProps,
} from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/tone";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatCard } from "@/components/patterns/StatCard";
import { OpeAuditoriaDialog, type AbaAuditoria, type TotaisAuditoria } from "@/components/ope/OpeAuditoriaDialog";

/* ── Helpers de período ─────────────────────────────────────── */
/** Período padrão de lá: do dia 1º do mês até hoje. */
function periodoPadrao(): IsoRange {
  const d = new Date();
  return { ini: isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), fim: isoLocal(d) };
}

/** `yyyy-mm-dd` → `DD/MM/YYYY`, o formato que as consultas esperam. */
function paraOracle(iso: string): string {
  const d = parseData(iso);
  return d ? dataOracle(d) : "";
}

/* ── Classes de tabela ──────────────────────────────────────── */
// Equivalentes aos primitivos TableShell/Th/Td de lá. `priority` 2 e 3 somem em
// telas estreitas (3 some primeiro), como no DataTable da diretoria.
const prioridadeCls = (p?: 2 | 3) =>
  p === 2 ? "hidden sm:table-cell" : p === 3 ? "hidden md:table-cell" : "";
const TH = "px-3 py-2.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2";

function SkeletonLinhas({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={cols} className="px-3 py-2">
            <Skeleton className="h-5" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Botão com aparência de link, para rótulos que abrem detalhe. */
function LinkDetalhe({
  onClick,
  title,
  children,
  className,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-sm text-left underline-offset-2 transition-colors hover:text-accent hover:underline",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Linhas em amadurecimento — ocultáveis pelo botão do cabeçalho.
 *
 * A NX620 é produto novo: o processo ainda está sendo aprendido, então as
 * horas apontadas nela não representam o que o Galpão 3 sabe fazer, e puxam o
 * OPE do galpão para baixo. O padrão é MOSTRAR (o número cheio é o verdadeiro)
 * e ocultar é uma escolha explícita de quem analisa.
 */
const LINHAS_EM_MATURACAO: readonly string[] = ["NX620"];

/** O que o filtro de escopo recebe: o registro de atividade ou de ponto. */
type RegOpe = { linha: string; codPlp: string };

/**
 * Escopo da tela: Geral e um por galpão do TPRPLP (a lista vem do banco, não há
 * mais lotação linha → galpão no código).
 *
 * O galpão de cada registro já chega corrigido pela SQL — inclusive a
 * realocação de Componentes, Pintura e Mecânica. A linha só serve à lente de
 * maturação, que vale para a tela INTEIRA: o Geral não filtra galpão (a SQL já
 * restringe aos da lista), só tira as linhas ocultas.
 */
type Escopo = { id: string; label: string; codPlp: string | null; fn: (r: RegOpe) => boolean };

function escoposDe(galpoes: GalpaoOpe[], ocultar: boolean): Escopo[] {
  const visivel = (l: string) => !(ocultar && LINHAS_EM_MATURACAO.includes(l));
  return [
    { id: "geral", label: "Geral", codPlp: null, fn: (r) => visivel(r.linha) },
    ...galpoes.map((g) => ({
      id: g.codPlp,
      label: g.nome,
      codPlp: g.codPlp,
      fn: (r: RegOpe) => r.codPlp === g.codPlp && visivel(r.linha),
    })),
  ];
}

/** Linhas que de fato aparecem em cada galpão no período — só para exibir a faixa. */
function linhasPorGalpao(ativos: RawAtivRow[], pontos: RawPontoRow[]): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const r of [...ativos, ...pontos]) {
    if (!r.linha) continue;
    const s = m.get(r.codPlp) ?? new Set<string>();
    s.add(r.linha);
    m.set(r.codPlp, s);
  }
  return new Map([...m].map(([k, v]) => [k, [...v].sort()]));
}

/* ── Drill-down ────────────────────────────────────────────── */

/** Qual aba da auditoria a célula clicada abre: ponto, atividades ou perdas. */
type TipoDetalhe = AbaAuditoria;

/**
 * Um recorte detalhável: o que abrir, em qual aba, e contra quais números
 * conferir. `recorte` vai para a SQL (códigos); `rotulo` vai para o subtítulo
 * da auditoria (nomes).
 */
type Recorte = { label: string; recorte: RecorteOpe; rotulo: string; totais: TotaisAuditoria; tipo: TipoDetalhe };

/** Célula numérica que abre a auditoria do seu recorte; sem recorte, só o conteúdo. */
function CelulaDetalhe({
  recorte,
  onAbrir,
  title,
  children,
}: {
  recorte: Recorte | null;
  onAbrir: (r: Recorte) => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!recorte) return <>{children}</>;
  return (
    <LinkDetalhe title={title} onClick={() => onAbrir(recorte)}>
      {children}
    </LinkDetalhe>
  );
}

/** Totais de um conjunto de linhas agregadas — base da conferência da auditoria. */
function totaisDeLinhas(ls: AggRow[]): TotaisAuditoria {
  const ponto = ls.reduce((s, l) => s + l.horasReg, 0);
  const ativ = ls.reduce((s, l) => s + l.horas, 0);
  const perdas = ls.reduce((s, l) => s + l.horasRetrabalho, 0);
  return { ponto, ativ, perdas, opePct: ponto > 0 ? (ativ / ponto) * 100 : null };
}

/* ── Gráfico de linha OPE diário ───────────────────────────── */
function OpeChart({ series, loading }: { series: DailyPoint[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-full w-full" />;
  if (series.length === 0)
    return (
      <div className="flex h-full items-center justify-center text-2xs text-muted-foreground">
        Sem dados
      </div>
    );

  const tickFormatter = (v: string) => v.slice(0, 5);

  /**
   * Teto do eixo: o maior valor, mas limitado a 150%. Um único dia de 300%
   * comprimia a série inteira no terço inferior do gráfico e a variação do dia
   * a dia virava uma linha quase reta.
   */
  const maxSerie = Math.max(...series.map((s) => s.ope), META_OPE);
  const teto = Math.min(Math.max(110, Math.ceil(maxSerie / 10) * 10), 150);
  const yTicks = [0, 25, 50, META_OPE, 100, ...(teto > 100 ? [teto] : [])]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b);

  const data = series.map((pt, i) => {
    const janela = series.slice(Math.max(0, i - 6), i + 1);
    const mm7 = parseFloat((janela.reduce((s, p) => s + p.ope, 0) / janela.length).toFixed(1));
    return { ...pt, mm7 };
  });

  /* Dia acima de 100% ganha ponto de atenção: é o mesmo sinal da tabela, para
     quem lê o gráfico não interpretar o pico como o melhor dia do mês. */
  const dotOpe = (props: { cx?: number; cy?: number; payload?: DailyPoint; index?: number }) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null || !payload) return <g key={`dot-${index}`} />;
    const anomalo = payload.ope > OPE_ANOMALIA;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={anomalo ? 3.5 : 2}
        fill={anomalo ? chartSemantic.warning : chartSemantic.primary}
      />
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* right: 64 (lá é 8) — o rótulo "meta 70%" fica fora da área do gráfico e era cortado. */}
      <LineChart data={data} margin={{ top: 6, right: 64, bottom: 0, left: 4 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="data"
          tickFormatter={tickFormatter}
          interval="preserveStartEnd"
        />
        <YAxis
          {...axisProps}
          domain={[0, teto]}
          ticks={yTicks}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          {...tooltipProps}
          formatter={(v, name) => [pct(Number(v)), name === "mm7" ? "MM 7d" : "OPE"]}
          labelFormatter={(l) => `Data: ${l}`}
        />
        {/* A única linha de referência é a que carrega significado: a meta. */}
        <ReferenceLine
          y={META_OPE}
          stroke={chartSemantic.success}
          strokeDasharray="6 3"
          label={{
            value: `meta ${META_OPE}%`,
            position: "right",
            fontSize: 11,
            fill: chartSemantic.success,
          }}
        />
        <Line
          type="monotone"
          dataKey="ope"
          name="OPE"
          stroke={chartSemantic.primary}
          strokeWidth={1.5}
          dot={dotOpe}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="mm7"
          name="MM 7d"
          stroke={chartSemantic.warning}
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Célula de OPE com farol contra a meta; acima de 100% é sinalizado, não verde. */
function CelulaOpe({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-muted-foreground/70">{DASH}</span>;
  const farol = farolOpe(valor);
  return (
    <span className={cn("font-semibold", farol && OPE_FAROL_CLS[farol])} title={opeTitulo(farol)}>
      {pct(valor)}
      {farol === "anomalia" && (
        <AlertTriangle className="-mt-0.5 ml-1 inline-block h-3 w-3" aria-label="verificar" />
      )}
    </span>
  );
}

/** Rótulo de seção acima de tabela/gráfico. */
function Rotulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
      {sub ? <span className="tabular text-2xs text-muted-foreground/70">{sub}</span> : null}
    </div>
  );
}

/**
 * Matriz OPE: setores nas linhas, galpões nas colunas. Um setor pode estar bem
 * num galpão e mal noutro, e o número agregado some com os dois.
 *
 * Toda célula abre a auditoria do SEU recorte: setor × galpão, total do setor
 * (todos os galpões), total do galpão (todos os setores) e o geral.
 */
function MatrizSetorGalpao({
  porGalpao,
  grupos,
  excluirLinhas,
  loading,
  ini,
  fim,
  onDetalhe,
}: {
  porGalpao: { codPlp: string; label: string; subtitulo?: string; linhas: AggRow[] }[];
  /** Ordem das linhas da matriz; setor que só existe nos dados entra no fim. */
  grupos: GrupoProducao[];
  /** Lente de maturação — vale para toda célula. */
  excluirLinhas: string[];
  loading: boolean;
  ini?: string;
  fim?: string;
  onDetalhe: (r: Recorte) => void;
}) {
  /* O cruzamento é por CÓDIGO do grupo, não por nome: dois grupos de produção
     com o mesmo NOMEGRUPO seriam somados numa linha só se a chave fosse o rótulo. */
  const setores = useMemo(() => {
    const presentes = new Map<string, string>();
    for (const g of porGalpao) for (const l of g.linhas) if (l.codGrupo && !presentes.has(l.codGrupo)) presentes.set(l.codGrupo, l.label);
    const ordem = grupos.map((g) => g.codGrupo).filter((c) => presentes.has(c));
    const extras = [...presentes.keys()].filter((c) => !ordem.includes(c));
    return [...ordem, ...extras].map((cod) => ({ cod, label: presentes.get(cod) ?? cod }));
  }, [porGalpao, grupos]);
  const podeDetalhar = !!(ini && fim);
  const sem = excluirLinhas.length ? ` · sem ${excluirLinhas.join(", ")}` : "";

  const opeDe = (l?: AggRow) => (l && l.horasReg > 0 ? (l.horas / l.horasReg) * 100 : null);

  /* Totais somam as horas e dividem — não é média dos setores, que daria peso
     igual a um setor de 8.000h e a outro de 900h. */
  const linhasDoSetor = (cod: string) =>
    porGalpao.flatMap((g) => g.linhas.filter((x) => x.codGrupo === cod));
  const todas = porGalpao.flatMap((g) => g.linhas);

  const recorte = (label: string, rec: RecorteOpe, rotulo: string, ls: AggRow[]): Recorte | null => {
    if (!podeDetalhar) return null;
    const totais = totaisDeLinhas(ls);
    if (totais.ponto <= 0 && totais.ativ <= 0) return null;
    return { label, recorte: { ...rec, excluirLinhas }, rotulo: rotulo + sem, totais, tipo: "ponto" };
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Rotulo>OPE por setor e galpão</Rotulo>
      <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-slim">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className={TH}>Setor</th>
              {porGalpao.map((g) => (
                <th key={g.label} className={cn(TH, "text-right")}>
                  {g.label}
                  {g.subtitulo && (
                    <span className="tabular block text-2xs font-normal normal-case tracking-normal text-muted-foreground/70">
                      {g.subtitulo}
                    </span>
                  )}
                </th>
              ))}
              <th className={cn(TH, "text-right")}>Geral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <SkeletonLinhas rows={Math.max(6, grupos.length)} cols={porGalpao.length + 2} />
            ) : (
              setores.map(({ cod, label }) => {
                const doSetor = linhasDoSetor(cod);
                const recSetor = recorte(label, { setor: cod }, `${label} · todos os galpões`, doSetor);
                return (
                  <tr key={cod} className="hover:bg-muted/40">
                    <td className={TD}>
                      <CelulaDetalhe recorte={recSetor} onAbrir={onDetalhe} title={`Auditar ${label} — todos os galpões`}>
                        {label}
                      </CelulaDetalhe>
                    </td>
                    {porGalpao.map((g) => {
                      const l = g.linhas.find((x) => x.codGrupo === cod);
                      const rec = l ? recorte(`${label} · ${g.label}`, { setor: cod, codPlp: g.codPlp }, `${label} · ${g.label}`, [l]) : null;
                      return (
                        <td key={g.label} className={cn(TD, "tabular text-right")}>
                          <CelulaDetalhe recorte={rec} onAbrir={onDetalhe} title={`Auditar ${label} no ${g.label}`}>
                            <CelulaOpe valor={opeDe(l)} />
                          </CelulaDetalhe>
                        </td>
                      );
                    })}
                    <td className={cn(TD, "tabular text-right")}>
                      <CelulaDetalhe recorte={recSetor} onAbrir={onDetalhe} title={`Auditar ${label} — todos os galpões`}>
                        <CelulaOpe valor={totaisDeLinhas(doSetor).opePct} />
                      </CelulaDetalhe>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && (
            <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
              <tr>
                <td className={TD}>Total</td>
                {porGalpao.map((g) => (
                  <td key={g.label} className={cn(TD, "tabular text-right")}>
                    <CelulaDetalhe recorte={recorte(g.label, { codPlp: g.codPlp }, `${g.label} · todos os setores`, g.linhas)} onAbrir={onDetalhe} title={`Auditar ${g.label} — todos os setores`}>
                      <CelulaOpe valor={totaisDeLinhas(g.linhas).opePct} />
                    </CelulaDetalhe>
                  </td>
                ))}
                <td className={cn(TD, "tabular text-right")}>
                  <CelulaDetalhe recorte={recorte("Geral", {}, "fábrica inteira", todas)} onAbrir={onDetalhe} title="Auditar o geral">
                    <CelulaOpe valor={totaisDeLinhas(todas).opePct} />
                  </CelulaDetalhe>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ── Tabela por seção ──────────────────────────────────────── */
/**
 * Toda célula abre a auditoria do recorte da linha: Ponto, Pendências e OPE na
 * aba de ponto; Atividades na de atividades; Perdas na de perdas. O Total abre
 * o escopo inteiro da tabela.
 */
function TabelaCard({
  titulo,
  subtitulo,
  linhas,
  loading,
  ini,
  fim,
  recorteBase,
  rotuloBase,
}: {
  titulo: string;
  /** Faixa de linhas do galpão, exibida junto do título. */
  subtitulo?: string;
  linhas: AggRow[];
  loading: boolean;
  ini?: string;
  fim?: string;
  /** O recorte do escopo (galpão + maturação); cada linha acrescenta o seu setor. */
  recorteBase: RecorteOpe;
  /** O escopo em palavras, para o subtítulo da auditoria. */
  rotuloBase: string;
}) {
  const [detalhe, setDetalhe] = useState<Recorte | null>(null);

  /** Recorte da linha clicada: o do escopo mais o setor dela. `null` = não detalhável. */
  function recorteDaLinha(l: AggRow, tipo: TipoDetalhe): Recorte | null {
    if (!ini || !fim || !l.codGrupo) return null;
    return { label: l.label, recorte: { ...recorteBase, setor: l.codGrupo }, rotulo: `${rotuloBase} · ${l.label}`, totais: totaisDeLinhas([l]), tipo };
  }
  const recorteTotal = (tipo: TipoDetalhe): Recorte | null =>
    ini && fim ? { label: "Total", recorte: recorteBase, rotulo: rotuloBase, totais: totaisDeLinhas(linhas), tipo } : null;

  const totAtivH = linhas.reduce((s, l) => s + l.horas, 0);
  const totRetrabH = linhas.reduce((s, l) => s + l.horasRetrabalho, 0);
  const totPontoH = linhas.reduce((s, l) => s + l.horasReg, 0);

  const opeDe = (a: number, b: number) => (b <= 0 ? null : (a / b) * 100);
  const hasLoss = (v: number) => v > 0;
  const fmtPend = (v: number) => (v === 0 ? num(0) : signed(v, { decimals: 2 }));
  const pendCls = (v: number) => (v === 0 ? "text-muted-foreground/70" : "text-destructive");

  return (
    <>
      {/* montado só quando aberto: cada abertura começa com estado limpo */}
      {detalhe && ini && fim && (
        <OpeAuditoriaDialog
          titulo={`${titulo} — ${detalhe.label}`}
          ini={ini}
          fim={fim}
          recorte={detalhe.recorte}
          rotuloRecorte={detalhe.rotulo}
          abaInicial={detalhe.tipo}
          totais={detalhe.totais}
          onClose={() => setDetalhe(null)}
        />
      )}
      <div className="flex flex-col gap-1.5">
        <Rotulo sub={subtitulo}>{titulo}</Rotulo>
        <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-slim">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className={TH}>Setor</th>
                <th className={cn(TH, "text-right", prioridadeCls(3))}>
                  <span className="text-success">Ponto</span>
                </th>
                <th className={cn(TH, "text-right")}>
                  <span className="text-foreground">Atividades</span>
                </th>
                <th className={cn(TH, "text-right", prioridadeCls(2))}>
                  <span className="text-warning">Perdas</span>
                </th>
                <th className={cn(TH, "text-right", prioridadeCls(2))}>
                  <span className="text-destructive">Pendências</span>
                </th>
                <th className={cn(TH, "text-right")}>OPE</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {loading ? (
                <SkeletonLinhas rows={6} cols={6} />
              ) : (
                linhas.map((l) => {
                  const pend = l.horasReg - l.horas - l.horasRetrabalho;
                  return (
                    <tr key={l.label} className="hover:bg-muted/40">
                      <td className={TD}>
                        <CelulaDetalhe recorte={l.horasReg > 0 || l.horas > 0 ? recorteDaLinha(l, "ponto") : null} onAbrir={setDetalhe} title={`Auditar ${l.label} — colaboradores`}>
                          {l.label}
                        </CelulaDetalhe>
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(3))}>
                        <CelulaDetalhe recorte={l.horasReg > 0 ? recorteDaLinha(l, "ponto") : null} onAbrir={setDetalhe} title={`Ver colaboradores — ${l.label}`}>
                          <span className="font-semibold text-success">{num(l.horasReg)}</span>
                        </CelulaDetalhe>
                      </td>
                      <td className={cn(TD, "tabular text-right font-semibold")}>
                        <CelulaDetalhe recorte={l.horas > 0 ? recorteDaLinha(l, "ativ") : null} onAbrir={setDetalhe} title={`Ver atividades por barco — ${l.label}`}>
                          {num(l.horas)}
                        </CelulaDetalhe>
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                        <CelulaDetalhe recorte={hasLoss(l.horasRetrabalho) ? recorteDaLinha(l, "perdas") : null} onAbrir={setDetalhe} title={`Ver retrabalho por barco — ${l.label}`}>
                          <span className="font-semibold text-warning">
                            {hasLoss(l.horasRetrabalho) ? num(l.horasRetrabalho) : DASH}
                          </span>
                        </CelulaDetalhe>
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                        <CelulaDetalhe recorte={pend !== 0 ? recorteDaLinha(l, "ponto") : null} onAbrir={setDetalhe} title={`Pendências = ponto − atividades − perdas — ${l.label}`}>
                          <span className={cn("font-semibold", pendCls(pend))}>{fmtPend(pend)}</span>
                        </CelulaDetalhe>
                      </td>
                      <td className={cn(TD, "tabular text-right")}>
                        <CelulaDetalhe recorte={l.horasReg > 0 ? recorteDaLinha(l, "ponto") : null} onAbrir={setDetalhe} title={`Auditar OPE — ${l.label}`}>
                          <CelulaOpe valor={opeDe(l.horas, l.horasReg)} />
                        </CelulaDetalhe>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {!loading && (
              <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                <tr>
                  <td className={TD}>Total</td>
                  <td className={cn(TD, "tabular text-right", prioridadeCls(3))}>
                    <CelulaDetalhe recorte={totPontoH > 0 ? recorteTotal("ponto") : null} onAbrir={setDetalhe} title="Ver colaboradores — total">
                      <span className="text-success">{num(totPontoH)}</span>
                    </CelulaDetalhe>
                  </td>
                  <td className={cn(TD, "tabular text-right")}>
                    <CelulaDetalhe recorte={totAtivH > 0 ? recorteTotal("ativ") : null} onAbrir={setDetalhe} title="Ver atividades por barco — total">
                      {num(totAtivH)}
                    </CelulaDetalhe>
                  </td>
                  <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                    <CelulaDetalhe recorte={hasLoss(totRetrabH) ? recorteTotal("perdas") : null} onAbrir={setDetalhe} title="Ver retrabalho por barco — total">
                      <span className="text-warning">{hasLoss(totRetrabH) ? num(totRetrabH) : DASH}</span>
                    </CelulaDetalhe>
                  </td>
                  <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                    <CelulaDetalhe recorte={totPontoH - totAtivH - totRetrabH !== 0 ? recorteTotal("ponto") : null} onAbrir={setDetalhe} title="Pendências — total">
                      <span className={pendCls(totPontoH - totAtivH - totRetrabH)}>
                        {fmtPend(totPontoH - totAtivH - totRetrabH)}
                      </span>
                    </CelulaDetalhe>
                  </td>
                  <td className={cn(TD, "tabular text-right")}>
                    <CelulaDetalhe recorte={totPontoH > 0 ? recorteTotal("ponto") : null} onAbrir={setDetalhe} title="Auditar OPE — total">
                      <CelulaOpe valor={opeDe(totAtivH, totPontoH)} />
                    </CelulaDetalhe>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Gráfico por seção ─────────────────────────────────────── */
function GraficoCard({
  titulo,
  filtro,
  grupos,
  dadosAtiv,
  dadosPonto,
  loading,
}: {
  titulo: string;
  /** Filtro do escopo selecionado na tela (galpão + maturação). */
  filtro: (r: RegOpe) => boolean;
  /** Setores que o escopo mostra — os chips do gráfico. */
  grupos: GrupoProducao[];
  dadosAtiv: RawAtivRow[];
  dadosPonto: RawPontoRow[];
  loading: boolean;
}) {
  /* `null` = Geral. Se o setor escolhido não existe no escopo novo (trocou de
     galpão), o gráfico volta ao Geral em vez de mostrar uma série vazia. */
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const selecionado = escolhido != null && grupos.some((g) => g.codGrupo === escolhido) ? escolhido : null;

  const series = useMemo(() => {
    const fl = (r: RegOpe & { codGrupo: string }) => filtro(r) && (selecionado == null || r.codGrupo === selecionado);
    return buildDailySeries(dadosAtiv, dadosPonto, fl, fl);
  }, [dadosAtiv, dadosPonto, selecionado, filtro]);

  return (
    <div className="flex flex-col gap-1.5">
      <Rotulo>{titulo}</Rotulo>
      <Card>
        <CardContent className="flex flex-col p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Chip ativo={selecionado == null} onClick={() => setEscolhido(null)}>
              Geral
            </Chip>
            {grupos.map((g) => (
              <Chip key={g.codGrupo} ativo={selecionado === g.codGrupo} onClick={() => setEscolhido(g.codGrupo)}>
                {g.nome}
              </Chip>
            ))}
          </div>
          <div className="h-48 md:h-56 2xl:h-64">
            <OpeChart series={series} loading={loading} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────── */
export function OpeDetalhamentoModal() {
  // Um período para a tela inteira. Eram dois filtros independentes, o que
  // permitia comparar uma tabela de agosto com um gráfico de julho.
  const [range, setRange] = useState<IsoRange>(periodoPadrao);
  const periodo = useMemo(
    () => ({ ini: paraOracle(range.ini), fim: paraOracle(range.fim) }),
    [range]
  );
  const reqId = useRef(0);

  const [escopo, setEscopo] = useState<string>("geral");
  /* Começa desligado: o OPE cheio é o número real da fábrica. Ocultar é uma
     lente para analisar, e quem a liga precisa saber que ligou. */
  const [ocultarMaturacao, setOcultarMaturacao] = useState(false);
  /* Drill-down disparado pela matriz — o `TabelaCard` tem o seu próprio. */
  const [detalheGeral, setDetalheGeral] = useState<Recorte | null>(null);
  /* Auditoria aberta pelos cards de KPI — sempre o escopo inteiro da tela. */
  const [auditoriaKpi, setAuditoriaKpi] = useState<TipoDetalhe | null>(null);

  const [dadosAtiv, setDadosAtiv] = useState<RawAtivRow[]>([]);
  const [dadosPonto, setDadosPonto] = useState<RawPontoRow[]>([]);
  /* Setores (TSIGRU) e galpões (TPRPLP) vêm do banco junto com os dados. */
  const [grupos, setGrupos] = useState<GrupoProducao[]>([]);
  /* Preenchido quando a conta com empréstimo de colaborador falhou e o ponto
     saiu sem empréstimos (rede de segurança do opeService). */
  const [avisoEmprestimo, setAvisoEmprestimo] = useState<string | null>(null);
  const [galpoesBanco, setGalpoesBanco] = useState<GalpaoOpe[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Carga única da tela: as listas de setores e de galpões (cacheadas na
   * sessão) e, por setor, uma consulta de atividades e uma de ponto. `reqId`
   * descarta resposta de requisição vencida — dois períodos aplicados em
   * seguida não pintam a tela com o anterior, se ele demorar mais para voltar.
   */
  useEffect(() => {
    if (!periodo.ini || !periodo.fim) return;
    const id = ++reqId.current;
    setLoading(true);
    setErro(null);
    getOpeDados(periodo.ini, periodo.fim)
      .then(({ ativos, pontos, grupos: gs, galpoes: gps, avisoEmprestimo: aviso }) => {
        if (id !== reqId.current) return;
        setAvisoEmprestimo(aviso);
        setDadosAtiv(ativos);
        setDadosPonto(pontos);
        setGrupos(gs);
        setGalpoesBanco(gps);
      })
      .catch(() => {
        if (id === reqId.current) setErro("Falha ao carregar os dados");
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [periodo]);

  const escopos = useMemo(() => escoposDe(galpoesBanco, ocultarMaturacao), [galpoesBanco, ocultarMaturacao]);
  const escopoAtual = escopos.find((e) => e.id === escopo) ?? escopos[0];
  const filtroEscopo = escopoAtual.fn;
  const excluirLinhas = useMemo(() => (ocultarMaturacao ? [...LINHAS_EM_MATURACAO] : []), [ocultarMaturacao]);
  /** O escopo como recorte de SQL, para a auditoria abrir exatamente o que a tela soma. */
  const recorteEscopo = useMemo<RecorteOpe>(
    () => ({ codPlp: escopoAtual.codPlp, excluirLinhas }),
    [escopoAtual.codPlp, excluirLinhas]
  );
  const rotuloEscopo = `${escopoAtual.codPlp == null ? "fábrica inteira" : escopoAtual.label}${excluirLinhas.length ? ` · sem ${excluirLinhas.join(", ")}` : ""}`;
  const linhasGalpao = useMemo(() => linhasPorGalpao(dadosAtiv, dadosPonto), [dadosAtiv, dadosPonto]);

  /* Setores que fazem sentido no escopo: o galpão de Componentes só mostra
     Componentes, e os galpões de origem deixam de mostrar os setores que foram
     realocados. Só muda o que APARECE — `agregar` põe no fim qualquer setor que
     tenha dado, então nenhuma hora some da conta. */
  const gruposEscopo = useMemo(() => gruposDoGalpao(escopoAtual.codPlp, grupos), [escopoAtual.codPlp, grupos]);

  /** Setores do escopo selecionado. */
  const setores = useMemo(
    () => agregar(dadosAtiv, dadosPonto, filtroEscopo, gruposEscopo),
    [dadosAtiv, dadosPonto, filtroEscopo, gruposEscopo]
  );

  /** Setores × galpão, só na visão Geral. */
  const porGalpao = useMemo(() => {
    if (escopo !== "geral") return [];
    return escopos
      .filter((e) => e.codPlp != null)
      .map((e) => ({
        codPlp: e.codPlp as string,
        label: e.label,
        subtitulo: faixaDe(linhasGalpao.get(e.codPlp as string) ?? []),
        linhas: agregar(dadosAtiv, dadosPonto, e.fn, gruposDoGalpao(e.codPlp, grupos)),
      }));
  }, [dadosAtiv, dadosPonto, escopo, escopos, grupos, linhasGalpao]);

  /* Mesma função que a home da diretoria usa — ver `totaisOpe` em opeService. */
  const tot = useMemo(() => totaisOpe(setores), [setores]);

  /* Quantos setores estão acima de 100% — o número que não deve ser lido como
     desempenho. */
  const setoresAnomalos = useMemo(
    () => setores.filter((l) => l.horasReg > 0 && (l.horas / l.horasReg) * 100 > OPE_ANOMALIA).length,
    [setores]
  );

  const farolTotal = farolOpe(tot.opePct);
  const tomTotal: Tone | undefined =
    farolTotal === "ok"
      ? "success"
      : farolTotal === "bad"
        ? "danger"
        : farolTotal
          ? "warning"
          : undefined;

  return (
    <div className="space-y-5">
      {detalheGeral && periodo.ini && periodo.fim && (
        <OpeAuditoriaDialog
          titulo={detalheGeral.label}
          ini={periodo.ini}
          fim={periodo.fim}
          recorte={detalheGeral.recorte}
          rotuloRecorte={detalheGeral.rotulo}
          abaInicial={detalheGeral.tipo}
          totais={detalheGeral.totais}
          onClose={() => setDetalheGeral(null)}
        />
      )}
      {auditoriaKpi && periodo.ini && periodo.fim && (
        <OpeAuditoriaDialog
          titulo={escopoAtual.label}
          ini={periodo.ini}
          fim={periodo.fim}
          recorte={recorteEscopo}
          rotuloRecorte={rotuloEscopo}
          abaInicial={auditoriaKpi}
          totais={{ ponto: tot.ponto, ativ: tot.ativ, perdas: tot.perdas, opePct: tot.opePct }}
          onClose={() => setAuditoriaKpi(null)}
        />
      )}

      {/* Período (rege tabelas e gráficos) e escopo. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} title="Período do OPE" />
            {loading ? <Badge variant="muted">carregando…</Badge> : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {escopos.map((e) => (
              <Chip key={e.id} ativo={escopo === e.id} onClick={() => setEscopo(e.id)}>
                {e.label}
                {/* A faixa no próprio botão: quem escolhe o galpão vê o que
                    está escolhendo, sem precisar decorar a lotação. */}
                {e.codPlp != null && (linhasGalpao.get(e.codPlp)?.length ?? 0) > 0 && (
                  <span className="tabular font-normal opacity-70">{faixaDe(linhasGalpao.get(e.codPlp) ?? [])}</span>
                )}
              </Chip>
            ))}

            {/* Separado dos escopos: não é um quarto recorte, é uma lente. */}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <Chip
              ativo={ocultarMaturacao}
              onClick={() => setOcultarMaturacao((v) => !v)}
              title={
                ocultarMaturacao
                  ? `Voltar a incluir ${LINHAS_EM_MATURACAO.join(", ")} em toda a tela.`
                  : `Tira ${LINHAS_EM_MATURACAO.join(", ")} de toda a tela — KPIs, tabelas, matriz e gráfico. Produto novo em amadurecimento distorce a leitura de eficiência do galpão.`
              }
            >
              {ocultarMaturacao ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="tabular">{LINHAS_EM_MATURACAO.join(", ")}</span>
              <span className="font-normal opacity-70">{ocultarMaturacao ? "oculta" : "incluída"}</span>
            </Chip>
          </div>

          <p className="tabular text-2xs text-muted-foreground">
            {galpoesBanco
              .map((g) => `${g.nome}: ${(linhasGalpao.get(g.codPlp) ?? []).join(", ") || "sem registro no período"}`)
              .join("  ·  ")}
          </p>
        </CardContent>
      </Card>

      {avisoEmprestimo && !loading ? (
        <Alert variant="warning" title="Empréstimos de colaborador fora da conta">
          {avisoEmprestimo}
        </Alert>
      ) : null}

      {erro ? (
        <Alert variant="destructive" title={erro}>
          Nenhum número desta tela pôde ser apurado para o período.
        </Alert>
      ) : null}

      {/* ── 1. Estamos eficientes? Onde perdemos hora? ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label={`OPE — ${escopoAtual.label}`}
          value={tot.opePct == null ? DASH : pct(tot.opePct)}
          loading={loading}
          tone={tomTotal}
          detail={`atividades ÷ ponto · meta ${META_OPE}% · clique para auditar`}
          onClick={!loading && tot.opePct != null ? () => setAuditoriaKpi("ponto") : undefined}
        />
        <StatCard
          label="Horas de ponto"
          value={num(tot.ponto)}
          loading={loading}
          detail="batidas de ponto × 8 h por dia (AD_BATPONTO) · clique para ver os colaboradores"
          onClick={!loading && tot.ponto > 0 ? () => setAuditoriaKpi("ponto") : undefined}
        />
        <StatCard
          label="Horas extras"
          value={num(tot.horasExtras)}
          loading={loading}
          detail="AD_VAPUPONTO, mesmos dias do ponto — não entra no cálculo do OPE"
        />
        <StatCard
          label="Atividades"
          value={num(tot.ativ)}
          loading={loading}
          detail="horas apontadas em AD_APOAVANCO, sem retrabalho · clique para ver por barco"
          onClick={!loading && tot.ativ > 0 ? () => setAuditoriaKpi("ativ") : undefined}
        />
        <StatCard
          label="Pendências"
          value={num(tot.pend)}
          loading={loading}
          tone={tot.pend > 0 ? "danger" : undefined}
          detail="ponto − atividades − perdas: hora paga sem nenhum apontamento"
        />
        <StatCard
          label="Perdas (retrabalho)"
          value={num(tot.perdas)}
          loading={loading}
          tone={tot.perdas > 0 ? "warning" : undefined}
          detail="apontamentos marcados RETRABALHO — não entram no cálculo do OPE"
        />
      </div>

      {/* O número acima deixou de ser o da fábrica inteira. Sem dizer isso
          aqui, um print desta tela vira "o OPE do mês" numa conversa em que
          ninguém lembra que o filtro estava ligado. */}
      {ocultarMaturacao && (
        <Alert variant="warning" title={`${LINHAS_EM_MATURACAO.join(", ")} fora da conta`}>
          Em toda a tela: KPIs, tabelas, matriz, gráfico e exportação. É a eficiência do processo
          já maduro, não a da fábrica no período. Para o número que responde pela operação, volte a
          incluí-la.
        </Alert>
      )}

      {!loading && setoresAnomalos > 0 && (
        <Alert
          variant="warning"
          title={`${setoresAnomalos} ${setoresAnomalos === 1 ? "setor está" : "setores estão"} acima de 100%`}
        >
          Há mais hora apontada do que hora de ponto, o que não acontece na prática. Enquanto não for
          esclarecido, o total acima está superestimado e o OPE por setor não separa eficiência de
          desvio de mão de obra entre setores.
        </Alert>
      )}

      {/* Tabela e gráfico lado a lado: o acumulado do período e como se chegou nele. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <TabelaCard
            titulo={`Setores — ${escopoAtual.label}`}
            subtitulo={escopoAtual.codPlp == null ? undefined : faixaDe(linhasGalpao.get(escopoAtual.codPlp) ?? [])}
            linhas={setores}
            loading={loading}
            ini={periodo.ini}
            fim={periodo.fim}
            recorteBase={recorteEscopo}
            rotuloBase={rotuloEscopo}
          />

          {escopo === "geral" && (
            <MatrizSetorGalpao
              porGalpao={porGalpao}
              grupos={grupos}
              excluirLinhas={excluirLinhas}
              loading={loading}
              ini={periodo.ini}
              fim={periodo.fim}
              onDetalhe={setDetalheGeral}
            />
          )}
        </div>

        <div className="min-w-0">
          <GraficoCard
            titulo={`OPE diário — ${escopoAtual.label}`}
            filtro={filtroEscopo}
            grupos={gruposEscopo}
            dadosAtiv={dadosAtiv}
            dadosPonto={dadosPonto}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
