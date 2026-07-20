import type { InboxItemView, LensKey } from "@/modules/connect/types";

/**
 * Lens definitions - the single source for what each inbox lens means. Both the
 * tab counts (LensTabs) and the list filter (InboxList) run through `matchesLens`
 * so they can never disagree. Default lens = `unassigned`.
 */

export type LensDef = { key: LensKey; label: string };

export const LENSES: LensDef[] = [
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
  { key: "all", label: "All" },
  { key: "deal_tickets", label: "Deal tickets" },
  { key: "history", label: "History" },
];

/** The one predicate that defines each lens. */
export function matchesLens(
  item: InboxItemView,
  lens: LensKey,
  viewerPersonId: string,
): boolean {
  // An OUTGOING deal ticket is never actionable for its sender: the row is
  // visible to both sides (two-sided select RLS) but only the receiver can
  // act, so every actionable lens hides it (History keeps the record once
  // accepted). Connection-type items keep their historical two-sided
  // visibility — changing that is a platform-wide call, not taken here.
  const outgoingDealTicket = item.type === "deal_card" && !item.viewerIsReceiver;
  switch (lens) {
    case "unassigned":
      return !outgoingDealTicket && item.status === "pending" && item.assigned_to === null;
    case "mine":
      return !outgoingDealTicket && item.status === "pending" && item.assigned_to === viewerPersonId;
    case "all":
      return !outgoingDealTicket && item.status === "pending";
    case "deal_tickets":
      // Lane A: born deals delivered company-target — claimable by any member
      return !outgoingDealTicket && item.type === "deal_card" && item.status === "pending";
    case "history":
      return item.status === "accepted" || item.status === "rejected";
    default: {
      // exhaustiveness guard: adding a LensKey without a case fails to compile
      const _exhaustive: never = lens;
      return _exhaustive;
    }
  }
}

/** Items belonging to a lens, preserving the source order. */
export function filterByLens(
  items: InboxItemView[],
  lens: LensKey,
  viewerPersonId: string,
): InboxItemView[] {
  return items.filter((item) => matchesLens(item, lens, viewerPersonId));
}

/** Count per lens, for the tab badges. */
export function lensCounts(
  items: InboxItemView[],
  viewerPersonId: string,
): Record<LensKey, number> {
  const counts: Record<LensKey, number> = {
    unassigned: 0,
    mine: 0,
    all: 0,
    deal_tickets: 0,
    history: 0,
  };
  for (const lens of LENSES) {
    counts[lens.key] = filterByLens(items, lens.key, viewerPersonId).length;
  }
  return counts;
}
