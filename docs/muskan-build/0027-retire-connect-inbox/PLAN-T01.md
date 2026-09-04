# T01 · `confirm_detected_deal` stops cutting a deal ticket — PLAN

ADR 0009, D1, I-M1, I-M2. TICKETS.md T01.

## What changes

`confirm_detected_deal` (live def: `20260827130000_confirm_detected_deal_relationship_write_gate_refactor.sql`)
deletes the `else` branch that calls `deliver_deal(v_card)` when the counterparty
person is unknown (`v_cp is null`). Nothing replaces it — a company-target
detected deal born from now on gets no `pending_inbox_item` ticket.

**Confirmed dead code, not a live-bug fix** (re-verified this session, matches
ADR): `chat_thread_p2p_has_both_people` (`20260607090003:133`) only forces
`person_a_id`/`person_b_id` non-null when `type = 'p2p'`. Detection only lands
on p2p threads today, so `v_cp` is never null through the sanctioned route.
Reachable only by calling the RPC directly against a c2c thread — which is
exactly the fixture this ticket's test must use.

**Why workspace access survives the deletion (I-M2), traced this session —
corrected after `plan-checker` round 1 caught a stale citation:**
`can_access_workspace(p_ws_id)` (`20260607170000_rls_policies.sql:117-125`)
calls `card_relationship_member(w.deal_card_id)`. That helper's **live** body
is `20260724120700_draft_privacy_rls.sql:38-47` (`20260607170000`'s own
definition of it was superseded that day, not the one to cite):
```
is_relationship_member(dc.relationship_id)
AND (dc.status <> 'unsent' OR dc.initiating_company_id = current_company_id())
```
plus `can_access_workspace`'s own second clause,
`w.visibility = 'company_wide' OR is_workspace_member(w.id)`.

Three facts, not one, make Carla's probe (a GreenLeaf person who is neither
the caller nor a `deal_member`) pass:
1. `deal_workspace` is born with `visibility = 'company_wide'` **written
   explicitly** by `create_deal_draft`
   (`20260724120200_create_deal_draft_private_birth.sql:160-161`) — not
   merely defaulted, a stronger fact than the column default alone.
2. `initiating_company_id` is corrected to the **birthing voter's** company
   right after birth (`20260827130000:157`) — so a same-company caller
   (Carla, GreenLeaf) who is NOT that voter still needs the card to be past
   `unsent` to pass `card_relationship_member`'s disjunct.
3. `20260827130000:165` flips the card to `negotiation` in the same
   transaction, before `confirm_detected_deal` returns — so by the time
   Carla's probe runs, `status <> 'unsent'` is already true.

`deliver_deal` only ever wrote to `pending_inbox_item` — a separate table —
and never touched `deal_workspace.visibility`, `initiating_company_id`, or
`deal_member`. So access was **already** company-wide before this change;
the ticket branch being deleted never gated access at all. This is the
concrete, load-bearing basis for I-M2, not an assumption.

## File 1 — migration

New file: `supabase/migrations/20260903120000_confirm_detected_deal_drop_ticket_branch.sql`
(picked to sort after the latest committed migration, `20260903110000_promotion_status_gate.sql`
(commit `11e8769`, unrelated HEL-83 work, decision recorded `DECISIONS.md:2259`
— not ours to touch, timestamp chosen to not collide with it).

`create or replace function public.confirm_detected_deal(...)` — full body
verbatim from `20260827130000`'s live definition, with lines 182-185 deleted
(the `else` clause, its two comment lines, and the `perform
public.deliver_deal(v_card);` call) and line 186's `end if;` kept. Result —
the `if v_cp is not null then ... end if;` block loses its `else` entirely:

```sql
    if v_cp is not null then
      -- the counterparty co-owner joins the born workspace (mirrors what the
      -- OLD birth RPC did and the slim one no longer does) - idempotent on the
      -- ACTIVE row, matching uq_deal_member_active
      -- dw alias: the OUT param is also named deal_card_id, so the column
      -- reference MUST be qualified (unqualified it is ambiguous and errors
      -- at runtime under plpgsql variable_conflict=error, the default)
      select dw.id into v_ws
      from public.deal_workspace dw
      where dw.deal_card_id = v_card and dw.deleted_at is null;
      insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
      select v_ws, v_cp, 'owner', v_uid
      where not exists (
        select 1 from public.deal_member
        where deal_workspace_id = v_ws and person_id = v_cp and removed_at is null);
    end if;
```

Every other line of the function — signature, `out` params, the idempotency
guard at `born_deal_card_id`, the `assert_relationship_writable` call, batch
snapshot carry-through, offer/order typing — is byte-identical to the live
body. `create or replace` (not drop+create): preserves the existing
`authenticated` EXECUTE grant, same reasoning the source migration's own
header already gives.

Migration header must state: dead-code deletion, unreachable via any
sanctioned route, the fixture note above, and a one-line pointer to this plan.

## File 2 — SQL test suite

New file: `supabase/tests/confirm_detected_deal_no_ticket_test.sql`
New runner: `supabase/tests/run_confirm_detected_deal_no_ticket_test.sh`
(mirror `run_confirm_detected_deal_relationship_liveness_test.sh`'s shape:
piped on stdin, `ON_ERROR_STOP=1`, `grep -q "ALL CELLS PASSED"`.)

Pattern: single `BEGIN…ROLLBACK`, zero net seed mutation, following
`confirm_detected_deal_relationship_liveness_test.sql`'s shape exactly.

**Fixture — the whole difficulty, confirmed this session:**
- Reuse the seeded GreenLeaf↔StonePharm **c2c** thread (`chat_thread.type =
  'c2c'`, same relationship the existing liveness test's p2p thread sits on —
  `seed.sql:308-321`). Select it by `relationship_id` + `type = 'c2c'`, same
  temp-table-with-guard-DO-block pattern as the existing suite.
- Insert the `deal_detected` chat_message as `sender = 'sella'`, as the
  unauthenticated/superuser session (no `SET LOCAL ROLE`) — bypasses `msg_all`
  the same legitimate way the existing suite does.
- ⚠️ **Vote order is pinned, not arbitrary — `plan-checker` round 1 caught
  this unrecorded.** Alice (`1111...`, GreenLeaf) accepts **first**, Bob
  (`2222...`, StonePharm) accepts **second** — Bob's vote is the
  birth-triggering one. `v_proposer`/`v_company` at birth time is the
  **current caller's** company (`20260827130000:117`, re-evaluated fresh each
  call), and detection rows carry no `proposed_by_company`, so `v_proposer` =
  Bob's company = StonePharm. That makes StonePharm the initiating/sending
  side and **GreenLeaf the receiving side** — which is what makes Carla
  (GreenLeaf) a valid stand-in for TICKETS.md's "member of the receiving
  company". Reversing the order breaks the test's own premise, not just its
  assertions — pin it explicitly in the suite header, not only in this plan.
