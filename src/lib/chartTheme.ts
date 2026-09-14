// src/lib/chartTheme.ts
// Tema central do Recharts. Antes cada gráfico repetia tick={{fontSize:10}},
// <CartesianGrid strokeDasharray="3 3"> sem cor e alturas inline.
//
// Os valores lêem os tokens de src/index.css via hsl(var(--x)) — que agora
// existem de verdade. SVG não resolve classes Tailwind, então aqui usamos
// strings CSS, não classNames.

/** Cor de um token, opcionalmente com alfa (0–1). */
export const token = (name: string, alpha?: number): string =>
  alpha == null ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`;

/** Série categórica — usar na ordem, sem pular. */
export const chartColors: string[] = [
  token("chart-1"),
  token("chart-2"),
  token("chart-3"),
  token("chart-4"),
  token("chart-5"),
  token("chart-6"),
];

/** Cor da n-ésima série (cicla). */
export const seriesColor = (i: number): string =>
  chartColors[i % chartColors.length];

/** Cores semânticas para gráficos. */
export const chartSemantic = {
  primary: token("primary"),
  accent: token("accent"),
  success: token("success"),
  warning: token("warning"),
  danger: token("destructive"),
  muted: token("muted-foreground"),
} as const;

/** Props do <CartesianGrid>. */
export const gridProps = {
  stroke: token("border"),
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/** Props comuns de eixo. */
export const axisProps = {
  stroke: token("border"),
  tickLine: false,
  axisLine: false,
  tick: { fill: token("muted-foreground"), fontSize: 11 },
} as const;

/** Estilo do tooltip, alinhado ao <Card>. */
export const tooltipProps = {
  cursor: { fill: token("muted-foreground", 0.08) },
  contentStyle: {
    background: token("popover"),
    border: `1px solid ${token("border")}`,
    borderRadius: "var(--radius)",
    boxShadow:
      "0 10px 32px -8px hsl(var(--foreground) / 0.18), 0 2px 8px -2px hsl(var(--foreground) / 0.08)",
    fontSize: 12,
    color: token("popover-foreground"),
    padding: "8px 10px",
  },
  labelStyle: {
    color: token("muted-foreground"),
    fontSize: 11,
    marginBottom: 4,
  },
  itemStyle: { color: token("popover-foreground"), fontSize: 12 },
  wrapperStyle: { outline: "none" },
} as const;

/** Props da <Legend>. */
export const legendProps = {
  iconType: "circle" as const,
  wrapperStyle: { fontSize: 12, color: token("muted-foreground") },
};

/** Raio padrão do topo de barras verticais / da ponta de barras horizontais. */
export const barRadius = {
  vertical: [6, 6, 0, 0] as [number, number, number, number],
  horizontal: [0, 6, 6, 0] as [number, number, number, number],
};

/** ChartPanels: largura do eixo Y nos dois painéis. Igual = colunas alinhadas. */
export const PANEL_Y_WIDTH = 56;
/** ChartPanels: margem lateral idêntica nos dois painéis. */
export const PANEL_MARGIN = { top: 8, right: 16, left: 8, bottom: 0 } as const;
