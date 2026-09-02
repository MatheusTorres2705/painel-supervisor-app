import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-accent/25 bg-accent-subtle text-foreground",
        success: "border-success/25 bg-success-subtle text-foreground",
        warning: "border-warning/25 bg-warning-subtle text-foreground",
        destructive: "border-destructive/25 bg-destructive-subtle text-foreground",
      },
    },
    defaultVariants: { variant: "destructive" },
  }
);

const icons: Record<string, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
};

const iconTone: Record<string, string> = {
  info: "text-accent",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

/**
 * Mensagem de estado. Substitui os ~17 `text-sm text-red-600` soltos.
 * `role="alert"` faz o leitor de tela anunciar — antes nada era anunciado.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "destructive", title, children, ...props }, ref) => {
    const key = variant ?? "destructive";
    const Icon = icons[key];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconTone[key])} />
        <div className="min-w-0 flex-1">
          {title ? <p className="font-medium">{title}</p> : null}
          {children ? (
            <div className={cn("text-muted-foreground", title && "mt-0.5")}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert";
