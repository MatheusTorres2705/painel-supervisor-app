// src/components/ope/OpeAuditoriaDialog.tsx
// Auditoria de um número do OPE: de onde vêm as horas de PONTO (colaboradores)
// e as de ATIVIDADES (barcos, com o avanço do cronograma). Substitui os popups
// de lista crua da tela OPE e é o drill do card OPE do Dashboard.
//
// Os dados são os mesmos dos popups (getPontoDetalhe / getAtivDetalhe, que
// partem das mesmas bases do agregado). O que a auditoria acrescenta:
//  · agrupamento — um colaborador por linha, um barco por linha, com drill;
//  · conferência — a soma do detalhe contra o número do card clicado;
//  · avanço do cronograma do barco (getOpsAvanco, regra de Atividades / OP);
//  · aba de PERDAS: o mesmo detalhe por barco, só com o que foi apontado como
//    retrabalho (getAtivDetalhe com apenasRetrabalho) — o que a coluna Perdas soma.
import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Download, Search } from "lucide-react";

import {
  getAtivDetalhe,
  getPontoDetalhe,
  type AtivDetalheRow,
  type PontoDetalheRow,
} from "@/services/opeService";
import { getOpsAvanco } from "@/services/opsService";
import {
  MAX_MESES_AVANCO,
  atividadesPorBarco,
  avancoPorBarco,
  conferencia,
  mesesDoPeriodo,
  pontoPorColaborador,
  type AvancoBarco,
  type BarcoAtividades,
  type ColaboradorPonto,
  type Conferencia,
} from "@/lib/opeAuditoria";
import { DASH, hoursHM, int, num, pct } from "@/lib/formatDiretoria";
import { norm } from "@/lib/tabela";
import { farolOpe, META_OPE, OPE_FAROL_CLS } from "@/lib/opeConfig";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { cn } from "@/lib/utils";
import { exportTabela, slugArquivo, type ExportColumn } from "@/components/ui/table-export";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export type TotaisAuditoria = { ponto: number; ativ: number; perdas: number; opePct: number | null };
export type AbaAuditoria = "ponto" | "ativ" | "perdas";
type Aba = AbaAuditoria;

const TH = "whitespace-nowrap px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2 align-top";

type Carga<T> = { rows: T[]; loading: boolean; erro: string | null; feito: boolean };
const cargaInicial = <T,>(): Carga<T> => ({ rows: [], loading: false, erro: null, feito: false });

/* ── Peças comuns ────────────────────────────────────────────── */

type Ordem<C extends string> = { col: C; dir: "asc" | "desc" };

function ThOrdem<C extends string>({
  col, ordem, onOrdem, children, className,
}: {
  col: C; ordem: Ordem<C>; onOrdem: (o: Ordem<C>) => void; children: React.ReactNode; className?: string;
}) {
  const ativa = ordem.col === col;
  const Icone = !ativa ? ArrowUpDown : ordem.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn(TH, className)} aria-sort={ativa ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onOrdem({ col, dir: ativa && ordem.dir === "desc" ? "asc" : "desc" })}
        className={cn("inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", ativa && "text-foreground")}
      >
        {children}
        <Icone className={cn("h-3 w-3", !ativa && "opacity-40")} aria-hidden="true" />
      </button>
    </th>
  );
}

function Busca({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
    </div>
  );
}

function LinhasEsqueleto({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={cols} className="px-3 py-2"><Skeleton className="h-5" /></td>
        </tr>
      ))}
    </>
  );
}

/** Selo da conferência do detalhe contra o card. */
function SeloConferencia({ c, unidade, explicacao }: { c: Conferencia | null; unidade: string; explicacao: string }) {
  if (!c) return null;
  return c.confere ? (
    <Badge variant="success" title={`Soma do detalhe ${num(c.soma)} ${unidade} = card ${num(c.total)} ${unidade}`}>
      confere com o card ({num(c.total)} {unidade})
    </Badge>
  ) : (
    <Badge variant="warning" title={explicacao}>
      difere {c.diferenca > 0 ? "+" : "−"}{num(Math.abs(c.diferenca))} {unidade} do card ({num(c.total)} {unidade})
    </Badge>
  );
}

