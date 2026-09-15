// src/components/dashboard/BlocoDashboard.tsx
// Moldura dos blocos de detalhe: título, atalho "ver tudo" e o próprio estado de
// carregamento/erro — um bloco com falha não derruba os outros.
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { AsyncBoundary } from "@/components/patterns/AsyncBoundary";

export function BlocoDashboard({
  titulo,
  subtitulo,
  para,
  rotuloLink = "Ver tudo",
  loading,
  erro,
  vazio,
  vazioTitulo,
  vazioDescricao,
  vazioIcone,
  onRetry,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  para: string;
  rotuloLink?: string;
  loading: boolean;
  erro?: string | null;
  vazio: boolean;
  vazioTitulo: string;
  vazioDescricao?: string;
  vazioIcone?: LucideIcon;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
          {subtitulo && <p className="text-2xs text-muted-foreground">{subtitulo}</p>}
        </div>
        <Link
          to={para}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {rotuloLink} <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex-1 p-2">
        <AsyncBoundary
          loading={loading}
          error={erro}
          isEmpty={vazio}
          emptyTitle={vazioTitulo}
          emptyDescription={vazioDescricao}
          emptyIcon={vazioIcone}
          onRetry={onRetry}
        >
          {children}
        </AsyncBoundary>
      </div>
    </Card>
  );
}
