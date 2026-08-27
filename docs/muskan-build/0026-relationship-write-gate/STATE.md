# 0026 relationship-write-gate — work order

lane:   FULL
branch: claude/muskan/work
stage:  triage ✅ → census ✅ → interview ✅ → PRD ✅ → ADR ✅ (2 checker rounds) → G3 ✅ (Muskan, 2026-08-26) → plan written ✅ → plan-checker ✅ (6 rounds: 4→2→2→1→1→0 blocking) → test-writer ✅ → builder ✅ → e2e ✅ → critic ✅ → security found 1 blocking (client-controlled type bypass) → §12 addendum written, Muskan ruled fix-properly → plan-checker on §12 (next)

## Seed
Muskan, 2026-08-26. Origin: HEL-84 (Linear), High priority. Found by `security` review
during HEL-82's build, 2026-08-25. Deliberately NOT fixed as part of HEL-82 — that
ticket's build was already large, and this needs its own careful pass.

**The problem, in one sentence:** HEL-82's acceptance criteria promised that suspending a
relationship blocks new deals, new messages, AND new pricing asks — only the "new deals"
half shipped (`send_deal` + `confirm_detected_deal` + `accept_connection_request` all
gained relationship-liveness checks). Chat messages and pricing asks have **zero**
relationship-status check anywhere, and `authenticated` holds `INSERT` on both
`chat_message` and `pending_inbox_item` directly — reachable via a direct PostgREST call,
not only through the app.

**Why now, not later:** suspension was unreachable before HEL-82 — this exact gap
couldn't be exploited because nothing could ever put a relationship in a non-active
state. HEL-82 makes `suspended`/`ended` real, so the gap is live today, not latent.

## Triage — the YES answer
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | HEL-82 (which created the exploitable state) is the sibling ticket, not this one — this is a design-completeness gap, not a regression |
| 1 | new screen or surface? | NO | |
| 2 | migration / RLS / RPC / auth? | **YES** | `msg_all` `WITH CHECK`, and `createPairInboxItem`/`requestProductPricing`/`inbox_insert` `WITH CHECK` |
| 3 | concept not in CONTEXT.md? | NO | relationship status already documented |
| 4 | changes what the product does? | **YES** | who can write, not just who can read |
| 5 | file locked elsewhere? | NO | both sync files clean |
| 6 | more than one ticket? | possible | two independent doors (chat insert, pricing-ask insert) — `/design` to confirm |

## What needs deciding — NOT an engineering call (per the ticket itself)
1. `is_relationship_member()` is shared by reads that must stay open (historical records
   readable) and the one write path that shouldn't (`msg_all`, `FOR ALL`). A status
   predicate needs to land on the `WITH CHECK` only, not the shared function — mirrors
   `20260825120000_msg_all_deal_detected_gate.sql`'s precedent.
2. Whether "new pricing ask" also covers an existing pricelist becoming
   visible/orderable, or just the initial connection/pricing REQUEST. **This is a product
   read of the AC's intent — yours.**

## Census (L-037), done 2026-08-26 — read-only, no code touched

