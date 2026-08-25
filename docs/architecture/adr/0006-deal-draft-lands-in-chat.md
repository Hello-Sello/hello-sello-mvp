---
status: accepted   # G3 PASSED 2026-08-25 (Muskan) · rev 3 — checker rounds 1 AND 2 folded in.
                   # ⚠️ THE LOOP DID NOT CONVERGE. Budget is 2 rounds (PIPELINE.md §5);
                   # round 2 produced 9 blocking findings, ALL NEW — none were repeats of
                   # round 1. A third round is MUSKAN'S EXPLICIT CALL, not the default.
                   # rev 3's own edits are UNCHECKED by a fresh agent; `critic` + `security`
                   # carry them at build, against real code rather than prose.
                   # r2 verified-true highlights: the ADR had silently overruled an approved
                   # PRD edge-case row (B1 → now §8.9); the ADR-0003 supersede was factually
                   # backwards (B8 → reworded below); no invariant asserted the RECIPIENT can
                   # READ the pill, which is the whole slug (B6 → M9/M10); and a `drop`+`create`
                   # migration would silently lose `authenticated`'s EXECUTE grant (B7).
                   # Two r2 items were NOT folded and were put to Muskan: §8.9 and §8.10.
                   #
                   # G3 — ALL ELEVEN SIGN-OFFS RULED, Muskan, 2026-08-25:
                   #   8.9  resolve-or-create + AMEND PRD:131          (the contested one)
                   #   8.10 accept-path fix  → OWN SLUG, not here
                   #   8.1  extract CounterpartyPersonSelect → yes
                   #   8.2  seller side gains an always-on select → accepted as scope
                   #   8.3  return the c2c thread id; do NOT wire navigation
                   #   8.4  CONTEXT.md:31 "a P2P chat" → "a chat" → yes
                   #   8.5  DECISIONS.md partial-supersede + ADR-0003 correction → yes
                   #   8.6  forgeable deal_detected → FILE SEPARATELY
                   #   8.7  amend AC1/AC2 wording; relabel the option → yes
                   #   8.8  walk G4 as Alice→Bob, not Aurora/Canadian Craft → yes
                   #   8.11 T01 also fixes the p2p arm's race → yes
                   # A THIRD CHECKER ROUND WAS OFFERED AND DECLINED — the loop closes at
                   # its 2-round budget, non-converged, by explicit ruling.
                   #
                   # rev 2 — checker round 1 folded in.
                   # r1: 4 blocking + 15 non-blocking. ALL FOUR BLOCKING VERIFIED TRUE against
                   # the repo before folding (L-003) — three of them corrected claims the ADR
                   # author had made:
                   #   B1 the c2c chat is NOT silent today (a DealPin chip already renders)
                   #      → §0/§1 reframed; option F added and answered.
                   #   B2 `rollout.ts` is a PURE PLANNER — the browser inserts the c2c thread
                   #      → the decision CHANGED to resolve-or-create; invariant M4 deleted.
                   #   B3 inverting deliver_deal_test (1b) silently guts its idempotency case
                   #      → §6.1 now requires a double call.
                   #   B4 "only Sella writes deal_detected" is a COMMENT, not a gate
                   #      → restated honestly; a new finding filed at §7.4.
                   # Fix bias applied: B2's remedy REMOVES a mechanism (a raise + its invariant)
                   # rather than adding one. No fold-in added a mechanism.
                   # Round 2 pending. Items needing Muskan are marked ⚠️ G3 in §8.
slug: 0023-deal-draft-lands-in-chat
supersedes: >
  DECISIONS.md:1013 — the `deal_card` arm ONLY (the other three Connect CTAs are untouched).
  ADR-0003:48-49 — its "sending to a company with no person … FUTURE — the last needs the
  parked C2C ticketing (the inbox `assigned_to` primitive)" clause. ⚠️ CORRECTED at rev 3:
  that clause was NOT left unfulfilled. The `assigned_to` primitive was built
  (`20260607090002_phase1_core.sql:200`), company-addressed send has worked since 2026-07,
  and the clause was discharged WITH the primitive. **What this ADR does is retire that
  primitive's only live producer** — the opposite of "arrives without it", which is what
  rev 2 claimed. A wrong supersede is the class this ADR itself polices.
prd: docs/PRD/0023-deal-draft-lands-in-chat.md (APPROVED at G1, 2026-08-25)
---

# ADR 0006 — A company-addressed deal is announced in the company's chat, by the same code that already announces a person-addressed one

