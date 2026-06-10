import { Sparkles } from "lucide-react";
import { formatMoney } from "../lib/stats";
import type { RelationshipStats, RelationshipView } from "../types";

/**
 * The top band's two overview boxes, side by side (prototype screen ③):
 *   - Sella insight  = a relationship-level read (NOT per-deal)
 *   - Analytics      = cheap live KPIs
 * Each has a "more →" button that opens a dialog in Phase 7; for now the button
 * is rendered but inert (onOpen optional).
 */
export function OverviewBoxes({
  relationship,
  stats,
  onOpenSella,
  onOpenAnalytics,
}: {
  relationship: RelationshipView;
  stats: RelationshipStats;
  onOpenSella?: () => void;
  onOpenAnalytics?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <SellaBox relationship={relationship} stats={stats} onOpen={onOpenSella} />
      <AnalyticsBox stats={stats} onOpen={onOpenAnalytics} />
    </div>
  );
}

function sellaInsight(themName: string, stats: RelationshipStats): string {
  if (stats.dealCount === 0) {
    return `You just connected with ${themName}. No history yet - share a price list or start a deal to get going.`;
  }
  return `${stats.dealCount} deal${stats.dealCount === 1 ? "" : "s"} worth ${formatMoney(
    stats.totalValue,
    stats.currency,
  )} so far. This box is my read on the whole relationship - not any one deal.`;
}

function SellaBox({
  relationship,
  stats,
  onOpen,
}: {
  relationship: RelationshipView;
  stats: RelationshipStats;
  onOpen?: () => void;
}) {
  return (
    <div className="glass flex flex-col rounded-3xl p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
          <Sparkles size={14} strokeWidth={2} />
        </span>
        <span className="text-sm font-semibold text-ink">Sella insight</span>
        <span className="ml-auto text-[9px] uppercase tracking-wide text-brand/50">
          relationship-level
        </span>
      </div>
      <p className="flex-1 text-[13px] text-ink/70">
        {sellaInsight(relationship.them.name, stats)}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 self-start text-[11px] font-medium text-brand transition hover:underline"
      >
        More insight →
      </button>
    </div>
  );
}

function AnalyticsBox({
  stats,
  onOpen,
}: {
  stats: RelationshipStats;
  onOpen?: () => void;
}) {
  const since = new Date(stats.since).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
  const kpis: Array<[string, string]> = [
    ["Total business", formatMoney(stats.totalValue, stats.currency)],
    ["Deals", String(stats.dealCount)],
    ["Avg deal", stats.avgValue ? formatMoney(stats.avgValue, stats.currency) : "-"],
    ["Since", since],
  ];

  return (
    <div className="glass flex flex-col rounded-3xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">Analytics</span>
        <span className="ml-auto text-[9px] uppercase tracking-wide text-ink/30">overview</span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {kpis.map(([label, value]) => (
          <div key={label}>
            <div className="text-base font-bold text-ink">{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink/40">{label}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 self-start text-[11px] font-medium text-brand transition hover:underline"
      >
        Full analytics →
      </button>
    </div>
  );
}
