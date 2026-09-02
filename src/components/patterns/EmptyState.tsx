import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio padronizado. Antes eram 37 strings "Nenhum…" com 5 paddings
 * diferentes e sem ícone nem ação.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-2xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
