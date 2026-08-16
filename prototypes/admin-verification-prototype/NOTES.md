# Admin Verification Surface — UI prototype

**Question:** What should the HS-team company-verification surface (`/admin/verifications`) look like —
the pending queue *and* the per-company review view?

**How to run:** open `index.html` in a browser. Flip layouts with the floating bottom bar
(`‹` / `›`) or the `←` / `→` arrow keys. Each layout is also a shareable link via `?variant=A|B|C`.

> Throwaway. All data is in-memory; approve/reject mutate the in-memory store only. Delete or fold
> the winner into the real `/admin/verifications` page once a layout is chosen.

## The three layouts (radically different shapes)

| Variant | Shape | Best when |
|---|---|---|
| **A — Inbox triage** | Two-pane: queue on the left rail, review detail on the right. Click a row → detail loads beside it. Never leave the screen. | High-volume, fast triage — work down the list without page loads. |
| **B — Table + drill-in** | Wide full-width data table (sortable columns); click a row → a dedicated full-page review screen with a "‹ Back to queue". One job per screen. | Few companies, deeper read — most room for the licence + company info. Most literal match to D-01 ("detail view first"). |
| **C — Review feed** | Vertical stack of company cards; click a card to expand the full review inline (licence, description, actions). "Work the stack." | A more visual, scannable feel; good if the queue is short. |

## What's identical across all three (locked in CONTEXT.md — not what we're choosing)

- Pending / Decided tabs, **oldest-first** pending order, licence-uploaded badge, queue-age indicator (warms → red past 3d / 5d) — D-07, D-08.
- **Approve** = one-click confirm dialog ("…enter Discover…") — D-09.
- **Reject** = preset reasons (Invalid licence · Licence expired · Details don't match · Duplicate company · Other) + optional note; Reject disabled until a preset is picked — D-05/06.
- **Licence viewer** = in-platform, **view-only, no download** anywhere; logs `license_viewed` (see console); graceful "no licence uploaded" empty state — D-02/03/04.
- **Success** = toast + decided row leaves the pending list; **failure** = error toast, status unchanged, retryable (tick "simulate save failure" in the top bar to see it) — D-10/11.
- Decided companies show a read-only **Audit record** echo (actor · when · outcome · reason) — VERIF-04.

## Verdict

<!-- Fill in after Muskan reviews. Likely outcome: "header/queue from X, detail pane from Y." -->
- **Chosen:** Variant B — Table + drill-in (Muskan, 2026-06-17)
- **Why:** Low-volume, deep-read review job; the full-page detail gives the most room for the
  licence viewer + company info, and matches D-01 ("detail view first, then approve/reject").
- **Steals from other variants:** none — B as-is.
