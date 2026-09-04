# 0027-retire-connect-inbox — REVIEW.md

One file per slug (PIPELINE §8). Every finding attributed to its reviewer,
severity per the ladder in PIPELINE §10 — `blocking` is rungs 1-3 (leak ·
silent failure · won't run) only; rungs 4-5 (behavioural edge, contract/
wording) are `note`, never retried, surfaced at G4.

---

## T01 · `confirm_detected_deal` stops cutting a deal ticket

Diff: `supabase/migrations/20260903120000_confirm_detected_deal_drop_ticket_branch.sql`
(new), `supabase/tests/confirm_detected_deal_no_ticket_test.sql` (new),
`supabase/tests/run_confirm_detected_deal_no_ticket_test.sh` (new).

**Verdict: 0 blocking across all three reviewers. 8 notes, all rung 4-5.**
No builder retry triggered.

### Notes

1. **(code-review, `supabase/migrations/20260903120000_confirm_detected_deal_drop_ticket_branch.sql:13`)**
   The migration header's "unreachable through any sanctioned route" claim
   relies on Sella detection only ever landing on p2p threads — but that
   guarantee lives in the `sella_enqueue_detection` DB trigger, not in the
   `sella-detect` edge function itself, which applies no thread-type check on
   the `thread_id` it's handed. `security`'s note 2 independently confirmed
   the same fact and explicitly framed it not-blocking, since this diff only
   *deletes* a write (T01 makes the gap strictly no worse). Header wording
   should narrow to "the sanctioned **enqueue** path is p2p-only" rather than
   "detection is unreachable" — a wording fix, not a behavior fix.

2. **(critic, `supabase/tests/confirm_detected_deal_no_ticket_test.sql:150,155`)**
   The "receiving company" premise behind EARS 2 (Carla, GreenLeaf, must be
   the *receiving* side) is pinned only by comment/prose (the header's ⚠️ on
   vote order), not by a runtime assertion. Swapping the Alice/Bob vote order
   would leave the suite fully green while silently testing the wrong
   criterion (Carla would become a member of the *sending* company). Not
   blocking — the criterion is correctly exercised as built today — but a
   one-line assertion (`initiating_company_id = StonePharm`, right after
   `_card` is populated) would close the gap for good.

3. **(critic, `supabase/tests/confirm_detected_deal_no_ticket_test.sql:285-302`)**
   §D's idempotency check re-reads `chat_message.metadata` and counts
   workspaces, but never asserts the RPC's own return value
   (`deal_card_id`/`born_now`) on the already-born re-call. The strong half
   (no second birth) is covered; the caller-visible contract named by EARS 3
   (`born_deal_card_id`) is not directly asserted.

4. **(security, S6/record, `docs/deploy/cloud-migrations-pending.md:45-47`)**
   The ledger's "🔴 READ FIRST" block claims only `20260903090000`,
   `20260903100000`, `20260903110000` are pending — now stale, since
   `20260903120000` isn't listed and isn't yet committed to git either. Owed
   before `/ship`'s cloud push, not before this ticket closes.

5. **(security, S5/record, `20260903120000_…sql:14-16` vs `supabase/functions/sella-detect/index.ts:83-84`)**
   Same underlying fact as note 1 above, independently found. Direction is
   safe (this diff removes a write, adds no reachability) — recorded for the
   header wording fix, not blocking.