/* ── Aba Ponto ───────────────────────────────────────────────── */

type ColPonto = "nome" | "dias" | "horas" | "he";

function AbaPonto({ carga, totalCard, arquivo }: { carga: Carga<PontoDetalheRow>; totalCard?: number; arquivo: string }) {
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<Ordem<ColPonto>>({ col: "horas", dir: "desc" });
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());

  const colaboradores = React.useMemo(() => pontoPorColaborador(carga.rows), [carga.rows]);
  const lista = React.useMemo(() => {
    const termos = norm(busca).split(/\s+/).filter(Boolean);
    const filtrada = termos.length
      ? colaboradores.filter((c) => termos.every((t) => norm(`${c.codigo} ${c.nome} ${c.departamentos.join(" ")}`).includes(t)))
      : colaboradores;
    const m = ordem.dir === "asc" ? 1 : -1;
    const v = (c: ColaboradorPonto) => (ordem.col === "nome" ? c.nome : ordem.col === "dias" ? c.qtdDias : ordem.col === "he" ? c.heHoras : c.horasPonto);
    return [...filtrada].sort((a, b) => {
      const va = v(a), vb = v(b);
      return typeof va === "number" && typeof vb === "number" ? m * (va - vb) || a.nome.localeCompare(b.nome, "pt-BR") : m * String(va).localeCompare(String(vb), "pt-BR");
    });
  }, [colaboradores, busca, ordem]);

  const somaHoras = colaboradores.reduce((s, c) => s + c.horasPonto, 0);
  const somaDias = colaboradores.reduce((s, c) => s + c.qtdDias, 0);
  const somaHe = colaboradores.reduce((s, c) => s + c.heHoras, 0);
  const conf = carga.feito && !carga.erro ? conferencia(somaHoras, totalCard) : null;

  const colunas: ExportColumn<ColaboradorPonto>[] = [
    { id: "codigo", header: "Código", accessor: (c) => c.codigo },
    { id: "nome", header: "Colaborador", accessor: (c) => c.nome },
    { id: "departamento", header: "Departamento", accessor: (c) => c.departamentos.join(" / ") },
    { id: "dias", header: "Dias com ponto", accessor: (c) => c.qtdDias },
    { id: "horas", header: "Horas de ponto", accessor: (c) => c.horasPonto },
    { id: "he", header: "Hora extra (h)", accessor: (c) => Number(c.heHoras.toFixed(2)) },
    { id: "primeiro", header: "Primeiro dia", accessor: (c) => c.primeiroDia },
    { id: "ultimo", header: "Último dia", accessor: (c) => c.ultimoDia },
  ];

  const alternar = (k: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  if (carga.erro) {
    return <Alert variant="destructive" title="Não foi possível carregar o ponto">{carga.erro}</Alert>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Busca value={busca} onChange={setBusca} placeholder="Filtrar colaborador ou departamento…" />
      <div className="min-h-0 max-h-[52vh] overflow-auto rounded-lg border border-border scrollbar-slim">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <ThOrdem col="nome" ordem={ordem} onOrdem={setOrdem}>Colaborador</ThOrdem>
              <th className={cn(TH, "hidden md:table-cell")}>Departamento</th>
              <ThOrdem col="dias" ordem={ordem} onOrdem={setOrdem} className="text-right">Dias</ThOrdem>
              <ThOrdem col="horas" ordem={ordem} onOrdem={setOrdem} className="text-right">Horas de ponto</ThOrdem>
              <ThOrdem col="he" ordem={ordem} onOrdem={setOrdem} className="text-right">H. extra</ThOrdem>
              <th className={cn(TH, "hidden text-right sm:table-cell")}>Período</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {carga.loading ? (
              <LinhasEsqueleto cols={6} />
            ) : lista.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{busca ? "Nenhum colaborador corresponde ao filtro." : "Nenhum registro de ponto neste recorte."}</td></tr>
            ) : (
              lista.map((c) => {
                const aberto = abertos.has(c.codigo);
                const Chevron = aberto ? ChevronDown : ChevronRight;
                return (
                  <React.Fragment key={c.codigo}>
                    <tr className="hover:bg-muted/40">
                      <td className={TD}>
                        <button
                          type="button"
                          onClick={() => alternar(c.codigo)}
                          aria-expanded={aberto}
                          className="flex items-start gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>
                            <span className="block font-medium text-foreground">{c.nome || DASH}</span>
                            <span className="block text-2xs tabular text-muted-foreground">#{c.codigo}</span>
                          </span>
                        </button>
                      </td>
                      <td className={cn(TD, "hidden text-muted-foreground md:table-cell")}>{c.departamentos.join(" / ") || DASH}</td>
                      <td className={cn(TD, "text-right tabular")}>{int(c.qtdDias)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular")}>{num(c.horasPonto)}</td>
                      <td className={cn(TD, "text-right tabular", c.heHoras > 0 ? "text-warning" : "text-muted-foreground/70")}>{c.heHoras > 0 ? hoursHM(c.heHoras) : DASH}</td>
                      <td className={cn(TD, "hidden whitespace-nowrap text-right text-xs tabular text-muted-foreground sm:table-cell")}>
                        {c.primeiroDia === c.ultimoDia ? c.primeiroDia : `${c.primeiroDia.slice(0, 5)} – ${c.ultimoDia.slice(0, 5)}`}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-muted/30">
                        <td colSpan={6} className="px-3 pb-3 pt-1">
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            {c.dias.map((d) => (
                              <span key={d.data} className="rounded-md border border-border bg-card px-2 py-0.5 text-2xs tabular">
                                {d.data}
                                {d.heHoras > 0 && <span className="ml-1 text-warning">+{hoursHM(d.heHoras)} HE</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          {!carga.loading && (
            <>
              <span className="tabular">{int(colaboradores.length)} colaboradores · {int(somaDias)} dias · <b className="text-foreground">{num(somaHoras)} h</b> de ponto{somaHe > 0 ? ` · ${hoursHM(somaHe)} de HE` : ""}</span>
              <SeloConferencia
                c={conf}
                unidade="h"
                explicacao="O card soma o ponto por setor macro dos 6 setores do OPE. Departamento ligado a mais de um setor macro (AD_DEPLINHA) conta em cada um no card, e setor macro fora dos 6 entra aqui mas não no card."
              />
            </>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={carga.loading || lista.length === 0} onClick={() => exportTabela(colunas, lista, `ponto_${arquivo}.xlsx`, "Ponto")}>
          <Download className="h-4 w-4" /> Excel
        </Button>
      </div>
    </div>
  );
}

/* ── Aba Atividades ─────────────────────────────────────────── */

type ColBarco = "barco" | "horas" | "atividades" | "dias" | "avanco";
const LIMITE_DRILL = 200;

function BarraAvanco({ a }: { a: AvancoBarco }) {
  const baixo = a.status === "Baixo avanço";
  return (
    <div className="min-w-[7rem]">
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Previsto ${a.previsto}%, real ${a.real}%`}>
        <div className="absolute inset-y-0 left-0 bg-muted-foreground/35" style={{ width: `${a.previsto}%` }} />
        <div className={cn("absolute inset-y-0 left-0", baixo ? "bg-destructive" : "bg-primary")} style={{ width: `${a.real}%` }} />
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-2xs tabular">
        <span><b className={baixo ? "text-destructive" : "text-foreground"}>{a.real}%</b><span className="text-muted-foreground"> / {a.previsto}%</span></span>
        <Badge variant={baixo ? "destructive" : a.status === "Adiantado" ? "success" : "muted"} className="text-2xs">{a.status}</Badge>
      </div>
    </div>
  );
}

function AbaAtividades({
  carga, avanco, totalCard, arquivo, retrabalho = false,
}: {
  carga: Carga<AtivDetalheRow>;
  /** Aba de Perdas: mesmas colunas, só apontamentos de retrabalho. */
  retrabalho?: boolean;
  avanco: { mapa: Map<string, AvancoBarco>; loading: boolean; erro: string | null; indisponivel: string | null };
  totalCard?: number;
  arquivo: string;
}) {
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<Ordem<ColBarco>>({ col: "horas", dir: "desc" });
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());

  const barcos = React.useMemo(() => atividadesPorBarco(carga.rows), [carga.rows]);
  const lista = React.useMemo(() => {
    const termos = norm(busca).split(/\s+/).filter(Boolean);
    const casa = (b: BarcoAtividades) =>
      termos.every((t) => norm(`${b.barco} ${b.linha} ${b.setores.join(" ")}`).includes(t) || b.linhas.some((r) => norm(r.atividade).includes(t)));
    const filtrada = termos.length ? barcos.filter(casa) : barcos;
    const m = ordem.dir === "asc" ? 1 : -1;
    const atraso = (b: BarcoAtividades) => {
      const a = avanco.mapa.get(b.barco);
      return a ? a.previsto - a.real : -Infinity;
    };
    return [...filtrada].sort((a, b) => {
      switch (ordem.col) {
        case "barco": return m * a.barco.localeCompare(b.barco, "pt-BR", { numeric: true });
        case "atividades": return m * (a.qtdAtividades - b.qtdAtividades);
        case "dias": return m * (a.qtdDias - b.qtdDias);
        case "avanco": return m * (atraso(a) - atraso(b));
        default: return m * (a.horas - b.horas);
      }
    });
  }, [barcos, busca, ordem, avanco.mapa]);

  const somaHoras = barcos.reduce((s, b) => s + b.horas, 0);
  const conf = carga.feito && !carga.erro ? conferencia(somaHoras, totalCard) : null;
  const maxHoras = barcos[0]?.horas || 1;

  const alternar = (k: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  const colunasBarco: ExportColumn<BarcoAtividades>[] = [
    { id: "barco", header: "Barco", accessor: (b) => b.barco },
    { id: "linha", header: "Linha", accessor: (b) => b.linha },
    { id: "horas", header: "Horas apontadas", accessor: (b) => Number(b.horas.toFixed(2)) },
    { id: "part", header: "% do total", accessor: (b) => Number(b.participacao.toFixed(1)) },
    { id: "ativ", header: "Atividades distintas", accessor: (b) => b.qtdAtividades },
    { id: "dias", header: "Dias", accessor: (b) => b.qtdDias },
    { id: "prev", header: "Avanço previsto (%)", accessor: (b) => avanco.mapa.get(b.barco)?.previsto ?? "" },
    { id: "real", header: "Avanço real (%)", accessor: (b) => avanco.mapa.get(b.barco)?.real ?? "" },
    { id: "status", header: "Situação", accessor: (b) => avanco.mapa.get(b.barco)?.status ?? "sem cronograma" },
  ];
  // Mesmas colunas da lista detalhada que a tela OPE exportava.
  const colunasDetalhe: ExportColumn<AtivDetalheRow>[] = [
    { id: "setorMacro", header: "Setor", accessor: (r) => r.setorMacro },
    { id: "setor", header: "Equipe", accessor: (r) => r.setor },
    { id: "linha", header: "Linha", accessor: (r) => r.linha },
    { id: "projeto", header: "Barco", accessor: (r) => r.projeto },
    { id: "codAtividade", header: "Cód. ativ.", accessor: (r) => r.codAtividade },
    { id: "atividade", header: "Atividade", accessor: (r) => r.atividade },
    { id: "data", header: "Data", accessor: (r) => r.data },
    { id: "horas", header: "Horas", accessor: (r) => r.horas },
  ];

  if (carga.erro) {
    return <Alert variant="destructive" title={retrabalho ? "Não foi possível carregar as perdas" : "Não foi possível carregar as atividades"}>{carga.erro}</Alert>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Busca value={busca} onChange={setBusca} placeholder="Filtrar barco, linha ou atividade…" />
        {avanco.indisponivel && <span className="text-2xs text-muted-foreground">{avanco.indisponivel}</span>}
        {avanco.erro && <span className="text-2xs text-destructive" title={avanco.erro}>Avanço do cronograma indisponível.</span>}
      </div>
      <div className="min-h-0 max-h-[52vh] overflow-auto rounded-lg border border-border scrollbar-slim">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <ThOrdem col="barco" ordem={ordem} onOrdem={setOrdem}>Barco</ThOrdem>
              <ThOrdem col="horas" ordem={ordem} onOrdem={setOrdem}>Horas apontadas</ThOrdem>
              <ThOrdem col="atividades" ordem={ordem} onOrdem={setOrdem} className="hidden text-right sm:table-cell">Atividades</ThOrdem>
              <ThOrdem col="dias" ordem={ordem} onOrdem={setOrdem} className="hidden text-right md:table-cell">Dias</ThOrdem>
              <ThOrdem col="avanco" ordem={ordem} onOrdem={setOrdem}>Avanço do cronograma</ThOrdem>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {carga.loading ? (
              <LinhasEsqueleto cols={5} />
            ) : lista.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{busca ? "Nenhum barco corresponde ao filtro." : retrabalho ? "Nenhum retrabalho apontado neste recorte." : "Nenhuma atividade apontada neste recorte."}</td></tr>
            ) : (
              lista.map((b) => {
                const aberto = abertos.has(b.barco);
                const Chevron = aberto ? ChevronDown : ChevronRight;
                const av = avanco.mapa.get(b.barco);
                return (
                  <React.Fragment key={b.barco}>
                    <tr className="hover:bg-muted/40">
                      <td className={TD}>
                        <button
                          type="button"
                          onClick={() => alternar(b.barco)}
                          aria-expanded={aberto}
                          className="flex items-start gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>
                            <span className="block font-mono font-medium text-foreground">{b.barco}</span>
                            <span className="block text-2xs text-muted-foreground">{b.linha}{b.setores.length ? ` · ${b.setores.join(", ")}` : ""}</span>
                          </span>
                        </button>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-right font-semibold tabular">{num(b.horas)}</span>
                          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                            <span className="block h-full bg-primary" style={{ width: `${(b.horas / maxHoras) * 100}%` }} />
                          </span>
                          <span className="text-2xs tabular text-muted-foreground">{pct(b.participacao, { decimals: 1 })}</span>
                        </div>
                      </td>
                      <td className={cn(TD, "hidden text-right tabular sm:table-cell")}>{int(b.qtdAtividades)}</td>
                      <td className={cn(TD, "hidden text-right tabular md:table-cell")}>{int(b.qtdDias)}</td>
                      <td className={TD}>
                        {av ? <BarraAvanco a={av} /> : avanco.loading ? <Skeleton className="h-6 w-28" /> : <span className="text-2xs text-muted-foreground">{avanco.indisponivel || avanco.erro ? DASH : "sem cronograma no período"}</span>}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-muted/30">
                        <td colSpan={5} className="px-3 pb-3 pt-1">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                                <th className="py-1 pl-6 pr-2 font-medium">Atividade</th>
                                <th className="hidden px-2 py-1 font-medium sm:table-cell">Equipe</th>
                                <th className="px-2 py-1 text-right font-medium">Data</th>
                                <th className="px-2 py-1 text-right font-medium">Horas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {b.linhas.slice(0, LIMITE_DRILL).map((r, i) => (
                                <tr key={`${r.codSetor}-${r.codAtividade}-${r.data}-${i}`}>
                                  <td className="py-1 pl-6 pr-2 text-foreground">{r.atividade || DASH}</td>
                                  <td className="hidden px-2 py-1 text-muted-foreground sm:table-cell">{r.setor || DASH}</td>
                                  <td className="px-2 py-1 text-right tabular text-muted-foreground">{r.data}</td>
                                  <td className="px-2 py-1 text-right tabular">{num(r.horas)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {b.linhas.length > LIMITE_DRILL && (
                            <p className="pl-6 pt-1 text-2xs text-muted-foreground">
                              Mostrando {LIMITE_DRILL} de {int(b.linhas.length)} apontamentos — o Excel detalhado leva todos.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          {!carga.loading && (
            <>
              <span className="tabular">{int(barcos.length)} barcos · {int(carga.rows.length)} apontamentos · <b className="text-foreground">{num(somaHoras)} h</b></span>
              <SeloConferencia
                c={conf}
                unidade="h"
                explicacao={`O card soma ${retrabalho ? "o retrabalho" : "as atividades"} por setor macro dos 6 setores do OPE; apontamento de equipe fora desses setores entra aqui mas não no card.`}
              />
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={carga.loading || lista.length === 0} onClick={() => exportTabela(colunasBarco, lista, `${retrabalho ? "perdas" : "atividades"}_por_barco_${arquivo}.xlsx`, "Barcos")}>
            <Download className="h-4 w-4" /> Excel por barco
          </Button>
          <Button size="sm" variant="outline" disabled={carga.loading || carga.rows.length === 0} onClick={() => exportTabela(colunasDetalhe, lista.flatMap((b) => b.linhas), `${retrabalho ? "perdas" : "atividades"}_${arquivo}.xlsx`, retrabalho ? "Perdas" : "Atividades")}>
            <Download className="h-4 w-4" /> Excel detalhado
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Diálogo ─────────────────────────────────────────────────── */

export function OpeAuditoriaDialog({
  titulo,
  ini,
  fim,
  linhas,
  setor,
  abaInicial = "ponto",
  totais,
  onClose,
}: {
  titulo: string;
  /** "DD/MM/YYYY" */
  ini: string;
  /** "DD/MM/YYYY" */
  fim: string;
  linhas: string[];
  setor: string | null;
  abaInicial?: Aba;
  /** Números do card clicado — base da conferência. */
  totais?: TotaisAuditoria;
  onClose: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>(abaInicial);
  const [ponto, setPonto] = React.useState<Carga<PontoDetalheRow>>(cargaInicial);
  const [ativ, setAtiv] = React.useState<Carga<AtivDetalheRow>>(cargaInicial);
  const [perdas, setPerdas] = React.useState<Carga<AtivDetalheRow>>(cargaInicial);
  const [avanco, setAvanco] = React.useState<{ mapa: Map<string, AvancoBarco>; loading: boolean; erro: string | null; indisponivel: string | null; feito: boolean }>(
    { mapa: new Map(), loading: false, erro: null, indisponivel: null, feito: false }
  );
  const chaveLinhas = linhas.join(",");

  // Descarta respostas só quando o diálogo fecha. Trocar de aba NÃO cancela:
  // a consulta da aba deixada termina e fica pronta para quando voltar.
  const montado = React.useRef(true);
  React.useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Cada aba consulta só na primeira vez que é aberta.
  React.useEffect(() => {
    if (aba === "ponto" && !ponto.feito && !ponto.loading) {
      setPonto((c) => ({ ...c, loading: true }));
      getPontoDetalhe(ini, fim, linhas, setor)
        .then((rows) => montado.current && setPonto({ rows, loading: false, erro: null, feito: true }))
        .catch((e: unknown) => montado.current && setPonto({ rows: [], loading: false, erro: mensagemErro(e, "Falha ao carregar o ponto."), feito: true }));
    }
    if (aba === "ativ" || aba === "perdas") {
      if (aba === "ativ" && !ativ.feito && !ativ.loading) {
        setAtiv((c) => ({ ...c, loading: true }));
        getAtivDetalhe(ini, fim, linhas, setor)
          .then((rows) => montado.current && setAtiv({ rows, loading: false, erro: null, feito: true }))
          .catch((e: unknown) => montado.current && setAtiv({ rows: [], loading: false, erro: mensagemErro(e, "Falha ao carregar as atividades."), feito: true }));
      }
      if (aba === "perdas" && !perdas.feito && !perdas.loading) {
        setPerdas((c) => ({ ...c, loading: true }));
        getAtivDetalhe(ini, fim, linhas, setor, true)
          .then((rows) => montado.current && setPerdas({ rows, loading: false, erro: null, feito: true }))
          .catch((e: unknown) => montado.current && setPerdas({ rows: [], loading: false, erro: mensagemErro(e, "Falha ao carregar as perdas."), feito: true }));
      }
      if (!avanco.feito && !avanco.loading) {
        const meses = mesesDoPeriodo(ini, fim);
        if (!meses || meses.qtd > MAX_MESES_AVANCO) {
          setAvanco((a) => ({ ...a, feito: true, indisponivel: `Avanço do cronograma só é calculado para até ${MAX_MESES_AVANCO} meses.` }));
        } else {
          setAvanco((a) => ({ ...a, loading: true }));
          getOpsAvanco(meses.ini, meses.fim)
            .then((ops) => montado.current && setAvanco({ mapa: avancoPorBarco(ops), loading: false, erro: null, indisponivel: null, feito: true }))
            .catch((e: unknown) => montado.current && setAvanco({ mapa: new Map(), loading: false, erro: mensagemErro(e, "Falha ao carregar o avanço."), indisponivel: null, feito: true }));
        }
      }
    }
    // O recorte (ini, fim, linhas, setor) é fixo enquanto o diálogo está montado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, ini, fim, chaveLinhas, setor]);

  const farol = farolOpe(totais?.opePct ?? null);
  const arquivo = `${slugArquivo(titulo)}_${`${ini}_${fim}`.replace(/\//g, "-")}`;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Auditoria do OPE — {titulo}</DialogTitle>
          <DialogDescription>
            {ini} a {fim}
            {setor ? ` · setor ${setor}` : ""} · linhas {linhas.join(", ")}
          </DialogDescription>
        </DialogHeader>

        {totais && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { rotulo: "OPE", valor: totais.opePct == null ? DASH : pct(totais.opePct), cls: farol ? OPE_FAROL_CLS[farol] : "", dica: `atividades ÷ ponto · meta ${META_OPE}%` },
              { rotulo: "Ponto", valor: `${num(totais.ponto)} h`, cls: "text-success", dica: "dias com ponto × 8 h" },
              { rotulo: "Atividades", valor: `${num(totais.ativ)} h`, cls: "text-foreground", dica: "apontado, sem retrabalho" },
              { rotulo: "Perdas", valor: `${num(totais.perdas)} h`, cls: "text-warning", dica: "retrabalho — fora do OPE" },
            ].map((k) => (
              <div key={k.rotulo} className="rounded-lg border border-border px-3 py-2" title={k.dica}>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{k.rotulo}</p>
                <p className={cn("text-lg font-semibold tabular", k.cls)}>{k.valor}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="O que auditar">
          <Chip ativo={aba === "ponto"} onClick={() => setAba("ponto")}>Ponto · colaboradores</Chip>
          <Chip ativo={aba === "ativ"} onClick={() => setAba("ativ")}>Atividades · por barco</Chip>
          <Chip ativo={aba === "perdas"} onClick={() => setAba("perdas")}>Perdas · por barco</Chip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {aba === "ponto" ? (
            <AbaPonto carga={ponto} totalCard={totais?.ponto} arquivo={arquivo} />
          ) : aba === "ativ" ? (
            <AbaAtividades key="ativ" carga={ativ} avanco={avanco} totalCard={totais?.ativ} arquivo={arquivo} />
          ) : (
            <AbaAtividades key="perdas" retrabalho carga={perdas} avanco={avanco} totalCard={totais?.perdas} arquivo={arquivo} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
