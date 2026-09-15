// src/pages/ListaFaltasPage.tsx
// Lista de Faltas (materiais). Cópia da aba "faltas" da Gestão de Compras do
// painel-diretoria (painel-diretoria/src/pages/GestaoComprasPage.tsx, rota
// /compras/faltas). Lá a página tem quatro abas; aqui veio só esta.
//
// A LÓGICA está linha a linha igual à de lá: a consulta (services/comprasService),
// o farol por item, os indicadores, os tops, filtros, ordenação, exportação e os
// detalhes. Os dados são da empresa toda, como na diretoria.
//
// A INTERFACE foi portada para o design system deste projeto. Diferenças:
//  · a tabela é <table> simples; as colunas secundárias somem nos mesmos
//    breakpoints do `priority` de lá (2 = md, 3 = 2xl);
//  · RankedList saiu de dentro do render (lá era recriado a cada render, o que
//    desmonta a lista inteira) e os itens clicáveis viraram <button>;
//  · cabeçalhos ordenáveis são <button> com aria-sort;
//  · o Modal virou Dialog; os formatadores vêm de lib/formatDiretoria;
//  · a mensagem de erro passa por mensagemErro (sessão vencida não vira
//    "Falha ao carregar");
//  · a busca diz "produto ou chassi": lá dizia "ou fornecedor", mas o filtro
//    (igual ao de lá) nunca olhou o fornecedor.
//
// ACRÉSCIMOS DESTE PAINEL (não existem lá):
//  · visão "Por barco", a padrão: faltas agrupadas por linha e por barco
//    (chassi), com clique no barco abrindo os produtos dele. A visão "Por item"
//    é a tabela de lá. Os filtros (farol, busca, comprador) valem nas duas;
//  · a linha vem da coluna LINHA acrescentada à consulta (ver comprasService);
//  · os Tops foram para depois da tabela — para o supervisor, o barco vem primeiro;
//  · a exportação ganhou a coluna Linha.
import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";

import { getListaFaltas, type FaltaDetalheRow } from "@/services/comprasService";
import { exportXlsx } from "@/lib/xlsx";
import { date, int, num, DASH } from "@/lib/formatDiretoria";
import { MESES_CURTO } from "@/lib/datetime";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import {
  agruparPorLinhaEBarco,
  chassiDe,
  contar,
  getFarolRow,
  linhaDe,
  parseDateTs,
  type Contagem,
  type FarolStatus,
} from "@/lib/listaFaltas";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/PageHeader";
import { StatCard } from "@/components/patterns/StatCard";

/* ========================= HELPERS ========================= */

const MESES_PT = MESES_CURTO.slice(1);

/* Farol → classes. Literais completos: o Tailwind só gera o que aparece escrito. */
const FAROL_UI: Record<FarolStatus, {
  label: string; sub: string; dot: string; texto: string; borda: string; ativo: string;
}> = {
  vermelho: {
    label: "Sem pedido", sub: "sem ordem de compra",
    dot: "bg-destructive", texto: "text-destructive", borda: "border-l-destructive",
    ativo: "border-destructive/30 bg-destructive-subtle ring-2 ring-destructive/30",
  },
  amarelo: {
    label: "Atrasado", sub: "entrega após início da prod.",
    dot: "bg-warning", texto: "text-warning", borda: "border-l-warning",
    ativo: "border-warning/30 bg-warning-subtle ring-2 ring-warning/30",
  },
  verde: {
    label: "No prazo", sub: "entrega antes do início da prod.",
    dot: "bg-success", texto: "text-success", borda: "border-l-success",
    ativo: "border-success/30 bg-success-subtle ring-2 ring-success/30",
  },
};
const FAROIS: FarolStatus[] = ["vermelho", "amarelo", "verde"];

/* Colunas secundárias: mesmos breakpoints do `priority` da tabela da diretoria. */
const P2 = "hidden md:table-cell";
const P3 = "hidden 2xl:table-cell";

const TH = "whitespace-nowrap px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2 align-top";
const zebra = (i: number) => (i % 2 === 0 ? "" : "bg-muted/30");

type Sort = { col: string; dir: "asc" | "desc" } | null;

function SortTh({
  col, sort, onSort, align = "left", className, children,
}: {
  col: string; sort: Sort; onSort: (col: string) => void;
  align?: "left" | "right"; className?: string; children: React.ReactNode;
}) {
  const ativo = sort?.col === col;
  const Icone = !ativo ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(TH, align === "right" && "text-right", className)}
      aria-sort={ativo ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          ativo && "text-foreground"
        )}
      >
        {children}
        <Icone className={cn("h-3 w-3", !ativo && "opacity-40")} aria-hidden="true" />
      </button>
    </th>
  );
}

function PontoFarol({ farol, className }: { farol: FarolStatus; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", FAROL_UI[farol].dot, className)} />;
}

function LegendaFarol() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {FAROIS.map(f => (
        <span key={f} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <PontoFarol farol={f} /> {FAROL_UI[f].label}
        </span>
      ))}
    </div>
  );
}

type Top10Entry = { label: string; total: number; vermelho: number; amarelo: number; verde: number };

