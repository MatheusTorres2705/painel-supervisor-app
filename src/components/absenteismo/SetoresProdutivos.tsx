// src/components/absenteismo/SetoresProdutivos.tsx
// Absenteísmo por setor produtivo: com quanta gente o setor pôde contar no mês.
// Responde o "onde" que o resto da tela não responde — o drill de lá é por
// gerente e supervisor, não por setor.
import * as React from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

import {
  OPCOES_GALPAO,
  type PessoaFaltante,
  type SetorAbsenteismo,
  type TotalAbsenteismoSetor,
} from "@/lib/absenteismoSetores";
import { int, pct, hours } from "@/lib/formatDiretoria";
import { toneSurface, toneText, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { AsyncBoundary } from "@/components/patterns/AsyncBoundary";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";

const TH = "whitespace-nowrap px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2 align-middle";

/** Quanto do quadro esteve disponível: abaixo de 90% o setor perdeu quase um em cada dez. */
function tomDisponivel(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v >= 95) return "success";
  if (v >= 90) return "warning";
  return "danger";
}

function BarraDisponivel({ v }: { v: number | null }) {
  const tom = tomDisponivel(v);
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
        <span className={cn("block h-full rounded-full", tom === "danger" ? "bg-destructive" : tom === "warning" ? "bg-warning" : "bg-success")} style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
      </span>
      <span className={cn("w-16 text-right font-semibold tabular", toneText[tom])}>{v == null ? "—" : pct(v, { decimals: 1 })}</span>
    </div>
  );
}

