import type { CSSProperties } from "react";

/**
 * Same stack as `tailwind.config` `fontFamily.sans` — Recharts renders SVG text
 * and does not inherit `body` font automatically.
 */
export const CHART_FONT_FAMILY = "var(--font-inter), system-ui, sans-serif";

/** Default axis tick style (muted colour matches existing charts). */
export const chartAxisTick = {
  fill: "#8b91a1",
  fontSize: 10,
  fontFamily: CHART_FONT_FAMILY,
} as const;

/** Shared fields for Recharts `label` on XAxis / YAxis. */
export const chartAxisLabelBase = {
  fill: "#8b91a1",
  fontSize: 11,
  fontFamily: CHART_FONT_FAMILY,
} as const;

export const chartTooltipContentStyle: CSSProperties = {
  background: "#111318",
  border: "1px solid #2a2f3d",
  borderRadius: 8,
  fontFamily: CHART_FONT_FAMILY,
};

export const chartLegendWrapperStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: CHART_FONT_FAMILY,
};