6. **(security, S2/record, `docs/deploy/cloud-migrations-pending.md:311`)**
   After T01 ships, `deliver_deal` has zero callers anywhere in the database
   (confirmed via `pg_proc` census, not assumed). The existing ledger entry
   for `20260827140000` ("its one live caller, `confirm_detected_deal`,
   already gates...") goes stale the moment T01 lands. Useful context for T06
   (which drops `deliver_deal` outright) — not this ticket's job to fix.

7. **(security, S2, `20260903120000_…sql:87`, pre-existing, confirmed not worsened)**
   The NULL-blind participant guard on c2c threads (`v_pa`/`v_pb` both NULL →
   `IF` silently doesn't fire) is pre-existing, already documented in
   `PLAN-T01.md`, and confirmed via catalog census to be practically
   unreachable today (`msg_all`'s `WITH CHECK` blocks `authenticated` from
   planting a `deal_detected` message at all; zero such rows exist on any c2c
   thread; a rogue vote can't affect birth since it's keyed under the wrong
   company id; a company-less caller fails loudly). Out of scope for T01 —
   worth a `/track-doubt`, already flagged to Muskan at the design stage and
   again in this session's summary.

8. **(security, S7, `docs/muskan-build/0027-retire-connect-inbox/STATE.md:105-106`)**
   The RED-first run is recorded but its failure message isn't quoted
   verbatim. Minor — the checklist wants the offending assertion's message
   alongside the pass/fail record.

### Verification replay (backend-only ticket — no G4 human stop per PIPELINE §3)

- `plan-checker` round 1: REVISE (1 blocking, folded in) → not re-run, per skill.
- `test-writer` → RED suite confirmed against live code (independently
  verified by `critic` and `security` via manual trace, not just trusted).
- `builder` → green on first pass, 0/2 retries spent.
- `test-runner` → 62/64 SQL suites, 499/499 unit tests, `tsc` clean; 2 SQL
  fails + 6 eslint errors proven pre-existing via A/B worktree run, unrelated
  to T01. e2e skipped (backend-only, no e2e spec exercises this branch).
- `/code-review high`, `critic`, `security` → 0 blocking, 8 notes total (above).

**No visual diff** — migration only, nothing rendered. Step 9 (visual-verifier)
does not apply.

**Backend-only, no carve-out triggered** (PIPELINE §3 / SKILL.md step 10): no
outstanding builder rejection, no blocking security finding, no behavior
change outside written criteria. Closes on green tests + all three reviews,
no human G4 stop.

---

## T02 · Pricing ask to a connected company posts to chat

Diff: `supabase/migrations/20260903130000_request_product_pricing_c2c.sql`
(new — `request_product_pricing_c2c(uuid,uuid)`), `src/app/discover/actions.ts`
(modified — `requestProductPricing` branches), `src/app/discover/pricingRequest.ts`
(modified — one sync comment), `src/types/database.types.ts` (regenerated),
`src/app/discover/requestProductPricing.gate.test.ts` (modified — new cases),
`supabase/tests/request_product_pricing_c2c_test.sql` +
`run_request_product_pricing_c2c_test.sh` (new).

**Verdict: 1 blocking finding (security, rung 1 leak), fixed and independently
re-verified. 1 blocking-adjacent correctness fix (timestamp ordering) bundled
into the same round. 21 notes total across `plan-checker`, `critic`,
`/code-review`, and `security`'s two passes — all recorded below, none
retried.**

### Round trail

- `plan-checker` round 1: REVISE — 3 blocking (unqualified identifiers under
  `search_path=''`; a non-compiling TS snippet; a dup-guard scoped to
  person instead of company) + 6 notes. Folded into `PLAN-T02.md`.
- `test-writer` → RED suite + RED unit cases, confirmed against the
  not-yet-built design. Caught one design gap `plan-checker` missed: step 8/11's
  `created_at` ordering trap, matching `accept_connection_request`'s own
  documented precedent — folded into the plan before `builder` ran.
- `builder` round 1 → green on first pass (SQL suite, unit suite, `tsc`).
- `test-runner` round 1 → found one real regression: a new
  `@typescript-eslint/no-explicit-any` error in the ticket's own test file
  (A/B-proven new, not pre-existing) — `tests 1/2`. Also flagged
  `e2e/discover-shop.spec.ts` test #2 as a genuine, **untracked** planning
  gap (see "For Muskan" below) — not fixed here, e2e edits are outside
  T02's file list and T09's job.
- `builder` round 2 (tests) → eslint fix, confirmed clean.
- `/code-review high` + `critic` + `security`, parallel:
  - **security F1 — BLOCKING, rung 1 (leak).** The RPC's product lookup
    (step 6) checked only `company_id` + `deleted_at`, skipping
    `product_visible_to_caller` — the repo's declared single owner of "may
    this caller see this product." Proved exploitable: a connected caller
    holding a stale product id could get the RPC to post a withdrawn,
    unfiled, or deactivated-seller product's current name into the c2c
    thread. `critic` and `/code-review` independently found the same
    underlying gap but both rated it a note given the narrow blast radius
    they could establish without a live probe — security's concrete proof
    is what elevated it to blocking.
  - `/code-review` also flagged a real correctness gap (not independently
    rated blocking by security, but fixed in the same round): steps 8/11
    each called `clock_timestamp()` independently, and the migration's own
    header falsely claimed the ordering was "guaranteed" — `accept_connection_request`'s
    own cited precedent defends against exactly this coarse-clock tie with
    an explicit `+1ms` offset, which this RPC didn't use.
  - 21 notes total (below) — 0 additional blocking.
- `builder` round 3 (blocking-findings 1/2) → fixed both: added
  `and public.product_visible_to_caller(p_product_id)` to step 6 (called,
  not reimplemented); captured a single `v_now := clock_timestamp()` with
  an explicit `+1ms` offset on the second insert, matching
  `accept_connection_request`'s technique exactly; corrected the migration
  header's false ordering claim; rewrote two stale test-file comment blocks
  that described a pre-fix state. Amended the SQL suite's own fixture
  (added `location` to the test product) since the real visibility gate now
  correctly refuses an unfiled fixture — flagged as an explicit,
  ticket-directed deviation from "never edit test files," not silent
  non-compliance.
- `security` (re-check) → **fix confirmed against the live catalog**, not
  just the file: six hostile probes (expired/future visibility window,
  unfiled, deactivated/unverified/soft-deleted seller) all refused
  post-fix, all previously leaked pre-fix (reproduced read-only).
  Caller-identity resolution inside the `SECURITY DEFINER` body proven
  two-sided (not just assumed). Negative space checked — the
  `company_id = p_receiver_company_id` gate wasn't accidentally dropped
  fixing the visibility gate; `price_public`'s distinct raise still fires
  separately.
- `test-runner` (re-check) → full suite green, matches session baseline
  exactly (63/65 SQL — 2 pre-existing unrelated — 503/503 unit, `tsc`
  clean, eslint back to the 6/15 pre-existing baseline).

### Notes (rung 4-5, not retried)

1. **(plan-checker → resolved in-plan)** EARS 4's "ended" half of the
   suspended/ended criterion is asserted only for "suspended" in the SQL
   suite — behaviorally correct (`assert_relationship_writable` is
   status-agnostic, same code path), just not independently asserted for
   "ended". (critic, rung 5)
2. **(critic)** §C's dedup assertion uses a hardcoded count (`<> 1`), not a
   before/after delta — inconsistent with `supabase.md`'s own rule and safe
   only because seed data happens to put no `type='message'` rows on the
   c2c thread today. `request_product_pricing_c2c_test.sql:291-293`.
3. **(critic)** The `price_public` re-check inside the RPC is scope growth
   beyond TICKETS.md's literal T02 text — justified (plan-approved,
   defense-in-depth for a direct caller) but worth the ruling being on
   record rather than inferred.
4. **(critic)** The `connection_established` healing message
   (`20260903130000` step 8) copies `accept_connection_request`'s intro
   copy, but writes company names in the opposite order (asker-first vs.
   acceptor-first) — same pair, two orderings depending on which door
   minted the thread. A copy inconsistency, not a code bug — Muskan's call
   whether to unify it (would mean touching the Reused fence).
5. **(critic + code-review, converged)** The RPC's product lookup didn't
   re-check the full `product_visible_to_caller` door — **this is F1
   above, now fixed.** Recorded here because both reviewers independently
   found it before security proved it exploitable.
6. **(critic)** `buildPricingRequestNote`'s template (prefix/suffix/280-char
   clamp) is necessarily duplicated in SQL — `pricingRequest.ts` only
   carries a sync-marker comment on `PRODUCT_ID_KEY`, not on the other
   constants that also now have a second, hand-synced owner.
