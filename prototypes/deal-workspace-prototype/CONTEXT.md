# Deal Workspace (screen ④) - full context & decision narrative

> **Why this file exists:** `NOTES.md` is the spec (what the prototype does). This file is the **decision log** -
> every choice we made designing screen ④ *and the reasoning*, so the story survives the session.
> LOCKED 2026-06-07 (Ayush + Claude). Prototype: `index.html` (port 8772). **Resolves the open [DEV-9].**

The Deal Workspace is the **deal container** - the last of the four Connect atoms:
① Deal card → ② Chat → ③ Relationship page → **④ Deal Workspace**. It is **Layer B: invited participants only**
(independent of the relationship page's company-wide Layer A), auto-scaffolded when a Deal Card is born.

---

## 1. Two entry points

- From the **Relationship page's deals list** ("Open workspace →").
- From a **⤢ button on the Deal Card** itself (added to the card chrome).
Inside the workspace, the card lives **in the deal chat** (a pinned pill), not as a separate box.

## 2. Layout = the A&C mix (chosen after comparing A/B/C)

We prototyped three layouts (A command-center / B chat-centric / C tabbed) and Ayush picked a **mix of A & C**:
- **Top:** deal header (title · HS · parties · owner · net · lifecycle pill) + a **shrunk one-line Deal-Sella**.
- **Left (~330px): a tabbed work panel** - `Things · People · Documents` (C-style tabs; pick one, see it).
- **Right: the Deal Chat as the WIDE hero** - the most space, because the workspace is an *operating* surface
  (you work THINGS while watching the chat). *Why A&C:* the relationship page (③) is a reading surface so the
  calm tabbed layout won; the workspace is a doing surface, so the chat-forward command feel fits - the surface's
  *job* picks the layout.

## 3. The Deal Card is the canonical flip card (not a workspace-special box)

The card is shown as a **pinned `Deal card ▸` pill** in the deal chat (identical to the P2P/Deal chat in screen
②) that opens the **same flip card everywhere**: FRONT = facts + scrollable products (margin **seller-only**);
BACK = a `Signals | Logs` filter (seller/buyer signals + the version history). *Why:* the card must look and behave
**identically** in the inbox half-card (①), the chat pill (②), and the workspace (④) - a user learns it once.

## 4. Change history lives in the card's LOGS, not as chat messages (Ayush, 2026-06-07)

We **removed** the "deal card amended to v2…" status line and the in-chat "card updated / amended" messages.
The change history is on the **card back → Logs** (open the card to read it). *Why:* it removes a **second source
of truth** - before, a change showed up twice (a chat message *and* the card log), which drift and confuse "where
do I look?". One home for change history; the chat stays a chat. Same instinct as ②'s "messages are never synced,
only the card is."

## 5. THINGS are the visible work primitive - stages are NOT a UI element

The Things tab shows THINGS **grouped by domain** (Finance / Logistics / Delivery) with a done-count + progress.
**Stages are scaffolding only** (they group THINGS + set default assignees) - explicitly *not* a Kanban/timeline/
board (DEV-24/34). Any party adds; Open→Done; **approval THINGS = e-signature** (2FA + person + timestamp = the
Draft confirmation gate; both sides must approve to confirm).

## 6. Lifecycle: Draft → Confirmed → Done

- **Draft** - the e-sign **confirmation gate** in the Things tab; execution THINGS queued; per-party `deal_confirmation`.
- **Confirmed** - executing (3/8 done); delivery docs still needed.
- **Done** - **delivery note + invoice both attached** (document-driven, *no explicit "Done" click*); Deal-Sella
  OCR-amends the card to actuals; 8/8 things.

## 7. Side-aware

Workspace is invited-only so both dealmakers see most things, but **margin is seller-only** on the card,
the "(you)" marker + topbar follow the side, and Deal-Sella is the side's agent.

## 8. Out of scope / deferred

- **Deal Room is NOT part of screen ④.** It's the *customer-presentation* surface (product media, Loom, share
  link) - a **Present-surface** tool, distinct from the *execution* container. (Resolves the doc-vs-Linear
  divergence: CLAUDE.md said "Deal Room = CUT", Linear DEV-22/52 keep it live & distinct - the truth is: out of
  *Connect ④*, lives in Present.)
- Parked: THINGS inbox across deals (DEV-27); multi-deal in one P2P (DEV-37); partial/multi-delivery close
  (DEV-53); confirmation output document (DEV-61); first-contact doc collection (→ Inbox, → Artifacts).

## 9. People / members

Initial members = the two dealmakers; a **deal owner** (Kim, seller) stays accountable; the owner can add more
(logistics, compliance) and assigns stage-responsible people who become default THING assignees. Ownership never
passes between them; the whole company can see+act unless the deal is PRIVATE.

---

*Built across one session (2026-06-07) with Ayush, on the decided Connect shell (consistent with
connect/chat/relationship/dealcard). Verified in Claude Preview (the mix layout, all 3 lifecycle states, both
sides, the canonical flip card front/back/logs - no console errors). Throwaway - the decisions above are the keep.*
