"use client";

import { Sparkles } from "lucide-react";
import { Dialog } from "./Dialog";
import { formatMoney } from "../lib/stats";
import type { RelationshipStats, RelationshipView } from "../types";

/**
 * The relationship-level Sella dialog (screen ③): "what's happening" (facts read
 * off the relationship) + "how to grow this relationship" (action cards). This
 * is the WHOLE-relationship read - distinct from the per-deal card-back signals.
 * Demo content is illustrative; real recommendations would draw on deal history,
 * stock and timing.
 */
export function SellaInsightDialog({
  open,
  onClose,
  relationship,
  stats,
}: {
  open: boolean;
  onClose: () => void;
  relationship: RelationshipView;
  stats: RelationshipStats;
}) {
  const them = relationship.them.name;
  const empty = stats.dealCount === 0;

  const happening = empty
    ? [`You connected with ${them} - no deals or shared history yet.`]
    : [
        `${stats.dealCount} deal${stats.dealCount === 1 ? "" : "s"} worth ${formatMoney(
          stats.totalValue,
          stats.currency,
        )} so far.`,
        stats.activeCount > 0
          ? `${stats.activeCount} active right now; largest single deal ${formatMoney(
              stats.largestValue,
              stats.currency,
            )}.`
          : `Nothing active right now - the last deal has wrapped.`,
      ];

  const grow: Array<[string, string]> = empty
    ? [
        ["Share your price list", "Give them something concrete to react to."],
        ["Start a deal", "Open the first basket and get the relationship moving."],
      ]
    : [
        ["Propose a framework", "Lock in volume across the next couple of quarters."],
        ["Nudge a restock", "A gentle offer near their reorder window tends to land."],
        ["Add agreed terms", "Standing terms become defaults on every new deal."],
      ];

  return (
    <Dialog open={open} onClose={onClose} width="max-w-lg">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
          <Sparkles size={15} strokeWidth={2} />
        </span>
        <div>
          <div className="text-sm font-bold text-ink">Sella · relationship insight</div>
          <div className="text-[11px] text-ink/40">
            {relationship.companies[0].name} · {relationship.companies[1].name}
          </div>
        </div>
      </div>

      <Section title="What's happening">
        <ul className="space-y-1">
          {happening.map((line, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-ink/70">
              <span className="mt-0.5 text-brand/60">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How to grow this relationship">
        <div className="space-y-1.5">
          {grow.map(([title, sub]) => (
            <button
              key={title}
              type="button"
              className="w-full rounded-lg bg-black/[0.03] px-3 py-2 text-left transition hover:bg-brand/5"
            >
              <div className="text-[12px] font-medium text-ink">{title}</div>
              <div className="text-[11px] text-ink/50">{sub}</div>
            </button>
          ))}
        </div>
      </Section>

      <p className="mt-3 text-[11px] text-ink/35">
        Demo: illustrative. Real recommendations draw on deal history, stock levels and timing.
      </p>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-ink/40">{title}</div>
      {children}
    </div>
  );
}
