// src/components/patterns/StatCard.tsx
// Card de métrica. Este componente existia 5 vezes no código (1 no Dashboard,
// 4 inline no FuncionarioDetalhe, 1 no Piramide).
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toneText, type Tone } from "@/lib/tone";

export function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  delta,
  deltaTone = "neutral",
  tone,
  loading,
  onClick,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  /** Linha auxiliar sob o número. */
  detail?: React.ReactNode;
  /** Ex.: "+4,2%". Renderiza uma seta conforme o sinal. */
  delta?: { value: string; direction: "up" | "down" };
  deltaTone?: Tone;
  /** Colore o próprio número (ex.: atingimento acima/abaixo da meta). */
  tone?: Tone;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const clickable = Boolean(onClick);
  const Wrapper = clickable ? "button" : "div";

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-0 transition-shadow",
        clickable && "hover:shadow-overlay",
        className
      )}
    >
      {/* Barra de acento — a assinatura visual do painel. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-accent"
      />

      <Wrapper
        {...(clickable
          ? { type: "button" as const, onClick }
          : {})}
        className={cn(
          "flex w-full items-start justify-between gap-3 p-4 pl-5 text-left",
          clickable &&
            "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>

          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p
              className={cn(
                "tabular whitespace-nowrap text-3xl font-semibold leading-none",
                tone ? toneText[tone] : "text-foreground"
              )}
            >
              {value}
            </p>
          )}

          {loading ? (
            <Skeleton className="h-3 w-16" />
          ) : (
            <div className="flex items-start gap-2 text-2xs">
              {delta ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    toneText[deltaTone]
                  )}
                >
                  {delta.direction === "up" ? (
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  {delta.value}
                </span>
              ) : null}
              {detail ? (
                // Até duas linhas: explicações de indicador ("ponto − atividades −
                // perdas…") perdiam o sentido cortadas numa só. O texto inteiro
                // fica no `title`.
                <span
                  className="line-clamp-2 min-w-0 text-muted-foreground"
                  title={typeof detail === "string" ? detail : undefined}
                >
                  {detail}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {Icon ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </Wrapper>
    </Card>
  );
}
