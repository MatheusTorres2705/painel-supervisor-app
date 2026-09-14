// src/components/alocacao/GanttDia.tsx
// Sequência do dia por colaborador. Diferenças para o Gantt anterior:
//  · nada é cortado — o que passa do fim da jornada aparece em vermelho;
//  · o almoço é uma faixa, e a atividade que o atravessa continua depois dele;
//  · a origem se distingue: tela (cor do setor), gravado nesta OP (contorno)
//    e outras OPs (cinza).
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CargaExterna, Colab, Demanda } from "@/services/alocacaoService";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { chartColors } from "@/lib/chartTheme";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  blocosGantt,
  capacidadeDoDia,
  horasPorAlocado,
  somarDias,
  type BlocoGantt,
  type CapacidadeCfg,
  type ItemGantt,
} from "./planejamento";

const hora = (h: number) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
};

export function GanttDia({
  dia,
  onDia,
  colabs,
  demandas,
  externa,
  cfg,
  setores,
  onColab,
}: {
  dia: string;
  onDia: (dia: string) => void;
  colabs: Colab[];
  demandas: Demanda[];
  externa: CargaExterna;
  cfg: CapacidadeCfg;
  setores: [number, string][];
  onColab: (id: number) => void;
}) {
  const [soComCarga, setSoComCarga] = React.useState(true);
  const capacidade = capacidadeDoDia(cfg, dia);
  const corSetor = React.useMemo(() => new Map(setores.map(([cod], i) => [cod, chartColors[i % chartColors.length]])), [setores]);

  const linhas = React.useMemo(() => {
    return colabs
      .map((c) => {
        const itens: ItemGantt[] = [];
        for (const d of demandas) {
          if (d.dtPlan === dia && d.alocados.includes(c.id)) {
            itens.push({ id: `t-${d.chave}`, label: d.nome, horas: horasPorAlocado(d), origem: "tela", codusu: d.codusu });
          }
        }
        c.atividadesERP
          .filter((p) => p.dt === dia)
          .forEach((p, i) => itens.push({ id: `e-${p.seq}-${p.sequencia}-${i}`, label: `${p.codprod} - ${p.descrprod}`, horas: p.qtd / 60, origem: "erp", codusu: p.codusu }));
        const minExt = externa.get(c.id)?.get(dia) ?? 0;
        if (minExt > 0) itens.push({ id: `x-${c.id}`, label: "Outras OPs", horas: minExt / 60, origem: "externa" });
        const total = itens.reduce((s, i) => s + i.horas, 0);
        return { c, total, ...blocosGantt(itens, cfg, capacidade) };
      })
      .filter((l) => !soComCarga || l.total > 0);
  }, [colabs, demandas, externa, dia, cfg, capacidade, soComCarga]);

  const regraBase = blocosGantt([], cfg, capacidade).regra;
  const inicio = Math.floor(regraBase.inicio);
  // Régua até no máximo 24 h: o excedente além disso fica cortado na barra, mas o
  // texto ao lado do nome diz quantas horas passam da jornada.
  const fim = Math.min(24, Math.max(regraBase.fimEscala, ...linhas.map((l) => l.regra.fimEscala)));
  const span = Math.max(1, fim - inicio);
  const pos = (h: number) => `${((h - inicio) / span) * 100}%`;
  const larg = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const ticks = Array.from({ length: span }, (_, i) => inicio + i);

  const estiloBloco = (b: BlocoGantt): React.CSSProperties => {
    if (b.origem === "externa") return { background: "hsl(var(--muted-foreground) / 0.45)" };
    const cor = (b.codusu != null && corSetor.get(b.codusu)) || chartColors[0];
    if (b.origem === "erp") return { background: "hsl(var(--card))", boxShadow: `inset 0 0 0 2px ${cor}` };
    return { background: cor };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <Button size="icon-sm" variant="outline" onClick={() => onDia(somarDias(dia, -1))} aria-label="Dia anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={dia} onChange={(e) => e.target.value && onDia(e.target.value)} className="h-8 w-[9rem] px-2 text-xs" aria-label="Dia do Gantt" />
        <Button size="icon-sm" variant="outline" onClick={() => onDia(somarDias(dia, 1))} aria-label="Próximo dia">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          {capacidade > 0 ? `Jornada ${cfg.inicio}–${hora(regraBase.fimJornada)} · ${num(capacidade, 1)} h` : "Dia sem capacidade configurada"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Chip ativo={soComCarga} onClick={() => setSoComCarga(true)}>Só com carga</Chip>
          <Chip ativo={!soComCarga} onClick={() => setSoComCarga(false)}>Todos</Chip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm" style={{ background: chartColors[0] }} /> na tela (não salvo)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm" style={{ boxShadow: `inset 0 0 0 2px ${chartColors[0]}` }} /> gravado nesta OP</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm" style={{ background: "hsl(var(--muted-foreground) / 0.45)" }} /> outras OPs</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-destructive/20 ring-1 ring-destructive" /> além da jornada</span>
      </div>

      <div className="overflow-x-auto scrollbar-slim">
        <div className="min-w-[48rem] px-4 pb-2">
          <div className="grid items-end" style={{ gridTemplateColumns: "14rem 1fr" }}>
            <div />
            <div className="relative h-5 text-2xs text-muted-foreground">
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: pos(t) }}>{t}h</span>
              ))}
            </div>
          </div>

          <div className="max-h-[50dvh] space-y-1 overflow-y-auto scrollbar-slim">
            {linhas.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                {soComCarga ? "Ninguém com carga neste dia." : "Nenhum colaborador para exibir."}
              </p>
            )}
            {linhas.map(({ c, total, blocos, regra }) => {
              const excedente = Math.max(0, total - capacidade);
              return (
                <div key={c.id} className="grid items-center gap-2" style={{ gridTemplateColumns: "14rem 1fr" }}>
                  <button
                    type="button"
                    onClick={() => onColab(c.id)}
                    className="min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate text-xs font-medium text-foreground hover:underline">{c.nome}</span>
                    <span className={cn("block text-2xs tabular", excedente > 0.01 ? "text-destructive" : "text-muted-foreground")}>
                      {num(total, 1)} / {num(capacidade, 1)} h{excedente > 0.01 ? ` · +${num(excedente, 1)} h além da jornada` : ""}
                    </span>
                  </button>

                  <div className="relative h-7 overflow-hidden rounded-md bg-muted">
                    {ticks.map((t) => (
                      <span key={t} className="absolute inset-y-0 border-l border-background/70" style={{ left: pos(t) }} />
                    ))}
                    {regra.almocoFim > regra.almocoIni && (
                      <span
                        className="absolute inset-y-0"
                        style={{
                          left: pos(regra.almocoIni),
                          width: larg(regra.almocoIni, regra.almocoFim),
                          background: "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.18) 0 4px, transparent 4px 8px)",
                        }}
                        title={`Almoço ${hora(regra.almocoIni)}–${hora(regra.almocoFim)}`}
                      />
                    )}
                    {fim > regra.fimJornada && (
                      <span className="absolute inset-y-0 right-0 bg-destructive/10" style={{ left: pos(regra.fimJornada) }} />
                    )}
                    {blocos.map((b, i) => (
                      <button
                        key={`${b.id}-${i}`}
                        type="button"
                        onClick={() => onColab(c.id)}
                        className={cn(
                          "absolute inset-y-1 rounded-[3px] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          b.excedente && "ring-2 ring-destructive"
                        )}
                        style={{ left: pos(b.ini), width: larg(b.ini, b.fim), ...estiloBloco(b) }}
                        title={`${b.label}\n${hora(b.ini)}–${hora(b.fim)}${b.excedente ? " · além da jornada" : ""}`}
                        aria-label={`${b.label}, ${hora(b.ini)} a ${hora(b.fim)}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
