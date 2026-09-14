// src/components/alocacao/QuadroCarga.tsx
// Carga × capacidade por colaborador e dia — a visão que responde "cabe?".
// Em cima, uma linha por setor (demanda planejada × folga do setor); embaixo,
// cada colaborador. Célula = horas/capacidade, com a cor do tom de carga.

import type { Colab, Demanda } from "@/services/alocacaoService";
import { Skeleton } from "@/components/ui/skeleton";
import { num } from "@/lib/format";
import { MESES_CURTO } from "@/lib/datetime";
import { toneSurface, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import {
  celula,
  celulaSetor,
  dataLocal,
  type CapacidadeCfg,
  type IndiceCarga,
} from "./planejamento";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const h1 = (v: number) => num(v, v % 1 === 0 ? 0 : 1);

function Legenda() {
  const itens: [Tone, string][] = [
    ["neutral", "sem carga"],
    ["success", "até 90%"],
    ["warning", "90–100%"],
    ["danger", "acima da capacidade"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      {itens.map(([t, l]) => (
        <span key={t} className="flex items-center gap-1">
          <span className={cn("inline-block h-3 w-3 rounded-sm border", toneSurface[t])} /> {l}
        </span>
      ))}
    </div>
  );
}

export function QuadroCarga({
  dias,
  colabs,
  setores,
  demandas,
  ix,
  cfg,
  diaAtivo,
  onDia,
  onColab,
  carregando,
  truncado,
}: {
  dias: string[];
  colabs: Colab[];
  setores: [number, string][];
  demandas: Demanda[];
  ix: IndiceCarga;
  cfg: CapacidadeCfg;
  diaAtivo: string;
  onDia: (dia: string) => void;
  onColab: (id: number) => void;
  carregando: boolean;
  truncado: boolean;
}) {
  const cabecalhoDia = (d: string) => {
    const dt = dataLocal(d);
    return (
      <span className="flex flex-col items-center leading-tight">
        <span>{DIAS_SEMANA[dt.getDay()]}</span>
        <span className="tabular text-foreground">{String(dt.getDate()).padStart(2, "0")}/{MESES_CURTO[dt.getMonth() + 1]}</span>
      </span>
    );
  };

  if (!dias.length) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Período sem dias com capacidade. Ajuste o período ou a capacidade.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2">
        <Legenda />
        <span className="text-2xs text-muted-foreground">
          Clique no dia para ver o Gantt · no colaborador para os detalhes
          {truncado && " · período limitado aos primeiros 45 dias"}
        </span>
      </div>
      <div className="max-h-[55dvh] overflow-auto scrollbar-slim">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 min-w-[13rem] border-b border-border bg-muted px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Setor / colaborador
              </th>
              {dias.map((d) => (
                <th key={d} className={cn("border-b border-border bg-muted px-1 py-1 text-2xs font-medium text-muted-foreground", d === diaAtivo && "bg-primary/10")}>
                  <button
                    type="button"
                    onClick={() => onDia(d)}
                    className="w-full rounded-sm px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-pressed={d === diaAtivo}
                    title="Ver o Gantt deste dia"
                  >
                    {cabecalhoDia(d)}
                  </button>
                </th>
              ))}
              <th className="border-b border-border bg-muted px-2 py-2 text-right text-2xs font-medium uppercase tracking-wide text-muted-foreground">Período</th>
            </tr>
          </thead>
          <tbody>
            {setores.map(([cod, nome]) => {
              let dem = 0;
              let liv = 0;
              return (
                <tr key={`s-${cod}`}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-border bg-muted/80 px-3 py-1.5 text-left font-semibold text-foreground backdrop-blur">
                    <span className="block truncate" title={`${cod} · ${nome}`}>{nome}</span>
                    <span className="text-2xs font-normal text-muted-foreground">demanda / folga do setor</span>
                  </th>
                  {dias.map((d) => {
                    const c = celulaSetor(cod, d, demandas, colabs, ix, cfg);
                    dem += c.demanda;
                    liv += c.livre;
                    return (
                      <td key={d} className={cn("border-b border-border bg-muted/40 p-0.5", d === diaAtivo && "bg-primary/5")}>
                        <div
                          className={cn("rounded-sm border px-1 py-1 text-center tabular", c.demanda || c.livre ? toneSurface[c.tom] : "border-transparent text-muted-foreground/50")}
                          title={`${nome} em ${d.split("-").reverse().join("/")}: ${num(c.demanda, 1)} h de demanda planejada · ${num(c.livre, 1)} h livres (${c.pessoas} pessoas, descontado o que já está gravado)`}
                        >
                          {c.demanda || c.livre ? `${h1(c.demanda)}/${h1(c.livre)}` : "—"}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-border bg-muted/40 px-2 text-right font-semibold tabular">{h1(dem)}/{h1(liv)}</td>
                </tr>
              );
            })}

            {carregando ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="sticky left-0 bg-card px-3 py-2"><Skeleton className="h-3 w-32" /></td>
                  {dias.map((d) => <td key={d} className="p-1"><Skeleton className="h-6" /></td>)}
                  <td />
                </tr>
              ))
            ) : colabs.length === 0 ? (
              <tr>
                <td colSpan={dias.length + 2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum colaborador ativo com cargo nos setores das demandas (AD_SETORESCARGO).
                </td>
              </tr>
            ) : (
              colabs.map((c) => {
                let tot = 0;
                let cap = 0;
                const celulas = dias.map((d) => {
                  const x = celula(ix, c.id, d, cfg);
                  tot += x.total;
                  cap += x.capacidade;
                  return { d, x };
                });
                const tomPeriodo: Tone = tot <= 0 ? "neutral" : tot > cap + 0.01 ? "danger" : tot >= cap * 0.9 ? "warning" : "success";
                return (
                  <tr key={c.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 border-b border-border/60 bg-card px-3 py-1 text-left font-normal group-hover:bg-muted">
                      <button
                        type="button"
                        onClick={() => onColab(c.id)}
                        className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Ver detalhes do colaborador"
                      >
                        <span className="block max-w-[12rem] truncate font-medium text-primary hover:underline">{c.nome}</span>
                        <span className="block max-w-[12rem] truncate text-2xs text-muted-foreground">{c.cargo}</span>
                      </button>
                    </th>
                    {celulas.map(({ d, x }) => (
                      <td key={d} className={cn("border-b border-border/60 p-0.5", d === diaAtivo && "bg-primary/5")}>
                        <div
                          className={cn("rounded-sm border px-1 py-1 text-center tabular", x.total > 0 ? toneSurface[x.tom] : "border-transparent text-muted-foreground/50")}
                          title={`${c.nome} · ${d.split("-").reverse().join("/")}\nTela: ${num(x.tela, 1)} h · ERP desta OP: ${num(x.erp, 1)} h · Outras OPs: ${num(x.externa, 1)} h\nTotal ${num(x.total, 1)} de ${num(x.capacidade, 1)} h`}
                        >
                          {x.total > 0 ? `${h1(x.total)}/${h1(x.capacidade)}` : `0/${h1(x.capacidade)}`}
                        </div>
                      </td>
                    ))}
                    <td className="border-b border-border/60 px-2 text-right">
                      <span className={cn("rounded-sm border px-1 py-0.5 tabular", toneSurface[tomPeriodo])}>{h1(tot)}/{h1(cap)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
