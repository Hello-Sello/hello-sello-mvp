# 6 - Pending map: the deal-change flow + the honest gap list

**Status:** 🟢 LIVING DOC (the single "what is pending" map). **Owner:** Ayush. **Created:** 2026-06-15.
**Build progress (2026-06-17):** **T1 + T2** (held-change backbone + change reason = GSD Phase 1 / 4.5.4) are **BUILT + verified** (e2e green; 5 migrations LOCAL only, cloud apply pending — `docs/deploy/cloud-migrations-pending.md`). The golden Seal was **removed from the strip + deferred to the deal's final stage** (DECISIONS.md 2026-06-17). **T3-T8 remain** — T3 (announcements to both chats) + T4 (seal-Withdraw cleanup, may be moot now) = Phase 2, next.
**Supersedes the loose ends of:** `4.5-deal-birth-acceptance.md` (4.5.4-4.5.6) and `5a-ui-pass.md` (5A.4-5A.5).

> **Why this file exists.** We stopped mid-4.5.4 because the deal-change work turned out to be bigger and more
> interrelated than one phase - it spans 4.5 (deals) and 5A (UI + Sella), and several decisions changed in the
> 2026-06-15 session. This is the one page that holds: the **target flow**, the **code reality** (built /
> missing / wrong, with file refs), the **broken-down tasks**, and **where each task lives**. Open this first.
>
> **Read order:** §1 vocabulary → §2 target flow → §3 decisions → §4 code reality → §5 tasks → §6 build order
> → §7 cross-references.

---

## 1. Vocabulary (locked 2026-06-15) - the two notes are now two different words

We kept confusing "the note." From now on there are **two distinct words**, never both called "note":

- **Note** = an **optional, per-company content note shown ON the deal card face**. A short highlight each
  company can put on the card for the other side to read ("we are giving you this much", a delivery detail).
  Both companies can add one; both are visible to both sides. **Optional** - never required. (The relationship
  page holds the fuller version later; the card holds the quick one.)
- **Change reason** = the **required reason a human gives on every Accept or Decline** of a card change. It is
  **not** called a note. It always exists (consistent culture, so human intent is never lost) and it flows to
  the **log** (`deal_change_input` / `deal_card_log`) and a **system message**.
- **Pending change** = the **single held proposal** ("one paper on the table") for a deal - the new SHARED terms,
  waiting for the other company's yes/no. Lives in a strip-owned, card-keyed record (`deal_pending_change`),
  **not** on the card and **not** in a chat message - so both the p2p strip and the deal-chat strip show the same
  one, synced. At most one per deal; the card changes ONLY when it commits.
- **Change proposed** (a human edits) vs **Change detected** (Sella spots it, later / T6) = the two **sources** of
  a pending change, mirroring birth's manual-vs-Sella doors. Same paper underneath.

Other settled words (see `docs/architecture/CONTEXT.md`): **birth** = a card is created; **seal** = the final
two-sided golden confirmation; **the strip** = the Sella strip in the chat (DealPin); **deal chat** vs **p2p
chat** = the two thread types under a relationship.

---

## 2. The target deal-change flow (how it SHOULD work)

**The core principle:** the **deal card is the trigger** that keeps the deal chat and the p2p chat in sync.
People chat about anything - the dog, breakfast - and that never touches the card. But the moment the **card
changes**, both people must **confirm the change with a change reason**. That confirmation is the one honest
signal that something on the deal actually moved, and it also guards against a Sella/system mistake, because a
human always confirms before anything commits.

**Two cases, one pattern:**

- **Case 1 - Sella detects a change.** Sella spots a change forming in the chat and proposes it: "I detected
  this change - do you accept?" Both sides get **Accept / Decline**, each with a **change reason**. (~70-80% of
  the time it is accepted, because Sella read it from the real conversation.)
- **Case 2 - a human edits the card.** The editor **auto-accepts their own side**, so the change is **pending
  from the other side**, who **Accepts / Declines with a change reason**. Same as Case 1.

**The change is HELD until both accept.** The card keeps its current version while a change is pending; a
**decline discards** the proposed change (the card is unchanged). This is the **backbone** - an edit becomes a
two-sided proposal, exactly like deal **birth**, not an instant version bump.

**On ACCEPT (both sides):** the change commits, the card updates, and we write a **log entry** plus a **system
message in the DEAL chat** ("the deal card updated: ...").

