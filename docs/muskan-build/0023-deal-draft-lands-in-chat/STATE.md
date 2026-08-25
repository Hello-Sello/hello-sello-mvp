# 0023 deal-draft-lands-in-chat — work order
lane:   FULL
stage:  design ✅ → build ✅ (T01-T04 all closed) → ship ✅ (PR #177 + #180) → **G5 WALKED 2026-08-25 — 🏁 SLUG COMPLETE**   ·   G2 /prototype SKIPPED (Muskan, 2026-08-25)
branch: claude/muskan/work — no feature branch (Muskan's call, 2026-08-18)

## Seed
Muskan, 2026-08-25. Origin: F-04 of the 0022 G5 walk. Narrowed twice in triage,
then widened once — the full original seed is in `SEED-ORIGINAL.md`.

**The capability, in one sentence:** a buyer addresses a deal draft from any shop
— to the company, or to a person inside it — and it lands in that addressee's chat.

## Muskan's live walk, 2026-08-24 (the reproduction)
Alice (Aurora) → Canadian Craft's shop → 2 products → "Create a draft deal" → Send.

| observed | screenshot |
|---|---|
| No recipient/person picker anywhere in the basket | 18.55.42 |
| Draft born, lands sender in the c2c chat, card panel opens | 18.57.38 |
| After Send: card says "Waiting for the other side to sign" — **c2c thread body unchanged**, still just "now connected" + "hey" | 18.58.23 |
| Contrast: the p2p thread with Bob Stone DOES carry a pill — "Click to open the deal card · 23 Jun" | 19.04.34 |
| Recipient finds the deal in **Connection Requests**, not chat; then must hunt the conversation; no signal on arrival | walk notes |

Those last three are ONE defect: `send_deal`'s person arm posts a pill, its company
arm posts nothing and cuts an inbox ticket instead.

## Scope — two halves of one mechanism
| | |
|---|---|
| backend | `send_deal` company arm → `resolveC2cThread` + the same pill insert, instead of `perform public.deliver_deal(...)` (`20260724120300_send_deal.sql:107`) |
| frontend | buyer group renders the person select; `BasketDrawer.tsx:213` stops hardcoding `counterpartyPersonId: null` |

**Why both, not just the backend** (Muskan's ruling, overriding an earlier defer):
without the picker, `counterparty_person_id` is permanently null on the buyer side,
so the person arm never fires and the routing has nothing to route. Half a mechanism.

"If they don't know anyone, just the company" is already the shape — the person
select's default is "Whole company (optional person)" → null → the c2c arm.

## What is already true (verified in triage, not assumed)
| | |
|---|---|
| person arm works | `send_deal:111-140` resolve-or-create p2p + pill |
| c2c resolver exists | `messaging/supabase/store.ts:358` `resolveC2cThread(relationshipId)` |
| card carries its relationship | `deal_card.relationship_id`, set at birth |
| pill renders in ANY thread | `MessageBubble.tsx:21` — `deal_card` type, no thread-type gate |
| c2c deal surface exists | `DealPin.tsx:788-789` |
| picker component exists | `RecipientPicker.tsx` — own-company groups only today |
| the people data exists | `getMyConnections()` already returns each company WITH its people |

## Triage — the two YES answers
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | current routing is what `DECISIONS.md:1013` locks — a reversal |
| 1 | new screen or surface? | NO | c2c deal surface + picker component both exist |
| 2 | migration / RLS / RPC / auth? | **YES** | `send_deal` is SECURITY DEFINER; needs a migration |
| 3 | concept not in CONTEXT.md? | NO | C2C `:41`, P2P `:40`, Deal draft `:31` all present |
| 4 | changes what the product does? | **YES** | changes WHO SEES a sent deal — see risk 1 |
| 5 | file locked elsewhere? | NO | `origin/claude/ayush/work`: "none - all released", offline |
| 6 | more than one ticket? | likely 2 | backend + frontend |

Diff touches something rendered → **G4 is a human stop**, not auto (PIPELINE §3).

## Supersede — CORRECTED from the seed
The seed named two entries. Only one is in scope:
- **`:961`** ("Request-pricing routes to Connect's inbox") — `pricelist_request`,
  **out of scope, do NOT supersede.** Still true.
- **`:1013`** ("Connect CTAs map to the 4 existing inbox types") — **PARTIAL
  supersede, the `deal_card` arm ONLY.** The other three CTAs still route to inbox.

## Deferred — must NOT be built
- **chat-list consolidation** — Muskan's ruling 2026-08-25: the duplicate
  conversations (Marcel/Canadian Craft as both p2p and c2c) are PRE-EXISTING and
  upstream of this fix. **Own slug.** File from this walk.
- **deal-card defects** — no signal of what changed; seller can't easily find edit;
  can't add items. Muskan: "a whole different slug." **Own slug.** File from this walk.
- `canAsk` connection check + Request-pricing → Connect (`ProductCard.tsx:426`)
- `pricelist_request` → chat (needs a new `chat_message_type`; only 5 seeded)
- deleting `/connect/inbox` + the claim/assign/lens layer (~1,000 lines)
- basket carried into a connection request — ruled out: the existing "connect first"
  block (`BasketDrawer.tsx:320-331`) already IS the rule

## Locked — from ADR 0006 (G3, 2026-08-25)

1. **Approach A.** `send_deal` announces to a company exactly as it already announces to
   a person. One new migration, `create or replace`, **grant re-emitted**.
2. **The `perform public.deliver_deal(...)` call at `send_deal.sql:107` is DELETED**, not
   guarded. `deliver_deal` itself is untouched and keeps serving Sella's door.
3. **The pill insert is HOISTED** — one expression, one `chat_message` insert, outside the
   branch. The `if/else` computes `v_thread` only.
4. **c2c is resolve-OR-CREATE** (`on conflict do nothing` + re-select, `deleted_at is null`),
   **not** resolve-and-raise. Copy the idiom at `20260823090000:162-183`.
   ⚠️ **This amends `PRD:131`** — T04 owns that amendment and it is not optional.
5. **T01 fixes the p2p arm's identical race too** (§8.11).
6. **Frontend: extract `CounterpartyPersonSelect`**, non-null `relationshipId`, caller
   gates it, renders in the `needsConnection` **else** branch, "Whole company" shows
   synchronously, people arrive additively. Must NOT inherit RecipientPicker's
   `companies.length === 0` fallback string.
7. **`send_deal` returns the c2c thread id; navigation is NOT wired** (§8.3).
8. **G4 is walked as Alice (GreenLeaf) → Bob (StonePharm)** — Aurora / Canadian Craft /
   Marcel are production fixtures and are **not in the local seed**.
9. **The recipient-read invariants (M9/M10) are mandatory** — every other invariant is a
   writer-side count taken where RLS is bypassed.

## Deferred — must NOT be built (unchanged from the spec, plus two added at G3)

- chat-list consolidation · deal-card defects · `canAsk` · `pricelist_request` → chat ·
  deleting `/connect/inbox` + the claim/assign/lens layer · basket-into-connection-request
  *(all as listed above)*
- **NEW at G3 — closing the interrupted-accept window** (move the c2c insert into
  `accept_connection_request`, delete the browser insert). Better fix, wrong scope. **Own
  slug** (§8.10).
- **NEW at G3 — the forgeable `deal_detected` message.** `msg_all` has no `type`
  predicate, so a thread member can insert one and drive `confirm_detected_deal`. **Own
  ticket** (§8.6).

## Files so far
- `docs/muskan-build/0023-deal-draft-lands-in-chat/PLAN-T02.md` — **T02's plan, written
  2026-08-25 at `/build` step 2.** Carries the regenerated citation table (§0) and the three
  declared-uncovered criteria (§5).
- `docs/muskan-build/0023-deal-draft-lands-in-chat/PLAN-T01.md` — **T01's plan, written
  2026-08-25 at `/build` step 2.** Carries the regenerated affected-suite table (§0), which
  is the ticket's own mandated first step.
- `docs/muskan-build/0023-deal-draft-lands-in-chat/RESEARCH.md` — prior-art sweep **+ the
  `## Approaches (design)` report (5 options, A recommended) appended at /design step 1**
- `docs/PRD/0023-deal-draft-lands-in-chat.md` — the WHAT, approved at G1.
  ✅ **T04 landed both G3 amendments** — `:131`'s edge-case row (§8.9, rewritten to the ruled
  text) and AC1/AC2's wording (§8.7). No longer contradicts the ADR.
- `docs/architecture/adr/0006-deal-draft-lands-in-chat.md` — the HOW, **accepted at G3**
- `docs/architecture/adr/ADR-INDEX.md` — one-line entry added (/design step 5)
- `docs/muskan-build/0023-deal-draft-lands-in-chat/TICKETS.md` — T01–T04, **all four now
  in Linear as HEL-63…HEL-66**, plus HEL-67 / HEL-68 for the two G3 "file separately"
  rulings.

## ✅ Linear MCP is NOT blocked — the note that said so was stale

STATE.md, CLAUDE.md and the PRD all recorded *"Linear MCP auth-blocked"*. **It works.**
Two teams: **`Codebase Development Tickets` (HEL-xx) — the pipeline's build tickets**, and
`Development` (DEV-xx) — Marcel's product tickets. Muskan's correction, 2026-08-25:
build tickets go in the **codebase** team.

**Housekeeping done the same day:** slug 0022's T00–T08 (**HEL-54…HEL-62**) were still
sitting in `Backlog` although the slug went G1–G5 and shipped to production in session 85.
All nine moved to **Done**.

⚠️ **Still owed:** 0022's **T09–T17** were never created in Linear at all (they were filed
into `0022-buyer-shop-view/TICKETS.md` while the MCP was believed blocked). Several are
built and shipped, several are open — **T17 is still blocked on Muskan.** Backfilling them
is not this slug's job, but nothing else is tracking it.

## Attempts          three separate budgets — see §10
- **spec, 2026-08-25** — `researcher` sweep → RESEARCH.md; interview closed in one
  pass, no revisions. PRD previewed to Muskan in scratchpad, approved unamended.
- **design, 2026-08-25** — `researcher` on approaches (5 options) → A. ADR drafted, then
  **two `adr-checker` rounds: r1 = 4 blocking, r2 = 9 blocking, ALL NEW.**
  ⚠️ **THE LOOP DID NOT CONVERGE.** A third round was offered to Muskan and **declined**;
  the loop closed at its 2-round budget by ruling. **rev 3 is unchecked by a fresh
  agent** — `critic` + `security` carry it at build, against real code rather than prose.
  Three of r1's four blocking findings, and several of r2's, corrected claims the ADR
  author had made — including **overriding an approved PRD row without asking** (§8.9).
- **build T01, 2026-08-25 (session 88 `deal_land`)** — budgets reset for this round:
  `tests 0/2`, `blocking-findings 0/2`, `G4 rounds 1`.
  Base sync: `git pull --rebase` clean; **dev is 7 commits ahead but its tree diff against
  this branch is EMPTY** (all seven are merge commits of this branch back into dev), so no
  rebase was performed — rewriting 9 commits for a no-op would be the larger risk. **Base
  frozen from here** (`/build` step 1).
  ✅ **T01's mandated first step done — affected-suite table regenerated BY GREP.** 21 SQL +
  6 e2e files; ADR §4.3 listed 12. All **11 omissions verified SAFE by opening them**, not by
  name (L-009): every one touches `pending_inbox_item` for `connect_person`/`connect_company`
  rows only; none calls `send_deal` or `deliver_deal`. **The ADR's three BREAKS-BY-DESIGN
  verdicts are unchanged** — the omissions were inert.
  ✅ **Runner census (L-013):** 41 runners / 46 suites. Six suites can never execute —
  `announcement_projection`, `auth_gate`, `change_reason_log`, `onboard_company_categories`,
  `pending_change_lock`, `rls_isolation`. Two are in this slug's blast radius; rating them
  SAFE is right, **counting them as cover is not.** The new suite ships WITH its runner.
  ✅ **Third-caller check (L-041):** only two live `perform deliver_deal` calls —
  `send_deal:107` (deleted here) and `confirm_detected_deal…:176` (untouched).
  `create_deal_draft_delivers:179` was superseded by `create_deal_draft_private_birth:23`.
  `20260823090000:301` is a **comment** in `inbox_insert`'s rationale and stays true.
  ✅ **Stamp verified against reality, not the ledger:** local tip AND production tip are both
  `20260824100000`, so `20260825090000` sorts after both → **plain `db push`, NOT
  `--include-all`.**
  ✅ Sync lock on `src/modules/deals/actions.ts` taken + pushed alone (`c60ba69`).
  ✅ **`plan-checker` → REVISE: 3 blocking + 6 notes. ALL NINE VERIFIED TRUE against the
  real files before folding (L-003), all nine accepted, none argued down.** Plan is at rev 2.
  The three blocking findings were all about what the tests **prove**, not about what the plan
  says about the code — the plan's ~30 code citations were spot-checked and every one held.
  1. **AC 9 (M8) had no home** in the case table or the runnable order. Trivially true (no
     listed file touches `20260720095000_deliver_deal.sql`) — but trivially-true is not
     evidence and `/build` step 10 must replay every AC. → **C9** (`pg_get_functiondef` still
     shows the insert + the `if not exists` guard) **plus a repo check that greps for a NEW
     migration redefining it**, which a diff of the old file cannot see.
  2. 🔴 **THE SHARP ONE — case ordering would have gutted C6/C7**, the two cases the plan
     itself calls the ones that matter. C4 soft-deletes the seeded c2c thread and sat BEFORE
     the recipient-read cases. **`can_access_thread` (`20260607170000:117-132`) has no
     `deleted_at` predicate** — its c2c branch is bare `is_relationship_member` — so a message
     in a soft-deleted thread still passes RLS. C6 would have proved the recipient can read a
     pill **in a conversation the app never shows** (`store.ts:363` filters it out), and gone
     GREEN doing it. M9 *is* this slug. → C4/C5 moved LAST **and** C6/C7 pinned with an
     explicit `deleted_at is null`: ordering alone is a fact a later edit can silently undo
     (L-044's exact class).
  3. **Two suites that EXECUTE the rewritten body were not being run** —
     `decline_deal_test.sql:110,:143` and `update_deal_draft_test.sql:145` both
     `PERFORM public.send_deal(...)`. Their SAFE rating was a **reading**; both runners exist.
     → step 6 now runs **FIVE** runners, not three.
  ⚠️ **A note that CORRECTS THE ACCEPTED ADR: §5's claim that M4′ "covers the `on conflict`
  path" is FALSE.** That path needs a concurrent insert; both cases go through the SELECT
  branch. Rather than fake cover it is **declared review-only and handed to `critic` by
  name** — a silent cap is what makes a green suite read as complete cover.
  Also folded: `chat_thread` added to the mandated grep (it is the one table the migration
  newly writes, and the ticket's term list omitted it) → 2 more suites found, both SAFE;
  C5's count scoped to the live thread; per-case fresh cards (`send_deal:73-75` refuses a
  non-`unsent` card); temp-table grants (`deliver_deal_test.sql:52-54`).
  Checker verified CLEAN: ADR §3 fence, STATE.md Deferred list, the agent split
  (`test-writer` owns all `supabase/tests/**`, builder owns source only), C4's mechanics,
  and C6/C7's expected RLS outcomes.
  ✅ **`test-writer` done, two rounds (`7fd33fc`).** Four files: the new suite
  `send_deal_c2c_announce_test.sql` (C1-C9) + its runner, and the two deliberate rewrites.
  **Case order verified by me as built: C1→C2→C3→C6→C7→C8→C9→C4→C5** — the soft-delete runs
  AFTER the recipient-read cases, and C6 is pinned BOTH ways (C1's captured `_pills` id **and**
  `t.deleted_at IS NULL`). (2a) calls `deliver_deal` **twice**, with the L-044 reasoning written
  into the comment so it cannot be undone by accident.
  🔴 **Round 2 was a stale-comment sweep, and it found more than I did.** I caught
  `claim_deal_ticket_test.sql:3` — the file's TITLE line still asserting *"the ticket is written
  by send_deal"* — by reading the top of the file rather than the diff. I sent it back asking for
  a scan of BOTH files for siblings, and it found **two more**: `deliver_deal_test.sql:1-27`'s
  header bullet (1), and `:174-178`'s WR-01 comment naming `send_deal` as a live `deliver_deal`
  caller when T01 deletes that call entirely. **Three stale lines, one found by diff-reading and
  two only by whole-file reading.** This is exactly `L-045`'s class, inside the same session that
  wrote `L-045`. My own closing sweep confirms every surviving mention now states the new
  behaviour.
  📌 **Honest gap the agent flagged rather than faking:** AC 9's repo-level half (grep for a NEW
  migration redefining `deliver_deal`) is not expressible as a SQL assertion and has no home under
  a test-writer fence. **It is MINE to run at the step-10 replay** — recorded so it is not lost.
  ✅ **`L-045` + `L-046` WRITTEN to `docs/agents/LEARNINGS.md`** (Muskan's yes, 2026-08-25). Both
  were caught by the parallel security session, both on claims that never reached an artifact:
  L-045 = a discharged TODO comment cited as fact about live schema; L-046 = recommending
  `security_invoker` on a view `ADR-0004:239` had already rejected **by name**, naming the exact
  failure (it would zero out every buyer read). L-046's root cause was sharpened by the peer:
  **not "outside my fence" — neither of us ran a query before recommending.**
  ⏳ **NEXT: RED verification, and it is the orchestrator's job, not `test-writer`'s (L-023).**
  Blocked only on the shared local DB, which the security session holds by agreement. Protocol
  agreed: each session resets from its own tree immediately before its own run and assumes nothing
  about the state the other left. *(An earlier line here said the build was
  PAUSED pending Muskan's yes on `L-045` — that was over-cautious and is corrected: the
  LEARNINGS entry does not gate the ticket. The question stays open; the build does not wait
  on it. Everything that does not depend on the answer proceeds.)*

- **build T02, 2026-08-25 (session 90 `deal_land_t02`)** — budgets reset for this round:
  `tests 0/2`, `blocking-findings 0/2`, `G4 rounds 1`.
  Base sync: `git pull --rebase` clean. **dev is 7 commits ahead and carries NOTHING this branch
  lacks** — `git diff HEAD origin/dev --stat` is 30 files / **0 insertions, 4821 deletions**, i.e.
  every difference is work dev is missing. No rebase performed; **base frozen** (`/build` step 1).
  ✅ **LEARNINGS.md swept by Trigger line.** Live for this ticket: **L-039** (scope is §8 minus what
  the gates removed, not the PRD's AC list), **L-035** (builder never edits tests), **L-021**
  (presence AND absence in the same state), **L-030/L-031/L-045** (line ranges and stale comments),
  **L-023** (RED verification is the orchestrator's, not `test-writer`'s), **L-040** (never
  `git add -A` — see the dirty-tree note below).
  ✅ **Citations regenerated by opening the files, not inherited** (PLAN-T02 §0). **Two of the
  ticket's own drifted**: the connect-first block is **`:319-338`**, not `:320-331`; the null
  initialiser is **`:214-216`**. 🔴 **And I made a sixth instance of the same class in my own first
  draft** — cited `connections.ts:157` for the `people` attachment, which is at **`:153`**.
  Corrected in place, recorded rather than swapped.
  ✅ **Caller census run, not assumed (L-041):** `RecipientPicker` has **one** live caller
  (`BasketDrawer.tsx:313`); **no e2e spec selects on `"Whole company"` or `"Recipient person"`**, so
  §8.7's relabel and the new `aria-label` break no existing selector.
  🔴 **THREE ACCEPTANCE CRITERIA ARE NOT UNIT-TESTABLE HERE, and they are declared, not faked.**
  `vitest.config.ts:34` is `environment: "node"` with **no jsdom and no @testing-library**, so
  `renderToStaticMarkup` gives initial paint only and **`useEffect` never fires**. Unreachable:
  **AC 2 / M7** (a real company with zero connected people — needs the fetch to resolve),
  **AC 6 / §8.2** (`RecipientPicker`'s `chosen` is undefined until the fetch resolves, so the
  branch cannot be entered), and the **interaction half of AC 5**. All three go to **T03 + the G4
  walk**, and the G4 sheet must say a green unit run is not cover for them.
  ⚠️ **The local seed has no person-less company either** — `seed.sql:308` connects GreenLeaf
  (Alice **+ Carla**, `:114-118`) to StonePharm (Bob). **AC 2 has no local fixture at all**, which
  is a second, independent reason it cannot close before T03.
  ✅ Sync lock on the five basket component files taken + pushed alone.
  ⚠️ **`docs/decisions/DECISIONS.md` is DIRTY in the working tree and is NOT this session's** — two
  uncommitted entries from session 89. Untouched; every commit this ticket makes names its paths.
  ✅ **`plan-checker` → REVISE: 4 blocking + 9 notes. ALL THIRTEEN VERIFIED TRUE against the real
  files before folding (L-003), all thirteen accepted, none argued down.** Plan is at **rev 2**.
  Its verdict on my §0 citation table: *"every line-number citation was re-opened — all of them
  hold."* **The defects were in what the tests PROVE, not in the code reading** — the same shape as
  T01's round.
  1. **B1 — `): JSX.Element` does not compile in this repo.** `@types/react` v19 declares `JSX`
     **inside** `namespace React`; there is no global fallback and `src/` has **zero** existing
     uses. Verified by grep. Rev 1's signature sketch would have died at `tsc`.
  2. 🔴 **B2 — AC 2 / M7 was handed to two owners and NEITHER can reach it.** Rev 1 wrote
     *"already declared e2e by the ticket"*. **False.** T03's five ACs (`TICKETS.md:116-126`) contain
     **no criterion about a person-less company**, and the local seed has no such fixture —
     GreenLeaf has Alice **+ Carla**, StonePharm has Bob, and G4's walk is locked to exactly those
     two. So the ticket's headline invariant — *"it is never a dead control"* (`PRD:130`) — was
     declared uncovered, deferred, **and landed nowhere.** Now an explicit **G4 ruling for Muskan**:
     add a T03 AC + a seed fixture, or close AC 2 on C1 + C7. **Not decided unilaterally.**
  3. 🔴 **B3 — THE SHARP ONE. The half of that gap that IS unit-reachable was declared
     unreachable.** `ConnectedCompany` carries **both** `companyId` and `relationshipId`
     (`connections.ts:145-146`); both are `string`, both compile, and **an implementation keyed on
     the wrong one renders identically green in every render test** while shipping a control whose
     people list is empty forever — precisely the state M7 forbids, surfacing only at G4. The
     mapping is **pure** — no fetch, no DOM, no effect. → `peopleForRelationship()` extracted and
     given **C7 with a decoy fixture** (company A's `companyId` IS the target `relationshipId`), so
     the wrong key goes RED.
  4. **B4 — rev 1's claimed placement proof does not test placement.** I wrote that the
     stranger-group case *"is the case a mirrored `:311-315` placement would fail."* Enumerated over
     the three fixtures, the `counterpartyRelationshipId` guard is null for BOTH null-relationship
     cases, so **the two placements emit byte-identical markup in all three.** C5 restated as a
     **guard** proof; **AC 4's placement moved to the G4 visual sheet**, where a human sees it.
  ✅ **Two findings verified by MEASUREMENT, not reading.** (a) B1 by grep (0 hits in `src/`).
  (b) **N4 by a scratchpad probe**: `renderToStaticMarkup` emits
  `<option value="" selected="">` **only when the select is controlled**; uncontrolled emits **no
  `selected` attribute at all.** That inverts the reasoning — "controlled" is not just a stale-DOM
  fix, **it is the only thing that makes J6's explicit-default assertion writable.** Recorded in the
  plan so a later *"simplify to `key={relationshipId}`"* cannot silently gut C1.
  ✅ **Folded, each verified:** N1 (AC 5's re-reading is sound but is **Muskan's to rule** — §8.7 set
  that precedent this slug; on the G4 sheet) · N2 (**rev 1's argument against the prop alternative
  was self-defeating** — the accepted design costs **1 + N** fetches, not 2; the real reason to
  extract is the synchronous render) · N3 (the reset's contract: **the caller owns its own copy**;
  both callers verified to reset) · N5 (rev 1's C3 asserted nothing C1 did not — **deleted**) ·
  N6 (C6's stated reason was wrong — the gate is `RecipientPicker.tsx:26-28`'s **early return**, not
  `chosen`; and the assertion is an **env artifact that must flip the day jsdom lands**) ·
  N7 (**`security` is off the routing list for the wrong reason** — the value is now
  **buyer-supplied**, which normally *triggers* a look; what closes it is
  `create_deal_draft:88-100`'s server-side re-validation, verified by opening it) ·
  N9 (the baseline **must become 68 files**; a run still saying 67 means the new file did not
  execute and 490/490 would be green for the wrong reason).
  🔴 **N8 — a NEW defect neither the ticket nor the ADR knew about, and it is L-038's class.** The
  basket read filters relationships on `deleted_at` only (`basket/supabase/reads.ts:101-104`);
  `getMyConnections` **additionally requires `status = 'active'`** (`connections.ts:119`). On a
  `suspended`/`ended` relationship the group still carries a non-null `relationshipId`,
  `needsConnection` is false, the control renders — **and the lookup never matches, so the people
  list is empty forever, indistinguishable from the legitimate M7 case.** Not reachable in the seed,
  so **no test and no walk in this slug will show it.** Named in the plan's accepted-cost section; a
  ticket is **offered on the G4 sheet, not filed unilaterally.**
  ✅ **`test-writer` done, one round (`7d2c0e2`).** Two files, source untouched
  (`git status` verified: `M BasketDrawer.test.tsx`, `?? CounterpartyPersonSelect.test.tsx`, nothing
  else). **C7's decoy is built exactly right** — company A carries `companyId: "rel-1"` (the id under
  test) with `relationshipId: "r-A"`; company B carries `relationshipId: "rel-1"`. A
  `companyId`-keyed implementation returns A's people and goes RED; no other case in the file is
  sensitive to the swap.
  ✅ **RED VERIFIED BY ME from the RAW runner output, not from the agent's claim (L-023) — and the
  wrapper made that non-trivial.** `rtk` collapses vitest's output to `PASS (7) FAIL (1)`, which
  would have hidden the fact that the new suite never ran at all. Read from the tee log
  (`~/Library/Application Support/rtk/tee/…_vitest_run.log`):
  - `CounterpartyPersonSelect.test.tsx` → **suite-level** `Cannot find module
    './CounterpartyPersonSelect'`, `assertionResults: []` — C1/C2/C7 have **never executed**, which
    is the correct RED for a component that does not exist, **and means their assertion text is
    still unproven.** Watch at the green step that all three actually run.
  - **C4** → `AssertionError: expected … to contain 'Address this deal to'`.
  - **C5 / C6** → pass **vacuously**, and both say so in the file. Declared, not disguised.
  ✅ **The stale header at `BasketDrawer.test.tsx:28-34` was corrected, and the correction names the
  wrong inference it used to invite** — *"RecipientPicker never mounts for a foreign group"* is still
  true, but it no longer implies *"a foreign group shows no addressee UI"*.
  ✅ **C6's comment records that its assertion is an ENVIRONMENT ARTIFACT, not a contract** — it is
  the literal inverse of AC 6 / §8.2's intent and **must flip the day jsdom lands**. Written into the
  test rather than into a plan nobody re-reads.
  📌 **Agent-flagged, accepted:** C1 asserts the selected option by substring, not by position. Under
  these fixtures `people` is always `[]`, so "first" holds by construction. Recorded rather than
  hardened.
  ✅ **`builder` done, one round. Three source files, tests untouched** (`git status`: `M
  BasketDrawer.tsx`, `M RecipientPicker.tsx`, `?? CounterpartyPersonSelect.tsx` — nothing else).
  **No REJECTION outstanding**, which matters: an outstanding rejection is one of the three
  carve-outs that would escalate a ticket to Muskan.
  🔴 **D1 — THE PLAN'S OWN INSTRUCTION WOULD HAVE SHIPPED A LINT ERROR, and I verified it rather
  than taking the agent's word.** PLAN clause 5 said the relationship-change reset happens *"in the
  effect, alongside the refetch."* Written that way it trips **`react-hooks/set-state-in-effect`** —
  and `tsc` and vitest are BOTH green with it, so only the lint catches it. **Probed directly**: a
  four-line throwaway component with `setState` inside a `useEffect` body →
  `✖ 1 problem (1 error) · Avoid calling setState() directly within an effect`. Builder implemented
  React's documented *adjust-state-when-a-prop-changes* idiom instead (a `shownFor` state compared
  during render). Contract preserved, select still controlled, C1 unaffected. **The plan was wrong
  and the builder was right.**
  ✅ **D2 — builder widened the reset to clear `people` as well as `personId`, and the reason is
  sound.** Without it, a `relationshipId` change leaves the PREVIOUS company's people selectable in
  the in-flight window; picking one sends a person id from the wrong company, which
  `create_deal_draft:88-100` then rejects at birth. **Same failure class clause 5 exists to close** —
  the plan named one half of it.
  📌 **Builder caught a stale comment IN ITS OWN DIFF before returning.** It first wrote the
  placement comment claiming a mirrored placement would leak the control to a stranger — **rev 1's
  retracted claim**, which PLAN §4.2 explicitly corrects. Rewrote it to say what is true: the
  **guard**, not the placement, suppresses the control. **That would have been this slug's SIXTH
  stale-comment finding**, and it is the first one caught by its own author.
  ✅ **Both of builder's own citations spot-checked by me and both hold:** `RecipientPicker`'s new
  docstring cites `BasketDrawer.tsx:358-367` — the `{counterpartyRelationshipId && (` block does run
  `:358-367`; and `messaging/types.ts:201-220` is `ConnectedCompany`'s real span.
  ✅ **GATE GREEN, and the load-bearing number is the FILE COUNT, not the pass count.**
  `tsc` **exit 0** · `npm run test:unit` **494 / 494 across 68 / 68 files** · `eslint` **exit 0** on
  the three source files. T01's baseline was **490 / 67**; a run still reporting **67** would have
  meant the new suite never executed and its four cases were green for the wrong reason.
  **Measured through `rtk proxy npx vitest run`** — the wrapper collapses vitest to
  `PASS (n) FAIL (n)` and would have hidden it. `CounterpartyPersonSelect.test.tsx` confirmed by
  name with its 4 tests. **Re-measured by me after `test-runner` reported, not taken from it.**
  ✅ **`consistency` — CLEAN, zero blocking. Four reuse checks, and one CORRECTED A CLAIM OF MINE.**
  🔴 **The render-phase state adjustment is NOT a first — my plan implied it was.** It is already
  established at **`IconRail.tsx:200-205`** (`prevOnRoute`/`onSurfaceRoute`) and
  **`OpenItems.tsx:115-120`** (`prevThings`/`things`) — same shape, same `prev<X>` naming.
  **Verified by opening both.** `IconRail`'s own comment gives builder's exact reason:
  *"conditional setState in render, NOT an effect … so it never reads as a setState-in-effect."*
  **So D1 did not merely dodge a lint rule — it landed on the convention this repo had already
  chosen for this problem, for this reason.**
  ✅ Also clean: **no duplication of `NewChatDropdown`** (that one flattens the WHOLE directory with
  search; this resolves people for one known `relationshipId`) · the fetch idiom matches
  `BasketDrawer.tsx:43-57` · **the accepted duplicate read had no alternative to skip** — zero hits
  for `useSWR`/`react-query`/`useQuery` repo-wide, and the single `createContext` (`BasketProvider`)
  is basket state, not a directory cache · styling byte-identical to the sibling select ·
  `peopleForRelationship`'s placement upheld against `basket/lib/` on a real distinction
  (`basket/lib/*` operates on `BasketLine`/`BasketGroup`; this operates on `MyConnectionsView`).
  ✅ **`critic` — 2 blocking + 7 notes. ALL NINE VERIFIED TRUE BY ME before folding (L-003).**
  **`blocking-findings` budget: 1 of 2 spent** — the two blocking findings were fixed in ONE pass
  (the budget counts fix ROUNDS, not findings).
  🔴 **`critic` RAN WITH NO SHELL — the SECOND time on this slug, and its agent definition grants
  `Bash`.** It declared the limitation up front and substituted line-offset arithmetic rather than
  hiding it, **so its "unchanged/verbatim" claims are readings, not diffs.** I diffed the fenced
  items myself. **Broken machinery — surfaced at G4, not worked around.**
  ✅ **B1 + B2 were the same defect twice: THIS DIFF FALSIFIED TWO DOCSTRINGS IN THE MODULE IT WAS
  EDITING.** `basket/actions.ts:9-11` said the buyer's recipient is *"implicit = the seller company
  via the relationship"* — **eleven lines above `:29`, which forwards the person the buyer just
  picked.** `basket/types.ts:41` called the field the *"own-company offer path"*. Both rewritten;
  the type is byte-identical, so PLAN §7's no-signature-change fence holds.
  🔴 **N1 — THE FINDING NO CODE CHANGE CAN CLOSE, and it is a gap in MY plan.** C7's decoy closes
  the `relationshipId`-vs-`companyId` swap **inside the selector only**. Wire
  `relationshipId={group.sellerCompanyId}` at `BasketDrawer.tsx:361` and both are `string`, `tsc`
  passes, `useEffect` never fires under static render, **and all six render cases plus C7 still go
  green** — while the shipped control's people list is empty forever, the exact M7 state the ticket
  forbids. **PLAN §5's "declared uncovered" table did not list it**, so a reader who accepts C7's
  rationale would believe the class is closed one level up. **On the G4 sheet beside AC 2.**
  ✅ **N2 + N3 fixed by `test-writer` (round 2) — and it found a FOURTH stale citation unasked.**
  C1's title claimed *"first, SELECTED"* while asserting **preselection only** (order is vacuous
  under an always-empty `people` fixture) → **renamed, not padded with an assertion that would pass
  for free.** Citations: `BasketDrawer.tsx:231` → **`:232`** (×2) and `RecipientPicker :26-28` →
  **`:32-34`** (×2) were **all broken BY this diff** (the new import at `:15` shifted every line by
  one); `BasketDrawer.tsx:187` → **`:202`** was pre-existing from the 0022 pass.
  ⚠️ **The `:26-28` one was NOT an off-by-N — it pointed at entirely the wrong code** (the
  `useEffect` fetch, not the early return). **Verified by opening the file.** Seventh stale-citation
  finding on this slug.
  📌 **DEFERRED, not fixed — four pre-existing notes, none opened by this diff** (N4 `RecipientPicker`'s
  fetch has no `.catch`/`alive` guard and shows a **connected** seller a false *"Connect with a
  company first"* on failure, ~4 lines · N5 choosing *"Select a customer…"* never re-reports, so the
  parent keeps the previous recipient · N6 the `useState` initialiser on a changing prop · N7 the
  seller path's **fully redundant** second `getMyConnections()` read). **Tickets offered at G4, not
  filed unilaterally.**
  📌 **`builder` raised something bigger than the fix it was doing: the basket module's `D-xx`
  decision IDs have NO canonical home.** `D-12` means **four** different things across the corpus
  (`DECISIONS.md:1219` · `cloud-migrations-pending.md:1366` · `0021-tier-ladder/PLAN-T07.md:108` ·
  `basket/actions.ts`). Verified by grep. **A citation nobody can look up cannot go stale visibly —
  it just quietly stops being true.** L-038's shape one level up.
  ✅ **Gate re-measured by me after both fix rounds:** `tsc` **exit 0** · **494 / 494 across 68 / 68
  files** via `rtk proxy npx vitest run`.
  ✅ **`visual-verifier` done — 15 screenshots in `g4/`, staging table + the G4 sheet in REVIEW.md.**
  Chrome extension was not connected, so it drove the repo's **Playwright** instead — real chromium,
  real dev server, seeded users, `localhost` never `127.0.0.1`.
  🟢 **AC 2 WAS WALKED AFTER ALL — the ruling I was about to hand Muskan is CLOSED BY EVIDENCE.**
  `plan-checker` B2 found AC 2 had no owner (T03 has no such criterion; the seed has no person-less
  company). The agent **built the fixture**: a throwaway verified company with zero people,
  connected to Bob. **The control rendered live with `["Whole company"]` and an ENABLED Create
  button — on both the buyer door and the seller door.** Fixture, its product, pricelist, two
  relationships and one born card all **hard-deleted**; baseline re-verified **by me, directly
  against the DB**: 6 companies · 2 relationships · 7 deal cards · 6 products. `AUR-1A`–`AUR-1F`
  never touched.
  🟢 **AC 5 proven AT THE DB, not by reading the UI back** — "Carla Klein" picked, draft born, and
  the row's `metadata.counterparty_person_id` **is Carla's id.** The control is not decorative.
  🟢 **AC 4's placement — the thing NO unit test could decide — is settled by one frame.** Shot 4
  carries **both arms in a single screenshot**: the connected group with the control above Create,
  and a stranger group with the connect-first block and no control. Counted programmatically:
  **1 control across 2 groups.**
  ⚠️ **The schema moved MID-RUN** (`20260825100000` + `20260825110000`, parallel session). I warned
  the agent while it was working — **about misattribution, not about the feature.** It re-took
  **every** shot after the migrations and deleted the pre-migration set, so the folder is uniform.
  Nothing attributable was observed (6 product cards / 3 add-to-basket both before and after; no
  price changed).
  📌 **AC 3 is `cannot-verify` and the agent said so rather than faking it** — the pre-fetch frame
  lasts milliseconds against a local Supabase. A ruling, not a defect.
  📌 **Two observations offered, not filed:** the option ORDER is unstable between loads
  (`getMyConnections()` imposes none; "Whole company" is always first, so no AC breaks) · and
  **choosing a person still lands the buyer in the COMPANY chat after birth** — may be correct
  (birth is not send) but no AC says, and it is the shape G5 finds late.
  📌 **Honest caveat recorded by the agent:** the expanded-dropdown shots set `size` on the element
  as a capture aid — a native select popup is OS-drawn and cannot be screenshotted. **The option
  lists are real; the open-list layout is not what a user sees.**
  🛑 **STOPPED AT G4 — the gate is Muskan's and nothing is passed.** Sheet in `REVIEW.md` under
  *"🛑 G4 — T02 / HEL-64 · THE SHEET"*. **Four rulings owed:** AC 5's wording · the call-site wiring
  gap (`critic` N1 — **a coverage claim of MINE that does not hold one level up**) · AC 3's cover ·
  and whether the four pre-existing defects (N4/N5/N6/**N8**) become tickets.

- **build T03, 2026-08-25 (session 91 `deal_land_t03`)** — budgets reset for this round:
  `tests 0/2`, `blocking-findings 0/2`, `G4 rounds 1`. Plan at `PLAN-T03.md` rev 1;
  `plan-checker` spawned at `/build` step 3.
  ✅ **Base sync — dev had REAL content this time.** Session 88 skipped its rebase because dev's
  tree diff was empty; that is no longer true (`6710f3a` HEL-70's 499-line deactivation gate +
  two ledger commits). **Merged, not rebased** (`992f05b`) — the two local commits were already
  pushed and a parallel session is live on this repo, so a rebase meant force-pushing a shared
  branch for no gain. **Base frozen from there.**
  ✅ **T01 is LIVE ON PRODUCTION** (parallel session, 2026-08-25). Pre-flight diffed prod's
  `send_deal` on `prosrc` (`md5 b52ea5df…`, byte-identical to `20260724120300`) — **zero drift**.
  Prod tip `20260825110000`; **the pending cloud batch is EMPTY.** T03 adds no migration.
  ✅ **Same-deploy hazard CHECKED, not assumed** (DECISIONS 2026-08-24's `git show origin/main:`
  pre-check). The DB is ahead of `dev`/`main` and it is benign in this direction: main's
  `MessageBubble.tsx:20-42` already renders `deal_card` with **no thread-type gate**, main's
  `sendDeal` (`actions.ts:367`) **never reads `pending_inbox_item`**, and main's deal-tickets
  lens is a filter whose empty state already exists. The 0022 outage was old code *writing*
  through a revoked grant; nothing was revoked here.
  ✅ **T01 confirmed applied LOCALLY against `pg_proc`, not against the file** — so
  `deal-c2c-create.spec.ts:141-191` is **genuinely red right now**, which is AC 4.
  ⚠️ **A plain `grep deliver_deal` on `prosrc` HITS and is a FALSE POSITIVE** — the only match is
  a comment explaining why the call was removed ([[L-041]]'s shape). Recorded so the next reader
  does not conclude the migration failed to apply.
  ✅ **Fixture premises measured, not assumed:** relationship `active`/live · **one live c2c
  thread** (so the base case exercises resolve, not the heal path) · GreenLeaf `verified` and
  **not** deactivated, so HEL-70's new gate does not close the shop under this walk.
  🔴 **A SIXTH CRITERION ADDED, and TICKETS.md is now stale by one row.** T02's G4 ruling 2 said
  *"accept, or ask T03 to assert the wiring"* and Muskan's handoff resolved it toward T03 — but
  **T03's five ACs never mention the picker.** Deferring to a ticket whose criteria do not cover
  it is exactly [[L-051]], the mistake T02 made. So the criterion is **written into this plan as
  AC 6**, and TICKETS.md's amendment is booked as **T04/HEL-66's SIXTH doc edit**.
  ⚠️ **T02's G4 ruling 3 was never recorded and is NOT being adopted silently.** It offered
  *"accept the code contract as cover for AC 3, or send it to T03 with a throttled fetch."* The
  gate log carries rulings 1 and 4 only. A throttled-fetch test needs network interception this
  repo has never used → left in `PLAN-T03.md` §5 as **an open ruling for Muskan at G4**.
  ✅ **The handed-forward c2c-counter worry is closed BY CONSTRUCTION** —
  `countThreadsForPair` (`two-company.ts:532-556`) already filters `t.deleted_at is null`, and a
  repo-wide grep finds **no other c2c thread counter**. `inbox-accept.spec.ts` also never calls
  `send_deal`. **The deliberate run (AC 5) is still owed and will still be run.**
  🔒 Sync lock on `e2e/fixtures/two-company.ts` taken + pushed alone — four of its docstrings
  assert the inbox-ticket behaviour T01 falsified.
  ✅ **`plan-checker` → REVISE: 6 blocking + 8 notes. ALL FOURTEEN VERIFIED TRUE by me against
  the real files before folding ([[L-003]]), all fourteen accepted, none argued down.** Plan is
  at **rev 2**. Full detail in `REVIEW.md` → *"T03 — Round 1"*.
  **My headline claim survived** — it traced AC 6 and confirmed the assertion goes red under the
  call-site swap. **What did not survive was my fixture lifecycle**, and three findings are worth
  carrying:
  1. 🔴 **B1 — my `afterAll` could not have executed.** `deal_line_item.product_id → product(id)`
     has **no `ON DELETE`** (`20260607090005:22-24`) and the walk drafts the fixture product onto
     a deal, so `delete from product` raises **`23503`**. I copied the order from
     `discover-shop.spec.ts:713-715`, where the product is never drafted. **It would have leaked
     the fixture into the seed permanently — the exact HEL-73 outcome the plan opened by claiming
     to avoid.**
  2. 🔴 **B2 — two assertions were false before the spec's first line ran.** One worker, file
     order = path order: `deal-c2c-create` leaves a card whose send now posts a **c2c** pill and
     `deal-change` posts a **p2p** one, so both pill counts started wrong. Worse:
     **`resolveDealCardIdForRelationship` is `limit 1` with no `ORDER BY`** (`two-company.ts:228`,
     and its own docstring claims safety only after a reset) — so `countTicketsForCard(cardId)
     === 0`, **the half I called authoritative, could have passed against the WRONG card.**
  3. 🔴 **B6 — the rewrite silently deletes live coverage.** `deal-c2c-create.spec.ts:22` is the
     **only** e2e anywhere exercising "Pick up deal" / `claim_deal_ticket`, and that path is still
     live (G1 kept it, `:516`; Sella's door still writes into that lens, Risk #2 `:530-534`).
     My §5 recorded none of it. **Residual cover is now named:** `claim_deal_ticket_test.sql`.
  🔴 **THREE MORE STALE CITATIONS OF MINE — the slug's tally is now NINE.** `countThreadsForPair`
  ends at `:552` not `:556` · `discover-shop.spec.ts:586-594` is an **`afterEach`**, not an
  `afterAll` · `sendDeal` is `:367` on `origin/main` but **`:369` on HEAD**, and the tree must be
  named on a file this slug itself edited.
  📌 **N7 stung:** ADR **§4.1 `:307`** already recorded the `deal_member` consequence *and* its
  safety analysis, ending with the words *"Recorded so it is not re-derived"* — **and I
  re-derived it.** It also surfaces a consequence named nowhere: `PeopleTab.tsx` is the only
  reader of `deal_member` in `src/`, so a company-addressed deal's People tab now shows **the
  sender alone**. Not a defect; recorded so G4 does not meet it cold.
  📌 **MACHINERY — `plan-checker` RESOLVED AS ITSELF this time.** `ROLLUP.md` §C records it
  erroring `Agent type 'plan-checker' not found` for **ten consecutive tickets** on slug 0022,
  worked around with a `general-purpose` substitute. It is registered in this session. **§C's
  first owed ruling — "does the tier attach to the ruleset, or is it inherited from another
  agent's work?" — is moot going forward**, though the 0022 record still stands as written.
  🔴 **NEW HAZARD — a `db reset` from this tree would silently revert another branch's live
  schema.** Found by the parallel session `security_tickets`; **verified independently by me on
  this stack.** `msg_all` carries HEL-67's gate right now
  (`… AND ((type)::text <> 'deal_detected'::text)`) and the tip stamps `20260825120000` — but
  `git show claude/muskan/work:supabase/migrations/20260825120000_…` **fails**. A reset rebuilds
  from the files THIS branch can see, which stop at `20260825110000`, so the policy and its stamp
  both vanish — **no conflict, no warning, no file collision to detect it.**
  **A worktree isolates the tree, not the database.** CLAUDE.md §2b already says parallel sessions
  need separate branches or worktrees rather than a sync file; **that guidance is now known to be
  incomplete** — the one resource neither mechanism isolates is the local Postgres, and migration
  files are per-branch while the DB is not. The parallel session is raising it with Muskan as a
  possible architecture note, since it **changes** standing guidance rather than adding to it.
  **What it costs T03:** the ticket's green will be measured on a stack whose schema this branch
  cannot reproduce. The extra term is **inert here** — the only `authenticated` `chat_message`
  insert in `e2e/` is `chat-phase7.spec.ts:273` with `type: 'message'`, and `two-company.ts:119`'s
  `deal_detected` is a superuser DELETE inside `RESET_SQL`. **The results stand; the qualification
  is stated in the gate report rather than left implicit** ([[L-033]]). Plan §6 trap 1 rewritten
  to carry both reasons not to reset.
  ⏳ `test-writer` spawned at `/build` step 4 against rev 2.
  ✅ **`test-writer` → 3 files.** New `e2e/deal-lands-in-c2c-chat.spec.ts` (AC 1/3/6, AC 2 implied) ·
  `deal-c2c-create.spec.ts`'s `:141-191` premise reversed, not deleted (AC 4) · `two-company.ts`
  4 docstrings + `countDealPillsOnThread`. It **flagged** one edit beyond the plan's literal
  wording (a comment in the file's FIRST test repeating the same falsified `deliver_deal` claim)
  rather than doing it silently — **accepted**, and `critic` independently agreed.
  ✅ **GATE, exit codes captured from each command directly, never through a pipe** (the `tail`
  trap — my first attempt returned EMPTY exit codes and had to be redone): **tsc 0 · eslint 0**.
  ✅ **`test-runner` → SIX e2e specs GREEN**: `deal-lands-in-c2c-chat` 2/2 · `deal-c2c-create` 5/5 ·
  **`inbox-accept` 2/2 (AC 5, run deliberately — incl. the `countThreadsForPair("c2c")===1` trap
  assertion)** · `deal-change` 19/19 substantive + 5 pre-existing skips · `chat-phase7` 4/4 ·
  `deal-p2p-send` 6/6. **ADR §4.3 rated the last three SAFE by READING; they are now RUN.**
  🔴 **THE A/B — this ticket's entire justification, MEASURED not argued.** Controlled, both arms
  on the same state ([[L-048]]), source verified byte-identical to committed after revert:

  | arm | tsc | basket unit | AC 6 e2e |
  |---|---|---|---|
  | correct code | 0 | 41/41 across 9 files | **PASS** |
  | `relationshipId={group.sellerCompanyId}` | **0** | **41/41 GREEN** | **FAIL** — `Expected "Alice Green", Received "Whole company"` |
  | reverted (control) | 0 | — | **PASS** |

  **`critic` N1's gap from T02 is now closed on EVIDENCE, not a ruling** — the same shape as
  T02's AC 2. The middle row is the proof that the unit layer cannot see this class at all.
  ✅ **`consistency` → CLEAN, ZERO BLOCKING.** All four judged items are correct reuse: the repo
  has **two id conventions** split by *why* an id is stable (company/pricelist ids are seed
  literals; the relationship id rotates) and the diff applied the right one to each ·
  `countDealPillsOnThread` is a genuine sibling of `countConnectionEstablishedLines`, not a
  duplicate · the local basket helper is right to stay local (**this is the FIRST e2e ever to
  drive the real `BasketDrawer`**) · the lifecycle correctly merges its two nearest precedents.
  ✅ **`critic` → 2 blocking + 9 notes, all verified true by me before folding ([[L-003]]).**
  Fix round 1 → `blocking-findings 1/2`. It confirmed the empty-state assertions, the pill counts
  and the `cardId`-on-reset capture all genuinely discriminate.
  1. 🔴 **B1 — a FIFTH stale claim, and the plan counted four.** `two-company.ts:963-964` still
     said Send "is the moment the StonePharm inbox ticket mints" — **twenty lines below the
     docstring this ticket corrected to say the opposite.** Self-contradictory inside one function.
  2. 🔴 **B2 — my §5's residual-cover claim was true of the RPC and FALSE of the browser.**
     `claim_deal_ticket_test.sql` covers the RPC; the rollout the deleted e2e was the only thing
     exercising has **nothing at any level** — `inbox.ts:265-300`, `InboxDetail.tsx:78`, and
     `inbox.ts:201`'s `viewerIsReceiver` derivation. `src/modules/connect/` has exactly two unit
     files, neither touching them. **Corrected in §5.**
  3. 🔴 **N8 — §5 omitted the slug's HEADLINE SEAM.** Nothing end-to-end proves *buyer picks a
     person → pill lands in the p2p thread*: AC 6 proves the options render, T01's M3 proves the
     RPC routes, T02's G4 proved the DB field — **three halves that never meet.** §5 named the
     *seller*-side call site and missed this. **The same omission shape as [[L-050]]/[[L-051]],
     committed a third time in the document that cites them.** The COMPANY arm — the actual
     defect this slug exists to fix — **is** proven end to end; it is the person arm that is not.
  4. **N6 — a teardown failure leaks PERMANENTLY.** Deletes throw immediately, and
     `uq_product_supplier_code_active` (`20260607090004:52-53`) then makes **every future run of
     the spec fail in `beforeAll` with 23505** until a human deletes the row. `critic` confirmed a
     *test* failure is safe (Playwright runs `afterAll`; `resetDealData()`-first avoids the 23503).
  5. **N1-N4 — four more citation drifts**, incl. two of MINE (the L-044 misattribution the plan
     carried first, and the diff breaking its own cross-file citation by rewriting the file it
     cited). **Slug tally: fourteen.**
  📌 **OFFER for G4, verified not assumed:** `e2e/present-basket.spec.ts` is **dead scaffolding** —
  3 `test.fixme` cases, **0 live tests**, asserting `basket-panel`/`basket-line` test-ids while the
  shipped `BasketDrawer.tsx` has **zero** `data-testid` attributes. Pre-existing, not opened here.
  📌 **MACHINERY — `rtk` rewrote a PLAYWRIGHT invocation** and collapsed it to `PASS (2) FAIL (0)`.
  CLAUDE.md records this trap for vitest only; **it hits Playwright too.** Real per-test output
  needed `rtk proxy env PLAYWRIGHT_FORCE_ASYNC_LOADER=1 npx playwright test`.
  📌 **`deal-change.spec.ts` has a load-correlated flake** in the shared `openTwoContexts`/`loginAs`
  fixture — a `beforeEach` timeout hitting 4 of 5 attempts at a **different test position each
  run**, every affected test passing in isolation. **Distinct from the known `sb_secret_`
  baseline**, not T03's diff (that path is untouched). All 19 confirmed by targeted re-runs rather
  than written off. Test-infra debt.
  ✅ **Fix round 1 landed — all 6 corrections, `blocking-findings 1/2`.** Re-ran because the
  teardown change is **behavioural**, so the earlier green did not carry: **tsc 0 · eslint 0 ·
  7/7 e2e in 20.6s.**
  ✅ **The seed is EXACTLY as found — measured, not asserted** (the HEL-73 property): 0 `T03-TMP`
  leaked · 6 GreenLeaf products · all six `AUR-1A`..`1F` flags byte-identical to the pre-run
  baseline · 2 distinct locations, so `discover-shop.spec.ts:170`'s count-of-3 still holds.
  ⚠️ **Residual named rather than hidden:** the new pre-clean does not itself call
  `resetDealData()`, so a prior `afterAll` that threw *at* `resetDealData()` could leave a product
  still holding `deal_line_item` rows → the pre-clean 23503s. **It fails loudly with a named
  error**; the permanent-silent-block is gone. Left unfixed deliberately, window is narrow.

- **build T04, 2026-08-25 (session 91 `deal_land_t03`, continued)** — budgets reset:
  `tests 0/2`, `blocking-findings 0/2`, `G4 rounds 1`. Plan at `PLAN-T04.md` rev 1;
  `plan-checker` spawned at `/build` step 3.
  🔴 **A MISS OF MINE, caught by `git pull --rebase` refusing to run.** T03's **fix-round
  corrections were never committed** — I committed the test files BEFORE the fix round, then
  committed only docs afterwards, so **T03 was recorded as CLOSED while its own six corrections
  sat uncommitted in the working tree.** The gate results still stand (they were measured against
  the working tree, which had the fixes) but the branch did not carry them. Committed now.
  **The class: a green gate and a pushed branch are two different claims**, and I made the first
  while implying the second.
  ✅ **Every T04 target opened and MEASURED before writing a word** — the plan's §1 is a truth
  table, because the way a citation-repair ticket fails is by copying line numbers out of the
  document it is repairing. Five citations independently established:
  `msg_all` **`:300-302`** (ADR says `:288-290`, in THREE places) · the
  `card_relationship_member` deal-child policies **`:312-322`** (ADR says `:300-311`, which is
  actually `msg_all` + `card_all` + `conf_all`) · `can_access_workspace` **`:117-125`** ·
  the `on conflict` precedent **`:159-184`** · and the PRD's pill citation, which points at the
  **superseded** migration.
  🔴 **The sharpest one is not a typo.** ADR §4.1 cites `20260607170000:105-113` for
  *"`deal_workspace` is born `company_wide` so `can_access_workspace` passes"*. The claim is
  **TRUE** (`:123` = `visibility = 'company_wide' OR is_workspace_member(...)`) but `:105-113` is
  **`is_workspace_member` — the function the OR-branch exists to BYPASS.** A reader following the
  citation concludes membership is required, the exact opposite of the sentence's argument and of
  what T03 relies on to assert `deal_member === 1`.
  ⚠️ **T04 owes EIGHT edits, not the three `TICKETS.md` cut it with.** It has grown by ruling four
  times — §8.9/§8.7 (G3) · ADR **J1** (`security` B1, T01 G4) · **AC 5's wording** (T02 G4) ·
  and **`TICKETS.md`'s own T03 AC list** (this session). **The ticket's own criteria are the thing
  most out of date — the same defect it exists to fix, one level up.**
  ✅ **`plan-checker` → REVISE: 5 blocking + 7 notes, all verified true by me before folding
  ([[L-003]]), all accepted.** Plan at **rev 2**. **The truth table SURVIVED** — it re-derived all
  five rows from the files and every replacement range was exact. **What failed was COVERAGE:**
  I measured five citations and walked past three more defect sites *inside my own declared files*,
  plus ten this slug broke itself. **The ticket became TWELVE edits, not eight.**
  1. **B1 — I planned a DELETION where the ruling said REWRITE.** ADR `:607-608` records §8.9
     verbatim: the row **becomes** *"the send creates it; the deal still lands"*. I inherited
     "amended out" from `TICKETS.md`'s **pre-ruling** prose — [[L-039]] pointed at myself.
  2. 🔴 **B2 — the approved PRD said "Verified safe" about a hole THIS SLUG filed as HEL-67.**
     `PRD:52` cited `20260614121000:12` as proof only Sella can write `deal_detected`. The slug's
     own ADR §7.4 had already established **that line is a CODE COMMENT, not a gate.**
  3. **B3 — two more wrong citations in the PRD** (`inbox_select` is `:243-244` not `:79-86`;
     the company-thread policy is `thread_all` `:293-298` not `:231-232`, which is
     `person_group_all`). §4.1's defect one file over.
  4. 🔴 **B4 — this slug's OWN diff falsified ~10 ADR citations**, and T04 was about to ship an
     ADR advertising corrected citations while carrying ten it broke. **Resolved with a
     distinction, not a sweep** — see below.
  5. 🔴 **B5 — my edit 2 did not satisfy the ticket's own AC 2, and the obvious fix was worse.**
     The AC says *"when a reader reaches `DECISIONS.md:1013`"*; a tail entry sits ~810 lines away.
     **And inserting ABOVE `:1013` would move it — breaking FIVE citations at once** (ADR `:47`,
     ADR `:563`, `PRD:6`, `STATE.md:54`, `STATE.md:68`, plus CLAUDE.md). Marker goes **AFTER**.
  📌 **THE USEFUL OUTPUT OF B4 — a distinction now written into the ADR as a banner:**
  **an ADR is a decision record, not a maintained index.** Design-time citations (§2/§3/§6/§8) are
  **frozen at rev 3** — re-pointing them as code moves would falsify the record of what was known
  when the decision was made. **§4.1 and the J-invariants are NOT design-time** — they assert what
  the system does *now* and a reader acts on them, so they are **maintained**. A third bucket:
  anything **false in SUBSTANCE** rather than merely drifted is corrected regardless — one case
  qualified (§7's rationale that a docstring "claims the host navigates"; **T01 rewrote it**).
  ✅ **All TWELVE edits applied**, and **every corrected citation re-verified by opening the file**
  (`/build` step 6, not from memory): `msg_all` `:300` · `line_all` `:312` · `changein_all` `:322` ·
  `can_access_workspace` `:117-125` · `inbox_select` `:243` · `thread_all` `:293` ·
  `can_access_thread` c2c arm `:136` · on-conflict `:159-184` · pill build `:222-230`.
  **Sweep for surviving OLD values: four hits, ALL historical quotes inside the corrections
  themselves** (banner ×2, §4.1's inline note, the PRD's correction text). ~~**Zero live stale citations remain.**~~ ⚠️ **NARROWED (`critic` N9): the sweep searched only
  for the SEVEN old values it had replaced.** It did not re-audit the maintained buckets for
  *other* stale citations — and `critic` then found four live ones there (§4.1's `actions.ts:367`,
  the §4.1 docstring row, **J6**, **J7**). All four fixed in round 1. **A sweep's claim is only as
  wide as its query.** `DECISIONS.md:1013` re-confirmed still the cited bullet **after** the edit.
  ⚠️ **A parallel merge landed on this branch mid-push** (HEL-75, on Muskan's instruction).
  Rebased and **verified rather than assumed**: their `20260825130000` present, my ADR edits
  intact, local == origin. **The pending cloud batch is now TWO migrations**
  (`20260825120000` + `20260825130000`), one plain `db push`, no `--include-all`.
  📌 **Their HEL-75 finding, recorded because it generalises past their ticket:** the remedy that
  ticket itself sketched — an inline `EXISTS (SELECT 1 FROM company …)` in a `WITH CHECK` — is
  evaluated **as the calling role**, so it inherits `company_select`. It would have read as *"the
  receiver is alive"* and meant *"I already share a connection with the receiver"*, **blocking
  every legitimate connect to a new company.** **A predicate inside a policy is not a question
  about the database — it is a question about what the CALLER CAN SEE.** Needed a definer helper.
  📌 **Their fixture pattern is better than T02's and T03's** — dead companies built inside
  `BEGIN…ROLLBACK`, so **zero** seed mutation and nothing to leak. T03 needed an idempotent
  pre-clean precisely because a hard-delete teardown leaks permanently. **Copy theirs next time.**
  ⏳ `critic` spawned on the built diff.
  📌 **HEL-74's stated exploit is DEAD, and it was filed out of THIS slug** (T01 G4, `security`
  N1). The parallel session verified on production that `relationship` is **SELECT-only** for
  `authenticated` and no `public` function updates or deletes it — so "soft-delete the
  relationship, then Send onto a dead one" is unreachable. **The gap may not be dead:**
  `send_deal` still never checks the relationship is live, which is harmless only because of the
  current grant surface, not because of `send_deal`. Asked for the ticket to be CORRECTED rather
  than closed, so nobody re-derives it from N1's original wording. **Separately: "there is
  currently no way to disconnect at all" is a PRODUCT gap, bigger than HEL-74, and unowned.**

## Gate log
- **SHIP + G5 — 2026-08-25. 🏁 SLUG 0023 COMPLETE.** PR #177 (T01-T04 + 3 security migrations)
  merged → main → production. G5 live walk (Marcel/Aurora buyer → Canadian Craft seller,
  `hello-sello-mvp.vercel.app`): all 5 walk-table items confirmed — default addressee "Whole
  company" with named people if connected · company-addressed send → c2c only, zero inbox
  items · person-addressed send → p2p only, zero c2c bleed · Deal-tickets lens shows no new
  entry · pill opens the correct deal card. **G5 caught one real bug, outside the walk table:**
  picking a person still landed the deal in the company chat — the exact seam `visual-verifier`
  (T02 G4) and `critic` (T03 N8 / HEL-76) had both already flagged and routed as "offered, not
  filed" because no AC covered it. Root cause was the two-step create-draft-then-open-card flow
  losing the picked recipient before the separate Send click; fixed by sending immediately on
  draft creation (`5aa6984`). Shipped as its own PR #180, which also closes HEL-76.
- **T04 / HEL-66 — G4 AUTO 2026-08-25. 🏁 SLUG 0023 IS BUILD-COMPLETE (T01-T04).** Docs-only diff,
  nothing renders; all three carve-outs checked, none live. Budgets: `tests 0/2` ·
  `blocking-findings 1/2` · `G4 rounds 1`. **`tsc`/`eslint` deliberately NOT run** — no code in the
  diff; running them for the appearance of a gate would be theatre. **The gate is the re-grep.**
  **Cut with 3 criteria and 4 edits; landed with 4 criteria and TWELVE edits**, every addition
  traceable to a recorded ruling. `plan-checker` REVISE (5 blocking) then `critic` (2 blocking +
  10 notes), all verified before folding.
  🔴 **The finding worth keeping: I protected the line I was warned about and broke every line
  beneath it.** `plan-checker` B5 said `DECISIONS.md:1013` must not move; I placed the marker below
  it — and the **10-line insert shifted everything under it by ten**, moving `D-12` `:1219`→`:1229`
  and **falsifying three live citations, two of them this slug's own** (`REVIEW.md:371` /
  `STATE.md:443` — the *"`D-12` means four different things"* finding). Fixed with a **zero-line
  in-place marker**. **An insert into a cited file is a write to every line number beneath it.**
  🔴 **And the correction went stale twice inside one ticket** — the marker's ADR citation was
  `:563` (blank) → `:598` → **`:604`**, moved by *this ticket's own* edits above it. **It now cites
  the SECTION, not a line.** A line number into a file you are concurrently editing is a guess.
  📌 **The durable output — now a banner in ADR 0006: an ADR is a decision record, not a maintained
  index.** Design-time citations frozen at rev 3; **§4.1 + the J-invariants maintained** because a
  reader acts on them; anything **false in substance** corrected regardless. `critic` then caught
  that I had applied the principle **to the frozen half and not the maintained half** (N1-N4).
  📌 **HEL-74's stated exploit is DEAD** (`relationship` is SELECT-only on prod; no `public`
  function writes it) — **but the gap is not**: `send_deal` still never checks the relationship is
  live, harmless only via the grant surface, and it **re-arms the day a disconnect exists**.
  Corrected, not closed. **"No way to disconnect at all" is a bigger, unowned PRODUCT gap.**
- **T03 / HEL-65 — G4 AUTO 2026-08-25 (no human stop, and the routing is recorded).** The diff is
  **test-only** — three files under `e2e/`, no source, no migration, **nothing renders** — so step
  9's `visual-verifier` did not fire and **all three step-10 carve-outs were checked and none was
  live** (no builder REJECTION; `security` not routed, correctly, as the diff touches no
  migration/RLS/RPC/auth/server action; no behaviour changed at all). **All six criteria replayed
  green**, full table in `REVIEW.md`. Budgets: `tests 0/2` · `blocking-findings 1/2` ·
  `G4 rounds 1`.
  **Headline: AC 6 closed `critic` N1 from T02 on EVIDENCE.** Under the exact swap, `tsc` is **0**
  and basket units are **41/41 green** while this e2e fails on
  `Expected "Alice Green" / Received "Whole company"`; reverted and re-passed.
  **SEVEN items owed to Muskan, none blocking** — T02's unrecorded G4 ruling 3 · `TICKETS.md`
  stale by one row (T04's 6th edit) · the claim **rollout** uncovered at every level (`critic` B2)
  · **the person arm has no end-to-end proof** (`critic` N8; the company arm does) ·
  `present-basket.spec.ts` is dead scaffolding, offered · **`rtk` collapses PLAYWRIGHT too**, not
  just vitest · and `deal-change.spec.ts`'s load-correlated login flake. All in `REVIEW.md`'s G4
  sheet.
- **T02 / HEL-64 — G4 PASSED 2026-08-25 (HUMAN).** Muskan ruled **pass, with T04 amending the AC
  wording.** Budgets spent: `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.
  Five of six ACs walked green; **AC 2 walked live after `plan-checker` found it had no owner**.
  **The four pre-existing side-findings were OFFERED AND NOT FILED** — Muskan declined the
  file-them option. They are named in `REVIEW.md`'s G4 sheet (N4 unguarded fetch · N5 no re-report
  on "Select a customer…" · N6 the initialiser · **N8 the suspended-relationship empty list, the
  L-038-class one**) and stay unfiled deliberately, not by oversight.
- triage — FULL, 2026-08-25 (narrowed from F-04, then widened to include the picker)
- **G1 — PASSED 2026-08-25**, approved unamended. Eight acceptance criteria; with G2
  skipped they are the ONLY thing G4 compares against.
- **T01 / HEL-63 — G4 PASSED 2026-08-25 (HUMAN, not auto).** Backend-only diff would have closed
  with no stop, but `security`'s **blocking** B1 fired the carve-out. Muskan ruled **file and ship**;
  B1 → HEL-67 (widened), N1 → HEL-74. Nine ACs replayed green on real data. Budgets: `tests 0/2`,
  `blocking-findings 1/2`, `G4 rounds 1`.
- **G3 — PASSED 2026-08-25.** ADR 0006 accepted at rev 3. **All eleven sign-offs ruled**
  (§8.1–§8.11); a third checker round offered and declined. Tickets T01–T04 cut.
  ⚠️ **G4 cannot be walked against the PRD as it stands** — two amendments (§8.9, §8.7)
  are T04's, and the G4 sheet must be built from **the ACs minus what G3 changed**, never
  copied from the PRD (L-039).

## Rulings taken at G1 — 2026-08-25

| | ruling |
|---|---|
| G2 `/prototype` | **skipped** — the picker is an existing component in one more place |
| Connection Requests entry | **stops** for company-addressed deals; chat is the only surface |
| Request-pricing → chat | **parked**, own slug |
| Connection Requests page deletion | **not here**; own slug, after Request-pricing moves |
| Second send door (Sella) | **left on the old route** — verified no traffic |
| Person-addressed deal | **P2P only** — the person arm does not change |
| Pill wording | **sender's person name**, one expression hoisted to serve both arms |
| Half-card · `claim_deal_ticket` | untouched / stays — spec resolved, unopposed |

### Risk #1 was WRONG — corrected, do not re-raise

The work order claimed this widens the audience (inbox ticket claimable by one person
vs a company-wide thread). **It does not.** `inbox_select` and the c2c `thread_all`
branch are both plain `current_company_id()` checks
(`20260607170000_rls_policies.sql:79-86, :231-232`), and `sign_deal`
(`20260724120500_sign_deal.sql:73-82`) already lets any company member sign without a
claim. **The discovery channel changes; who may look does not.** And the MVP has one
user per company, so the distinction is moot today.

### Risk #2 — CLOSED, but it leaves a written obligation

`confirm_detected_deal_births_negotiation.sql:176` still routes Sella-born deals to the
inbox. Safe **only** because `deal_detected` messages can be written solely by
Sella/service-role (`20260614121000_propose_deal_rpc.sql:12`) and Sella is not built.
**The page-deletion slug MUST NOT delete `/connect/inbox` while this door still writes
to it.** Carry this forward.

## ✅ T01 GATE IS GREEN — measured by me, 2026-08-25 (`3ae7873`)

**Five SQL runners + `tsc` + unit, exit codes captured from each runner directly** (never from a
pipeline — see the `tail` trap below):

| check | result |
|---|---|
| `run_send_deal_c2c_announce_test.sh` | **exit 0** |
| `run_deliver_deal_test.sh` | **exit 0** |
| `run_claim_deal_ticket_test.sh` | **exit 0** |
| `run_decline_deal_test.sh` | **exit 0** |
| `run_update_deal_draft_test.sh` | **exit 0** |
| `tsc --noEmit` | **exit 0** |
| `npm run test:unit` | **490 / 490**, 67 files |
| AC 9 / M8 repo check (both halves) | **clean** |

**Measured on a verified-clean reset — the verification was not optional.** `builder` warned its
own green "has a shelf life": it hit a reset that stamped `20260825100000` (a version with **no
file on disk**, the parallel session's) while leaving the OLD `send_deal` body live. So before
measuring I confirmed **both** that `20260825090000` was at the tip **and** that the new body was
actually running.

⚠️ **My first probe said `OLD BODY` and the DATABASE WAS FINE — the probe was wrong.** I asked
whether the live definition contained the string `deliver_deal`; it does, in a **comment inside
the new body** explaining that the old rationale died with the deleted call. A substring match
found the comment. The shape-correct probes — `~ 'perform\s+public\.deliver_deal'` (no match) and
the presence of the `on conflict` idiom (match) — both said NEW. **`L-007` (the tool lied is the
LAST hypothesis) and `L-041` (match the shape, not the spelling), inside one command.**

## 🔴 A citation error of MINE, found by `builder` — the third of this class tonight

PLAN-T01 §2.2 cited the `on conflict` precedent as `20260823090000:162-183`. **Verified by
opening it: the idiom's `SELECT id INTO v_rel_id` starts at `:159` and its closing `END IF` is
`:184`. `:162` lands mid-SELECT.** I inherited the range from **ADR §2** without opening the file.

**Both occurrences corrected in PLAN-T01, with the error recorded in place rather than silently
swapped.** ⚠️ **ADR §2 (`:225`) and §8.10 (`:623`) STILL CARRY `:162-183` — T04 owns correcting
them upstream.** Third instance in this one ticket of `L-045`'s class, and **the only one that
was in my own artifact rather than someone else's.**

## Review rounds — full detail in `REVIEW.md`, budgets here

**`blocking-findings` budget: 1 of 2 spent.** Round 4 (`critic`) raised **1 blocking + 8 notes**;
the fix pass is one attempt, not nine (the budget counts fix ROUNDS).

- **`critic` B1 — the migration header cites the WRONG FUNCTION.** `:120-121` calls the p2p arm
  *"a port of `openOrCreateP2pThread`, `store.ts:361-388`"*; that function is at **`:383`**, and
  the cited range is mostly **`resolveC2cThread`** — the **other arm's** resolver, in the one
  migration whose subject is that the arms differ. **All five header citations were copied
  forward unverified** from `20260724120300:23-24` and `store.ts` has moved since. ADR §6.4 and
  PLAN §2.1 made header accuracy this ticket's explicit obligation: **the rationale was rewritten,
  the citations rode along.** `L-045`'s class inside the file told to police it.
- **`critic` N4 — the review-only assignment came back CLEAN.** The `on conflict do nothing` +
  re-select path that **no test exercises** (PLAN §3 handed it to `critic` by name) was read
  character-by-character against `20260823090000:162-183`: faithful in both arms, re-select
  predicates term-for-term identical to the initial selects, bare `DO NOTHING` correct for the
  partial indexes. **This is the one finding that could only ever have come from review.**
- **`critic` N6 — §8.3's ruling had no assertion.** Every company-arm call discarded the return,
  so a silent revert to `null` passed the whole suite. **Fixed** — C1 now asserts non-null AND
  equal to the thread it announced into.
- ⚠️ **`critic` ran with NO SHELL** and said so, so its "unchanged/verbatim" claims are readings,
  not `git diff`. The two it flagged as unverifiable were **independently confirmed by me.**
- 🔴 **`security`'s FIRST ATTEMPT STALLED** (watchdog, 600s) at the point it turned to the catalog.
  **A stalled agent is NOT a pass and is not recorded as one** (L-001/L-008). Respawned with the
  caveat that **the local DB is in the PARALLEL SESSION's shape and `20260825090000` is NOT
  applied**, so a catalog answer about `send_deal` would come from the wrong database.
- ✅ **`builder`'s fix pass: all five `critic` findings ACCEPTED, none rejected** — and it
  re-opened every cited file at every cited line rather than trusting the correction, then found
  a **sixth** (mine, above). Only one logic change in the pass: the named `raise` when the thread
  cannot be resolved. **No builder REJECTION is outstanding** — which matters, because an
  outstanding rejection is one of the three carve-outs that would escalate this ticket to Muskan.

## ✅ T01 IS CLOSED — 2026-08-25. Muskan ruled **file and ship**.

**Budgets spent: `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.**
All nine ACs replayed green on real data; full replay table in `REVIEW.md`.

**The `security` B1 escalation was RULED, not waived.** Both findings filed:

| finding | filed as |
|---|---|
| **B1** — the deal signal moved from an identity-hardened table onto `msg_all`, which has no sender predicate | **HEL-67 WIDENED** (Medium → **High**, retitled). It already covered the **same policy** missing a `type` predicate — two missing predicates on **one statement**, so one ticket; fixing them apart means rewriting `msg_all` twice |
| **N1** — `send_deal` never checks the relationship is still live | **HEL-74** (new, High), related to HEL-67 + HEL-63 |

**Recorded honestly in both: neither hole was opened by this slug.** `msg_all` has never had a
sender predicate; the relationship path produced an inbox ticket before rather than a chat message.
**What changed is that the deal signal now rides on guards that were never there.**

### ⚠️ T04 / HEL-66 gains a FIFTH edit — ruled by Muskan at T02's G4, 2026-08-25

**AC 5's wording.** The ticket says the picked person replaces *"the hardcoded null at
`BasketDrawer.tsx:215`"*. The literal **stays** (now `:216`) — it is the effective "Whole company"
default and what keeps Create enabled; deleting it ships a dead Create button on every buyer group.
**The code is right and the criterion's wording is stale.** Muskan ruled **pass, T04 amends the
AC** — so this is now a required doc edit, not a note.

### ⚠️ T04 / HEL-66's fourth edit — NOT optional

ADR **J1** discloses only the arbitrary-`deal_card_id` half of B1 and **says nothing about sender
attribution**. It must be amended to name it. *(Also written into HEL-67 so it survives if T04
slips.)* **T04 already owed three ADR/PRD corrections; this is the fourth**, alongside ADR §2/§8.10
still carrying the wrong `on conflict` precedent range (`:162-183` → `:159-184`) and §4.1's
systematically wrong policy line numbers (`security` N3 — every claim TRUE, every citation wrong).

### ⚠️ Handed forward — two items, both with a named owner

1. **`/ship` MUST diff `pg_get_functiondef('public.send_deal(uuid)')` against PRODUCTION** before
   pushing (`security` S5 residual). A file-only diff cannot see prod drift, **and this repo has
   been bitten by exactly that** (`ensure_rls` lived on prod and in no migration). If prod's body
   ever diverged, this `create or replace` silently overwrites the divergence.
2. **T03 must grep the c2c counting helpers.** `e2e/inbox-accept.spec.ts:157-158` asserts
   `countThreadsForPair("c2c") === 1`; the heal path can now leave a soft-deleted row beside the
   live one. `resolveC2cThread` is safe (it filters `deleted_at`); naive counters are not.
4. **T03 must NOT become the fourth seed-mutating spec.** Flagged by the parallel session
   `security_tickets` (2026-08-25), which owns **HEL-73** — *"specs permanently mutate the shared
   seed"*, the reason any e2e number in this repo is untrustworthy. **The clean pattern is
   `e2e/discover-shop.spec.ts:586-594`**: create your own rows, hard-delete them in `afterAll`,
   mutate **zero** seed rows. **`AUR-1A`–`AUR-1F` are pinned** by `basket_admission_test.sql` and
   `seed_visibility_matrix_test.sql` — do not touch them. Recorded here so T03 inherits this
   instead of rediscovering it.

3. **T03 will hit auth-key rotation noise.** Every `db reset` rotates the stack key and the e2e
   fixtures resolve it once — so a reset immediately before an e2e run manufactures failures that
   look real. SQL runners are immune (they go through `psql`). Flagged by the parallel session,
   which lost a baseline to it.

## (superseded) T01 was escalated to Muskan — `security` raised a BLOCKING finding

**The carve-out fired.** T01's diff is backend-only, so it would have closed with **no human
stop**. `/build` step 10 lists three overrides; **one is live:**

| carve-out | status |
|---|---|
| a `builder` REJECTION outstanding | no — all five `critic` findings accepted |
| **`security` raised a blocking finding** | 🔴 **YES — B1. This is the escalation** |
| behaviour changed that the criteria do not cover | no — all 9 ACs replay green |

**B1 in one sentence: the code is correct and green; the ADR's disclosure is not.** This slug
moves the company-arm signal from `pending_inbox_item` — **identity-hardened one slug ago**
(`20260823090000:306-309`, `sender_person_id = auth.uid()`, whose header says *"a request may no
longer be attributed to someone who never asked"*) — onto `chat_message`, whose only policy
`msg_all` (`20260607170000:300-302`) checks **`can_access_thread` and nothing else**.

**Verified live by me, not taken from the agent:** `authenticated` holds `INSERT` on
`chat_message`. So any member of either company can post a `type='deal_card'` pill with
`sender_person_id` set to **another person** and a body reading *"<victim> has sent a deal"*.

**ADR J1 discloses half of this** (the arbitrary `deal_card_id`) and **never mentions sender
attribution**. §4.1 records `chat_message` RLS as *"unchanged … no policy is widened"* — **true,
and not the question. The policy did not widen; the signal migrated onto a weaker policy.**

**The proper fix is an RLS change, which ADR §4.2 forbids for this slug** — so this is Muskan's
call and must be an explicit one, not an omission. **`HEL-67` already exists for the forgeable
`deal_detected` message — same table, same two missing predicates.**

**Also escalated with it — `security` N1:** `send_deal` never checks the relationship is still
live. A member can soft-delete the relationship by direct write (DEV-159 class), and the
initiator can then still Send an old `unsent` draft — **now minting a c2c thread on a
soft-deleted relationship and landing a message in it.** Before this diff that produced an inbox
ticket. **CLAUDE.md's T09 invariant says an unconnected buyer must not land a message in a
seller's thread; a formerly-connected one now can.** One predicate in the resolve step.

## ⏳ (superseded) `security`'s verdict was outstanding

T01's diff is **backend-only** (SQL + one docstring, nothing renders), so per `/build` step 10 and
PIPELINE §3 it closes on green tests + `critic` + `security` with **no human stop**. The three
carve-outs that would override that:

| carve-out | status |
|---|---|
| a `builder` REJECTION outstanding | **no** — all five findings accepted |
| `security` raised a **blocking** finding | ⏳ **PENDING — this is the one gate left** |
| the ticket changed behaviour its written criteria do not cover | to be judged at the replay |

**No verdict is being recorded until `security` returns.** ⚠️ Its first attempt STALLED and a
stalled agent is not a pass.

## ⚠️ FOR MUSKAN — a policy gap this ticket makes reachable, and nothing files it

**`can_access_thread` has no `deleted_at` predicate** (`20260607170000:129-144`) — its c2c branch
is a bare `is_relationship_member(...)`. So messages in a **soft-deleted** thread stay
`SELECT`-able by every relationship member, while `resolveC2cThread` (`store.ts:365`) hides that
thread from the app. **Pre-existing.** But before this ticket `send_deal` could never produce a
second c2c thread; the heal path now can. **The new suite defends against it by ordering +
pinning — which is correct for the test and does nothing for the policy.** Own ticket, not this
slug's scope.

## LEARNINGS candidate — owed to Muskan at wrap, NOT yet written

✅ **CLOSED 2026-08-25 — WRITTEN BY THE PARALLEL SECURITY SESSION as `L-047` AND `L-048`**
(their commit `06c244a`, Muskan approved). **They split it by TRIGGER, on my argument that an
insight filed under the wrong trigger is close to unfiled:**
- **`L-047`** — *a test that goes red on a security fix may be asserting the bug.* Trigger: a test
  goes red on a security or visibility fix and the fix looks like the thing to soften.
- **`L-048`** — *an A/B whose arms start from different states is not a weak experiment, it is not
  an experiment.* Trigger: about to compare a before-run against an after-run.

Both cross-reference **`L-044`** (mine) as the third member of the family — the shared axis being
*a green signal that is true only because of something outside the thing being measured.*

⚠️ **`L-045`-`L-048` ARE ALL TAKEN. The next free number is `L-049`.** This session claimed
`L-045` and `L-046` only.

**(superseded) `L-047` was claimed by the parallel security session, not by me.**
It is their catch, their diagnosis, and they are putting it to Muskan themselves; the number
follows the author. **This session must NOT write `L-047` at wrap** — doing so would file their
entry underneath them. My claimed range is `L-045`-`L-046` and nothing else.

**A candidate entry, surfaced 2026-08-25 by the parallel security session.**
Recorded here so it survives to wrap; **not written by me.**

**The insight, in one sentence:** *in both of the day's test traps, a green assertion was borrowing
its truth from outside itself, and neither suite could tell you it was wrong from the inside.*

Two instances, two different mechanisms:
- **mine (T01)** — `deliver_deal_test`'s idempotency case passed only because a **different case in
  the same file** had already written the row. Covered by `L-044`.
- **theirs (HEL-69)** — `pricelist_item_tier_test`'s fixture asserted a "fully public priced
  product" was buyer-visible, and passed only because a **second, independent door** (the price
  view) was more permissive than the one under test. `get_discoverable_shop` returns 0 rows for
  that unfiled product and always has. **The suite was asserting the divergence.**

**Why it is not folded into an existing entry.** Entries are found by scanning **Trigger** lines,
so an insight filed under the wrong trigger is nearly unfiled. It is not `L-046`'s class (that
triggers on *recommending a security/schema default*). It is not quite `L-044`'s either — that one
is scoped to **shared-fixture suites**, where an earlier case is a later case's setup. This is a
different axis: a **cross-door** divergence, which needs an outside oracle to diagnose.

**Proposed trigger:** *a test goes red on a security or visibility fix, and the fix looks like the
thing to soften.* **Proposed rule:** check the claim against an **independent door** before touching
either side — weakening the fix preserves the bug and the green tick together.

### ⚠️ The bigger item the numbering question exposed — FOR MUSKAN, at wrap

`docs/agents/LEARNINGS.md` is an **append-only shared file with a monotonic key and no
allocator**, written by two sessions on divergent bases. The security session's branch is based
on `7529d0a` and tops out at `L-044`, so **the next free number LOOKS like `L-045` from there** —
while `L-045` and `L-046` were already written and pushed here in `7fd33fc`. Two appends in
different places **merge clean**; git flags nothing; the file silently ends up with two `L-045`s.

**The number is the symptom, not the problem: each session assumed it was the only writer.**
That is **`L-040`'s shape a second time — and it SURVIVED the move to worktrees**, because a
worktree isolates the *tree*, not the *convention*. `L-040`'s recorded lesson ("parallel sessions
need separate branches or worktrees, not a sync file") is therefore **incomplete**: separate
worktrees fix concurrent writes to the same file and do nothing for a shared sequential key.

**Caught before collision, by the other session asking rather than assuming.** Two options, and
**deliberately NOT decided unilaterally** — a numbering convention should not be settled by
whichever session noticed it first: (a) an allocation rule (claim in the sync file before
writing), or (b) stop using sequential integers for entry ids.

## Open, not blocking

1. `CONTEXT.md:31` — "a P2P chat" → "a chat". Proposed at G1, **not yet written**,
   awaiting Muskan's yes.
2. `docs/PRD/deal-flow.md:15-31` describes a pre-Phase-12 deal model. Flagged stale,
   **not verified** — whether a `type='deal'` thread is still created anywhere is open.
3. **Linear DEV-163 item 6** — *"Deal goes to Company chat but also people? ISSUE"* —
   Marcel's own open ticket asking what G1 just ruled. Linear MCP auth-blocked.
4. **Five SQL suites read only by name**, not line by line: `finalize_deal_test`,
   `decline_deal_test`, `update_deal_draft_test`, `rls_isolation_test`,
   `confirm_deal_change_metadata_merge_test`. `/design` must settle whether they assert
   routing before tickets are cut — otherwise it surfaces as surprise red at build.
5. **Two suites break BY DESIGN** and need deliberate rewrites, not repairs:
   `supabase/tests/deliver_deal_test.sql:8-10` and
   `supabase/tests/claim_deal_ticket_test.sql:1-18`. Plus `e2e/deal-c2c-create.spec.ts:141-191`,
   whose entire premise this slug reverses.
