# 0027 retire-connect-inbox — work order

lane:   FULL
branch: claude/muskan/work
stage:  spec ✅ → prototype ✅ → design ✅ → build ✅ (T01 ✅ → T02 ✅ → T03 ✅ → T04 ✅ → T05 ✅ → T06 ✅ → T07 ✅ → T08 ✅ → T09 ✅) → ship (in progress — Steps 1-4 done, migrations LIVE, security scan CLEAN — Step 5 PR next)

## /ship log
- 2026-09-07 — 5 commits landed (T06-T09 + a live-feedback fix flattening Connect's sidebar
  entry to a direct link, requested by Muskan while walking the app), pushed. Step 1 (rebase onto
  `origin/dev`): no-op, branch already 0 behind, 80+ ahead. Step 2 (full gate) ran twice: first
  pass RED on 2 locators broken by a parallel session's already-merged Present/Manage-Shop work
  (not 0027's own work) — fixed (1-line each), 6 cascade-blocked tier-pricing tests recovered.
  Second pass GREEN: unit 515/515, e2e 116 passed/21 failed (all pre-existing, 2 documented
  classes)/9 skipped (intentional)/8 did-not-run (deterministic serial-mode cascade from the
  same 21, unrelated files, predates 0027), SQL 62/64 (2 pre-existing HEL-83), tsc clean, eslint
  6/15 exact baseline. **Corrected baseline for this slug's own record: the "15 e2e failures"
  figure cited earlier this session was already known stale (21 is correct, established during
  T09); this gate additionally establishes the "did-not-run" cascade shape, not previously
  documented anywhere.**
- ⚠️ Noticed in passing, not 0027's concern: an untracked `docs/muskan-build/0028-landing-page-
  refresh/` appeared mid-ship — a fresh `/triage` result (Marcel's Linear DEV-164), clearly from
  a separate, parallel Muskan session sharing this same working directory. Not touched, not
  committed, no file overlap with anything in this commit sequence.
- 2026-09-07 — **Step 4 (migrations) done.** Both pending migrations — 0027/T06's
  `20260907090000_drop_deliver_deal_claim_deal_ticket.sql` and the parallel Present/Manage-Shop
  session's `20260907140000_import_products_pack_sizes.sql` (same branch, same push, both
  DDL-only, no data-write ask-rule stop) — applied to production (`byipusuthdlskdxoexkt`) via
  `apply_migration`, history stamps repaired to their filenames' own timestamps, pre/post-flight
  verified directly against the live database (not inferred from local parity or migration-header
  claims): T06's drop confirmed by a live call-shape census (0 rows) before AND after; `import_products`'s
  replacement body diffed against the live `pg_get_functiondef` before applying (differs by exactly
  the documented `pack_sizes` addition); grants and security advisors checked clean after. Full
  record: `docs/deploy/cloud-migrations-pending.md`, "🔴 READ FIRST (2026-09-07, later same day)".
  Committed `35f9563`, pushed. **Same-deploy rule is now an open window**: migrations are live,
  app code is not yet merged/deployed — closes at Step 5.
- 2026-09-07 — **Step 3 (security scan) — CLEAN, re-run.** The session that ran it originally
  was compacted before its findings were written to this file, and this session's own recollection
  of a "near-miss" `announce_deal_event`-area finding could not be verified after compaction — so
  rather than act on an unverifiable memory, re-ran the Claude Security "scan changes" pass fresh
  against the branch's full diff vs `origin/dev` (everything this PR carries: slugs 0022-0027 +
  the parallel Present/Manage-Shop work), split across 3 parallel sub-reviews (SQL migrations ·
  application code · edge functions) to keep the ~1.8MB diff out of context. **Zero findings at
  confidence ≥8.** Specifically re-traced the `assert_relationship_writable` guard chain through
  every `CREATE OR REPLACE` in the refactor migrations (the exact "predicate silently dropped"
  failure shape this repo has hit twice before, most recently 0026's `announce_deal_event` fix) —
  clean. Also independently verified: `deliver_deal`/`claim_deal_ticket` had zero live callers
  before the drop; `request_product_pricing_c2c` derives the caller's company server-side from
  `auth.uid()`, not client input; admin relationship actions are gated by `is_hs_team()` inside
  the RPCs, not just the route redirect; the pack-sizes migration adds no new `SECURITY DEFINER`
  surface. **Step 3 and Step 4 both done — Step 5 (PR) next.**

## Seed
Muskan, 2026-08-31, via `/triage`: "deletion of connection request page inside connect"

Scope is the decision locked the same session, before triage:
`docs/decisions/DECISIONS.md`, "2026-08-31 — Connection Request page retires; all four
request types settle in Discover's accept gate, no ticket/claim system for MVP." **Amended
2026-09-01** — same file, "Correction: Sella's detected deals were never an 'unconnected
send'" — the real scope is narrower and different: deals never go through an accept gate at
all (fixed at the source), pricing requests split on connection status, and only genuinely
unconnected pricing asks still need Discover's list. Read both entries; the PRD
(`docs/PRD/0027-retire-connect-inbox.md`) reflects the amended scope, not the original one.

## Triage — the YES answers
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | deliberate retirement per a locked decision, not a regression |
| 1 | new screen or surface? | NO | `RequestsSection` (built 2026-07-23) and `/connect/inbox` both already exist |
| 2 | migration / RLS / RPC / auth? | NO | widens `companyRequests.ts`'s `.in("type", [...])` filter under existing RLS (`inbox_select`); accept-time branches to two existing RPCs (`acceptItem`, `claim_deal_ticket`), creates neither |
| 3 | concept not in CONTEXT.md? | **YES** | grepped `pending_inbox_item`, `RequestsSection`, `InboxView`, `claim_deal_ticket`, "connection request", "accept gate" — zero hits |
| 4 | changes what the product does? | **YES** | which request types Discover's accept gate covers, which RPC fires at accept time |
| 5 | file locked elsewhere? | NO | `ayush.md` offline since 2026-07-24; `muskan.md` fully released |
| 6 | more than one ticket? | **YES** | (a) extend `RequestsSection` for `pricelist_request` + `deal_card`, branching `acceptItem` vs `claim_deal_ticket` (`inbox.ts:287-290`); (b) retire `/connect/inbox`'s module (`InboxView`, `LensTabs`, `InboxList`, `InboxDetail`, `lenses.ts`, claim/assign) — explicitly gated on (a) shipping AND Sella's `deliver_deal` door moving off `/connect/inbox` writes |

**Lane: FULL.**

## Files so far
| stage  | wrote     |
|--------|-----------|
| triage | this file |
| spec   | `RESEARCH.md` (researcher prior-art sweep) |
| spec   | `docs/PRD/0027-retire-connect-inbox.md` |
| spec   | `docs/decisions/DECISIONS.md` — 2026-09-01 correction entry |
| spec   | `docs/architecture/CONTEXT.md` — "Accept gate" line added, then corrected |
| prototype | 3 row-label variants on live `/discover` (`?variant=`), thrown away after decision — see "For Muskan" |
| design | `RESEARCH.md` — `## Approaches (design)` section appended (Q1-Q6 + unenforced invariants) |
| design | `docs/architecture/adr/0009-retire-connect-inbox.md` — rev 2, after two checker rounds |
| design | `docs/architecture/adr/ADR-INDEX.md` — 0009's row |
| design | `TICKETS.md` — T01-T09 across four waves |

## Locked            (from ADR 0009, G3 approved 2026-09-03)

- **D1** — `confirm_detected_deal` stops cutting a deal ticket: delete `:182-185` of
  `20260827130000…`, **keep `:186`'s `end if;`**. Nothing replaces it. ⚠️ Dead-code deletion, not
  a live-bug fix — the branch is unreachable through every sanctioned route.
- **D2** — `requestProductPricing` branches on `is_connected_to_company`. Connected → a **new
  `SECURITY DEFINER` RPC** resolves-or-creates the c2c thread and posts a **person-voiced
  `message`** attributed to the asker, body = `buildPricingRequestNote(...)`. Grant contract
  (`REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`) and a parameter-free signature are
  both part of the contract, not build details.
- **D3** — filter widens to `["connect","connect_message","pricelist_request"]`. `deal_card`
  deliberately never added.
- **D4/D10** — prototype Variant C badge, on **every** row incl. person rows. New
  `src/app/discover/requestTypeMeta.ts` keyed on `DiscoverRequestKind`, **not** on
  `InboxRequestType`; owns no filtering.
- **D5** — backfill and drop are two separate migrations. Backfill sets `status = 'accepted'`
  (`'resolved'` is not a valid code) on `deal_card` + `pending` + `deleted_at is null` only.
- **D6** — `/connect/inbox` → permanent redirect to `/discover` in `next.config.ts`; folder still
  deleted.
- **D7** — the two SQL test files + runners deleted, **plus** the C9 block at
  `send_deal_c2c_announce_test.sql:391-412`.
- **D8** — rows stay product-blind at the query layer; the product name already rides in `note`.
- **D9** — box retitled "Connection requests" → "Requests".
- **D11** — `acceptItem`/`declineItem` return `Promise<void>`; `getInbox`/`getViewerContext`/
  `getAssignableMembers` deleted.

**Ordering is locked and not improvisable:** W1 → W3 → W4, W2 live before W4, D2's migration
before D2's app code. ADR §6 supersedes `PRD:61`, which states the reverse.

## Deferred — must NOT be built
- claim / assign / reassign / admin-reassign — MVP is one person per company per side
- Home's proposed deal-claim board (2026-07-23) — moot without multiple people per company
- `connect`/`connect_message` behaviour — untouched; genuine pre-relationship asks
- `accept_connection_request`'s body — reused as-is (it already accepts `pricelist_request`)
- multi-person-per-company visibility — Path B
- a single-RPC version of D2 — the fix if the read-then-write race ever bites, not now

## Attempts          three separate budgets — see PIPELINE.md §10

### T09 — Update the e2e specs
- ⚠️ **Discovered a problem TICKETS.md doesn't name, bigger than a navigation-target swap.**
  Traced all three files by hand. `deal-lands-in-c2c-chat.spec.ts` and `deal-c2c-create.spec.ts`
  both have the shape TICKETS.md warned about for the latter (a UI block asserting the deleted
  Deal-tickets lens's empty state) — both turned out to already carry a redundant DB-level proof
  right after the UI block (`countTicketsForCard(cardId) === 0`), so both are clean "delete the
  block" cases. `inbox-accept.spec.ts` is worse: verified directly against
  `src/app/discover/actions.ts:120-127` and the live RPC that its second test's entire premise
  (an already-connected buyer's pricing ask goes through an accept flow) was obsoleted by **T02**
  — an earlier, already-closed ticket in this slug — independent of anything T06/T07 changed.
  Connected-company pricing now bypasses the ticket system entirely (posts straight to c2c chat).
  This is the exact class of gap T02's own G4 gate log flagged and left open for a DIFFERENT file
  (`discover-shop.spec.ts`, "widen T09 or open a sibling ticket") — `inbox-accept.spec.ts` has the
  same disease and IS T09's own file, so fixing it here is treated as in-scope, not creep.
- Plan written: `PLAN-T09.md`. Test 1 in `inbox-accept.spec.ts` deleted outright (its regression
  is unreachable through any surviving route and separately covered by T04's own unit test); Test
  2 rewritten to prove T02's actual behavior (message posts to chat, zero ticket) instead of the
  now-impossible accept flow — closing a real coverage gap T02 itself flagged as missing.
  `countPersonRequestsForAlice()` in `two-company.ts` deleted too (orphaned by Test 1's removal,
  zero other callers, confirmed via grep) — the one edit to a file TICKETS.md names "not in
  scope," justified as a direct, traceable consequence of an in-scope deletion, not creep.
- `plan-checker` round 1: **REVISE, 3 blocking, 5 notes.** First blocking findings this whole
  build has hit. B1 (rung 2, real) — my rewritten Test 2 was VACUOUS by construction: the RPC's
  dedup guard is permanent, `discover-shop.spec.ts` runs before `inbox-accept.spec.ts`
  (single-worker, path order) and already fires the identical ask, so the message would
  pre-exist and my assertions would pass on someone else's write. Fixed: two new fixture helpers
  (`resetPricingRequestMessage`, `countPricingRequestMessages`) added to `two-company.ts`. B2
  (rung 3) — T09's own EARS ("every spec shall pass") is literally unsatisfiable without also
  fixing `discover-shop.spec.ts`, which has the identical T02-caused break in a file TICKETS.md
  doesn't name. **Put to Muskan directly, not resolved unilaterally — ruled: widen T09.** Now
  File 4 in the plan. B3 (rung 3) — I deleted an export but left its import behind, a real
  compile break (`TS2305`); fixed. N1 (rung 4, most material note) — I was WRONG to drop two
  assertions (`countThreadsForPair("c2c")`, `countConnectionEstablishedLines()`); ADR
  0006:381 names this exact file as "the only guard on the invariant this slug now writes
  against" — restored. N2-N5 (wording/scope clarity) all folded in. `discover-shop.spec.ts`'s
  gap is no longer deferred — it's now File 4, fixed in this same ticket per Muskan's ruling.
- `plan-checker` round 2: **REVISE, 1 blocking, 6 notes.** Round 1's three fixes all independently
  re-verified correct (the new SQL checked against the live schema, N1's restoration confirmed
  citation-accurate, G4 routing confirmed). One NEW blocking finding, same class as round 1's B3:
  the plan called for asserting `buildPricingRequestNote(...)`'s output, but that function lives
  in `src/` and no e2e spec has ever imported across the `e2e/`↔`src/` boundary — fixed by using
  the literal string (already independently verified byte-identical) directly, never a function
  call. 6 notes — most material: N-R2-3 (had to state explicitly that the restored N1 assertions
  compare against snapshots captured BEFORE the ask, not re-derived after, or the guard becomes
  tautological), N-R2-6 (tightened the two new SQL helpers to match sibling helpers' relationship-
  pair scoping). All folded in. Did a full independent read-through myself afterward to confirm no
  further dangling forward-references (the exact mistake round 2's blocking finding was) —
  clean. No round 3 dispatched — diminishing returns past this point.
- `test-writer` executed all 5 files green on first pass, verbatim per the twice-corrected plan
  (SQL copied byte-for-byte, literal string used not a function call, correct deletion ranges).
  Flagged the same no-Bash gap as before; two judgment calls on prose the plan gave intent for but
  not verbatim text (a test title, several header-comment rewrites) — both reasonable, spot-
  checked directly by the orchestrator and confirmed faithful.
- Orchestrator: `tsc` clean, `countPersonRequestsForAlice` fully gone (export + import, zero grep
  hits). **Ran the four actually-touched spec files against the live local stack — 21/21 PASS**,
  including the two highest-risk tests (`discover-shop.spec.ts`'s widened Test #2 fix and
  `inbox-accept.spec.ts`'s full DEV-83→T02 premise rewrite) — the substantial redesign works
  end-to-end, not just compiles.
- `test-runner` independent full pass: **GREEN.** `tsc` clean, unit 510/510, SQL 62/64 (same 2
  pre-existing HEL-83 fails), eslint 6/15 exact baseline match (0 new in any of T09's 5 files).
  **Ran the FULL 154-test e2e suite** (not just the 4 touched files) — all 21 of T09's own tests
  pass even inside the full run (no interaction effects with other specs). 21 total failures in
  the full suite, ALL A/B-proven pre-existing (reproduced identically on `main` after a fresh
  reset) — 14 in the documented GoTrue `sb_secret_` admin-API class, plus **7 in a genuinely new,
  previously-uncatalogued pre-existing class** (`present-edit-model.spec.ts`/`present-info.spec.ts`,
  a warehouse info-card `getByTestId` timeout) — unrelated to 0027 entirely, not fixed here,
  recorded as debt. ⚠️ **The standing e2e baseline this slug has cited repeatedly ("15,
  sb_secret_/GoTrue class") is now known to undercount — actual count is 21, split across two
  classes.** `git status` scope check: T09's diff is exactly its 5 declared files; the working
  tree's combined T06-T09 footprint is unchanged and accounted for.
- `/code-review high` + `critic`, parallel (no `security` — pure test-file work, no `src/`/
  migration/RLS/RPC/auth surface) → **0 blocking from both.** `critic`: 5 notes, all rung 5 —
  confirmed the vacuous-test fix genuinely closes the hole (traced the reset's DELETE predicate
  against the RPC's dedup guard, confirmed strictly broader). Most notable: N1 — the rewritten
  module header commits the exact "documented lie" class this ticket invoked twice to fix OTHER
  comments, in the one paragraph left unverified (claims DEV-83's general regression has "no live
  path" — false; the real, correct reason it's safe to drop e2e coverage is that the invariant
  moved into SQL tests instead, which do prove it). `/code-review`: 2 findings, one a process-
  timing artifact (top stage line not yet advanced — expected, fixed now), one converging exactly
  with `critic`'s N2 — two independent reviewers on the same finding: `pricingRequestNote()` is
  now dead code (orphaned by this same diff) but wasn't deleted like its sibling orphan was,
  inconsistent with the rule this ticket explicitly applied to the other one.
- Every finding recorded in `REVIEW.md`'s new T09 section, none fixed — same discipline as every
  prior ticket, maintained even on the last one and even where the irony (a documented-lie
  comment written by the same ticket that fixed others) made fixing tempting.
- `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 0`

### T08 — Remove the nav entry and both Discover CTAs
- Read all three files + checked `DECISIONS.md` + the PRD's AC5 before planning. Found a real,
  unresolved judgment call TICKETS.md's terse "remove the two CTAs" leaves open: the "incoming"
  state in both `ConnectActions.tsx` and `CompaniesSection.tsx` is a full UI branch (copy + icon
  + link), not a bare href — a blind deletion would make an "incoming" company fall through to
  a "send a new request" form, which is wrong. No existing test asserts this branch's exact
  copy/href (checked). Plan takes PRD AC5's precise wording ("no… link," not "no indication") —
  replace the clickable link with a non-interactive "wants to connect" indicator, matching the
  sibling states' own non-interactive styling in each file. Flagged for `plan-checker`/`critic`.
- Plan written: `PLAN-T08.md`. Correctly routed to G4 human stop from the start this time (2
  `.tsx` files touched, same PIPELINE §3 rule T07 needed a correction round to reach).
- `plan-checker` round 1: **REVISE, 0 blocking, 6 notes.** N1 (held, material) — the locked
  prototype (`discover-linkedin-prototype/index.html:426`) already renders the "incoming" state
  as a non-interactive pill that KEEPS the arrow; my draft had dropped it reasoning "nowhere to
  point" — an unauthorized divergence from a locked screen. Restored. N2 (held) — I'd cited the
  wrong sibling branch as the styling precedent (`connected` is a `Link`, not a `div` — the real
  precedent is `phase === "sent"`); prose corrected, the proposed code was already right. N5
  (held) — the verification grep was scoped to `src/app/discover/` only, missing `surfaces.ts`
  under `src/shared/ui/`; widened to `src/`. N3 (held, real) — `ConnectActions` has a SECOND
  mount point I hadn't traced, `BuyerShopView.tsx`'s `LockedCatalogue` CTA slot, whose whole job
  is carrying an action — this ticket leaves it dead, with no path forward from a company's
  detail page for an "incoming" company. Not fixed (adding a new affordance would itself be
  unauthorized scope growth) — named explicitly in a new "Behavior changes" section for G4 to
  rule on, not discover after the fact. N4 (held) — added that section. N6 (2 more stale
  comments outside T08's 3 files) — recorded as follow-up debt, not fixed, matches TICKETS.md's
  own file fence.
- `builder` executed green on first pass, verbatim per the plan (including keeping the arrow icon
  in File 3, confirmed by direct diff read). `tsc` clean, `grep -rn "connect/inbox" src/`
  survivors match the plan's prediction exactly (the redirect + 3 e2e specs, T09's scope), no
  dangling imports. Orchestrator independently re-confirmed `tsc` clean + unit 510/510 unchanged.
- `test-runner` independent full pass: **GREEN.** `tsc` clean, unit 510/510, SQL 62/64 (same 2
  pre-existing HEL-83 fixture fails), eslint 6/15 exact baseline match (zero hits in T08's 3
  files), `connect/inbox` grep 0 hits in `src/` (survivors: `next.config.ts`'s own redirect +
  3 e2e specs, T09's scope). Noted accurately, not a defect: T06/T07/T08 all still sit uncommitted
  in the same working tree — nothing has been committed this session since no commit has been
  requested, per the standing "never commit without being asked" rule.
- `/code-review high` + `critic`, parallel (no `security`) → **0 blocking from both.**
  `/code-review` reviewed the full T06+T07+T08 working tree (no upstream commit boundary to
  isolate T08) and found only 2 re-discoveries of already-open T07 items — no new T08 findings.
  `critic`: 5 notes, most notably **N2 — a real, unintentional inconsistency my own plan
  introduced**: the "corroboration" I cited for keeping the arrow icon (claiming
  `NewPeopleSection.tsx` ships the identical arrow-bearing pattern) was factually wrong — that
  file's actual pill has no arrow. Net result: Discover's company-row "wants to connect" pill now
  has an arrow, its person-row sibling doesn't, same page. Also N3 (re-confirms `plan-checker`'s
  `BuyerShopView` affordance-loss finding, applies to BOTH its mount points not just one, and
  offers a third option — retarget to `/discover` instead of de-interactivating — worth weighing
  at G4). Full write-up: `REVIEW.md`'s new T08 section.
- Every finding recorded, none fixed — same discipline as every prior ticket.
- `visual-verifier` staged the G4 comparison (24 checks): the 3 declared changes all confirmed
  live; found `BuyerShopView`'s locked-catalogue CTA panel live in seed data (Bavaria, 0
  products) and screenshotted the exact "asks for an action it can't offer" state `critic` N3
  described; found the N2 arrow inconsistency is real in source but has **zero visual
  manifestation** — `NewPeopleSection.tsx` structurally filters out `incoming`-state people
  before rendering any card, so its arrow-less pill can never actually appear next to
  `CompaniesSection`'s arrow-bearing one; corrected `critic`'s "both mount points" framing — the
  two `ConnectActions` mounts are mutually exclusive, so at most one is ever dead at a time
  (narrows, doesn't soften). 390px clipping reproduced but proven pre-existing via a control run
  against an untouched pill. 0 console errors throughout. Full table: `REVIEW.md`'s T08 section.
- `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 0`

### T07 — Retire the `/connect/inbox` route and module
- Full import-graph traced by hand before planning (every importer of every file on the delete
  list, read directly, not assumed from TICKETS.md's own text) — surfaced two compile-breaking
  chains TICKETS.md doesn't name: `claimItem`/`assignItem` in `supabase/inbox.ts` are orphaned
  once `InboxView.tsx` (their only caller) is deleted; `dealPreviewOf`/`DealCardEmbed`/`money`
  are orphaned once `getInbox` (their only caller) is deleted. Both flagged for `plan-checker`/
  `critic` to verify independently, not asserted unilaterally.
- ⚠️ **`database.types.ts` landmine found before touching the file:** it is NOT reproducible from
  `supabase gen types` — carries an undocumented hand-edit on `update_deal_draft`'s `Args` (found
  and documented the hard way in slug 0022, per that slug's `REVIEW.md`/`STATE.md`/`TICKETS.md`).
  A blind regeneration would silently clobber it. Plan uses a targeted two-line manual delete
  instead (the two stale RPC entries T06's DROP made stale) — confirmed both are single-line,
  self-contained entries with no other consumer nearby.
- Plan written: `PLAN-T07.md`. `plan-checker` round 1: **REVISE, 0 blocking, 7 notes, two
  contradicted governing documents.** N2 (held, spot-verified against the ADR directly) — the
  ADR's own file-list table explicitly says `inbox.ts`'s `deal_card` branch (`:315`, now
  `:313-322` incl. its comment) gets deleted; the plan had wrongly left it on a "file-list
  discipline" reasoning that doesn't hold — corrected. N1 (held) — **G4 routing corrected from
  auto-close to mandatory human stop.** This ticket deletes 7 `.tsx` files; PIPELINE §3 routes by
  the diff (anything rendered → human stop), not by reachability, and this slug's own gate log
  proves the line is sharp (T01/T02/T03/T05/T06 auto, none touched `.tsx`; T04 stopped because it
  did). T07 is the first ticket since T04 to touch one — routes like T04, not like T01-T06. N3
  (a wrong justification for a right conclusion — `AcceptRequestType` is `messaging/types.ts`'s
  own independent copy, not gated by the deleted `InboxRequestType` as originally claimed;
  corrected to the real four-fact reason), N4 (deletion ranges now explicitly include their own
  doc comments), N5 (3 stale comments identified and scheduled for correction — `inbox.ts`'s file
  header, its "claims via claim_deal_ticket" comment, `requestActionError.ts`'s "two surfaces"
  line), N6 (the real changes — capability removal, a temporary T07-before-T08 dead-end on 3 still
  -live entry points — now named explicitly for G4 instead of asserted away), N7 (EARS-1's
  redirect verification now has an owner: orchestrator live-checks it, then stages it at G4). All
  folded into `PLAN-T07.md`.
- `test-writer` deleted `lenses.test.ts` (4 tests) after confirming its content matched — flagged
  the same no-Bash gap as before, orchestrator ran the actual `rm`.
- `builder` executed the rest green on first pass: 4 module files + 6 components + `page.tsx`
  deleted, `inbox.ts` trimmed heavily (removed `getViewerContext`/`getAssignableMembers`/
  `getInbox`/`DealCardEmbed`/`dealPreviewOf`/`money`/`claimItem`/`assignItem`, deleted
  `acceptItem`'s `deal_card` branch, `acceptItem`/`declineItem` → `Promise<void>`), `store.ts`'s
  dead branch removed, `next.config.ts` redirect added, `database.types.ts` two-line surgical
  edit (confirmed `update_deal_draft`'s hand-edit intact). One self-reported, verified-correct
  deviation: deleted 4 extra dangling comment lines in `store.ts` beyond the named range, since
  they'd otherwise describe the wrong code once the branch above them was gone.
- Orchestrator independently verified the ticket's own three EARS criteria (its assigned owner
  per the plan's N7 fix): `tsc` clean, unit suite exactly **510/510** (514 − 4, precise match),
  and the `/connect/inbox → /discover` redirect confirmed live (308 in dev, landing correctly on
  `/discover`'s normal auth gate).
- `test-runner` independent full pass: **GREEN.** `tsc` clean, unit 510/510 (68 files), SQL 62/64
  (same 2 pre-existing HEL-83 fixture fails as every prior ticket's baseline), eslint 6/15 exact
  baseline match in the same 4 untouched files, redirect re-confirmed independently. Found a
  wider-than-expected (but harmless) set of stale comment-only references in files T07 correctly
  left alone — all either pre-existing or already named as T09's scope in TICKETS.md. `git
  status` scope check: T07's own diff is exactly 12 deletions + 5 edits, file-for-file matching
  the plan; T06's still-uncommitted diff sits alongside it in the same tree, unrelated and
  already reviewed.
- `/code-review high` + `critic`, parallel (no `security` — no migration/RLS/RPC/auth/
  server-action/cross-company-read surface) → **0 blocking from both.** `/code-review`: 3
  comment/plumbing-accuracy findings, none functional — including a residual self-contradiction
  in T06's own P2 banner fix (the old "NOT 3b/3d" exclusion clause was never updated once the new
  return-value text was added), directly echoing L-070 (written this same session, during T06's
  fix). `critic`: 6 notes — confirmed all 3 EARS criteria hold on intent not just letter,
  confirmed the ADR's "Not touched, deliberately" fence intact, independently reconstructed the
  `store.ts` deviation's exact byte range (verifying it was required, not creep), independently
  re-verified the `adr/0009:256` citation and the G4-routing correction. **N4 flagged for your
  ruling:** `messaging/types.ts`'s `dealCardId` residue was left alone on a justification
  ("same class as T06's deferred entries") that no longer holds — T07's own File 11 already
  cleared those exact two entries, so no later ticket in this slug inherits the cleanup. Full
  write-up: `REVIEW.md`'s new T07 section.
- Every finding recorded in `REVIEW.md`, none fixed — this project's own rule (notes are
  recorded, never retried) applied consistently even though several were trivial one-line fixes.
- `visual-verifier` staged the G4 comparison (no prototype to diff against — a route deletion,
  not new UI): the redirect confirmed live in dev, prod build, signed-out, and at 390px; `/discover`
  and its Requests box confirmed unaffected (0 console errors); the T07-before-T08 dead-end on
  all three still-live entry points confirmed — **worse than `critic` predicted**: clicking the
  sidebar's "Connection Request" entry doesn't just mismatch the highlight, it **collapses the
  Connect accordion shut**, so the clicked item disappears from the rail. Full table in
  `REVIEW.md`.
- `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 0`

### T06 — Drop `deliver_deal` and `claim_deal_ticket`, and their tests
- I-M5 checkpoint re-checked before starting: already run for real against production
  2026-09-07 (`docs/deploy/cloud-migrations-pending.md`, "🔴 READ FIRST"), im5a = 0, im5b = 5.
  The "still owed" note this file carried from T05's close is now stale — closed, not open.
- Pre-flight `pg_proc` census (per the ticket's own instruction) run against local Postgres
  before writing the migration: 0 rows for both functions under a call-shape-matched regex;
  confirmed the naive `ILIKE` trap the ticket warns about is real (3 false-positive rows
  locally: `claim_deal_ticket` itself plus two comment-only mentions).
- Plan written: `PLAN-T06.md`. Found (not yet checker-verified) that T06's own EARS-1 cannot be
  literally satisfied by this ticket's file list alone — `store.ts:580-584` still calls
  `claim_deal_ticket` via `.rpc()`, and that line range is T07's scope, not T06's, with no
  dependency ordering between the two tickets. Argued provably unreachable (T05's backfill +
  T01's removal of the only ticket-creator + T03 never surfacing `deal_card` rows), matching
  T05's own PLAN's N4 finding and T01's D1 precedent. Flagged for `plan-checker` and `critic` to
  verify independently rather than asserted unilaterally.
- `plan-checker` round 1: **OK, 0 blocking, 7 notes.** N1 (deleting `deliver_deal_test.sql`
  wholesale silently orphans 3 live-behaviour cells covering still-live `send_deal`/
  `confirm_detected_deal` — its own "fold in before build" flag), N2 (a wrong leg in the
  reachability argument — D3 governs Discover only, not `/connect/inbox`; the real gate is
  `lenses.ts`/`InboxDetail.tsx`'s status check), N4 (the post-migration grep verification step
  as written can't pass — `supabase/` legitimately carries ~35 comment survivors), N5 (two stale
  citations in the very file this ticket edits), N6 (the call-shape census regex has a blind
  spot the naive ILIKE cross-check closes; also corrected a 3-vs-4-rows transcription mismatch
  against ADR/TICKETS) all held and folded into `PLAN-T06.md`. N3 (soften "provably unreachable"
  → accurate, names one real PostgREST-insert caveat) held and applied. N7 (record EARS-1 as a
  named exception in `REVIEW.md` at close) queued for later, not a plan change. All spot-verified
  directly against the repo before folding in, not taken on trust.
- `test-writer` ported P1-P3 into `send_deal_c2c_announce_test.sql`, deleted C9, fixed both stale
  citations — verified against the source cells and this file's own idioms, byte-identity
  confirmed on the untouched C4/C5/C8 blocks. Flagged a genuine tool gap rather than faking it:
  its toolset (Read/Grep/Glob/Write/Edit) has no Bash/delete, so it could not remove the four
  dead files or run the runner itself.
- Orchestrator completed the mechanical remainder: deleted `deliver_deal_test.sql`,
  `run_deliver_deal_test.sh`, `claim_deal_ticket_test.sql`, `run_claim_deal_ticket_test.sh` (all
  four content-reviewed as pure deletions, nothing else referenced them by name — confirmed);
  ran `bash supabase/tests/run_send_deal_c2c_announce_test.sh` — **`ALL SEND_DEAL_C2C_ANNOUNCE
  TESTS PASSED`**, P1-P3 included, green against the still-live (pre-DROP) `deliver_deal`/
  `claim_deal_ticket` — proves the port didn't accidentally depend on either function.
- `builder` wrote `20260907090000_drop_deliver_deal_claim_deal_ticket.sql` — green on first
  pass, no retry needed. Independently re-ran the pre-flight census (0 rows call-shape, 3 rows
  ILIKE — matches plan). `supabase db reset` clean; post-DROP census 0 rows for both functions;
  `send_deal_c2c_announce_test.sql` (with P1-P3) still passes post-DROP; full grep against
  `src/`/`e2e/` matches the plan's named survivor list exactly, no new call site. Full SQL suite:
  62/64 pass, 2 fail (`deal_line_item_insert_lockdown`, `deal_promotion_write_lockdown`) —
  A/B-proven pre-existing (reproduced identically with the migration removed), matches the debt
  T01's own entry above already named (HEL-83's promotion-status-gate fixture drift, unrelated to
  this slug). `tests 0/2` (no retries spent).
- `test-runner` independent pass: **GREEN.** `db reset` clean; SQL 62/64 (same 2 pre-existing
  fails as T01/T04/T05's baseline, independently reconfirmed unrelated — grep proves neither
  failing suite even references `deliver_deal`/`claim_deal_ticket`); unit 514/514 (0 drift);
  `tsc` clean; eslint 6/15 (exact baseline match, 0 new); post-DROP census 0 rows. `git status`
  scope check: nothing outside T06's declared file list touched.
- `/code-review high` + `critic` + `security`, parallel → **1 blocking, rung 2 (silent
  failure), converged on independently by two reviewers.** `PLAN-T06.md`'s own citation-fix
  instruction (File 6c) was wrong: it repointed the §8.3 return-value citation to "case P2,"
  but P2 (per the SAME plan, two paragraphs earlier) deliberately does NOT cover A2-3b/3d — and
  neither P2 nor C3 actually captures/asserts `send_deal`'s return value on the person arm (both
  do a bare `SELECT public.send_deal(...)`, discarding it). After the port, three places in the
  file claim this coverage exists; none of it does — a planning bug, not a `test-writer` slip
  (`test-writer` followed the plan's literal text). `critic` independently found the identical
  gap (its N4) plus a related note (N5: two new banners describe `deliver_deal`'s no-op-on-
  co-owner logic as if live, when live `send_deal` stopped calling `deliver_deal` entirely back
  in `20260825090000` — accurate assertions, inaccurate reasons attached to them).
  `security`: 0 blocking, 4 notes — the drop itself is safe (S1-S8 all pass or n/a; census
  re-run independently with an even wider regex than the plan's, still 0 rows; confirmed no
  function anywhere else writes `pending_inbox_item`). Notably found the migration is worth
  *more* than "cleanup" (N-2): `claim_deal_ticket` never checked its ticket's relationship
  before granting `deal_member` owner, so pre-drop a company colleague excluded from a private
  deal could in principle forge a self-addressed ticket and claim membership — this DROP closes
  that primitive, not just dead code. Also corrected a false claim in the *original*
  `claim_deal_ticket.sql` header (N-1: `member_all`/`can_access_workspace` CAN express the
  bootstrap for `company_wide` workspaces, contrary to what that 2026-07-20 comment says) —
  informational, that file is being deleted by this ticket regardless.
- `builder` NOT dispatched — the fix is entirely inside `supabase/tests/**`
  (`send_deal_c2c_announce_test.sql`), so per L-035 it goes to `test-writer`, never `builder`,
  even for a one-round, well-understood fix. Fix: capture `send_deal`'s return value in P2's DO
  block, resolve the p2p thread id the same way P3 already does, assert equality (a strictly
  *stronger* proof than the original `deliver_deal_test.sql` A2-3b, which only checked
  non-null) — dispatched.
- `blocking-findings 1/2` — one round, inside budget.
- ⚠️ **Notes recorded, not fixed (this project's standing rule: notes go to REVIEW.md, never
  retried):** `critic` N1 (EARS-1's `store.ts` gap must be named explicitly in REVIEW.md, not
  omitted), N2 (the post-build grep step's own stated scope misses `supabase/functions/` —
  re-checked by `critic`, 0 matches, conclusion holds), N3 (this migration's header cites
  `20260724120800`'s "never deployed apart" precedent without carrying its coupling discipline —
  T06/T07 truly are undependencied), N6 (5 other files carry now-stale citations into the
  deleted `deliver_deal_test.sql` — correctly out of T06's own file list, real debt), N7 (the
  P1-P3 port grew the file beyond TICKETS.md's literal "delete the C9 block" scope — justified
  by `plan-checker` N1, but TICKETS.md itself was never amended to say so). `security` N-3
  (a cheap post-drop `to_regprocedure IS NULL` guard would harden I-J5 further — a legitimate
  suggestion, not added, since I-J5's stated posture already accepts this residual risk and
  notes aren't retried), N-4 (this migration isn't yet in `cloud-migrations-pending.md` — that
  ledger updates at `/ship`, not at build time). `code-review`'s second finding (the `store.ts`
  gap) restates `critic` N1/the plan's own named exception, not a new issue.
- `test-writer` fixed the blocking finding (P2's `DO` block now captures `send_deal`'s return
  value and asserts it equals the resolved p2p thread id — stronger than the original
  `deliver_deal_test.sql` A2-3b, which only checked non-null), bundled `critic` N5's two banner
  corrections into the same edit (same file, same cases). Flagged the same no-Bash tool gap as
  before and asked the orchestrator to verify.
- Orchestrator verified independently: confirmed the `<>` operator was literal (not an escaping
  artifact); ran the suite green; **temporarily inverted the new assertion, re-ran, confirmed it
  fails with the exact expected/got values (proof it's load-bearing, not a tautology)**,
  reverted, re-ran green again; full `db reset` + full SQL sweep afterward — same 2 pre-existing
  fails, no new ones.
- Full findings write-up, every note attributed, appended to `REVIEW.md`'s new T06 section
  (round trail + 9 notes + the EARS-1 named-exception writeup).
- `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 0`

### T05 — Backfill: resolve every pending deal ticket
- Plan written: `PLAN-T05.md`. `plan-checker` round 1: REVISE (1 blocking —
  the EARS-3 fixture design didn't work: `create_deal_draft` births
  `'unsent'` not `'negotiation'`, creates no thread, needs an authenticated
  caller the plan told the builder to avoid — spot-verified against the
  RPC's live body, held, redesigned to plain INSERTs — plus 6 notes,
  including a false "no trigger" claim and a wrong grant-rejection
  rationale). All held and folded in.
- `test-writer` → wrote the SQL suite + runner (a DML-only migration has
  no function to call, so the suite inlines the migration's own UPDATE
  statement — a real, documented coupling, not a design flaw). Could not
  `chmod +x` the runner itself (no Bash tool); done manually.
- `builder` round 1 → green first pass. Byte-identity between the
  migration and the test's inlined copy confirmed via `diff` + matching
  MD5.
- `test-runner` round 1 → `tsc` clean, unit 514/514 (0 drift), eslint
  6/15 and SQL 2/66 both pre-existing/unrelated, `db reset` applies
  clean.
- `/code-review high` + `critic` + `security`, parallel → **security F1:
  BLOCKING, rung 2 (silent failure, S7)** — the suite couldn't actually
  prove `status = 'pending'` was load-bearing (the only non-`pending`
  fixture row was already `'accepted'`, a no-op target either way; a
  real `declineItem`-produced `'rejected'` row would have silently
  flipped back to `'accepted'` undetected). `critic` (0 blocking, 6
  notes) and `/code-review` (0 blocking on T05's own diff; 7 of its 8
  findings concerned pre-existing gaps or already-shipped T02 code, not
  T05) converged with `security` that the one shared fact all three
  reviewers touched — a misleading "Deal picked up" banner in Connect
  Inbox's History lens during the W3→W4 window — is a disclosed,
  non-blocking edge case. `blocking-findings 1/2`.
- `builder` round 2 → added a 7th fixture row (`deal_card`/`rejected`)
  and an assertion it stays `rejected` — proved its own fix by
  temporarily breaking the predicate, watching the new assertion fail
  with a named error, then restoring it.
- `test-runner` (re-check) + `security` (re-check), parallel → both
  independently re-verified, neither trusting `builder`'s report.
  `security` went further than asked: hashed the migration file
  before/after (unchanged), rebuilt all three predicate-drop mutants
  itself and reproduced each exact failure message, then re-ran a full
  negative-space sweep of every reader of `pending_inbox_item` and
  confirmed none change their answer for any caller. **F1 CLOSED.** 3
  more low-severity notes surfaced during the re-check, none blocking.
- `tests 0/2` · `blocking-findings 1/2` — one fix round, well inside
  budget.
- ⚠️ **Three findings surfaced this round that are NOT T05's to fix, all
  need Muskan's ruling, none blocked this ticket:** a new info-disclosure
  angle in `confirm_detected_deal` (pre-existing, unchanged by this
  slug, alongside the already-known NULL-guard bypass); a genuine TOCTOU
  dedup race in T02's already-shipped `request_product_pricing_c2c`
  violating locked invariant I-M13 under concurrency; and
  `shares_connection_with_company` granting person-visibility with no
  `status`/`deleted_at` filter (pre-existing, unrelated to this slug).
  All three are `/track-doubt` candidates — full detail in `REVIEW.md`.

### T04 — Every request row shows a type badge; the box is retitled
- Plan written: `PLAN-T04.md`. `plan-checker` round 1: REVISE (3 blocking
  claimed, 2 held — a stale title string in `DiscoverShell.test.tsx` and
  two in `e2e/discover.spec.ts`, neither in TICKETS.md's file list, both
  folded in — plus 1 spot-verified FALSE: a claimed `TS2352` on
  `"connect_person" as DiscoverRequestKind` that this repo's own
  `tsc --strict` compiles clean, confirmed by bypassing the `rtk` hook,
  which had fabricated a fake clean pass with zero real diagnostics on
  the first, wrong attempt — not folded in). 5 notes, 4 held and folded
  in, 1 (row-density) named for the G4 look instead of fixed in code.
- `test-writer` → RED across 4 test files (new module import failure +
  string-absence failures), no source touched.
- `builder` → green first pass, 2 source files, 0 deviations, 0
  rejections.
- `test-runner` → `tsc` clean, unit 514/514 (+8 exact, 0 drift), eslint
  6/15 and SQL 63/65 both independently A/B-proven pre-existing/unrelated
  (same baseline as T01-T03), e2e `discover.spec.ts` 4/4 green (the one
  file `builder` didn't run itself).
- `/code-review high` + `critic`, parallel (no `security` — no
  migration/RLS/RPC/auth/server-action/cross-company-read surface) → 0
  blocking, 8 notes (2 stale doc-comments left by the retitle, a
  `REQUEST_TYPE_BLURB` half of D4 that never got a home, a theoretical
  unreachable fallback edge case, a non-discriminating e2e assertion, and
  others — full list in `REVIEW.md`).
- **This ticket renders UI (a badge + a retitled box) — stopped at G4 per
  PIPELINE §3, did not auto-close.** `visual-verifier` staged 23 checks:
  17 match, 1 cannot-verify (the unreachable-from-a-browser fallback,
  covered only by a unit test), 5 deviate — none blocking. Two of those
  deviations **corrected the review record**: `critic`'s claim that the
  badge "never renders in a browser run" was wrong (Alice has 3 live
  seeded incoming requests, not 0 — the `e2e/discover.spec.ts` header
  comment describing her as request-less is stale), and `critic`'s
  row-density estimate (~24px, "4 rows become 3") was measured live and
  corrected to +13px, "3 rows either way." The other 3 deviations: two
  badges share one accent colour (not a spec breach, D4 names no
  colours), and a pre-existing page-shell clipping bug at 768px/390px
  **proven to be zero-width-contribution from the badge** (row min-content
  identical with/without it) — flagged for a possible `/track-doubt`,
  not fixed here.
- `tests 0/2` · `blocking-findings 0/2` — closed clean, no retries spent.
- **G4: Muskan reviewed the staged screenshots and passed.** The two
  side-questions raised at the gate (distinct accent colour for
  `connect_message`/`person`; whether the 768px/390px bug becomes a
  ticket) were **not explicitly ruled on** at the gate itself — "pass"
  closed the ticket, both side-questions stayed open until 2026-09-06,
  when Muskan ruled both: badges stay the same blue, and the bug is
  filed as [HEL-92](https://linear.app/hellosello/issue/HEL-92).

### T03 — Discover's Requests list carries pricelist requests
- Plan written: `PLAN-T03.md`. `plan-checker` round 1: REVISE (1 blocking —
  a required `type` field would break `tsc` at two uncensused call sites —
  plus 5 notes, including a wrong I-M9 test citation). Folded in; extended
  the *existing* `accept_connection_request_status_guard_test.sql` suite
  with a genuinely missing c2c-thread assertion rather than writing new
  SQL.
- `builder` → green first pass, single file (`companyRequests.ts`).
- `test-runner` → full suite green, matches baseline exactly.
- `/code-review` + `critic` + `security` parallel → 0 blocking. All of
  `/code-review`'s 8 findings turned out to be re-discoveries of T01/T02
  notes already on record, or T04's explicitly-deferred badge work.
  `critic`/`security` found 7 notes on T03's own diff, none blocking.
- `tests 0/2` · `blocking-findings 0/2` — closed clean, no retries spent.

### T02 — pricing ask to a connected company posts to chat
- Plan written: `PLAN-T02.md`. `plan-checker` round 1: REVISE (3 blocking —
  unqualified identifiers under `search_path=''`, a non-compiling TS
  snippet, a dup-guard scoped to person instead of company — plus 6 notes).
  Spot-verified and folded in.
- `test-writer` → RED suite + unit cases; caught a `created_at`-ordering
  design gap before `builder` ran.
- `builder` round 1 → green first pass.
- `test-runner` round 1 → 1 new eslint error (this ticket's own test file),
  fixed round 2. `tests 1/2`. Also surfaced an untracked e2e planning gap
  (see REVIEW.md) — not fixed here, needs Muskan's ruling before `/ship`.
- `/code-review` + `critic` + `security` parallel → **security F1: BLOCKING,
  rung 1 leak** (RPC's product lookup skipped `product_visible_to_caller`,
  proved exploitable). Bundled with a `/code-review`-found timestamp-ordering
  correctness bug into one fix round. `blocking-findings 1/2`.
- `builder` round 3 → both fixed; `security` + `test-runner` independently
  re-verified against the live catalog — fix holds, full suite green.
- 21 notes total across all rounds, recorded in `REVIEW.md`, none retried.

### T01 — `confirm_detected_deal` stops cutting a deal ticket
- Plan written: `PLAN-T01.md`. `plan-checker` round 1 in progress.
- `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 0`
- Base sync at build start: `origin/dev` fetched — confirmed its tree is
  byte-identical to the merge-base (a stale, no-op 2026-08-25 snapshot), so
  the required rebase was skipped as a no-op rather than forced through a
  spurious conflict in `DECISIONS.md`/`ARCHITECTURE-NOTES.md`. Working tree
  clean, `HEAD` unchanged.
- ⚠️ **`rtk` corrupted a `git status` read mid-build** — a bare `git status`
  (hook-rewritten to `rtk git status`) reported
  `supabase/migrations/20260903110000_promotion_status_gate.sql` as
  untracked with an unrecorded decision; `/usr/bin/git` (bypassing the hook)
  shows it's actually committed (as `20260903110000_promotion_status_gate.sql`
  — filename, not the commit hash, which went stale across a later rebase),
  decision recorded `DECISIONS.md:2259`. False alarm, corrected. Reinforces **HEL-80** — the
  rtk collapse trap now confirmed to hit plain `git status`, not just the
  tools already listed there.
- `plan-checker` round 1 on `PLAN-T01.md`: REVISE — 1 blocking (a wrong
  `deal_member` assertion), 4 notes (stale RLS citation, unpinned vote
  order, unrecorded NULL-logic fixture dependency, the rtk-caused stale
  file status above). Spot-verified and folded in.
- `test-writer` wrote `confirm_detected_deal_no_ticket_test.sql` +
  runner — RED as expected against the live code.
- `builder` wrote `20260903120000_confirm_detected_deal_drop_ticket_branch.sql`
  — green on first pass, no retry needed. `tests 0/2` (no retries spent).
- `test-runner` independently confirmed: 62/64 SQL suites, 499/499 unit
  tests, `tsc` clean. The 2 SQL fails (`deal_line_item_insert_lockdown`,
  `deal_promotion_write_lockdown`) and 6 eslint errors are proven
  **pre-existing, unrelated to T01** via an A/B worktree run against
  committed `HEAD` (excludes T01's diff) — same failures reproduced.
  e2e (Playwright) skipped for this ticket: backend-only SQL change, no
  e2e spec exercises the deleted branch.
- ⚠️ **New debt surfaced, not caused by T01:** HEL-83's
  `20260903110000_promotion_status_gate.sql` (committed same session,
  immediately before T01's build started — filename is the durable
  citation, the original commit hash went stale across a later rebase) added a
  `deal_card.status <> 'negotiation'` guard to the promotion RPCs. Two
  sibling suites' shared fixture (`deal_line_item_insert_lockdown_test.sql`,
  `deal_promotion_write_lockdown_test.sql` — both pick a card with no status
  filter, currently landing on a `confirmed` one) never got updated for that
  guard and now fail at setup, before their own assertions run. Not in
  `docs/agents/LEARNINGS.md` or CLAUDE.md's record-debt list yet — needs an
  L-number and a fixture fix, unrelated to this ticket or slug.

## Gate log
- 2026-09-02 — spec written (no gate — G1 merged into G3, PIPELINE §9a)
- 2026-09-03 — prototype decided (no gate): Variant C — type badge grouped above
  Accept/Decline — picked over inline-by-name (A) and eyebrow-above-name (B)
- 2026-09-03 — **G3 (spec + ADR, merged gate) — APPROVED.** ADR 0009 rev 2. Two checker
  rounds; round 1 raised 4 blockers (rungs 1/2/3/3), round 2 raised 2 NEW blockers (rungs 2/3).
  All six spot-verified against the repo, all six held, all folded in. ⚠️ **The loop did not
  converge** — round 2 still produced new rung 1-3 findings, so the 2-round budget closed
  without a clean round. A third round was offered and declined; recorded here because
  "approved" and "converged" are not the same state.
  Muskan also approved six spec amendments (FR1, AC1, AC4, PRD:60, PRD:61, FR6/FR9 scope)
  and three product rulings (product-blind rows, "Requests" title, badge every row), plus the
  message shape (person-voiced, from the asker).
- 2026-09-04 — **G4 T01 — auto (backend-only, no human stop, PIPELINE §3).**
  Migration + SQL suite green (`test-runner` independent confirmation: 62/64 SQL,
  499/499 unit, `tsc` clean — 2 SQL fails + eslint proven pre-existing/unrelated
  via A/B worktree). `/code-review high` + `critic` + `security` in parallel: 0
  blocking, 8 notes, all folded into `REVIEW.md`. No carve-out triggered (no
  outstanding rejection, no blocking security finding, no undocumented behavior
  change). `tests 0/2`, `blocking-findings 0/2` — closed clean, no retries spent.
  → stage advances to T02 (W1, parallel-safe with T01, no dependencies).
- 2026-09-04 — **G4 T02 — auto (backend-only, no human stop, PIPELINE §3).**
  `security` caught a real rung-1 leak (`product_visible_to_caller` skipped
  on the new RPC's product lookup) that `critic`/`code-review` had both
  independently spotted but under-rated — proved exploitable with live
  probes, fixed (called the owner predicate, not reimplemented), then
  independently re-verified against the live catalog by a fresh `security`
  pass. A `/code-review`-found timestamp-ordering bug (two bare
  `clock_timestamp()` calls, a false "guaranteed" claim in the header)
  fixed in the same round. `tests 1/2` (an eslint error test-runner caught),
  `blocking-findings 1/2` (the leak + timestamp fix, bundled) — both well
  inside budget. 21 notes total, `REVIEW.md`, none retried.
  ⚠️ **Untracked gap surfaced, needs your ruling before `/ship`:**
  `e2e/discover-shop.spec.ts` test #2 asserts the exact ticket-cutting
  behavior T02 retires and will read red the next e2e run — it is not in
  T09's named scope (`inbox-accept.spec.ts`, `deal-lands-in-c2c-chat.spec.ts`,
  `deal-c2c-create.spec.ts` only). Either widen T09 or open a sibling
  ticket; not fixed here since e2e edits aren't in T02's file list.
  → stage advances to T03 (W2, no dependencies, ships independently of W1).
- 2026-09-04 — **G4 T03 — auto (backend-only, no human stop, PIPELINE §3).**
  Single-file TS change (`companyRequests.ts`), plus a genuinely missing
  I-M9 assertion added to the existing `accept_connection_request` SQL
  suite (no function/migration touched). 0 blocking across all reviewers.
  `tests 0/2`, `blocking-findings 0/2` — closed clean.
  → stage advances to T04 (W2, depends on T03 for the `type` field — now
  live). T04 wires the badge that closes the "unbadged pricing ask" gap
  `/code-review` flagged this round (already anticipated, not a defect).
- 2026-09-04 — **G4 T04 — human, PASSED (this ticket renders, PIPELINE §3
  routes it to a stop, not an auto-close).** `plan-checker` round 1: 3
  blocking claimed, 2 held + folded in, 1 spot-verified FALSE and
  rejected (a claimed `tsc` error that the real compiler doesn't raise —
  caught the `rtk` hook fabricating a fake clean pass along the way).
  `test-runner`: `tsc` clean, unit 514/514 (+8 exact), eslint/SQL both
  A/B-proven pre-existing. `/code-review high` + `critic` → 0 blocking, 8
  notes. `visual-verifier` staged 23 checks (17 match, 1 cannot-verify, 5
  deviate, 0 blocking) and corrected two of `critic`'s own notes against
  live evidence (the "badge never renders" claim was wrong — Alice has 3
  seeded incoming requests; the row-density estimate was off by roughly
  half). Muskan reviewed the staged screenshots and passed. Two side
  questions raised at the gate (accent-colour distinction; whether the
  768px/390px pre-existing clipping bug becomes a `/track-doubt`) were
  **not ruled on at G4** — recorded as still open, not decided either
  way. `tests 0/2`, `blocking-findings 0/2` — closed clean, no retries
  spent. **Ruled 2026-09-06:** `connect_message`/`person` badges stay
  the same blue, no distinct accent — Muskan's call, no code change
  needed. The 768px/390px bug filed as
  [HEL-92](https://linear.app/hellosello/issue/HEL-92) (Codebase
  Development Tickets).
  → stage advances to T05 (W3, depends on T01 — live).
- 2026-09-04 — **G4 T05 — auto (backend-only, no human stop, PIPELINE
  §3).** `plan-checker` round 1: 1 blocking (a broken EARS-3 fixture
  design), held, redesigned to plain INSERTs. `test-runner` round 1:
  green, no drift. `/code-review` + `critic` + `security` parallel:
  **security F1 — blocking, rung 2 (S7, the test couldn't prove
  `status = 'pending'` was load-bearing)** — fixed in one round (a 7th
  fixture row + a new assertion), independently re-verified by BOTH
  `test-runner` and `security` (which rebuilt all three predicate-drop
  mutants itself and reproduced each failure). No carve-out triggered —
  the one blocking finding was fixed and re-verified within the round,
  matching T02's own precedent for what "no carve-out" means; the one
  named behaviour change (`claim_deal_ticket` becoming unreachable) is
  the documented, intended end state (D5/I-M2), not undocumented.
  `tests 0/2`, `blocking-findings 1/2` — one round, inside budget. Three
  findings outside T05's own scope surfaced and are flagged for
  Muskan's ruling (see the T05 entry in `## Attempts` above /
  `REVIEW.md`), none blocking.
  → stage advances to T06 (W4, depends on T01 + T05 — both live. **The
  real I-M5 checkpoint — both counts, run for real against the target
  environment — is still owed before T06 starts**, per TICKETS.md's own
  instruction; it cannot be satisfied locally).
- 2026-09-07 — **G4 T06 — auto (backend-only, no human stop, PIPELINE §3).** I-M5 checkpoint
  re-confirmed already closed (run for real 2026-09-07, before this ticket began — the note
  above was stale the moment it was written, corrected in `REVIEW.md`'s T06 section).
  `plan-checker` round 1: OK, 0 blocking, 7 notes, all folded into `PLAN-T06.md` before build —
  most material was its own "fold in before build" flag (deleting `deliver_deal_test.sql`
  wholesale would have silently orphaned 3 live-behaviour cells covering still-live
  `send_deal`/`confirm_detected_deal`). `test-writer` + orchestrator ported those 3 cells,
  deleted the 2 dead suites, `builder` wrote the DROP migration green on first pass.
  `test-runner` independent pass: SQL 62/64 (same 2 pre-existing HEL-83 fixture fails as T01's
  baseline), unit 514/514, `tsc` clean, eslint 6/15 exact match, post-DROP census 0 rows.
  `/code-review high` + `critic` + `security` parallel: **1 blocking, rung 2 — two reviewers
  (`/code-review`, `critic` N4) independently found the same defect**, a planning bug (my own
  citation-fix instruction pointed a return-value coverage claim at a case that didn't cover it)
  — fixed in one round by `test-writer`, independently re-verified by the orchestrator including
  a temporarily-broken-then-restored proof the fix is load-bearing. `security`: 0 blocking, 4
  notes — confirmed the drop is safe with an even wider independent census, and found it closes
  a real (if currently unreachable) privilege-escalation primitive, not merely dead code.
  **EARS-1 ships as a named, deliberate exception, not silently unmet** — `store.ts:580-584`
  still calls `claim_deal_ticket`, provably unreachable (T05's backfill + zero remaining callers
  of `deliver_deal` + the real UI gate being `lenses.ts`/`InboxDetail.tsx`'s status check, not
  D3 as first argued), T07's declared scope, T09 depends on both so the gap can't survive past
  the e2e wave. No carve-out triggered — matches T05's own precedent for what "documented, not
  undocumented" means. `tests 0/2`, `blocking-findings 1/2` — one round, inside budget.
  → stage advances to T07 (W4, depends on T03 live + T05 checkpoint — both satisfied. T07 is
  the ticket that closes the EARS-1 gap this entry names: deletes `/connect/inbox`'s module and
  the `store.ts:574-586` call site).
- 2026-09-07 — **G4 T07 — PASSED.** Muskan reviewed the staged screenshots: *"looks fine."* This
  ticket renders (12 deletions incl. 6 `.tsx` components) — PIPELINE §3 routed it to a mandatory
  human stop, not auto-close (corrected mid-plan from an initial wrong auto-close routing, see
  `plan-checker` N1). All gates green going in: `tsc` clean, unit 510/510 exact, SQL/eslint at
  established baseline, 0 blocking from `plan-checker`/`code-review`/`critic`. `visual-verifier`
  staged the redirect (dev/prod/signed-out/390px, all confirmed), `/discover` unaffected (0
  console errors), and the T07-before-T08 dead-end on 3 still-live entry points — the sidebar
  accordion collapsing shut on the clicked item, worse than `critic`'s predicted mere highlight
  mismatch — accepted as a known, temporary rough edge, same as the two prior HEL-92 fit-check
  deviations. **Per Muskan's explicit instruction, the staged `g4/t07-*.png` screenshots were
  deleted after review** — `REVIEW.md`'s G4 staging table's evidence column citations to those
  files are now historical (the table's prose stands; the images themselves are gone). ⚠️ **One
  side-question raised at the gate was NOT explicitly ruled on** — `critic` N4's `messaging/
  types.ts` residue (its "leave for a later ticket" justification no longer holds; no ticket left
  in this slug touches that file) — stays open, same pattern as T04's two unrated side-questions.
  `tests 0/2`, `blocking-findings 0/2` — closed clean, no retries spent.
  → stage advances to T08 (W4, depends on T03 live — satisfied. Parallel-safe with T07, already
  verified disjoint; removes the exact dead-end links T07's G4 walk just surfaced).
- 2026-09-07 — **G4 T08 — PASSED.** Muskan: *"yes passed continue building."* All gates green
  going in: `tsc` clean, unit 510/510 unchanged, SQL/eslint at baseline, 0 blocking from
  `plan-checker`/`code-review`/`critic`. `visual-verifier` staged all 3 declared changes as
  confirmed, plus found the `BuyerShopView` locked-catalogue panel live (Bavaria) and
  screenshotted it, and established the arrow inconsistency has zero visual manifestation (the
  sibling pill can never render at all — structurally filtered out before this ticket). **Three
  side-questions raised at the gate were NOT explicitly ruled on** — same pattern as T04's own
  two: (1) whether the locked-catalogue CTA should retarget to `/discover` instead of staying
  dead, (2) keep-or-drop the arrow on the company "wants to connect" pill, (3) the still-open
  `messaging/types.ts` residue from T07 (now flagged a third time). All three stay open, not
  silently closed by the pass. `tests 0/2`, `blocking-findings 0/2` — closed clean, no retries
  spent.
  → stage advances to T09 (W4, depends on T06 + T07 — both live. Last ticket in the slug's
  original nine; updates the three e2e specs this build's own reviews confirmed will read red
  against the deleted `/connect/inbox` UI until this lands).
- 2026-09-07 — **G4 T09 — STOPPED, awaiting Muskan** (test-file-only, nothing renders — routed to
  a human stop anyway, on PIPELINE §3's third carve-out: "behaviour the written criteria do not
  cover." This ticket's real shape diverged substantially from TICKETS.md's description — two
  `plan-checker` rounds, 3+1 blocking findings, a mid-build scope-widening ruling obtained
  directly from Muskan — the judgment calls here exceed what an auto-close is meant to wave
  through, independent of file type). All gates green: `tsc`/unit/SQL/eslint all clean or exact
  baseline, 0 blocking from `plan-checker` (after 2 rounds)/`code-review`/`critic`. **Ran the
  actual e2e tests, not just compiled them** — all 21 tests across the 4 directly-touched files
  pass, confirmed twice (orchestrator's own run, then independently by `test-runner` inside the
  full 154-test suite). `test-runner` also surfaced a genuinely new, previously-uncatalogued
  pre-existing e2e failure class (7 tests, `present-edit-model.spec.ts`/`present-info.spec.ts`)
  unrelated to 0027 — this slug's "15 GoTrue-class failures" baseline undercounts; actual is 21.
  **Two side-questions raised at the gate — both ruled 2026-09-07: "yes Delete the dead code and
  correct the comment."** `pricingRequestNote()` deleted from `two-company.ts` (matching how this
  same ticket already handled its sibling orphan); `inbox-accept.spec.ts`'s header rewritten to
  state the real reason DEV-83's general regression is safe to drop from e2e (SQL-level coverage
  in `connection_consent_lockdown_test.sql` / `accept_connection_request_status_guard_test.sql`)
  instead of the false "no live path" claim. Both fixes dispatched to `test-writer` (test-file
  edits, never `builder`, per L-035), re-verified independently: `tsc` clean, both affected specs
  re-run and still pass (13/13, including the two highest-risk tests). `REVIEW.md`'s T09 notes 1
  and 2 marked FIXED. **G4 PASSED.** `tests 0/2`, `blocking-findings 0/2` — closed clean, no
  retries spent.
  → **T09 was the last ticket in the slug's original nine. Build phase complete** — all nine
  tickets (T01-T09) closed. W1-W4 all shipped. Next stage per the standing pipeline: `/ship`.

## For Muskan

**All five `/spec` questions are closed — see `Locked` above. What follows is what `/design`
found that you did not already know.**

- ⚠️ **The deals half of this slug fixes nothing users hit.** Two independent checker rounds
  established that `confirm_detected_deal`'s ticket branch is unreachable: detection only lands
  on `p2p` threads, and `chat_thread_p2p_has_both_people` (`20260607090003:132`) forces both
  person ids non-null there, so the counterparty is never unknown. **No deal ticket has ever been
  cut through a sanctioned route.** D1 is a dead-code deletion. The slug still earns its keep on
  the pricing half and on deleting the page — but do not expect a G5 walk to show a
  before/after on deals, because the before-state is not reachable.
- ⚠️ **Two of my own claims were wrong and were caught, not by me.** (a) I described
  `send_deal_c2c_announce_test.sql:405` backwards — it is about `deliver_deal`, asserts the
  insert *is* present, and will hard-error after the DROP; I inferred it from a grep line without
  opening the block. (b) I claimed `e2e/fixtures/two-company.ts` reaches `claim_deal_ticket`; it
  does not — I inherited that from research and never verified it. Both are recorded in ADR §9.
- ⚠️ **OQ1 was put to you on a false premise.** I said the row would show no product name. It
  already does — `buildPricingRequestNote` writes `Pricing request for "X".` into `note`, which
  is already selected and already rendered. Your ruling produced the right code; the reason I
  gave was inverted.
- **The checker loop did not converge** (round 2 still raised new rung 1-3 findings). You
  approved anyway and declined a third round. If a build ticket surfaces something ugly in D2's
  RPC or the backfill, that is the likeliest place it hides.
- **A parallel session's `20260903090000_msg_all_sender_attribution_gate.sql` is local-only** and
  will ride to production on 0027's first `db push`. Desirable, but it must be a decision, not a
  surprise — and a "roll back 0027" is not a rollback of only 0027.
- **Two things found in passing, not filed:** `supabase/functions/sella-detect/index.ts:91-96`
  does not filter `chat_thread.type`, so a direct POST could reach a detection path every
  sanctioned route gates to p2p. And `deal_workspace.visibility` is client-updatable under
  `ws_all`, so a party can flip a workspace to `private` and lock the counterparty out — after
  the DROP there is no recovery path. Both belong in `/track-doubt`.
- ✅ **Three more found during T05's build — filed 2026-09-06** to Linear team "Codebase
  Development Tickets" (not `/track-doubt`, which is scoped to LAYER-*.md product doubts and has
  no home for engineering findings tied to code files, not docs). (a)
  [HEL-89](https://linear.app/hellosello/issue/HEL-89) — `confirm_detected_deal`'s idempotent
  "already born" early-return (`20260903120000_…sql:79`) runs BEFORE the participant guard — any
  authenticated caller who obtains a `deal_detected` message id can read back its `deal_card_id`
  for a deal they have no relationship to. Distinct from the already-known NULL-guard bypass on
  the same function. Pre-existing, unchanged by anything in this slug. (b)
  [HEL-90](https://linear.app/hellosello/issue/HEL-90) — a genuine race in T02's
  `request_product_pricing_c2c` (already shipped, G4-approved): the dup-guard's
  `EXISTS`-then-`INSERT` has no unique constraint or lock between them, so a double-click or
  retried request can produce two identical chat messages — violates locked invariant I-M13 under
  concurrency, which T02's sequential SQL suite couldn't have caught. A real regression against a
  signed invariant, not just a note. (c) [HEL-91](https://linear.app/hellosello/issue/HEL-91) —
  `shares_connection_with_company` has no `status`/`deleted_at` filter on `pending_inbox_item` —
  a rejected or soft-deleted
  request appears to grant person-visibility permanently. Pre-existing, unrelated to this slug.
  Full detail on all three: `REVIEW.md`'s T05 section, notes 10/12/20.