**On DECLINE:** the card does **not** update, so **no deal-chat message**. Instead we write a **log entry** (with
the change reason) plus a **system message in the P2P chat** ("Person X declined this change, reason: ...").

**The gate has only Accept / Decline.** No Counter, no Withdraw.

```
        a change appears on the card
   (Case 1: Sella proposes  |  Case 2: a human edits -> editor auto-accepts)
                        |
                  HELD as a pending change (card stays on current version)
                        |
              other side: Accept / Decline (+ a change reason)
                /                                   \
           BOTH accept                            Decline
                |                                     |
   commit new version + log +              no card change + log +
   system message in DEAL chat            system message in P2P chat
```

---

## 3. Decisions locked this session (2026-06-15)

1. **Edit is HELD until both accept.** A pending change does not touch the live card; a decline discards it.
   This **supersedes** today's "an edit commits immediately." It is the backbone - build it properly.
2. **The gate is Accept / Decline ONLY.** Counter is dropped (it never existed); **Withdraw is removed** (it
   exists today and must be taken out of the gate / `ConfirmBar` / `confirmDeal`).
3. **A human edit auto-accepts the editor's side**, leaving the other side pending.
4. **Two words, two things:** **Note** (optional, per-company, on the card face) vs **Change reason** (required,
   on every accept/decline, into the log). See §1.
5. **Announcements split by outcome:** Accept -> a system message in the **deal chat**; Decline -> a system
   message in the **p2p chat** (never the deal chat, because the card did not change).
6. **Sella-detects-changes (Case 1) is PARKED -> moves to the Sella section (5A.5).** Sella is always the last
   section, and detection-of-changes is new Sella work that rides with the next Sella build.
7. **C2C ticketing + the connected/not-connected differentiator are PARKED** to their own future chapter (the
   inbox already has the assignment + queue primitives to reuse - see §4).

---

## 3A. Held-change model - refined + locked in the 2026-06-16 grill (authoritative where it differs)

The 4.5.4 backbone was grilled to its final shape. This subsection wins where it differs from §2/§3.

- **Card = pure display; strip = the decision surface (separate, beside the card).** Both are bound to the DEAL,
  so putting the deal in two chats (p2p + deal chat) shows the same card AND the same strip in both, synced. The
  held change is the **strip's** data, never part of the card. (Confirms D5/D6.)
- **The pending change is stored, not messaged.** A `deal_pending_change` record, **one active row per deal**
  (DB-unique), holds the new SHARED terms + base version + proposer (company + person) + source + the proposer's
  Change reason + votes (proposer = accept, other = pending). It is **transient** - deleted on every exit; the
  permanent history is `deal_card_log` + `deal_change_input`. The DB-unique rule enforces the lock under races,
  not only the disabled button.
- **FULL LOCK while pending (supersedes the earlier "replace + notify" idea).** While a pending change exists, the
  Edit pencil (card top-right) is **disabled for everyone** - no second paper, no concurrent edit. Because nothing
  else can edit, the base version can never drift, so there is **no version-clash code** (pessimistic over
  optimistic, on purpose). Re-enabled the moment it resolves.
- **Three exits:** the other company **Accepts** (+ reason) -> commit; the other company **Declines** (+ reason)
  -> discard; the proposer **Withdraws** (no reason) -> discard. This Withdraw is the pending-change take-back -
  NOT the seal Withdraw removed by D16; the **seal** gate stays Accept/Decline only.
- **Edit flow:** Edit pencil -> the form (edits SHARED **and** the editor's own PRIVATE items) -> **Done** -> the
  **strip** pop-up collects the **Change reason** + **Send**. On Send: SHARED terms -> the pending change (held,
  locked); PRIVATE items -> written to the editor's own side immediately (ungated, never in the pending change -
  privacy, since both companies read the strip in the deal chat). The reason is in the strip, never a buried form
  field (D8).
- **Per-company decisions; propose = deal-workspace membership.** The proposer's company auto-accepts; **any
  person in the other company**, from **either chat**, decides for that company. The proposer cannot self-accept
  (only Withdraw or wait). Anyone in the **deal workspace** (either company) may propose.
- **Commit (on the second yes) reuses today's version-build logic, just later.** It builds version base+1 from the
  draft (snapshot the new shared lines, carry BOTH sides' private boxes forward), keeps status **`draft`** (the
  golden seal is end-of-lifecycle, out of scope), writes the log line + **both** Change reasons, fires the
  announcement, then deletes the pending row + unlocks. Earlier versions stay frozen.
