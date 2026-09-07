# T06 · Drop `deliver_deal` and `claim_deal_ticket`, and their tests — PLAN

ADR 0009, D7, I-M6, I-M7, I-J5. TICKETS.md T06. Depends on T01 (live, `20260903120000`) and T05
(live, `20260904090000`). I-M5 checkpoint already run for real against production
(`docs/deploy/cloud-migrations-pending.md`, "🔴 READ FIRST 2026-09-07": im5a = 0, im5b = 5,
row-level `updated_at` proof) — the gate STATE.md flagged as still owed is in fact already closed.

**Revised after `plan-checker` round 1: OK, 0 blocking, 7 notes.** N1 (real coverage loss from
deleting `deliver_deal_test.sql` wholesale — its own explicit "fold in before build"
recommendation), N2 (a wrong leg in the reachability argument), N4 (the verification grep step as
written can't pass), N5 (stale citations in the file this ticket edits), N6 (census header should
record the ILIKE cross-check, not just the regex) are all held and folded in below. N3 (softened
wording, "provably unreachable" → accurate) held and applied. N7 (record EARS-1 as a named
exception at REVIEW.md time, don't promote to blocking) is a recording instruction for later, not
a plan change — noted in "Not in scope" below.

## Pre-flight census — run before writing the migration, per the ticket's own instruction

Ran against local Postgres (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), matched
on call shape, not spelling (L-041):

```sql
select proname
from pg_proc
where prosrc ~* '(perform|select)\s+public\.(deliver_deal|claim_deal_ticket)\s*\(';
-- 0 rows
```

Confirmed both functions still exist, both take `(uuid)`:

```
claim_deal_ticket | p_deal_card_id uuid
deliver_deal      | p_deal_card_id uuid
```

Confirmed the naive trap the ticket warns about is real: `prosrc ILIKE '%deliver_deal%' OR
prosrc ILIKE '%claim_deal_ticket%'` returns 3 rows locally (`claim_deal_ticket` itself,
`accept_connection_request`, `send_deal`) — the latter two only *mention* the names in comments
inside their bodies, not calls. The call-shape-matched query is the one that actually answers
the question. (`plan-checker` N6: ADR I-M7/TICKETS T06 both say 4 rows for the naive ILIKE census
— 3 is correct today, not a transcription error; the 4th row was `confirm_detected_deal`'s own
`deliver_deal` mention before T01 removed it. Recorded here so it doesn't read as a slip.)

⚠️ **The call-shape regex has a blind spot the migration header must own (`plan-checker` N6):**
`(perform|select)\s+public\.fn\s*\(` cannot see the assignment shape
`v_x := public.fn(...)` — a real idiom this codebase uses elsewhere (`v_card :=
public.create_deal_draft(...)`) — or an unqualified call. Zero callers is still true here, but
it's proven by the **naive ILIKE superset returning exactly 3 rows, all three individually
read and accounted for above**, not by the regex alone. The migration header records both,
not just the regex, since I-J5 makes that header the only place a future author will look.

## What changes

One DDL-only migration, shaped like `20260724120800_drop_propose_edit_rpcs.sql`:
`DROP FUNCTION IF EXISTS public.deliver_deal(uuid);` and
`DROP FUNCTION IF EXISTS public.claim_deal_ticket(uuid);`. Nothing else created or replaced.

Delete `supabase/tests/deliver_deal_test.sql`, `supabase/tests/claim_deal_ticket_test.sql`, and
their two runners (`run_deliver_deal_test.sh`, `run_claim_deal_ticket_test.sh`). Confirmed via
grep: no aggregator script enumerates these by name (each SQL suite has its own standalone
runner; `test-runner` globs `supabase/tests/run_*.sh`), so no third file needs updating for the
deletion itself.

Edit `supabase/tests/send_deal_c2c_announce_test.sql`: delete the C9 block, lines 391-412
exactly (confirmed by reading the file directly — the block opens at the `-- ===...` header
comment on 391 and closes at the `END $$;` on 412, matching the ticket's cited range exactly, no
off-by-one). Leave C8 (:379-389) and the C4 block that follows (:414+) untouched.

## Two src/ call sites found — not touched by this ticket, named here so the gap isn't silent

`grep -rn` across `src/`, `e2e/`, `supabase/` for both names, filtered for real call sites
(comments and historical migrations excluded, per the EARS parenthetical):

- `src/modules/messaging/supabase/store.ts:580-584` — `supabase.rpc("claim_deal_ticket" as
  never, ...)` inside `acceptInbox`'s `deal_card` branch. A real call site, not a comment.
- No `deliver_deal` call site anywhere in `src/` or `e2e/` (only comments describing its
  retirement — `e2e/deal-c2c-create.spec.ts`, `e2e/fixtures/two-company.ts`).

**T06's own EARS-1 ("no call site... shall remain in `src/`, `e2e/` or `supabase/`") is not
literally satisfiable by this ticket's file list.** `store.ts:574-586` is explicitly T07's scope
(TICKETS.md T07: exact range, "the `if` opens at `:574`, closes at `:586`"), and T06/T07 carry no
dependency on each other — the Ready checkpoint marks them parallel-safe, and the wave diagram
draws T06 and T07 as siblings under W4, not sequenced.

**Why shipping T06 first is safe anyway, not just scoped-around:** the call site is unreachable
given no pending `deal_card` row exists and no sanctioned writer can create one — not "provably
unreachable" in an absolute sense (`plan-checker` N3 corrected this wording; see the PostgREST
caveat below) — by the same "dead code, not a live break" reasoning T01's D1 already established
and Muskan accepted, and T05's own plan named this exact consequence in advance (PLAN-T05.md,
"Not in scope" section, finding N4):
1. `claim_deal_ticket`'s gate requires a `pending_inbox_item` row with `type='deal_card' AND
   status='pending' AND deleted_at IS NULL`. T05's backfill (live on production) flipped every
   such row to `accepted` — confirmed for real, im5a = 0.
2. Nothing **sanctioned** can produce a new one: the pre-flight census above shows zero remaining
   callers of `deliver_deal` anywhere in the function catalog (T01 removed the last one,
   `confirm_detected_deal`'s branch). `deliver_deal` was the only writer of `deal_card`-type
   `pending_inbox_item` rows reachable through the app's own RPCs.
3. **Corrected (`plan-checker` N2 — the original leg 3 was wrong):** D3/`companyRequests.ts`
   governs Discover's Requests list only; it has no bearing on the still-live `/connect/inbox`
   page, whose own filter (`COMPANY_INBOX_TYPES`, derived from `REQUEST_TYPE_META` in
   `src/modules/connect/lib/inbox-display.ts:42,58-60`) still includes `deal_card`, and
   `getInbox()` applies no `status` filter. The door that's actually closed is two other things:
   `lib/lenses.ts:33-40` (every actionable lens, including `deal_tickets`, requires `status ===
   'pending'`) and `InboxDetail.tsx:49` (`status === 'accepted'` → no Accept button rendered). Both
   still hold with 0 pending `deal_card` rows on production — the conclusion survives, but on legs
   1+4 below, not on D3.
4. **Caveat, not closed by 1-3 (`plan-checker` N3):** `inbox_insert`'s `WITH CHECK`
   (`20260825130000_inbox_insert_receiver_gate.sql:114-123`) constrains sender identity and
   receiver liveness only — no `type` predicate — so `authenticated` could in principle `INSERT`
   a fresh `type='deal_card'` pending row directly via PostgREST, bypassing every app RPC. That
   row would surface in the still-live Deal-tickets lens with a live "Pick up deal" button
   (`InboxDetail.tsx:78`) until T07 retires the module. Narrow (requires a hand-crafted API call,
   not anything the UI offers) and arguably a hardening once this migration lands (today it would
   succeed; after, it errors) — named here rather than folded into "provably unreachable."
5. Therefore, through every UI-offered path, the only way to exercise `store.ts:580-584` is the
   PostgREST caveat above, which today raises `claim_deal_ticket: no claimable ticket for this
   deal and company` (a thrown `Error` in `acceptInbox`, caught by its caller) and after this
   migration raises `PGRST202` / function-not-found instead, caught by the identical `if
   (claimErr) throw new Error(...)` at `store.ts:584`. **The user-facing outcome — an error, not a
   success — is unchanged either way.**

This was flagged for `critic`/`plan-checker` to verify independently rather than asserted
unilaterally, and `plan-checker` round 1 did exactly that — corrected leg 3, named the PostgREST
caveat, and rated both `note` (rung 4-5), not blocking. Recording in `REVIEW.md` for Muskan same
as T02's e2e gap and T05's three side-findings — informational, since no live behavior changes and
T07 (already scoped to touch these exact lines) closes the textual gap next.

## File 1 — new `supabase/migrations/20260907090000_drop_deliver_deal_claim_deal_ticket.sql`

```sql
-- ============================================================================
-- T06 (0027-retire-connect-inbox) · drop deliver_deal and claim_deal_ticket
-- ----------------------------------------------------------------------------
-- Lane A's company-delivery-ticket spine (deliver_deal writes a claimable
-- 'deal_card' pending_inbox_item; claim_deal_ticket lets a receiving-company
-- member pick it up) retires with this slug: D3 (T03) never surfaces
-- deal_card rows in Discover's Requests list, D5 (T05, live) backfilled
-- every existing pending deal_card ticket to 'accepted', and D1 (T01, live)
-- removed the only remaining caller of deliver_deal
-- (confirm_detected_deal's ticket branch).
--
-- Pre-drop census, matched on CALL SHAPE not name occurrence (a bare
-- ILIKE '%deliver_deal%'/'%claim_deal_ticket%' returns false positives —
-- accept_connection_request and send_deal both name these functions in
-- comments inside their bodies):
--   select proname from pg_proc
--   where prosrc ~* '(perform|select)\s+public\.(deliver_deal|claim_deal_ticket)\s*\(';
--   -- 0 rows, run against local Postgres before writing this migration.
--
-- The regex alone has a blind spot: it cannot see the assignment call
-- shape (v_x := public.fn(...), a real idiom this codebase uses — see
-- create_deal_draft's own callers) or an unqualified call. Zero callers
-- is proven here by a SECOND, broader query instead:
--   select proname from pg_proc
--   where prosrc ilike '%deliver_deal%' or prosrc ilike '%claim_deal_ticket%';
--   -- exactly 3 rows: claim_deal_ticket (itself), accept_connection_request,
--   -- send_deal — the latter two read directly and confirmed comment-only.
-- Every function that so much as MENTIONS either name is individually
-- accounted for, which is a stronger guarantee than the call-shape regex
-- alone.
--
-- Signatures copied from the defining/latest-replacing migrations:
--   deliver_deal(uuid)       - 20260720095000_deliver_deal.sql,
--                               re-emitted unchanged in signature by
--                               20260827140000_deliver_deal_relationship_write_gate.sql
--   claim_deal_ticket(uuid)  - 20260720110000_claim_deal_ticket.sql
--
-- I-J5's residual risk: nothing but this one-time census stops a future
-- migration re-introducing a caller. No automated guard added for it.
--
-- src/modules/messaging/supabase/store.ts:580-584 still calls
-- claim_deal_ticket via .rpc() as of this migration — unreachable given no
-- pending deal_card row exists and no sanctioned writer can create one
-- (see PLAN-T06.md for the full argument and its one named caveat),
-- removed by T07, not this ticket.
-- ============================================================================

DROP FUNCTION IF EXISTS public.deliver_deal(uuid);
DROP FUNCTION IF EXISTS public.claim_deal_ticket(uuid);
```

## File 2 — delete `supabase/tests/deliver_deal_test.sql`

## File 3 — delete `supabase/tests/run_deliver_deal_test.sh`

## File 4 — delete `supabase/tests/claim_deal_ticket_test.sql`

## File 5 — delete `supabase/tests/run_claim_deal_ticket_test.sh`

## File 6 — edit `supabase/tests/send_deal_c2c_announce_test.sql`

**Revised after `plan-checker` N1/N5 — this is no longer a single deletion.** Dispatched to
`test-writer` as one unit (all `supabase/tests/**` work stays with `test-writer`, never
`builder`, per L-035).

**(a) Delete lines 391-412 (the C9 block) verbatim.** After the DROP,
`pg_get_functiondef('public.deliver_deal(uuid)'::regprocedure)` raises `undefined_function` and,
under this suite's `ON_ERROR_STOP=1` runner, would fail the entire suite past that point — this is
real, currently-passing coverage whose subject is gone, not a stale assertion to leave disabled.

**(b) Port three cells from `deliver_deal_test.sql` before it's deleted (File 2) — `plan-checker`
N1, its own "fold in before build" recommendation.** `deliver_deal_test.sql` is not
single-subject: alongside cells that test `deliver_deal` itself (which correctly die with the
DROP — the idempotency check at `:170-198` and the suspended-relationship gate at `:370-412`),
three cells prove behavior of **`send_deal`** and **`confirm_detected_deal`** — both staying
live — and are covered nowhere else in the suite (verified directly: `confirm_detected_deal_no_
ticket_test.sql` is c2c-only by its own header; this file's existing C3, `:239-301`, covers pill
delivery to the p2p thread and the c2c-thread-untouched check, but not ticket-zero-ness or
co-owner-at-send). Losing them silently is exactly L-061's class (test count drift = a real cut),
not an acceptable cost — port, don't just note the loss.

Add three new cases after C9's old position (now the file's last case before the C4/C5 block),
labeled `P1`-`P3` (a `P` prefix, not `C`, since they don't correspond to this file's own M1-M11
list — they're relocated coverage of a different ticket's functions, kept here for filing
continuity because T06 already touches this file). Add a short header note explaining the `P`
cases' provenance, right after this file's existing "Pattern copied from deliver_deal_test.sql"
line (`:63-64`).

- **P1 (ported from `deliver_deal_test.sql` A2-2b, `:203-218`) — double-send guard.** As Alice,
  call `send_deal` a second time on a card already sent earlier in this suite (reuse C1's card,
  kind `'c1'` — already sent, still `'unsent'`-incompatible). Assert it raises, message `LIKE
  '%only an unsent draft%'`.
- **P2 (ported from `deliver_deal_test.sql` A2-3a/3c/3e, `:220-238,266-294` — NOT 3b/3d, already
  covered by this file's own C3) — person-arm ticket-zero and co-owner-at-send.** As Alice,
  `create_deal_draft` with Bob as the explicit counterparty (person-target), same shape as C3's
  own card creation but keep the card separate (new `_cards` kind `'p2'`) so this case's own
  assertions aren't entangled with C3's. Assert, in order: (i) immediately after birth, zero
  `pending_inbox_item` rows for this card (`deleted_at IS NULL`) — person-target births create no
  ticket; (ii) call `send_deal` as Alice; (iii) after send, still zero `pending_inbox_item` rows
  for this card — the company half no-ops when a co-owner exists; (iv) Bob now holds a live
  `deal_member` row (`role = 'owner'`, `removed_at IS NULL`) on this card's workspace — the
  counterparty joins at send, not at birth.
- **P3 (ported from `deliver_deal_test.sql` A2-4, `:296-368`) — `confirm_detected_deal`'s p2p door
  births straight into negotiation with zero tickets.** Reuse this file's own `_fix`/`_rel` p2p
  thread resolution idiom (the file already has Alice/Bob/the seeded relationship in scope; no new
  fixture identity needed). Insert a synthetic `deal_detected` message on the seeded p2p thread as
  a role that bypasses `msg_all` (mirror `confirm_detected_deal_no_ticket_test.sql`'s own fixture
  idiom for this exact step, adapted from c2c to p2p). Alice accepts, then Bob accepts (the second
  acceptance births the card — assert `born_now = true`). Assert: zero `pending_inbox_item` rows
  for the born card, and `deal_card.status = 'negotiation'`.

**(c) Fix the two stale citations this same file carries once (a) and (b) land — `plan-checker`
N5:**
- `:26`, the invariant table's `M8 [AC9] … → C9` row — delete this row entirely. Its subject
  (`deliver_deal`'s definition staying untouched) no longer exists once T06 drops the function;
  there is nothing left for a row in *this ticket's own* M1-M11 list to assert.
- `:33-34` and `:133-135` — both currently read "…the person arm was already covered by
  `deliver_deal_test.sql:248-251, case A2-3b`". `deliver_deal_test.sql` is deleted by this same
  ticket (File 2). Repoint both to "…the person arm was already covered by this file's own case
  P2 (relocated from `deliver_deal_test.sql` A2-3b/3d by T06)" — same fact, now a same-file
  citation instead of a citation into a file about to stop existing. (0023's own `REVIEW.md`
  M1/M2 caught this exact class before — "a whole-file sweep, not a one-line patch" — so this is
  applying established precedent, not improvising a new rule.)

## Not in scope (fence, per ADR 0009 and TICKETS.md's own file list)

- `src/modules/messaging/supabase/store.ts` — T07's file, exact range named there. **Test-file
  and migration work only in this ticket; no source file touched** (consistent with L-035: this
  plan does not ask `builder` to edit any file under `supabase/tests/**` — those four
  deletions/edit are dispatched to `test-writer`, not `builder`, even though they are simple and
  "obviously correct").
- `src/types/database.types.ts` — still lists both RPCs (`claim_deal_ticket:4702`,
  `deliver_deal:4756`); regenerating it is T07's job (it also regenerates for the module
  deletions), not named in T06's file list.
- Any change to `RequestsSection.tsx`/`inbox.ts`'s accept flow — untouched, D11/T07.
- The two SQL suite deletions do not touch `e2e/*.spec.ts` — those are T09's job, and per
  TICKETS.md T09 they depend on T06 **and** T07 both landing first.
- **`plan-checker` N7:** EARS-1's "no call site... in src/" is a named, deliberate exception for
  this ticket, not silently unmet — record it explicitly in `REVIEW.md` at close so G4 doesn't
  tick a criterion that's actually false. T09 depending on both T06 and T07 (TICKETS.md:280)
  means the textual gap cannot survive past the e2e wave.

## Verification after builder/test-writer run

⚠️ Run everything via real binaries, not a bare tool-name invocation — this slug's own record
(T01, T04, T05) shows the `rtk` hook has repeatedly rewritten or fabricated output for
`git`/`tsc`/`grep`/`find`/`ls` (L-069). Use `/usr/bin/git`, `node node_modules/typescript/bin/tsc`,
direct `/usr/bin/<tool>` paths, and `bash supabase/tests/run_*.sh` from the repo root.

- `supabase db reset` — applies clean; the DROP is unconditional (`IF EXISTS`), no seed data
  depends on either function.
- Full SQL suite — the two deleted suites simply stop appearing (not failing); every remaining
  suite, including the trimmed `send_deal_c2c_announce_test.sql`, passes.
- Re-run the pre-flight census post-migration: `select proname from pg_proc where proname in
  ('deliver_deal','claim_deal_ticket')` — 0 rows, proves the DROP took.
- **Corrected after `plan-checker` N4 — the original grep step couldn't pass as specified.**
  `grep -rn "deliver_deal\|claim_deal_ticket" src/ e2e/` (scoped to these two dirs only — NOT
  `supabase/`, which still legitimately carries ~35 comment-only survivors across historical
  migrations and other suites' own comments, none of them call sites) — confirm the only
  survivors are: `store.ts:580-584` (named above, T07's job, a real call site), plus
  comment-only mentions in `e2e/deal-c2c-create.spec.ts`, `e2e/fixtures/two-company.ts`,
  `e2e/deal-p2p-send.spec.ts`, `inbox.ts:289`, `messaging/types.ts:329`, and
  `src/types/database.types.ts:4702,4756` (generated types, T07's regen). Any NEW call site
  beyond this named list, in `src/` or `e2e/`, is a real finding, not expected noise.
- `tsc` clean — dropping the functions doesn't change any TS signature; `database.types.ts` still
  declares them (harmlessly stale until T07 regenerates it), and `store.ts`'s call is cast `as
  never` specifically because it predates the generated types entry, so `tsc` never checked it
  against the RPC catalog in the first place.