7. **(critic + security F4, converged, now fixed)** The SQL suite's own
   header comments described a pre-build risk state that no longer applied
   even before the round-3 fix — corrected as part of round 3.
8. **(critic)** I-M15 (the ADR's own promoted, "trivially machine-checkable"
   signature invariant for this exact RPC) isn't listed in TICKETS.md T02's
   ADR line, and ADR 0007:272's own sentence about
   `_resolve_or_create_c2c_thread`'s callers is now stale one level up from
   the comment this ticket fixed. Both are ticket/ADR bookkeeping gaps, not
   build gaps.
9. **(code-review)** `pending_inbox_item`'s own `WITH CHECK` never enforced
   "not already connected" — I-J2 is a TS-layer-only guarantee, same
   pre-existing, already-accepted shape as `createPairInboxItem`'s own
   documented "a direct PostgREST insert can still carry an arbitrary
   note/metadata" gap. Not introduced or worsened by T02.
10. **(code-review)** Minor TOCTOU: the relationship could transition
    unconnected→connected between `requestProductPricing`'s
    `is_connected_to_company` check and (on the unconnected arm)
    `createPairInboxItem`'s insert. Narrow window, worst case a stale
    ticket instead of a chat message.
11. **(code-review)** `revalidatePath` calls on the connected branch
    invalidate two Discover routes that render nothing this branch changes
    — copied from the unconnected branch without checking.
12. **(code-review)** `requestProductPricing` now creates its own Supabase
    client and, on the unconnected arm, `createPairInboxItem` creates a
    second independent one — could be passed through instead.
