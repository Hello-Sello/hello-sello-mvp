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
import { formatMoney } from "@/modules/deals";

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

/** Heading row: dynamic title/subtitle + the optional "back to default" reset chip. */
function ChartHeading({
  title,
  subtitle,
  onResetToDefault,
}: {
  title: string;
  subtitle: string;
  onResetToDefault?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        <p className="text-[11.5px] text-ink-muted">{subtitle}</p>
      </div>
      {onResetToDefault && (
        <button
          type="button"
          onClick={onResetToDefault}
          className="shrink-0 rounded-full bg-ink/5 px-3 py-1 text-[11px] font-bold text-ink-muted transition-colors hover:bg-ink/10"
        >
          × back to Price by volume
        </button>
      )}
    </div>
  );
}

/** Native `<title>` hover breakdown for a bar column (prototype's `.vb-hit` mousemove tooltip). */
function tooltipText(point: ChartSeriesPoint, total: number): string {
  const rows = point.byProduct.filter((p) => p.value > 0).map((p) => `${p.productName}: ${formatMoney(p.value)}`);
  const header = `${point.label} · ${formatMoney(total)}`;
  return rows.length ? `${header}\n${rows.join("\n")}` : header;
}

export function AnalyticsChart(props: {
  measure: ChartMeasure;
  series: ChartSeriesPoint[];
  title: string; // dynamic heading, e.g. "Price by volume — Cantouring — Driftwood Diesel"
  subtitle: string; // e.g. "1 supplier · 1 product · last month · 1000 g packs"
  onResetToDefault?: () => void; // renders the "x back to Price by volume" reset chip when measure !== "price_by_volume"
}): JSX.Element {
  const { measure, series, title, subtitle, onResetToDefault } = props;
  const n = series.length;
  const showResetChip = measure !== "price_by_volume" ? onResetToDefault : undefined;

  if (n === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="analytics-chart">
        <ChartHeading title={title} subtitle={subtitle} onResetToDefault={showResetChip} />
        <p className="rounded-2xl bg-white/70 p-6 text-center text-[13px] text-ink-muted">
          No purchase data in scope yet.
        </p>
      </div>
    );
  }

  const productKeys = collectProductKeys(series);
  const stacked = shouldStack(productKeys);
  const totals = series.map((point) => pointTotal(point));
  const maxValue = Math.max(...totals, 1) * 1.15;

  // Weighted-avg-price line overlay: dots for every non-null point, but a
  // connecting polyline needs >=2 points (mirrors the prototype's own
  // `pts.length > 1` guard — a lone point still gets its dot, just no line).
  const lineValues = series.map((point) => point.weightedAvgPrice).filter((v): v is number => v != null);
  const hasLine = lineValues.length > 0;
  const canConnectLine = lineValues.length > 1;
  const geom = computeGeometry(hasLine);
  const barWidth = barWidthFor(n, geom);
  const lineScale = hasLine ? lineScaleFor(lineValues) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="analytics-chart">
      <ChartHeading title={title} subtitle={subtitle} onResetToDefault={showResetChip} />

      <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} className="w-full" role="img" aria-label={title}>
        {/* horizontal gridlines + euro axis labels, ports the prototype's [0,.25,.5,.75,1] loop */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const value = maxValue * f;
          const y = yForValue(value, maxValue, geom);
          return (
            <g key={f}>
              <line x1={MARGIN_LEFT} x2={VIEWBOX_W - geom.marginRight} y1={y} y2={y} stroke="#eef2f7" />
              <text x={MARGIN_LEFT - 8} y={y + 3} textAnchor="end" className="fill-ink-muted text-[9px]">
                {formatMoney(value)}
              </text>
            </g>
          );
        })}

        {/* bars: stacked per product (<=6 in scope) or one collapsed total bar (>6) */}
        {series.map((point, i) => {
          const x = xForPoint(i, n, geom);
          let acc = 0;
          return (
            <g key={`${point.label}-${i}`}>
              {stacked
                ? productKeys.map((key, si) => {
                    const value = valueFor(point, key.productId);
                    if (value <= 0) return null;
                    const yTop = yForValue(acc + value, maxValue, geom);
                    const yBot = yForValue(acc, maxValue, geom);
                    acc += value;
                    return (
                      <rect
                        key={key.productId}
                        x={x - barWidth / 2}
                        y={yTop}
                        width={barWidth}
                        height={Math.max(1.5, yBot - yTop)}
                        rx={3}
                        fill={STACK_COLORS[si % STACK_COLORS.length]}
                      />
                    );
                  })
                : totals[i] > 0 && (
                    <rect
                      x={x - barWidth / 2}
                      y={yForValue(totals[i], maxValue, geom)}
                      width={barWidth}
                      height={Math.max(1.5, yForValue(0, maxValue, geom) - yForValue(totals[i], maxValue, geom))}
                      rx={3}
                      fill={STACK_COLORS[0]}
                    />
                  )}
              <title>{tooltipText(point, totals[i])}</title>
              <text x={x} y={VIEWBOX_H - 10} textAnchor="middle" className="fill-ink-muted text-[9px]">
                {point.label}
              </text>
            </g>
          );
        })}

        {/* weighted-avg-price line overlay, own right-hand axis */}
        {hasLine && lineScale && (
          <>
            {[0, 0.5, 1].map((f) => {
              const value = lineScale.min + (lineScale.max - lineScale.min) * f;
              const y = yForLineValue(value, lineScale, geom);
              return (
                <text
                  key={f}
                  x={VIEWBOX_W - geom.marginRight + 8}
                  y={y + 3}
                  className="text-[9px]"
                  style={{ fill: "#a78bfa" }}
                >
                  {formatMoney(value)}
                </text>
              );
            })}
            {canConnectLine && (
              <polyline
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2}
                points={series
                  .map((point, i) =>
                    point.weightedAvgPrice == null
                      ? null
                      : `${xForPoint(i, n, geom)},${yForLineValue(point.weightedAvgPrice, lineScale, geom)}`,
                  )
                  .filter((p): p is string => p != null)
                  .join(" ")}
              />
            )}
            {series.map((point, i) =>
              point.weightedAvgPrice == null ? null : (
                <circle
                  key={`dot-${i}`}
                  cx={xForPoint(i, n, geom)}
                  cy={yForLineValue(point.weightedAvgPrice, lineScale, geom)}
                  r={3}
                  fill="#7c3aed"
                />
              ),
            )}
          </>
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 text-[10.5px] font-semibold text-ink-muted">
        {stacked ? (
          productKeys.map((key, si) => (
            <span key={key.productId} className="inline-flex items-center gap-1.5">
              <i
                className="inline-block h-2.5 w-2.5 rounded-[3px]"
                style={{ background: STACK_COLORS[si % STACK_COLORS.length] }}
              />
              {key.productName}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: STACK_COLORS[0] }} />
            Total ({productKeys.length} products)
          </span>
        )}
        {hasLine && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[2px] w-3.5" style={{ background: "#7c3aed" }} />
            {MEASURE_LABELS[measure]} (weighted avg)
          </span>
        )}
      </div>
    </div>
  );
}