- **Announcements: both chats, both outcomes (supersedes D18's accept->deal / decline->p2p split).** Accept and
  Decline each post a uniform system message to **both** the deal chat and the p2p chat (the strip lives in both,
  so both audiences hear the outcome). Withdraw = a small quiet notice. Exact wording = T3 (4.5.5).
- **Same accept/decline UI reused** for birth-accept, change-accept, and the later seal (rename Seal -> "Sella ..."
  later). The final golden seal stays end-of-lifecycle and out of T1 scope.
- **Out of scope / parked from this grill:** the final golden seal (end stage); per-product private cost -> margin
  + the edit-form redesign (**T5b**); Sella detecting changes (**T6**).

---

## 4. The code reality (built / missing / wrong) - checked 2026-06-15

Assessed against §2. Verdicts: ✅ built · 🟡 partial · ⚠️ wrong (built but not matching) · ❌ missing.

| # | Target step | Verdict | What the code actually does (evidence) |
|---|---|---|---|
| a | Sella detects a **change** to an existing card | ❌ | `sella-detect` only detects brand-new deals; it loads the thread + the two companies' products and **never reads `deal_card`** (`supabase/functions/sella-detect/index.ts:92-158`). The prompt/schema extract a deal from scratch (`_shared/sella/tools.ts:80-83`, `prompts.ts:12`). The only birth path always mints a NEW card (`confirm_detected_deal` -> `create_deal_draft`). No "apply change to card N" concept exists. |
| b | Edit = a **held** pending change, editor auto-accepted | ⚠️ | `edit_deal_draft` mutates the live `deal_card` to v+1 **immediately** (`supabase/migrations/20260611160000_edit_deal_draft_rpc.sql:78-88`); no held object. It does **not** auto-accept the editor - it leaves both seats pending (the comment at `:9-12`). So decline cannot "discard" a change that is already applied. |
| c | Accept / Decline gate, two-sided "pending" | 🟡 | The gate + the "waiting for the other side" state **work** (`src/modules/deals/actions.ts:51-175`, `confirmDeal`; `ConfirmBar.tsx`; `DealPin.tsx` `awaitingOther`). But it still has **Withdraw** (`actions.ts:84-109`, `ConfirmBar.tsx:82-91`) and captures **no change reason**. |
| d | A **change reason** on every accept/decline -> log | 🟡 | `deal_change_input` is per-user and ready (`...090003_phase2_deal.sql:267-275`), but only the **editor** writes one today (via `edit_deal_draft:144-146`). `confirmDeal` accept/decline write **nothing** to it. The `deal_confirmation.note` column **exists but is unused** (`...090003:215`) - so wiring it is cheap. |
| e | Accept -> "card updated" in the **deal chat** | ⚠️ | The only announcer is `sella-summarize`, triggered on **edit** (`actions.ts:378`), not on both-accept; and it posts the `deal_card_updated` message to **both** the deal thread AND the p2p thread (`supabase/functions/sella-summarize/index.ts:123-146`). Target wants: fire on both-accept, deal-chat only. |
| f | Decline -> "declined + reason" in the **p2p chat** | ❌ | No decline announcement anywhere. `confirmDeal` decline writes only an `audit_log` row (`actions.ts:128-138`); `confirm_detected_deal` reject just updates votes (`...140000_confirm_detected_deal_rpc.sql:70-72`). The only decline text is **UI-local**, not persisted (`ConfirmBar.tsx:114-116`). |
| g | **Note** (per-company content) on the card face | ❌ | No content/note column on `deal_card` (`...090003:151-174`); `CardFront.tsx` renders none. The "note" typed in the edit form today is the **change reason** -> `deal_change_input`, not shown on the card. |
| h | C2C ticketing + connected/not differentiator (parked) | 🟢 foundation | The assignment primitive already exists on the inbox: `pending_inbox_item.{assigned_to, assigned_by, assigned_at}` (`...090002_phase1_core.sql:191-209`) + lenses `Unassigned/Mine/All/History` + a real claim/assign UI (`AssignMenu`, `inbox.ts:156-179`). Connected-state is real (`relationship.status='active'`, minted on accept). BUT it all lives on the **inbox ticket** (terminal on accept), not on `chat_thread` / `deal_card`; the chat box **cannot** show not-connected senders (a thread needs an active `relationship_id`); and deal-start is **p2p-only** (`proposeDeal` needs a p2p `threadId`, `types.ts:410-425`; `ThreadView.tsx:108-114`). |

**Backbone risk callout (row b):** making an edit **held instead of instant** is the deep change everything hangs
on. Today there is no "pending change" object - the edit is already applied. The fix is to reuse the **birth
proposal pattern** (a pending pre-commit object, two votes, commit on both-accept) for **edits** too. Build this
carefully; a mistake here ripples through the whole flow.

---

## 5. The pending work, broken into tasks

Each task is tagged with **where it lives**: a `4.5.x` phase, the `5A.5` Sella section, or **PARKED** (future
chapter). The exact phase numbering below is a **proposal** - we finalise it together.

### Stays in 4.5 (deal birth + acceptance + change)

- **T1 - Edit becomes a held two-sided proposal (the backbone).** Reuse the birth/propose pattern for edits: a
  pending-change object, editor auto-accepted, held until both accept, decline discards. Rewrites
  `edit_deal_draft` + `editDeal` + the gate. **-> 4.5.4 (reshaped). Biggest piece.** Depends on nothing; blocks
  T2/T4/T5.
- **T2 - Change reason on every accept/decline.** Wire the existing `deal_confirmation.note` column; add a
  change-reason input to the gate in the strip; write per-responder to `deal_change_input` + `deal_card_log`.
  **-> 4.5.4 (with T1).**
- **T3 - Accept -> deal-chat system message; Decline -> p2p-chat system message.** Fix `sella-summarize` (or its
  caller) to fire on **both-accept** and target the **deal chat only**; add a new **decline** announcement into
  the **p2p chat**. **-> 4.5.5 (reshaped).**
- **T4 - Remove Withdraw.** Take Withdraw out of `confirmDeal`, `ConfirmBar`, and the strip's Seal popover (gate
  = Accept/Decline only). The UI half is the **end-of-session cleanup** (see §6 / the 4.5 plan); the action half
  rides with T1/T3. **-> 4.5.5.**
