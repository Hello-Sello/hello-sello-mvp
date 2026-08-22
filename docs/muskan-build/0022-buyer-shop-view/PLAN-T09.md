# PLAN-T09 — Connections and verification must be server-granted, not self-declared

**Ticket:** `TICKETS.md` T09 · **rev 3** · 2026-08-23 (round 1: 2 blocking + 10 notes · round 2: **4 blocking — 2 of them defects in round 1's own fold-ins** + 8 notes. Budget SPENT, did NOT converge — the 6th ticket on this slug.)
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

### 0c · 🔴 ROUND 1 FOUND A SECOND, LIVE ONE — on the **INSERT** side, against a **shipped** RPC.

rev 1 wrote the INSERT side off as *"a member can attribute a request to a colleague. Intra-company,
no cross-company consequence."* **That reason was false** (L-026 — a plausible justification that
traces to nothing). `inbox_insert` pins `sender_company_id`; **nothing anywhere constrains
`sender_person_id`** — no policy clause, no CHECK tying it to the company. So the sender may be a
person at *any* company. Found by `plan-checker`, reproduced independently by the orchestrator as
Eva/Bavaria inside `BEGIN … ROLLBACK`:

```
BEFORE  Alice-Eva edges = 0
INSERT 0 1        ← type='connect_person', sender_person_id = Alice (GreenLeaf),
                    sender_company_id = Bavaria (my own — the policy is satisfied),
                    receiver_person_id = Eva (me)
accept_person_connection(...) → a51ef75a-…              ← SHIPPED SECURITY DEFINER RPC, 20260724100400
AFTER   Alice-Eva edges = 1 | initiated_by = 11111111-… ← Alice. She never agreed, and the row says she asked.
```

A non-consensual person-graph edge, **falsely attributed to the victim as the initiator**, plus the
p2p DM thread the accept mints. `accept_person_connection` is not defective — it verifies the item
is addressed to the caller and is pending, exactly as T09's own RPC would. Both RPCs read consent
from a row the attacker wrote.

> **⚠️ Correction to round 1's evidence, recorded not silently swapped:** the checker reported
> `people_visible 3 → 4 · bob_visible 0 → 1`. That **does not reproduce** on this seed — Alice and
> Carla are already visible to Eva before any forgery (`step0 visible: Alice,Carla,Eva`, unchanged
> at every step). The finding is real; the visibility delta is fixture-dependent and is **not**
> claimed. What is proven is the forged edge and the false attribution.

**Remedy (verified safe before acceptance, L-003):** `inbox_insert`'s `WITH CHECK` gains
`AND sender_person_id = auth.uid()`.
- Both client inserts already pass it — `discover/actions.ts:77` and `discover/personActions.ts:57`
  both write `sender_person_id: uid`. Read, not assumed.
- The **only** function inserting into the table is `deliver_deal`, `SECURITY DEFINER` owned by
  `postgres` (`rolbypassrls = true`), so policies do not apply to it and its legitimate
  colleague-attributed write is unaffected. Verified by catalogue query, 1 row.

---

## 1 · Files

