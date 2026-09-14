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
//  · os formatadores vêm de lib/formatDiretoria (ver o cabeçalho de lá).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
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

import { num, int, pct, signed, hoursHM, DASH } from "@/lib/formatDiretoria";
import { norm } from "@/lib/tabela";
import { dataOracle, isoLocal, parseData, type IsoRange } from "@/lib/datetime";
import {
  farolOpe,
  OPE_FAROL_CLS,
  opeTitulo,
  META_OPE,
  OPE_ANOMALIA,
} from "@/lib/opeConfig";
import { GALPOES, faixaDe } from "@/lib/galpoes";
import {
  getOpeDados,
  getPontoDetalhe,
  getAtivDetalhe,
  agregar,
  buildDailySeries,
  totaisOpe,
  type AggRow,
  type AtivDetalheRow,
  type DailyPoint,
  type PontoDetalheRow,
  type RawAtivRow,
  type RawPontoRow,
} from "@/services/opeService";
import {
  axisProps,
  chartSemantic,
  gridProps,
  tooltipProps,
} from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/tone";

import { exportTabela, slugArquivo, type ExportColumn } from "@/components/ui/table-export";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatCard } from "@/components/patterns/StatCard";

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

/** O galpão já com o filtro de maturação aplicado — `linhas` mutável. */
type GalpaoFiltrado = { id: string; label: string; linhas: string[] };

/**
 * Os galpões com as linhas em maturação removidas, quando pedido. O filtro vale
 * para a tela INTEIRA, não só para o escopo do galpão. Galpão que ficasse vazio
 * sai da lista.
 */
function galpoesVisiveis(ocultar: boolean): GalpaoFiltrado[] {
  return GALPOES.map((g) => ({
    id: g.id,
    label: g.label,
    linhas: ocultar ? g.linhas.filter((l) => !LINHAS_EM_MATURACAO.includes(l)) : [...g.linhas],
  })).filter((g) => g.linhas.length > 0);
}

/**
 * Escopo da tela: Geral e um por galpão. O Geral filtra por lista explícita (e
 * não `() => true`) porque, com linha oculta, "tudo" deixa de ser todas as
 * linhas do banco.
 */
function escoposDe(galpoes: GalpaoFiltrado[]) {
  const todas = galpoes.flatMap((g) => g.linhas);
  return [
    { id: "geral", label: "Geral", linhas: todas, fn: (l: string) => todas.includes(l) },
    ...galpoes.map((g) => ({
      id: g.id,
      label: g.label,
      linhas: g.linhas,
      fn: (l: string) => g.linhas.includes(l),
    })),
  ];
}

type EscopoId = string;

/* ── Opções de seleção dos gráficos ────────────────────────── */
const OPCOES_SETOR_GRAF = [
  { label: "Geral", sm: null as string | null },
  { label: "Acab.", sm: "ACAB" },
  { label: "Mont.", sm: "MONT" },
  { label: "Marc.", sm: "MARC" },
  { label: "Elét.", sm: "ELET" },
  { label: "Lam.", sm: "LAM" },
  { label: "Reb.", sm: "REB" },
];

