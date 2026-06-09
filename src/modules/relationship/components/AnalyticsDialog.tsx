"use client";

import { Dialog } from "./Dialog";
import { dealBreakdowns, formatMoney, type ChartRow } from "../lib/stats";
import type { DealSummaryView, RelationshipStats } from "../types";

/** Brand-tinted palette for the pie (raspberry → cotton candy). */
const PIE_COLORS = ["#e30b5d", "#f4729f", "#f9a8c4", "#fbcfe0", "#fde7ef"];

/**
 * The full-analytics dialog (screen ③): KPIs + three bar charts (by deal /
 * quarter / status) + a share-by-deal pie + a takeaway. Cheap, honest live stats
 * for the demo; richer trends/margins/forecasts come later. Degrades to an empty
 * note when there are no deals.
 */
export function AnalyticsDialog({
  open,
  onClose,
  stats,
  deals,
}: {
  open: boolean;
  onClose: () => void;
  stats: RelationshipStats;
  deals: DealSummaryView[];
}) {
  const { byDeal, byQuarter, byStatus } = dealBreakdowns(deals);
  const empty = stats.dealCount === 0;
  const since = new Date(stats.since).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  const kpis: Array<[string, string]> = [
    ["Total", formatMoney(stats.totalValue, stats.currency)],
    ["Deals", String(stats.dealCount)],
    ["Avg deal", stats.avgValue ? formatMoney(stats.avgValue, stats.currency) : "-"],
    ["Largest", stats.largestValue ? formatMoney(stats.largestValue, stats.currency) : "-"],
    ["Active", String(stats.activeCount)],
    ["Since", since],
  ];

  const money = (v: number) => formatMoney(v, stats.currency);

  return (
    <Dialog open={open} onClose={onClose} width="max-w-2xl">
      <div className="mb-1 text-sm font-bold text-ink">
        Full analytics · {stats.dealCount} deal{stats.dealCount === 1 ? "" : "s"}
      </div>
      <p className="mb-3 text-[11px] text-ink/40">
        Demo: simple, cheap stats. Real trends, margins and forecasts come later.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-black/[0.03] px-2 py-2 text-center">
            <div className="text-sm font-bold text-ink">{value}</div>
            <div className="text-[9px] uppercase tracking-wide text-ink/40">{label}</div>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="py-10 text-center text-sm text-ink/40">
          No deals yet - charts appear once business starts.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BarChart title="Business by deal" rows={byDeal} format={money} />
            <PieChart title="Share by deal" rows={byDeal} />
            <BarChart title="Business by quarter" rows={byQuarter} format={money} />
            <BarChart title="Deals by status" rows={byStatus} />
          </div>
          <div className="mt-3 rounded-lg bg-brand/5 px-3 py-2 text-[11px] text-ink/60">
            Takeaway: {byDeal.length} revenue-bearing deal{byDeal.length === 1 ? "" : "s"}, averaging{" "}
            {money(stats.avgValue)} - a restock nudge near the reorder window tends to land well.
          </div>
        </>
      )}
    </Dialog>
  );
}

function BarChart({
  title,
  rows,
  format,
}: {
  title: string;
  rows: ChartRow[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-xl bg-black/[0.03] p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wide text-ink/40">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 truncate text-ink/55">{r.label}</span>
            <div className="h-2.5 flex-1 rounded bg-black/5">
              <div
                className="h-2.5 rounded bg-brand"
                style={{ width: `${Math.round((r.value / max) * 100)}%` }}
              />
            </div>
            <span className="w-16 text-right font-medium text-ink/70">
              {format ? format(r.value) : r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ title, rows }: { title: string; rows: ChartRow[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  // cumulative angles without a mutable accumulator (n is tiny - a handful of deals)
  const segments = rows
    .map((r, i) => {
      const before = rows.slice(0, i).reduce((s, x) => s + x.value, 0);
      const from = (before / total) * 360;
      const to = ((before + r.value) / total) * 360;
      return `${PIE_COLORS[i % PIE_COLORS.length]} ${from}deg ${to}deg`;
    })
    .join(", ");

  return (
    <div className="rounded-xl bg-black/[0.03] p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wide text-ink/40">{title}</div>
      <div className="flex items-center gap-3">
        <div
          className="h-20 w-20 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${segments})` }}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {rows.map((r, i) => (
            <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="flex-1 truncate text-ink/55">{r.label}</span>
              <span className="text-ink/50">{Math.round((r.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
