// src/components/ui/chip.tsx
// Chip de seleção (filtro de escopo, galpão, setor). Saiu da tela OPE quando a
// Meta de Produção passou a filtrar galpão do mesmo jeito.
import * as React from "react";

import { cn } from "@/lib/utils";

export function Chip({
  ativo,
  onClick,
  children,
  title,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={title}
      className={cn(
        // min-h-9: alvo de toque — no painel-diretoria eram 18px, impossíveis de acertar no tablet.
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-2xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ativo
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