13. **(code-review)** `getDiscoverableShop` and `is_connected_to_company`
    are awaited sequentially though independent — could run via
    `Promise.all`.
14. **(security, re-check N1)** The SQL suite doesn't RED-first-prove the
    `product_visible_to_caller` guard specifically — its own fixture
    product happens to pass visibility, so deleting the new guard line
    would leave the suite green. Real gap in test rigor, matches this
    project's own repeated pattern (S7's stated concern) — worth a
    follow-up cell, not blocking today since the shipped code is correct.
15. **(security, re-check N2)** `is_caller_verified()` checks the caller's
    company's `verification_status`/`deleted_at` but not `deactivated_at` —
    pre-existing (defined `20260617090000`, long before this ticket), and
    directly reinforces Muskan's own open T17 question
    ("what should `company.deactivated_at` mean?"). Not this ticket's gap.

### Untracked planning gap — not a T02 finding, needs a ruling

`test-runner`'s first pass found `e2e/discover-shop.spec.ts` test #2 ("a
CONNECTED buyer's ask lands as a pricelist_request") asserts the exact
behavior T02 deliberately retires — it will read red the next time the e2e
suite runs, and **it is not in T09's named scope**
(`e2e/inbox-accept.spec.ts`, `e2e/deal-lands-in-c2c-chat.spec.ts`,
`e2e/deal-c2c-create.spec.ts` only). `e2e/inbox-accept.spec.ts` has the same
root cause but *is* already in T09's scope, so that one's expected.
Deliberately not touched here — e2e edits aren't in T02's file list and
widening T09's scope (or opening a sibling ticket) is a design-doc decision,
not a build one. Needs your call before `/ship`.

### Verification replay (backend-only ticket — no G4 human stop per PIPELINE §3)

- `plan-checker`, `test-writer`, `builder` ×3, `test-runner` ×2, `/code-review`,
  `critic`, `security` ×2 — full trail above.
- `tests 1/2` (the eslint fix), `blocking-findings 1/2` (the leak + timestamp
  fix, bundled as one round) — both well within budget, no escalation
  triggered.
- **No visual diff** — RPC + server-action branch only, nothing rendered.
  Step 9 (visual-verifier) does not apply.

**Backend-only, no carve-out triggered**: the one builder-adjacent deviation
(editing the SQL suite's own fixture) was explicitly ticket-directed, not a
builder rejection needing adjudication. No behavior change outside written
criteria once the leak fix landed. Closes on green tests + all three reviews
+ independent re-verification, no human G4 stop.

---

## T03 · Discover's Requests list carries pricelist requests

Diff: `src/app/discover/companyRequests.ts` (modified — filter widen, new
`COMPANY_REQUEST_TYPES` export, `type` field, I-J4 comment),
`src/app/discover/companyRequests.test.ts` (modified),
`src/app/discover/sections/RequestsSection.test.tsx` (modified — one
literal, kept compiling), `supabase/tests/accept_connection_request_status_guard_test.sql`
(modified — one new assertion closing an I-M9 coverage gap, no
function/migration touched).

**Verdict: 0 blocking across `plan-checker`, `critic`, `/code-review`, and
`security`. 1 blocking + 5 notes at plan stage (folded into `PLAN-T03.md`),
7 notes at review stage — all recorded below, none retried.**

### Round trail

- `plan-checker` round 1: REVISE — 1 blocking (adding a required `type`
  field breaks two call sites the plan hadn't censused — a construction
  literal in `RequestsSection.test.tsx` and three input literals in
  `companyRequests.test.ts` — `tsc --noEmit` would not have passed) + 5
  notes (the I-M9 "already covered" citation was wrong — case D3/AC2 never
  actually asserted the c2c thread; the I-J4 comment's own draft
  miscounted the seeded codes as four instead of five; the filter itself
  had zero automated cover; "no UI render yet" was false; an unremarked
  duplicate type union). Spot-verified and folded in — including extending
  the *existing* `accept_connection_request_status_guard_test.sql` suite
  with a genuinely missing c2c-thread assertion (I-M9), rather than
  writing a new SQL suite T03 doesn't need.
- `test-writer` → RED (compile-breaking, as intended) on the two TS test
  files; the SQL suite addition was correctly framed as adding coverage of
  already-correct behavior, not proving a fix.
- `builder` → green on first pass. Single file touched
  (`companyRequests.ts`), exactly as planned.
- `test-runner` → full suite green, matches session baseline exactly
  (63/65 SQL, 506/506 unit, `tsc` clean, 6/15 eslint pre-existing). Caught
  and self-corrected a harness artifact (a suite needing its own
  transaction wrapping) before it could be misreported as a regression.
- `/code-review high` + `critic` + `security`, parallel → 0 blocking from
  all three. `/code-review` surfaced 8 findings, but on inspection every
  one is either already recorded under T01/T02 above (the `confirm_detected_deal`
  NULL-guard note, T02's I-J2/`requestActionError`/`revalidatePath`/
  `Promise.all`/hardcoded-template notes, the untracked `e2e/discover-shop.spec.ts`
  gap) or is T04's explicitly-deferred badge work (`RequestsSection.tsx`
  rendering a pricing ask with no distinguishing badge — correctly
  anticipated in `PLAN-T03.md`'s own corrected framing, not a T03 defect).
  Nothing new for T03 itself. `critic` and `security` both reviewed T03's
  actual diff and found 0 blocking, 5 + 2 notes respectively (below).

### Notes (rung 4-5, not retried)

1. **(critic)** The new `COMPANY_REQUEST_TYPES` unit test asserts the
   constant's contents directly but doesn't read the actual query — its
   own comment overclaims that a builder reverting the `.in(...)` call
   (while leaving the constant alone) would be caught. It wouldn't; the
   shipped code is correct, only the test's self-description overstates
   its own reach.
2. **(critic)** AC2 says the accept path "mints" the relationship, but the
   only test exercising it (D3/AC2) runs on a pair already connected
   earlier in the same transaction — an "adopt" path, not "mint". A
   `pricelist_request` accepted on a genuinely never-connected pair has no
   test anywhere in this repo. Pre-existing gap in `accept_connection_request`'s
   own coverage (predates T03), correctly left out of this ticket's scope
   per the plan.
3. **(critic)** The new c2c-thread assertion (I-M9) is weaker than its p2p
   sibling — it doesn't pin `relationship_id`, so it would technically
   pass if the RPC returned any live c2c thread id, not necessarily the
   accepted pair's own. Still genuinely non-vacuous (a NULL/dangling id
   fails it) and proves something the suite never checked before. One
   extra predicate would close the gap.
