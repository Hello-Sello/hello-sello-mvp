"use client";

/**
 * Deal card - BACK (3a, Phase 4): a two-tab panel (the VS Code-style switch).
 *   - Signals: Sella's advisory per-side read (seeded in 3a, Sella-written 4d)
 *   - Logs: the REAL version history from deal_card_log (FR-D5)
 * Signals is the default tab. Fills the flip box (h-full) behind the front.
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
    <div className="flex h-full w-[340px] flex-col rounded-3xl border border-brand/15 bg-[#ffe2ee] p-3 shadow-xl ring-1 ring-black/5">
      {/* tab switch */}
      <div className="flex gap-1 rounded-xl bg-white p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === id ? "bg-brand text-white" : "text-ink/55 hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {/* tab body */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {tab === "signals" ? (
          <SignalsTab signals={data.signals} side={data.viewerSide} />
        ) : (
          <LogsTab log={data.log} />
        )}
      </div>
    </div>
  );
}
