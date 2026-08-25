# 0023 deal-draft-lands-in-chat — work order
lane:   FULL
stage:  design ✅  →  build: **T01 ✅ CLOSED** → **T02 / HEL-64 IN PROGRESS** (session 90 `deal_land_t02`)   ·   G2 /prototype SKIPPED (Muskan, 2026-08-25)
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
  ⚠️ **owes two amendments from G3** — `:131`'s edge-case row (§8.9) and AC1/AC2's
  wording (§8.7). Until T04 lands them the PRD contradicts the ADR.
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
  ⏳ **`plan-checker` running.**

## Gate log
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

### ⚠️ T04 / HEL-66 gains a fourth edit — NOT optional

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