4. **(critic)** The plan's own "RED-first" instruction for the new
   assertion is technically unperformable as literally written (a
   reverted/deleted assertion can't "fail") — the meaningful check is
   pointing the resolved id at a bogus uuid and confirming the raise
   fires, which wasn't independently re-confirmed this round.
5. **(critic)** `COMPANY_REQUEST_TYPES` is now a fourth near-duplicate
   type-membership list in this area of the codebase (alongside
   `PairInboxType`, `AcceptRequestType`, `InboxRequestType`) — the plan
   only reasoned about one of the other three. `AcceptRequestType` is the
   one that actually matters (it's what `acceptItem` casts into via an
   `as`, which `tsc` can't catch a drift on) — worth a sentence on record
   that keeping them separate is deliberate, not oversight.
6. **(security)** The query's own docblock still describes `inbox_select`
   as a two-disjunct policy; the live policy has a third
   (`receiver_person_id = auth.uid()`, added later). Harmless today (a
   CHECK constraint confines that disjunct away from the three widened
   types, confirmed via live probe), but understates the real floor to
   whoever reads this comment next instead of the catalog.
7. **(security)** The I-J4 comment grounds the `connect_person` exclusion
   in the column going nullable — true but not the actual enforcement
   mechanism, which is two named CHECK constraints
   (`inbox_connect_person_has_no_company`,
   `inbox_person_target_only_for_connect_person`). Citing them by name
   would be a stronger, more precise comment.

### Verification replay (backend-only ticket — no G4 human stop per PIPELINE §3)

- `plan-checker`, `test-writer`, `builder`, `test-runner`, `/code-review`,
  `critic`, `security` — full trail above. `tests 0/2`,
  `blocking-findings 0/2` — closed clean, no retries spent.
- **No visual diff shipped** — `RequestsSection.tsx` itself is untouched;
  the badge/retitle that would make this visible is T04's own diff, not
  this one's. Step 9 (visual-verifier) does not apply to T03's actual
  changes; T04 will need it.
- `security` independently confirmed the RLS floor (`inbox_select`) is
  type-agnostic and already released these rows before this ticket — the
  application-level filter widen exposes nothing new, live-probed against
  a third, uninvolved company (0 rows visible) and the legitimate receiver
  (correct 2-row result, `connect_person` correctly absent).

**Backend-only, no carve-out triggered**: no outstanding rejection, no
blocking finding from any reviewer, no behavior change outside written
criteria. Closes on green tests + all three reviews, no human G4 stop.
