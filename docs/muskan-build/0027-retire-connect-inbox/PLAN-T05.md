# T05 · Backfill: resolve every pending deal ticket — PLAN

ADR 0009, D5, I-M5. TICKETS.md T05. Depends on T01 (live — `confirm_detected_deal` has stopped
cutting new `deal_card` tickets as of `20260903120000`).

**Revised after `plan-checker` round 1: REVISE, 1 blocking + 6 notes.** F1 held on
spot-verification (read `create_deal_draft`'s live body directly) — the EARS-3 fixture is
redesigned below to use plain INSERTs instead of the RPC. N1-N5 held and are folded in; N6 (a
stale "2 criteria" count in TICKETS.md's own Ready table, vs. the 3-criterion EARS block) is a
pre-existing doc slip outside this ticket's file list, noted here, not fixed.

## What changes

One DML-only migration. `UPDATE public.pending_inbox_item SET status = 'accepted' WHERE type =
'deal_card' AND status = 'pending' AND deleted_at IS NULL`. Nothing else — no membership insert
(T01's I-M2 already proved a `deal_card` is reachable company-wide without one), no touch to
`deal_card`/`deal_workspace`/`chat_message`, no function created or replaced.

**Why `status = 'accepted'` and not `'resolved'`:** `inbox_status` seeds exactly `pending |
accepted | rejected` (`20260607090001:337-340`, confirmed by reading the seed rows directly — no
`'resolved'` code exists) and `pending_inbox_item.status` is `REFERENCES inbox_status(code)`
(`20260607090002:199`) — a literal `'resolved'` would raise a foreign-key violation, not silently
do nothing.

**Why all three predicates, and why none can drop:** this is the entire safety mechanism (I-M5,
D5). Dropping `type = 'deal_card'` accepts every live `connect`/`connect_message`/
`pricelist_request` ticket in the table, and nothing restores them — Discover's list would
quietly go empty with no error. Dropping `deleted_at IS NULL` disagrees with what the (now-dead,
soon-to-be-dropped-in-T06) `deliver_deal:59`/`claim_deal_ticket:51` code considers a "live"
ticket, which is exactly what I-M5(a)'s checkpoint query itself filters on.

**No explicit `updated_at =` in the SET clause — corrected reasoning after round 1.** The
original draft claimed this table has no `updated_at` trigger; that was wrong; a plain `grep` for
a literal `CREATE TRIGGER … pending_inbox_item` misses it because
`supabase/migrations/20260607090005_fk_alters_triggers.sql:40-62` builds the trigger name via a
loop + `format()` over an array that includes `'pending_inbox_item'` — the trigger
(`trg_pending_inbox_item_set_updated_at`) is real and fires `BEFORE UPDATE`. The *instruction*
(don't write `updated_at =` in this migration) is still correct, for the opposite reason: the
trigger already owns it, so writing it explicitly would be redundant, not additive — which is
also why `src/modules/connect/supabase/inbox.ts:318,342` (the one place this codebase already
does `status: "accepted"` on this table) doesn't set it either. Every backfilled row's
`updated_at` WILL move to the migration's clock; that's expected, not a side effect to guard
against.

## File 1 — new `supabase/migrations/20260904090000_pending_inbox_item_deal_card_backfill.sql`

```sql
-- ============================================================================
-- T05 (0027-retire-connect-inbox) · Backfill: resolve every pending deal
-- ticket
-- ----------------------------------------------------------------------------
-- DML-only. T01 (20260903120000) already stopped `confirm_detected_deal` from
-- cutting NEW deal_card tickets; this migration clears the ones that already
-- exist. D5/I-M5.
--
-- 'accepted', not 'resolved' — inbox_status seeds exactly
-- pending | accepted | rejected (20260607090001:337-340); a literal
-- 'resolved' has no such code and the FK would reject it.
--
-- All three WHERE predicates are the entire safety mechanism, none optional:
--   type = 'deal_card'    — dropping this accepts every live connect /
--                            connect_message / pricelist_request ticket too,
--                            and nothing restores them.
--   status = 'pending'    — only a still-open ticket needs resolving.
--   deleted_at IS NULL    — matches what deliver_deal:59 / claim_deal_ticket:51
--                            (T06 drops both, gated on this backfill reading 0
--                            first) consider a "live" ticket. Without it, this
--                            migration and that code disagree about scope.
--
-- No memberships inserted — T01's I-M2 already proved a deal_card is
-- reachable company-wide without one.
--
-- NO-OP on `db reset`: seed.sql seeds no deal_card pending_inbox_item rows.
-- The SQL suite alongside this migration fixtures its own rows inside a
-- BEGIN…ROLLBACK to prove the UPDATE statement is correct in isolation; the
-- REAL checkpoint (I-M5's two counts, run for real) is a manual step against
-- the target environment before W4 (T06/T07) starts — not something a suite
-- against an empty local table can prove. See TICKETS.md T05's own note.
-- ============================================================================

update public.pending_inbox_item
set status = 'accepted'
where type = 'deal_card'
  and status = 'pending'
  and deleted_at is null;
```

## File 2 — new `supabase/tests/pending_inbox_item_deal_card_backfill_test.sql`

Zero-mutation fixture pattern (`.claude/rules/supabase.md`): everything inside one
`BEGIN…ROLLBACK`. Reuses seeded GreenLeaf/StonePharm/Alice/Bob identities as sender/receiver on
fixture rows (no new company/person created) — mirrors `confirm_detected_deal_no_ticket_test.sql`'s
shape exactly.

⚠️ **This suite runs the migration's own UPDATE statement inline, not by calling a function** —
there is nothing else to call for a DML-only migration. Keep the statement text here **byte-identical**
to File 1's — this is a real, inherent coupling for testing a one-shot DML statement (not a design
flaw), and it's called out here so a future editor of the migration remembers to mirror the change
here too, rather than silently drifting (L-002's shape, one level down).

⚠️ **Run the UPDATE as the connecting role (`postgres`), NOT under `SET LOCAL ROLE authenticated`
— corrected reasoning after round 1.** The original draft's reason was wrong:
`20260823090000_connection_consent_and_verification_lockdown.sql:277` does revoke table-level
`UPDATE`, but `:279-289` immediately re-grants column-level `UPDATE` back to `authenticated` on
nine columns **including `status`** — so `authenticated` is not blocked from this specific
column, and the statement would not raise a permission error. **The real reason to avoid it is
worse: RLS.** `inbox_update` (`20260724100200_inbox_person_rls.sql:29-37`) restricts UPDATE to
`receiver_company_id = current_company_id() OR receiver_person_id = auth.uid()`. Under
`SET LOCAL ROLE authenticated` this statement would **silently update only a subset** of the
fixture rows and could still read PASS on §A for the one row whose receiver happens to match the
test's session identity — a silently wrong answer, not a loud failure. `postgres`, as table
owner, bypasses RLS entirely (no `FORCE ROW LEVEL SECURITY` exists anywhere under `supabase/`,
confirmed) — matching what the real migration does at `db push` time. Recording the corrected
reason so a future editor doesn't "fix" the role switch back in for the wrong-but-plausible
original reason.

**Fixture — six `pending_inbox_item` rows, tagged `metadata->>'seed' = 't05-backfill-test'` for
clean selection.** NOT NULL columns every row must supply (`sender_person_id`,
`sender_company_id` — both column-level `NOT NULL`, `20260607090002_phase1_core.sql:194-195`) plus
`receiver_company_id` — no longer column-level `NOT NULL` since
`20260724100100_inbox_person_target.sql:30`, but still required for every non-`connect_person`
type here by CHECK `inbox_company_request_requires_company` (`:41-42`), so every row below still
needs it in practice. Use seeded Alice (sender) → StonePharm (receiver) for all six, reusing IDs
already live in `seed.sql`, no new person/company created:

| # | type | status | deleted_at | expected after UPDATE |
|---|---|---|---|---|
| 1 | `deal_card` | `pending` | NULL | `accepted` — the target row. **`deal_card_id` set to the fixture card below** (F1/N5 — the CHECK `inbox_deal_card_only_for_deal_card_type`, `20260607090002:207-208`, permits this on a `deal_card`-type row, and it's what makes §C actually assert "**its** deal card", matching EARS 3's wording, not just "a" deal card) |
| 2 | `deal_card` | `pending` | `now()` | **unchanged** (`pending`) — proves the `deleted_at` predicate |
| 3 | `deal_card` | `accepted` | NULL | unchanged (`accepted`) — idempotency, harmless re-run |
| 4 | `connect` | `pending` | NULL | **unchanged** — proves the `type` predicate (the actual safety mechanism) |
| 5 | `connect_message` | `pending` | NULL | **unchanged** — second non-`deal_card` control |
| 6 | `pricelist_request` | `pending` | NULL | **unchanged** — third non-`deal_card` control |

**EARS-3 fixture — redesigned after round 1 (F1): plain INSERTs, not `create_deal_draft`.**
`plan-checker` proved the RPC route doesn't work here on three independent counts (all verified
directly against `20260724120200_create_deal_draft_private_birth.sql`): it births `status =
'unsent'`, never `'negotiation'` (`:112`); it creates **no thread** at all (`:157-162`'s own
header: *"no birth thread or opener message is created any more"*), and `chat_message.thread_id`
is `NOT NULL` (`20260607090003_phase2_deal.sql:191`) — there is nothing to attach a message to;
and it requires a non-null `auth.uid()` (`:68-69`), which this suite deliberately runs without
(see the role note above). Building the fixture as plain INSERTs instead sidesteps all three —
no RPC call, no auth context needed, any status/thread is ours to pick:

- `deal_card`: `relationship_id` = the seeded GreenLeaf↔StonePharm relationship, `deal_type =
  'offer'`, `initiating_company_id` = GreenLeaf, `status = 'negotiation'`, `currency = 'EUR'`,
  `created_by`/`updated_by` = Alice — mirrors `create_deal_draft`'s own column list
  (`:107-110`), values chosen directly rather than produced by the RPC.
- `deal_workspace`: `deal_card_id` = the new card, `visibility = 'company_wide'`, `created_by` =
  Alice — mirrors `create_deal_draft`'s own INSERT (`:160-162`) exactly, which is the live,
  currently-correct column list (do not reconstruct this table's columns from the original 2026-06
  `CREATE TABLE` — `supabase.md`'s own rule: diff against the live definition, this RPC IS the
  live definition).
- `chat_message`: `thread_id` = the seeded GreenLeaf↔StonePharm **c2c thread**
  (`confirm_detected_deal_no_ticket_test.sql:89-102`'s own `_t` temp-table resolution is the
  reusable pattern for finding it), `sender = 'person'`, `sender_person_id` = Alice, `type =
  'message'` (the column default), `body` = a fixture marker string.

Snapshot all three rows' full content before the UPDATE, run it, assert byte-identical after.
**Provable by construction** in one respect only — the UPDATE statement touches just
`pending_inbox_item`, one column, no joins — but round 1 corrected the "no trigger" half of that
claim (see the `updated_at` note above: a `BEFORE UPDATE` trigger DOES exist on
`pending_inbox_item`, built via `format()` in a loop, invisible to a literal grep). It only
writes `NEW.updated_at` on the row it fires on and cannot reach `deal_card`/`deal_workspace`/
`chat_message`, so the EARS-3 assertion still holds — asserted directly anyway, not inferred.

**Assertions (DO blocks, `RAISE EXCEPTION` per failed cell, mirroring
`confirm_detected_deal_no_ticket_test.sql`'s style):**

- **§A (EARS 1, I-M5a-shaped):** row 1 reads `status = 'accepted'` after the UPDATE; row 2 still
  reads `pending` (proves `deleted_at`); rows 4-6 still read `pending` (proves `type`).
- **§B (EARS 2, I-M5b-shaped, delta not hardcoded per `supabase.md`):** snapshot
  `count(*) FROM pending_inbox_item WHERE status = 'pending' AND deleted_at IS NULL AND type <>
  'deal_card'` BEFORE the UPDATE, re-count AFTER, assert the delta is exactly `0`. Rows 4-6 (and
  any pre-existing seeded non-`deal_card` pending rows, e.g. T03's demo fixtures) are all inside
  this count — a broad `UPDATE` that accidentally touched them would move this number, which is
  the entire point of I-M5(b) existing as a *separate*, second checkpoint from I-M5(a).
- **§C (EARS 3):** the `deal_card`/`deal_workspace`/`chat_message` fixture's content is
  byte-identical before/after (row counts unchanged, no column value changed).

Final: `DO $$ BEGIN RAISE NOTICE '... ALL CELLS PASSED (A, B, C)'; END $$;` then `ROLLBACK;`.

## File 3 — new `supabase/tests/run_pending_inbox_item_deal_card_backfill_test.sh`

Copy `run_confirm_detected_deal_no_ticket_test.sh`'s exact shape (piped on stdin, `ON_ERROR_STOP=1`,
greps `ALL CELLS PASSED` for PASS/FAIL) — this project's established runner pattern
(`.claude/rules/supabase.md`: "every suite needs a runner, and the runner is what proves it").

## Not in scope

`deliver_deal`/`claim_deal_ticket` themselves — untouched as **code**, still defined and
grantable; dropping them is T06, explicitly gated on **this ticket's own checkpoint reading 0
first** (T01's migration header already says so). No membership/workspace-access change — T01's
I-M2 already covers reachability. No app-code change — this is a pure DB migration.

⚠️ **A real behaviour change this backfill causes, named per round 1 (N4) rather than left
implicit under "untouched":** `claim_deal_ticket` gates on exactly the precondition this
migration deletes — `type='deal_card' AND status='pending' AND deleted_at IS NULL`
(`20260720110000_claim_deal_ticket.sql:45-54`). After T05 ships, every existing deal ticket
becomes unclaimable through that RPC; the live call site
(`src/modules/messaging/supabase/store.ts:580-584`) would raise `claim_deal_ticket: no claimable
ticket for this deal and company` if it were ever reached. In practice the row also leaves the
pending lens the moment it flips to `accepted`, so the UI path to reach that call site disappears
first — and this is the **intended** end state (D5/T01's I-M2: the deal is already reachable
company-wide with no ticket/claim system needed for MVP), not a bug. Named here so nobody reading
"not in scope" mistakes silence for "nothing changes."

## Verification after builder runs

⚠️ Run everything via the real binaries, not a bare `npx`/tool-name invocation — the `rtk` hook
has now, twice this session, silently rewritten or fabricated output for `tsc`/`git`/`grep`/`find`/
`ls` (confirmed directly each time). Use `node node_modules/typescript/bin/tsc`, direct
`/usr/bin/<tool>` paths, and `bash supabase/tests/run_*.sh` from the repo root.

- `bash supabase/tests/run_pending_inbox_item_deal_card_backfill_test.sh` — PASS, all three cells.
- `supabase db reset` — applies clean (this migration is a genuine no-op against the seed, 0 rows
  touched — that's expected, not a bug, per the ticket's own warning; it proves the migration
  *applies*, not that it *works*).
- Full SQL suite, unit suite, `tsc` — no regression expected anywhere outside the new suite (this
  ticket touches no app code, no other migration, no other table).
- **The real I-M5 checkpoint — not this ticket's job to run, recorded here so it isn't lost:**
  before T06/T07 (W4) start, run both counts for real against the target environment (I-M5a: 0
  pending `deal_card` rows; I-M5b: the non-`deal_card` pending count unchanged across the push).
  Cannot be satisfied locally — there is no cloud environment with real `deal_card` tickets to
  count yet.