export function SetoresProdutivos({
  setores,
  total,
  periodo,
  galpao,
  onGalpao,
  foraDoGalpao,
  loading,
  erro,
  onRetry,
}: {
  setores: SetorAbsenteismo[];
  total: TotalAbsenteismoSetor | null;
  /** "01/09/2026 a 16/09/2026" — a apuração do mês. */
  periodo: string;
  /** Id do galpão filtrado, ou "todos". */
  galpao: string;
  onGalpao: (id: string) => void;
  /** Pessoas sem linha de produção que o filtro de galpão deixou de fora. */
  foraDoGalpao: number;
  loading: boolean;
  erro: string | null;
  onRetry: () => void;
}) {
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());
  const alternar = (k: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  const somaPessoas = setores.reduce((s, x) => s + x.pessoas, 0);
  const duplicados = total ? somaPessoas - total.pessoas : 0;

  const galpaoLabel = OPCOES_GALPAO.find((g) => g.id === galpao)?.label ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 px-1" role="group" aria-label="Galpão">
        {OPCOES_GALPAO.map((g) => (
          <Chip key={g.id} ativo={galpao === g.id} onClick={() => onGalpao(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>

      <AsyncBoundary
        loading={loading}
        error={erro}
        isEmpty={setores.length === 0}
        emptyTitle="Nenhum colaborador no período"
        emptyDescription={galpao === "todos" ? "Não há quadro ativo para o mês e o escopo selecionados." : `Ninguém do quadro atende linhas do ${galpaoLabel} no mês e no escopo selecionados.`}
        emptyIcon={Users}
        onRetry={onRetry}
        skeleton={<div className="space-y-2 p-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      >
        <div className="overflow-x-auto scrollbar-slim">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted">
              <tr>
                <th className={TH}>Setor produtivo</th>
                <th className={cn(TH, "text-right")}>Pessoas</th>
                <th className={cn(TH, "text-right")}>Presentes</th>
                <th className={cn(TH, "text-right")}>Faltantes</th>
                <th className={cn(TH, "text-right")}>% disponível</th>
                <th className={cn(TH, "hidden text-right sm:table-cell")}>Faltas</th>
                <th className={cn(TH, "hidden text-right md:table-cell")}>HH perdido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {setores.map((s) => {
                const aberto = abertos.has(s.codigo);
                const Chevron = aberto ? ChevronDown : ChevronRight;
                const temFaltantes = s.pessoasFaltantes.length > 0;
                return (
                  <React.Fragment key={s.codigo}>
                    <tr className={cn("hover:bg-muted/40", temFaltantes && "cursor-pointer")} onClick={temFaltantes ? () => alternar(s.codigo) : undefined}>
                      <td className={TD}>
                        {temFaltantes ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); alternar(s.codigo); }}
                            aria-expanded={aberto}
                            className="flex items-center gap-1.5 rounded-sm text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title="Ver quem faltou"
                          >
                            <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {s.label}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1.5 pl-[1.375rem] font-medium text-foreground">{s.label}</span>
                        )}
                      </td>
                      <td className={cn(TD, "text-right tabular")}>{int(s.pessoas)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular text-success")}>{int(s.presentes)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular", s.faltantes > 0 ? "text-destructive" : "text-muted-foreground/70")}>
                        {s.faltantes > 0 ? int(s.faltantes) : "—"}
                      </td>
                      <td className={TD}><BarraDisponivel v={s.disponivelPct} /></td>
                      <td className={cn(TD, "hidden text-right tabular sm:table-cell")}>{s.faltas > 0 ? int(s.faltas) : "—"}</td>
                      <td className={cn(TD, "hidden text-right tabular text-muted-foreground md:table-cell")}>{s.hhPerdido > 0 ? hours(s.hhPerdido, { decimals: 0 }) : "—"}</td>
                    </tr>
                    {aberto && (
                      <tr className="bg-muted/30">
                        <td colSpan={7} className="px-3 pb-3 pt-1">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                                <th className="py-1 pl-6 pr-2 font-medium">Quem faltou</th>
                                <th className="px-2 py-1 text-right font-medium">Faltas</th>
                                <th className="px-2 py-1 text-right font-medium">HH perdido</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {s.pessoasFaltantes.map((p: PessoaFaltante) => (
                                <tr key={p.codfunc}>
                                  <td className="py-1 pl-6 pr-2 text-foreground">
                                    {p.nome || `#${p.codfunc}`} <span className="text-2xs tabular text-muted-foreground">#{p.codfunc}</span>
                                  </td>
                                  <td className="px-2 py-1 text-right tabular">{int(p.faltas)}</td>
                                  <td className="px-2 py-1 text-right tabular text-muted-foreground">{hours(p.hhPerdido, { decimals: 0 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {total && (
              <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                <tr>
                  <td className={TD}>Total</td>
                  <td className={cn(TD, "text-right tabular")}>{int(total.pessoas)}</td>
                  <td className={cn(TD, "text-right tabular text-success")}>{int(total.presentes)}</td>
                  <td className={cn(TD, "text-right tabular text-destructive")}>{int(total.faltantes)}</td>
                  <td className={TD}>
                    <span className={cn("block rounded-sm border px-2 py-0.5 text-right tabular", toneSurface[tomDisponivel(total.disponivelPct)])}>
                      {total.disponivelPct == null ? "—" : pct(total.disponivelPct, { decimals: 1 })}
                    </span>
                  </td>
                  <td className={cn(TD, "hidden text-right tabular sm:table-cell")}>{int(total.faltas)}</td>
                  <td className={cn(TD, "hidden text-right tabular md:table-cell")}>{hours(total.hhPerdido, { decimals: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </AsyncBoundary>

      <p className="px-1 text-2xs text-muted-foreground">
        Apuração {periodo}. <b>Pessoas</b> = quem esteve ativo em algum dia do período (<span className="font-mono">TFPFUN.DTADM/DTDEM</span>).
        <b> Faltante</b> = teve ao menos uma falta; <b>presente</b> = pessoas − faltantes; <b>% disponível</b> = presentes ÷ pessoas.
        Setor produtivo vem de <span className="font-mono">AD_DEPLINHA.SETORMACRO</span>, e o galpão vem da linha do departamento — os mesmos caminhos do OPE.
        {galpao !== "todos" && <> Filtrado por <b>{galpaoLabel}</b>: entram as pessoas cujo departamento atende linhas desse galpão{foraDoGalpao > 0 ? `; ${int(foraDoGalpao)} sem linha de produção ${foraDoGalpao === 1 ? "ficou" : "ficaram"} de fora` : ""}.</>}
        {duplicados > 0 && (
          <> A soma das linhas dá {int(somaPessoas)} porque {int(duplicados)} {duplicados === 1 ? "pessoa está" : "pessoas estão"} em mais de um setor; o total conta cada uma uma vez.</>
        )}
      </p>
    </div>
  );
}
