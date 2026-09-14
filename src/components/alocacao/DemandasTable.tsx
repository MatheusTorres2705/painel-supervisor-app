// src/components/alocacao/DemandasTable.tsx
// Grade das demandas da OP: seleção para o lote, ordenação, atraso, data
// planejada e colaboradores. Antes era uma caixa de 280 px sem ordenação —
// 438 demandas se viam de 7 em 7.
import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import type { Colab, Demanda } from "@/services/alocacaoService";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { num, toBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ColabPicker } from "./ColabPicker";
import { atrasoDias, pendente, soDataAlterada, type OrdemDemandas } from "./planejamento";

const TH = "whitespace-nowrap px-2 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";

function Th({
  col, ordem, onOrdem, children, className,
}: {
  col: OrdemDemandas["col"]; ordem: OrdemDemandas; onOrdem: (o: OrdemDemandas) => void; children: React.ReactNode; className?: string;
}) {
  const ativo = ordem.col === col;
  const Icone = !ativo ? ArrowUpDown : ordem.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn(TH, className)} aria-sort={ativo ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onOrdem({ col, dir: ativo && ordem.dir === "asc" ? "desc" : "asc" })}
        className={cn("inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", ativo && "text-foreground")}
      >
        {children}
        <Icone className={cn("h-3 w-3", !ativo && "opacity-40")} aria-hidden="true" />
      </button>
    </th>
  );
}

export function DemandasTable({
  rows,
  loading,
  ordem,
  onOrdem,
  selecionadas,
  onSelecionar,
  colabs,
  hoje,
  livreDe,
  onDtPlan,
  onAlocados,
}: {
  rows: Demanda[];
  loading: boolean;
  ordem: OrdemDemandas;
  onOrdem: (o: OrdemDemandas) => void;
  selecionadas: Set<string>;
  onSelecionar: (chaves: string[], marcar: boolean) => void;
  colabs: Colab[];
  hoje: string;
  /** Folga do colaborador no dia, desconsiderando a demanda indicada. */
  livreDe: (codfunc: number, dia: string, excluir?: Demanda) => number;
  onDtPlan: (chave: string, dia: string) => void;
  onAlocados: (chave: string, ids: number[]) => void;
}) {
  const todasMarcadas = rows.length > 0 && rows.every((r) => selecionadas.has(r.chave));
  const algumas = !todasMarcadas && rows.some((r) => selecionadas.has(r.chave));
  const refTodas = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (refTodas.current) refTodas.current.indeterminate = algumas;
  }, [algumas]);

  return (
    <div className="max-h-[60dvh] overflow-auto scrollbar-slim">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b border-border">
            <th className={cn(TH, "w-8 pl-3")}>
              <input
                ref={refTodas}
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={todasMarcadas}
                onChange={(e) => onSelecionar(rows.map((r) => r.chave), e.target.checked)}
                aria-label="Selecionar todas as demandas visíveis"
                disabled={!rows.length}
              />
            </th>
            <Th col="nome" ordem={ordem} onOrdem={onOrdem}>Atividade</Th>
            <Th col="setor" ordem={ordem} onOrdem={onOrdem}>Setor</Th>
            <Th col="hh" ordem={ordem} onOrdem={onOrdem} className="text-right">HH</Th>
            <Th col="demanda" ordem={ordem} onOrdem={onOrdem}>Demanda</Th>
            <Th col="plan" ordem={ordem} onOrdem={onOrdem}>Planejada</Th>
            <th className={cn(TH, "w-56")}>Colaboradores</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="px-2 py-2.5"><Skeleton className="h-3" /></td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nenhuma demanda com os filtros atuais.
              </td>
            </tr>
          ) : (
            rows.map((d) => {
              const sel = selecionadas.has(d.chave);
              const atraso = atrasoDias(d, hoje);
              const pend = pendente(d);
              const soData = soDataAlterada(d);
              const planPassado = d.dtPlan && d.dtPlan < hoje;
              return (
                <tr
                  key={d.chave}
                  className={cn(
                    "border-t border-border/60 transition-colors hover:bg-muted/60",
                    sel && "bg-primary/5",
                    (pend || soData) && "shadow-[inset_3px_0_0_hsl(var(--accent))]"
                  )}
                >
                  <td className={cn(TD, "pl-3")}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={sel}
                      onChange={(e) => onSelecionar([d.chave], e.target.checked)}
                      aria-label={`Selecionar ${d.nome}`}
                    />
                  </td>
                  <td className={cn(TD, "max-w-[22rem]")}>
                    <span className="block truncate text-xs font-medium text-foreground" title={d.nome}>{d.nome}</span>
                    {(pend || soData) && (
                      <span className="text-2xs text-accent">{pend ? "não salva" : "data alterada · sem alocação"}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <Badge variant="muted" className="whitespace-nowrap text-2xs">{d.codusu} · {d.setor}</Badge>
                  </td>
                  <td className={cn(TD, "text-right tabular text-xs")}>{num(d.hhPrev, 1)} h</td>
                  <td className={cn(TD, "whitespace-nowrap text-xs tabular")}>
                    {toBR(d.dtDemanda)}
                    {atraso > 0 && (
                      <Badge variant="destructive" className="ml-1.5 text-2xs">{atraso} {atraso === 1 ? "dia" : "dias"}</Badge>
                    )}
                  </td>
                  <td className={TD}>
                    <Input
                      type="date"
                      value={d.dtPlan}
                      onChange={(e) => e.target.value && onDtPlan(d.chave, e.target.value)}
                      className={cn("h-8 w-[8.5rem] px-2 text-xs", planPassado && "border-warning text-warning")}
                      aria-label={`Data planejada de ${d.nome}`}
                      title={planPassado ? "Data planejada já passou" : undefined}
                    />
                  </td>
                  <td className={TD}>
                    <ColabPicker
                      colabs={colabs}
                      selecionados={d.alocados}
                      onChange={(ids) => onAlocados(d.chave, ids)}
                      setor={d.codusu}
                      dia={d.dtPlan}
                      horas={d.hhPrev}
                      livreDe={(cod, dia) => livreDe(cod, dia, d)}
                      align="end"
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
