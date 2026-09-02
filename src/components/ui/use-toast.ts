// src/components/ui/use-toast.ts
// Contexto e hook num arquivo separado de toast.tsx para não quebrar o
// Fast Refresh (um arquivo de componentes só deve exportar componentes).
import * as React from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms; 0 mantém aberto até o usuário fechar. Erros ficam abertos por padrão. */
  duration?: number;
};

export type ToastContextValue = {
  toast: (t: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

export const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}
