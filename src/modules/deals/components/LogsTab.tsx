/**
 * Deal card back - Logs tab (3a, Phase 4).
 *
 * The REAL version history, read from deal_card_log (newest first): each entry
 * is a version, a one-line change summary, and who made it (a person, Sella, or
 * the system) + where it came from. This is the card's audit-friendly back
 * (FR-D5). Empty until a draft/version is written (Phase 6/7) or seeded.
 */
import { Sparkles, User, Cog, type LucideIcon } from "lucide-react";
import type { LogAuthor, LogEntry } from "../types";

const ACTOR_ICON: Record<LogAuthor, LucideIcon> = {
  sella: Sparkles,
  person: User,
  system: Cog,
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function LogsTab({ log }: { log: LogEntry[] }) {
  if (log.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-[11px] text-ink/40">
        No changes recorded yet - the history fills in as the deal is drafted and edited.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {log.map((e) => {
        const Icon = ACTOR_ICON[e.actorKind] ?? Cog;
        return (
          <div key={e.id} className="rounded-xl bg-white/80 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
                v{e.version}
              </span>
              <span className="text-[10px] text-ink/40">{when(e.changedAt)}</span>
            </div>
            <div className="mt-1 text-xs text-ink/80">{e.summary}</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-ink/45">
              <Icon className="h-3 w-3" />
              {e.actorName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