- **T5 - The card Note (per-company, optional).** New content field (column or metadata) + a form input + a
  render region on the card face, one per company, both visible, optional. **-> a 4.5 card slice (propose
  4.5.7), or fold into 5A.4 card work - decide in §6.**
- **T5b - Per-product private cost -> private margin (LATER; design captured 2026-06-15).** Replace today's
  single deal-level "Buying price (from supplier)" box (`deal_party_field.supplier_cost`, shown "only you") with a
  **per-product private input per side**: the SELLER fills cost (COGS) per line; the BUYER fills resale price
  (RRP/UVP) per line. The shared `unit_price` (price to the buyer) is the pivot. **Margin is auto-computed per line
  + total and shown ONLY to that side** (seller: price - cost; buyer: resale - price). Store as **private per-line
  rows per company** (row-level privacy - each side sees only its own), NOT column-masked on the shared
  `deal_line_item` (the unused `seller_margin`/`buyer_metric` columns were an early attempt). Rule: **store the
  input, compute the margin** (no stored derived margin). These private numbers NEVER enter the pending change
  (privacy - the strip syncs to both companies in the deal chat). **The edit-deal form needs a redesign** to put
  the private field inline on each product row (lock badge + live margin); the current form is unclear. **Parked;
  not part of the T1 backbone.**

### Moves to 5A.5 (Sella - always the last section)

- **T6 - Sella detects changes to an existing card (Case 1).** New detection capability: read the current card,
  diff it against the chat, and propose a change (not a new birth). New `deal_card`-aware detection + a
  "proposed change" message type + a confirm-change path. **-> 5A.5 (parked until the next Sella build).**

### Parked - own future chapter (foundation exists, see §4 row h)

- **T7 - C2C chat as a ticketing system.** Send a new deal to a known person (lands in their inbox) or to the
  company (Unassigned queue); continue work from the queue. Reuse the inbox assignment primitive + lenses.
- **T8 - Connected vs not-connected differentiator in the chat box.** The box should distinguish messages from
  connected companies vs not-connected (new) senders. Structurally new (a thread needs an active relationship
  today), so it needs a pre-relationship surface or an inbox-into-chat bridge.

### Already done (this chapter, for context)

- **4.5.1** propose-path engine · **4.5.2** the Sella strip · **4.5.3** card = pure display + Seal moved into
  the strip + Edit moved to the card's top-right corner. (4.5.3 still has a stray **Withdraw** button -> T4.)

