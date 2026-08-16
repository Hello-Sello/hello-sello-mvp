/**
 * The "In negotiation" strip (Wave 3b, Region C, B1) - the calm banner pinned to
 * the TOP of the deal-card scroll region while a change is on the table.
 *
 * Trigger rule (narrow, encoded here and in the render test): it shows ONLY when
 * the deal is live (`negotiation`) AND a change is held. Every other case renders
 * nothing - a private `unsent` draft never shows it (its edit is in-place, not a
 * held change), and a live deal with no held change has nothing to announce.
 * Returning null keeps the card face clean (absence = nothing to act on).
 *
 * Pure presentational: no hooks, no data access - it reads the two facts the
 * card already knows (`card.status` + `!!data.pendingChange`), so it stays a
 * deep, trivially-testable leaf.
 */
import { GitCompareArrows } from "lucide-react";
import type { DealCardStatus } from "../types";

export function NegotiationStrip({
  status,
  hasHeldChange,
}: {
  status: DealCardStatus;
  /** whether a change is held on the deal (data.pendingChange != null). */
  hasHeldChange: boolean;
}) {
  if (status !== "negotiation" || !hasHeldChange) return null;
  return (
    <div
      className="mx-3.5 mt-3 flex items-center gap-2 rounded-2xl px-3.5 py-2"
      style={{
        background: "rgba(122,18,48,0.05)",
        border: "1px solid var(--dc-hairline)",
        borderLeft: "3px solid var(--dc-pink)",
      }}
    >
      <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-[color:var(--dc-pink)]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-pink-deep)]">
        In negotiation
      </span>
      <span className="truncate text-[11px] text-[color:var(--dc-ink-55)]">
        A change is on the table - review the red/green diff below.
      </span>
    </div>
  );
}
