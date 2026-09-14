// src/components/hora-extra/HoraExtraResumo.tsx
// Faixa gerencial da tela: totais, distribuição por setor e ranking de
// sobrecarga. Antes a tela não exibia nenhum indicador.
import { AlertTriangle, CalendarClock, CheckCircle2, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/patterns/StatCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import { formatDuracao, mesExtenso } from "@/lib/horas";
import { cn } from "@/lib/utils";
import {
  porColaborador,
  porDepartamento,
  resumir,
  type HoraExtraRow,
} from "@/components/hora-extra/types";

/** Variação percentual entre dois totais. `null` quando não há base. */
function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function HoraExtraResumo({
  rows,
  loading,
  mesRef,
  minutosMesAnterior,
  comparativoLoading,
  onVerPendentes,
  parte,
}: {
  rows: HoraExtraRow[];
  loading: boolean;
  /** "YYYY-MM" do período exibido. */
  mesRef: string;
  /** Total do mês anterior, em minutos. `null` enquanto carrega ou se falhou. */
  minutosMesAnterior: number | null;
  comparativoLoading: boolean;
  onVerPendentes: () => void;
  /**
   * Qual bloco renderizar. A página separa os dois: os indicadores ficam no
   * cabeçalho fixo, os gráficos rolam com a página. Sem `parte`, os dois.
   */
  parte?: "indicadores" | "graficos";
}) {
  const resumo = resumir(rows);
  const deps = porDepartamento(rows);
  const ranking = porColaborador(rows).slice(0, 5);

  const delta =
    minutosMesAnterior == null
      ? null
      : variacao(resumo.totalMinutos, minutosMesAnterior);

  const maiorDep = deps[0]?.minutos ?? 0;
  const maiorColab = ranking[0]?.minutos ?? 0;

  const comIndicadores = parte !== "graficos";
  const comGraficos = parte !== "indicadores";

  return (
    <div className="space-y-4">
      {comIndicadores && (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Horas planejadas"
          value={formatDuracao(resumo.totalMinutos)}
          loading={loading}
          detail={
            comparativoLoading
              ? "comparando…"
              : delta == null
                ? mesExtenso(mesRef)
                : `vs. mês anterior`
          }
          delta={
            delta == null
              ? undefined
              : {
                  value: `${Math.abs(delta).toFixed(0)}%`,
                  direction: delta >= 0 ? "up" : "down",
                }
          }
          // Mais hora extra é sinal ruim: subir é vermelho.
          deltaTone={delta == null ? "neutral" : delta > 0 ? "danger" : "success"}
        />

        <StatCard
          icon={AlertTriangle}
          label="Aguardando aprovação"
          value={formatDuracao(resumo.pendentesMinutos)}
          loading={loading}
          detail={`${resumo.pendentesQtd} registro(s)`}
          onClick={resumo.pendentesQtd > 0 ? onVerPendentes : undefined}
        />

        <StatCard
          icon={CheckCircle2}
          label="Aprovadas"
          value={formatDuracao(resumo.aprovadosMinutos)}
          loading={loading}
          detail={
            resumo.totalMinutos > 0
              ? `${Math.round((resumo.aprovadosMinutos / resumo.totalMinutos) * 100)}% do total`
              : undefined
          }
        />

        <StatCard
          icon={CalendarClock}
          label="Colaboradores"
          value={String(resumo.colaboradores)}
          loading={loading}
          detail={`em ${resumo.eventos} evento(s)`}
        />
      </div>
      )}

      {comGraficos && (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Horas por setor</CardTitle>
            <p className="text-2xs text-muted-foreground">
              Onde a hora extra está concentrada no período
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : deps.length === 0 ? (
              <EmptyState
                title="Sem horas no período"
                description="Ajuste os filtros para ver a distribuição."
                className="py-6"
              />
            ) : (
              <ul className="space-y-2.5">
                {deps.slice(0, 6).map((d) => (
                  <li key={d.coddep}>
                    <div className="flex items-baseline justify-between gap-3 text-2xs">
                      <span className="truncate text-foreground">{d.descrdep}</span>
                      <span className="tabular shrink-0 font-medium text-muted-foreground">
                        {formatDuracao(d.minutos)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${maiorDep ? (d.minutos / maiorDep) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Maior acúmulo</CardTitle>
            <p className="text-2xs text-muted-foreground">
              Colaboradores com mais horas extras no período
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : ranking.length === 0 ? (
              <EmptyState
                title="Sem colaboradores no período"
                description="Ajuste os filtros para ver o ranking."
                className="py-6"
              />
            ) : (
              <ol className="space-y-2.5">
                {ranking.map((c, i) => (
                  <li key={c.codfunc} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-semibold",
                        i === 0
                          ? "bg-warning-subtle text-warning"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-2xs text-foreground">
                        {c.nomefunc}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            i === 0 ? "bg-warning" : "bg-chart-4"
                          )}
                          style={{
                            width: `${maiorColab ? (c.minutos / maiorColab) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tabular text-2xs font-medium text-foreground">
                        {formatDuracao(c.minutos)}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {c.ocorrencias}×
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
