# 5A - UI pass (card + chat + nav + Sella)

> **⚠️ HISTORICAL / DESIGN-REFERENCE ONLY (closed 2026-06-18).** Live status, what's left, and parked items now live in **`.planning/ROADMAP.md`** (the single source of truth). This file is kept for UI-pass context feeding Phases 5-6 (the `deal_detected` / `deal_card_updated` renderers, the card open-mode debate). Do NOT track current status here.

**Status:** ⬜ OPEN (not started). **Owner:** Ayush.
**Runs:** AFTER Chapter 4 (Sella) - which is ✅ DONE + live. So 5A now runs on a real
detect → confirm → birth → summary journey, not on stubs.
**Absorbs:** the old 3.5d (card v2 UI) - see `3.5d-card-v2-ui.md` for the seed notes.

> **Why this is Section 5, not 3.5d or 4:** Muskan's `DECISIONS.md` already calls Sella "4a-4d", so Sella
> stays Section 4. To avoid a numbering clash, the UI pass becomes a fresh **Section 5**.
>
> **Working style (Ayush):** every phase starts with a short **idea/approach discussion** (the "Ideas to
> discuss first" block below), then we build ONE surface, review it live, then move to the next. Never batch
> all five. This file is the reference we open at the start of each phase.

---

## How to read this file

Each phase has the same shape:

- **Goal** - the one-line outcome.
- **Files** - exact paths that change (read these first when the phase starts).
- **What changes** - the concrete edits.
- **Ideas to discuss first** - the open choices. We agree on these BEFORE writing code.
- **Done check** - how we know the phase is finished (what to verify live).
- **Fold-ins** - any Chapter-4 functional piece that rides along (these are more than styling).

The visual language is locked in `src/app/globals.css`: **frosted glass capsules + a raspberry accent
(`#e30b5d` brand, `#ffb7d5` brand-soft, `#76002d` brand-deep) on a cotton-candy wash**, light-only, Geist
font, very rounded (`rounded-3xl`). Every phase stays inside this language - we polish, we do not re-skin.

---

## Current state map (the Connect chat screen, left → right)

The chat route (`/connect/chat`) stacks five vertical panels. This is why the chat feels cramped - a lot of
chrome sits before the conversation.

| # | Panel | Component | Width today | Note |
|---|---|---|---|---|
| 1 | Global surface nav | `src/shared/ui/IconRail.tsx` | 76px | Already an icon rail (logo + 7 surfaces + account). Leave as-is. |
| 2 | Connect sub-nav | `src/modules/connect/components/ConnectSubNav.tsx` | 176px | Inbox / Chat / Relationships, **text labels**, ~90% empty space. **→ 5A.1 target.** |
| 3 | Conversation list | `src/modules/messaging/components/ConversationList.tsx` | 256px | New-chat + search + filter chips + rows. Not a 5A target (kept), but read it. |
| 4 | Thread (the chat) | `src/modules/messaging/components/ThreadView.tsx` | flex (gets the leftover) | Header + `DealPin` bar + stream + `Composer`. **→ 5A.2 + 5A.3.** |
| 5 | Sella copilot | `src/modules/messaging/components/SellaPanel.tsx` | 320px | Context + suggested steps + ask-Sella input. **→ 5A.5 target.** |

Other components that 5A touches:
- `src/shared/ui/NavItem.tsx` - the global rail's pill (the active-state language we mirror in 5A.1).
- `src/modules/messaging/components/Composer.tsx` - the typing bar (5A.3). **Expand + the formatting toolbar
  + Sella chips already render as visual stubs.**
- `src/modules/messaging/components/MessageBubble.tsx` - renders one message. Needs renderers for the
  `deal_detected` + `deal_card_updated` message types (the 5A.4 / 5A.5 fold-ins).
- `src/modules/deals/components/DealPin.tsx` - the deal card's home in the chat: the "Talking about" bar +
  the float-on-right open mode (5A.2 bar + 5A.4 open mode).
- `src/modules/deals/components/DealCard.tsx` / `CardFront.tsx` / `CardBack.tsx` - the card itself
  (`w-[340px]`, flips front↔back) (5A.4).

---

## Why this order (outside-in)

**5A.1 nav rail → 5A.2 chat heading → 5A.3 composer → 5A.4 deal card → 5A.5 Sella panel.**

Build the frame first, leave the hardest + most-undecided piece (the card) for last.

The nav rail goes first because it is a **container** decision - it sets how wide the chat is. If we design
the card first and shrink the rail second, the card width changes and we redo it. Settle the canvas width up
front; nothing downstream is redone. The chat heading + composer are the top + bottom edges of the chat
frame - small, low-risk, and they make the everyday screen feel finished early. The deal card is fourth on
purpose: it has the most OPEN decisions (vertical vs horizontal, overlay vs side panel, where history lives),
so we approach it last, with a fixed canvas and a settled visual language. Sella is last because the plan
itself says to style it together with the rest once its shape settles, and it shares buttons + the AI badge
with everything before it.

---

## 5A.1 - Connect sub-nav → collapsible icon rail ✅ DONE (verified live)

**Status:** ✅ DONE 2026-06-12. **Decision (from Ayush, via Agentation):** a **hamburger toggle** - default
**collapsed** to a ~60px icon rail (chat wide by default), click the burger to **expand** to ~184px labels;
the choice **persists in localStorage** (`hs:connect-nav-collapsed`). Resolved idea #1 + #2 below: not a fixed
icon-only rail, but a collapsible one that gives both space and labels on demand. Verified live: collapsed=60px
/ expanded=184px, active raspberry pill + edge bar, hover tooltips in collapsed mode, persistence works, no
console errors.
**Goal:** shrink Panel 2 from a 176px labelled column to a ~60px icon rail; hand the ~110px back to the chat.

**Files:**
- `src/modules/connect/components/ConnectSubNav.tsx` (rewrite the presentation; keep the data + routing).

**What changes:**
- Container `w-44 … p-3` → `w-[60px] … items-center p-2.5`. Drop the "Connect" text heading.
- Each tab becomes a centered icon button (`h-12 w-12`, `rounded-2xl`), icon-only.
- Reuse the global rail's active language (from `NavItem`): `bg-brand-soft/70 text-brand` + the soft raspberry
  shadow + the `w-[3px]` raspberry left edge bar. Idle = `text-ink/55 hover:bg-white/55 hover:text-brand`.
- Keep the label via `aria-label` + a small glass hover/focus tooltip to the right (so nothing is lost).
- "Relationships" stays the greyed `soon` state.

**Ideas to discuss first:**
1. **Icon-only vs icon + tiny label.** Icon-only (≈60px, tooltip) wins the most space and reads as a clear
   "secondary" rail under the labelled primary rail. Icon + 10px label (like the global rail, ≈72px) is more
   self-explanatory but makes the two rails look near-identical. *My lean: icon-only + tooltip.*
2. **Collapsible toggle?** The old note said "(collapsible rail)". We can ship icon-only now and add a
   pin/expand toggle later if the icons feel unclear. *My lean: skip the toggle for v1, keep it simple.*
3. **The two-rails look.** Panel 1 + Panel 2 become two thin rails side by side. Acceptable as "one family,
   two levels" - but if it reads as cluttered we consider a subtle divider or a hairline gap change.

**Done check:** the chat is visibly wider; the active tab shows the raspberry pill + edge bar; hover shows the
label tooltip; Relationships still greys out; keyboard focus reaches each icon.

---

## 5A.2 - Chat heading bar + deal selector ✅ DONE (verified live)

**Status:** ✅ DONE 2026-06-12. Built from Ayush's Agentation notes + the v2 mockup. Verified live.
**What shipped:**
- **Professional header** (`ThreadView`): identity leads (initials avatar + name + P2P/C2C tag + subtitle);
  the wordy "My Relationship with …" pill became a quiet **relationship icon button**; added an **⋯ overflow
  menu** (View relationship = real; Mute notifications + Search in conversation = UI placeholders marked
  "soon"); a **green presence dot** on P2P avatars only (a company channel is never "online") - a UI
  placeholder until real presence (Supabase Realtime) is wired.
- **Deal selector** (`DealPin`, new read `listRelationshipDeals`): the "Talking about" bar became a
  **deal-card chip** (raspberry spine + "Deal card" + status badge, **no HS number** - that lives inside the
  opened card) with a **dropdown to choose a deal** (proved real: StonePharm has 4 deals), an **Open card**
  button, and a quiet **Workspace ↗** link. No-deal state = a dashed **Start a deal**. Workspace variant kept
  (chip + open, no dropdown). Default selection = most-recent LIVE deal (matches old getCurrentDealCardId).
- **Deferred (noted, not built):** the deal **stage track** on the chip (Draft→Negotiate→Confirm→Seal) needs
  stage data; real **presence**, **notifications/mute**, **message search** are placeholder UIs only.
**Original goal (kept for reference):** tidy the top of the chat so it reads cleanly - the company identity
row + the "Talking about" deal row stacked under it.

**Files:**
- `src/modules/messaging/components/ThreadView.tsx` (the header block, ~lines 32-61).
- `src/modules/deals/components/DealPin.tsx` (the "Talking about" bar, ~lines 102-149) - it sits right under
  the header, so the two must read as one heading unit.

**What changes (presentation only):**
- The header row: avatar/building chip + name + P2P/C2C tag + subtitle, with the "My Relationship with …"
  door pushed right. Tighten spacing, sizing, truncation so long company names behave.
- The "Talking about" row: today it is `Current deal ▾` (a non-interactive selector stub) + the centered card
  pill + the "Deal workspace ↗" door. Make the two rows feel like one frame (shared padding, one divider),
  not two stacked bars.

**Ideas to discuss first:**
1. **One bar or two rows?** Merge the identity row and the "Talking about" row into a single heading block
   with clear hierarchy, vs keep them as two thin bars. *My lean: one block, two rows, one bottom divider.*
2. **The "Current deal ▾" stub.** Multi-deal is deferred (DEV-37). Keep the dropdown affordance as a hint, or
   hide it until multi-deal exists? *My lean: keep it but make it clearly inert (no hover affordance).*
3. **Door styling.** "My Relationship with …" and "Deal workspace ↗" are both `ink/5` pills. Should one read
   as primary? *My lean: keep both quiet; the card pill is the only raspberry thing in the heading.*

**Done check:** header reads cleanly at narrow + wide widths; long names truncate; the heading + talking-about
rows look like one unit; no layout shift when a deal is / isn't present.

---

## 5A.3 - The message typing bar (Composer) ✅ DONE (verified live)

**Status:** ✅ DONE 2026-06-12. Built from Ayush's Agentation note. Verified live.
**What shipped (`Composer.tsx` + a listener in `DealPin.tsx`):**
- **`+` menu** (was an inert toolbar stub): **Create a deal** first, raspberry-highlighted + a handshake icon -
  REAL: it fires a `hs:create-deal` window event that `DealPin` (chat variant) listens for, opening the
  existing `CreateDealForm` (a second door, no new write path - the AI fence holds; verified the modal opens).
  Then **Upload a file / Photo / Video** as UI placeholders marked "soon" (uploads need a storage slice).
- **Pre-written seller chips: 3 → 2, rewritten** - "Share current stock" (multi-line, auto-expands) + "Send a
  quick offer".
- **Expand now grows bigger** - collapsed 2 rows → expanded **10 rows** (was 6).
- **Formatting now WORKS (no backend needed)** - the Slack/WhatsApp marks pattern: bold/italic/underline/
  strike wrap the selection (`**b** _i_ ++u++ ~~s~~`), link inserts `[text](url)`, the list buttons prefix the
  line, and emoji (a small picker) inserts a character. Marks render as real formatting in the bubble via a new
  **safe** renderer `RichText.tsx` (React elements only - no `dangerouslySetInnerHTML`; links restricted to
  http(s)). `MessageBubble` person bubbles use it + `whitespace-pre-line`. Verified live: marks insert AND
  render (`<strong>/<em>/<u>/<s>/<a>`). **Text style (T) + Mention (@) + Voice stay "soon"** (headings unneeded;
  mentions need a people list; voice needs recording). Minor follow-up: the conversation-list preview still
  shows raw marks (`**x**`) - strip later if it bugs.
**Decoupling note:** the `+` button and the create form live in different components; they talk via the
`hs:create-deal` event (same pattern as `hs:deal-updated`) so neither imports the other.
**Original goal (kept for reference):** finish the composer - a working `+` menu (first item a raspberry
"Create a deal"), and a decision on real text formatting.

**Files:**
- `src/modules/messaging/components/Composer.tsx`.

**What changes:**
- **`+` menu (the real new work).** Today `Plus` is just a stub toolbar button. Turn it into a popover menu.
  First item = **"Create a deal"**, raspberry-highlighted, which opens the existing create flow (a SECOND door
  into 3.5a's `CreateDealForm` - no new write path). Later items (image / photo / document upload) render
  **disabled / "coming soon"** because they need a storage backend (separate slice, not 5A).
- **Formatting (decide).** Bold/Italic/Underline/Strike currently render but do not format. Either (a) leave
  as visual chrome with a clear "coming soon" tooltip, or (b) wire minimal markdown-style formatting. *See
  idea 2.*
- Polish the box, the chip row, the toolbar grouping + dividers to final quality.

**Ideas to discuss first:**
1. **How does the `+` open the create flow?** `CreateDealForm` is mounted inside `DealPin`, not the composer.
   So the `+` needs to signal "open create" up to where the form lives. Options: a window CustomEvent (like
   `hs:deal-updated` already used), or lift the create state. *My lean: a small CustomEvent - lowest coupling,
   matches the existing pattern.*
2. **Real formatting or stub?** Wiring rich text is a real editor task (contentEditable / a lib). For a demo,
   markdown-on-send (wrap selection in `**`/`_`) is cheap but partial. *My lean: keep formatting as a clean
   "coming soon" stub for 5A; real formatting is its own later slice.*
3. **`+` menu contents + order.** Confirm the first item label ("Create a deal") and which upload types we
   list as coming-soon (image, photo, document, file).

**Done check:** the `+` opens a menu; "Create a deal" opens the real create form and a born card appears in the
chat; upload items are visibly disabled; Expand + chips still work; Enter sends, Shift+Enter newlines.

---

## 5A.4 - Deal card: open mode + layout

> 🛑 **BLOCKED by Waypoint 4.5 - resolve first.** Ayush (2026-06-12) found the deal **accept/decline is
> tangled**: it lives on the card, which (1) makes a person "accept" their own deal, (2) births an orphan
> workspace before anyone confirms, and (3) contradicts the AI fence (Sella needs acceptance but may not make a
> card). Direction: **move acceptance off the card into notifications**; **remove the card's `ConfirmBar`**;
> birth the workspace **only after acceptance**. This decides whether the card even has a confirm gate, so do
> NOT redesign the card layout until 4.5 is settled. Full capture:
> `_workshop/notes/2026-06-12-waypoint-4.5-deal-acceptance-rethink.md`.

> **✅ UPDATE 2026-06-15 - partly UNBLOCKED (see [`6-pending-map.md`](6-pending-map.md)).** 4.5.3 removed the
> card's `ConfirmBar` and moved the Seal into the **strip** (the card is now pure display; the Edit control sits
> in the card's top-right corner). Acceptance is **not** a separate notifications backend - it lives in the
> strip - so the "move acceptance into notifications" direction below is **superseded**. What remains in 5A.4 is
> the pure **visual** card redesign (open mode + layout) plus the new **Note** render (the per-company optional
> note on the card face; 6-pending-map **T5**). The deal-CHANGE flow itself is tracked in `6-pending-map.md`.

**Status:** ⬜ (blocked - see Waypoint 4.5 above)
**Goal:** the card's biggest visual rework - a better open mode + a layout where the actions (Edit, confirm)
are easy to find. This phase has the most OPEN decisions, which is why it is last.

**Files:**
- `src/modules/deals/components/DealPin.tsx` (the open mechanism - today floats the card on the RIGHT of the
  stream, `absolute inset-0 flex justify-end`, ~lines 151-170).
- `src/modules/deals/components/DealCard.tsx` (the `w-[340px]` flip container - front ↔ back).
- `src/modules/deals/components/CardFront.tsx` (the face: HS band → confirm bar → term/date → two parties →
  value rows → private field → products → **Edit at the very bottom**).
- `src/modules/deals/components/CardBack.tsx` (Signals + Logs - the flip side, where version history lives).

**What changes:** depends on the decisions below. The known problems to fix:
- The card is a tall narrow `w-[340px]` that floats over the stream; the **Edit button sits at the bottom,
  below the fold, and is hard to find**.
- A vertical blurred-centered overlay was prototyped live this session **and reverted** - so re-approach
  fresh, do not just re-do that.
- Version history currently lives on the card BACK (flip) inside `LogsTab` - decide if that is the right home.

**Ideas to discuss first (this is the heavy one):**
1. **Open mode:** float-on-right (today) vs a **right side panel** that the chat squeezes beside (no overlap)
   vs a **centered overlay** with a dimmed chat behind. Side panel keeps the chat readable; overlay focuses on
   the card. *Worth sketching 2-3 options before coding (we can use a throwaway prototype).*
2. **Orientation:** keep vertical (`w-[340px]`) vs a **horizontal / wider** layout that shows more facts
   without scrolling. The wider chat (after 5A.1) gives us room for a horizontal card.
3. **Actions placement:** lift Edit (and the confirm gate) so they are always visible - e.g. a sticky action
   row at the top or bottom of the card, not buried under the products list.
4. **Version history home:** stay on the card back (flip) vs a dedicated history drawer vs inline on the
   front. Tie this to Chapter 4's `deal_card_log` (the "why it changed" summaries now land there).

**Design direction (Ayush, 2026-06-12, via Agentation) - confirm moves to notifications:**
The deal's **accept / decline** action should leave the card and become a **notification** ("Deal X needs your
decision") acted on from a **notification panel**. Rationale: the card has two jobs mixed - *show* the deal
(long-lived info) and *ask* for a decision (short-lived action); splitting them keeps the card clean. **This is
the AI fence's human click, so it does NOT move until the notifications system + panel exist to catch it** -
removing it from the card first would leave no way to confirm a deal. Plan it together with the notifications
backend (also the home for the header's "Mute" + the presence/notification placeholders). Until then the
card's `ConfirmBar` stays.

**Fold-ins (functional, from Chapter 4 - more than styling):**
- **`deal_detected` suggestion renderer.** When Sella posts a `deal_detected` message, the chat must render a
  read-only preview with **both-confirm buttons** that call the `confirm_detected_deal` RPC. Lives in the
  message stream (new component, used by `MessageBubble`). Metadata shape is locked (see Sella POV §8 /
  DECISIONS 2026-06-12). **This is the Option-B birth door - it is the heart of the detect→birth journey.**
- **Precise offer/order labelling on the detected birth** (Parked item) - get the doc-term right on birth.
- **Manual-create counterparty-person threading** (Parked) - rides with the create flow.
- **Per-side owner / side_lead DB enforcement** (Parked - design in ARCHITECTURE-NOTES 2026-06-12): `company_id`
  on `deal_member` + partial unique indexes (owner / side_lead per side) + a ≥1-owner deferred trigger. This
  is a DB slice that lands during 5A but is not visual.

**Done check:** the card opens in the chosen mode without covering the chat unreadably; Edit + confirm are
visible without scrolling; a `deal_detected` message renders the preview + both-confirm buttons, and a
both-accept births the Draft card live; version history is reachable.

---

## 5A.5 - Sella copilot panel (Panel 5)

**Status:** ⬜
**Goal:** style the Sella rail to final quality and fold in the Chapter-4 artifacts it now has real data for.

**Files:**
- `src/modules/messaging/components/SellaPanel.tsx` (header + context card + suggested steps + ask-Sella input).
- `src/modules/messaging/components/MessageBubble.tsx` (the `deal_card_updated` notice renderer - see fold-in).

**What changes:**
- Polish the panel: header, the context card, the "Suggested next steps" buttons (today visual stubs), the
  ask-Sella input. Make it read as the persistent copilot beside the live in-chat Sella.
- Add the **EU AI Act Art. 50 "AI" badge** styling - a persistent, visible badge on every Sella suggestion
  (binding Aug 2026; a footer does not satisfy the law). This badge style is shared with the 5A.4
  `deal_detected` renderer, so design it once here.

**Ideas to discuss first:**
1. **What is real vs stub now?** Chapter 4 gives us real detection + summaries, but the panel's "Suggested next
   steps" (Draft a reply, Start a deal, …) are still stubs. Decide which become live in 5A vs stay "coming
   soon".
2. **AI badge design.** A small pill ("AI", or a Sparkles + label) - placement + exact wording. Must be
   machine-readable too (a data attribute / aria), not just visual.
3. **Panel vs in-chat Sella.** The panel is the persistent presence; the in-chat `deal_detected` is the active
   intervention. Keep them visually distinct but clearly the same Sella.

**Fold-in (functional):**
- **`deal_card_updated` notice renderer.** When a card is edited, Sella posts a `deal_card_updated` message
  (the "why it changed" summary) into BOTH the deal chat and the P2P chat, linked via
  `metadata.deal_card_id`. The chat needs a renderer for this message type - a quiet, card-linked notice (not
  a normal bubble). Lives in `MessageBubble` / a small dedicated component.

**Moved in from 4.5 (2026-06-15) - see [`6-pending-map.md`](6-pending-map.md):**
- **T6 - Sella detects changes to an existing card.** A new Sella capability: read the current card, diff it
  against the chat, and propose a **change** (not a new birth) - the Case-1 door of the deal-change flow. Needs
  a `deal_card`-aware detection pass + a "proposed change" message + a confirm-change path. Lands here because
  Sella is always the last section; build it with this Sella pass.
- **Routing note (4.5 D18 / 6-pending-map T3):** the `deal_card_updated` notice above is now posted to the
  **deal chat on accept** and the **p2p chat on decline** (not "both") - the posting logic is 4.5.5; this
  renderer just renders whatever message arrives.

**Done check:** the panel looks final; the AI badge shows on every suggestion (visible + machine-readable); a
card edit produces a `deal_card_updated` notice in the chat that links to the card; stubs are clearly marked.

---

## Boundaries / notes (unchanged)

- Mostly presentation. The `+` "Create a deal" reuses the existing create flow (3.5a) - a second door, no new
  write path. File uploads are a SEPARATE backend slice (storage bucket + RLS), not part of 5A.
- The functional fold-ins (`deal_detected` renderer, `deal_card_updated` notice, the per-side DB enforcement)
  are wiring, not just styling - they are listed inside the phase that owns their surface so we do not forget
  them, but they are flagged so we treat them with care (the AI fence still holds: any Sella-fed form commits
  only on a human button → server action).
- Step-by-step working style (Ayush): build one surface, review live, then the next - do not batch all five.

## Demo / test anchors (from the Chapter-4 wrap-up)

- Login: `alice@greenleaf.test` / `password123`; two-screen with `bob@stonepharm.test` / `password123`.
- Test thread (Alice↔Bob p2p) = `91b6f4b8`. Demo card `04695a2d` (Aurora↔StonePharm) is a Draft.
- **Aurora = renamed GreenLeaf** (seller). The detect cron is LIVE - a p2p person message auto-creates a
  `deal_detected` row + message in ~10s, so 5A.4's renderer has real messages to render.
- **Bounce the dev server** (`rm -rf .next` + restart) after editing `actions.ts` (Turbopack stale server
  actions). Preview server starts by name: `hello-sello-app`.