> ### ⚠️ How to read the line numbers in this ADR — added 2026-08-25 (T04 / HEL-66)
>
> **An ADR is a decision record, not a maintained index.** Two kinds of citation live here and
> they are maintained differently — on purpose:
>
> - **Design-time citations** (§2, §3's Reused fence, §6, §8) are **frozen at rev 3, 2026-08-25**.
>   They record what the code looked like *when the decision was made*, and re-pointing them every
>   time the code moves would falsify that record. **This slug's own T01 and T02 diffs have already
>   moved about ten of them** — e.g. `RecipientPicker.tsx:56`'s option string no longer exists in
>   that file, `:48` is now a different element, and "Create a draft deal" moved `:345` → `:373`.
>   **Expect drift here and read these as historical.**
> - **§4.1 and the J-invariants are NOT design-time.** They assert what the system does *now*, and
>   a reader acts on them. **They are maintained**, and were corrected in T04 — `msg_all`
>   `:288-290` → **`:300-302`** (three sites), the `card_relationship_member` deal-child policies
>   `:300-311` → **`:312-322`**, and `can_access_workspace` `:105-113` → **`:117-125`** (`:105-113`
>   was `is_workspace_member` — a *different* function, and the one this ADR's own argument depends
>   on the `OR` branch bypassing).
>
> Anything in the first bucket that becomes **false in substance** — not merely drifted — is
> corrected regardless; one such case is marked inline in §7.


## 0 · In plain English — read this first

**What is wrong today — stated precisely, because the obvious version is wrong.** A
buyer fills a basket on a seller's shop and sends a deal. A ticket is cut on a separate
Connection Requests page, and the seller has to know that page exists, find the ticket,
and then hunt for the matching chat.

It is tempting to say "the company conversation shows nothing." **That is not true, and
the first draft of this ADR said it.** Once a deal exists, the company chat already
renders a persistent clickable chip in its pin row — `DealPin.tsx:791-805`, a
`DealChip` plus an "Open the deal card" control. Muskan's walk was still right: the
thread *body* was unchanged (screenshot `18.58.23`). Both are true at once.

**So the real defect is narrower and sharper: nothing is written to `chat_message`.**
That single fact is what hurts, because three separate things in the product are
derived from it and only from it:

| derived from a `chat_message` row | consequence when none is written |
|---|---|
| the conversation's preview line (`ConversationRow.tsx:64`) | the row still reads "No messages yet" — or the old chat — after a deal arrives |
| the conversation's timestamp (`ConversationRow.tsx:51-53`) | the arrival has no date |
| the conversation **list order** (`store.ts:263`, sorted by `lastMessageAt`) | the conversation **does not rise to the top**, so nothing draws the eye to it |

The existing pin chip only helps someone who has *already opened that conversation*. It
cannot move a row up a list it is not part of. **That is why the recipient hunts.** One
door over, the product already gets this right: a deal addressed to a named *person*
writes a real message — a clickable "has sent a deal" line — into that person's chat,
and that conversation behaves normally as a result.

**What we are choosing between.** Not *whether* to announce it — G1 settled that. The
choice is *where the announcing code lives*. Five shapes were researched; they differ
almost entirely in what they cost in six months, not in what the buyer sees next week.

| | what it means for the product | what it costs later |
|---|---|---|
| **A — the send step does it** *(recommended)* | The one function that already sends deals learns to announce to a company, exactly as it already announces to a person. | Cheapest. ~15 duplicated lines between its two arms; unifying them later is a pure code-move, no data migration. |
| **B — the app does it after sending** | The web page sends the deal, then makes a second call to post the message. | Worst. Two calls means a real path where **Send succeeds and nothing appears** — the exact bug we are fixing, rebuilt. Undoing it means deleting it and doing A. |
| **C — a shared "where does this go?" helper** | Both arms ask one new function where the deal should land. | Looks tidier, is not. Sella's deal door deliberately keeps the *old* routing, so the "one owner" helper would be true of one door and false of another — the mistake we already wrote down as L-038. |
| **D — change the delivery primitive** | Teach the existing `deliver_deal` to post to chat. | It has two callers and only one of them should change, so it needs a mode flag — in a function whose stated design is "no flags". |
| **E — a database trigger** | The database watches for the deal becoming "sent" and posts the message itself. | The announcement becomes invisible at the place a reader looks. Anything that ever marks a deal sent inherits the side effect silently. |
| **F — do nothing new; just make the existing chip easier to find** | Surface the pin chip that is already there. | Cheapest of all, and it **cannot work**: preview, timestamp and list order all come from `chat_message` (table above). A chip cannot reorder a list it is not in. Raised by the checker; answered here so it is not re-proposed. |

**What breaks if we pick wrong.** With B, sellers intermittently never learn a deal
arrived — silent, unreproducible, and it looks like a delivery bug rather than a design
one. With C or D, Sella's deal path quietly changes behaviour when Sella ships, months
from now, with nobody connecting it to this decision. With E, the next person who marks
a deal sent posts a chat message without knowing it.

**How the industry does it.** Mature systems that route "to a company or to a person"
store the addressee **as a field on the object** and let one piece of server code read
that field and decide. Intercom keeps `assigned_team` and `assigned_teammate` on the
conversation record; Salesforce keeps `OwnerId` on the record and resolves who can see
the surrounding discussion server-side. **We already have that field** —
`deal_card.metadata.counterparty_person_id`, written when the draft is born. Nothing is
missing from the data model. The send step simply does not yet *read* it for the company
case the way it already reads it for the person case.

**Recommendation — A**, because it buys the same guarantees as the tidier-looking C
while touching one function instead of introducing a shared owner that Sella's door
would immediately contradict.

**One thing that surprised us, and it makes the fix smaller.** `deliver_deal` — the
thing that cuts the Connection Requests ticket — does *exactly one thing*: write that
ticket. In the person case the send step already calls it and it already does nothing.
So "stop cutting the ticket" is achieved by **deleting one line**, not by adding a
condition. The fix removes a mechanism rather than adding one.

**And one thing that got the decision changed.** The first draft had the send step
*refuse* to send when the company conversation could not be found, on the reasoning that
it always exists. It does not always exist: the conversation is created by the **browser**
in a second network call after a connection is accepted (`store.ts:623-633`), so an
interrupted accept can leave a connected pair with no company conversation — permanently,
with no repair path. The send step now **creates it if it is missing**, exactly as it
already does for a person conversation. This is both safer and smaller: it deletes a
failure mode instead of adding a test for one.

---

## 1 · Context — the defect, precisely

`send_deal` (`supabase/migrations/20260724120300_send_deal.sql`) is the single delivery
writer. Everything happens in one `SECURITY DEFINER` transaction: row lock (`:69`),
guards (`:72-79`), co-owner insert (`:88-98`), the `unsent → negotiation` flip
(`:101-103`), delivery (`:107`), the person arm (`:109-141`), the log line (`:144-146`).

The routing key is `v_cp := metadata.counterparty_person_id` (`:81`):

| `v_cp` | today | after |
|---|---|---|
| **not null** (person-addressed) | `deliver_deal` no-ops (a co-owner exists); p2p thread resolved-or-created + `deal_card` pill inserted (`:118-140`) | **unchanged** |
| **null** (company-addressed) | `deliver_deal` writes a `pending_inbox_item` ticket; **no `chat_message` row** (the c2c pin chip still renders — §0) | c2c thread **resolved-or-created**; the same pill inserted; **no ticket** |

The second half of the defect is that the buyer can never produce a non-null `v_cp`:
`BasketDrawer.tsx:213-215` hardcodes `counterpartyPersonId: null` for every
other-company group, and the picker is gated to own-company groups at
**`BasketDrawer.tsx:311`** — `{group.isOwnCompany && (<RecipientPicker … />)}`. *(The
gate is that line, not `RecipientPicker.tsx:8-10`, which is only the component's
JSDoc — citing a docstring as the gate is the L-006 move this ADR polices two
paragraphs later, and the first draft made it.)* So the working arm is unreachable
from the buyer's side —
fixing only the backend would leave a correct mechanism nothing can trigger.

---

## 2 · Decision

**Approach A.** One new migration re-creating `public.send_deal`, with two changes and
nothing else:

1. **Delete** `perform public.deliver_deal(v_card.id);` (`:107`). Not guard it —
   delete it. `deliver_deal` only ever writes the company ticket
   (`20260720095000_deliver_deal.sql:48-56`), and in the person case it already no-ops,
   so the line has no remaining purpose inside `send_deal`.
2. **Hoist** the sender-name expression and the `chat_message` insert out of the
   `if v_cp is not null` block so **one** expression serves both arms (the PRD's "one
   expression hoisted to serve both arms" ruling). The branch above it decides only
   *which thread id*:
   - `v_cp not null` → p2p, **resolve-or-create**, canonical pair (unchanged, `:111-130`);
   - `v_cp null` → c2c, **resolve-or-create**, keyed on `relationship_id`.

**Why resolve-or-create, and not resolve-and-raise (rev 2 — this reverses rev 1).**
Rev 1 argued the c2c thread always exists, citing `rollout.ts:63-84`. **That was wrong.**
`rollout.ts` is a *pure planner* that writes nothing — it says so itself at `:1-8` — and
the actual `chat_thread` INSERT is issued **by the browser** at `store.ts:623-633`, in a
separate round trip *after* `accept_connection_request` returns the relationship
(`store.ts:588-592`). The RPC mints the relationship and no thread
(`20260823090000:160-190`). So relationship-without-c2c-thread is a reachable state: one
closed tab mid-accept produces a connected pair whose Send would then raise forever, with
no repair path anywhere in the product.

Creating it is safe and is what the person arm already does. The write is idempotent
under the partial unique index `uq_chat_thread_c2c`
(`20260607090003_phase2_deal.sql:139-140`), so the body must use
`insert … on conflict do nothing` followed by a re-select rather than a bare insert — two
concurrent sends on *different* cards of the same relationship are not serialised by the
card lock at `:69` and would otherwise collide on `23505`.

**The body is ONE insert, not two (rev 3 — resolving a contradiction rev 2 shipped).**
Rev 2's §2 said the pill insert is hoisted to serve both arms while §9 booked "~15 lines
duplicated between the arms." Those describe different diffs. **Hoisted is the decision:**
the `if/else` above computes `v_thread` only; the name lookup and the single
`insert into public.chat_message` sit below it, outside the branch, exactly once. J2 is
only meaningful under this reading.

**The migration must be `create or replace`, and must re-emit the grant.** `send_deal`'s
EXECUTE grant is a separate statement (`20260724120300_send_deal.sql:152`), not part of
the function body. A `drop function` + `create` would drop `authenticated`'s EXECUTE and
**Send would fail for every user**. Re-emit
`grant execute on function public.send_deal(uuid) to authenticated;` regardless. *(The
`revoke_anon_execute_on_new_function_trg` event trigger still strips PUBLIC/anon, so the
security hole is covered either way — the missing grant is an availability bug, not a
leak.)*

**The p2p arm keeps the same race, deliberately.** `uq_chat_thread_p2p`
(`20260607090003:141-143`) is the same shape as the c2c index, and the person arm is a
bare select-then-insert (`send_deal.sql:118-130`) declared unchanged here — while part
(b) of this slug makes that arm reachable from the buyer's basket for the first time.
**Recommended: give both arms the same `on conflict` treatment in T01.** It is two lines,
it removes an inconsistency rather than adding one, and leaving it means shipping a known
race into a path this slug newly opens. *(Flagged rather than assumed — it widens T01's
diff beyond the company arm. ⚠️ G3, §8.11.)*

**Two details the body must not miss:** the c2c lookup filters `deleted_at is null` (the
unique index is partial, and `resolveC2cThread` filters it at `store.ts:363`); and the
in-repo precedent for the whole idiom is
`20260823090000_connection_consent_and_verification_lockdown.sql:159-184`, which already
does `INSERT … ON CONFLICT DO NOTHING RETURNING` + re-select-on-null — copy it, comment
included, rather than inventing a second spelling.

**This deletes a failure mode rather than testing one** — the fix that removes a
mechanism, as the fold-in bias requires. Rev 1's invariant M4 ("a missing c2c thread
makes send raise") is deleted with it, along with the privileged-insert test fixture it
would have needed. FR7 is *better* served: there is now no reachable state in which Send
reports success with nothing posted, instead of a state in which Send is permanently
refused.

**Frontend.** Extract the person `<select>` out of `RecipientPicker` into a
`CounterpartyPersonSelect({ relationshipId, onPick })` that both callers use:
`RecipientPicker` composes it after a company is chosen, and the buyer's foreign-company
group in `BasketDrawer` renders it directly with the group's known `relationshipId`.

**The component's contract, stated so it is buildable (rev 3).** `BasketGroup.relationshipId`
is `string | null` (`basket/types.ts:24`), so:
- `CounterpartyPersonSelect` takes a **non-null** `relationshipId`; **the caller gates it.**
  In `BasketDrawer` that gate is `!group.isOwnCompany && group.relationshipId !== null`,
  and it must sit in the `needsConnection` **else** branch — the existing picker slot at
  `:311-315` renders *above* the `needsConnection` split at `:319`, so mirroring that
  placement would print the control next to the connect-first block for a stranger.
- The select renders **synchronously** with "Whole company" already present; connected
  people are **additive when the fetch resolves**. It must never render empty or absent
  while loading.
- It must **not** inherit `RecipientPicker`'s `companies.length === 0` fallback
  ("Connect with a company first to send an offer.", `RecipientPicker.tsx:26-27`) — in a
  *connected* buyer's group that string is false, and under this repo's jsdom-less test
  env it is the only statically renderable output, so the wrong inherit would also look
  green.

**Why not render `RecipientPicker` itself in the buyer group** — it leads with a
mandatory "Select a customer…" company dropdown. In the buyer group the company is
already fixed by the shop being viewed; offering it again would be redundant at best and
at worst would let a buyer retarget the deal to a different company than the basket it
came from. **Why not a `lockedCompany` prop** — that is a mode flag that exposes the
component's internal structure to its caller. The extraction has **two genuine callers
on day one**, which is the bar approach C failed on the backend.

---

## 3 · Reused — already built, we feed it, we do not touch it

Builder's fence and `consistency`'s checklist. Every item below is load-bearing for this
slug and **must not be edited**.

| reused | where | why it needs no change |
|---|---|---|
| The pill renderer | `MessageBubble.tsx:21` | gates on `message.type === 'deal_card'`, never on thread type — it already renders in a c2c thread |
| `deal_card` message type | seeded `20260720130000` | the lookup row exists; no new `chat_message_type` |
| The addressee field | `deal_card.metadata.counterparty_person_id`, written at birth | the data model is already correct; only the *reader* is missing |
| `relationship_id` on the card | set at birth | gives the c2c lookup its key with no new argument |
| `deliver_deal` | `20260720095000` | **not edited.** It keeps serving Sella's door byte-for-byte |
| `claim_deal_ticket` | `20260720110000` | **not edited** — see §7.2, its survival rationale is not the PRD's |
| `getMyConnections()` | `messaging` | already returns each connected company **with its people** — no new query |
| `RecipientPicker`'s company select | `RecipientPicker.tsx:32-46` | unchanged; only its person select moves. ⚠️ **The FILE is not fenced** — §8.2 deletes its `people.length > 0` gate (`:48`) and §8.7 may relabel its option (`:56`). The *company select* is what must not change |
| Birth-time validation of the picked person | `create_deal_draft:88-100` | already re-validates that `counterparty_person_id` is on the other side of the relationship, and `deal_card` is not client-writable (`20260724120900:33`). **This is why `send_deal` need not re-validate `v_cp`** |
| c2c thread creation on accept | `store.ts:600-640` (browser-side, from a pure plan) | **not touched.** This slug does not repair the interrupted-accept window; it stops being fatal because Send now creates the thread if absent (§2) |
| The c2c pin chip | `DealPin.tsx:791-805` | **not touched.** It stays and is not superseded — it is the in-conversation surface; the pill is the arrival signal (§0) |
| Send-once + sender-only guards | `send_deal:72-79` | survive verbatim; AC7/AC8 rest on them |
| The connect-first block | `BasketDrawer.tsx:320-331` | already IS the consent rule (AC7); untouched |

---

## 4 · Blast radius

### 4.1 Callers and cross-surface dependencies

| touched / affected | evidence | consequence |
|---|---|---|
| `send_deal` | `20260724120300` | re-created by one new migration |
| `deliver_deal` | `20260720095000` | **loses one of its two live callers.** Its only remaining caller becomes `confirm_detected_deal_births_negotiation.sql:176` (Sella) |
| Sella's deal door | `confirm_detected_deal_births_negotiation.sql:176` | **unchanged, by explicit G1 ruling.** No traffic: `deal_detected` is service-role-writable only (`20260614121000:12`) and Sella is not built |
| `create_deal_draft`'s old delivery | `20260720100100:179` | **already dead** — deleted by `20260724120200:23`. Verified, not assumed |
| `sendDeal` action | `deals/actions.ts:369` | signature is `Promise<{ threadId: string \| null }>` — the **field** is already nullable, so **no signature change** |
| `sendDeal`'s docstring | `deals/actions.ts:357-368` | ~~**becomes false and is on the fix list.**~~ **DISCHARGED 2026-08-25 (T04): T01 rewrote it.** It no longer mentions `deliver_deal` at all — it now reads *"No caller navigates on it today - `DecisionBar.tsx:161` discards it"*. ⚠️ *The twin statement in §8.3 was corrected earlier in this same ticket under the "false in substance" rule; **this one sits in the MAINTAINED bucket and was missed on the first pass** (`critic` N2) — the principle was applied to the frozen half and not the maintained half* |
| Its only UI caller | `DecisionBar.tsx:161` | does `void run(() => sendDeal(...))` — **discards the return**. The company arm returning a thread id instead of `null` is inert (see §8.3) |
| The Sella detection trigger | `20260612130000:41-49` | **cannot fire** on the new insert: requires `type='message'` (ours is `deal_card`) *and* a p2p thread (ours is c2c). Doubly safe |
| `pending_inbox_item` | base table | **not written to** by the deal path any more. Row shape, RLS and every other type untouched |
| The inbox "Deal tickets" lens | `/connect/inbox` | goes permanently empty for buyer-sent deals. **In scope and intended** (FR5/AC3); the page and its other three types stay |
| `chat_message` RLS | `20260607170000:300-302` | unchanged — the definer insert does not depend on it, and no policy is widened |
| Recipient-side `deal_member` | `claim_deal_ticket:62-68` | **nobody on the receiving side becomes a `deal_member` any more** — claiming was the only path for company-addressed deals. **Checked, and benign:** `deal_line_item` / `deal_card_log` / `deal_change_input` gate on `card_relationship_member` (`20260607170000:312-322`), `deal_workspace` is born `company_wide` so `can_access_workspace` (`:117-125`) passes — ⚠️ earlier revisions cited `:105-113`, which is **`is_workspace_member`**, the function this argument depends on the `OR` branch BYPASSING (`:123`), and `sign_deal` gates on relationship membership only (`20260724120500:73-82`). Recorded so it is not re-derived |

### 4.2 Base tables this work did not write

`chat_thread`, `chat_message`, `deal_card`, `deal_member`, `deal_workspace`,
`pending_inbox_item`, `relationship`, `person`. **No schema change, no RLS change, no
grant change is proposed by this ADR.** The migration re-creates one function body.

**Deploy window — the picture CHANGED between rev 3 and G3 close; do not use the old one.**
Checker round 2 (B7) correctly warned that two migrations were ledgered PENDING / local-only
(`20260824090000` T13, `20260824100000` T11) and that a later-stamped `send_deal` migration
would drag them to production. ✅ **That risk is GONE: both were pushed to production on
2026-08-25 by the parallel security session**, and the ledger's two entries now read
**`✅ APPLIED 2026-08-25`**.

**Verified against production, not against the ledger** (`list_migrations` on
`byipusuthdlskdxoexkt`, 2026-08-25): the two are the **last two rows** on cloud, so
production's tip is **`20260824100000`**.

**What T01 must therefore do:** stamp its migration **after `20260824100000`** — e.g.
`20260825090000_send_deal_c2c_announce.sql`. Then a **plain `supabase db push` is
correct** and **`--include-all` is NOT needed** (contrast slug 0022, where a back-dated
filename forced it — L-034). This slug now carries **no piggy-backed migration and no
parked security change**: §4.2's "no schema, no RLS, no grant change" is true of the
deploy as well as the diff.

**One consequence of adding a `chat_thread` INSERT (B3, honestly stated).** The browser's
accept path uses a **bare** insert with `if (tErr) throw tErr;` (`store.ts:624-634`). A
send racing an accept can now surface a raw `23505` in the *accept* flow, after
`accept_connection_request` has already committed the relationship. Rare, new, and the
direct cost of choosing resolve-or-create.

### 4.3 Test cover — verified suite by suite, not by name

STATE.md §"Open, not blocking" items 4 and 5 asked `/design` to settle this before
tickets are cut (L-009). Settled:

| suite | verdict | evidence |
|---|---|---|
| `deliver_deal_test.sql` | **BREAKS BY DESIGN — deliberate rewrite** | `:98-128` asserts `send_deal` on a c2c card writes a `deal_card` ticket. That is exactly what FR5 removes |
| `claim_deal_ticket_test.sql` | **BREAKS BY DESIGN — deliberate rewrite** | `:83-93` sends, then asserts the ticket exists, then claims it. Its producer is gone (§7.2) |
| `e2e/deal-c2c-create.spec.ts:141-191` | **BREAKS BY DESIGN — premise reversed** | the whole test is "the ticket lands in the other company's Deal tickets lens" |
| `decline_deal_test.sql` | **SAFE** | `:110,:143` call `send_deal` only as a state step; fixture uses the seeded GreenLeaf↔StonePharm relationship, which **has** a seeded c2c thread (`seed/seed.sql:321`) |
| `update_deal_draft_test.sql` | **SAFE** | `:145`, same reason |
| `confirm_deal_change_metadata_merge_test.sql` | **SAFE** | same fixture; reads `send_deal` for person routing only |
| `finalize_deal_test.sql` | **SAFE** | references `deliver_deal` in a header comment only |
| `rls_isolation_test.sql` | **SAFE** | `:238` is a comment deferring to `deliver_deal_test` |
| `announcement_projection_test.sql` | **SAFE — and it was on no list** | counts `chat_message`, but every count is scoped to `sender='sella'` with types `deal_card_updated` / `deal_change_declined` (`:111-113,:176-178`). A `sender='person'`, `type='deal_card'` pill cannot inflate them |
| `e2e/deal-p2p-send.spec.ts` | **SAFE** | `:74` asserts **0** tickets on the person path — still true, and now true for the company path too |
| `e2e/deal-change.spec.ts` | **SAFE** | drives `send_deal` only via `createDraftDealAsAlice` (`e2e/fixtures/two-company.ts:745-760`) as a state step |
| `e2e/chat-phase7.spec.ts` | **SAFE** | same fixture, same reason |

| `e2e/inbox-accept.spec.ts` | **JUDGE EXPLICITLY — the only guard on the invariant this slug now writes against** | `:157-158` asserts `countThreadsForPair("c2c") === 1` and that `connection_established` lines are unchanged. Our new create path only fires when **no** c2c thread exists, and this spec's scenario has one — so it should stay green, but it is the one test that would catch a create-too-eagerly bug, and T01 must run it deliberately rather than incidentally |

*(rev 1's sweep missed three e2e specs; rev 2's still missed `inbox-accept.spec.ts`,
`chat_message_type_pills_seed_test.sql`, `accept_person_connection_test.sql` and ten
suites touching `pending_inbox_item`. **The method was the defect both times: the list was
written from recall, not from grep.** T01's first step is to regenerate this table
mechanically — `grep -rln "send_deal\|deliver_deal\|pending_inbox_item\|chat_message"
supabase/tests/ e2e/` — and reconcile against this table rather than trusting it.)*

⚠️ **Two suites in this table can never go red:** `run_announcement_projection_test.sh`
and `run_rls_isolation_test.sh` **do not exist**, so those files never execute. Rating
them SAFE is correct; counting them as verification cover is not (`rls_isolation_test.sql`
is also the known-stale DEV-161 suite).

**The three SAFE-because-of-the-seed suites are safe only while `seed/seed.sql:321`
mints that c2c thread.** That is a fixture dependency created by this ADR, and it is
listed as invariant M4 below so a machine holds it, not a memory (L-033).

---

## 5 · Invariants — each sorted as it is written

**Machine-checkable — these leave this document and become tests.** They are the
acceptance surface for T01/T02 and must exist as assertions, not prose.

| # | invariant | where it is checked |
|---|---|---|
| **M1** | Sending a company-addressed deal inserts exactly **one** `chat_message` with `type='deal_card'` into the **c2c** thread of the card's relationship | new SQL suite (T01) |
| **M2** | Sending a company-addressed deal creates **zero** `pending_inbox_item` rows | new SQL suite (T01) |
| **M3** | Sending a **person**-addressed deal still inserts its pill into the **p2p** thread and **nothing** into the c2c thread | new SQL suite (T01) — this is FR4/AC6, the regression most likely to be missed |
| ~~**M4**~~ | ~~A relationship with no c2c thread makes `send_deal` raise~~ — **DELETED at rev 2.** The decision changed to resolve-or-create (§2), so this state is no longer reachable *or* fatal. Struck rather than dropped so it is not re-added from rev 1 (L-039) | — |
| **M4′** | Sending on a relationship whose c2c thread is **missing** creates it and posts the pill; sending **twice** does not create a second thread | new SQL suite (T01) — replaces M4, and covers the `on conflict` path |
| **M5** | `authenticated` still may **not** `EXECUTE deliver_deal` directly | already exists — `deliver_deal_test` WR-01 (`:146-158`); **must be carried into the rewrite, not lost with it** |
| **M6** | Only the initiating company may send, and only an `unsent` card may be sent | already exists; must survive the re-created body (AC7/AC8) |
| **M7** | The addressee control renders for a buyer's connected-seller group even when that company has **zero** connected people | **e2e (T02), not unit.** `BasketDrawer.test.tsx` renders via `renderToStaticMarkup` and this repo's node test env has **no jsdom**, so `useEffect` never runs and the people list never populates — a unit test can only assert the static fallback, never the populated select (L-018: plan the test surface against the runner that exists). The unit file still gains the *presence* assertion; the zero-people behaviour is e2e's |
| **M8** | `deliver_deal`'s body and grants are byte-identical after this slug | `git diff` on the migration set (T01 review) |
| **M9** | **The RECIPIENT can read the pill.** As the receiving company's member (`SET LOCAL ROLE authenticated` with their jwt), the c2c pill is `SELECT`-able, and its `metadata.deal_card_id` resolves to a `deal_card` **and** `deal_line_item` rows that member can also `SELECT` | new SQL suite (T01) |
| **M10** | A **third** company's member selecting the same pill and card gets **zero rows** | new SQL suite (T01) |
| **M11** | `send_deal` still carries `grant execute … to authenticated` after the migration | new SQL suite (T01) — cheap, and B7's failure mode is total |

**Why M9/M10 exist, when §4.1 already reasons the reads are fine.** Every other
invariant here is a **writer-side row count**, taken inside a definer function where RLS
is bypassed. FR8/AC5 — the recipient finds the deal without the inbox — is falsifiable
only by *reading as the recipient*. This repo has shipped **four consecutive visibility
divergences** that writer-side counts could not see (slug 0022, rounds 1-4). Asserting
the negative space is the standing rule, not an extra.

**Judgment-only — these stay here and go into `critic`'s brief.** No test can hold them.

- **J1 — the pill's *thread* is decided server-side, never by the client.** A future
  convenience that resolves a thread in TypeScript and posts the pill re-creates
  approach B and silently voids FR7. RLS permits such an insert
  (`20260607170000:300-302`); only this design forbids it.
  **What this does NOT buy, stated so it is not over-claimed — TWO halves, not one
  (amended 2026-08-25, T04; the second half was disclosed by `security` B1 at T01's G4 and
  was missing here):** `msg_all` is `FOR ALL TO authenticated` with **neither a `type`
  predicate nor a sender predicate**, so any thread member can already
  1. insert a `type='deal_card'` row carrying an **arbitrary `metadata.deal_card_id`** — the
     id is read at `MessageBubble.tsx:43` and opened at `:46-53`, whatever it points at; and
  2. 🔴 **forge the SENDER.** `sender_person_id` is unconstrained on INSERT, so a member can
     post a pill attributed to **another person**, with a body reading *"&lt;victim&gt; has sent a
     deal"*. **This slug moved the deal signal onto that policy**: before T01 the company arm
     wrote `pending_inbox_item`, which `20260823090000:306-309` had identity-hardened
     (`sender_person_id = auth.uid()`) one slug earlier. **The signal migrated onto a weaker
     policy; no policy was widened.** Tracked as **HEL-67** (widened Medium→High).

  The PRD's constraint (a client cannot place a signal in a conversation it could not
  otherwise reach) holds. *"Every pill points at a real deal on this relationship"* and
  *"every pill was sent by the person it names"* do **not** hold, and nothing in this slug
  makes them so.
- **J2 — the two arms must stay one expression.** If a later change gives the company
  pill different wording, the arms fork and "the same signal in both places" stops being
  true without any test failing.
- **J3 — Sella's door is deliberately inconsistent, not overlooked.** Anyone reading
  `send_deal` and `confirm_detected_deal_births_negotiation` side by side will see two
  answers to one question. That is the G1 ruling, recorded so it is not "fixed" by
  someone tidying up.
- **J4 — `deliver_deal` and `claim_deal_ticket` are kept alive for a door that has no
  traffic yet.** They will read as dead code. §7.2 is the reason they are not dropped.
- **J6 — FR2's default is unchecked by any test.** *"The addressee defaults to the whole
  company; choosing a person is a deliberate act"* is a claim about option **order and
  preselection**, and §8.7's proposed relabel of `RecipientPicker.tsx:56` is precisely the
  edit that could reorder them. ~~If §8.7 is taken, T02 must assert the default explicitly.~~
  **RESOLVED 2026-08-25 (T04): §8.7 WAS taken and built.** T02's C1 asserts the default, and the
  option string no longer lives in `RecipientPicker.tsx` at all — it moved to
  `CounterpartyPersonSelect.tsx:108`. ⚠️ **The banner above names this very citation as its
  headline example of frozen design-time drift. J6 is a MAINTAINED invariant, so it is corrected
  here and the banner's example stands as history** (`critic` N3 — one citation was claimed by
  both buckets).