- ⚠️ **Why the c2c fixture is reachable at all — three-valued NULL logic,
  also caught as unrecorded.** `20260827130000:85`'s participant guard is
  `if v_uid <> v_pa and v_uid <> v_pb then raise ...`. On a c2c thread both
  are NULL, so both comparisons evaluate NULL, `NULL and NULL` is NULL, and
  `IF NULL THEN` does not fire — the guard silently passes for **any**
  authenticated caller, not just Alice/Bob. The fixture's use of Alice/Bob is
  a choice for realism, not a requirement the guard enforces. **Not this
  ticket's job to harden** (T01 is scoped to the `deliver_deal` branch only;
  changing the guard risks breaking this same fixture and is a separate,
  pre-existing gap). State the dependency in both the suite and migration
  headers so a future reader doesn't mistake the guard for doing real work
  here. Worth a `/track-doubt` separately — flagged to Muskan in this
  session's summary, not filed as part of this ticket.
- On a c2c thread `person_a_id`/`person_b_id` are both NULL, so `v_cp`
  resolves to NULL regardless of who calls (`20260827130000:113`).
- **The "member of the receiving company who is not the resolved counterparty"
  probe: use Carla (`3333-...-3333`, `carla@greenleaf.test`)** — seeded as a
  second GreenLeaf person, not part of the Alice/Bob p2p pair, holds no
  `deal_member` row anywhere (`seed.sql:113-149`). No new person/auth.users
  insert needed.

**Assertions (maps to the ticket's 3 EARS):**
1. After both accepts, `select count(*) from pending_inbox_item where
   deal_card_id = <born card>` (and, as a floor check, total pending count for
   StonePharm/GreenLeaf receiver unchanged from a pre-test snapshot) — **0**.
2. `SET LOCAL ROLE authenticated` as Carla, `select
   public.can_access_workspace(<born workspace id>)` — **true**. Precondition
   asserted first, corrected after `plan-checker` round 1: **exactly one**
   `deal_member` row exists for the born workspace — `person_id = Bob`,
   `role = 'owner'` — inserted unconditionally by `create_deal_draft`
   (`20260724120200:164-166`) regardless of `v_cp`. **Zero** rows for anyone
   else, in particular zero for Carla and zero for Alice. Asserting zero rows
   total (the plan's original wording) is **false on a correct build** — the
   creator-owner insert always fires — and would send a builder chasing a
   phantom bug. The true-access verdict must come from
   `card_relationship_member` + `visibility = 'company_wide'`, provably not
   from Carla's own membership, since she holds none.
3. Idempotency (EARS #3, idempotency half): call `confirm_detected_deal` a
   second time (either voter, already-both-accepted state) and assert
   `born_deal_card_id` is unchanged and no second card/workspace was created —
   reuses the existing suite's §A/§C idempotency shape, not a new mechanism.
   (EARS #3's liveness half — "the relationship-liveness check unchanged" —
   is covered by the existing `confirm_detected_deal_relationship_liveness_test.sql`
   still passing unmodified, listed under Verification below; this suite adds
   no new liveness assertion of its own.)

## Not in scope

- `deliver_deal` itself stays defined and grantable — dropping it is T06,
  gated on T05's backfill checkpoint reading 0 first. Do not touch its
  migration or tests here.
- No RLS/grant change — `confirm_detected_deal`'s signature and grants are
  unchanged; this is a body-only `create or replace`.
- The **untracked** `20260903110000_promotion_status_gate.sql` on disk is
  unrelated HEL-83 work, not part of T01. Do not edit, rename, commit, or
  delete it as part of this ticket.

## Verification after builder runs

- `supabase db reset` clean (migration replays with no error).
- New runner passes standalone.
- Full SQL suite (`supabase/tests/run_*.sh` census) stays green — in
  particular the existing `confirm_detected_deal_relationship_liveness_test.sql`
  (p2p fixture, must still pass unchanged — it never exercised the deleted
  branch) and `deliver_deal_test.sql` (still exercises `deliver_deal` directly
  via RPC call, unaffected by this change since the function itself isn't
  touched).
