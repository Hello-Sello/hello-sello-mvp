/**
 * The draft-edit commit-path logic (Wave 3b, Region C, CR-02).
 *
 * A proposer's "Send / Save" on the deal card takes one of four paths, decided
 * purely from three facts - the card status, whether a change is held, and
 * whether the VIEWER proposed that held change. Pure logic, extracted from
 * `CardFront.tsx` so the load-bearing matrix is unit-testable without React or
 * the DB - the same discipline as `decisionBar.ts`'s negotiationDecision. The
 * component only ACTS on what these return.
 *
 * Load-bearing rules (Wave-3b DECISIONS):
 *   - D-08: an `unsent` draft is a PRIVATE, not-yet-sent card. Its edit is a
 *     re-birth in place (update_deal_draft), never a held change - a private
 *     draft has no counterparty to cast the second D-02 vote, so a proposed
 *     change would wedge (the CR-02 bug this replaces).
 *   - Negotiate NEVER discards a held proposal: a proposer replacing their OWN
 *     held change withdraws it explicitly first, then re-proposes; the other
 *     side's held change is never silently overwritten (it BLOCKS editing).
 */
import type { DealCardStatus, PendingChangeView } from "../types";

/** The four commit paths a proposer's Send resolves to. */
export type CommitPath = "draft-update" | "propose" | "replace" | "blocked";

/**
 * Which commit path a Send takes. `pendingChange` is read for truthiness only
 * (the resolved held change, or null); `iProposed` is whether the viewer's
 * company proposed it (mirrors `PendingChangeView.iProposed`, passed separately
 * so a `null` change is safe).
 *
 *   unsent                           -> "draft-update"  edit the private draft in place
 *   negotiation, no held change      -> "propose"       stage a new held change
 *   negotiation, MY held change      -> "replace"       withdraw then re-propose
 *   negotiation, the OTHER's change  -> "blocked"       I cannot edit their change
 */
export function resendAction(
  status: DealCardStatus,
  pendingChange: PendingChangeView | null,
  iProposed: boolean,
): CommitPath {
  if (status === "unsent") return "draft-update";
  if (pendingChange && !iProposed) return "blocked";
  if (pendingChange && iProposed) return "replace";
  return "propose";
}

/**
 * Whether the Edit pencil is offered to the viewer - the gate every card mount
 * reads (CardFront's own guard, the panel host, and DealPin's overlays, so the
 * proposer's replace-pencil is consistent everywhere). Editable when the card is
 * a private `unsent` draft, or live (`negotiation`) with either no held change or
 * the viewer's OWN held change (which they may replace). The other side's held
 * change, and any settled status, lock the pencil.
 */
export function canProposerEdit(
  status: DealCardStatus,
  pendingChange: PendingChangeView | null,
  iProposed: boolean,
): boolean {
  return (
    status === "unsent" ||
    (status === "negotiation" && (!pendingChange || iProposed))
  );
}