/* ── Popup de detalhe de ponto ─────────────────────────────── */
function PontoDetalhePopup({
  titulo,
  ini,
  fim,
  linhasArr,
  setor,
  onClose,
}: {
  titulo: string;
  ini: string;
  fim: string;
  linhasArr: string[];
  setor: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PontoDetalheRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const chaveLinhas = linhasArr.join(",");
  useEffect(() => {
    setLoading(true);
    setErro(null);
    getPontoDetalhe(ini, fim, linhasArr, setor)
      .then((res) => setRows(res))
      .catch(() => setErro("Falha ao carregar detalhamento"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ini, fim, chaveLinhas, setor]);

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Detalhe — {titulo}</DialogTitle>
          <DialogDescription>
            {ini} até {fim}
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <Alert variant="destructive">{erro}</Alert>
        ) : (
          <div className="min-h-0 overflow-auto rounded-lg border border-border scrollbar-slim">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left">
                  <th className={TH}>Código</th>
                  <th className={TH}>Nome</th>
                  <th className={cn(TH, prioridadeCls(2))}>Departamento</th>
                  <th className={cn(TH, "text-right")}>Data</th>
                  <th className={cn(TH, "text-right")}>H. Extra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <SkeletonLinhas rows={8} cols={5} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className={cn(TD, "tabular")}>{r.codigo}</td>
                      <td className={cn(TD, "font-medium text-foreground")}>{r.nome}</td>
                      <td className={cn(TD, "text-muted-foreground", prioridadeCls(2))}>
                        {r.departamento}
                      </td>
                      <td className={cn(TD, "tabular text-right")}>{r.data}</td>
                      <td
                        className={cn(
                          TD,
                          "tabular text-right",
                          r.heHoras > 0 ? "text-warning" : "text-muted-foreground/70"
                        )}
                      >
                        {r.heHoras > 0 ? hoursHM(r.heHoras) : DASH}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !erro ? (
          <p className="text-2xs text-muted-foreground">{int(rows.length)} registros</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ── Drill-down de atividades ──────────────────────────────── */

/** Qual detalhe a célula clicada abre: quem bateu ponto, ou o que foi feito. */
type TipoDetalhe = "ponto" | "ativ";

/** Quantas linhas a tabela pinta de uma vez. A exportação leva sempre tudo. */
const ATIV_PAGINA = 300;
/** A partir daqui o arquivo demora a ser montado — avisa antes de clicar. */
const ATIV_PESADO = 2000;

type SortState = { col: string; dir: "asc" | "desc" } | null;

/** Coluna do drill-down: as de exportação, mais o valor de ordenação. */
type ColAtiv = ExportColumn<AtivDetalheRow> & {
  sortValue?: (r: AtivDetalheRow) => string | number;
};

/**
 * Atividades apontadas no recorte — o "de onde vem" da coluna Atividades.
 * A soma de Horas do rodapé fecha com o número do card clicado.
 */
function AtividadesDetalhePopup({
  titulo,
  ini,
  fim,
  linhasArr,
  setor,
  onClose,
}: {
  titulo: string;
  ini: string;
  fim: string;
  linhasArr: string[];
  setor: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AtivDetalheRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [limite, setLimite] = useState(ATIV_PAGINA);
  const [exportando, setExportando] = useState(false);

  const chaveLinhas = linhasArr.join(",");
  useEffect(() => {
    setLoading(true);
    setErro(null);
    getAtivDetalhe(ini, fim, linhasArr, setor)
      .then((res) => setRows(res))
      .catch(() => setErro("Falha ao carregar as atividades"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ini, fim, chaveLinhas, setor]);

  const columns = useMemo<ColAtiv[]>(
    () => [
      { id: "setorMacro", header: "Setor", accessor: (r) => r.setorMacro || DASH, priority: 2 },
      { id: "setor", header: "Equipe", accessor: (r) => r.setor || DASH, priority: 3 },
      { id: "linha", header: "Linha", accessor: (r) => r.linha || DASH },
      { id: "projeto", header: "Barco", accessor: (r) => r.projeto || DASH },
      {
        id: "codAtividade",
        header: "Cód. ativ.",
        accessor: (r) => r.codAtividade || DASH,
        priority: 3,
        sortValue: (r) => Number(r.codAtividade) || 0,
      },
      {
        id: "atividade",
        header: "Atividade",
        accessor: (r) => r.atividade || DASH,
        cell: (r) => <span className="font-medium text-foreground">{r.atividade || DASH}</span>,
      },
      /* Ordena pela data real, não pelo texto: "02/09" vem antes de "10/08" em
         ordem alfabética, e a coluna passaria a mentir sobre a cronologia. */
      {
        id: "data",
        header: "Data",
        accessor: (r) => r.data,
        align: "right",
        sortValue: (r) => parseData(r.data)?.getTime() ?? 0,
        cell: (r) => <span className="tabular text-muted-foreground">{r.data || DASH}</span>,
      },
      {
        id: "horas",
        header: "Horas",
        accessor: (r) => r.horas,
        align: "right",
        sortValue: (r) => r.horas,
        exportValue: (r) => r.horas,
        cell: (r) => <span className="tabular">{num(r.horas)}</span>,
      },
    ],
    []
  );

  /* Um campo só para toda a linha: quem chega aqui procura um barco ou o nome
     de uma atividade, não sabe em qual coluna o termo cai. */
  const filtradas = useMemo(() => {
    const termos = norm(busca).split(/\s+/).filter(Boolean);
    if (termos.length === 0) return rows;
    return rows.filter((r) => {
      const alvo = norm(
        [r.setorMacro, r.setor, r.linha, r.projeto, r.codAtividade, r.atividade, r.data].join(" ")
      );
      return termos.every((t) => alvo.includes(t));
    });
  }, [rows, busca]);

  const ordenadas = useMemo(() => {
    if (!sort) return filtradas;
    const col = columns.find((c) => c.id === sort.col);
    if (!col) return filtradas;
    const valor = col.sortValue ?? ((r: AtivDetalheRow) => String(col.accessor(r) ?? ""));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const va = valor(a),
        vb = valor(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [filtradas, sort, columns]);

  /* Pintar 5.000 linhas de uma vez trava o tablet por segundos. O corte é só
     de exibição — o rodapé conta o conjunto inteiro e o Excel leva tudo. */
  const visiveis = ordenadas.slice(0, limite);

  function handleSort(col: string) {
    setSort((s) =>
      s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  }

  /* Cede um frame ao React para pintar "Gerando..." antes do trabalho síncrono
     de montar o .xlsx, que segura a thread e congelaria a tela sem aviso. */
  async function exportar() {
    setExportando(true);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const stamp = `${ini}_${fim}`.replace(/\//g, "-");
      exportTabela(
        columns,
        ordenadas,
        `atividades_${slugArquivo(titulo)}_${stamp}.xlsx`,
        "Atividades"
      );
    } finally {
      setExportando(false);
    }
  }

  const totHoras = ordenadas.reduce((s, r) => s + r.horas, 0);
  /* Com barco e dia na linha, a mesma atividade repete — o distinto responde
     "quantas atividades diferentes rodaram". */
  const atividadesDistintas = useMemo(
    () => new Set(ordenadas.map((r) => `${r.codSetor}|${r.codAtividade}`)).size,
    [ordenadas]
  );
  const pesado = ordenadas.length > ATIV_PESADO;

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Atividades — {titulo}</DialogTitle>
          <DialogDescription>
            {ini} até {fim}
          </DialogDescription>
        </DialogHeader>

        {/* Erro nunca vira tabela vazia: sem isto, "sem dados" e "a consulta
            quebrou" ficam com a mesma cara na tela. */}
        {erro ? (
          <Alert variant="destructive" title={erro}>
            Nenhum número desta lista pôde ser apurado.
          </Alert>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setLimite(ATIV_PAGINA);
                }}
                placeholder="Filtrar por atividade, barco, equipe..."
                aria-label="Filtrar atividades"
                className="pl-9"
              />
            </div>

            <div className="min-h-0 max-h-[55vh] overflow-auto rounded-lg border border-border scrollbar-slim">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="text-left">
                    {columns.map((c) => {
                      const ativa = sort?.col === c.id;
                      const Icone = !ativa ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
                      return (
                        <th
                          key={c.id}
                          className={cn(TH, prioridadeCls(c.priority), c.align === "right" && "text-right")}
                          aria-sort={
                            ativa ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(c.id)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-sm uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              ativa && "text-foreground"
                            )}
                          >
                            {c.header}
                            <Icone className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <SkeletonLinhas rows={8} cols={columns.length} />
                  ) : visiveis.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        {busca
                          ? "Nenhuma atividade corresponde ao filtro."
                          : "Nenhuma atividade apontada neste recorte."}
                      </td>
                    </tr>
                  ) : (
                    visiveis.map((r, i) => (
                      <tr
                        key={`${r.codSetor}-${r.projeto}-${r.codAtividade}-${r.data}-${i}`}
                        className="hover:bg-muted/40"
                      >
                        {columns.map((c) => (
                          <td
                            key={c.id}
                            className={cn(TD, prioridadeCls(c.priority), c.align === "right" && "text-right")}
                          >
                            {c.cell ? c.cell(r) : c.accessor(r)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {visiveis.length < ordenadas.length && (
              <div className="flex items-center justify-center gap-3">
                <span className="tabular text-2xs text-muted-foreground">
                  {int(visiveis.length)} de {int(ordenadas.length)}
                </span>
                <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + ATIV_PAGINA)}>
                  Mostrar mais
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
            {erro ? (
              <span className="text-destructive">Nada a exportar: a consulta falhou.</span>
            ) : (
              <>
                <span>
                  Horas: <b className="tabular text-foreground">{num(totHoras)}</b>
                </span>
                <span aria-hidden>·</span>
                <span className="tabular">{int(ordenadas.length)} registros</span>
                <span aria-hidden>·</span>
                <span className="tabular">{int(atividadesDistintas)} atividades distintas</span>
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={exportar}
            disabled={loading || exportando || !!erro || ordenadas.length === 0}
            title={
              pesado
                ? "Muitos registros — a geração do arquivo pode demorar alguns instantes"
                : "Exporta todos os registros filtrados, não só as linhas exibidas"
            }
          >
            <Download className="h-4 w-4" />
            {exportando ? "Gerando Excel..." : "Exportar Excel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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

/* ── Mapas para o popup de detalhe de ponto ────────────────── */
const LABEL_TO_SETOR: Record<string, string> = {
  Acabamento: "ACAB",
  Montagem: "MONT",
  Marcenaria: "MARC",
  Elétrica: "ELET",
  Laminação: "LAM",
  Rebarba: "REB",
};

const OPE_LABEL_TO_LINHAS: Record<string, string[]> = Object.fromEntries(
  GALPOES.map((g) => [g.label, [...g.linhas]])
);

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
 */
function MatrizSetorGalpao({
  porGalpao,
  loading,
  ini,
  fim,
  onDetalhe,
}: {
  porGalpao: { label: string; subtitulo?: string; linhas: AggRow[]; linhasArr: string[] }[];
  loading: boolean;
  ini?: string;
  fim?: string;
  onDetalhe: (label: string, linhas: string[], setor: string | null) => void;
}) {
  const setoresLabels = porGalpao[0]?.linhas.map((l) => l.label) ?? [];

  const opeDe = (l?: AggRow) => (l && l.horasReg > 0 ? (l.horas / l.horasReg) * 100 : null);

  /* Total da coluna: soma as horas do galpão inteiro e divide — não é média
     dos setores, que daria peso igual a um setor de 8.000h e a outro de 900h. */
  const totalGalpao = (g: { linhas: AggRow[] }) => {
    const ativ = g.linhas.reduce((s, l) => s + l.horas, 0);
    const ponto = g.linhas.reduce((s, l) => s + l.horasReg, 0);
    return ponto > 0 ? (ativ / ponto) * 100 : null;
  };

  /* Total da linha: mesmo princípio, somando os três galpões daquele setor. */
  const totalSetor = (label: string) => {
    let ativ = 0,
      ponto = 0;
    for (const g of porGalpao) {
      const l = g.linhas.find((x) => x.label === label);
      if (l) {
        ativ += l.horas;
        ponto += l.horasReg;
      }
    }
    return ponto > 0 ? (ativ / ponto) * 100 : null;
  };

  const geral = (() => {
    let ativ = 0,
      ponto = 0;
    for (const g of porGalpao)
      for (const l of g.linhas) {
        ativ += l.horas;
        ponto += l.horasReg;
      }
    return ponto > 0 ? (ativ / ponto) * 100 : null;
  })();

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
              <SkeletonLinhas rows={6} cols={porGalpao.length + 2} />
            ) : (
              setoresLabels.map((label) => (
                <tr key={label} className="hover:bg-muted/40">
                  <td className={TD}>
                    {ini && fim && LABEL_TO_SETOR[label] ? (
                      <LinkDetalhe
                        title={`Ver colaboradores — ${label}`}
                        onClick={() =>
                          onDetalhe(label, porGalpao.flatMap((g) => g.linhasArr), LABEL_TO_SETOR[label])
                        }
                      >
                        {label}
                      </LinkDetalhe>
                    ) : (
                      label
                    )}
                  </td>
                  {porGalpao.map((g) => (
                    <td key={g.label} className={cn(TD, "tabular text-right")}>
                      <CelulaOpe valor={opeDe(g.linhas.find((x) => x.label === label))} />
                    </td>
                  ))}
                  <td className={cn(TD, "tabular text-right")}>
                    <CelulaOpe valor={totalSetor(label)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && (
            <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
              <tr>
                <td className={TD}>Total</td>
                {porGalpao.map((g) => (
                  <td key={g.label} className={cn(TD, "tabular text-right")}>
                    <CelulaOpe valor={totalGalpao(g)} />
                  </td>
                ))}
                <td className={cn(TD, "tabular text-right")}>
                  <CelulaOpe valor={geral} />
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
function TabelaCard({
  titulo,
  subtitulo,
  linhas,
  loading,
  ini,
  fim,
  linhasArr,
}: {
  titulo: string;
  /** Faixa de linhas do galpão, exibida junto do título. */
  subtitulo?: string;
  linhas: AggRow[];
  loading: boolean;
  ini?: string;
  fim?: string;
  linhasArr?: string[];
}) {
  const [detalhe, setDetalhe] = useState<{
    label: string;
    linhas: string[];
    setor: string | null;
    tipo: TipoDetalhe;
  } | null>(null);

  /** Recorte (linhas + setor) da linha clicada; `null` = não detalhável. */
  function recorteDaLinha(label: string): { linhas: string[]; setor: string | null } | null {
    if (!ini || !fim) return null;
    const opeLinhas = OPE_LABEL_TO_LINHAS[label];
    if (opeLinhas) return { linhas: opeLinhas, setor: null };
    if (linhasArr && LABEL_TO_SETOR[label]) return { linhas: linhasArr, setor: LABEL_TO_SETOR[label] };
    return null;
  }

  function abrirDetalhe(label: string, tipo: TipoDetalhe) {
    const recorte = recorteDaLinha(label);
    if (recorte) setDetalhe({ label, ...recorte, tipo });
  }

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
      {detalhe &&
        ini &&
        fim &&
        (detalhe.tipo === "ponto" ? (
          <PontoDetalhePopup
            titulo={`${titulo} — ${detalhe.label}`}
            ini={ini}
            fim={fim}
            linhasArr={detalhe.linhas}
            setor={detalhe.setor}
            onClose={() => setDetalhe(null)}
          />
        ) : (
          <AtividadesDetalhePopup
            titulo={`${titulo} — ${detalhe.label}`}
            ini={ini}
            fim={fim}
            linhasArr={detalhe.linhas}
            setor={detalhe.setor}
            onClose={() => setDetalhe(null)}
          />
        ))}
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
                  const isClickable = !!recorteDaLinha(l.label);
                  return (
                    <tr key={l.label} className="hover:bg-muted/40">
                      <td className={TD}>
                        {isClickable ? (
                          <LinkDetalhe
                            title={`Ver colaboradores — ${l.label}`}
                            onClick={() => abrirDetalhe(l.label, "ponto")}
                          >
                            {l.label}
                          </LinkDetalhe>
                        ) : (
                          l.label
                        )}
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(3))}>
                        <span className="font-semibold text-success">{num(l.horasReg)}</span>
                      </td>
                      {/* Atividades abre a lista que compõe o número. */}
                      <td className={cn(TD, "tabular text-right font-semibold")}>
                        {isClickable ? (
                          <LinkDetalhe
                            title={`Ver atividades — ${l.label}`}
                            onClick={() => abrirDetalhe(l.label, "ativ")}
                          >
                            {num(l.horas)}
                          </LinkDetalhe>
                        ) : (
                          num(l.horas)
                        )}
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                        <span className="font-semibold text-warning">
                          {hasLoss(l.horasRetrabalho) ? num(l.horasRetrabalho) : DASH}
                        </span>
                      </td>
                      <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                        <span className={cn("font-semibold", pendCls(pend))}>{fmtPend(pend)}</span>
                      </td>
                      <td className={cn(TD, "tabular text-right")}>
                        <CelulaOpe valor={opeDe(l.horas, l.horasReg)} />
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
                    <span className="text-success">{num(totPontoH)}</span>
                  </td>
                  <td className={cn(TD, "tabular text-right")}>{num(totAtivH)}</td>
                  <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                    <span className="text-warning">{hasLoss(totRetrabH) ? num(totRetrabH) : DASH}</span>
                  </td>
                  <td className={cn(TD, "tabular text-right", prioridadeCls(2))}>
                    <span className={pendCls(totPontoH - totAtivH - totRetrabH)}>
                      {fmtPend(totPontoH - totAtivH - totRetrabH)}
                    </span>
                  </td>
                  <td className={cn(TD, "tabular text-right")}>
                    <CelulaOpe valor={opeDe(totAtivH, totPontoH)} />
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
  filtroLinha,
  dadosAtiv,
  dadosPonto,
  loading,
}: {
  titulo: string;
  /** Filtro de linha do escopo selecionado na tela. */
  filtroLinha: (l: string) => boolean;
  dadosAtiv: RawAtivRow[];
  dadosPonto: RawPontoRow[];
  loading: boolean;
}) {
  const [selecionado, setSelecionado] = useState("Geral");

  const series = useMemo(() => {
    const opcao = OPCOES_SETOR_GRAF.find((o) => o.label === selecionado) ?? OPCOES_SETOR_GRAF[0];
    const fl = (r: { linha: string; setorMacro: string }) =>
      filtroLinha(r.linha) && (opcao.sm == null || r.setorMacro === opcao.sm);
    return buildDailySeries(dadosAtiv, dadosPonto, fl, fl);
  }, [dadosAtiv, dadosPonto, selecionado, filtroLinha]);

  return (
    <div className="flex flex-col gap-1.5">
      <Rotulo>{titulo}</Rotulo>
      <Card>
        <CardContent className="flex flex-col p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {OPCOES_SETOR_GRAF.map((o) => (
              <Chip key={o.label} ativo={selecionado === o.label} onClick={() => setSelecionado(o.label)}>
                {o.label}
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

  const [escopo, setEscopo] = useState<EscopoId>("geral");
  /* Começa desligado: o OPE cheio é o número real da fábrica. Ocultar é uma
     lente para analisar, e quem a liga precisa saber que ligou. */
  const [ocultarMaturacao, setOcultarMaturacao] = useState(false);
  /* Drill-down disparado pela matriz — o `TabelaCard` tem o seu próprio. */
  const [detalheGeral, setDetalheGeral] = useState<{
    label: string;
    linhas: string[];
    setor: string | null;
  } | null>(null);

  const [dadosAtiv, setDadosAtiv] = useState<RawAtivRow[]>([]);
  const [dadosPonto, setDadosPonto] = useState<RawPontoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Carga única da tela: 24 consultas. `reqId` descarta resposta de requisição
   * vencida — dois períodos aplicados em seguida não pintam a tela com o
   * anterior, se ele demorar mais para voltar.
   */
  useEffect(() => {
    if (!periodo.ini || !periodo.fim) return;
    const id = ++reqId.current;
    setLoading(true);
    setErro(null);
    getOpeDados(periodo.ini, periodo.fim)
      .then(({ ativos, pontos }) => {
        if (id !== reqId.current) return;
        setDadosAtiv(ativos);
        setDadosPonto(pontos);
      })
      .catch(() => {
        if (id === reqId.current) setErro("Falha ao carregar os dados");
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [periodo]);

  const galpoes = useMemo(() => galpoesVisiveis(ocultarMaturacao), [ocultarMaturacao]);
  const escopos = useMemo(() => escoposDe(galpoes), [galpoes]);

  const escopoAtual = escopos.find((e) => e.id === escopo) ?? escopos[0];
  const filtroEscopo = escopoAtual.fn;

  /** Setores do escopo selecionado. */
  const setores = useMemo(
    () => agregar(dadosAtiv, dadosPonto, filtroEscopo),
    [dadosAtiv, dadosPonto, filtroEscopo]
  );

  /** Setores × galpão, só na visão Geral. */
  const porGalpao = useMemo(() => {
    if (escopo !== "geral") return [];
    return galpoes.map((g) => ({
      label: g.label,
      subtitulo: faixaDe(g.linhas),
      linhas: agregar(dadosAtiv, dadosPonto, (l) => g.linhas.includes(l)),
      linhasArr: g.linhas,
    }));
  }, [dadosAtiv, dadosPonto, escopo, galpoes]);

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
        <PontoDetalhePopup
          titulo={detalheGeral.label}
          ini={periodo.ini}
          fim={periodo.fim}
          linhasArr={detalheGeral.linhas}
          setor={detalheGeral.setor}
          onClose={() => setDetalheGeral(null)}
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
                {e.id !== "geral" && (
                  <span className="tabular font-normal opacity-70">{faixaDe(e.linhas)}</span>
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
            {galpoes.map((g) => `${g.label}: ${g.linhas.join(", ")}`).join("  ·  ")}
          </p>
        </CardContent>
      </Card>

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
          detail={`atividades ÷ ponto · meta ${META_OPE}%`}
        />
        <StatCard
          label="Horas de ponto"
          value={num(tot.ponto)}
          loading={loading}
          detail="batidas de ponto × 8 h por dia (AD_BATPONTO)"
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
          detail="horas apontadas em AD_APOAVANCO, sem retrabalho"
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
            subtitulo={escopo === "geral" ? undefined : faixaDe(escopoAtual.linhas)}
            linhas={setores}
            loading={loading}
            ini={periodo.ini}
            fim={periodo.fim}
            linhasArr={escopoAtual.linhas}
          />

          {escopo === "geral" && (
            <MatrizSetorGalpao
              porGalpao={porGalpao}
              loading={loading}
              ini={periodo.ini}
              fim={periodo.fim}
              onDetalhe={(label, linhas, setor) => setDetalheGeral({ label, linhas, setor })}
            />
          )}
        </div>

        <div className="min-w-0">
          <GraficoCard
            titulo={`OPE diário — ${escopoAtual.label}`}
            filtroLinha={filtroEscopo}
            dadosAtiv={dadosAtiv}
            dadosPonto={dadosPonto}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