- **J7 — "only connected people are selectable" is not what the picker does.** ADR-0003:32
  says only connected companies/people are selectable. `getMyConnections()` returns
  **every** person at a connected company via `can_see_person`
  (`connections.ts:104-116,:143`), not person-graph connections, and
  `create_deal_draft:88-100` validates only "on the other side of the relationship." This
  is pre-existing, but the buyer picker is **new traffic through it**. Recorded as
  deliberate: the person graph (`accept_person_connection`) is **not** consulted when
  addressing a deal. Anyone who reads ADR-0003:32 as violated should read this line first.
- **J5 — the discovery channel changed; the audience did not.** Re-litigating this as a
  permissions change is a wrong turn the work order already took once (PRD §Audience).

---

## 6 · What is deliberately broken, and how it is repaired

Three artifacts assert the behaviour this slug reverses. They are **rewrites, not
repairs** — the old assertions are correct statements about a product decision that G1
overturned.

1. **`deliver_deal_test.sql`** — its c2c case (`:98-128`) inverts: after `send_deal`,
   assert **zero** tickets and **one** c2c pill.
   ⚠️ **Its idempotency case cannot simply be "preserved verbatim" — rev 1 said that and
   was wrong.** Case (2a) (`:130-144`) calls `deliver_deal` **once** and asserts exactly
   one ticket. Today that is an idempotency proof only because case (1b)'s `send_deal`
   already wrote the ticket. Once (1b) asserts **zero**, the `:134` call becomes the
   *first* insert, `v_n = 1` passes trivially, and `deliver_deal`'s `if not exists` guard
   (`20260720095000:51-56`) is left **uncovered anywhere in the repo** — a green test
   proving nothing. **The rewrite must call `deliver_deal` twice** and assert one ticket
   after the second. Without that, invariant M8 protects a function whose only
   behavioural guarantee is untested.
   Its `WR-01` execute-revoke case (`:146-158`) *is* preserved verbatim (invariant M5).
