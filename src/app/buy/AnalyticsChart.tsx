"use client";

/**
 * Buy — Analytics/Sheet merged card's graph half (hand-rolled inline-SVG,
 * ports `prototypes/buy-prototype/index.html`'s `renderChart()` coordinate
 * math). 18-RESEARCH.md's "Alternatives Considered" concluded a hand-rolled
 * SVG renderer is LESS total code than wiring + overriding a generic charting
 * library for this chart's bespoke interaction model (bar<->line mode
 * switching per clicked column, stacked-bar-collapse-to-total at >6 products,
 * axis-never-changes-only-data-changes) — no recharts/chart.js/visx here.
 *
 * Presentational only — receives already-aggregated `series` + the selected
 * `measure` from its parent (`PartnersAnalyticsCard`, plan 18-12), which owns
 * filter/row-selection state and the toast shown for the non-chartable
 * columns (margin %/qty/share, per 18-CONTEXT.md). Those three are
 * deliberately absent from `ChartMeasure` below, so that invalid state is
 * unrepresentable here rather than defended against at render time.
 */

import type { JSX } from "react";

export type ChartMeasure =
  | "price_by_volume" // default: bars = volume, line = weighted-avg price
  | "revenue"
  | "db1_total"
  | "wap"
  | "net"
  | "gross";

export interface ChartSeriesPoint {
  label: string; // e.g. "Feb", "Wk 14", "12-Apr"
  /** Per-product breakdown when >1 product in scope (up to 6 render stacked; more collapse). */
  byProduct: Array<{ productId: string; productName: string; value: number }>;
  /** The weighted-avg-price line value for this point (only meaningful in price_by_volume mode). */
  weightedAvgPrice: number | null;
}

/** Human label for the line-overlay legend entry, keyed by the selected measure. */
export const MEASURE_LABELS: Record<ChartMeasure, string> = {
  price_by_volume: "Price by volume",
  revenue: "Revenue",
  db1_total: "DB1 total",
  wap: "Avg purchase price EUR/g",
  net: "Net price to end customer",
  gross: "Gross price to patient",
};

/* ------------------------------------------------------------------------
   SVG geometry — direct port of the prototype's renderChart() coordinate
   math (W/H/margins, xc(i), y2(v), bw), translated from imperative
   innerHTML-string building to values a JSX <svg> renders declaratively.
   ------------------------------------------------------------------------ */

const VIEWBOX_W = 880;
const VIEWBOX_H = 290;
const MARGIN_LEFT = 64;
const MARGIN_TOP = 18;
const MARGIN_BOTTOM = 34;
const MARGIN_RIGHT_WITH_LINE = 58;
const MARGIN_RIGHT_NO_LINE = 20;

/** Up to this many products in scope stack per bar; more collapse to one total bar. */
export const MAX_STACK_PRODUCTS = 6;

/** Stacked-bar palette, ports the prototype's STACK_COLORS (pink brand family). */
export const STACK_COLORS = ["#f9a8d4", "#ec4899", "#a21caf", "#8b5cf6", "#6d28d9", "#db2777"];

export interface ChartGeometry {
  plotWidth: number;
  plotHeight: number;
  marginRight: number;
}

/** Derives the plot rect; the right margin widens when a price line is drawn (its own axis). */
export function computeGeometry(hasLine: boolean): ChartGeometry {
  const marginRight = hasLine ? MARGIN_RIGHT_WITH_LINE : MARGIN_RIGHT_NO_LINE;
  return {
    plotWidth: VIEWBOX_W - MARGIN_LEFT - marginRight,
    plotHeight: VIEWBOX_H - MARGIN_TOP - MARGIN_BOTTOM,
    marginRight,
  };
}

/** Bar-column center x for point `i` of `n` (prototype's `xc(i)`). */
export function xForPoint(i: number, n: number, geom: ChartGeometry): number {
  return MARGIN_LEFT + (geom.plotWidth * (i + 0.5)) / n;
}

/** Stacked-bar width, capped at 46px (prototype's `bw`). */
export function barWidthFor(n: number, geom: ChartGeometry): number {
  return Math.min(46, (geom.plotWidth / n) * 0.55);
}

/** y for a bar value against the shared euro scale (prototype's `y2(v)`). */
export function yForValue(value: number, maxValue: number, geom: ChartGeometry): number {
  return MARGIN_TOP + geom.plotHeight * (1 - value / maxValue);
}

export interface ProductKey {
  productId: string;
  productName: string;
}

/** Union of every product seen across the series, first-seen order — drives the stack-vs-collapse decision. */
export function collectProductKeys(series: ChartSeriesPoint[]): ProductKey[] {
  const seen = new Map<string, ProductKey>();
  for (const point of series) {
    for (const p of point.byProduct) {
      if (!seen.has(p.productId)) seen.set(p.productId, { productId: p.productId, productName: p.productName });
    }
  }
  return Array.from(seen.values());
}

/** Sum of a point's per-product values (the collapsed-to-total bar height, or the stacked-bar top). */
export function pointTotal(point: ChartSeriesPoint): number {
  return point.byProduct.reduce((sum, p) => sum + p.value, 0);
}

/** Per-point value for one product key (0 if that product had no activity this period). */
export function valueFor(point: ChartSeriesPoint, productId: string): number {
  return point.byProduct.find((p) => p.productId === productId)?.value ?? 0;
}

export interface LineScale {
  min: number;
  max: number;
}

/**
 * The weighted-avg-price line's own y-scale (prototype's `pMin`/`pMax`, incl.
 * the <0.2-EUR-range widen so a near-flat line isn't visually a hairline).
 */
export function lineScaleFor(values: number[]): LineScale {
  const min = Math.min(...values) * 0.9;
  let max = Math.max(...values) * 1.1;
  let paddedMin = min;
  if (max - min < 0.2) {
    paddedMin = min - 0.1;
    max += 0.1;
  }
  return { min: paddedMin, max };
}

/** y for a weighted-avg-price value against its own (not the bar) scale (prototype's `yp(v)`). */
export function yForLineValue(value: number, scale: LineScale, geom: ChartGeometry): number {
  return MARGIN_TOP + geom.plotHeight * (1 - (value - scale.min) / (scale.max - scale.min));
}

/**
 * Decides stack (<=6 products, colour-per-product) vs collapse (>6, one
 * total bar per point) — the prototype's `series.length > 6` branch.
 */
export function shouldStack(productKeys: ProductKey[]): boolean {
  return productKeys.length > 0 && productKeys.length <= MAX_STACK_PRODUCTS;
}

export function AnalyticsChart(props: {
  measure: ChartMeasure;
  series: ChartSeriesPoint[];
  title: string; // dynamic heading, e.g. "Price by volume — Cantouring — Driftwood Diesel"
  subtitle: string; // e.g. "1 supplier · 1 product · last month · 1000 g packs"
  onResetToDefault?: () => void; // renders the "x back to Price by volume" reset chip when measure !== "price_by_volume"
}): JSX.Element {
  const { title, subtitle } = props;
  // Task 2 fills in the real bar/line render; kept as a minimal, valid
  // component here so the type contracts + geometry helpers above are
  // independently type-checkable before the JSX render lands.
  return (
    <div className="flex flex-col gap-2" data-testid="analytics-chart">
      <h3 className="text-[15px] font-bold text-ink">{title}</h3>
      <p className="text-[11.5px] text-ink-muted">{subtitle}</p>
    </div>
  );
}
