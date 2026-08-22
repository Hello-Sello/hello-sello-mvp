# PLAN-T09 — Connections and verification must be server-granted, not self-declared

**Ticket:** `TICKETS.md` T09 · **rev 1** · 2026-08-22
**Blocks:** T06's G4. **Depends on:** — (nothing in this slug; the two holes predate it)
**Precedent:** DEV-88 `20260710120000_person_company_id_lockdown.sql` — read in full, followed
statement for statement.

---

## 0 · Ground truth — every fact below was queried, not recalled

| # | claim | evidence |
|---|---|---|
| G1 | `authenticated` **and `anon`** hold table-wide `INSERT, UPDATE, DELETE, TRUNCATE` on `relationship` | `information_schema.role_table_grants` |
| G2 | `rel_all` is one `ALL` policy; `WITH CHECK` = `current_company_id() = company_a_id OR current_company_id() = company_b_id` — **the counterparty is never consulted** | `pg_policies` |
| G3 | `relationship` has **exactly one write call site in `src/`** — `messaging/supabase/store.ts:609` (INSERT). The other 17 references are `.select(...)` | `grep -rn 'from("relationship")' src/` |
| G4 | **No function writes `relationship`** — INVOKER or DEFINER | `pg_proc.prosrc ~* 'insert into…relationship'` → 0 rows |
| G5 | `authenticated` holds column `UPDATE` on **all 23** `company` columns, `verification_status` / `verified_at` / `verified_by` among them | `information_schema.role_column_grants` |
| G6 | `company_update` = `USING/WITH CHECK (id = current_company_id() OR is_hs_team())` — a member may update their own company row | `pg_policies` |
| G7 | `company.verification_status` has **exactly one client write** — `onboarding/actions.ts:181`, already `.eq('verification_status','rejected')`-guarded. The two other `company` updates (`catalog/manage.ts:140`, `companies/index.ts:91`) build **closed patch sets** that cannot contain the verification triple | read both bodies |
| G8 | `approve_company` / `reject_company` are `SECURITY DEFINER` → unaffected by a column REVOKE | `pg_proc.prosecdef` |
| G9 | Every existing SQL suite that sets `verification_status` as a fixture does so **after `RESET ROLE`** (as `postgres`) — no suite writes it while impersonating `authenticated` | 5 sites checked individually |

### 0b · 🔴 NEW — the ticket's remedy is defeated one level down. Reproduced, then rolled back.

T09 as filed routes the mint through an RPC that reads consent from `pending_inbox_item`.
**That row is itself forgeable by the attacker.** `inbox_insert`'s `WITH CHECK` pins
`sender_company_id = current_company_id()`, but `inbox_update`'s `WITH CHECK` pins only
`receiver_company_id` / `receiver_person_id` — **it never re-checks who sent the request**, and
`authenticated` holds table-wide `UPDATE`. So:

```
acting as company: 639069bb…  (Bavaria, Eva — no relationship to GreenLeaf)
INSERT 0 1     ← a self-addressed request: sender = Bavaria, receiver = Bavaria (legal)
UPDATE 1       ← set sender_company_id = GreenLeaf, sender_person_id = Carla
FORGED: 1 row(s) now claim GreenLeaf asked to connect to Bavaria
```

The RPC would then check *"is this addressed to my company? is it pending?"* — both true — and
mint the relationship. **This is L-027 recursing: the consent evidence is a permission input, so
its own write path is in scope.** The `type` column is forgeable the same way (one `UPDATE` can
satisfy all five `inbox_*` CHECK constraints at once).

> ⚠️ **AMENDED at /build T09 (2026-08-22): `pending_inbox_item`'s identity columns are added to
> this ticket's scope**, and one criterion is added (C3 below). Without it, criterion 2's
> *"the caller shall not be able to supply the counterparty as a free parameter"* is satisfied in
> letter only — the counterparty becomes a **stored** free parameter instead of a call parameter.
> Every client `UPDATE` on this table writes only `status` / `assigned_to` / `assigned_by` /
> `assigned_at` (7 sites, all read), so the column allowlist costs nothing. **Muskan adjudicates
> at G4.**

---

## 1 · Files

| file | what |
|---|---|
| `supabase/migrations/20260822110000_connection_consent_and_verification_lockdown.sql` | **new** — the whole lockdown, 5 parts |
| `supabase/tests/connection_consent_lockdown_test.sql` | **new** — RED-first proof, 11 blocks |
| `supabase/tests/run_connection_consent_lockdown_test.sh` | **new** — runner, `-f -` on STDIN (L-013 / the shim trap) |
| `src/modules/messaging/supabase/store.ts` | `acceptInbox` — pair-probe + INSERT → one `rpc()` call |
| `src/app/onboarding/actions.ts` | resubmit UPDATE → `rpc()` call |
| `src/types/database.types.ts` | two new `Functions` entries. ⚠️ **NOT reproducible from `supabase gen types`** (undocumented `update_deal_draft` hand-edit) — hand-edit, never regenerate |