2. **`claim_deal_ticket_test.sql`** — its fixture can no longer manufacture a ticket via
   `send_deal` (`:83`). The claim primitive still exists and still needs cover, so the
   fixture inserts the `pending_inbox_item` directly, testing the claim gate without a
   producer. **This is the honest shape**: it documents that the primitive outlived its
   caller. **Note the file calls `send_deal` twice** — `:83` (company-target, the one
   that changes) and `:193` (person-target, which survives untouched). A rewrite that
   reads only `:83` will misjudge the file.
3. **`e2e/deal-c2c-create.spec.ts:141-191`** — replaced by the inverse walk: the pill
   appears in the recipient's c2c chat, the Deal tickets lens is empty, and clicking the
   pill opens the card (AC2/AC3/AC4/AC5).

4. **A comment that must NOT be copied into the new body.**
   `20260724120300_send_deal.sql:14-17` and `:83-85` justify the co-owner insert's
   *position* as "BEFORE `deliver_deal` reads its routing key." With `:107` deleted that
   ordering constraint is **vacuous**. A migration written by copying the old body
   forward will carry a rationale for a call that no longer exists — the same stale-
   citation class as §4.1's `actions.ts` docstring. The co-owner insert still belongs
   before the status flip; the *reason* changes.

---

## 7 · Corrections carried into this ADR