---

## 6. Suggested build order

1. **T1 + T2 - the backbone** (edit-as-held-proposal + change reason). Everything else depends on it. **4.5.4.**
2. **T3 + T4 - the announcements + Withdraw removal** (accept->deal chat, decline->p2p chat). **4.5.5.**
3. **T5 - the card Note.** Self-contained; can run in parallel or fold into the 5A.4 card redesign.
4. **4.5.6 - cross-deal header notification** (unchanged from the 4.5 plan).
5. **T6 - Sella detects changes.** Later, with the next Sella build. **5A.5.**
6. **T7 + T8 - C2C ticketing + connected differentiator.** Parked future chapter.

---

## 7. Cross-references to fold into the other plans (keep one source of truth)

- **In `4.5-deal-birth-acceptance.md`:** mark 4.5.3 done; add the §3 decisions (held edit, Accept/Decline-only,
  editor auto-accept, the two-word vocabulary, the accept/decline announcement split); reshape 4.5.4 (T1+T2) and
  4.5.5 (T3+T4); add the card Note slice (T5); mark **Sella-detects-changes -> 5A.5** and **C2C -> parked**.
- **In `5a-ui-pass.md`:** in 5A.4, note card-pure-display + Seal-in-strip is done (4.5.3) and add the **card Note
  render** (T5) if we fold it here; in 5A.5 (Sella), add **T6 - Sella detects changes**. Highlight what moved in
  from 4.5.

---

## 8. Marcel's feedback - Linear DEV issues (pending; captured 2026-06-16)

Marcel's 2026-06-15 review (all assigned to Ayush, all Todo, Development team). Captured here so ALL pending work
lives in one file. Most are **5A (Connect / chat UI)**; walk them one by one when we resume.

- **[ ] DEV-66 - Deal Room rename.** Rename "deal **workspace**" -> "deal **room**." ⚠️ **Naming clash:**
  `CONTEXT.md` already uses **"Deal Room"** for the customer-presentation surface (expand a Deal Card). Decide
  whether Marcel means to merge those, or our glossary changes, BEFORE renaming. -> resolve the doubt first.
- **[ ] DEV-67 - Connect layout.** Bigger spaces for main Connect elements; fewer icons + **one-word** labels;
  clicking Connect opens the **chat-contacts list directly (WhatsApp-style)**, none pre-selected; incoming msgs
  **grey**, ours **pink**; **Sella/Preview = a flip page** (flips when a Deal Card / pricelist opens) = an action
  workspace that keeps the chat visible; open a product card and "send to chat," or create a deal and "send to
  chat." (mockup on the issue) -> **5A**; the Sella/flip part overlaps our **Sella strip / SellaPanel**.
- **[ ] DEV-71 - Connect filters.** Connect opens contacts (all closed) -> click one -> bubbles; add filter tabs
  above contacts: **New connections / All / Unread / Companies / Deals.** -> **5A** (pairs with DEV-67).
- **[ ] DEV-72 - THINGS copy.** Reword to **"Add something"** / **"Add something that is required to make this
  Deal perfect."** -> small copy change (THINGS in the Deal Workspace).
- **[ ] DEV-73 - Chat top section.** **Reduce header noise**; click **person** -> profile; click **company** ->
  relationship page (-> company again -> **Present** if a seller); click **"Deals"** -> in-window pop-up of the
  **latest 3 deals** + a **"See all"** -> relationship page. (mockup) -> **5A**; the "Deals" pop-up overlaps our
  **4.5.6 header notification / deal selector** (D9/D11) - fold together.
- **[ ] DEV-74 - Bubble colors.** Other person's bubble **grey** (contrast); our sender = dark pink **`#76002d`**.
  -> **5A** (overlaps DEV-67's bubble note).
- **[ ] DEV-75 - Scroll down in chat.** Always scroll to the newest message, or show a **"jump to bottom"** arrow;
  never leave it mid-way. (mockup) -> **5A** (small).

**Grouping when we resume:** DEV-67/71/73/74/75 = one Connect-chat-UI pass (5A); DEV-72 = a copy tweak; DEV-66 =
resolve the naming clash first. DEV-73 + DEV-67's Sella-flip should fold into the existing 4.5.6 / 5A plans, not be
built twice.

---

*This is the map we open first each session until 4.5 + 5A are closed. Update it as tasks land or move.*