function RankedList({
  title, subtitle, data, maxVal, loading, unit, onItemClick,
}: {
  title: string;
  subtitle?: string;
  data: Top10Entry[];
  maxVal: number;
  loading: boolean;
  unit?: string;
  onItemClick?: (label: string) => void;
}) {
  return (
    <Card className="flex flex-col p-4">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mb-3 text-2xs text-muted-foreground">
        {subtitle ?? "por itens em falta (sem previsão + atraso primeiro)"}
      </p>
      <div className="mb-4"><LegendaFarol /></div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 rounded-full" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
          Sem dados para o período
        </div>
      ) : (
        <ol className="space-y-1">
          {data.map((e, i) => {
            const conteudo = (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm leading-tight" title={e.label}>
                    <span className="mr-1.5 tabular text-muted-foreground">{i + 1}.</span>
                    <span className={cn("font-semibold", onItemClick ? "text-primary" : "text-foreground")}>{e.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="tabular text-sm font-semibold text-foreground">{int(e.total)}</span>
                    <span className="text-2xs text-muted-foreground">{unit ?? "itens"}</span>
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {e.vermelho > 0 && (
                    <div className="h-full shrink-0 bg-destructive" style={{ width: `${(e.vermelho / maxVal) * 100}%` }} title={`Sem pedido: ${e.vermelho}`} />
                  )}
                  {e.amarelo > 0 && (
                    <div className="h-full shrink-0 bg-warning" style={{ width: `${(e.amarelo / maxVal) * 100}%` }} title={`Atrasado: ${e.amarelo}`} />
                  )}
                  {e.verde > 0 && (
                    <div className="h-full shrink-0 bg-success" style={{ width: `${(e.verde / maxVal) * 100}%` }} title={`No prazo: ${e.verde}`} />
                  )}
                </div>
              </>
            );
            return (
              <li key={i}>
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={() => onItemClick(e.label)}
                    className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {conteudo}
                  </button>
                ) : (
                  <div className="py-1.5">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Célula Produto: descrição + código (padrão de todas as tabelas da tela). */
function CelProduto({ r }: { r: { descrprod: string; codprod: number; kit?: number | null; prod_kit?: string } }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium leading-tight text-foreground">{r.descrprod || DASH}</span>
      {r.kit ? <span className="text-2xs leading-tight text-muted-foreground">Kit: {r.prod_kit || r.kit}</span> : null}
      <span className="text-2xs tabular text-muted-foreground">#{r.codprod}</span>
    </div>
  );
}

function Pedido({ r, semPedidoCls = "text-warning" }: { r: FaltaDetalheRow; semPedidoCls?: string }) {
  return r.nropedcompra ? (
    <span className="font-mono text-xs font-medium text-accent">#{r.nropedcompra}</span>
  ) : (
    <span className={cn("whitespace-nowrap text-xs font-medium", semPedidoCls)}>Sem pedido</span>
  );
}

function Vazio({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</td></tr>
  );
}

/* ========================= AGRUPAMENTO POR BARCO ========================= */

/** Barra empilhada do farol, proporcional ao total do próprio grupo. */
function BarraFarol({ c, className }: { c: Contagem; className?: string }) {
  const w = (v: number) => `${c.itens > 0 ? (v / c.itens) * 100 : 0}%`;
  return (
    <div
      className={cn("flex h-2 overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`Sem pedido ${c.vermelho}, atrasado ${c.amarelo}, no prazo ${c.verde}`}
    >
      {c.vermelho > 0 && <div className="h-full bg-destructive" style={{ width: w(c.vermelho) }} />}
      {c.amarelo > 0 && <div className="h-full bg-warning" style={{ width: w(c.amarelo) }} />}
      {c.verde > 0 && <div className="h-full bg-success" style={{ width: w(c.verde) }} />}
    </div>
  );
}

/** Número do farol: some quando é zero, para o olho ir direto ao que existe. */
function NumFarol({ v, cls }: { v: number; cls: string }) {
  return v > 0 ? <span className={cn("font-semibold", cls)}>{int(v)}</span> : <span className="text-muted-foreground/60">{DASH}</span>;
}

/* ========================= PÁGINA ========================= */
export default function ListaFaltasPage() {
  // Lista de falta
  const [faltaAno, setFaltaAno] = React.useState(() => new Date().getFullYear());
  const [faltaMes, setFaltaMes] = React.useState(() => new Date().getMonth() + 1);
  const [faltaRows, setFaltaRows] = React.useState<FaltaDetalheRow[]>([]);
  const [loadingFalta, setLoadingFalta] = React.useState(false);
  const [errFalta, setErrFalta] = React.useState<string | null>(null);

  // Carrega faltas sempre que ano ou mês mudar
  React.useEffect(() => {
    let alive = true;
    const loadFalta = async () => {
      setLoadingFalta(true); setErrFalta(null);
      try {
        const rows = await getListaFaltas(faltaAno, faltaMes);
        if (alive) setFaltaRows(rows);
      } catch (e: unknown) {
        if (alive) { setErrFalta(mensagemErro(e, "Falha ao carregar Lista de falta.")); setFaltaRows([]); }
      } finally { if (alive) setLoadingFalta(false); }
    };
    loadFalta();
    return () => { alive = false; };
  }, [faltaAno, faltaMes]);

  /* ========================= FILTROS LISTA FALTAS ========================= */
  const [faltaSearch, setFaltaSearch] = React.useState("");
  const [faltaComprador, setFaltaComprador] = React.useState("Todos");
  const [faltaFarolFiltro, setFaltaFarolFiltro] = React.useState<FarolStatus | null>(null);
  const [fornDetail, setFornDetail] = React.useState<string | null>(null);
  const [kpiDetailType, setKpiDetailType] = React.useState<"chassis" | "produtos" | "sempedido" | "necessidade" | null>(null);
  const [faltaSort, setFaltaSort] = React.useState<Sort>(null);
  const [visao, setVisao] = React.useState<"barco" | "item">("barco");
  const [linhasFechadas, setLinhasFechadas] = React.useState<Set<string>>(new Set());
  const [barcoAberto, setBarcoAberto] = React.useState<{ linha: string; chassi: string } | null>(null);

  const onFaltaSort = (col: string) =>
    setFaltaSort(p => (p?.col === col ? (p.dir === "asc" ? { col, dir: "desc" } : null) : { col, dir: "asc" }));

  const compradores = React.useMemo(() => {
    const set = new Set(faltaRows.map(r => r.apelido).filter(Boolean));
    return ["Todos", ...Array.from(set).sort()];
  }, [faltaRows]);

  const faltaFiltradas = React.useMemo(() => {
    return faltaRows.filter(r => {
      const matchComp = faltaComprador === "Todos" || r.apelido === faltaComprador;
      const q = faltaSearch.trim().toLowerCase();
      const matchSearch = !q || r.descrprod.toLowerCase().includes(q) || String(r.codprod).includes(q) || r.chassi.toLowerCase().includes(q);
      const matchFarol = !faltaFarolFiltro || getFarolRow(r) === faltaFarolFiltro;
      return matchComp && matchSearch && matchFarol;
    });
  }, [faltaRows, faltaComprador, faltaSearch, faltaFarolFiltro]);

  const faltaSorted = React.useMemo(() => {
    if (!faltaSort) return faltaFiltradas;
    const { col, dir } = faltaSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...faltaFiltradas].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (col) {
        case "chassi":       va = a.chassi || ""; vb = b.chassi || ""; break;
        case "descrprod":    va = a.descrprod || ""; vb = b.descrprod || ""; break;
        case "nomeparc":     va = a.nomeparc || ""; vb = b.nomeparc || ""; break;
        case "apelido":      va = a.apelido || ""; vb = b.apelido || ""; break;
        case "macrosetor":   va = a.macrosetor || ""; vb = b.macrosetor || ""; break;
        case "necessidade":  va = a.necessidade; vb = b.necessidade; break;
        case "comprapend":   va = a.comprapend; vb = b.comprapend; break;
        case "dtentregav":   va = parseDateTs(a.dtentregav || a.dtentradaped); vb = parseDateTs(b.dtentregav || b.dtentradaped); break;
        case "nropedcompra": va = a.nropedcompra ?? -1; vb = b.nropedcompra ?? -1; break;
        case "follow":       va = a.follow || ""; vb = b.follow || ""; break;
        default: return 0;
      }
      if (typeof va === "string") return mult * va.localeCompare(vb as string, "pt-BR");
      return mult * ((va as number) - (vb as number));
    });
  }, [faltaFiltradas, faltaSort]);

  // Exporta a tabela atual (filtrada + ordenada) para .xlsx
  const handleExportFaltasXlsx = React.useCallback(() => {
    const FAROL_LABEL: Record<FarolStatus, string> = {
      vermelho: "Sem pedido",
      amarelo: "Atrasado",
      verde: "No prazo",
    };
    const headers = [
      "Linha", "Chassi", "Cód. Produto", "Produto", "Fornecedor", "Comprador", "Macro Setor",
      "Necessidade", "Compra Pendente", "Prev. Entrega", "Pedido", "Situação", "Follow-up",
    ];
    const rows = faltaSorted.map(r => {
      const prev = r.dtentregav ? date(r.dtentregav) : (r.dtentradaped ? date(r.dtentradaped) : "");
      return [
        r.linha || "",
        r.chassi || "",
        r.codprod || "",
        r.descrprod || "",
        r.nomeparc || "",
        r.apelido || "",
        r.macrosetor || "",
        r.necessidade,
        r.comprapend,
        prev,
        r.nropedcompra ?? "",
        FAROL_LABEL[getFarolRow(r)],
        r.follow || "",
      ];
    });
    const nomeMes = MESES_PT[faltaMes - 1] ?? String(faltaMes);
    exportXlsx(`lista-de-faltas-${nomeMes}-${faltaAno}`, `Faltas ${nomeMes}-${faltaAno}`, headers, rows);
  }, [faltaSorted, faltaMes, faltaAno]);

  // KPIs
  const kpiFaltaProdutos = React.useMemo(
    () => new Set(faltaRows.map(r => r.codprod)).size,
    [faltaRows]
  );
  const kpiFaltaChassis = React.useMemo(
    () => new Set(faltaRows.map(r => r.chassi).filter(Boolean)).size,
    [faltaRows]
  );
  const kpiFaltaSemPedido = React.useMemo(
    () => new Set(faltaRows.filter(r => r.nropedcompra == null).map(r => r.codprod)).size,
    [faltaRows]
  );
  const kpiFaltaNecessidade = React.useMemo(
    () => faltaRows.length,
    [faltaRows]
  );

  const faltaFarolCounts = React.useMemo(() => {
    let vermelho = 0, amarelo = 0, verde = 0;
    for (const r of faltaRows) {
      const f = getFarolRow(r);
      if (f === "vermelho") vermelho++;
      else if (f === "amarelo") amarelo++;
      else verde++;
    }
    return { vermelho, amarelo, verde };
  }, [faltaRows]);

  // TOP 10 produtos — por quantidade de itens, com breakdown de farol
  const top10Produtos = React.useMemo((): Top10Entry[] => {
    const map = new Map<number, Top10Entry>();
    for (const r of faltaRows) {
      if (!map.has(r.codprod)) {
        const label = (r.descrprod || `#${r.codprod}`);
        map.set(r.codprod, { label, total: 0, vermelho: 0, amarelo: 0, verde: 0 });
      }
      const e = map.get(r.codprod)!;
      e.total += 1;
      e[getFarolRow(r)] += 1;
    }
    return Array.from(map.values())
      .sort((a, b) => (b.vermelho + b.amarelo) - (a.vermelho + a.amarelo) || b.total - a.total)
      .slice(0, 10)
      .map(d => ({ ...d, label: d.label.length > 40 ? d.label.slice(0, 38) + "…" : d.label }));
  }, [faltaRows]);

  // TOP 10 fornecedores — por produtos distintos em falta, pior farol por produto
  const top10Fornecedores = React.useMemo((): Top10Entry[] => {
    // forn -> codprod -> worst farol
    const map = new Map<string, Map<number, FarolStatus>>();
    for (const r of faltaRows) {
      const key = r.nomeparc || "Sem fornecedor";
      if (!map.has(key)) map.set(key, new Map());
      const prodMap = map.get(key)!;
      const rowFarol = getFarolRow(r);
      const existing = prodMap.get(r.codprod);
      if (!existing || rowFarol === "vermelho" || (rowFarol === "amarelo" && existing === "verde")) {
        prodMap.set(r.codprod, rowFarol);
      }
    }
    return Array.from(map.entries())
      .map(([key, prodMap]) => {
        let vermelho = 0, amarelo = 0, verde = 0;
        for (const f of prodMap.values()) {
          if (f === "vermelho") vermelho++;
          else if (f === "amarelo") amarelo++;
          else verde++;
        }
        // nome completo preservado — o truncamento é visual (CSS) e o popup precisa do nome exato
        return { label: key, total: prodMap.size, vermelho, amarelo, verde };
      })
      .sort((a, b) => (b.vermelho + b.amarelo) - (a.vermelho + a.amarelo) || b.total - a.total)
      .slice(0, 10);
  }, [faltaRows]);

  // Linhas de falta do fornecedor selecionado (popup do TOP 10)
  const fornDetailRows = React.useMemo(() => {
    if (!fornDetail) return [];
    return faltaRows
      .filter(r => (r.nomeparc || "Sem fornecedor") === fornDetail)
      .sort((a, b) => {
        const sev = (f: FarolStatus) => f === "vermelho" ? 0 : f === "amarelo" ? 1 : 2;
        return sev(getFarolRow(a)) - sev(getFarolRow(b)) || b.necessidade - a.necessidade;
      });
  }, [faltaRows, fornDetail]);

  // Detalhe KPI — chassis afetados
  const kpiChassisDetail = React.useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const r of faltaRows) {
      if (!r.chassi) continue;
      if (!map.has(r.chassi)) map.set(r.chassi, new Set());
      map.get(r.chassi)!.add(r.codprod);
    }
    return Array.from(map.entries())
      .map(([chassi, prods]) => ({ chassi, qtdProdutos: prods.size }))
      .sort((a, b) => b.qtdProdutos - a.qtdProdutos);
  }, [faltaRows]);

  // Detalhe KPI — produtos distintos em falta
  const kpiProdutosDetail = React.useMemo(() => {
    const map = new Map<number, { descrprod: string; chassis: Set<string>; necessidade: number; worstFarol: FarolStatus }>();
    for (const r of faltaRows) {
      if (!map.has(r.codprod)) map.set(r.codprod, { descrprod: r.descrprod, chassis: new Set(), necessidade: 0, worstFarol: "verde" });
      const e = map.get(r.codprod)!;
      if (r.chassi) e.chassis.add(r.chassi);
      e.necessidade += r.necessidade;
      const f = getFarolRow(r);
      if (f === "vermelho" || (f === "amarelo" && e.worstFarol === "verde")) e.worstFarol = f;
    }
    return Array.from(map.entries())
      .map(([codprod, e]) => ({ codprod, descrprod: e.descrprod, qtdChassis: e.chassis.size, necessidade: e.necessidade, worstFarol: e.worstFarol }))
      .sort((a, b) => b.qtdChassis - a.qtdChassis);
  }, [faltaRows]);

  // Detalhe KPI — sem pedido de compra
  const kpiSemPedidoDetail = React.useMemo(() =>
    faltaRows.filter(r => r.nropedcompra == null).sort((a, b) => b.necessidade - a.necessidade),
  [faltaRows]);

  // Detalhe KPI — necessidade por fornecedor
  const kpiNecessidadeDetail = React.useMemo(() => {
    const map = new Map<string, { necessidade: number; qtdItens: number }>();
    for (const r of faltaRows) {
      const key = r.nomeparc || "Sem fornecedor";
      if (!map.has(key)) map.set(key, { necessidade: 0, qtdItens: 0 });
      const e = map.get(key)!;
      e.necessidade += r.necessidade;
      e.qtdItens++;
    }
    return Array.from(map.entries())
      .map(([nomeparc, e]) => ({ nomeparc, ...e }))
      .sort((a, b) => b.necessidade - a.necessidade);
  }, [faltaRows]);

  // Visão por barco — respeita os filtros da tabela (farol, busca, comprador)
  const gruposLinha = React.useMemo(() => agruparPorLinhaEBarco(faltaFiltradas), [faltaFiltradas]);
  const totalGrupos = React.useMemo(() => contar(faltaFiltradas), [faltaFiltradas]);
  const qtdBarcos = gruposLinha.reduce((a, g) => a + g.barcos.length, 0);

  const alternarLinha = (linha: string) =>
    setLinhasFechadas(prev => {
      const next = new Set(prev);
      if (next.has(linha)) next.delete(linha); else next.add(linha);
      return next;
    });
  const todasFechadas = gruposLinha.length > 0 && gruposLinha.every(g => linhasFechadas.has(g.linha));

  // Produtos do barco clicado — também respeitam os filtros ativos
  const barcoRows = React.useMemo(() => {
    if (!barcoAberto) return [];
    const sev = (f: FarolStatus) => f === "vermelho" ? 0 : f === "amarelo" ? 1 : 2;
    return faltaFiltradas
      .filter(r => linhaDe(r) === barcoAberto.linha && chassiDe(r) === barcoAberto.chassi)
      .sort((a, b) => sev(getFarolRow(a)) - sev(getFarolRow(b)) || b.necessidade - a.necessidade);
  }, [faltaFiltradas, barcoAberto]);
  const barcoContagem = React.useMemo(() => contar(barcoRows), [barcoRows]);
  const filtroAtivo = faltaFiltradas.length !== faltaRows.length;

  const maxProd = top10Produtos[0]?.total || 1;
  const maxForn = top10Fornecedores[0]?.total || 1;
  const tituloKpi =
    kpiDetailType === "chassis"     ? `Chassis afetados (${kpiChassisDetail.length})` :
    kpiDetailType === "produtos"    ? `Produtos distintos em falta (${kpiProdutosDetail.length})` :
    kpiDetailType === "sempedido"   ? `Itens sem pedido de compra (${kpiSemPedidoDetail.length})` :
    kpiDetailType === "necessidade" ? "Necessidade total por fornecedor" : "";

  const caixaTabela = "overflow-auto rounded-md border border-border scrollbar-slim";
  const thead = "sticky top-0 z-10 bg-muted";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lista de Faltas"
        description="Compras — itens com saldo negativo no mês, por produto × chassi"
        actions={
          <>
            {faltaRows.length > 0 && <Badge variant="destructive">{int(faltaRows.length)} itens</Badge>}
            <div className="w-24">
              <Select value={faltaMes} onChange={e => setFaltaMes(Number(e.target.value))} aria-label="Mês">
                {MESES_PT.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="w-24">
              <Select value={faltaAno} onChange={e => setFaltaAno(Number(e.target.value))} aria-label="Ano">
                {[faltaAno - 1, faltaAno, faltaAno + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
          </>
        }
      />

      {errFalta && <Alert variant="destructive" title="Falha ao carregar">{errFalta}</Alert>}

      {/* KPI cards — clicáveis */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Produtos distintos" value={int(kpiFaltaProdutos)} loading={loadingFalta} detail="tipos de item na falta" onClick={() => setKpiDetailType("produtos")} />
        <StatCard label="Chassis afetados" value={int(kpiFaltaChassis)} tone="danger" loading={loadingFalta} detail="barcos com alguma falta" onClick={() => setKpiDetailType("chassis")} />
        <StatCard label="Sem pedido de compra" value={int(kpiFaltaSemPedido)} tone="warning" loading={loadingFalta} detail="produtos distintos sem O.C." onClick={() => setKpiDetailType("sempedido")} />
        <StatCard label="Total requisições" value={int(kpiFaltaNecessidade)} loading={loadingFalta} detail="linhas de falta no período" onClick={() => setKpiDetailType("necessidade")} />
      </div>

      {/* Cards de farol — filtram a tabela ao clicar */}
      {faltaRows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="group" aria-label="Filtrar por farol">
          {FAROIS.map(status => {
            const ui = FAROL_UI[status];
            const count = faltaFarolCounts[status];
            const active = faltaFarolFiltro === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => setFaltaFarolFiltro(f => f === status ? null : status)}
                className={cn(
                  "select-none rounded-xl border p-4 text-left shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? ui.ativo : "border-border bg-card hover:border-muted-foreground/40 hover:shadow-card"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PontoFarol farol={status} className="h-3 w-3" />
                    <span className={cn("truncate text-2xs font-medium uppercase tracking-wide", active ? ui.texto : "text-muted-foreground")}>
                      {ui.label}
                    </span>
                  </div>
                  {active && <Badge variant="outline" className="shrink-0">filtrado</Badge>}
                </div>
                <div className={cn("tabular text-2xl font-semibold leading-none", active ? ui.texto : "text-foreground")}>
                  {int(count)}
                </div>
                <div className={cn("mt-1 text-2xs", active ? ui.texto : "text-muted-foreground")}>{ui.sub}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", ui.dot)} style={{ width: `${faltaRows.length > 0 ? (count / faltaRows.length) * 100 : 0}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros da tabela */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex items-center gap-1.5" role="group" aria-label="Visão">
          <Chip ativo={visao === "barco"} onClick={() => setVisao("barco")}>Por barco</Chip>
          <Chip ativo={visao === "item"} onClick={() => setVisao("item")}>Por item</Chip>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar produto ou chassi…"
            aria-label="Buscar produto ou chassi"
            value={faltaSearch}
            onChange={e => setFaltaSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full max-w-[15rem] sm:w-auto">
          <Select value={faltaComprador} onChange={e => setFaltaComprador(e.target.value)} aria-label="Comprador">
            {compradores.map(c => <option key={c} value={c}>{c === "Todos" ? "Todos os compradores" : c}</option>)}
          </Select>
        </div>
        {faltaFarolFiltro && (
          <Button variant="outline" size="sm" onClick={() => setFaltaFarolFiltro(null)}>
            <X className="h-3.5 w-3.5" /> Limpar farol
          </Button>
        )}
        <span className="ml-1 text-xs tabular text-muted-foreground">
          {int(faltaFiltradas.length)} {faltaFiltradas.length === 1 ? "item" : "itens"}
          {faltaFiltradas.length !== faltaRows.length && ` de ${int(faltaRows.length)}`}
        </span>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={handleExportFaltasXlsx}
          disabled={faltaSorted.length === 0}
          title="Exportar a tabela atual (com os filtros aplicados) para Excel"
        >
          <Download className="h-4 w-4" /> Exportar XLSX
        </Button>
      </div>

      {/* Visão por barco: linha → barcos; clique no barco abre os produtos */}
      {visao === "barco" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Faltas por linha e barco</h3>
              <p className="text-2xs text-muted-foreground">
                {loadingFalta ? "Carregando…" : `${int(gruposLinha.length)} ${gruposLinha.length === 1 ? "linha" : "linhas"} · ${int(qtdBarcos)} ${qtdBarcos === 1 ? "barco" : "barcos"} · clique no barco para ver os produtos`}
                {filtroAtivo && !loadingFalta && " · com filtros aplicados"}
              </p>
            </div>
            {gruposLinha.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLinhasFechadas(todasFechadas ? new Set() : new Set(gruposLinha.map(g => g.linha)))}
              >
                {todasFechadas ? "Expandir todas" : "Recolher todas"}
              </Button>
            )}
          </div>
          <div className="max-h-[calc(100dvh-16rem)] overflow-auto scrollbar-slim">
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr className="border-b border-border">
                  <th className={TH}>Linha / Barco</th>
                  <th className={cn(TH, "text-right")}>Itens em falta</th>
                  <th className={cn(TH, P2, "text-right")}>Produtos</th>
                  <th className={cn(TH, "text-right")}>Sem pedido</th>
                  <th className={cn(TH, P2, "text-right")}>Atrasado</th>
                  <th className={cn(TH, P2, "text-right")}>No prazo</th>
                  <th className={cn(TH, P2, "w-40")}>Farol</th>
                </tr>
              </thead>
              <tbody>
                {loadingFalta ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className={zebra(i)}>
                      {Array.from({ length: 4 }).map((__, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>)}
                    </tr>
                  ))
                ) : gruposLinha.length === 0 ? (
                  <Vazio colSpan={7}>
                    {faltaRows.length === 0 ? "Nenhuma falta registrada no período selecionado." : "Nenhum resultado para os filtros aplicados."}
                  </Vazio>
                ) : (
                  gruposLinha.map(g => {
                    const aberta = !linhasFechadas.has(g.linha);
                    const Chevron = aberta ? ChevronDown : ChevronRight;
                    return (
                      <React.Fragment key={g.linha}>
                        <tr className="border-t border-border bg-muted/60 font-semibold text-foreground">
                          <td className={TD}>
                            <button
                              type="button"
                              onClick={() => alternarLinha(g.linha)}
                              aria-expanded={aberta}
                              className="inline-flex items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Chevron className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              {g.linha}
                              <span className="text-2xs font-normal text-muted-foreground">
                                {int(g.barcos.length)} {g.barcos.length === 1 ? "barco" : "barcos"}
                              </span>
                            </button>
                          </td>
                          <td className={cn(TD, "text-right tabular")}>{int(g.itens)}</td>
                          <td className={cn(TD, P2, "text-right tabular")}>{int(g.produtos)}</td>
                          <td className={cn(TD, "text-right tabular")}><NumFarol v={g.vermelho} cls="text-destructive" /></td>
                          <td className={cn(TD, P2, "text-right tabular")}><NumFarol v={g.amarelo} cls="text-warning" /></td>
                          <td className={cn(TD, P2, "text-right tabular")}><NumFarol v={g.verde} cls="text-success" /></td>
                          <td className={cn(TD, P2, "align-middle")}><BarraFarol c={g} /></td>
                        </tr>
                        {aberta && g.barcos.map(b => (
                          <tr
                            key={b.chave}
                            onClick={() => setBarcoAberto({ linha: b.linha, chassi: b.chassi })}
                            className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted"
                          >
                            <td className={cn(TD, "pl-9")}>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setBarcoAberto({ linha: b.linha, chassi: b.chassi }); }}
                                className="rounded-sm font-mono text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title="Ver produtos em falta"
                              >
                                {b.chassi}
                              </button>
                            </td>
                            <td className={cn(TD, "text-right font-semibold tabular text-foreground")}>{int(b.itens)}</td>
                            <td className={cn(TD, P2, "text-right tabular text-muted-foreground")}>{int(b.produtos)}</td>
                            <td className={cn(TD, "text-right tabular")}><NumFarol v={b.vermelho} cls="text-destructive" /></td>
                            <td className={cn(TD, P2, "text-right tabular")}><NumFarol v={b.amarelo} cls="text-warning" /></td>
                            <td className={cn(TD, P2, "text-right tabular")}><NumFarol v={b.verde} cls="text-success" /></td>
                            <td className={cn(TD, P2, "align-middle")}><BarraFarol c={b} /></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {!loadingFalta && gruposLinha.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                    <td className={TD}>Total — {int(qtdBarcos)} {qtdBarcos === 1 ? "barco" : "barcos"}</td>
                    <td className={cn(TD, "text-right tabular")}>{int(totalGrupos.itens)}</td>
                    <td className={cn(TD, P2, "text-right tabular")}>{int(totalGrupos.produtos)}</td>
                    <td className={cn(TD, "text-right tabular text-destructive")}>{int(totalGrupos.vermelho)}</td>
                    <td className={cn(TD, P2, "text-right tabular text-warning")}>{int(totalGrupos.amarelo)}</td>
                    <td className={cn(TD, P2, "text-right tabular text-success")}>{int(totalGrupos.verde)}</td>
                    <td className={cn(TD, P2, "align-middle")}><BarraFarol c={totalGrupos} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* Tabela detalhada — 10 colunas; as secundárias entram por breakpoint */}
      {visao === "item" && (
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100dvh-20rem)] overflow-auto scrollbar-slim">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className={thead}>
              <tr className="border-b border-border">
                <SortTh col="chassi"       sort={faltaSort} onSort={onFaltaSort}>Chassi</SortTh>
                <SortTh col="descrprod"    sort={faltaSort} onSort={onFaltaSort}>Produto</SortTh>
                <SortTh col="nomeparc"     sort={faltaSort} onSort={onFaltaSort} className={P2}>Fornecedor</SortTh>
                <SortTh col="apelido"      sort={faltaSort} onSort={onFaltaSort} className={P2}>Comprador</SortTh>
                <SortTh col="macrosetor"   sort={faltaSort} onSort={onFaltaSort} className={P3}>Macro Setor</SortTh>
                <SortTh col="necessidade"  sort={faltaSort} onSort={onFaltaSort} align="right">Necessidade</SortTh>
                <SortTh col="comprapend"   sort={faltaSort} onSort={onFaltaSort} align="right" className={P2}>Compra Pend.</SortTh>
                <SortTh col="dtentregav"   sort={faltaSort} onSort={onFaltaSort} align="right">Prev. Entrega</SortTh>
                <SortTh col="nropedcompra" sort={faltaSort} onSort={onFaltaSort} align="right" className={P2}>Pedido</SortTh>
                <SortTh col="follow"       sort={faltaSort} onSort={onFaltaSort} className={P3}>Follow-up</SortTh>
              </tr>
            </thead>
            <tbody>
              {loadingFalta ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className={zebra(i)}>
                    {Array.from({ length: 4 }).map((__, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>)}
                  </tr>
                ))
              ) : faltaFiltradas.length === 0 ? (
                <Vazio colSpan={10}>
                  {faltaRows.length === 0 ? "Nenhuma falta registrada no período selecionado." : "Nenhum resultado para os filtros aplicados."}
                </Vazio>
              ) : (
                faltaSorted.map((r, i) => {
                  const farol = getFarolRow(r);
                  return (
                    <tr key={i} className={cn("border-l-2 border-t border-t-border/60 hover:bg-muted", FAROL_UI[farol].borda, zebra(i))} title={FAROL_UI[farol].label}>
                      <td className={cn(TD, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>{r.chassi || DASH}</td>
                      <td className={TD}><CelProduto r={r} /></td>
                      <td className={cn(TD, P2, "text-xs text-muted-foreground")}>{r.nomeparc || DASH}</td>
                      <td className={cn(TD, P2)}><Badge variant="muted">{r.apelido || DASH}</Badge></td>
                      <td className={cn(TD, P3, "text-xs text-muted-foreground")}>{r.macrosetor || DASH}</td>
                      <td className={cn(TD, "text-right font-semibold tabular text-destructive")}>{num(r.necessidade, { decimals: 2 })}</td>
                      <td className={cn(TD, P2, "text-right tabular")}>
                        <span className={cn("text-xs font-medium", r.comprapend > 0 ? "text-success" : "text-muted-foreground")}>
                          {r.comprapend > 0 ? int(r.comprapend) : DASH}
                        </span>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap text-right text-xs tabular text-muted-foreground")}>{date(r.dtentregav) || date(r.dtentradaped) || DASH}</td>
                      <td className={cn(TD, P2, "text-right")}><Pedido r={r} /></td>
                      <td className={cn(TD, P3)}>
                        {r.follow ? (
                          <span className="line-clamp-2 max-w-[11.25rem] text-2xs leading-tight text-muted-foreground" title={r.follow}>{r.follow}</span>
                        ) : (
                          <span className="text-2xs text-muted-foreground">{DASH}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loadingFalta && faltaFiltradas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                  {/* colSpan só cobre colunas sempre visíveis — não desalinha nos breakpoints */}
                  <td className={TD} colSpan={2}>Total — {int(faltaFiltradas.length)} itens</td>
                  <td className={cn(TD, P2)} />
                  <td className={cn(TD, P2)} />
                  <td className={cn(TD, P3)} />
                  <td className={cn(TD, "text-right tabular text-destructive")}>
                    {num(faltaFiltradas.reduce((s, r) => s + r.necessidade, 0), { decimals: 2 })}
                  </td>
                  <td className={cn(TD, P2, "text-right tabular text-success")}>
                    {int(faltaFiltradas.reduce((s, r) => s + r.comprapend, 0))}
                  </td>
                  <td className={TD} />
                  <td className={cn(TD, P2)} />
                  <td className={cn(TD, P3)} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
      )}

      {/* TOP 10 Produtos + TOP 10 Fornecedores */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RankedList title="Top 10 produtos" data={top10Produtos} maxVal={maxProd} loading={loadingFalta} />
        <RankedList
          title="Top 10 fornecedores"
          subtitle="por produtos distintos em falta (clique para ver as faltas)"
          data={top10Fornecedores}
          maxVal={maxForn}
          loading={loadingFalta}
          unit="produtos"
          onItemClick={label => setFornDetail(label)}
        />
      </div>

      {/* MODAL: Produtos em falta do barco (visão por barco) */}
      <Dialog open={barcoAberto !== null} onOpenChange={v => { if (!v) setBarcoAberto(null); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {barcoAberto ? `Barco ${barcoAberto.chassi} · ${barcoAberto.linha} — ${int(barcoRows.length)} ${barcoRows.length === 1 ? "item" : "itens"} em falta` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {FAROIS.map(f => (
              <span key={f} className="flex items-center gap-1.5 text-muted-foreground">
                <PontoFarol farol={f} /> {FAROL_UI[f].label}: <b className="tabular text-foreground">{int(barcoContagem[f])}</b>
              </span>
            ))}
            <span className="text-muted-foreground">· {int(barcoContagem.produtos)} {barcoContagem.produtos === 1 ? "produto" : "produtos"}</span>
            {filtroAtivo && <Badge variant="outline">com filtros aplicados</Badge>}
          </div>
          <div className={cn(caixaTabela, "max-h-[65dvh]")}>
            <table className="w-full min-w-[34rem] text-sm">
              <thead className={thead}>
                <tr className="border-b border-border">
                  <th className={TH}>Produto</th>
                  <th className={cn(TH, P2)}>Fornecedor</th>
                  <th className={cn(TH, P3)}>Comprador</th>
                  <th className={cn(TH, "text-right")}>Necessidade</th>
                  <th className={cn(TH, P2, "text-right")}>Compra Pend.</th>
                  <th className={cn(TH, "text-right")}>Prev. Entrega</th>
                  <th className={cn(TH, "text-right")}>Pedido</th>
                </tr>
              </thead>
              <tbody>
                {barcoRows.length === 0 ? (
                  <Vazio colSpan={7}>Sem faltas para este barco.</Vazio>
                ) : barcoRows.map((r, i) => {
                  const farol = getFarolRow(r);
                  return (
                    <tr key={i} className={cn("border-l-2 border-t border-t-border/60 hover:bg-muted", FAROL_UI[farol].borda, zebra(i))} title={FAROL_UI[farol].label}>
                      <td className={TD}><CelProduto r={r} /></td>
                      <td className={cn(TD, P2, "text-xs text-muted-foreground")}>{r.nomeparc || DASH}</td>
                      <td className={cn(TD, P3)}><Badge variant="muted">{r.apelido || DASH}</Badge></td>
                      <td className={cn(TD, "text-right font-semibold tabular")}>{num(r.necessidade, { decimals: 2 })}</td>
                      <td className={cn(TD, P2, "text-right tabular")}>
                        <span className={cn("text-xs font-medium", r.comprapend > 0 ? "text-success" : "text-muted-foreground")}>
                          {r.comprapend > 0 ? int(r.comprapend) : DASH}
                        </span>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap text-right text-xs tabular text-muted-foreground")}>{date(r.dtentregav) || date(r.dtentradaped) || DASH}</td>
                      <td className={cn(TD, "text-right")}><Pedido r={r} semPedidoCls="text-destructive" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Faltas do fornecedor (TOP 10) */}
      <Dialog open={fornDetail !== null} onOpenChange={v => { if (!v) setFornDetail(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Faltas do fornecedor — ${fornDetail ?? ""} (${fornDetailRows.length})`}</DialogTitle>
          </DialogHeader>
          {(() => {
            let vermelho = 0, amarelo = 0, verde = 0;
            for (const r of fornDetailRows) {
              const f = getFarolRow(r);
              if (f === "vermelho") vermelho++;
              else if (f === "amarelo") amarelo++;
              else verde++;
            }
            const cont: Record<FarolStatus, number> = { vermelho, amarelo, verde };
            return (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {FAROIS.map(f => (
                  <span key={f} className="flex items-center gap-1.5 text-muted-foreground">
                    <PontoFarol farol={f} /> {FAROL_UI[f].label}: <b className="tabular text-foreground">{int(cont[f])}</b>
                  </span>
                ))}
              </div>
            );
          })()}
          <div className={cn(caixaTabela, "max-h-[60dvh]")}>
            <table className="w-full min-w-[30rem] text-sm">
              <thead className={thead}>
                <tr className="border-b border-border">
                  <th className={TH}>Produto</th>
                  <th className={TH}>Chassi</th>
                  <th className={cn(TH, P2)}>Comprador</th>
                  <th className={cn(TH, "text-right")}>Necessidade</th>
                  <th className={cn(TH, P2, "text-right")}>Prev. Entrega</th>
                  <th className={cn(TH, "text-right")}>Pedido</th>
                </tr>
              </thead>
              <tbody>
                {fornDetailRows.length === 0 ? (
                  <Vazio colSpan={6}>Sem faltas para este fornecedor.</Vazio>
                ) : fornDetailRows.map((r, i) => (
                  <tr key={i} className={cn("border-l-2 border-t border-t-border/60 hover:bg-muted", FAROL_UI[getFarolRow(r)].borda, zebra(i))}>
                    <td className={TD}><CelProduto r={{ descrprod: r.descrprod, codprod: r.codprod }} /></td>
                    <td className={cn(TD, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>{r.chassi || DASH}</td>
                    <td className={cn(TD, P2)}><Badge variant="muted">{r.apelido || DASH}</Badge></td>
                    <td className={cn(TD, "text-right font-semibold tabular")}>{num(r.necessidade, { decimals: 2 })}</td>
                    <td className={cn(TD, P2, "whitespace-nowrap text-right text-xs tabular")}>{date(r.dtentregav || r.dtentradaped)}</td>
                    <td className={cn(TD, "text-right")}><Pedido r={r} semPedidoCls="text-destructive" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Detalhe KPI faltas */}
      <Dialog open={kpiDetailType !== null} onOpenChange={v => { if (!v) setKpiDetailType(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tituloKpi}</DialogTitle>
          </DialogHeader>

          {/* ── Chassis afetados ── */}
          {kpiDetailType === "chassis" && (
            <div className={cn(caixaTabela, "max-h-[65dvh]")}>
              <table className="w-full text-sm">
                <thead className={thead}>
                  <tr className="border-b border-border">
                    <th className={TH}>Chassi</th>
                    <th className={cn(TH, "text-right")}>Produtos distintos em falta</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiChassisDetail.length === 0 ? (
                    <Vazio colSpan={2}>Sem dados.</Vazio>
                  ) : kpiChassisDetail.map((r, i) => (
                    <tr key={i} className={cn("border-t border-border/60", zebra(i))}>
                      <td className={cn(TD, "whitespace-nowrap font-mono text-muted-foreground")}>{r.chassi}</td>
                      <td className={cn(TD, "text-right tabular")}>
                        <span className="font-semibold text-foreground">{int(r.qtdProdutos)}</span>
                        <span className="ml-1 text-2xs text-muted-foreground">produto{r.qtdProdutos !== 1 ? "s" : ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Produtos distintos ── */}
          {kpiDetailType === "produtos" && (
            <div className={cn(caixaTabela, "max-h-[65dvh]")}>
              <table className="w-full min-w-[26rem] text-sm">
                <thead className={thead}>
                  <tr className="border-b border-border">
                    <th className={TH}>Produto</th>
                    <th className={cn(TH, P2, "text-right")}>Chassis afetados</th>
                    <th className={cn(TH, "text-right")}>Necessidade total</th>
                    <th className={cn(TH, "text-center")}>Farol</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiProdutosDetail.length === 0 ? (
                    <Vazio colSpan={4}>Sem dados.</Vazio>
                  ) : kpiProdutosDetail.map((r, i) => {
                    const dotLabel = FAROL_UI[r.worstFarol].label;
                    return (
                      <tr key={i} className={cn("border-t border-border/60", zebra(i))}>
                        <td className={TD}><CelProduto r={r} /></td>
                        <td className={cn(TD, P2, "text-right font-semibold tabular")}>{int(r.qtdChassis)}</td>
                        <td className={cn(TD, "text-right tabular text-muted-foreground")}>{num(r.necessidade, { decimals: 2 })}</td>
                        <td className={cn(TD, "text-center")}>
                          <span className={cn("inline-block h-3 w-3 rounded-full", FAROL_UI[r.worstFarol].dot)} role="img" aria-label={dotLabel} title={dotLabel} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Sem pedido de compra ── */}
          {kpiDetailType === "sempedido" && (
            <div className={cn(caixaTabela, "max-h-[65dvh]")}>
              <table className="w-full min-w-[26rem] text-sm">
                <thead className={thead}>
                  <tr className="border-b border-border">
                    <th className={TH}>Produto</th>
                    <th className={TH}>Chassi</th>
                    <th className={cn(TH, P2)}>Fornecedor</th>
                    <th className={cn(TH, "text-right")}>Necessidade</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiSemPedidoDetail.length === 0 ? (
                    <Vazio colSpan={4}>Sem dados.</Vazio>
                  ) : kpiSemPedidoDetail.map((r, i) => (
                    <tr key={i} className={cn("border-l-2 border-l-destructive border-t border-t-border/60", zebra(i))}>
                      <td className={TD}><CelProduto r={{ descrprod: r.descrprod, codprod: r.codprod }} /></td>
                      <td className={cn(TD, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>{r.chassi || DASH}</td>
                      <td className={cn(TD, P2, "text-xs text-muted-foreground")}>{r.nomeparc || DASH}</td>
                      <td className={cn(TD, "text-right font-semibold tabular text-warning")}>{num(r.necessidade, { decimals: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Necessidade por fornecedor ── */}
          {kpiDetailType === "necessidade" && (
            <div className={cn(caixaTabela, "max-h-[65dvh]")}>
              <table className="w-full text-sm">
                <thead className={thead}>
                  <tr className="border-b border-border">
                    <th className={TH}>Fornecedor</th>
                    <th className={cn(TH, P2, "text-right")}>Qtd itens</th>
                    <th className={cn(TH, "text-right")}>Necessidade total</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiNecessidadeDetail.length === 0 ? (
                    <Vazio colSpan={3}>Sem dados.</Vazio>
                  ) : kpiNecessidadeDetail.map((r, i) => (
                    <tr key={i} className={cn("border-t border-border/60", zebra(i))}>
                      <td className={cn(TD, "font-medium")}>{r.nomeparc}</td>
                      <td className={cn(TD, P2, "text-right tabular text-muted-foreground")}>{int(r.qtdItens)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular")}>{num(r.necessidade, { decimals: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