**7.1 — `create_deal_draft` is not a third `deliver_deal` caller.** A grep shows three
call sites; `20260720100100:179` is dead, deleted by `20260724120200:23`. The PRD's
"two live callers" is right; the raw grep is not.

**7.2 — the PRD's rationale for keeping `claim_deal_ticket` is wrong, though its
conclusion is right.** The PRD says it "becomes unreachable for deals but still serves
the other types." It does **not** serve the other types: it gates on
`type = 'deal_card'` (`20260720110000_claim_deal_ticket.sql:48`, inside the gate at
`:45-54`) and nothing else. The correct reason to keep
it is that **Sella's door still produces `deal_card` tickets** — `confirm_detected_deal`
calls `deliver_deal` when no counterparty person is set — so the claim primitive keeps
exactly one producer, dormant until Sella ships. This strengthens rather than weakens
the PRD's obligation on the page-deletion slug.

**7.3 — `announcement_projection_test.sql` belongs on the blast-radius list** and was on
none of STATE.md's. It is safe (§4.3), but it was found, not known.

**7.4 — "Sella's door has no traffic" is a choice, not a proof — and the difference
matters twice.** Rev 1 cited `20260614121000:12` as evidence that `deal_detected`
messages are service-role-writable only. **That line is a code comment.** The governing
policy is `msg_all` (`20260607170000:300-302`): `FOR ALL TO authenticated`,
`USING/WITH CHECK can_access_thread(thread_id)` — **no `type` predicate** — and no
migration REVOKEs or narrows `chat_message` for `authenticated`. So an authenticated
member of a p2p thread **can** insert a `deal_detected` row today.

