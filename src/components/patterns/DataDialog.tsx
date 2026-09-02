// src/components/patterns/DataDialog.tsx
// Modal de listagem com cabeçalho, resumo, rolagem e os 4 estados.
// Os 4 modais do Dashboard eram ~300 linhas da mesma estrutura.
import * as React from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/patterns/AsyncBoundary";
import { cn } from "@/lib/utils";

export type DataColumn<T> = {
  /** Cabeçalho da coluna. */
  header: string;
  /** Largura em colunas de um grid de 12. */
  span: number;
  /** Célula. */
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Aplica text-muted-foreground na célula. */
  muted?: boolean;
};

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  rows,
  columns,
  loading,
  error,
  onRetry,
  summary,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription,
  emptyIcon,
  rowKey,
  size = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  rows: T[];
  columns: DataColumn<T>[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Chip à direita do contador, ex.: "Total HH: 128". */
  summary?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  rowKey?: (row: T, index: number) => React.Key;
  size?: "md" | "lg" | "xl";
}) {
  const maxWidth = {
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  }[size];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(maxWidth, "max-h-[90vh] overflow-hidden")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border">
          {/* Faixa de resumo */}
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2.5 text-2xs">
            <span className="text-muted-foreground">
              {loading
                ? "Carregando…"
                : error
                  ? "Erro ao carregar"
                  : `${rows.length} registro(s)`}
            </span>
            <div className="flex items-center gap-2">
              {!loading && !error && summary ? (
                <Badge variant="secondary">{summary}</Badge>
              ) : null}
              {onRetry ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRetry}
                  aria-label="Recarregar"
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <ScrollArea className="max-h-[min(60vh,420px)]">
            <AsyncBoundary
              loading={loading}
              error={error}
              isEmpty={rows.length === 0}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
              emptyIcon={emptyIcon}
              onRetry={onRetry}
              skeleton={
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              }
            >
              {/* min-w garante rolagem horizontal em vez de colunas esmagadas. */}
              <div className="min-w-[640px]">
                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-border bg-card/95 px-4 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {columns.map((c, i) => (
                    <div
                      key={i}
                      className={alignClass[c.align ?? "left"]}
                      // Grid inline: `col-span-${n}` seria purgado pelo JIT.
                      style={{ gridColumn: `span ${c.span} / span ${c.span}` }}
                    >
                      {c.header}
                    </div>
                  ))}
                </div>

                {rows.map((row, idx) => (
                  <div
                    key={rowKey ? rowKey(row, idx) : idx}
                    className="grid grid-cols-12 gap-2 border-b border-border px-4 py-2.5 text-sm last:border-b-0 hover:bg-muted/40"
                  >
                    {columns.map((c, i) => (
                      <div
                        key={i}
                        className={cn(
                          alignClass[c.align ?? "left"],
                          c.muted && "text-muted-foreground",
                          (c.align === "right" || c.muted) && "tabular"
                        )}
                        style={{ gridColumn: `span ${c.span} / span ${c.span}` }}
                      >
                        {c.cell(row, idx)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </AsyncBoundary>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
