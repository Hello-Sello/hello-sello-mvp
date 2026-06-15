# 6 - Pending map: the deal-change flow + the honest gap list

**Status:** 🟢 LIVING DOC (the single "what is pending" map). **Owner:** Ayush. **Created:** 2026-06-15.
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

*This is the map we open first each session until 4.5 + 5A are closed. Update it as tasks land or move.*