Restated honestly: **Sella's door is left on the inbox route by explicit G1 ruling, not
because it is proven unreachable.** Nothing in this slug changes it either way. Two
consequences worth carrying:
- the written obligation handed to the page-deletion slug rests on this door still
  writing to the inbox — which is *more* true, not less, if the door is reachable;
- **a separate finding, out of scope here:** a person can forge a `deal_detected`
  message in their own thread and drive `confirm_detected_deal`. Low severity (it is
  confined to threads the actor already belongs to), but it is a real gap between a
  comment and a gate, and it should be filed rather than absorbed into this ADR. **⚠️ G3
  — see §8.6.**

---

## 8 · G3 sign-offs — needed from Muskan, none assumed

> ✅ RULED yes — Muskan, 2026-08-25.

**8.1 — the frontend shape.** Extract `CounterpartyPersonSelect` used by both
`RecipientPicker` and the buyer group (§2), rather than re-rendering `RecipientPicker`
whole or adding a `lockedCompany` flag. **Recommended.** Two real callers on day one.

> ✅ RULED accepted as scope — Muskan, 2026-08-25.

**8.2 — a small change to an existing surface falls out of 8.1.** Today the seller's
`RecipientPicker` hides the person select when the chosen company has **zero** connected
people (`RecipientPicker.tsx:48`). Invariant M7 requires the control to always render.
Once the select is shared, **the seller side gains that behaviour too** — a seller
picking a person-less company will now see a select offering only "Whole company".
**This is scope added by the mechanism, not a free improvement** — no FR or AC asks for
it; it falls out of choosing extraction over duplication. Labelled as such rather than
sold as a bonus. **Recommended: accept it** — one rule in one place beats two behaviours.

