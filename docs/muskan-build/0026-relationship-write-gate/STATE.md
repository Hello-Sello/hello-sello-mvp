# 0026 relationship-write-gate — work order

lane:   FULL
branch: claude/muskan/work
stage:  triage ✅ → census ✅ → interview ✅ → PRD ✅ → ADR ✅ (2 checker rounds) → G3 ✅ (Muskan, 2026-08-26) → plan written ✅ → plan-checker round 1 ✅ (4 blocking, fixes not yet applied) → plan fix (next)

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

## Gate log
- **G3 (spec + ADR, merged gate) — APPROVED, Muskan, 2026-08-26.** "yes, approved,"
  after a plain-English walkthrough of the shared-function approach and
  confirmation that both prior rulings (in-flight changes, deal announcements) are
  correctly reflected as exclusions.
