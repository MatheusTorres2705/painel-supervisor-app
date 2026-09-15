// src/components/dashboard/AcaoCard.tsx
// Card de "precisa de ação": um número, o que ele significa e o atalho para a
// rotina que resolve. Quando não há nada, diz "em dia" em vez de mostrar zero.
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { toneSurface, toneText, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

export function AcaoCard({
  icon: Icon,
  titulo,
  valor,
  detalhe,
  tom,
  para,
  rotuloLink,
  loading,
  erro,
  emDia,
}: {
  icon: LucideIcon;
  titulo: string;
  valor: string;
  detalhe?: string;
  tom: Tone;
  para: string;
  rotuloLink: string;
  loading: boolean;
  erro?: string | null;
  /** Nada pendente: mostra "em dia" no lugar do número. */
  emDia?: boolean;
}) {
  const tomFinal: Tone = erro ? "neutral" : emDia ? "success" : tom;
  return (
    <Link
      to={para}
      className={cn(
        "group flex min-h-[7.5rem] flex-col justify-between rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-card",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        !loading && !erro && !emDia && tom !== "neutral" ? "border-l-4" : "border-border",
        !loading && !erro && !emDia && tom === "danger" && "border-l-destructive",
        !loading && !erro && !emDia && tom === "warning" && "border-l-warning"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", toneSurface[tomFinal])}>
          {emDia && !loading && !erro ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : erro ? (
        <p className="text-xs text-muted-foreground" title={erro}>Não foi possível carregar.</p>
      ) : (
        <div>
          <p className={cn("tabular text-2xl font-semibold leading-tight", emDia ? "text-success" : toneText[tom] ?? "text-foreground")}>
            {emDia ? "Em dia" : valor}
          </p>
          {detalhe && <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{detalhe}</p>}
        </div>
      )}

      <span className="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-primary">
        {rotuloLink}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