> ✅ RULED — Muskan, 2026-08-25: return it, do NOT wire navigation.

**8.3 — the return value.** `send_deal` returns the p2p thread id today and `null` for
company deals. After this change the company arm naturally has a c2c thread id to
return. **Recommended: return it.** It costs nothing, it is honest, and it makes the
two arms symmetric. **Explicitly NOT recommended: wiring navigation to it.** The only
caller discards the value (`DecisionBar.tsx:161`) and "land the sender in the
conversation after Send" is not in the PRD. ~~Flagged because the action's own docstring (`actions.ts:364`) already *claims* the host
navigates, and no host does — a stale comment that will read as a bug to the next person.~~
**CORRECTED 2026-08-25 (T04): no longer true. T01 rewrote that docstring**; it now reads
*"No caller navigates on it today - `DecisionBar.tsx:161` discards it - so treat it as
diagnostic, not as a routing contract"* (`actions.ts:365-367`). The recommendation stands;
the stale-comment rationale for it is discharged.

> ✅ RULED yes — Muskan, 2026-08-25. T04 owns it.

**8.4 — the vocabulary line.** `CONTEXT.md:31` defines a Deal draft as sitting in "a
P2P chat". After this slug it can sit in a c2c chat. Proposed at G1, still unwritten:
replace "a P2P chat" with "a chat". **Needs a yes** — it is a one-line edit to a
shared doc.

> ✅ RULED yes — Muskan, 2026-08-25. T04 owns it.

**8.5 — the `DECISIONS.md` entry.** The partial supersede of `:1013` (the `deal_card`
arm only) is not yet written into `DECISIONS.md`. **Needs a yes** before T04 writes it.
The ADR-0003 clause retirement (frontmatter) rides the same entry.

> ✅ RULED — file separately. Muskan, 2026-08-25.

**8.6 — a security finding to file, not to fix here.** §7.4: a person can insert a
`deal_detected` message into a thread they belong to, because `msg_all` has no `type`
predicate, and thereby drive `confirm_detected_deal`. **Recommended: file it as its own
ticket**, out of this slug. Raising it here only because this ADR was about to cite the
comment as if it were a gate.

> ✅ RULED — amend both ACs and relabel the option. Muskan, 2026-08-25. T04 + T02.

**8.7 — two acceptance criteria do not match the product as built. ⚠️ This one bites at
G4, where the ACs are walked verbatim and G2 was skipped, so they are the *only* thing
G4 compares against.**