**Grepped for the fixture, not the module (L-028):** `relationship` + `verification_status` +
`pending_inbox_item` across `src/`, `supabase/tests/`, `e2e/`. The only behavioural dependants are
`e2e/inbox-accept.spec.ts` (the accept flow) and `e2e/deal-c2c-create.spec.ts` (T09's own
cross-lane warning). Both re-run in step 6.

---

## 2 · Signatures

```sql
public.accept_connection_request(p_inbox_item_id uuid) RETURNS uuid   -- the relationship id
public.resubmit_company_verification()                  RETURNS void
```

Both `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, both under the
**three-statement grant ritual** — `REVOKE ALL … FROM public, anon` (both, always — the
2026-08-17 rule) then `GRANT EXECUTE … TO authenticated`.

`accept_connection_request` takes **one** parameter. The counterparty, the caller's own company
and the canonical `(a < b)` ordering are all *derived*, never supplied.

---

## 3 · Steps, in runnable order

1. **Migration part 1 — `relationship`: no direct write door at all.**
   `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.relationship FROM authenticated;`
   `REVOKE ALL ON public.relationship FROM anon;` (G1 — `anon` holds the same grants; RLS
   happens to block it today because `current_company_id()` is NULL, which is a coincidence,
   not a design). `SELECT` for `authenticated` is untouched — every read stays on `rel_all`.

2. **Migration part 2 — `accept_connection_request`.** Body, in order:
   `auth.uid()` not null → `current_company_id()` not null → `SELECT … FROM pending_inbox_item
   WHERE id = p_inbox_item_id FOR UPDATE` (serialises two accepts of one item) → not found /
   soft-deleted / `status <> 'pending'` / `receiver_company_id IS DISTINCT FROM
   current_company_id()` / `sender_company_id = current_company_id()` each `RAISE` → canonical
   order → **ENSURE, not insert**: adopt the live pair row if one exists
   (`uq_relationship_pair_active`), else INSERT with `initiated_by_company_id = sender_company_id`,
   `inbox_item_id = p_inbox_item_id`, `status = 'active'`. Returns the id either way.

3. **Migration part 3 — `company` column allowlist (DEV-88 pattern).**
   `REVOKE UPDATE ON public.company FROM authenticated;` then re-`GRANT UPDATE (…20 columns…)`,
   omitting **`verification_status`, `verified_at`, `verified_by`**.
   `REVOKE UPDATE ON public.company FROM anon;` — `anon`'s `SELECT` is left alone (out of scope;
   `get_public_profile` is a deliberate public read).
   > **Deviation, declared not silent:** the criterion names `verification_status` alone. The
   > other two are the same fact — *who verified this company and when* — and leaving them
   > writable lets a member forge the verification audit trail while the status is locked. Three
   > columns, one concept. **Muskan adjudicates at G4.**
   > **Out of scope, recorded not fixed:** `authenticated` also holds `UPDATE` on `company.id`,
   > `created_at`, `created_by`, `deleted_at`, `deleted_by`. Separate class, separate ticket.

4. **Migration part 4 — `resubmit_company_verification`.**
   `UPDATE company SET verification_status = 'pending', updated_at = now() WHERE id =
   current_company_id() AND verification_status = 'rejected'`; `IF NOT FOUND THEN RAISE`. The
   `rejected` predicate stays **inside** the function — it is the only transition it can perform.

5. **Migration part 5 — `pending_inbox_item` identity lockdown (§0b).**
   `REVOKE UPDATE ON public.pending_inbox_item FROM authenticated, anon;` then re-`GRANT
   UPDATE (id, note, status, assigned_to, assigned_at, assigned_by, metadata, created_at,
   updated_at, deleted_at)`, omitting **`type`, `sender_person_id`, `sender_company_id`,
   `receiver_company_id`, `receiver_person_id`, `deal_card_id`**.

6. **Client — `store.ts`.** Delete the pair probe and the INSERT (lines ~583-620); call
   `supabase.rpc("accept_connection_request", { p_inbox_item_id: input.inboxItemId })`.
   The `inbox_item_id` idempotency probe at the top **stays** (a read, and it is what returns the
   existing thread ids). The canonical-order block moves into the RPC and is deleted here.
   `input.ownCompany` / `input.senderCompany` stay in `AcceptInput` — `planRollout` still needs
   them for the threads.

7. **Client — `onboarding/actions.ts:178-185`.** Replace the guarded UPDATE with
   `supabase.rpc('resubmit_company_verification')`; keep the `currentStatus === 'rejected'`
   caller-side branch so the RPC's `RAISE` stays unreachable on the happy path.

8. **`database.types.ts`** — add both functions to `Functions`. Hand-edit; do not regenerate.

---

## 4 · Invariants — enumerated from the statements, not from the risk narrative (L-011)

**`acceptInbox`'s existing contract, which the RPC must not break:**
1. **ENSURE, not insert** — an already-connected pair is adopted, not re-minted (`23505`
   otherwise; this is the DEV-83 bug, fixed this session).
2. The canonical order CHECK `company_a_id < company_b_id` is satisfied for either direction.
3. `initiated_by_company_id` = the **requester's** company, not the accepter's.
4. `inbox_item_id` is stamped — the client's idempotency probe keys on it.
5. `created_by` / `updated_by` = the accepting person.
6. `status = 'active'`.
7. A `deal_card` accept returns **before** any of this (`claim_deal_ticket`) — untouched.
8. The function does **not** flip the inbox item's status; `connect.acceptItem` owns that.

**Grants:** every `company` column except the verification triple stays writable; every
`pending_inbox_item` column except the six identity columns stays writable; `relationship`
`SELECT` survives.

**Would any planned check notice if each vanished?** Blocks (5)-(8) of the test cover 1-6;
block (9) covers 7; `e2e/inbox-accept.spec.ts` covers 8 end-to-end.

---

## 5 · Test surface — what the existing suites do NOT cover (L-009)

Grepped `supabase/tests/` for all three symbols. **Nothing anywhere asserts that a direct write
to `relationship`, `company.verification_status` or `pending_inbox_item`'s identity columns is
denied** — every existing hit is fixture setup running as `postgres` (G9), or a *read*-side
assertion (`connection_visibility_override_test.sql`, T06's). `person_company_lockdown_test.sql`
is the shape precedent, not overlapping coverage.

**New suite `connection_consent_lockdown_test.sql`** — one `BEGIN … ROLLBACK`, ephemeral
fixtures, `SET LOCAL ROLE` + `request.jwt.claims` per perspective, `RESET ROLE` between,
`RAISE` on any failure, prints `ALL CONNECTION CONSENT LOCKDOWN TESTS PASSED`. **RED-first** —
blocks 1, 3 and 7 must FAIL against today's schema, which is what proves they exercise the holes.

| # | block | asserts |
|---|---|---|
| 1 | direct INSERT on `relationship` as `authenticated` | `42501` — the grant is gone, not merely policy-gated |
| 2 | direct UPDATE and DELETE on `relationship` | `42501` |
| 3 | forge `sender_company_id` on an own-received inbox item | `42501` (**§0b — the reproduced attack, inverted**) |
| 4 | `accept_connection_request` for an item addressed to **another** company | RAISEs **and writes nothing** (row count re-checked after) |
| 5 | `accept_connection_request` on a legitimate pending item | mints one row, canonical order, `initiated_by` = sender |
| 6 | the same call twice, and on an already-connected pair | adopts — exactly one active row per pair |
| 7 | direct UPDATE of `company.verification_status` as a member | `42501` |
| 8 | `resubmit_company_verification` on a **rejected** company | `pending` |
| 9 | `resubmit_company_verification` on a **verified** company | RAISEs; status unchanged (no self-verify) |
| 10 | `approve_company` / `reject_company` as HS team | still work |
| 11 | `anon` executes either new function | denied (the ritual, both halves) |

**⚠️ The `anon` assertion in block 11 must be able to fail.** Since `20260817120000` a fresh
function is *born* without `anon` EXECUTE (default-privileges narrowing + the
`revoke_anon_execute_on_new_function` event trigger), so a `proacl` grep passes whether or not
the ritual is in the file (**L-010, verbatim**). Block 11 therefore asserts by **calling** as
`anon` and expecting `42501`, not by inspecting `proacl`.

---

## 6 · Verification

1. `supabase db reset` — the migration applies from committed files.
2. `bash supabase/tests/run_connection_consent_lockdown_test.sh` — GREEN. Re-run blocks 1/3/7
   against a stashed pre-fix schema to confirm they were RED (mutation proof).
3. All 37 SQL runners on the clean reset (**37 runners over 42 suite files — 5 never
   execute**; report both numbers, never "all").
4. `npx tsc --noEmit` · `eslint` on the touched files (6 pre-existing errors elsewhere).
5. Unit suite — expect 453/453, unchanged (no unit surface).
6. **e2e, on a clean `db reset` (L-022: `npm test` is Playwright here, not the unit suite):**
   `inbox-accept.spec.ts` (the accept flow this rewrites), `deal-c2c-create.spec.ts` (T09's own
   cross-lane warning), `discover-shop.spec.ts` (T05/T06's guard).
7. Re-query G1 and G5 after the migration — the grant lists must have actually changed.

## 7 · Not built

- `company.id` / `created_at` / `created_by` / `deleted_at` / `deleted_by` remain
  `authenticated`-writable (step 3's recorded out-of-scope note).
- `pending_inbox_item`'s **INSERT** side: `inbox_insert` does not pin `sender_person_id`, so a
  member can attribute a request to a colleague. Intra-company, no cross-company consequence —
  recorded, not fixed.
- Nothing in T06, T07 or T08 is touched.
