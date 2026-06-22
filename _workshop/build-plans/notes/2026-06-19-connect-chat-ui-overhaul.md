# Connect / Chat UI Overhaul - 2026-06-19

**Source:** Ayush walked `/connect/chat` with Agentation (2 viewports, 24 notes) + 3 reference screenshots. This file is the single source of truth for the overhaul.

**Status legend:** `Clear` (build directly) · `Discuss` (align first) · `Prototype` (throwaway variations, Ayush picks) · `Research` (find the right pattern) · `Done` (already in code, verify only)

---

## Locked decisions

- **Default tab:** `/connect` → redirect to `/connect/chat` (was `/connect/inbox`).
- **Rename:** "Workspace" → **"Deal Room"**.
- **"AI" pill is cosmetic** - no Sella runtime behind it, no click handler (marked TODO in code). The fixed Sella tile will become the *real* home for the notification + Review-change + Withdraw feed. Nothing breaks because nothing was wired.
- **Chat auto-scroll to latest:** already implemented in `ThreadView` (`scrollIntoView` on message change). Verify only.

## Open questions (not blocking the build)

1. **Inbox tab rename** - rejected Requests / Activity / Actions. Needs a sharper concept first (see below).
2. **Nav merge exact shape** - screenshot 1 implies: one left rail + contacts column that collapses behind a "<" back arrow.
3. **Conversation list contents** - people picker (new chat), search conversations, unread company deals, new-connection section.
4. **Proper product display** - image thumbnail + quantity stepper (+/-). Needs a short design-research pass.
5. **Deal Room ↔ card** - can Deal Room open from the card itself? Still a thought (note 9). Park for the strip prototype.

---

## The 9 slices

| # | Slice | Main file(s) | Status | Parallel-safe? |
|---|---|---|---|---|
| F1 | Glass opacity - clearer cards/menus | `globals.css` (`.glass`, `.glass-strong`) | Clear | Yes - tiny, do first |
| F2 | Global chrome - merge 2 nav bars → 1; slim TopBar (search center, notifs + company name out); default tab → Chat | AppShell, IconRail, TopBar, `connect/layout`, `connect/page` | Discuss | Solo (global frame) |
| S1 | **The Strip** - card icon (not "open card" text), dropdown → 3 + see all, person row, Workspace→Deal Room, Sella tile = notification/review feed | `DealPin.tsx` | Prototype | Solo (bottleneck) |
| S2 | **The Card front** - clean layout, product thumbnails, open/scroll behaviour, edit + flip placement | CardFront, CardBack, DealCard | Prototype | Yes |
| S3 | **Deal form / basket** - product-list redesign, proper product display (image + stepper) | `DealForm.tsx` | Prototype + research | Yes |
| B1 | Chat bubbles - me = pink, right; other = ash-gray bubble on white, left | `MessageBubble.tsx` | Clear | Yes |
| B2 | Conversation list - WhatsApp-style people picker, search, unread company deals, new-connection | ConversationList, ChatView | Discuss | Mostly |
| B3 | Sella logo - `//` bubbly mark, shared everywhere | extract `SellaMark`, SellaPanel | Prototype | Folds into S1 |
| B4 | Auto-scroll to latest on open | ThreadView | Done | Verify |

## Key code facts (from codebase map)

- **Glass** is one shared definition in `globals.css` (CSS vars `--glass-bg` 62%, `--glass-bg-strong` 78%). Changing alpha there changes opacity everywhere.
- **Bubbles:** `MessageBubble` decides side/colour by `message.isMine` - mine = `bg-brand` right, theirs = `bg-white/70` left.
- **Sella mark** lives *inside* `DealPin.tsx` (cosmetic). The Sella *panel* logo is in `SellaPanel.tsx`. Extracting one shared `SellaMark` reduces future collisions.
- **Deal dropdown** (`DealPin` + `reads.ts`): newest-first, hard cap 20, **no "see all"**.
- **Default route:** `connect/page.tsx` redirects to `/connect/inbox`.
- **DealPin is the bottleneck** - the strip, dropdown, person row, Sella tile, Review-change all live in this one file → must be a single solo track.
- **Tests:** `e2e/deal-change.spec.ts` covers the held-change flow through DealPin. No unit tests.

## Execution plan (GSD-fast, in waves)

- **Wave 0 - foundation:** F1 (glass) + F2 (global chrome). Everything sits inside these.
- **Prototype:** S1 strip, S2 card, S3 form - throwaway variations, Ayush picks. Screenshots give strong targets.
- **Wave 1 - parallel build:** picked card (S2), picked form (S3), bubbles (B1), conversation list (B2) run as up to 4 parallel worktree agents. Strip (S1) runs solo. Sella logo (B3) folds into S1.
- **Close:** update `.planning/STATE.md` + decisions.

---

## Reference screenshots

- **Screenshot 1 (layout):** one left rail; contacts column collapses behind a "<" back arrow; search center-top; company name + notifications top-right *outside* the bar; 3-panel body (contacts / chat / Sella-preview-flip).
- **Screenshot 2 (person row):** `LB  Luca Brunner … [Helvetia Pharma AG] [Deals]`. Company pill → relationship page. Selected deal moves from dropdown into the strip.
- **Screenshot 3 (card):** `DEAL - id` header, "On DATE X offered to Y this deal", product lines, **Decline / Change / Accept**, Message, "Things" checklist, tiny product thumbnails on the left.

## Raw notes → slice map

**Viewport 1:** 1,2 → F2 (merge nav) · 3 → F2 (default tab) + Inbox rename (open) · 4 → F2 (slim TopBar) · 5 → B2 · 6,7 → S1 (strip) · 8 → B1 · 9 → S1 (Deal Room) · 10 → B4 (done) · 11 → B3 · 12 → S1 (card icon, dropdown up) · 13 → F1 (opacity) · 14 → B3 · 15 → S2 (card) · 16,17,18 → S3 (form) · 19 → S1 (Sella tile feed).

**Viewport 2:** 1 → S1 + B3 (fold Review-change into Sella) · 2 → F1 (card clarity) · 3 → S3 (product display research).