| AC as written | what the product does | needed |
|---|---|---|
| AC1: the control "reads **Whole company**" | the option string is **"Whole company (optional person)"** (`RecipientPicker.tsx:56`) | either relabel the option to "Whole company", or amend AC1 to the real string. **Recommended: relabel** — "(optional person)" describes a second control that, in the buyer's group, is the *only* control |
| AC1/AC2: "Alice … opens the basket … clicks **Send**" | the basket has **no** Send button. It has "Create a draft deal" (`BasketDrawer.tsx:345`); Send lives on the card's `DecisionBar` afterwards (`:161`), by design (`BasketDrawer.tsx:234`, D-12) | amend the ACs to the real two-step: pick addressee → **Create a draft deal** → the card opens → **Send deal**. No code change |

Neither is a defect in the product — both are the spec describing a flow slightly
differently from how it is built. **Fixing the ACs is a spec amendment and needs your
yes**; left alone, G4 fails on wording.

**8.9 — ⚠️ THE ONE I GOT WRONG PROCEDURALLY. Resolve-or-create contradicts an approved
PRD row, and rev 2 changed it without asking.** `docs/PRD/0023-deal-draft-lands-in-chat.md:131`
says: *"The company-to-company conversation cannot be found | **Send must not report
success.** FR7 governs."* Rev 2 replaced refusal with silent creation on engineering
grounds (§2) and did not put it to you — while asking your yes on two AC *wordings*. That
is backwards, and it is the L-017 class: an exception added to an approved criterion is a
deviation, never a "correct reading."

| option | consequence |
|---|---|
| **(a) resolve-or-create** *(what §2 currently says — recommended)* | an interrupted accept self-heals on first send; the PRD row needs a **spec amendment**, because the state it describes stops being reachable |
| **(b) restore refusal** | the PRD stands unamended; a pair left without a c2c thread can never send, with no repair path in the product |

**Recommended (a)** — but only with the PRD amended in the same breath. As it stands, G4
would walk a spec that says the opposite of the code.

> ✅ **RULED — Muskan, 2026-08-25: (a) resolve-or-create, and amend the PRD.** §2 stands
> as written. `PRD:131`'s edge-case row becomes *"the send creates it; the deal still
> lands"* — **T04 owns that amendment, and it is not optional**: leaving the old row in
> place is what would fail G4 on a spec that contradicts the code (L-039). T01's AC 4
> stands unchanged. **A third checker round was offered and NOT taken** — the loop closes
> at its 2-round budget with rev 3 unchecked by a fresh agent, carried by `critic` +
> `security` at build.

> ✅ RULED — OWN SLUG, not this one. Muskan, 2026-08-25.

**8.10 — a materially better option that was never on the table, and it is bigger than
this slug.** The interrupted-accept state exists only because thread creation lives in
the **browser** (`store.ts:624-633`) in a second round trip after the RPC. The fix that
genuinely *removes* a mechanism is to move the c2c insert **into
`accept_connection_request`** and delete the browser insert — making "an accepted
relationship has a c2c thread" a real invariant, which `resolveC2cThread` (`store.ts:368-370`)
and `ChatView.tsx:101` already assume today. The RPC already uses the exact idiom
(`20260823090000:159-184`).

**Not folded in, deliberately: it is a different slug.** It touches the accept path, which
this slug was not asked to open, and §8.9(a) makes it unnecessary for *this* capability.
**Recommended: file it as its own slug** and keep (a) here. Raised because the ADR's own
simplification bias points at it, and rev 2 claimed the window was "survived, not closed"
without ever listing closing it as an option.

> ✅ RULED yes — T01 fixes both arms. Muskan, 2026-08-25.

**8.11 — should T01 also fix the p2p arm's race?** See §2. Two lines, removes an
inconsistency, but widens the diff past the company arm. **Recommended: yes.**

> ✅ RULED — walk G4 as Alice→Bob. Muskan, 2026-08-25.

**8.8 — the acceptance criteria name actors that do not exist locally.** The ACs are
written for **Alice (Aurora)** and **Marcel (Canadian Craft)** — production fixtures
from the 0022 G5 walk. The local seed has GreenLeaf, StonePharm, Rheinland, NordCanna,
Bavaria and PendingCo, and **no Aurora, no Canadian Craft, no Marcel**
(`supabase/seed/seed.sql:82,:84,:215,:284`). **Recommended: walk G4 locally as
Alice (GreenLeaf) → Bob (StonePharm)**, the pair every SQL fixture already uses, and
keep the production names only for the eventual G5. Needs your yes because it changes
what the G4 sheet says.

---

## 9 · Consequences

**Good.** The two arms of `send_deal` become one shape with a two-line difference. The
buyer's basket gains the addressee choice that makes the person arm reachable at all.
**One mechanism is removed and one is added** — rev 2 claimed "two removed, none added",
which was false: declining to introduce rev 1's raise is not a removal, and `send_deal`
gains a `chat_thread` INSERT it has never had. The honest ledger is: **`deliver_deal`'s
call goes; a thread-create arrives.** No schema,
RLS, or grant change — so `security`'s S1–S8 surface is a re-created definer function
body and nothing else. A side benefit of rev 2: a connected pair left without a c2c
thread by an interrupted accept is **silently healed** the first time either side sends,
rather than being permanently unable to send.

**Bad, and accepted.** `deliver_deal` and `claim_deal_ticket` become dormant code with a
single dormant producer, and will look droppable to anyone who does not read §7.2. The
routing question now has two live answers — `send_deal`'s and Sella's — deliberately
(J3). ~15 lines of resolve+insert are duplicated between the arms rather than extracted,
a debt that is a pure code-move to repay once a second door needs the same rule.
*(Corrected at rev 3: this line survives from rev 1 and is about the RESOLVE halves only —
the pill insert itself is hoisted and written once, per §2.)* Two further costs found at
round 2: a c2c thread **healed** by `send_deal` permanently loses its
`connection_established` seed line, because a later accept retry sees the thread already
present and skips both (`store.ts:620-622`, counted by `e2e/inbox-accept.spec.ts:125`);
and the inbox's Deal-tickets lens does **not** go empty on day one — pre-existing pending
`deal_card` rows on production survive the deploy and stay claimable. It goes empty for
*newly sent* deals. The
company chat now carries **two** deal surfaces — the pin chip and the pill — which is
intended (they answer different questions: "what deal is live here?" vs "something
arrived") but is one more thing on the screen. And the interrupted-accept window at
`store.ts:600-640` is *survived*, not *closed*; the underlying two-round-trip accept is
untouched and still worth its own slug.

**Deferred, unchanged from the PRD.** Request-pricing → chat; deleting the Connection
Requests page (now carrying the §7.2 obligation); chat-list consolidation; the deal-card
defects; `canAsk`.