| file | what |
|---|---|
| `supabase/migrations/20260822110000_connection_consent_and_verification_lockdown.sql` | **new** — the whole lockdown, 5 parts |
| `supabase/tests/connection_consent_lockdown_test.sql` | **new** — RED-first proof, 11 blocks |
| `supabase/tests/run_connection_consent_lockdown_test.sh` | **new** — runner, `-f -` on STDIN (L-013 / the shim trap) |
| `src/modules/messaging/supabase/store.ts` | `acceptInbox` — pair-probe + INSERT → one `rpc()` call |
| `src/app/onboarding/actions.ts` | resubmit UPDATE → `rpc()` call |
| `src/types/database.types.ts` | two new `Functions` entries, shapes fixed (N-c): `accept_connection_request: { Args: { p_inbox_item_id: string }; Returns: string }` and `resubmit_company_verification: { Args: never; Returns: undefined }` — this file types zero-arg functions as `Args: never` (`:4710`), proven by `supabase.rpc('is_hs_team')` at `src/app/admin/layout.tsx:16`; `Record<string, never>` appears nowhere here and would break the no-arg call. ⚠️ **NOT reproducible from `supabase gen types`** (undocumented `update_deal_draft` hand-edit) — hand-edit, never regenerate |

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
   current_company_id()` / `sender_company_id = current_company_id()` each `RAISE` → **`type NOT IN ('connect',
   'connect_message','pricelist_request')` RAISEs (N2 — the shipped sibling
   `accept_person_connection` checks its type explicitly at `20260724100400:49-51`; a `deal_card`
   item reaching this function proves no hole today but the contract would be accidental)** →
   canonical
   order → **ENSURE, not insert**: adopt the live pair row if one exists
   (`uq_relationship_pair_active`), else
   `INSERT (company_a_id, company_b_id, initiated_by_company_id, inbox_item_id, status,
   created_by, updated_by) VALUES (…, sender_company_id, p_inbox_item_id, 'active', auth.uid(),
   auth.uid()) ON CONFLICT DO NOTHING RETURNING id`; if the INSERT returned nothing, re-SELECT the
   pair row and return the winner's id. Returns the id on every path.

   > **B3 (round 2, new) — `created_by` / `updated_by` were missing from rev 2's INSERT.** Both are
   > **nullable with no default**, and `relationship`'s only trigger is
   > `trg_relationship_set_updated_at`, which is BEFORE **UPDATE** — verified. Today
   > `store.ts:615-616` writes both, so the RPC would have written NULL silently and no planned
   > check would have noticed. `auth.uid()` reads the JWT GUC and is unaffected by
   > `SECURITY DEFINER`. Block 5 now asserts both.
   > **B4 (round 2, new) — the `FOR UPDATE` claim was overstated.** It serialises two accepts of
   > **one** item, which is real; it does **nothing** for two *different* pending items on the same
   > company pair (a `connect` and a `pricelist_request` can both be live). Those take different
   > row locks, both pass every guard, both find no pair row, and one gets a raw `23505` surfaced
   > to the user. **The single-pair guarantee comes from `uq_relationship_pair_active`, not from
   > `FOR UPDATE`** — hence `ON CONFLICT DO NOTHING` + re-SELECT above. **A true two-session proof
   > is not runnable inside this harness** (the suite is one transaction), so the claim is not
   > made: block 6 proves the adopt path returns the existing id, and the correctness of the race
   > rests on the unique index, which block 6 also asserts exists.

3. **Migration part 3 — `company` column allowlist (DEV-88 pattern).**
   `REVOKE UPDATE ON public.company FROM authenticated;` then re-`GRANT UPDATE` **TO
   authenticated** on the 20 survivors, enumerated (N-a — DEV-88 enumerated every column;
   `company` has exactly 23):
   `id, name, country, address, description, primary_products, website, metadata, created_by,
   updated_by, created_at, updated_at, deleted_by, deleted_at, tagline, cover_path, logo_path,
   warehouse_location, city, deactivated_at` — omitting **`verification_status`, `verified_at`,
   `verified_by`**.
   `REVOKE UPDATE ON public.company FROM anon;` — `anon`'s `SELECT` is left alone (out of scope;
   `get_public_profile` is a deliberate public read).
   > **Deviation, declared not silent:** the criterion names `verification_status` alone. The
   > other two are the same fact — *who verified this company and when* — and leaving them
   > writable lets a member forge the verification audit trail while the status is locked. Three
   > columns, one concept. **Muskan adjudicates at G4.**
   > **Out of scope, recorded not fixed:** `authenticated` also holds `UPDATE` on `company.id`,
   > `created_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by` — six columns (N1).
   > Separate class, separate ticket.

4. **Migration part 4 — `resubmit_company_verification`.**
   `UPDATE company SET verification_status = 'pending', updated_at = now() WHERE id =
   current_company_id() AND verification_status = 'rejected'`; `IF NOT FOUND THEN RAISE`. The
   `rejected` predicate stays **inside** the function — it is the only transition it can perform.

5. **Migration part 5 — `pending_inbox_item` identity lockdown, UPDATE side (§0b).**
   `REVOKE UPDATE ON public.pending_inbox_item FROM authenticated, anon;` then re-`GRANT
   UPDATE (note, status, assigned_to, assigned_at, assigned_by, metadata, created_at,
   updated_at, deleted_at) ON public.pending_inbox_item TO authenticated;` — 9 kept + 6 omitted +
   `id` = 16 ✓ — omitting **`type`, `sender_person_id`, `sender_company_id`,
   `receiver_company_id`, `receiver_person_id`, `deal_card_id`**.
   > **`id` dropped from the allowlist at rev 2 (N9).** DEV-88 re-granted `person.id`, but there
   > the row is keyed to `auth.uid()`; here `inbox_update`'s `WITH CHECK` inspects only the
   > `receiver_*` columns, so a writable `id` is actually mutable. No client update writes it.

5b. **Migration part 6 — `pending_inbox_item` identity lockdown, INSERT side (§0c).**
   ```sql
   DROP POLICY IF EXISTS inbox_insert ON public.pending_inbox_item;
   CREATE POLICY inbox_insert ON public.pending_inbox_item
     FOR INSERT TO authenticated
     WITH CHECK (sender_company_id = public.current_company_id()
                 AND sender_person_id = auth.uid());
   ```
   > **🔴 B1 (round 2) — a defect in round 1's fold-in, caught before it shipped.** rev 2 specified
   > only the `WITH CHECK` expression. The live policy is `TO authenticated`
   > (`20260607170000_rls_policies.sql:233`; confirmed live: `roles = {authenticated}`), so
   > executing rev 2's text verbatim would have re-created it as **`{public}`** — the
   > dropped-role-list class, SECURITY-CHECKLIST **S5**, and the exact mistake ADR-0005 round 4
   > caught. Observable: as `anon` the INSERT would fail
   > `permission denied for function current_company_id` instead of a clean policy denial. Shape
   > follows the sibling precedent `20260724100200_inbox_person_rls.sql:20-21`. The migration
   > header quotes the live `pg_policies` row. rev 2's *"carried byte-identical"* claim is
   > withdrawn — the clause is **semantically** identical and explicitly schema-qualified.

   > ⚠️ **Both new column allowlists carry DEV-88's maintenance caveat in the migration header
   > (N8):** a future `ALTER TABLE … ADD COLUMN` is **not** writable by `authenticated` until it is
   > added to the re-GRANT. That is the documented cost of the column-grant approach, and it now
   > applies to `company` and `pending_inbox_item` as well as `person`.

6. **Client — `store.ts`.** Delete the pair probe and the INSERT — **lines 581-620**, starting at
   `const [companyA, companyB] =` (N-f: rev 2 said ~583 and would have left a dangling
   destructuring; `companyA`/`companyB` occur only at 581/597/598/610/611); call
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
4. `inbox_item_id` is stamped **on the mint path only** — the adopt branch returns an existing row
   and stamps nothing, so the client's probe still misses it (N-e; pre-existing, and
   `idx_relationship_inbox_item` is **non-unique**, so `.maybeSingle()` at `store.ts:549` is itself
   unguarded). Blocks 5-8 cover invariants 1-6 **with that qualification**, not unqualified.
5. `created_by` / `updated_by` = the accepting person.
6. `status = 'active'`.
7. A `deal_card` accept returns **before** any of this (`claim_deal_ticket`) — untouched.
8. The function does **not** flip the inbox item's status; `connect.acceptItem` owns that.

9. **N3, named not waived — an inactive pair is still adopted.** `uq_relationship_pair_active`
   is `(company_a_id, company_b_id) WHERE deleted_at IS NULL` and `relationship` has **no** status
   CHECK (only `relationship_canonical_order`). So accepting against a `suspended`/`ended` pair
   returns an id, `acceptItem` flips the item to `accepted`, and `is_connected_to_company()` still
   returns false — post-T06 that reads as *"accepted, catalogue still hidden"*. **Pre-existing** in
   `store.ts:594-605`; T06 is what changed its meaning (L-027's own trigger). Carried forward as
   behaviour, **not** re-activated here — re-activating a deliberately suspended relationship on an
   unrelated accept is a bigger call than T09 owns. Belongs in the G4 walk.

10. **N-d — after T09 nothing in the application can suspend, end or soft-delete a relationship.**
   Step 1 removes `UPDATE` and `DELETE` with no replacement and rev 2 never said so (rule 4).
   Verified harmless: no disconnect surface exists, `relationship_status` seeds
   `active/suspended/ended`, every live row is `active`, and the only writes are in
   `connection_visibility_override_test.sql:364-415`, all after `RESET ROLE`. **This also makes
   invariant 9's inactive-pair dead end unreachable** rather than merely carried forward — so the
   G4 walk item invariant 9 asked for is withdrawn.
11. **N-h — the RPC carries no verification or RBAC gate:** any member of the receiving company can
   accept. No regression (today's `acceptItem` has none either, and `product_public_select` still
   carries `is_caller_verified()`), but the RPC is now the sole authority and that is stated, not
   assumed.

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
**blocks 1, 3, 3b, 3c and 7** must FAIL against today's schema, which is what proves they exercise
the holes. That list appears **once**, here, and §6 step 2 refers to it rather than restating it
(B2, round 2 — rev 2 stated it three incompatible ways and two of them omitted 3b/3c, the *only*
evidence that the new `sender_person_id` clause does anything).

| # | block | asserts |
|---|---|---|
| 1 | direct INSERT on `relationship` as `authenticated` | `42501` — the grant is gone, not merely policy-gated |
| 2 | direct UPDATE and DELETE on `relationship` | `42501` |
| 3 | forge `sender_company_id` on an own-received inbox item (UPDATE) | `42501` (**§0b — the reproduced attack, inverted**) |
| 3b | INSERT an inbox item whose `sender_person_id` is **not** the caller | denied by `inbox_insert` (**§0c — the person-graph forge**) |
| 3c | `accept_person_connection` can no longer be reached from a forged item | the §0c repro, re-run, now fails at the INSERT |
| 4 | `accept_connection_request` for an item addressed to **another** company | RAISEs **and writes nothing** (row count re-checked after) |
| 5 | `accept_connection_request` on a legitimate pending item | mints one row, canonical order, `initiated_by` = sender, **`created_by` = `updated_by` = the accepting person, neither NULL** (B3) |
| 6 | the same call twice, and on an already-connected pair | adopts — exactly one active row per pair; **`uq_relationship_pair_active` asserted to exist**, since it and not `FOR UPDATE` is what makes the race safe (B4) |
| 7 | direct UPDATE of `company.verification_status` as a member | `42501` |
| 8 | `resubmit_company_verification` on a **rejected** company | `pending` |
| 9 | `resubmit_company_verification` on a **verified** company | RAISEs; status unchanged (no self-verify) |
| 10 | `approve_company` / `reject_company` as HS team | still work |
| 11 | `anon` executes either new function | denied (the ritual, both halves) |

**⚠️ B2 — the RED proof cannot be one run.** The suite is one `BEGIN … ROLLBACK` under
`ON_ERROR_STOP=1` (the precedent runner, `run_person_company_lockdown_test.sh:20`). Against
today's schema block 1's INSERT **succeeds**, so block 1 RAISEs, psql aborts the file, and blocks
3/3b/7 never run — while 4/5/6/8/9/11 would fail `42883` (function does not exist), which is
L-023's *wrong red*. **One run can only ever prove block 1.** So the RED proof is **five separate
single-block scripts — 1, 3, 3b, 3c, 7 — the list above, verbatim** — run **before** the migration
is applied, each output pasted
into REVIEW.md with its failure message quoted (S7's evidence rule). Per L-023 that is the
**orchestrator's** job — `test-writer` cannot run anything.

**⚠️ The `anon` assertion in block 11 must be able to fail.** Since `20260817120000` a fresh
function is *born* without `anon` EXECUTE (default-privileges narrowing + the
`revoke_anon_execute_on_new_function` event trigger), so a `proacl` grep passes whether or not
the ritual is in the file (**L-010, verbatim**). Block 11 therefore asserts by **calling** as
`anon` and expecting `42501`, not by inspecting `proacl`.

---

## 6 · Verification

1. `supabase db reset` — the migration applies from committed files.
2. `bash supabase/tests/run_connection_consent_lockdown_test.sh` — GREEN. The RED proof is the
   five pre-migration single-block scripts named in §5 (**1, 3, 3b, 3c, 7**) — one list, stated
   once there; do not restate a different one here (B2).
3. All SQL runners on the clean reset. **Today: 37 runners over 42 suite files (5 never
   execute). This ticket adds one of each → report 38 over 43** (N6), never "all". Count with
   python — `ls | wc -l` is unstable through the shell filter here.
4. `npx tsc --noEmit` · `eslint` on the touched files (6 pre-existing errors elsewhere).
5. Unit suite — expect 453/453, unchanged (no unit surface).
6. **e2e, on a clean `db reset` (L-022: `npm test` is Playwright here, not the unit suite):**
   `inbox-accept.spec.ts` (the accept flow this rewrites), `deal-c2c-create.spec.ts` (T09's own
   cross-lane warning), `discover-shop.spec.ts` (T05/T06's guard), `discover.spec.ts`, **`auth-gate.spec.ts` and
   `admin-verification.spec.ts`** (N-b — their fixtures write `verification_status` /
   `verified_at` / `verified_by` directly at `e2e/fixtures/auth-gate-fixtures.ts:54,76,106,136`
   and `admin-verification.spec.ts:41`; verified safe because both build a **service-role**
   client, which keeps its grants and `rolbypassrls` — but rev 2's *"only behavioural dependants"*
   claim was false and the suites were missing from this list).
   > **N4 — `acceptItem` has TWO UI entry points**, not one: `connect/components/InboxView.tsx:137`
   > **and** `discover/sections/RequestsSection.tsx:98`. Only the inbox one has behavioural e2e
   > cover (`discover.spec.ts` asserts layout only), so **the Discover accept surface must be
   > walked by hand at G4**.
   > **N5 — an unnamed behaviour change, now named (rule 4).** Today the guarded UPDATE matching
   > zero rows returns **no error** (`onboarding/actions.ts:180-185`); the RPC's
   > `IF NOT FOUND THEN RAISE` turns that into a user-visible *"Could not resubmit for review"* —
   > and it fires **after** the licence files have already uploaded. No e2e covers the resubmit
   > submit (`auth-gate.spec.ts` asserts only the redirect + banner), so blocks 8/9 prove the RPC,
   > **not** the caller. Walk it at G4.
7. Re-query G1, G5 and `inbox_insert`'s `WITH CHECK` after the migration — the grant lists and
   the policy must have actually changed.
8. **N7 — paste the `anon` blast-radius scan** rather than asserting it: `has_function_privilege`
   over every function whose body mentions `relationship`, the view catalogue, and
   `product_public_select`'s role list. Round 1 verified it comes back clean; the plan must show
   the query, per the checklist's evidence rule.

## 7 · Not built

- `company.id` / `created_at` / `created_by` / `deleted_at` / `deleted_by` remain
  `authenticated`-writable (step 3's recorded out-of-scope note).
- `anon` keeps `INSERT` on `pending_inbox_item` (all 16 columns) — step 5 revokes only its
  `UPDATE`. Inert today only because `inbox_insert` is role-scoped to `authenticated`: the same
  "coincidence, not a design" (N-g).
- `anon` still holds `INSERT/UPDATE/DELETE/TRUNCATE` on `product` and `pricelist_item`, blocked
  today only because `current_company_id()` is NULL — the same "coincidence, not a design" this
  plan cites for `relationship`. Out of scope for T09; worth its own sweep (N10).
- Nothing in T06, T07 or T08 is touched.
