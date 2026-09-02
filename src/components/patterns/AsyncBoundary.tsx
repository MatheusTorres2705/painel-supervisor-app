// src/components/patterns/AsyncBoundary.tsx
// Cadeia carregando -> erro -> vazio -> dados, num só lugar.
// Estava repetida ~12x só no DashboardPage.
import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/EmptyState";
import { cn } from "@/lib/utils";

export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  emptyTitle = "Nada por aqui",
  emptyDescription,
  emptyIcon,
  onRetry,
  skeleton,
  className,
  children,
}: {
  loading: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  onRetry?: () => void;
  /** Esqueleto sob medida; por padrão, 4 linhas de texto. */
  skeleton?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const busy = loading;

  return (
    <div
      className={cn("h-full", className)}
      aria-busy={busy || undefined}
      // Resultado de carregamento passa a ser anunciado — antes, nunca era.
      aria-live="polite"
    >
      {busy ? (
        (skeleton ?? <SkeletonText lines={4} className="p-1" />)
      ) : error ? (
        <div className="flex h-full items-center justify-center p-2">
          <Alert variant="destructive" title="Não foi possível carregar">
            <div className="space-y-2">
              <p>{error}</p>
              {onRetry ? (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              ) : null}
            </div>
          </Alert>
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Recarregar
              </Button>
            ) : undefined
          }
        />
      ) : (
        children
      )}
    </div>
  );
}
