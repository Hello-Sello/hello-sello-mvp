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

---

## T04 · Every request row shows a type badge; the box is retitled

Diff: `src/app/discover/requestTypeMeta.ts` (new — `DiscoverRequestKind`,
`RequestTypeBadge`, `requestTypeBadge()`), `src/app/discover/requestTypeMeta.test.ts`
(new), `src/app/discover/sections/RequestsSection.tsx` (modified — badge +
retitle), `src/app/discover/sections/RequestsSection.test.tsx` (modified),
`src/app/discover/DiscoverShell.test.tsx` (modified — one literal, `plan-checker`
B1), `e2e/discover.spec.ts` (modified — two literals, `plan-checker` B2).

**Verdict: 0 blocking across `/code-review` and `critic` (no `security` — no
migration/RLS/RPC/auth/server-action/cross-company-read surface). 3 blocking
+ 5 notes at plan stage (1 of the 3 spot-verified FALSE and rejected, 2 held
and folded into `PLAN-T04.md`), 8 notes at review stage — all recorded below,
none retried.**

### Round trail

- `plan-checker` round 1: REVISE — 3 blocking + 5 notes.
  - **B1 (rung 3, held):** `DiscoverShell.test.tsx:26` hardcodes
    `'Connection requests'`, outside T04's stated file list — D9's retitle
    turns it red. Folded in as Plan File 5.
  - **B2 (rung 3, held):** `e2e/discover.spec.ts:43,53` hardcode the same
    string in two Playwright assertions, owned by neither T04 nor T09.
    Folded in as Plan File 6.
  - **B3 (rung 3, claimed, spot-verified FALSE):** claimed
    `"connect_person" as DiscoverRequestKind` raises `TS2352`, requiring
    `as unknown as` first. Disproved by running this repo's own
    `tsc --strict` directly (bypassing the `rtk` hook, which fabricated a
    clean pass with zero real diagnostics on the first, wrong attempt) —
    the cast compiles clean; TypeScript widens a literal source expression
    to its base type (`string`) before the assertion-overlap check, so two
    disjoint string-literal types are comparable where two disjoint
    primitive types (the control case, `5 as string`) are not. Not folded
    in. `critic` independently re-derived the same mechanism during review
    and confirmed the rejection (see Notes below) — two independent checks
    now agree B3 was wrong.
  - N1 (missing `RequestTypeBadge` import in the plan's own snippet), N2
    (I-M11 asserted only in prose, not machine-checked), N4 (render
    assertions are page-wide substrings, not row-bound), N5 (a factual
    slip describing `InboxRequestType` as DB-sourced rather than a
    deliberate subset) — all held, folded into the plan. N3 (row-height/
    density change from the taller badged row) — named, routed to the G4
    human look rather than fixed in code.
- `test-writer` → RED across 4 test files: import-resolution failure for
  the not-yet-built module, and string-absence failures for the retitle/
  badge assertions everywhere else. Touched no source file.
- `builder` → green on first pass. Two source files, exactly as planned,
  zero deviations, zero rejections.
- `test-runner` → full suite: `tsc` clean, unit 514/514 (+8 new cases
  exactly, 0 drift elsewhere), eslint 6/15 pre-existing (byte-identical
  A/B against the T03 tip), SQL 63/65 pre-existing (same 2 fails already
  recorded at T01, unrelated — T04 touches no `supabase/` file, confirmed
  via `git status`), `e2e/discover.spec.ts` 4/4 green (run twice for
  stability) — the one file `builder` didn't run itself.
- `/code-review high` + `critic`, parallel → 0 blocking from either.
  `/code-review` independently re-verified `tsc` clean and 11/11 on the
  three unit files it could reach, confirmed no other `<RequestsSection>`
  consumer and no other file besides the two `plan-checker` already found
  referencing the retired title string. `critic` walked all three EARS
  criteria against the shipped code line-by-line (below) and confirmed
  the Reused fence intact.

### Notes (rung 4-5, not retried)

1. **(code-review, `src/app/discover/sections/RequestsSection.tsx:5`)**
   The top-of-file docblock still calls this the "Connection requests"
   box after this same diff renames the rendered title to "Requests" (D9)
   a few dozen lines below — self-contradicting comment.
2. **(code-review, `src/app/discover/sections/RequestsSection.test.tsx:2`)**
   Same shape: the docblock still says 'One "Connection requests" box'
   while the test's own assertion three lines below now expects
   "Requests".
3. **(critic, scope note, no action)** `DiscoverShell.test.tsx` and
   `e2e/discover.spec.ts` are outside TICKETS.md T04's stated file list —
   both are the `plan-checker` B1/B2 findings, both one-word title-string
   swaps, both fall under ADR §9's "scope may grow to keep the shipped
   system correct." Recorded so the growth is visible at the gate, not
   absorbed silently.
4. **(critic, `src/modules/connect/lib/inbox-display.ts:63-68` vs
   `src/app/discover/requestTypeMeta.ts`)** ADR 0009:142 says
   `REQUEST_TYPE_META`/`REQUEST_TYPE_BLURB` both "move" to the new file;
   only the META half shipped. `REQUEST_TYPE_BLURB`'s one consumer
   (`InboxRow.tsx:32`) is deleted by T07, so it dies unreplaced — a
   `connect` row with a null `note` shows name + badge and no descriptive
   line, where the retiring inbox showed "Wants to connect." Not blocking
   (T04's EARS never mention a blurb), but either D4's wording is stale or
   a one-line product call is owed before T07 removes the option.
5. **(critic, `e2e/discover.spec.ts:43`)** Playwright's `name` matcher is
   a case-insensitive substring match, and after the swap "Requests" is a
   substring of the OLD title "Connection requests" too — so this
   assertion would now pass on either title. The change was still
   required (the literal-equality-adjacent old string fails outright
   pre-swap), but the browser-level cover for D9 is nominal; the two unit
   assertions are what actually pin it. `exact: true` would restore
   discrimination.
6. **(critic, `src/app/discover/requestTypeMeta.ts:1-19`)** The fallback
   has a theoretical prototype-chain hole in the exact mechanism AC2
   names: `requestTypeBadge('constructor' as DiscoverRequestKind)`
   returns the inherited `Object`, not `undefined`, so `?? FALLBACK_BADGE`
   never fires and `<Icon />` throws "Element type is invalid" — same
   crash class the criterion cites, via a different door. Unreachable
   today (`inbox_request_type` seeds no such value, and
   `companyRequests.ts`'s `.in("type", COMPANY_REQUEST_TYPES)` gates the
   query besides). `Object.hasOwn(...)` would close it; rung 4, not
   promoted to blocking.
7. **(critic, no file — coverage gap)** D4's *visual* half ("stacked above
   Accept/Decline") has zero automated cover. `renderToStaticMarkup` sees
   the label text, never DOM position; the seeded e2e account
   (`alice@greenleaf.test`) has no incoming requests, so the badge never
   renders in a browser run either. Variant C's placement rests entirely
   on the G4 human look below.
8. **(critic, `src/app/discover/sections/SectionCard.tsx:28`)** Confirms
   plan-stage N3: the duo is pinned to `md:h-[320px]` with internal
   scroll, and the badge adds roughly 24px per row, so roughly 3 rows are
   visible before scrolling instead of roughly 4. No test breaks (the
   equal-height e2e assertion is fixed-height, row-count-indifferent) —
   exactly why it needs the human look rather than a green suite.

### Verification replay

- `plan-checker` round 1: REVISE (3 blocking claimed, 2 held + folded, 1
  spot-verified false and rejected) → not re-run, per skill (one round).
- `test-writer` → RED confirmed (import-resolution + string-absence, both
  genuine pre-build failures, not vacuous).
- `builder` → green, first pass, 0/2 retries spent, 0 deviations, 0
  rejections.
- `test-runner` → `tsc` clean; unit 514/514 (+8 exact); eslint 6/15 and
  SQL 63/65 both independently A/B-proven pre-existing/unrelated; e2e
  4/4. `tests 0/2`.
- `/code-review high` + `critic`, parallel → 0 blocking, 8 notes (above).
  `blocking-findings 0/2` — closed clean, no retries spent.

**This diff renders** (a badge and a title, on a page a person looks at) —
per PIPELINE §3 / SKILL.md step 10, this stops at G4 for Muskan's own look,
not an auto-close. `visual-verifier` next.

---

## T05 · Backfill: resolve every pending deal ticket

Diff: `supabase/migrations/20260904090000_pending_inbox_item_deal_card_backfill.sql`
(new — DML-only, one `UPDATE`), `supabase/tests/pending_inbox_item_deal_card_backfill_test.sql`
(new), `supabase/tests/run_pending_inbox_item_deal_card_backfill_test.sh` (new).

**Verdict: 1 blocking finding (security, rung 2, S7 — the test doesn't prove
`status = 'pending'` is load-bearing), fixed in one round and independently
re-verified. 0 blocking from `/code-review` or `critic`. 6 + 4 + 8 notes
across the three reviewers — recorded below, most are re-discoveries or
findings about already-shipped tickets, not new T05 gaps.**

### Round trail

- `plan-checker` round 1: REVISE — 1 blocking (the EARS-3 fixture design
  didn't work: `create_deal_draft` births `'unsent'` not `'negotiation'`,
  creates no thread, needs an authenticated caller the plan told the
  builder to avoid — spot-verified against the RPC's live body, held,
  redesigned to plain INSERTs) + 6 notes (a false "no trigger" claim — one
  exists, built via `format()` in a loop, invisible to a literal grep; a
  wrong grant-rejection rationale — the real reason to avoid
  `SET LOCAL ROLE authenticated` is RLS silently narrowing rows, not a
  permission error; missing NOT NULL columns in the fixture spec; an
  undernamed `claim_deal_ticket` behaviour change; a `deal_card_id` wiring
  gap weakening the EARS-3 assertion; a stale ticket-count in TICKETS.md's
  own Ready table). All held, folded into `PLAN-T05.md`.
- `test-writer` → wrote the SQL suite + runner. Could not `chmod +x` the
  runner (no Bash tool available to it) — done manually before `builder`
  ran.
- `builder` round 1 → green first pass. Byte-identity between the
  migration's UPDATE and the test's inlined copy confirmed via `diff` +
  matching MD5 checksums (the coupling the plan explicitly calls out for
  a DML-only migration with nothing else to call).
- `test-runner` round 1 → `tsc` clean, unit 514/514 (0 drift, this ticket
  touches no TypeScript), eslint 6/15 and SQL 2/66 both independently
  confirmed pre-existing/unrelated (same baseline as T01-T04),
  `supabase db reset` applies clean with the new migration correctly at
  the tail. New suite independently re-run, not just trusted from
  `builder`'s report — green.
- `/code-review high` + `critic` + `security`, parallel:
  - **security F1 — BLOCKING, rung 2 (silent failure, S7).** The suite's
    own header claims all three WHERE predicates are independently
    provable by "dropping any one … would flip a different row and fail
    a specific cell" — false for `status = 'pending'`. The only non-
    `pending` fixture row is already `'accepted'` (a no-op target either
    way), so dropping that predicate flips zero visible values and every
    cell still passes. Not hypothetical: `declineItem`
    (`src/modules/connect/supabase/inbox.ts:352-356`) produces real
    `deal_card` rows at `status = 'rejected'` with no type filter — an
    unguarded WHERE clause would silently flip a declined ticket back to
    `accepted` in production, undetected by this suite. `critic` and
    `/code-review` did not independently find this; `security`'s own S7
    checklist item (proven RED-first) is what surfaced it.
  - `critic` → 0 blocking, 6 notes (below) — independently censused
    every other consumer of the precondition this migration deletes
    (not just `claim_deal_ticket`, which the plan already named) and
    confirmed nothing else is affected; confirmed the byte-identity
    claim itself by re-diffing.
  - `/code-review high` → 0 blocking specific to T05's own diff. 8
    findings total, but only one (the misleading History-lens banner)
    concerns T05's diff at all — and `security` (F4) and `critic` (N6)
    had already independently found and rated the same fact non-blocking
    (a disclosed, self-resolving W3→W4 window artifact). The other 7
    are pre-existing gaps in `confirm_detected_deal` (unchanged by any
    ticket in this slug — already on record from T01's own review, see
    below), a deliberate ADR-locked design choice in T04's
    `requestTypeMeta.ts` mistaken for duplication, and efficiency/process
    notes about already-shipped T02 code or the plan's own disclosed
    manual checkpoint. None are T05 regressions.
- `builder` round 2 (blocking-findings 1/2) → added fixture row 7
  (`deal_card`/`rejected`/`NULL`) and an assertion it stays `rejected`
  after the UPDATE, per security's exact fix suggestion. Proved its own
  fix by temporarily stripping `status = 'pending'` from the test's
  embedded UPDATE copy, confirming the new cell fails
  (`row 7 … expected to stay rejected, found accepted`), then restoring
  the original text.
- `test-runner` (re-check) → independently reproduced: full suite green,
  same 2 pre-existing SQL fails (unrelated, confirmed via file-diff —
  neither touched by this ticket), unit 514/514, `tsc` clean, `db reset`
  applies clean. Did not trust `builder`'s report — read the test file
  directly to confirm row 7 and the new cell are really present, then
  ran the suite itself.
- `security` (re-check) → **F1 CLOSED, independently re-verified from
  first principles, not on builder's word.** Hashed the migration file
  before/after (unchanged, `sha256` identical throughout the fix loop);
  confirmed the byte-identity invariant still holds (migration and test's
  embedded copy hash identically); re-ran the three-predicate removal
  simulation against the now-seven-row fixture — each drop now moves a
  row a specific §A cell pins; then went further than asked and
  **rebuilt all three predicate-drop mutants itself** in a scratch
  transaction, reproducing the exact failure for each (including
  `builder`'s claimed message for `status`, verbatim) before restoring
  and leaving the DB clean. Re-ran the full negative-space sweep too
  (every reader of `pending_inbox_item` — `inbox_select`,
  `list_discoverable_companies/people`, `shares_connection_with_company`,
  `can_see_person`) and confirmed none of them change their answer for
  any caller as a result of this backfill.

### Notes (rung 4-5, not retried)

1. **(critic)** The suite's own header (`:61-68` pre-fix) claimed "EXPECTED
   TO BE RED right now: the migration file does not exist yet" — false on
   both counts even before the fix; there is no function to call, so the
   suite was never RED-against-old-code the way T01-T04's were. A
   `test-writer` leftover, matches L-045's shape.
2. **(critic)** The `claim_deal_ticket`-unreachable consequence is named in
   `PLAN-T05.md` but not in the migration's own header — a DBA reading
   just the migration wouldn't learn it.
3. **(critic)** §A/§C assert proxies of the EARS wording rather than the
   literal criteria (row-by-row status instead of AC1's count query; a
   `chat_message` row instead of AC3's "chat thread"; a column subset
   rather than genuinely every column) — equivalent given this fixture,
   provable by construction, but the wording overclaims "byte-identical."
4. **(critic, rung 4)** `pending_inbox_item` is in the realtime
   publication — the backfill broadcasts one UPDATE per touched row to
   every connected client. RLS-scoped, no leak; practical impact ~0 since
   production is expected to hold 0 such rows (ADR §1).
5. **(critic)** Five `GRANT SELECT ON _t TO authenticated` statements in a
   suite that deliberately never switches role — dead, copied from the
   sibling suite where the switch is real, quietly contradicts the
   header's own emphatic note.
6. **(critic, rung 5)** A backfilled row would show a misleading "Deal
   picked up" banner in `/connect/inbox`'s History lens for the W3→W4
   window — only reachable before T07 deletes the page, and (per the
   ADR) on rows that were never cut through a sanctioned route to begin
   with. A wording artifact, not live work. **Converges with security F4
   and code-review's finding 3 below — three reviewers, same fact, same
   non-blocking rating.**
7. **(security, S7, rung 5)** The header's "one each of the three OTHER
   live `inbox_request_type` codes" is wrong — the catalog seeds five
   codes total, not four; `connect_person` is the uncounted one. No
   practical risk (exact-equality predicate on a `NOT NULL` column), but
   the sentence is untrue as written.
8. **(security, S2, rung 5)** Same dead-grant observation as critic's
   note 5, independently found.
9. **(security, S4, rung 4)** Confirms critic's note 6/code-review's
   finding 3 — the History-lens banner is real but not a leak
   (RLS-scoped, viewer already entitled to see the row) and
   `claim_deal_ticket` stays unreachable exactly as the plan predicted
   (verified directly against `InboxDetail.tsx`'s render branches, not
   assumed).
10. **(code-review, `confirm_detected_deal_drop_ticket_branch.sql:79`,
    pre-existing, NOT T05's — flagged for the record)** The idempotent
    "already born" early-return runs BEFORE the participant guard, so
    any authenticated caller who obtains a `deal_detected` message id
    can read back its `deal_card_id` for a deal they have no
    relationship to — a distinct info-disclosure angle from the
    already-documented NULL-guard bypass (T01 REVIEW.md notes 1/5/7).
    Unchanged by T01's diff (which only deletes the trailing `else`
    branch) or by anything in this slug. **Not fixed here — out of
    T05's scope. Filed as [HEL-89](https://linear.app/hellosello/issue/HEL-89)
    (Codebase Development Tickets), 2026-09-06.**
11. **(code-review, same file:87, pre-existing, already on record)**
    Re-discovery of the NULL-blind participant guard already documented
    in T01's REVIEW.md notes 1/5/7 and STATE.md's "For Muskan" section.
    Nothing new.
12. **(code-review, `20260903130000_request_product_pricing_c2c.sql:190`,
    concerns already-shipped T02, NOT T05 — flagged for the record, not
    fixed here)** A TOCTOU gap in the dedup guard: step 9's `EXISTS`
    check and step 11's `INSERT` have no unique constraint or lock
    between them, so two near-simultaneous calls (a double-click, a
    retried request) can both pass the check and both insert — violating
    I-M13's locked invariant ("the same ask twice … does not produce a
    second chat message") under concurrency, which T02's sequential SQL
    suite would not have caught. **Genuinely new, not a re-discovery —
    T02 is already merged and G4-approved, so this isn't T05's fix to
    make. Filed as [HEL-90](https://linear.app/hellosello/issue/HEL-90)
    (Codebase Development Tickets), 2026-09-06.**
13. **(code-review, `src/app/discover/requestTypeMeta.ts:7`, already
    decided, not a gap)** Flagged as duplicating
    `inbox-display.ts`'s `REQUEST_TYPE_META` instead of reusing it. This
    was a deliberate ADR decision (D4/I-M11, `PLAN-T04.md`): importing
    from `inbox-display.ts` would couple the new badge map to
    `COMPANY_INBOX_TYPES`, which derives a query filter from that map's
    keys — exactly the coupling I-M11 exists to prevent. `inbox-display.ts`
    is also deleted outright in T07, making "reuse it" actively wrong
    advice. Re-discovery of an already-ruled-on tradeoff.
14. **(code-review, `20260903130000_...sql:130`, concerns already-shipped
    T02, efficiency only)** Expensive validation (relationship lookup,
    liveness, visibility) runs before the cheap dedup check, so a repeat
    ask pays full validation cost before short-circuiting. Not fixed
    here — T02's own ticket, already closed.
15. **(code-review, `PLAN-T05.md:222`, process note, not a code defect)**
    Observes the real I-M5 checkpoint (run for real against the target
    environment before T06/T07 start) has no automated enforcement.
    Already disclosed identically in the plan and the migration header —
    reinforcement, not a new finding.
16. **(code-review, `src/app/discover/actions.ts:170`, concerns
    already-shipped T02, efficiency only)** `is_connected_to_company`'s
    underlying predicate is evaluated up to three times across one
    `requestProductPricing` call. Related to T02 REVIEW note 13
    (sequential awaits, not `Promise.all`) but a distinct angle. Not
    fixed here.
17. **(security, re-check N1, rung 5)** The suite's header still says
    fixture rows 4-6 cover "the three OTHER live `inbox_request_type`
    codes" — there are four others (`connect_person` uncounted), and it
    's live (seeded on `db reset`, written by
    `src/app/discover/personActions.ts:57`). Not a real gap — `type` is
    still proven red by rows 4-6, and §B's delta happens to cover the
    seeded `connect_person` row — but adding a real row 8 isn't a
    one-line tuple (`connect_person` forces a different column shape:
    `receiver_company_id NULL`, `receiver_person_id NOT NULL`, per three
    separate CHECK constraints). Cheapest correct fix is the wording.
18. **(security, re-check N2, rung 5)** The "EXPECTED TO BE RED right
    now" header line is stale post-fix too (same underlying issue as
    critic's note 1) — the suite runs its own embedded UPDATE copy, so
    it was never genuinely RED against the migration's absence.
19. **(security, re-check N3, rung 4)** The migration↔test byte-identity
    coupling is enforced only by a comment, not the runner — if a future
    edit changes the migration's predicate without updating the test's
    embedded copy, the suite stays green and the drift is silent.
    Verified identical today; this is about future drift, not a present
    gap. Cheap to harden (hash the migration's UPDATE block against the
    test's in the runner script) — not done here, rung 4, named for the
    record.
20. **(security, re-check, out-of-diff, not a T05 finding)**
    `shares_connection_with_company` matches any `pending_inbox_item`
    row with no `status` and no `deleted_at` filter — a rejected or
    soft-deleted request appears to grant person-visibility permanently.
    Pre-existing, untouched by this ticket, unaffected by the backfill
    either way (T05 doesn't change which rows exist, only `deal_card`
    rows' status, and this predicate doesn't filter on `type` either).
    **Filed as [HEL-91](https://linear.app/hellosello/issue/HEL-91)
    (Codebase Development Tickets), 2026-09-06.**

### Verification replay (backend-only ticket — no G4 human stop per PIPELINE §3)

- `plan-checker`, `test-writer`, `builder` ×2, `test-runner` ×2,
  `/code-review`, `critic`, `security` ×2 — full trail above.
- `tests 0/2` (no test-runner-caught regression, only the security-caught
  test-rigor gap), `blocking-findings 1/2` — well inside budget.
- **No visual diff** — DML-only migration, nothing rendered. Step 9
  (visual-verifier) does not apply.
- **Carve-out check (PIPELINE §3 / SKILL.md step 10):** no outstanding
  builder rejection. The one blocking security finding was fixed AND
  independently re-verified by `security` itself before this ticket
  closed — matching T02's own precedent (a blocking finding that gets
  fixed-and-reverified within the ticket's own round does not leave
  anything "outstanding," so the carve-out does not trigger). The one
  named behaviour change (`claim_deal_ticket` becoming unreachable) is
  documented as the intended, written-into-the-plan end state (D5/I-M2),
  not an undocumented one. **No carve-out triggered — closes on green
  tests + all three reviews + independent re-verification, no human G4
  stop.**

**Three findings surfaced during this round that were NOT T05's to fix — all
filed 2026-09-06 to Linear team "Codebase Development Tickets" (not
`/track-doubt`, which is scoped to LAYER-*.md product doubts; these are
engineering findings with no product-doc home):** (a)
[HEL-89](https://linear.app/hellosello/issue/HEL-89) — the
`confirm_detected_deal` info-disclosure angle, alongside the already-known
NULL-guard bypass; (b) [HEL-90](https://linear.app/hellosello/issue/HEL-90) —
the TOCTOU dedup race in T02's already-shipped `request_product_pricing_c2c`,
violating locked invariant I-M13 under concurrency; (c)
[HEL-91](https://linear.app/hellosello/issue/HEL-91) —
`shares_connection_with_company` granting person-visibility with no
`status`/`deleted_at` filter. See notes 10, 12, and 20 above for full detail.

### G4 visual staging (`visual-verifier`) — evidence for Muskan's look

**⚠️ There is no prototype file to diff against.** `STATE.md` records that the
row-label variants were driven live on `/discover?variant=` and thrown away
after the decision, so every row below is staged against the **written** spec:
ADR 0009 D4 / D9 / D10 / I-M16 and TICKETS.md T04's three EARS lines. Where a
row says `deviates`, it deviates from that prose (or from a claim made earlier
in this same file), never from an image.

**How the page was reached.** Fresh `supabase db reset` (local stack, migration
tip `20260903130000`, `.env.local` → `127.0.0.1:54321`), `next dev` on
`localhost:3000`, signed in as the seeded `alice@greenleaf.test` through the
repo's own `e2e/fixtures/two-company.ts:loginAs`, real page, real data, no
isolated component render.

**On the data.** `e2e/discover.spec.ts`'s header comment claiming Alice has "NO
incoming requests" is **stale** — seed §5f and §7c give her three live pending
rows (`connect` from Eva/Bavaria, `connect_message` from David/NordCanna,
`connect_person` from Clara). The fourth kind is **not** seeded: a
`pricelist_request` was added as a local-only fixture row whose columns mirror
`createPairInboxItem` exactly (`note` = `buildPricingRequestNote(product.name)`,
`metadata` = `{"product_id": …}`, sender Eva/Bavaria — unconnected to GreenLeaf,
which is the arm that still cuts a ticket after T02). **It was inserted by SQL,
not produced by a live `requestProductPricing` call** — so this staging proves
the *badge*, not T02's write path. All four `DiscoverRequestKind` values were on
screen together.

Screenshots: `docs/muskan-build/0027-retire-connect-inbox/g4/`.

#### Acceptance criteria (TICKETS.md T04 EARS)

| # | Spec line | Verdict | Evidence / what differs |
|---|---|---|---|
| 1 | "When any request row renders, the system shall display a type badge for it." | **match** | All four rows badged, none blank. `g4/02-desktop-requests-box-default.png`, `g4/03-…-scrolled-bottom.png` |
| 2 | "When a row of an unrecognised type is encountered, the system shall not throw — no badge lookup may return `undefined`." | **cannot-verify** | Not reachable from a browser: `companyRequests.ts` gates the query with `.in("type", COMPANY_REQUEST_TYPES)` and person rows are hard-coded `kind="person"`, so no out-of-union value can arrive on this surface. Covered only by `requestTypeMeta.test.ts`'s cast case. `critic` note 6's `'constructor'` door is likewise unreachable live. |
| 3 | "When the Requests box renders, its title shall read 'Requests'." | **match** | `<h2>` exact text `Requests`, not "Connection requests" — populated `g4/02`, empty `g4/14-empty-state-1440.png` |

#### Prototype differentiators — the things Variant C won on (ADR D4 / D9 / D10 / I-M16)

| # | Spec line | Verdict | Evidence / what differs |
|---|---|---|---|
| 4 | D4 — badge **stacked above** Accept/Decline | **match** | Badge bottom `322` vs Actions top `328` (6px gap) on every row, held at 390 / 640 / 768 / 820 / 1024 / 1280 / 1440. `g4/05-desktop-badge-column-zoom.png` |
| 5 | D4 — "grouped with the **decision** rather than the identity" | **match** | Badge right edge `796` = Accept right edge `796`; badge left `683` sits right of the name column's right edge `624`. It is in the button column, not beside the avatar. |
| 6 | D10 — **every** row badged, person rows included | **match** | Clara Vogt (the `connect_person` row) carries "Person". `g4/03` |
| 7 | `connect` → "Connection" | **match** | `g4/03`, `g4/05` |
| 8 | `connect_message` → "Message" | **match** | `g4/02`, `g4/05` |
| 9 | I-M16 — `pricelist_request` → literal "Pricelist request" | **match** | Top row of `g4/02`, rendered in a browser (not just `renderToStaticMarkup`) |
| 10 | person row → "Person" | **match** | `g4/03` |
| 11 | A distinct icon per kind | **match** | `lucide-receipt-text` / `lucide-link-2` / `lucide-message-square` / `lucide-user`, all rendered at `h-3 w-3`. `g4/05` |
| 12 | A distinct accent per kind | **deviates** | `connect_message` and `person` are **both** `text-info` — two of the four badges are the same blue. Not a spec breach (D4 names no colours), but the colour carries no information for those two; label + icon do all the work. `g4/05` vs the "Person" pill in `g4/03` |

#### States

| # | State | Verdict | Evidence / what differs |
|---|---|---|---|
| 13 | Default | **match** | `g4/02`, page context `g4/01-desktop-1440-page.png` |
| 14 | Hover — Accept, then Decline | **match** | Accept darkens to `brand-deep`, Decline tints; badge and its spacing unaffected. `g4/04-desktop-hover-accept.png`, `g4/12-hover-decline.png` |
| 15 | Filled — all four kinds at once | **match** | Two rows from the same sender (Bavaria) are told apart **only** by the badge — "Pricelist request" vs "Connection". `g4/02` |
| 16 | Error | **match** | Row soft-deleted out from under the client, then Accept clicked: `This request is no longer available.` renders above the list, count falls 4→3, badges intact. `g4/13-error-state.png` |
| 17 | Empty | **match** | "Requests · 0 · No pending requests." — the retitle holds in the empty branch too. `g4/14` |
| 18 | Narrow width | **deviates** | See fit check rows 22-23. |

#### Fit check — the component inside its real container

| # | Constraint | Verdict | Evidence / what differs |
|---|---|---|---|
| 19 | `SectionCard` `fill` → `md:h-[320px]` with internal scroll | **match** | Body `clientHeight 267` / `scrollHeight 341`; scrolls cleanly to the Person row, no clipped badge, no overlapping text. `g4/03` |
| 20 | Row density (`critic` note 8: "roughly 3 rows instead of roughly 4") | **deviates — from the note, not the spec** | Measured with the badges hidden via injected CSS on the same live page: rows go **69px → 82px, i.e. +13px, not ~24px**, and the count of **fully visible rows is 3 either way**. What actually changed is how much of the 4th row peeks above the fold: **60px → 21px**. Baseline shot: `g4/11-baseline-badge-hidden-1440.png`. Nothing looks broken. |
| 21 | No clipping / overflow at desktop widths | **match** | 820 / 1024 / 1280 / 1440: `document.scrollWidth` equals the viewport, card `scrollWidth` equals `clientWidth`, no badge crosses the card edge. `g4/09-fit-1024-page.png`, `g4/10-fit-1024-requests-box.png` |
| 22 | 768px — exactly the `md` breakpoint | **deviates (pre-existing, T04 contributes 0px)** | The duo goes two-column while the shell sidebar is still expanded: card is **231px** wide against a row min-content of **246px**, so `overflow-hidden` cuts the Accept button and the badge labels. **Proven not caused by the badge:** the row's min-content is `246px` *both* with and without the badge, and the right column is `160px` (the Decline+Accept pair) at every width while the widest badge is `113px` — the badge never sets the row's minimum. `g4/06-md-768-requests-box.png` |
| 23 | 390px mobile | **deviates (pre-existing, T04 contributes 0px)** | The shell's sidebar does not collapse; the whole page overflows (`document.scrollWidth 591` vs a 390 viewport) and the Requests card is squeezed to **122px**, clipping name, note, badge and both buttons alike. Same zero-contribution proof as row 22. Below `md` the card is auto-height (395px) and all four rows render with **no** internal scroll — `g4/10-fit-640-requests-box.png` is what the mobile card is *meant* to look like. `g4/07-narrow-390-page.png`, `g4/08-narrow-390-requests-box.png` |

**Two things this walk corrects in the record above.** (a) `critic` note 8's
`~24px` / "4 rows becomes 3" is off — it is `+13px` and "3 rows either way, with
a thinner sliver of the 4th". (b) `critic` note 7 says the badge "never renders
in a browser run" because Alice has no incoming requests; she has three seeded
ones, and with a fourth staged all four badges have now been seen in Chromium.

**Staged, not judged.** No verdict is passed here. Rows 12, 18, 20, 22 and 23
are what G4 exists to put in front of Muskan; rows 22 and 23 in particular are
page-shell behaviour that predates this ticket. **Ruled 2026-09-06:** filed as
[HEL-92](https://linear.app/hellosello/issue/HEL-92) (Codebase Development
Tickets); the accent-colour question (row 12) was ruled the same day —
`connect_message`/`person` stay the same blue, no code change.

---

## T06 · Drop `deliver_deal` and `claim_deal_ticket`, and their tests

Diff: `supabase/migrations/20260907090000_drop_deliver_deal_claim_deal_ticket.sql` (new —
DDL-only, two `DROP FUNCTION IF EXISTS`), `supabase/tests/deliver_deal_test.sql` /
`claim_deal_ticket_test.sql` + their two runners (deleted), `supabase/tests/
send_deal_c2c_announce_test.sql` (edited — C9 removed, three cases `P1`-`P3` ported in from the
deleted `deliver_deal_test.sql`, two stale citations repointed, one of those repointed citations
itself fixed after review).

**Verdict: 1 blocking finding (converged on independently by `/code-review` and `critic`, rung
2 — a planning bug, not a `test-writer` slip: my own citation-fix instruction repointed a
return-value coverage claim to a case that didn't cover it), fixed in one round and
independently re-verified, including a temporary-break-then-restore proof the new assertion is
actually load-bearing. 0 blocking from `security`. 7 + 4 notes across the two reviewers, all
recorded below, none retried.**

### I-M5 checkpoint — status correction

STATE.md's T05 entry (and this ticket's own TICKETS.md text) carried the checkpoint as "still
owed before T06 starts." It was not — the real, both-counts, run-for-real-against-production
checkpoint had already happened 2026-09-07, same day, recorded in
`docs/deploy/cloud-migrations-pending.md`'s "🔴 READ FIRST" section (im5a = 0, im5b = 5,
row-level `updated_at` proof) before this ticket's build began. Re-checked at T06's own start,
confirmed closed, not re-run.

### Round trail

- Pre-flight census (per the ticket's own instruction, run before writing the migration):
  `pg_proc.prosrc` matched on call shape → 0 rows; broad `ILIKE` superset → exactly 3 rows
  (`claim_deal_ticket` itself, `accept_connection_request`, `send_deal` — the latter two
  comment-only, individually read and confirmed). Corrected a stale "4 rows" figure carried by
  ADR I-M7/TICKETS T06 — 3 is what the catalog actually holds today, the 4th (pre-T01
  `confirm_detected_deal`) is already gone.
- `plan-checker` round 1: **OK, 0 blocking, 7 notes** — all held and folded into `PLAN-T06.md`
  before any code was written. Most material: N1, its own "fold in before build" flag — deleting
  `deliver_deal_test.sql` wholesale would have silently orphaned three live-behaviour cells
  covering still-live `send_deal`/`confirm_detected_deal`, nowhere else in the suite. Also held:
  N2 (a wrong leg in the reachability argument — corrected: D3 governs Discover only, the real
  gate on `/connect/inbox` is `lenses.ts`/`InboxDetail.tsx`'s status check), N3 (softened
  "provably unreachable" to name one real PostgREST-insert caveat), N4 (the verification grep
  step's original scope couldn't pass — `supabase/` legitimately carries ~35 comment survivors),
  N5 (two stale citations in the very file this ticket edits), N6 (the call-shape regex has a
  blind spot the ILIKE cross-check closes; the migration header records both). N7 (record EARS-1
  as a named exception at close, don't promote to blocking) — done, see below.
- `test-writer` → ported P1-P3 (double-send guard; person-arm ticket-zero + co-owner-at-send;
  `confirm_detected_deal`'s p2p birth into negotiation), deleted C9, fixed the two citations
  the plan named, following each source cell and this file's own established idioms. Flagged a
  genuine tool gap rather than faking completion: no Bash in its toolset, so it could not delete
  the four dead files or run the runner itself.
- Orchestrator completed the mechanical remainder: deleted the four dead files, ran
  `run_send_deal_c2c_announce_test.sh` — **PASSED**, P1-P3 included, green against the
  still-live (pre-DROP) functions.
- `builder` → wrote the migration, green on first pass, no retry. Independently re-ran the
  pre-flight census, `supabase db reset`, post-DROP census (0 rows), re-ran the suite post-DROP
  (still green), full grep against `src/`/`e2e/` (matches the plan's named survivor list
  exactly). Full SQL suite 62/64 — the 2 failures A/B-proven pre-existing by removing the new
  migration and reproducing identically (HEL-83's promotion-status-gate fixture drift, already on
  record in T01's own STATE.md entry, unrelated to this ticket).
- `test-runner` independent pass (not trusting `builder`'s self-report): `db reset` clean, SQL
  62/64 (same 2, confirmed via grep that neither failing suite even references either dropped
  function), unit 514/514 (0 drift), `tsc` clean, eslint 6/15 (exact baseline match, 0 new),
  post-DROP census 0 rows, `git status` scope check clean.
- `/code-review high` + `critic` + `security`, parallel:
  - **`/code-review` — 1 finding rated a genuine, freshly-introduced defect.** The repointed
    §8.3 citation (`send_deal_c2c_announce_test.sql:32-33,141-143`) claimed case P2 proves
    `send_deal`'s person-arm return value equals the p2p thread id. P2's own banner said the
    opposite ("NOT 3b/3d, already covered by C3"), and neither P2 nor C3 actually captured the
    return value — both called `send_deal` as a bare, result-discarding `SELECT`. My own
    citation-fix instruction in `PLAN-T06.md` was the actual bug; `test-writer` executed it
    faithfully. `/code-review`'s second finding (the `store.ts` gap) restates the plan's own
    named, deliberate exception — not new.
  - `critic` → 0 blocking, 7 notes. **N4 independently found the identical citation defect**
    `/code-review` found — two reviewers converging on the same gap from different angles is why
    it's rated blocking rather than a note. Also: N1 (EARS-1's gap must be named explicitly, not
    omitted — done, see below), N2 (the post-build grep step's stated scope misses
    `supabase/functions/` — re-checked directly by `critic`, 0 matches, conclusion holds), N3
    (the migration's header cites `20260724120800`'s "never deployed apart" precedent without
    carrying its coupling discipline — true, and the reachability argument is what actually
    makes it safe, not the precedent), N5 (two new banners in P1/P3 described `deliver_deal`'s
    no-op-on-co-owner logic as if live, when live `send_deal` stopped calling it entirely as of
    an earlier migration — fixed alongside the blocking finding, see below), N6 (5 other files
    outside T06's own scope carry now-stale citations into the deleted `deliver_deal_test.sql` —
    correctly identified as debt, not scope creep), N7 (the P1-P3 port grew the file beyond
    TICKETS.md's literal "delete the C9 block" text — justified by `plan-checker` N1 and
    recorded in `PLAN-T06.md`/`STATE.md`, but TICKETS.md itself was never amended to say so).
  - `security` → **0 blocking, 4 notes.** Independently re-ran the census with an even wider
    regex than the plan used (also catching the `v_x := public.fn(...)` assignment shape) — still
    0 rows; confirmed no function anywhere writes `pending_inbox_item`, so nothing can mint a new
    `deal_card` ticket ever again. S1-S8 all pass or n/a (no dangling grants, no `pg_policies`
    reference to either function, no cross-company read boundary change — the drop only *removes*
    reads). Found the migration is worth more than "cleanup" (N-2): `claim_deal_ticket` never
    checked its ticket's relationship before granting `deal_member` owner, so pre-drop a company
    colleague excluded from a private deal could in principle forge a self-addressed ticket and
    claim membership — this DROP closes that primitive, a genuine hardening, not merely dead-code
    removal. Also corrected a false claim in the original (now-deleted) `claim_deal_ticket.sql`
    header (N-1): `member_all`/`can_access_workspace` CAN express the claim bootstrap for
    `company_wide` workspaces, contrary to what that file's 2026-07-20 comment said — moot now
    that the file is gone, recorded for the historical record only. N-3 (a cheap post-drop
    `to_regprocedure IS NULL` guard would harden I-J5 further) and N-4 (this migration isn't yet
    in `cloud-migrations-pending.md`, which updates at `/ship`, not build time) — both legitimate
    suggestions, neither acted on here per this project's own rule that notes are recorded, not
    retried.
- `builder` NOT dispatched for the fix — entirely inside `supabase/tests/**`, so per L-035 it
  went to `test-writer`, never `builder`, even though the fix was well-understood and one file.
  `test-writer` captured `send_deal`'s return value in P2's `DO` block, resolved the p2p thread
  id the same way P3 already does, asserted equality (a strictly *stronger* proof than the
  original `deliver_deal_test.sql` A2-3b, which only checked non-null) — and, bundled into the
  same edit since it touched the same cases, fixed `critic`'s N5 (corrected the two banners that
  wrongly attributed the ticket-zero behaviour to `deliver_deal` no-op logic). Flagged the same
  Bash gap as before and asked the orchestrator to run verification.
- Orchestrator verified independently: confirmed the file's `<>` operator was a literal
  character, not an escaping artifact from the notification transcript; ran the suite —
  **PASSED**; then, matching this slug's own established rigor (T05's builder proved its fix the
  same way), **temporarily inverted the new assertion's condition, re-ran, and confirmed it
  fails with the exact expected/got values** (proving the assertion is genuinely load-bearing,
  not a tautology), reverted, re-ran — green again. Full `supabase db reset` + full SQL suite
  sweep afterward: same 2 pre-existing failures, no new ones.
- `tests 0/2` · `blocking-findings 1/2` — one round, well inside budget.

### EARS-1 — named exception, not silently unmet (`plan-checker` N7, `critic` N1)

TICKETS.md's EARS-1 ("no call site for either function shall remain in `src/`, `e2e/` or
`supabase/`") is **not fully met by this ticket alone.**
`src/modules/messaging/supabase/store.ts:580-584` still calls `claim_deal_ticket` via `.rpc()` —
a real call site, not a comment. This is T07's declared scope
(`docs/architecture/adr/0009-retire-connect-inbox.md`; TICKETS.md T07 names the exact range),
and T06/T07 carry no dependency ordering on each other (Ready checkpoint marks them
parallel-safe). `PLAN-T06.md` argues at length why this is safe anyway — not "provably
unreachable" in an absolute sense (`critic`/`plan-checker` both corrected that wording), but
unreachable given (1) T05's backfill flipped every pending `deal_card` row to `accepted` on
production, (2) nothing sanctioned can mint a new one (0 remaining callers of `deliver_deal`,
independently re-confirmed by `security` with a wider regex), (3) the real UI gate is
`lenses.ts`/`InboxDetail.tsx`'s status check, not D3 as originally (wrongly) argued, with (4) one
named, narrow caveat: `inbox_insert`'s `WITH CHECK` has no `type` predicate, so a hand-crafted
PostgREST insert could in principle create a fresh row and reach the still-live "Pick up deal"
button until T07 lands — today that would succeed, after this migration it errors instead
(`PGRST202` in place of the RPC's own domain error), same user-facing outcome either way. T09
depends on both T06 and T07, so this textual gap cannot survive past the e2e wave. Not a carve-out
per PIPELINE §3/`/build` step 10 — the behavior change is named and understood, not undocumented,
matching T05's own precedent for what "no carve-out" means.

### Notes (rung 4-5, not retried)

1. **(critic N1)** EARS-1's `store.ts` gap — see above, named explicitly rather than omitted.
2. **(critic N2)** The plan's post-build grep verification step scoped itself to `src/`/`e2e/`
   only; `supabase/functions/` (edge functions, which can call an RPC as `service_role` and
   bypass the `authenticated`/`anon` revokes `deliver_deal` carried) wasn't explicitly swept.
   `critic` ran it: 0 matches. Conclusion holds; the stated method wasn't exhaustive as written.
3. **(critic N3)** The migration's header cites `20260724120800_drop_propose_edit_rpcs.sql`'s
   "Their app callers die in plan 12-07 (same wave/PR — never deployed apart)" as its shape
   precedent, but doesn't carry that precedent's coupling discipline — T06 and T07 truly can
   deploy apart. The reachability argument (not the citation) is what makes this safe.
4. **(critic N6)** Five other files carry now-stale citations into the deleted
   `deliver_deal_test.sql`: `rls_isolation_test.sql:238` (a coverage pointer that now points at
   nothing — compounds the fixed blocking finding), plus `decline_deal_test.sql:16`,
   `finalize_deal_test.sql:13`, `assert_relationship_writable_test.sql:7,93,225`,
   `announce_deal_event_test.sql:71`, `inbox_insert_receiver_gate_test.sql:30,195,198`,
   `msg_all_deal_detected_gate_test.sql:40,181`, `e2e/deal-p2p-send.spec.ts:23`. Correctly
   outside T06's own declared file list — real debt, not scope creep. Not fixed here.
5. **(critic N7)** The P1-P3 port grew `send_deal_c2c_announce_test.sql` well beyond
   TICKETS.md's literal text ("Also delete the C9 block at …:391-412"). The growth is
   defensible — `plan-checker` N1 asked for it, `PLAN-T06.md` specifies it cell by cell,
   `STATE.md` records it, and it prevents the L-061 class of silent test-count drift — but
   TICKETS.md itself was never amended to say so, and the ADR's own scope-growth rule
   (`0009 §…`, "keep the shipped system correct and buildable") doesn't literally cover
   "prevent silent coverage loss" as a category. Judged acceptable, not smuggled.
6. **(security N-1)** The original (now-deleted) `claim_deal_ticket.sql:10-13` header claimed
   `deal_member`'s RLS "cannot express this bootstrap." `security` proved read-only, as a real
   party non-member, that `member_all`/`can_access_workspace` actually *can* for `company_wide`
   workspaces (the column default). Moot now the file is gone — recorded for the historical
   record.
7. **(security N-2, informational — not a defect, a deploy-value note)** This DROP is worth more
   than dead-code cleanup: `claim_deal_ticket` never checked its ticket's relationship before
   granting `deal_member` owner, so pre-drop a company colleague excluded from a private deal
   could in principle forge a self-addressed `pending_inbox_item` row and claim membership on
   it. The DROP closes that primitive. The forgeable-row half of the chain survives (pre-existing,
   out of this diff's scope — `inbox_insert`'s missing `type` predicate) but its only remaining
   consumer (`accept_connection_request`) allowlists three other types and checks the receiver,
   so nothing chains off it today.
8. **(security N-3)** A cheap post-drop `DO $$ IF to_regprocedure(...) IS NOT NULL THEN RAISE
   EXCEPTION …` guard (this repo's own idiom, `profile_foundation_test.sql:31-33`) would harden
   I-J5 further against a silent `IF EXISTS` no-op on a future signature mismatch. Not added —
   I-J5's stated posture already accepts this residual risk as permanent, and notes aren't
   retried.
9. **(security N-4)** `20260907090000` isn't yet recorded in
   `docs/deploy/cloud-migrations-pending.md` — that ledger updates at `/ship`, not at build time.

---

## T07 · Retire the `/connect/inbox` route and module

Diff: 12 deletions (`src/app/connect/inbox/page.tsx`; `src/modules/connect/{index.ts,types.ts}`;
`src/modules/connect/lib/{inbox-display.ts,lenses.ts,lenses.test.ts}`; six components under
`src/modules/connect/components/`) + 5 edits (`next.config.ts` — redirect added;
`src/modules/connect/lib/requestActionError.ts` — comment only; `src/modules/connect/supabase/
inbox.ts` — heavily trimmed; `src/modules/messaging/supabase/store.ts` — dead branch removed;
`src/types/database.types.ts` — two-line surgical edit).

**Verdict: 0 blocking from `/code-review`, `critic`, or `plan-checker`'s round-1 REVISE (which
had 0 blocking too — its 2 held notes were governing-document contradictions, not defects, both
corrected before any code was written). 7 + 3 + 6 notes across all three reviewers, recorded
below, none retried — matching this project's own rule that notes are recorded, not fixed,
regardless of how trivial the fix would be.**

### Round trail

- Full import-graph traced by hand before planning (every importer of every file on TICKETS.md's
  delete list, read directly) — surfaced two compile-breaking chains TICKETS.md doesn't name:
  `claimItem`/`assignItem` orphaned once `InboxView.tsx` (their only caller) is deleted;
  `dealPreviewOf`/`DealCardEmbed`/`money` orphaned once `getInbox` (their only caller) is
  deleted. Also found, before touching the file: `database.types.ts` is NOT reproducible from
  `supabase gen types` (an undocumented hand-edit on `update_deal_draft`, documented the hard way
  in a prior slug) — planned a targeted two-line manual edit instead of a regeneration.
- `plan-checker` round 1: **REVISE, 0 blocking, 7 notes, two held as governing-document
  contradictions.** N2 — the ADR's own file-list table (`0009:256`) explicitly instructs deleting
  `inbox.ts`'s `acceptItem` `deal_card` branch; the original plan wrongly left it, spot-verified
  and corrected. N1 — **G4 routing corrected from auto-close to mandatory human stop**: this
  ticket deletes 7 `.tsx` files, and PIPELINE §3 routes by the diff ("anything rendered → human
  stop"), not by reachability; this slug's own gate log confirms the line is sharp
  (T01/T02/T03/T05/T06 auto, none touched `.tsx`; T04 stopped because it did). N3 (a wrong
  justification for a right conclusion, corrected), N4/N5 (doc-comment scope + 3 stale-prose
  fixes), N6/N7 (name the real changes instead of asserting "no change"; assign the redirect
  verification an owner) all held and folded into `PLAN-T07.md` before build.
- `test-writer` deleted `lenses.test.ts` (4 tests, confirmed via `vitest run` on the file alone,
  not a grep heuristic) after confirming its content matched the plan. Flagged the same no-Bash
  tool gap as every prior ticket this slug; orchestrator ran the actual deletion.
- `builder` executed the rest, green on first pass. One self-reported deviation, independently
  verified twice (once by the orchestrator reading the result, once by `critic` reconstructing
  the exact byte range): deleted 4 extra comment lines in `store.ts` (`:570-573`, not just the
  named `:574-586`) because they described the `claim_deal_ticket` path and would otherwise sit
  directly above an unrelated comment about `accept_connection_request` — L-045's "documented lie"
  shape. `critic` confirmed this was required, not scope creep, and separately noted `PLAN-T07`
  File 9 simply failed to state the same "range includes its own comment" discipline that
  `plan-checker` N4 had already imposed on File 8.
- Orchestrator independently verified the three EARS criteria (assigned owner per the plan's N7
  fix, not left to the human stop alone): `tsc` clean, unit suite exactly **510/510** (514 − 4,
  precise), and the `/connect/inbox → /discover` redirect live via curl (308 in dev, landing
  correctly on `/discover`'s own auth gate).
- `test-runner` independent full pass: **GREEN.** `tsc` clean, unit 510/510 (68 files, from 69),
  SQL 62/64 (identical 2 pre-existing HEL-83 fixture fails as every prior ticket's baseline),
  eslint 6/15 exact baseline match in the same 4 untouched files, redirect re-confirmed
  independently on a separate port. Found a wider-than-instructed (but harmless) set of
  comment-only stale references in files T07 correctly left alone — all either pre-existing or
  already named as T09's declared scope in TICKETS.md.
- `/code-review high` + `critic`, parallel (no `security` — no migration/RLS/RPC/auth/
  server-action/cross-company-read surface in this diff):
  - `/code-review` → 0 blocking, 3 findings, all comment/plumbing accuracy issues, none
    functional (tests green either way). See Notes 1-3 below.
  - `critic` → 0 blocking, 6 notes. Verified all three EARS criteria hold on intent, not just the
    letter (`InboxItemView`'s deletion, `AcceptRequestType` cast, etc.); confirmed the ADR's
    "Not touched, deliberately" fence (`connect_person`, `send_deal`,
    `accept_connection_request`'s body) is intact; independently reconstructed the `store.ts`
    deviation's exact byte range rather than trusting the report; independently re-verified the
    `adr/0009:256` citation and the G4-routing correction, both hold. See Notes 4-9 below.

### EARS-1 named-exception carryover — none this round

Unlike T06, T07 carries no EARS gap of its own — its three criteria are fully met (redirect
live, `tsc` clean, count exact). The one still-open exception from T06 (`store.ts:580-584`
calling `claim_deal_ticket`) is **now closed** — T07 deleted that exact call site (File 9). T06's
`REVIEW.md` entry above should be read with that in mind: the gap it named as "closed by T07" is
now, in fact, closed, in this same working tree.

### Notes (rung 4-5, not retried)

1. **(`/code-review`)** `send_deal_c2c_announce_test.sql`'s P2 banner (this file was edited by
   T06's own blocking-finding fix, not by T07 — surfaced here because T07's review round is what
   read it) still opens "NOT 3b/3d, already covered by this file's own C3," directly contradicted
   by the same banner's own later sentence ("ALSO asserts send_deal's return value…") and by the
   file header three sections above. A residual self-contradiction from the T06 fix — the new
   text was added correctly, but the old exclusion clause was never updated to match. No
   functional gap (P2's assertions are correct and passing); the risk is exactly what
   `docs/agents/LEARNINGS.md` L-070 (written this session, during T06's own fix) warns about — a
   future editor trusting the stale half of the banner could delete the now-real assertion as
   "redundant," reintroducing the gap L-070 just closed. Not fixed here, per this project's own
   rule that notes are recorded, not retried — flagged prominently given the direct L-070 echo.
2. **(`/code-review`)** T06's migration header (`20260907090000_…sql:41`) states `store.ts:580-
   584 still calls claim_deal_ticket … removed by T07, not this ticket` — true when T06 was
   written, false now that T07's diff (same uncommitted working tree) already removed that call
   site. A stale forward-reference between two tickets in the same session. Not fixed here.
3. **(`/code-review`)** `acceptItem` still passes `dealCardId: item.deal_card_id` into
   `acceptInbox()`, which no longer reads `AcceptInput.dealCardId` anywhere (File 9 deleted the
   one branch that did). Harmless dead plumbing — a direct, already-documented consequence of
   `PLAN-T07.md`'s own deliberate decision to leave `messaging/types.ts` untouched (File 9's "Not
   in scope" section). Converges with `critic`'s N4 below.
4. **(`critic` N1, rung 5)** `requestActionError.ts`'s comment-only edit technically falls inside
   ADR §3's Reused fence, which marks this file **"Untouched."** `critic`'s own brief would
   promote any fence line to blocking; it resolved this in favour of the severity ladder instead
   (rung 5, no leak/no silent failure/nothing that won't run) and flagged the tension explicitly
   rather than silently picking one rule. The edit itself is `plan-checker` N5's fix (killing a
   now-false "two surfaces" sentence) — the function body and its test are both unchanged.
5. **(`critic` N2, rung 5)** The ADR contradicts itself: §3 says `acceptItem`/`declineItem`'s
   "behavior does not [change]" (only the return type does, per D11); §4 explicitly instructs
   deleting the `deal_card` branch, which **is** a behavior change for that (unreachable) case.
   `builder` correctly followed §4. Recording that §3's row is now inaccurate, for whoever next
   reads the ADR as ground truth.
6. **(`critic` N3, rung 5)** TICKETS.md/ADR both say `database.types.ts` "must be regenerated";
   this ticket does a targeted two-line edit instead (well-reasoned, `update_deal_draft`'s
   hand-edit confirmed intact) — but nobody has confirmed there's no *other* drift between the
   file and the live schema. One instance already visible, pre-existing and unrelated to T07:
   `accept_connection_request`'s generated `Returns` type reads `Record<string, unknown>`, while
   `store.ts:589-591` (a comment this ticket's own File 9 edit sits near, but does not touch)
   still asserts *"The generated type still says `Returns: string`… until types regenerate."*
   Neither claim is true today. Not this ticket's file to fix (the comment isn't in File 9's
   named range) — flagged for whichever ticket eventually does the full regeneration.
7. **(`critic` N4, rung 5) — ⚠️ needs Muskan's ruling, no owner left in this slug.**
   `messaging/types.ts:327-331`'s `dealCardId` docblock still describes claiming a deal "via
   `claim_deal_ticket`" — a function T06 dropped from the database — and still cites
   `InboxItemView`, a type T07 deletes. `PLAN-T07.md`'s own justification for leaving this alone
   was "the same class of decision as T06 leaving `database.types.ts`'s two stale RPC entries for
   a later ticket" — but T07's own File 11 clears exactly those two entries in this same diff,
   so the analogy that licensed the deferral no longer has a future ticket to land on: T08/T09
   don't touch `messaging/`, and the slug ends at T09. **This residue currently has no home.**
   Options: fold a one-line fix into T09 (nearby, already touching accept-adjacent surfaces), or
   file it directly (this slug's own precedent — HEL-89/90/91 — files engineering findings with
   no doc home straight to Linear team "Codebase Development Tickets", not `/track-doubt`). Not
   filed automatically here per this project's "writes preview first" rule — surfaced for a
   decision at this ticket's G4 stop.
8. **(`critic` N5, rung 4)** Between T07 landing and T09 landing, `acceptItem`/`declineItem`'s
   accept-write path has **zero behavioural test coverage** beyond `tsc`. The one unit test that
   touches their caller explicitly disclaims them (`RequestsSection.test.tsx:5-6`, "needs a
   browser — flagged as owed"), and the one e2e spec that did exercise them
   (`e2e/inbox-accept.spec.ts`) drives the now-deleted `/connect/inbox` page and is dead until
   T09 lands. Sequencing is TICKETS.md's own call (T09 explicitly depends on T06 **and** T07) —
   not a defect, but the first thing to walk for real once T09 closes, and worth naming at G5.
9. **(`critic` N6, rung 5)** One more detail for the G4 staging beyond what the plan already
   named: `surfaces.ts:55`'s "Connection Request" nav entry is a **child of the Connect
   sidebar accordion** — clicking it now leaves the Connect surface entirely and lands on
   Discover, whose rail highlight then doesn't match what the user clicked. Cosmetic, temporary,
   T08's to remove. Separately, out of every ticket's authority: `prototypes/inbox-prototype/
   NOTES.md:54` still says "LOCKED: Variant A" for a page that no longer exists.

### G4 staging (`visual-verifier`)

**Ruled 2026-09-07: Muskan reviewed and passed** ("looks fine") — **the `g4/t07-*.png` files
cited below were deleted afterward, per her explicit instruction.** The table and its prose stand
as the record of what was staged and confirmed; the citations are historical, not live links.

**⚠️ No prototype to compare against.** T07 deletes a route and its whole UI module; nothing new
renders. Every row is staged against TICKETS.md T07's EARS lines and `PLAN-T07.md`'s "What
actually needs staging at G4" — "verdict" here means "behaves as staged," not "matches a locked
screen." Reached via a fresh `supabase db reset`, `next dev`, signed in as seeded
`alice@greenleaf.test` (same door T04's staging used).

#### Acceptance criteria (TICKETS.md T07 EARS)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Navigate to `/connect/inbox` → redirect to `/discover` | **confirmed** | Signed in: final URL `/discover`, fully rendered. Chain `308 /connect/inbox → 200 /discover`. `g4/t07-01-inbox-redirect-lands-discover-1440.png` |
| 1a | …signed out | **confirmed** | `308 /connect/inbox → 307 /discover → 200 /login` — the redirect fires before the auth gate, so the retired path never 404s. `g4/t07-02-signedout-inbox-lands-login.png` |
| 1b | …in a production build | **confirmed** | `next build` clean; `.next/routes-manifest.json` carries the redirect; live `next start` returned the same 308. |
| 1c | …at 390px | **confirmed** | Same 308 → `/discover`. `g4/t07-16-inbox-redirect-390.png` |
| 2 | `tsc` zero errors | not a visual criterion | `test-runner`'s independent pass, above. |
| 3 | Unit total 514 → 510 | not a visual criterion | Same. |

#### The temporary dead-end — T07 ships ahead of T08

| # | Entry point | Verdict | Evidence |
|---|---|---|---|
| 4 | Sidebar "Connection Request" (`surfaces.ts:55`) | **confirmed — dead-end** | Click → `308 /connect/inbox → 200 /discover`. `g4/t07-06` (before) → `g4/t07-08` (after) |
| 5 | ⚠️ **Worse than `critic`'s prediction of a mere highlight mismatch.** | **confirmed** | Before: `aria-current="Chat"`, Connect `aria-expanded=true`. After clicking Connection Request: `aria-current="Discover"`, Connect `aria-expanded=**false**` — **the accordion collapses shut and the clicked item disappears from the rail** (`IconRail.tsx:194`). Pair: `g4/t07-06` vs `g4/t07-07` |
| 6 | Discover list CTA (`CompaniesSection.tsx:100`) | **confirmed — dead-end** | 2 live "Wants to connect" pills (Bavaria, NordCanna) in seed data, both → 308 → `/discover` (the page already open). `g4/t07-09b`, `g4/t07-10` |
| 7 | Company-page CTA (`ConnectActions.tsx:44`) | **confirmed — dead-end** | *"Bavaria Medical Cannabis GmbH wants to connect — open inbox →"* → 308 → `/discover`. Copy still promises an inbox. `g4/t07-11`, `g4/t07-11b`, `g4/t07-12` |

#### Still-live surface — `/discover` and the Requests box

| # | What | Verdict | Evidence |
|---|---|---|---|
| 8 | `/discover` renders normally post-deletion | **confirmed** | Full page, all sections, **0 console/page errors** across the whole run. `g4/t07-03` |
| 9 | Requests box after the return-type trim | **confirmed** | "Requests", count 3, 3 Accept + 3 Decline buttons, badges `["Message","Connection","Person"]`. `g4/t07-04` |
| 10 | Hover — Accept | **confirmed** | Darkens correctly, layout unaffected. `g4/t07-05` |
| 11 | The accept **write** itself | **not exercised** | Irreversible control — not clicked without a go-ahead. Code path read instead: `RequestsSection.tsx:120-121` already discards the return and hides the row locally, matching D11. Same gap `critic` note 8 already named (zero behavioural cover until T09) — stays open. |
| 12 | `pricelist_request` badge | **cannot-verify** | Not in seed; T04's staging hand-inserted a row for this, not repeated here. 3 of 4 kinds were visible. |

#### Fit check

| # | Width | Verdict | Evidence |
|---|---|---|---|
| 13 | 1440 / 1024 | **confirmed** | No clipping. `g4/t07-13` |
| 14 | 768 | **pre-existing (HEL-92), T07 contributes nothing** | Identical to T04's row 22. `g4/t07-14` |
| 15 | 390 | **pre-existing (HEL-92), T07 contributes nothing** | Identical to T04's row 23. `g4/t07-15` |

#### Surfaced by this walk, not previously recorded

16. `next.config.ts`'s own header comment says `permanent: true = 301`; Next actually emits
    **308** in both dev and the built manifest — pre-existing (written for the SET-01 pair), but
    now sits directly above T07's new line. One-line comment fix, no code change, not made here.
17. The signed-out redirect chain drops deep-link intent (`/login` carries no `next=` param) —
    pre-existing gate behaviour, not a T07 regression (a bare signed-out request to `/discover`
    does the same).
18. Sidebar label truncates to "Connection Req…" in the 200px rail — pre-existing, moot once T08
    deletes the entry.
19. `/discover/[companyId]`'s private-catalogue copy renders "…GmbHhasn't published…" (missing
    space) — unrelated to T07, no owner.

**Staged, not judged.** Rows 4-7 (the dead-end), row 5 especially (the accordion closes on the
item you clicked), row 11 (the accept write path's coverage gap), and note 16 are what G4 exists
to put in front of Muskan. Rows 14-15 are the already-filed HEL-92.

---

## T08 · Remove the nav entry and both Discover CTAs

Diff: 3 edits — `src/shared/ui/surfaces.ts` (nav entry + unused icon import removed),
`src/app/discover/[companyId]/ConnectActions.tsx` (link → non-interactive `div`),
`src/app/discover/sections/CompaniesSection.tsx` (link → non-interactive `span`, arrow kept).

**Verdict: 0 blocking from `plan-checker`'s round-1 REVISE (6 notes, all held and folded into
`PLAN-T08.md` before build), `/code-review`, and `critic`.** `/code-review` reviewed the full
working-tree diff (T06+T07+T08 together — no upstream commit boundary to isolate T08 alone) and
found only 2 re-discoveries of already-open T07 findings (the T06 migration's stale
forward-reference; `messaging/types.ts`'s residue — same item as T07's Note 4/`critic` N4, now
independently confirmed a third time). `critic` found 5 notes, all rung 4-5.

### Round trail

- Read all 3 files + `DECISIONS.md` + the PRD's AC5 before planning — surfaced a real,
  TICKETS.md-silent judgment call: the "incoming" connection-state branch in both CTA files is a
  full UI branch (copy + icon + link), not a bare href, and a blind deletion would make an
  "incoming" company fall through to a "send a new request" form.
- `plan-checker` round 1: **REVISE, 0 blocking, 6 notes.** N1 (held) — the locked prototype
  already renders this state as a non-interactive pill that keeps the arrow icon; the original
  draft had dropped it. N2 (held) — a wrong sibling-branch citation in the plan's own reasoning,
  corrected (the code was already right). N3 (held, real) — `ConnectActions` has a second mount
  point (`BuyerShopView.tsx`'s `LockedCatalogue` slot) this plan hadn't traced, where the
  de-interactivation leaves a whole panel's call-to-action dead with no path forward from a
  company's detail page. N4 (held) — added a "Behavior changes" section naming this and two other
  real changes. N5 (held) — the verification grep was scoped too narrowly to catch `surfaces.ts`.
  N6 (2 more stale comments outside T08's 3 files) — recorded as follow-up debt, not fixed,
  matches TICKETS.md's own file fence. All folded into `PLAN-T08.md` before any code was written.
- `builder` executed green on first pass, verbatim per the corrected plan — including keeping
  the arrow in `CompaniesSection.tsx` (confirmed by direct diff read, not just trusted).
- Orchestrator + `test-runner` independent passes: both **GREEN.** `tsc` clean, unit 510/510
  unchanged, SQL 62/64 (same 2 pre-existing fails), eslint 6/15 exact baseline match, `connect/
  inbox` grep 0 hits in `src/` (survivors: the redirect + 3 e2e specs, T09's scope).
- `/code-review high` + `critic`, parallel (no `security` — no migration/RLS/RPC/auth surface):
  0 blocking from both. See notes below.

### Notes (rung 4-5, not retried)

1. **(`critic` N1, rung 5) — the plan overstated the prototype's authority; not fixed, recorded
   for accuracy.** `plan-checker`'s original correction cited the locked prototype as *mandating*
   the arrow. `critic` read `NOTES.md`'s actual "locked" bullet list directly: the connect-CTA
   element type isn't among the four rules it locks, and `NOTES.md:43` files this pattern under
   "Reusable components to mirror" — the prototype mirrored the app, not the reverse. A **sibling**
   prototype (`discover-redesign-prototype/index.html:127`) renders the same state as an
   interactive anchor. The shipped code (arrow kept) is still defensible — just not spec-mandated
   the way the plan claimed.
2. **(`critic` N2, rung 5) — ⚠️ a real, unintentional same-page inconsistency, surfaced by a
   wrong citation in my own plan.** The plan's "independent corroboration" for keeping the arrow
   cited `NewPeopleSection.tsx:64-69` as shipping "the identical pattern... with its arrow." Read
   directly: that file's actual pill has **no arrow**. Net effect, on the live page: Discover's
   company row pill (`CompaniesSection.tsx`) now carries an arrow; its person-row sibling
   (`NewPeopleSection.tsx`) doesn't — same copy ("Wants to connect"), same tint, same
   non-interactivity, two different shapes, on one screen. Not fixed here (this project's rule:
   notes are recorded, not retried, especially after a design choice already went through one
   correction round) — flagged prominently for a ruling: drop the arrow to match the person
   pill's real precedent, or accept the inconsistency.
3. **(`critic` N3, rung 4, `plan-checker` N3) — the `BuyerShopView` affordance loss, independently
   re-confirmed, plus a third option worth considering.** `ConnectActions` mounts twice in
   `BuyerShopView.tsx` (`:66`, `:79` — `critic` found the loss applies to BOTH mount points, not
   only the locked one as the plan's write-up implied). The locked-catalogue slot's documented
   purpose (`:92-110`, from a prior slug's own AC4) is carrying a call-to-action beside the
   sentence that asks for one; post-T08 it renders an inert box instead. Not blocking — nothing
   leaks or silently fails, the element is visibly inert, and the user is one back-navigation from
   a working Accept in `RequestsSection`. **A third option the plan didn't weigh:** rather than
   fully de-interactivating `ConnectActions`' branch, keep it a `Link` retargeted to `/discover` —
   reproduces exactly what T07's own redirect already does today, adds no new affordance, invents
   no design, and satisfies AC5's literal wording. Muskan's call, not a defect either way.
4. **(`critic` N4, rung 5)** EARS-2's "no link to `/connect/inbox`" is currently proven by a
   one-time grep, not a standing test. A 4-line addition to the existing
   `CompaniesSection.test.tsx` (a `connectionState: 'incoming'` fixture asserting the rendered
   HTML never contains `/connect/inbox`) would convert it into a regression guard. Not added —
   TICKETS.md names no test file for this ticket and the live G4 walk + grep are the plan's
   declared verification method.
5. **(`critic` N5, `plan-checker` N6, rung 5)** The two stale comments outside T08's 3 declared
   files (`IconRail.tsx:27`, `connect/layout.tsx:8`, the latter already stale from T07 too) —
   `critic` agrees leaving them was correct given the file fence, with one addition:
   `IconRail.tsx:27` sits closest to the code T08 changed and is the most likely to be found by a
   future `grep "Connection Request"` sanity-check, landing exactly on the stale comment first.
   Worth a small follow-up ticket for the T07+T08 shared debt, not a rebuke of this diff.
6. **(`/code-review`, re-discovery, already open)** The T06 migration's stale forward-reference
   comment and `messaging/types.ts`'s residue — both already recorded in T07's REVIEW.md section
   (Notes 2 and 7/`critic` N4) — independently re-found by `/code-review` reading the full working
   tree for T08's round. Third independent reviewer to flag the `messaging/types.ts` item; the
   "needs Muskan's ruling, no owner left in this slug" status from T07 stands unchanged.

### G4 staging (`visual-verifier`)

**⚠️ No prototype to diff against.** T08 removes a nav entry and de-interactivates two CTAs;
nothing new is designed. Every row is staged against TICKETS.md T08's EARS lines and
`PLAN-T08.md`'s "Behavior changes" section — **"confirmed" means "behaves as staged," not
"matches a locked screen."** Reached via a fresh `supabase db reset` (LOCAL stack,
`.env.local` → `127.0.0.1:54321`), `next dev` on `:3000`, driven as seeded
`alice@greenleaf.test` / GreenLeaf Cultivation (same door T04 and T07 used; session minted
against local GoTrue rather than typed into the login form). Chromium, `deviceScaleFactor: 2`.

#### 1 · The sidebar nav entry is gone (EARS-1)

| # | State | Verdict | Evidence |
|---|---|---|---|
| 1 | Connect accordion, expanded | **confirmed — exactly 2 children** | Clicked the Connect parent: `aria-expanded` `false` → `true`; children render as **Chat** (`/connect/chat`, live) + **Relationship** (`state:"soon"`, greyed, non-clickable). No third entry. `g4/t08-01-sidebar-connect-accordion-open-1440.png`, `g4/t08-02-sidebar-accordion-zoom.png` |
| 2 | The string "Connection Request" | **confirmed — absent** | `/Connection Request/i.test(document.body.innerText)` → `false` on `/discover` and on `/discover/[companyId]`. |
| 3 | Any `href` to the retired route | **confirmed — none** | `document.querySelectorAll('[href*="/connect/inbox"]').length` → **0** on both pages. |
| 4 | EARS-2's grep, re-run live | **confirmed — 0 hits** | `grep -rn "connect/inbox" src/` returns nothing. Survivors are exactly the two the plan predicted: `next.config.ts:24` (the intentional T07 redirect, outside `src/`) and 3 e2e specs (`inbox-accept`, `deal-c2c-create`, `deal-lands-in-c2c-chat` — T09's scope). |

#### 2 · `ConnectActions.tsx` — the company-detail CTA

Two seeded companies sit `incoming` toward GreenLeaf: **Bavaria Medical Cannabis GmbH**
(`pending_inbox_item.type = connect`) and **NordCanna Distribution GmbH** (`connect_message`).
Both were walked.

| # | State | Verdict | Evidence |
|---|---|---|---|
| 5 | Default — Bavaria's detail page | **confirmed — non-interactive** | Renders `<div>`, `href` **null**, `cursor: auto`, `closest('a')` **false**. Copy reads *"Bavaria Medical Cannabis GmbH wants to connect"* — the `— open inbox →` tail is gone. Class list is the plan's, verbatim. `g4/t08-08-company-detail-bavaria-full-1440.png`, `g4/t08-09-company-detail-bavaria-cta-zoom.png` |
| 6 | Hover | **confirmed — inert** | Mouse moved to the element's centre; `:hover` **did** match (so the pointer was on it), yet `background-color` was byte-identical before/after (`oklab(0.854862 0.090336 -0.0118939 / 0.6)`) and `cursor` stayed `auto`. The old `hover:bg-brand-soft` is gone. `g4/t08-10-company-detail-bavaria-cta-hovered.png` |
| 7 | Second instance — NordCanna | **confirmed** | Same shape: `<div>`, no `href`, `cursor: auto`, *"NordCanna Distribution GmbH wants to connect"*. `g4/t08-12-company-detail-nordcanna-cta.png` |

#### 2b · ⚠️ `BuyerShopView.tsx`'s locked-catalogue variant — found live, and it is the panel `critic` N3 described

| # | State | Verdict | Evidence |
|---|---|---|---|
| 8 | The locked-catalogue call-to-action | **confirmed — the whole panel's CTA is now inert** | Bavaria has **0 products**, so `catalogueLocked` is true and the CTA renders in `LockedCatalogue`'s `connectAction` slot. The screenshot shows the panel entire: *"This catalogue is private"* → *"…Connect with them to see the products they keep off their public shop."* → and, beside it, an inert pink box. **The sentence asks the reader to connect; the control next to it no longer does anything.** `g4/t08-11-bavaria-locked-catalogue-panel.png` |
| 9 | The *other* mount point (`BuyerShopView.tsx:66`, the unlocked shop header) | **cannot-verify — not reachable in seed** | `BuyerShopView.tsx:64` gates it on `!catalogueLocked`, so **exactly one `ConnectActions` mounts at a time** — the two are mutually exclusive, not both live as `critic` N3's "applies to BOTH mount points" reads. Both seeded `incoming` companies have 0 products, so only the locked branch is observable here. The code path is identical either way; only its container differs. |

#### 3 · `CompaniesSection.tsx` — the Discover list pill

| # | State | Verdict | Evidence |
|---|---|---|---|
| 10 | Default — 2 rows | **confirmed — `<span>`, arrow kept** | Both pills: tag `SPAN`, `href` **null**, `role` **null**, `cursor: auto`, `closest('a')`/`closest('button')` **false**, **1 `<svg>`** (the `ArrowRight`). Copy *"Wants to connect →"*. Class list matches the plan verbatim. `g4/t08-04-companies-section-1440.png`, `g4/t08-05-companies-pill-bavaria-zoom.png` |
| 11 | Hover | **confirmed — inert** | Same test as row 6: `:hover` matched, background and cursor unchanged. `g4/t08-06-companies-pill-hovered.png` |

#### 4 · ⚠️ The `NewPeopleSection` arrow inconsistency (`critic` N2) — staged for a ruling

**The code-level fact holds** (`CompaniesSection.tsx` pill has an arrow; `NewPeopleSection.tsx:64-69`
has none). **What the live walk adds is that it has no visual manifestation, because the person
branch never renders.**

| # | State | Verdict | Evidence |
|---|---|---|---|
| 12 | Side-by-side person pill vs company pill | **cannot-verify — structurally unreachable, not a seed gap** | `NewPeopleSection.tsx:127-132` filters `p.connectionState !== "incoming"` **before** rendering any card, and its own test asserts exactly this (`NewPeopleSection.test.tsx:29`, *"hides connected + incoming-request people"*). Its only consumer is `DiscoverShell.tsx:60`. So the `incoming` branch at `:64-69` cannot render from this section at all. Live: **0** person "Wants to connect" pills on the page. |
| 13 | …and the seed *does* have an incoming person | **confirmed — it lands elsewhere** | Clara Vogt / Rheinland Apotheke (`pending_inbox_item.type = connect_person`) renders in the **Requests** box as a `Person`-badged row with Accept/Decline — not as a pill. `g4/t08-03-discover-top-1440.png` |
| 14 | The nearest thing to a side-by-side | **staged** | Both sections in one 1440 viewport: "People you may know" (one card, a `+ Connect` **button**) directly above "Companies" (two `Wants to connect →` pills). `g4/t08-07-people-and-companies-same-view-1440.png` |
| 15 | Consistency *within* the touched section | **confirmed — all 3 pills carry an icon** | `CompaniesSection`'s own three states render `Wants to connect →`, `Wants to connect →`, `✓ Connected` — 1 `<svg>` each. Inside its own list the arrow is the consistent choice; the mismatch `critic` named is with a sibling section whose pill does not render. Same screenshot as row 14. |

#### 5 · Nothing else on `/discover` broke

| # | State | Verdict | Evidence |
|---|---|---|---|
| 16 | Console / page / network errors | **confirmed — 0** | Across every run in this walk: `/discover`, both company detail pages, at 1440 / 1024 / 768 / 390. **0 console errors, 0 warnings, 0 `pageerror`, 0 failed requests.** |
| 17 | General "does it look normal" pass | **confirmed** | Requests box (3 rows, badges `Message` / `Connection` / `Person`, Accept + Decline live), My network (David Berg; Rheinland, StonePharm), People you may know (Eva Klein), Companies (3, filters + search). `g4/t08-03-discover-top-1440.png`, `g4/t08-03b-discover-bottom-1440.png` |
| 18 | Company detail page renders whole | **confirmed** | Banner, Verified pill, three info cards, locked-catalogue panel, Back to Discover. `g4/t08-08-company-detail-bavaria-full-1440.png` |

#### 6 · Fit check — the component inside its real container

| # | Width | Verdict | Evidence |
|---|---|---|---|
| 19 | 1440 | **confirmed** | Both CTAs sit in their containers with room to spare. Rows 5, 10. |
| 20 | 1024 | **confirmed** | List pill `170×36`, no row overflow, not clipped. Detail CTA `320×64`, `overflowsParent: false`, in viewport. `g4/t08-14-fit-1024-companies-section.png`, `g4/t08-15-fit-1024-detail-cta.png` |
| 21 | 768 | **confirmed for the CTAs** | Pill `170×36`, arrow intact, no overflow. Detail CTA `320×64`, fits. Company **names** truncate (`Bava…`, `Nord…`) — pre-existing row-grid behaviour, not T08's element. `g4/t08-14-fit-768-companies-section.png`, `g4/t08-15-fit-768-detail-cta.png` |
| 22 | 390 — the pill | **deviates — but pre-existing, and proven so by control** | Pill's right edge lands at **462px** against a **390px** viewport and a **343px** row: off-screen. **Control run, same viewport:** the untouched `Connected` pill (Rheinland — a branch T08 never touched) clips **worse**, right edge **483px**. So the cause is the page-level container, not the `<a>`→`<span>` swap; same class as the already-filed **HEL-92**. `g4/t08-16-fit-390-companies-clipping.png`, `g4/t08-14-fit-390-companies-section.png` |
| 23 | 390 — the detail CTA | **deviates — same pre-existing cause** | The rail never collapses, leaving a ~104px content column; the CTA becomes `104×144` and wraps *"Bavaria Medical Cannabis GmbH wants to connect"* over six lines. It stays inside its parent (`overflowsParent: false`) — the parent is what has collapsed. `g4/t08-15-fit-390-detail-cta.png`, `g4/t08-17-fit-390-detail-cta-page.png`, `g4/t08-13-fit-390-discover.png` |

#### Surfaced by this walk, not previously recorded

24. **`critic` N3's "BOTH mount points" is not observable as a pair** — see row 9. The two
    `ConnectActions` mounts in `BuyerShopView.tsx` are mutually exclusive (`!catalogueLocked`
    vs `emptyState`), so at most one is ever dead at a time. It does not soften the finding;
    it narrows it.
25. **`critic` N2's inconsistency is real in the source and invisible on the screen** — see rows
    12-15. Whatever Muskan rules, the ruling is about code consistency, not about something a
    user can currently see. Worth knowing before spending a change on it.
26. `IconRail.tsx:27`'s stale comment (*"its children (Chat / Connection Request /
    Relationship)"*) confirmed still present in the source T08 renders through — the exact
    Note 5 debt, now with a live rail beside it showing two children.
27. `/discover/[companyId]`'s *"GmbHhasn't published"* missing space is visible in every
    locked-catalogue screenshot here. Already T07's note 19; still unowned.
28. A dev-only `agentation` overlay (a `devDependency`) mounts a floating button bottom-right in
    `next dev`. Suppressed in most shots; it survives in `g4/t08-16` and `g4/t08-17`. Not app UI.

**Staged, not judged.** What G4 exists to put in front of Muskan here: **row 8** (the
locked-catalogue panel now asks for an action it cannot offer — `plan-checker` N3 / `critic` N3,
now rendered rather than reasoned about, with `critic`'s third option of a `Link` retargeted to
`/discover` still on the table), **rows 12-15** (the arrow inconsistency is real in code and
absent from the screen), and **rows 22-23** (390px breaks, but the control proves T08 did not
cause it). Rows 1-4, 5-7, 10-11 and 16-18 are the ticket doing what it said it would.

---

## T09 · Update the e2e specs

Diff: 5 files, all under `e2e/` — `deal-lands-in-c2c-chat.spec.ts`, `deal-c2c-create.spec.ts`,
`fixtures/two-company.ts`, `discover-shop.spec.ts` (widened into per Muskan's explicit ruling,
not in TICKETS.md's original list), `inbox-accept.spec.ts` (the substantial rewrite). No `src/`
file touched. Last ticket in the slug's original nine.

**Verdict: 0 blocking from `/code-review` or `critic`. Two `plan-checker` rounds before any code
was written (round 1: 3 blocking, 5 notes; round 2: 1 blocking, 6 notes — the most of any ticket
this slug), all held and folded in — this ticket needed by far the heaviest planning scrutiny,
proportional to how far its real shape diverged from TICKETS.md's terse description.**

### Round trail

- Traced all three TICKETS.md-declared files by hand and found a problem TICKETS.md doesn't
  name: `inbox-accept.spec.ts`'s second test wasn't just navigating to a deleted page — its whole
  premise (an accept flow for an already-connected buyer's pricing ask) was obsoleted by **T02**,
  an earlier, already-closed ticket in this same slug, independent of T06/T07. Verified directly
  against `src/app/discover/actions.ts`'s `requestProductPricing` and the live RPC it calls:
  connected-company pricing requests create zero `pending_inbox_item` rows now, "there is nothing
  left to accept."
- Found the identical T02-caused break a second time, in `e2e/discover-shop.spec.ts` — a file
  TICKETS.md never names, previously flagged by T02's own G4 gate log as an open gap ("widen T09
  or open a sibling ticket") and left unresolved since 2026-09-04. **Put to Muskan directly rather
  than resolved unilaterally — ruled: widen T09 to include it.**
- Plan written: `PLAN-T09.md`. `plan-checker` round 1: **REVISE, 3 blocking, 5 notes.** B1 (rung
  2) — the first-drafted rewrite of `inbox-accept.spec.ts`'s Test 2 was vacuous: the RPC's dedup
  guard is permanent, and `discover-shop.spec.ts` runs before `inbox-accept.spec.ts` in
  Playwright's single-worker path-ordered execution and already fires the identical ask, so the
  message would pre-exist and the new assertions would pass on someone else's write. Required two
  new fixture helpers (`resetPricingRequestMessage`, `countPricingRequestMessages`). B2 (rung 3)
  — T09's own EARS ("every spec shall pass") is literally unsatisfiable without the widening
  above; this is where the ruling was obtained. B3 (rung 3) — a dangling import left behind after
  an export deletion. N1 (rung 4, most material note) — wrongly dropped two assertions that
  `docs/architecture/adr/0006-deal-draft-lands-in-chat.md:381` names as the *only* test coverage
  anywhere for a live invariant (a second c2c thread / a duplicate "now connected" line); restored.
  All held, folded in.
- `plan-checker` round 2 (dispatched given round 1's severity — verifying the fix didn't
  introduce a new problem): **REVISE, 1 blocking, 6 notes.** Round 1's fixes all independently
  re-verified correct. New blocking finding, same class as B3: the plan called for asserting
  `buildPricingRequestNote(...)`'s output, but that function lives in `src/` and no e2e spec has
  ever imported across the `e2e/`↔`src/` boundary — fixed by using the already-verified literal
  string directly. 6 notes (most material: had to state explicitly that the restored assertions
  compare against snapshots captured *before* the ask, not re-derived after, or the guard becomes
  tautological) all held and folded in. Orchestrator then did an independent full read-through to
  confirm no further dangling forward-references — the exact mistake round 2's blocking finding
  was. No round 3 dispatched.
- `test-writer` executed all 5 files green on first pass, verbatim per the twice-corrected plan.
  Two reasonable judgment calls on prose the plan gave intent for but not verbatim text (a test
  title, several header-comment rewrites), both spot-checked directly by the orchestrator and
  confirmed faithful.
- Orchestrator: `tsc` clean; `countPersonRequestsForAlice` confirmed fully removed (export +
  import). **Ran the four actually-touched spec files against the live local stack — 21/21
  PASS**, including the two highest-risk tests, before handing off for independent verification.
- `test-runner` independent full pass: **GREEN.** `tsc`/unit/SQL/eslint all clean or at exact
  baseline. **Ran the full 154-test e2e suite** (not just the touched files) for broader
  regression — all 21 of T09's own tests pass even inside the full run; 21 total suite failures,
  all A/B-proven pre-existing against `main`, none tracing to T09. Surfaced a genuinely new
  finding in passing: 7 of those 21 are a previously-uncatalogued pre-existing class
  (`present-edit-model.spec.ts`/`present-info.spec.ts`, unrelated to 0027 entirely) — the
  standing "15 GoTrue-class failures" baseline this slug has cited repeatedly undercounts; actual
  is 21 across two classes. Recorded as debt, not fixed here.
- `/code-review high` + `critic`, parallel (no `security` — no `src/`, migration, RLS, RPC, or
  auth surface in this diff, pure test-file work):
  - `critic` → 0 blocking, 5 notes, all rung 5. Confirmed the vacuous-test fix genuinely closes
    the hole (traced the reset's DELETE predicate against the RPC's own dedup-guard predicate,
    confirmed the reset is strictly *broader* than the guard so it can't leave a row the guard
    would still see), confirmed the ADR fence intact, confirmed both halves of the Test-1
    deletion argument (the DB-level CHECK constraint that makes `connect_person` unreachable to
    Discover, and the unit test covering the badge-lookup class). See notes below.
  - `/code-review` → 0 blocking, 2 findings. One was a process-timing artifact (this file's own
    top `stage:` line hadn't been advanced yet — expected, done at gate-close, see below). The
    other converges exactly with `critic`'s N2 — two independent reviewers on the same finding.

### Notes (rung 4-5, not retried)

1. **(`critic` N1, rung 5) — ✅ FIXED, ruled 2026-09-07.** The rewritten module header committed
   the exact documented-lie class it was written to avoid, in the one paragraph that wasn't
   rewritten from a verified fact: `inbox-accept.spec.ts:20-25` claimed DEV-83's general
   regression needs no e2e retest because "no live path still exercises an accept between two
   already-connected companies for ANY request type" — both supporting clauses were false
   (`ConnectActions.tsx` only hides the *send* form once connected, it doesn't retire a request
   sent before the pair connected by another route; `accept_connection_request`'s own migration
   comment confirms this exact scenario is a normal case it explicitly handles). **Muskan ruled:
   correct it.** Rewritten to state the real reason: the invariant moved into SQL test coverage —
   `connection_consent_lockdown_test.sql` and `accept_connection_request_status_guard_test.sql`
   both independently prove an accept onto an already-connected pair adopts rather than re-mints.
   Re-verified: `tsc` clean, both affected specs still pass (13/13).
2. **(`critic` N2 + `/code-review`, rung 5, two independent reviewers converged) — ✅ FIXED, ruled
   2026-09-07.** `pricingRequestNote()` (`two-company.ts:456`) was dead code, left behind
   inconsistently — this ticket's own diff deleted its OTHER orphaned export
   (`countPersonRequestsForAlice`) under an explicit stated rule ("dead code with zero callers…
   remove outright once certain") but hadn't applied it here. **Muskan ruled: delete it.** Done,
   including its doc comment; the one remaining prose mention in `discover-shop.spec.ts:221`
   (explaining where the coverage moved to) is historical narrative, not a call site, and stays
   accurate as-is. Re-verified: `tsc` clean, no dangling reference.
3. **(`critic` N3, rung 5)** `inbox-accept.spec.ts:132`'s hardcoded pricing-note string is a
   third, un-cross-referenced copy — `pricingRequest.ts` and the RPC's SQL both carry "keep in
   sync by hand" comments naming *each other*, but neither knows about this third copy. A change
   to the note format would silently desync this one test. A one-line comment naming the owner
   would close it; not added here.
4. **(`critic` N4, rung 5)** A stale citation survives inside the very header this ticket
   rewrote: `inbox-accept.spec.ts:9-10` still cites `InboxView.tsx:137` (deleted by T07) and a
   swallowed-throw in `RequestsSection.tsx:98` that was fixed before this session. Same
   documented-lie class as note 1, one paragraph over.
5. **(`critic` N5, rung 5)** `discover-shop.spec.ts`'s Test #1 shares the same "doesn't
   discriminate connected vs. dedup" hazard the plan explicitly named and commented in
   `inbox-accept.spec.ts`, but the comment wasn't added to this file's sibling assertion.
   Cosmetic — the test's own title is honest about being UI-only, nothing is factually wrong.
6. **(`/code-review`, process note, not a code defect)** This file's own top `stage:` line lagged
   T09's actual section during the review round — expected, since the orchestrator advances that
   line as the final step at gate-close, not mid-round. Resolved by the time this section closes.
