import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * <select> nativo estilizado com os tokens. Nativo de propósito: no tablet
 * do chão de fábrica o seletor do sistema operacional é melhor que um menu
 * customizado. Rotule sempre via <Field>.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full appearance-none rounded-md border border-input bg-card px-3 py-1 pr-9 text-sm text-foreground shadow-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
Select.displayName = "Select";