**`pending_inbox_item` INSERT — two client-side writers, both under ONE policy.**
`createPairInboxItem` (`discover/actions.ts:35`, called by `sendConnectRequest` and
`requestProductPricing`) and `sendPersonConnectRequest`
(`discover/personActions.ts:22`) both write through the same `inbox_insert` RLS policy
(`20260607170000` + narrowed by `20260823090000:306`) — one predicate change covers
both callers. **Precedent already exists**: HEL-75 added a deactivation/deletion check
to this exact policy (`actions.ts:90-93`'s comment cites it), so a status predicate
follows an established pattern, not a new one.
Server-side: `deliver_deal.sql:53` (Sella's delivery door) also inserts here, and its own
comment (`:20`) says it's `SECURITY DEFINER` **because** the RLS-based sender check
doesn't fit its caller shape — meaning **this one insert bypasses `inbox_insert`
entirely** and needs its own explicit check, not the shared predicate.

**`chat_message` INSERT — four client-side writers, all under ONE policy (`msg_all`,
`FOR ALL`).** `postMessage` (`store.ts:470`, the actual user-composed message door),
`postDealMessage` (`store.ts:500`), the accept-flow bulk seed-line insert
(`store.ts:646`, inside `acceptInbox` — the same code region HEL-68 is about to move),
and `announceDealEvent` (`deals/actions.ts:683`, called by decline/sign/propose/confirm/
withdraw/negotiation/promotion). One `WITH CHECK` predicate on `msg_all` would cover all
four.

**🔴 The finding that changes the fix's shape: most `chat_message` writers are NOT
client-side at all.** At least a dozen migrations define `SECURITY DEFINER` RPCs that
insert into `chat_message` directly in SQL — `send_deal`, `propose_deal_rpc`,
`confirm_deal_change_announce` (+ its notes/margin-carry/negotiation-membership
siblings), `create_deal_draft_rpc` (+ its notes/delivers/retire-private-box/two-owner
variants), `deal_line_item_batch`, `deal_event_system_voice`. **The repo's own migration
comments confirm RLS does not reach these**: `confirm_deal_change_announce.sql:19` says
outright *"SECURITY DEFINER bypasses the chat_message sender restriction"*, and
`propose_deal_rpc.sql:13` says the RPC's own thread-membership check exists **because**
RLS can't do that job for it. **Only two of these are known-gated today**: `send_deal`
(HEL-74's `20260825180000_send_deal_relationship_liveness_guard.sql`) and its 0023
rewrite (`20260825090000_send_deal_c2c_announce.sql`).
So: **a `WITH CHECK` predicate on `msg_all` alone would gate `postMessage` and nothing
else that matters** — every deal-lifecycle chat write goes through an RPC that bypasses
it. The fix needs a per-RPC liveness check (HEL-74's pattern, repeated), not one shared
predicate — or a shared internal function every RPC routes through, which doesn't
currently exist (checked: no `insert_chat_message`/`_post_message` helper found).
**Not yet done, and it's real `/design` work, not census:** deduplicating that RPC list
down to the currently-live function bodies (several of those files are historical
`create or replace` layers on the same function name, not 12 distinct live writers) and
confirming each one's actual reachability.

## Interview — decisions locked 2026-08-26 (all three answered)
1. **Pricing-ask scope → NEW requests only.** Suspending a relationship blocks new
   connect/pricing requests; pricing the buyer already had access to keeps working
   unchanged. Not a read/visibility change — insert-gate only.
2. **RPC gate shape → ONE shared check function, called from all ~12 write sites** —
   not 12 independent inline checks, and not a hunt for a different mechanism. Grounds:
   general data-layer security guidance (single validation point in the data-access
   tier) + this repo's own L-057 ("import the predicate, don't restate it"). `/design`
   writes the function once, wires it into every call site.
3. **Sella's `deliver_deal` → gets the same check, no exemption.** A suspended
   relationship is frozen for automated delivery the same as for a human send.

Next: hand to `/design` — which now has a concrete target shape (one shared assertion
function) rather than an open architecture question. G3 (your real approval gate)
still applies once the ADR is drafted.

## Files so far (added)
- `docs/PRD/0026-relationship-write-gate.md` — written 2026-08-26, from the census +
  the three locked interview answers above. **Corrected 2026-08-26** after approaches
  research: the function returns `boolean`, not `void` (a `void` function can't
  appear in an RLS `WITH CHECK`), and `pending_inbox_item` has no `relationship_id`
  column — the `inbox_insert` policy must derive it from the company pair.
- `docs/muskan-build/0026-relationship-write-gate/RESEARCH.md` — approaches research,
  2026-08-26. Deduplicated the census's ~12 flagged migrations down to real call
  sites: 2 RLS policies, 2 functions to REFACTOR (extract their already-duplicated
  inline check into the new shared function), 2 functions to newly gate
  (`deliver_deal`, `propose_deal`), 1 excluded (`create_deal_draft` no longer
  touches `chat_message` at all, confirmed live), 1 flagged open below.

## Two more questions, ruled 2026-08-26
- **In-flight held changes → let them resolve.** `confirm_deal_change` is
  explicitly excluded from the gate (PRD AC7) — resolving something already
  pending when suspension happens is not a "new" write.
- **`announceDealEvent` (system deal-lifecycle announcements) → also excluded**,
  found by `adr-checker` round 1, same reasoning as the above (PRD AC8).

## Locked (from ADR 0008, approved at G3)
1. One function, `assert_relationship_writable(p_relationship_id uuid) RETURNS
   boolean` — `RETURNS void` was the original draft and is wrong (can't appear in
   an RLS `WITH CHECK`). Returns `true`, always raises on failure.
2. **NULL relationship id → allow** (not an error) — covers pre-connection writes,
   company-less p2p threads, and `group` threads, none of which are suspendable.
3. **Membership check with a `service_role` carve-out**: a non-party
   `authenticated` caller gets the same "not found" message as a nonexistent id
   (closes a real probe/leak); `current_company_id() IS NULL` (i.e. `service_role`
   — Sella's edge functions) skips the membership check entirely, since
   `service_role` already bypasses RLS system-wide and has no company context to
   check against.
4. Call sites: `msg_all` + `inbox_insert` (RLS, new `WITH CHECK` term) ·
   `send_deal` + `confirm_detected_deal` (REFACTORED off their existing duplicated
   inline check, `create or replace` never `drop`+`create`) · `deliver_deal` +
   `propose_deal` (NEW gate) · `accept_person_connection` (no call needed — always
   creates NULL-relationship threads) · `sella-detect` + `sella-summarize` (new
   TypeScript-side calls, found by `adr-checker` round 1, invisible to the
   original RPC-only census).
5. Excluded, by ruling not oversight: `create_deal_draft` (verified — touches
   neither table anymore), `confirm_deal_change`, `announceDealEvent`.
6. `propose_deal` **was** in an earlier call-site draft as a function that doesn't
   exist — corrected: it's real (confirmed live, writes `chat_message`), the
   round-2 checker's claim otherwise was itself wrong. Do NOT re-remove it.

## Deferred (from the PRD's Out list + ADR)
- Any change to `is_relationship_member()`.
- Existing/already-shared pricing becoming unusable on suspension (ruled out —
  new requests only).
- `requestActionError.ts` needs one new entry for the new raise message — named
  as a `/build` task, not done here.
- 0024's own migration — this ADR only re-targets its `store.ts:646` census entry
  once 0024 ships (already approved, sequenced first).

## Attempts
- **census, 2026-08-26** — read-only, L-037. Found the fix needs a per-RPC pattern,
  not one RLS predicate — most `chat_message` writers are `SECURITY DEFINER` RPCs
  RLS never reaches.
- **research (approaches), 2026-08-26** — deduplicated the census's ~12 flagged
  migrations to real live call sites; found `pending_inbox_item` has no
  `relationship_id` column and the PRD's `RETURNS void` was a type error waiting
  to happen.
- **design, 2026-08-26** — ADR 0008 drafted. `adr-checker` round 1: 6 blocking
  (would have broken Discover's Connect button + all group chats on a legitimate
  NULL relationship; a real leak letting any user probe relationship status;
  `accept_person_connection` missing from the census; two Sella edge functions
  invisible to the RPC-only census) + notes, all folded in. `adr-checker` round 2:
  2 blocking (the round-1 security fix broke the round-1 Sella fix — `service_role`
  has no company context, so every Sella write would have raised "not found" even
  on active relationships; `propose_deal` was independently re-verified as real
  after the checker claimed otherwise) + notes, all folded in. Budget exhausted at
  2 rounds per `/design`'s own rule.
- **`/build`, 2026-08-26/27** — `PLAN-HEL-84.md` written: 1 new shared function,
  2 RLS policy rewrites, 2 RPC refactors, 2 new RPC gates, 2 edge-function
  TypeScript changes, 1 client-side error-message addition. Every citation
  (live policy/function bodies, edge-function structure, schema) re-verified
  fresh before writing, not inherited from the ADR's design-time research.
  `plan-checker` round 1: **4 blocking, not yet fixed** —
  (B1) plan's §5 resurrects `propose_deal`, which ADR 0008's own Blast-radius
  section already found DROPPED (`20260724120800_drop_propose_edit_rpcs.sql
  :18`) — a fresh grep only checked for the `CREATE`, missed the later
  `DROP`, silently regressing a decision the ADR had already made and had
  been checked twice. Root cause + rule written to `LEARNINGS.md` **L-063**:
  an approved ADR's own findings are authoritative, don't re-derive
  citations from scratch.
  (B2) §4/§5's "re-emit verbatim" instructions for `deliver_deal` and
  `confirm_detected_deal` would literally copy the cited migration's own
  trailing `GRANT ... TO authenticated` (later revoked, WR-01) / leading
  `DROP FUNCTION IF EXISTS` lines — needs explicit wording that "verbatim"
  means the function body only, never the source migration's own leading
  DROP or trailing GRANT/REVOKE.
  (B3) `announceDealEvent` (`actions.ts:683`) writes through the exact same
  `msg_all` RLS door §2 is about to gate — PRD AC8 declares it exempt but
  the plan does nothing to keep it exempt in practice, so it would start
  silently failing (the write's own error handling swallows via
  console.error only). Needs a `type`-based exemption added to `msg_all`'s
  `WITH CHECK`, mirroring the existing `type <> 'deal_detected'` carve-out —
  the exact `type` values `announceDealEvent` writes need re-confirming
  from `actions.ts` (around `:663-667`) before writing the SQL.
  (B4) zero tests planned, despite ADR 0008 requiring its 10 invariants be
  machine-checkable — needs a full test section covering AC1-AC6, naming
  the three pre-existing suites already in the blast radius
  (`send_deal_relationship_liveness_test.sql`,
  `confirm_detected_deal_relationship_liveness_test.sql`,
  `deliver_deal_test.sql` — checker confirmed the new raise text still
  satisfies their existing assertions unchanged).
  Plus 11 notes, several worth folding in on the next pass: the gate call
  in both edge functions is placed too late (should move before the
  Bedrock call and the idempotency-claiming insert in `sella-detect`, and
  before the Bedrock call and the `deal_card_log` insert in
  `sella-summarize`, to avoid a half-write); a wrong stated reason for why
  `deliver_deal` needs gating; a miscounted `postDetectedMessage` caller
  count; a wrong line count for `requestActionError.ts` (58, not 41);
  `service_role` grant preservation not mentioned; ADR Invariant 15 not
  carried into the plan; `msg_all` being `FOR ALL` (so the new term also
  governs `UPDATE`, not just `INSERT`) not stated.
  **Next:** fix `PLAN-HEL-84.md` for B1-B4 + the worthwhile notes above,
  re-spawn `plan-checker` round 2.
- **`/build`, 2026-08-27** — `PLAN-HEL-84.md` fixed for all 4 round-1 blocking
  findings + 7 of 11 notes (gate-call placement in both edge functions moved
  before their Bedrock calls; a wrong `postDetectedMessage` caller count
  corrected 3→2; `requestActionError.ts`'s line count corrected 41→58;
  `service_role` EXECUTE grant added explicitly; ADR Invariants 13/15 carried
  forward as in-plan/in-SQL-comment caveats; `msg_all`'s `FOR ALL` scope
  stated plainly). B1 (`propose_deal`) removed from §0/§5/§9/§10, not
  replaced. B2 ("verbatim") now states explicitly that a source migration's
  own leading `DROP`/trailing `GRANT`/`REVOKE` are never re-emitted — cited
  concretely against `deliver_deal`'s own later-revoked grant. B3
  (`announceDealEvent`) closed with a `type IN (...)` OR-branch in `msg_all`'s
  `WITH CHECK`, using the ADR's confirmed four-member type union. B4 closed
  with a new §8 mapping every ADR Invariant 1-10 to where it gets tested,
  naming the 3 pre-existing suites needing only an assertion-text
  reconfirmation (not a rewrite) and declaring the Sella edge functions' own
  gap (no TS test harness exists) rather than leaving it silent. 4 notes not
  folded in (2 required checker-level SQL-compile verification this plan
  can't self-certify; 2 needed the checker's own original wording to
  address precisely, which STATE.md's summary didn't carry) — left for round
  2 to re-flag if still open.
- **`plan-checker` round 2, 2026-08-27** — REVISE: **2 blocking.** B1: §8
  claimed AC4/`deliver_deal` coverage was already proven transitively —
  false on every count (no suspended-relationship cell existed anywhere,
  neither Sella function calls `deliver_deal`, and `send_deal` stopped
  calling it back in an earlier August migration). B2: the new
  `assert_relationship_writable_test.sql` suite had no named runner script
  — this repo's own rule is a suite without a runner isn't coverage. Plus
  8 notes, one real and non-trivial (N3: the `msg_all` exemption relied on
  SQL `OR` short-circuit for a side effect, which Postgres explicitly
  disclaims as unreliable evaluation order).
- **`/build`, 2026-08-27** — fixed all round-2 findings: B1 (§0/§5's
  `deliver_deal` reachability claim corrected to `confirm_detected_deal`
  only; §8's false transitive-coverage claim replaced with a new required
  test cell in `deliver_deal_test.sql`), B2 (named the runner script,
  `run_assert_relationship_writable_test.sh`), N1 (reachability, folded
  into B1's fix), N2 (`chat_message` UPDATE/DELETE grant claim was
  inverted — corrected), N3 (`OR` → `CASE` in `msg_all`'s SQL), N5 (§4's
  "one delta" corrected to three, each named), N6 (the `service_role` test
  cell needs an explicit JWT-claims reset or it silently tests the wrong
  branch), N7 (resolved the open `sella-summarize` two-thread question —
  provably sufficient, traced), N8 (the `service_role` grant's stated
  reason was wrong even though the grant itself was already correct;
  corrected). N4 declared as a non-blocking gap (chat-door user-facing
  message, PRD AC1 doesn't require it) rather than fixed. **Next:**
  re-spawn `plan-checker` round 3.
- **`plan-checker` round 3, 2026-08-27** — REVISE: **2 blocking, both real
  correctness/security issues, not documentation quality.** B1: the
  membership check discriminated `service_role` from `authenticated` using
  `current_company_id() is null`, which is ALSO null for any real signed-in
  person with no company yet (nullable by this repo's own v0 design) — a
  company-less caller could pass the check unconditionally and probe any
  relationship's existence/status. B2: the new `deliver_deal_test.sql` cell
  (from round 2's B1 fix) was structurally incompatible with that file —
  wrong position (would leak the status flip into later cells), wrong
  exception-handling shape (would abort the whole suite under
  `ON_ERROR_STOP=1`), two unstated preconditions (privileged role needed for
  the flip; inherited JWT claims). Plus 8 notes.
- **`/build`, 2026-08-27** — fixed both blocking: B1 (discriminator changed
  to `auth.uid() is null`; added a distinct company-less-caller test cell
  so the fix has its own regression guard, not just the pre-existing
  third-company-caller cell). B2 (repositioned as the file's true last cell
  or via SAVEPOINT; switched to the file's own exception-catching DO-block
  shape; stated the privileged-role and inherited-claims preconditions
  explicitly; added the missing "fixture is active at start" assertion).
  All 8 notes folded in: N1 (named, not fixed — the outer AND chain has the
  same unguaranteed-order property as the CASE fix, no security consequence,
  §7/§8 should assert "refused" not a specific error shape), N2 (a citation
  for a resolved question pointed at a superseded migration — corrected to
  the live one, conclusion unchanged), N3 (the "fixture active" citation was
  wrong — fixed, folded into B2), N4 (named the two existing suites/runners
  to extend for `msg_all`/`inbox_insert`, same class as round 2's B2), N5
  (stated `requestActionError.ts`'s real path + its co-located test file,
  both previously unstated), N6 (branch count re-corrected — 4 total, not 3;
  also fixed a line-number discrepancy between round 1's and round 3's own
  citations by re-verifying against the live file directly), N7 (named
  0024's new `chat_message` writer — already self-guarded, no gate needed —
  and clarified two PRD-census entries are `create or replace` layers on the
  already-excluded `confirm_deal_change`), N8 (named a real, chosen
  behavioral divergence: a suspended relationship still gets the SQL-side
  deal-change announcement but not Sella's parallel summary of it).
  **Next:** re-spawn `plan-checker` round 4.
- **`plan-checker` round 4, 2026-08-27** — REVISE: **1 blocking, 4 notes.**
  Confirmed round 3's B1/B2 fixes hold under independent re-derivation
  (not just re-statement). B1: §8's test-cell hardening (position, role,
  exception shape, "flip actually took" assertion) was applied to
  `deliver_deal_test.sql` only — the two OTHER suite extensions in the same
  §8 (`msg_all_deal_detected_gate_test.sql`, `inbox_insert_receiver_gate_
  test.sql`) needed the identical four fixes and had none of them, including
  one cell that would have passed vacuously. 4 notes: N1 (§3's `or` is
  actually safe, unlike §2's, but for an unstated reason — reads as
  self-contradicting without it), N2 (seed line citations off by one), N3
  (an unnamed side effect: gating `sella-detect` early also means no
  `sella_detection` memory row for a suspended-relationship run), N4 (new
  migration timestamps must sort after the tip, which moved when 0024
  shipped mid-plan).
- **`/build`, 2026-08-27** — fixed B1 by applying the same four-point
  structural fix (position, role, exception shape, flip-verification) to
  both remaining suite extensions, including how to derive each file's
  relationship id (neither fixture carries one today). N1-N4 folded in.
  **Next:** re-spawn `plan-checker` round 5.
- **`plan-checker` round 5, 2026-08-27** — REVISE: **1 blocking (genuinely
  new information, not re-litigation), 4 notes.** Confirmed round 4's fixes
  hold under fresh re-derivation of both suite extensions (position,
  derivation, exception shape all verified against the live files). B1: §3's
  new gate breaks a SIXTH suite the plan never censused —
  `accept_connection_request_status_guard_test.sql` mints a pricing request
  onto an already-suspended pair as `authenticated` with no exception
  handler; the checker independently censused all 12 suites that write
  `chat_message`/`pending_inbox_item` and confirmed this is the only one
  that breaks. 4 notes: N1 (a stale line number, `:239` past a 237-line
  file), N2 (the claims active at the new `msg_all` cell's insertion point
  are Carol's, not stated), N3 (the `inbox_insert` Invariant-13 cell's pair
  choice collides with the AC3 cell earlier in the same file, which already
  suspends it), N4 (both suites' pass banners go stale).
- **`/build`, 2026-08-27** — fixed B1: the existing suite needs a REORDER
  (mint the pending item before suspending, not after) — not a workaround
  but the more correct test of what that suite's own RPC-level guard
  actually protects (a request that predates suspension, refused at accept
  time). N1-N4 folded in.
- **`plan-checker` round 6, 2026-08-27 — OK.** Re-derived everything from
  the live tree rather than trusting rounds 1-5, including independently
  re-censusing all suites touching `chat_message`/`pending_inbox_item`
  writes from scratch (confirming round 5's finding was complete — no
  seventh suite — and correcting one misclassification: `send_deal_c2c_
  announce_test.sql` doesn't write either table, it string-probes a
  function body §5 rewrites, a different blast-radius class). Verified the
  round-5 reorder fix works against the real file end to end, including
  that §§B-E are genuinely untouched. **5 non-blocking notes, all folded
  in:** N1 (AC1/AC2 collapse to one cell — indistinguishable at the SQL
  layer), N2 (named the `deliver_deal_test.sql` cell's active claims —
  Bob's), N3 (the reorder leaves 5 stale comments asserting the old
  semantics), N4 (§5's membership predicate is a real behavior change for
  `deliver_deal`, unlike §4's redundant-but-harmless one for the other two
  RPCs — the reasoning doesn't transfer and shouldn't be silently
  inherited), N5 (named `send_deal_c2c_announce_test.sql`'s text-assertion
  dependency explicitly, so a future reformat of `deliver_deal` doesn't
  break it for an unpredicted reason).
- **`/build`, 2026-08-27** — all 5 notes folded in. **Plan converged after 6
  `plan-checker` rounds** (findings across rounds: 4 blocking → 2 → 2
  (incl. a real security fail-open for company-less callers) → 1 → 1 (a
  6th uncensused suite) → 0). **Next:** `test-writer` writes failing tests
  from this plan, then `builder` implements.
- **`test-writer`, 2026-08-27** — wrote/extended 5 SQL suites (new:
  `assert_relationship_writable_test.sql` + its runner; extended:
  `msg_all_deal_detected_gate_test.sql`, `inbox_insert_receiver_gate_
  test.sql`, `deliver_deal_test.sql`; reordered:
  `accept_connection_request_status_guard_test.sql`, all 5 stale comments
  rewritten) plus 5 new cases in `requestActionError.test.ts`. Confirmed by
  reading (not running) that `send_deal_relationship_liveness_test.sql`/
  `confirm_detected_deal_relationship_liveness_test.sql` need no edit — the
  plan's own claim about their assertions already matching held. Caught and
  fixed its own bug while writing: a new temp table needed a `GRANT` it
  hadn't been given, matching this repo's existing precedent for the same
  pattern.
  **RED independently verified by the orchestrator (L-023), not taken on
  trust:** fresh `db reset`, all 4 gate-dependent suites fail for the
  expected reason (the function/check doesn't exist yet) — the reordered
  guard suite correctly stays GREEN (it's a companion fix, not a new-gate
  proof). `requestActionError.test.ts`: 4/5 new cases RED, 1 green by
  design (a forward-looking non-match regression guard). Full-suite check
  for collateral damage: 55/59 SQL suites pass (exactly the 4 expected
  fail, nothing else), 475/479 vitest (same), `tsc` clean.
  **Next:** `builder` implements PLAN-HEL-84.md against these tests.
- **`builder`, 2026-08-27** — implemented §1-§7 exactly: 6 new migrations
  (`20260827090000`-`140000`, verified against the actual tip before
  timestamping), the two Sella edge-function RPC calls at the plan's exact
  insertion points, and `requestActionError.ts`'s two new branches. No
  deviations from the plan's file set. **Caught and correctly did NOT
  silently fix a real bug in the test file itself** (§G's `service_role`
  cell reads a temp table only granted to `authenticated`) — proved the
  implementation was correct against every assertion via a scratchpad-only
  diagnostic, then flagged it rather than editing the test.
  **Verified independently by the orchestrator (L-023):** fixed the
  test-fixture bug (one `GRANT` line), fresh `db reset`, **59/59 SQL suites
  green**, **479/479 vitest**, `tsc` clean, eslint zero new issues (same 6
  pre-existing errors/13 warnings as 0024's baseline, zero overlap with
  0026's touched files). Full e2e run in progress for a regression check
  against this session's freshly-established baseline (RLS changes on
  `chat_message`/`pending_inbox_item` touch many flows, even though this
  slug adds no rendered surface of its own). `security` review spawned in
  parallel (mandatory — migrations/RLS/RPC).
  **e2e: clean.** 21 failed / 9 skipped / 8 did not run / 117 passed —
  identical failure set to this session's already-established 0024
  baseline (same 20 files, one fewer flake), zero overlap with anything
  0026 touches. The highest-risk specs for this diff
  (`discover.spec.ts`, `discover-shop.spec.ts`, `inbox-accept.spec.ts`,
  `admin-verification.spec.ts`) all passed clean.
  **`critic`: clean on all three things it owns** — AC1-AC8 verified true
  in the shipped code (not just claimed), no scope creep, ADR 0008's
  Reused fence intact (`is_relationship_member()` untouched, `USING`
  clauses untouched, grant-preservation held under both `create or
  replace` refactors). 5 non-blocking notes for the G5 walk list, none
  requiring a code change: N1 (the 4-type `announceDealEvent` exemption is
  keyed on a client-supplied `type` column — a thread member on a
  suspended relationship could in principle post arbitrary text tagged as
  one of the 4 exempt types, compounding the already-open HEL-67 Gap 2
  forgeable-sender issue; implemented exactly as ADR 0008 approved, not a
  build defect, but worth knowing), N2 (an `ended` relationship's
  user-facing message says "until it's reactivated," which doesn't apply
  to a terminal state), N3 (AC5/AC6 — read paths unaffected — are argued
  structurally, not asserted by any test; belongs on the G5 walk), N4 (the
  two Sella edge-function gates have zero automated coverage and their
  error handling can't distinguish "relationship not writable" from a
  genuine RPC failure — both fail closed to an HTTP 200 either way), N5
  (ADR 0008's own prose has an internal tension between Locked #3 and
  Invariant 16 — the code matches both rulings, the ADR's wording is what
  reads as contradictory).
- **`security`, 2026-08-27** — **1 blocking (rung 2, live-proven exploit),
  6 notes.** B1: §2's four-type `announceDealEvent` exemption is keyed on
  `chat_message.type`, a fully client-controlled, unconstrained column —
  `authenticated` can insert/update with any `type`, so a thread member on
  a SUSPENDED relationship bypasses the entire write gate by setting
  `type` to one of the four exempt values. Proved live: identical insert,
  only `type` changed from `'message'` to `'deal_signed'`, went through.
  Also defeats the UPDATE side (`msg_all` is `FOR ALL`) — an existing
  message can be retyped to bypass the gate retroactively. All other S1-S8
  checks PASS on the local stack; S6/S8's remote halves owed at `/ship`.
  Independently re-verified the round-3 fail-open fix is real in the LIVE
  catalog body (`pg_get_functiondef`), not just the file, via a live probe
  with a company-less caller against a suspended relationship. 6 notes:
  N1 (the `connect_person` door bypasses suspension entirely via a
  permanently-NULL relationship_id — pre-existing, plan declares it
  out of scope, but `assert_relationship_writable`'s own comment claiming
  "none are suspendable" is inaccurate of this population), N2 (the gate
  also blocks a member soft-deleting/editing their own message — probably
  fine, should be a deliberate ruling), N3 (group threads are entirely
  ungated, pre-existing), N4 (proposing a change AND its chat pill both
  survive suspension — two separately-correct exclusions composing into a
  whole bypassable flow), N5 (misleading refusal text for a soft-deleted
  relationship's member), N6 (S6/S8 remote checks owed at ship).
  **Muskan's ruling: fix properly** (not downgrade AC2/AC8's enforcement
  claim) — matching this repo's own established precedent (HEL-67 Gap 1,
  and 0024's `send_deal` fix for the identical shape): move
  `announceDealEvent` into a `SECURITY DEFINER` RPC, which bypasses RLS
  entirely and needs no client-facing exemption. Written as **§12,
  addendum** to `PLAN-HEL-84.md` (real new scope beyond the 6-round-checked
  plan — its own function, own membership check, own tests, deletes
  `announceDealEvent`/`resolveActorName` from `actions.ts`). **Next:**
  `plan-checker` on §12, then `test-writer`/`builder` for the addendum,
  then re-verify `security` clean before G4.
- **`plan-checker`, §12 round 1, 2026-08-27** — REVISE: **4 blocking, 8
  notes.** Confirmed the core design sound (exploit genuinely closed once
  built, Invariant 16 survives, fail-soft trace holds end to end, in-place
  migration edit confirmed safe against the real production tip). B1: the
  §F5 test spec claimed the four types must be refused on ANY relationship
  — false, self-contradicts this suite's own existing active-relationship
  control. B2 (the substantive one): the visible-thread resolution matched
  ANY p2p thread on the relationship, not the caller's own pair — on a
  relationship with ≥2 person pairs, the announcement could land in a
  private 1:1 between two OTHER people. B3: the TS snippet wouldn't
  compile (RPC not in the generated types, no cast). B4: the new suite had
  no runner named. 8 notes, including a real inverted-logic bug in the
  addendum's own NULL-safety reasoning (right conclusion, backwards
  explanation — a future editor trusting the wrong explanation could
  remove the actual guard) and a scope-overstatement about what the fix
  closes.
- **`/build`, 2026-08-27** — fixed all 4 blocking: B1 (corrected F5's scope
  to suspended-only, matching its existing position; named 4 more stale
  comments in the same file beyond F5 itself), B2 (restricted the p2p
  lookup to the caller's own person pair, matching `send_deal`'s own
  established precedent for the identical shape), B3 (switched to this
  file's own `as never` cast pattern, matching `propose_deal_change`'s
  precedent at `actions.ts:529-536`), B4 (named
  `run_announce_deal_event_test.sh`, plus a new required test cell for the
  B2 regression itself). All 8 notes folded in: N1 (fixed the inverted
  NULL-safety explanation), N2 (confirmed, no fix needed), N3 (named the
  4 additional stale references), N4 (kept the two dead `deal_card` reads
  deliberately rather than changing behavior as a side effect, named as a
  future cleanup), N5 (named the client-only D-08 guard explicitly), N6
  (fixed the evidence citation for "never shipped"), N7 (corrected an
  overstated closure claim), N8 (added the missing `deleted_at` filters).
  **Next:** re-spawn `plan-checker` on §12.
- **`plan-checker`, §12 round 2, 2026-08-27 — OK, 0 blocking.** Confirmed
  the round-1 fixes hold under fresh re-derivation, including the
  substantive one (B2's p2p restriction traced through all 4 real call
  sites against live schema/seed). 7 non-blocking notes, all folded in:
  N1 (the "matches send_deal's precedent" claim overstated its own
  precision — corrected, and the residual multi-pair-membership edge case
  named as pre-existing, not a regression), N2 (the migration's own
  31-line header comment justifies a mechanism that no longer exists —
  flagged for rewrite alongside the policy comment), N3 (one more stale
  test-file reference, plus a pre-existing wrong comment sitting inside
  the same block being rewritten, fixed opportunistically), N4 (a factual
  error — "create_deal_draft mints the deal thread" — already contradicted
  by this plan's own §10; corrected, with the real consequence named: the
  RPC's deal-thread arm is near-always NULL in production since that
  migration retired the insert), N5 (documented why the RPC's two-message
  error split doesn't need §1's message-collapse doctrine — a `deal_card`
  UUID is the effective bar here, not the message text), N6 (named 3 docs
  — ADR 0008, the PRD, ARCHITECTURE-NOTES — that describe the now-retired
  mechanism and owe a wrap-time amendment pass, not blocking the build),
  N7 (named the actual test-mocking precedent to follow and the specific
  e2e spec this diff's writer-change affects).
  **§12 is buildable. Next:** `test-writer` for §12's tests, then
  `builder`, then re-verify `security` clean before G4.
- **`test-writer`, §12, 2026-08-27** — rewrote `msg_all_deal_detected_gate_
  test.sql`'s F5 cell (now asserts refusal on the suspended relationship,
  per-type, catching P0001 not 42501) plus 6 other stale references in the
  same file including the pre-existing "Carol's"→"Alice's" comment bug;
  wrote `announce_deal_event_test.sql` + its runner (6 sections: non-party,
  company-less, invalid type, happy path, the B2 multi-p2p-pair regression
  guard, and the Invariant-16 suspended-relationship exemption); wrote new
  `src/modules/deals/actions.test.ts` (no prior test file for this module
  — followed `basket/actions.test.ts`'s mocking precedent), covering all
  4 call sites' fail-soft wrapping.
  **RED independently verified by the orchestrator:** fresh `db reset`,
  both SQL suites fail for the expected reason (the old exemption is still
  live; the new function doesn't exist), 4/4 new vitest cases fail for the
  expected reason (still calling the old code paths, `announce_deal_event`
  never invoked). No collateral damage: 58/60 SQL, 479/483 vitest, tsc
  clean. **Next:** `builder` implements §12 against these tests.
- **`builder`, §12, 2026-08-27** — implemented §12.2-§12.4 exactly, no
  deviations, no rejected findings. New migration
  `20260827150000_announce_deal_event.sql` (the RPC, verbatim to §12.2).
  `actions.ts`'s four call sites rewired to the RPC via the `as never`
  cast precedent; `announceDealEvent`/`resolveActorName` deleted.
  `20260827100000_msg_all_relationship_write_gate.sql` edited in place —
  `CASE` removed, plain check, header rewritten.
  **Verified independently by the orchestrator (L-023):** fresh `db
  reset`, **60/60 SQL suites**, **483/483 vitest**, `tsc` clean, eslint
  exactly 2 new warnings (both `card` unused in `actions.ts`, deliberately
  kept per §12.3, warn-level only — matches builder's own report),
  `e2e/deal-change.spec.ts` 19/19 passing including both pill-text specs
  §12.5 named as affected. **Next:** re-spawn `security` to independently
  reproduce the original exploit against the fixed code and confirm it's
  actually closed — the point of the whole addendum.
- **`security`, re-check, 2026-08-27** — **original exploit CONFIRMED
  CLOSED, live-proven** (all 4 types, both INSERT and UPDATE/retype, on a
  suspended relationship — all refused; live policy body carries no
  type-keyed term; the RPC's own party/company-less/no-JWT refusals all
  independently proven). **But found 1 NEW blocking finding the fix itself
  introduced (F1, rung 2):** the RPC's authorization re-imported `msg_all`'s
  relationship-level clause but dropped `can_access_thread`'s `deal` arm,
  which is WORKSPACE-scoped, not relationship-scoped — any relationship
  member (not just deal participants) could write into a PRIVATE deal
  thread via the RPC. Live-proven: a second person at the same company,
  not a `deal_member`, posted into a private workspace she couldn't even
  read via the ordinary RLS path. 3 non-blocking notes: F2 (`confirm_deal_
  change` has the identical gap, pre-existing, out of this slug's scope,
  worth its own ticket), F3 (on a suspended relationship the caller's own
  display name is the only writable text channel left — narrow, not a
  regression, named for the record), F4 (the RPC's `returns uuid` is
  near-always NULL in production — not a bug, worth stating in the
  signature).
- **Fixed directly, 2026-08-27** — added the missing `deal_workspace`
  membership check (`exists (... and can_access_workspace(w.id))`) to the
  deal-thread lookup, reusing the canonical `can_access_workspace` function
  rather than reimplementing it. **Independently reproduced both
  directions myself** (not just trusting the fix): the exact F1 exploit
  scenario now refused (0 rows written), a genuine workspace member still
  succeeds (1 row written) — both live-probed against the reset database
  before touching the test suite. Added `announce_deal_event_test.sql` §G
  (the permanent regression guard + a company-wide control cell proving
  the fix refuses on workspace membership specifically, not by accident)
  — this also surfaced that the suite's own fixture never minted a
  `deal_workspace` row for its card (harmless before F1, would have made
  every §D/§E cell silently vacuous after it), fixed alongside.
  **Full re-verification: 60/60 SQL, 483/483 vitest, tsc clean.**
  F2-F4 accepted as non-blocking, named for the G5 walk / future tickets,
  not fixed in this pass.

## Gate log
- **G3 (spec + ADR, merged gate) — APPROVED, Muskan, 2026-08-26.** "yes, approved,"
  after a plain-English walkthrough of the shared-function approach and
  confirmation that both prior rulings (in-flight changes, deal announcements) are
  correctly reflected as exclusions.
