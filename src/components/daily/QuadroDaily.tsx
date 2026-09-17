// src/components/daily/QuadroDaily.tsx
// O quadro da parede: uma linha por indicador, meta, uma coluna por dia da
// semana e o acumulado do mês. A cor da célula é o farol contra a meta.
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { Indicador } from "@/lib/dailyConfig";
import { farolDaily, formatarValor } from "@/lib/dailyConfig";
import type { Serie } from "@/lib/dailyCalc";
import { diaLocal } from "@/lib/dailyCalc";
import { MESES_CURTO } from "@/lib/datetime";
import { toneSurface, toneText } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TH = "whitespace-nowrap px-2 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";

export type LinhaQuadro = {
  ind: Indicador;
  serie: Serie | null;
  metaDia: number | null;
  metaMes: number | null;
  erro?: string | null;
};

function Celula({ valor, meta, ind }: { valor: number | null; meta: number | null; ind: Indicador }) {
  const tom = farolDaily(valor, meta, ind.melhor);
  if (valor == null) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span
      className={cn("inline-block min-w-[3.5rem] rounded-sm border px-1.5 py-0.5 text-right tabular", toneSurface[tom])}
      title={meta == null ? undefined : `Meta ${formatarValor(meta, ind.unidade)}${ind.unidade === "%" ? "" : ` ${ind.unidade}`}`}
    >
      {formatarValor(valor, ind.unidade)}
    </span>
  );
}

export function QuadroDaily({
  linhas,
  dias,
  rotuloMes,
  loading,
  feriados,
}: {
  linhas: LinhaQuadro[];
  dias: string[];
  rotuloMes: string;
  loading: boolean;
  /** Dias sem produção: a coluna não cobra meta nem pinta farol. */
  feriados: ReadonlySet<string>;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <div className="overflow-x-auto scrollbar-slim">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className={cn(TH, "text-left")}>Indicador</th>
            <th className={cn(TH, "text-center")}>Freq.</th>
            <th className={cn(TH, "text-right")}>Meta</th>
            {dias.map((d) => {
              const dt = diaLocal(d);
              return (
                <th key={d} className={cn(TH, "text-center", d === hoje && "text-foreground")}>
                  <span className="block">{DOW[dt.getDay()]}</span>
                  <span className="block tabular font-normal">{String(dt.getDate()).padStart(2, "0")}/{MESES_CURTO[dt.getMonth() + 1]}</span>
                  {feriados.has(d) && <span className="block font-normal normal-case text-muted-foreground/80">feriado</span>}
                </th>
              );
            })}
            <th className={cn(TH, "text-right")}>{rotuloMes}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={dias.length + 4} className="px-2 py-2"><Skeleton className="h-6" /></td>
                </tr>
              ))
            : linhas.map(({ ind, serie, metaDia, metaMes, erro }) => {
                const semFonte = ind.fonte === "sem-fonte";
                return (
                  <tr key={ind.id} className="hover:bg-muted/40">
                    <td className={cn(TD, "min-w-[14rem]")}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ind.rota ? (
                          <Link to={ind.rota} className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {ind.nome}
                            <ArrowRight className="ml-0.5 inline-block h-3 w-3" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">{ind.nome}</span>
                        )}
                        {semFonte && <Badge variant="muted" className="text-2xs" title={ind.observacao}>sem fonte</Badge>}
                        {ind.semRecorte && <Badge variant="outline" className="text-2xs" title="Não separa por setor nem galpão">sem recorte</Badge>}
                        {erro && <Badge variant="destructive" className="text-2xs" title={erro}>erro</Badge>}
                      </div>
                      {ind.ajuda && <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground" title={ind.ajuda}>{ind.ajuda}</p>}
                    </td>
                    <td className={cn(TD, "text-center text-2xs text-muted-foreground")} title={ind.frequencia === "D" ? "Diário" : ind.frequencia === "S" ? "Semanal" : "Mensal"}>
                      {ind.frequencia}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right tabular text-muted-foreground")}>
                      {metaDia == null ? "—" : formatarValor(metaDia, ind.unidade)}
                    </td>
                    {dias.map((d) => (
                      <td key={d} className={cn(TD, "text-center")}>
                        {ind.soAcumulado ? (
                          <span className="text-muted-foreground/40" title="Indicador do mês">·</span>
                        ) : (
                          /* Feriado entra sem meta: a fábrica parada não deve
                             pintar vermelho por não ter produzido. */
                          <Celula valor={serie?.porDia[d] ?? null} meta={feriados.has(d) ? null : metaDia} ind={ind} />
                        )}
                      </td>
                    ))}
                    <td className={cn(TD, "text-right")}>
                      <Celula valor={serie?.mes ?? null} meta={metaMes} ind={ind} />
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      <p className="px-2 pt-3 text-2xs text-muted-foreground">
        <span className={cn("mr-1 rounded-sm border px-1", toneSurface.success)}>na meta</span>
        <span className={cn("mr-1 rounded-sm border px-1", toneSurface.warning)}>perto</span>
        <span className={cn("mr-1 rounded-sm border px-1", toneSurface.danger)}>fora</span>
        · célula vazia = sem dado no dia · coluna marcada <b>feriado</b> não recebe meta · <span className={toneText.neutral}>"sem fonte"</span> = indicador ainda não mapeado no ERP.
      </p>
    </div>
  );
}
