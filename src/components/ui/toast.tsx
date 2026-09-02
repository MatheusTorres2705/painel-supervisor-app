// src/components/ui/toast.tsx
// Sistema de notificação. Substitui as 26 chamadas de window.alert(),
// inclusive nos caminhos de sucesso.
import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ToastContext,
  type Toast,
  type ToastContextValue,
  type ToastInput,
  type ToastVariant,
} from "@/components/ui/use-toast";

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((input: ToastInput) => {
    const variant = input.variant ?? "info";
    const item: Toast = {
      id: nextId++,
      title: input.title,
      description: input.description,
      variant,
      // Erro exige leitura: não some sozinho.
      duration: input.duration ?? (variant === "error" ? 0 : 5000),
    };
    setToasts((prev) => [...prev, item]);
  }, []);

  const success = React.useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "success" }),
    [toast]
  );

  const error = React.useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "error" }),
    [toast]
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({ toast, success, error, dismiss }),
    [toast, success, error, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const icons: Record<ToastVariant, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const accents: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-accent",
};

const bars: Record<ToastVariant, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-accent",
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      // `polite` para não interromper o que o leitor de tela está falando.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 sm:bottom-4 sm:right-4 sm:p-0"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const { id, duration } = toast;

  React.useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const Icon = icons[toast.variant];

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border border-border bg-popover p-4 pr-10 text-popover-foreground shadow-overlay",
        "animate-in slide-in-from-bottom-2 fade-in-0"
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1", bars[toast.variant])}
      />
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", accents[toast.variant])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-2xs text-muted-foreground break-words">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Fechar notificação"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
