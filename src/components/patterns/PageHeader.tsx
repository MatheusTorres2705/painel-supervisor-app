import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página: título, descrição e slot de ações/filtros.
 * Padroniza o topo das 11 páginas.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Botões à direita (exportar, atualizar, criar). */
  actions?: React.ReactNode;
  className?: string;
  /** Barra de filtros, renderizada abaixo do título. */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
          {children}
        </div>
      ) : null}
    </header>
  );
}
