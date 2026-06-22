---
status: accepted
---

# Deal changes are held two-sided proposals, not instant edits

## Context

A deal card can be edited by either company, from two synced surfaces (the p2p chat and the deal chat). The original 3.5b design committed an edit immediately as a new card version (`edit_deal_draft`), then re-ran the gate. That let one side move the shared deal unilaterally, and - once the same card showed in two chats with several people able to edit - opened a concurrent-edit (lost-update) problem.

## Decision

An edit becomes a **held pending change**: the live card is untouched and keeps showing the last agreed version; the proposed SHARED terms wait in a `deal_pending_change` record (one active row per deal, DB-unique) that the strip renders in both chats. The proposer's company auto-accepts; the other company Accepts or Declines (each with a required Change reason), or the proposer Withdraws. The card changes ONLY on both-accept, where the existing version-build logic runs. While a change is pending the deal is **fully locked** for editing.

## Considered options

- **Optimistic concurrency** (let edits happen, detect clashes by version + notify the loser) - rejected: a two-company negotiation edits rarely and serially, so the clash-handling code is cost without benefit.
- **Store the pending change as a chat message** (reuse the birth `deal_detected` shape) - rejected: a message lives in one thread; the change must be actionable from both chats, so it belongs on the deal, read by both strips.
- **Keep instant edits (3.5b)** - rejected: lets one side move the shared deal alone with no honest two-party signal.

## Consequences

- Private numbers (buying price / COGS) must never enter the pending change (the strip is read by both companies in the deal chat); they are written privately, outside the held proposal.
- The lock is enforced in the database (one active row per deal), not only by a disabled button, so two simultaneous proposals cannot both succeed.
- The final golden "seal" is intentionally out of scope here (an end-of-lifecycle step, after invoice + delivery).
- Supersedes the 2026-06-11 "edit commits immediately" decision; the rest of Waypoint 4.5.4-4.5.6 builds on this.
