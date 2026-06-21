"use client";

/**
 * Deal card - BACK (V3 restyle, Phase 4 S2): a two-tab panel (D-14 - kept rich,
 * NOT collapsed to V3's history-only back).
 *   - Signals: Sella's advisory per-side read (seeded in 3a, Sella-written 4d)
 *   - Logs: the REAL version history from deal_card_log (FR-D5)
 * Signals is the default tab. Cross-fades in behind the front (DealCard), so it
 * matches the front's width (390px) + min-height for clean cross-fade alignment.
 *
 * Restyled to the V3 vocabulary: white card, maroon-accented heading, hairline
 * dividers, the same dense rhythm as the front. The tab icons stay Sparkles /
 * ScrollText (icon-as-DATA: Signals / Logs) - only the chrome is restyled.
 */
import { useState } from "react";
import { Sparkles, ScrollText } from "lucide-react";
import { SignalsTab } from "./SignalsTab";
import { LogsTab } from "./LogsTab";
import type { DealCardView } from "../types";

type Tab = "signals" | "logs";

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: "signals", label: "Signals", icon: Sparkles },
  { id: "logs", label: "Logs", icon: ScrollText },
];

export function CardBack({ data }: { data: DealCardView }) {
  const [tab, setTab] = useState<Tab>("signals");

  return (
    <div className="flex min-h-[640px] w-full max-w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
      {/* slim SHADED heading band (matches the front's V4 signature) */}
      <div
        className="rounded-t-3xl px-12 pb-4 pt-4 text-center"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-brand-deep) 15%, #fff) 0%, color-mix(in srgb, var(--color-brand-soft) 34%, #fff) 100%)",
        }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-deep">
          {tab === "signals" ? "Signals" : "Version history"}
        </div>
        <div className="mt-0.5 text-[13px] font-bold tracking-wide tabular-nums text-ink">
          {data.card.hs_deal_number ?? "Deal"}
        </div>
      </div>

      {/* tab switch - hairline, V3 vocabulary */}
      <div className="mx-4 mt-3 flex gap-1 border-b border-ink/10 pb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === id ? "bg-brand-deep text-white" : "text-ink/55 hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* tab body */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === "signals" ? (
          <SignalsTab signals={data.signals} side={data.viewerSide} />
        ) : (
          <LogsTab log={data.log} />
        )}
      </div>
    </div>
  );
}
