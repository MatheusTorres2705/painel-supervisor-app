// src/lib/tone.ts
// Vocabulário único de "tom" semântico. Substitui os 7 mapeadores duplicados
// espalhados pelas páginas (disponibilidadeColor, atingimentoTone, comportTone,
// liberadoBadge, badgeStatus, etapaBadgeStyles, statusMeta).
import type { BadgeProps } from "@/components/ui/badge";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Tom -> variante do <Badge>. */
export const toneBadge: Record<Tone, NonNullable<BadgeProps["variant"]>> = {
  neutral: "muted",
  info: "accent",
  success: "success",
  warning: "warning",
  danger: "destructive",
};

/** Tom -> classes para superfícies suaves (faixas, chips, células de tabela). */
export const toneSurface: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-accent-subtle text-accent border-accent/20",
  success: "bg-success-subtle text-success border-success/20",
  warning: "bg-warning-subtle text-warning border-warning/20",
  danger: "bg-destructive-subtle text-destructive border-destructive/20",
};

/** Tom -> cor sólida (barras, pontos, indicadores). */
export const toneSolid: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** Tom -> cor de texto isolada. */
export const toneText: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * Percentual de atingimento -> tom.
 * Regra única do produto: <70% crítico, <90% atenção, <100% ok, >=100% ótimo.
 */
export function toneFromPct(pct: number | null | undefined): Tone {
  if (pct == null || Number.isNaN(pct)) return "neutral";
  if (pct < 70) return "danger";
  if (pct < 90) return "warning";
  if (pct < 100) return "info";
  return "success";
}

/** Sinal de variação (delta) -> tom. `inverse` para métricas em que subir é ruim. */
export function toneFromDelta(delta: number, inverse = false): Tone {
  if (delta === 0) return "neutral";
  const good = inverse ? delta < 0 : delta > 0;
  return good ? "success" : "danger";
}
