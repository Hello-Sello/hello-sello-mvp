# Architecture Notes — Archive: August 2026

> Moved out of `ARCHITECTURE-NOTES.md` (2026-09-08) to keep the active file short.
> Topical reference + current-month log live there.

---

## Tier-ladder pricing — one read door (2026-08-16)

- **Volume tiers live in `pricelist_item_tier`; every surface prices through the `current_pricelist_item` view + the pure `resolveTierPrice` resolver.** Shop card, the "See all prices" popover, the basket, and the deal-card hint all resolve a quantity's price through the same view + resolver, so two screens can never disagree about what a quantity costs. Any new feature that needs a price must read through that same door — reading `pricelist_item`/`pricelist_item_tier` directly re-creates exactly the twin-owner drift T05 killed (the `packLabels`/`packSizes` duplicate). Writes go only through `save_price_ladder` (INVOKER RPC; the ascending-rung rule + ownership checks live at the database, not in each caller). *(Source: 0021 tier ladder T01–T07, session 73; ADR-0004.)*

## `create or replace` from a stale copy silently drops guards — repeat live incident (2026-08-16)

- Re-declaring a Postgres function with an old file as the base silently deletes every guard added to the live body since — the redeclare "succeeds", nothing fails, and the hole ships. Second observed instance of this class: **`list_discoverable_companies()` on production lost its verified-caller gate this way** (found during the 0021 build; the repair rides migration E — cloud push URGENT, ledgered 2026-08-14). Standing rule: before any `create or replace`, diff the new body against the LIVE definition (latest-timestamp migration or the deployed body), predicate by predicate, grants included. *(Source: 0021 T08; `docs/deploy/cloud-migrations-pending.md` 2026-08-14 entry.)*

## `REVOKE ALL ... FROM public` does NOT revoke `anon` — a whole class of exposed RPCs (2026-08-16)

- **On Supabase, `anon` is a real role that receives `EXECUTE` on new `public` functions via `ALTER DEFAULT PRIVILEGES`.** `REVOKE ALL ON FUNCTION ... FROM public` revokes the PUBLIC pseudo-role — it never touches a grant held by `anon` itself. So the very common pairing `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated` leaves the function **callable unauthenticated** through `/rest/v1/rpc/<name>`. The only correct form is an explicit `REVOKE EXECUTE ON FUNCTION ... FROM anon;`. *(Found by the database linter, lint `0028_anon_security_definer_function_executable`, during the Release 2 push; fixed for the 5 person-graph RPCs in `20260816210000`.)*
- **`CREATE OR REPLACE FUNCTION` preserves privileges** — it does NOT reset `proacl`. Proven empirically before relying on it: re-applying a function definition on top of a live one left `anon` revoked and `authenticated` granted untouched. (Only `DROP` + `CREATE` resets grants — which is why any migration that drops a function to change its return type MUST re-apply its grants, as `20260724101100` does.)
- **Defence-in-depth, not a breach:** in this instance nothing leaked, because every affected body gated on `auth.uid()` (NULL for anon) and the list RPCs also gated on `is_caller_verified()` (false for anon) — probed on production as `anon`, all returned 0 rows and the one write RPC raised before writing. The danger is structural: with the grant open, the function body is the *only* thing standing between the public internet and the data, so any future sibling RPC written without an `auth.uid()` gate is immediately a live hole.
- **✅ CLOSED 2026-08-17 by the full 62-function audit (`20260817120000`).** Lint 0028 on production went **65 → 1** (only `get_public_profile`, which is deliberately anon-reachable for the public `/c/<handle>` QR page — confirmed public in `src/shared/db/proxy.ts`). The audit's three real findings are below.
- **⚠️ THE RULE ABOVE WAS ONLY HALF OF IT — `anon` reaches a function through TWO independent grants and BOTH must be revoked.** Revoking `anon` alone leaves the PUBLIC grant, exactly as revoking PUBLIC alone leaves `anon`. Postgres grants `EXECUTE TO PUBLIC` on *every* function at creation (visible as a leading `=X/postgres` in `proacl`) and `anon` is a member of PUBLIC. Proven on a fresh local reset: after revoking only `anon`, **39 functions were still anon-executable**. The correct form is `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` — the 5 person-graph RPCs in `20260816210000` were saved only because earlier migrations had separately revoked PUBLIC from them.
- **Deny-by-default is NOT achievable via `ALTER DEFAULT PRIVILEGES`, despite Supabase's docs recommending it.** Revoking `anon` from the default works; revoking PUBLIC does not — Postgres merges its built-in PUBLIC grant on top of any `pg_default_acl` entry. Verified rather than assumed: revoking `authenticated` the same way DID propagate to a new function, so the stored default is honoured and PUBLIC specifically is not removable. Long-standing behaviour — Postgres BUG #8685 (2013), still open as supabase/supabase#43884, whose reporter settled on the same event-trigger workaround. **Enforcement therefore lives in an event trigger** (`revoke_anon_execute_on_new_function`, `20260817120000` §4) that strips PUBLIC + anon as part of the `CREATE FUNCTION` command itself, proven by `supabase/tests/anon_execute_lockdown_test.sql`.
- **🔴 The audit's real find was NOT an anon hole — it was an `authenticated` privilege escalation.** `seed_company_superadmin(company_id, founder_id)` is `SECURITY DEFINER`, checks **nothing** about its caller, and creates a Superadmin group + grants `team.manage` / `company.edit_profile` to whatever person_id it is handed. It had been granted to `authenticated` by `20260621100000_phase11_rbac_activation.sql`. Proven locally: an ordinary member calling `seed_company_superadmin(current_company_id(), auth.uid())` goes from `has_permission('team.manage') = false` to `true` in one call, unlocking `change_member_role` / `remove_member` / `invite_member` / `deactivate_company`. Same shape as the `person.company_id` hole but through a **function grant** instead of a column grant. Its only callers (`onboard_company`, the Phase-11 backfill) run as the owner `postgres`, so the grant bought nothing. **Lesson: an anon audit must also ask whether `authenticated` should hold the grant — the more dangerous answer was one role over.**
- **Also closed:** `sella_detect_worker` (pg_cron worker; any caller could drain the pgmq queue and drive edge-function HTTP calls) lost `anon` + `authenticated`; `search_joinable_companies` was allowing anonymous enumeration of the verified-company directory.
- **Method note — the safe way to run this class of audit:** classify by catalog first (does the body reference `auth.uid()` / `current_company_id()` at all?), read in full only the handful that reference neither, and **check `pg_policies` for anon/public-facing policies before revoking**, since RLS policy expressions are evaluated with the privileges of the *calling* role — revoking a helper that a policy calls would break the policy. Here no anon-facing policy called any of them.

## Schema drift: `ensure_rls` lived on production and in no migration (2026-08-17)

- **`public.rls_auto_enable()` + its `ensure_rls` event trigger were created by hand in the Supabase dashboard and never written into a migration.** `20260607170000_rls_policies.sql` only referred to it in a comment ("the project's rls_auto_enable already enables it"). So a fresh `supabase db reset` built a database that did **not** match production, and nothing in the repo revealed the difference.
- **Why it matters, concretely.** The trigger switches RLS on for every new table in `public`. `20260607170000` enables RLS in a one-time loop over the tables existing on 2026-06-07, so it protects nothing created after that date. Without the trigger locally, a future table whose migration forgets `enable row level security` diverges: **locally** RLS is off, rows are visible, tests pass; **on production** the trigger switches RLS on, no policies exist, and every query returns **zero rows with no error**. Silent, data-shaped, and untraceable to a trigger that isn't in the repo.
- **Captured by `20260817130000_capture_ensure_rls_drift.sql`**, whose body was copied from prod's live `pg_get_functiondef()` and diffed byte-identical before applying, making it a proven no-op on cloud and a real creation locally. Guarded going forward by `supabase/tests/ensure_rls_trigger_test.sql` (creates a table, asserts RLS is on; plus a standing "no table in public without RLS" invariant).
- **The general rule this cost us:** migrations in version control are the only source of truth — nothing gets typed into the Supabase dashboard. Drift detection is `supabase db diff --linked` before a release, so divergence shows up as a diff instead of as a mystery bug months later. *(Standard practice; cf. Bytebase / Atlas drift-detection guidance.)*

## Applying migrations out of timestamp order (cloud behind local) needs a different proof than `db reset` (2026-08-16)

- **A local `supabase db reset` replays migrations in filename order; a cloud push of a back-dated batch does not.** When local-only migrations are timestamped EARLIER than migrations already live on cloud (Release 2's `2026072410*` vs the already-applied `202607241200*` + tier ladder), the local green run proves "these work in order" — it does NOT rehearse the production sequence, where they land *underneath* newer objects. The two orders differ precisely where an older migration re-declares something a newer one also touched.
- **The four checks that do close the gap** (all cheap, all read-only until the last): (1) query cloud directly for each object the batch creates — absent means nothing to overwrite; (2) diff every `create or replace`d function/policy against its LIVE definition, predicate by predicate and grants included; (3) grep the already-applied later migrations for every object name in the batch — a hit is the stale-redeclare risk, a miss proves order-independence; (4) grep those later migrations for `DROP`s and confirm the batch references none of them (this is the failure that passes locally and fails on cloud). *(Source: Release 2, session 76.)*
- **A true prod-clone rehearsal needs Supabase preview branches, which are a PAID feature** (~$0.013/hr, Pro plan; the Hello Sello org is on Free). On Free, the four checks above plus a local re-apply of the specific colliding migration are the strongest available evidence.

## A wrapped `psql` breaks every runner that passes its file by path (2026-08-20)

- **On a dev machine where `psql` is the shim at `~/.local/bin/psql`, it `exec docker exec`s psql INSIDE the `supabase_db` container.** A host-relative `-f "$TEST_FILE"` cannot resolve there — the runner dies with `No such file or directory` before a single assertion runs. **22 of 35 runners shipped this way**, including `cross_tenant_lockdown`, `person_company_lockdown` (DEV-88's guard), `anon_execute_lockdown`, `ensure_rls_trigger` and `rbac_enforcement`.
- **Not a false-green** — psql exits non-zero and `exec` propagates it. The damage is subtler: a guard that always errors gets skipped, and "I ran the suite" quietly becomes "I ran it some other way". Slug 0022 T01's new suite even *delegated* two of its security assertions to one of the broken runners.
- **The rule: a runner feeds its file on STDIN — `-f - < "$TEST_FILE"` — never `-f <path>`.** Correct for a real psql and for the shim alike. All 35 now do; all 35 pass on a clean `db reset`. *(Found + repaired slug 0022 T01, 2026-08-20.)*
- **The general lesson:** test *infrastructure* gets written once, glanced at, and trusted forever, while the tests it runs are reviewed line by line. This was the third harness defect in one slug, after an `ON_ERROR_STOP` false-green (a suite printing `… PASSED` and exiting 0 while failing) and a seed-pollution trap (e2e runs mutate the DB that SQL suites then assert against). **A broken runner is worse than no runner — it occupies the slot where a check should be.**

## A permission gate is only as strong as the write path to its input (2026-08-22)

- **Giving an existing table a new job as a permission input puts its *write* path in scope, not just its read predicate.** T06 made `relationship` the confidentiality gate for hidden catalogue rows and reasoned carefully about `status = 'active'`, `deleted_at is null`, and why a *pending* connection must not count — all correct, all irrelevant: `authenticated` holds a direct INSERT grant on `relationship`, and `rel_all`'s `WITH CHECK` only requires the caller's **own** company be one side of the pair. Nobody has to consent to being connected to. The attacker never defeats the `status` logic; they write `'active'`.
- **Three instances of one pattern, not three bugs.** DEV-88 (`person.company_id` — a member self-assigns their company, so every company-scoped RLS predicate is self-selected); ADR-0005 round 5 (basket `product_id` stayed writable after insert, so *"the admission policy was ornamental"*); slug 0022 T06 (`relationship`). Each time the gate's read side was analysed exhaustively and nobody asked **who can write the row it reads** — the question never appears because the table already exists and looks like settled infrastructure.
- **The check is two read-only queries, run before the gate ships:** `select grantee, privilege_type from information_schema.role_table_grants where table_name = '<t>'` and `select policyname, with_check from pg_policies where tablename = '<t>'`. If `authenticated` can write it and the `WITH CHECK` does not require the **counterparty's** consent, the gate is ornamental however precise its read predicate is.
- **The remedy is identical each time:** revoke the direct grant, re-`GRANT` every other column, and route the one legitimate writer through a `SECURITY DEFINER` RPC that verifies consent from evidence **it fetches itself** — never from a caller-supplied parameter. Consent evidence usually already travels with the call and simply is not enforced (T06's accept already passed `inbox_item_id`).
- **Severity is set by what the gate protects, not by when the hole was introduced.** A self-writable `relationship` was a bookkeeping-integrity bug for as long as nothing read it for permission; T06 promoted it to a catalogue-confidentiality hole without touching it. *(Slug 0022 T06 G4; `docs/agents/LEARNINGS.md` L-027; closed by T09.)*

---

## A "single owner" of a rule is a claim about agreement with the other doors (2026-08-24)

**The pattern.** When one rule is enforced at several places, the standard remedy is to extract it
into one function and have the sites call that. Slug 0022 did exactly this: `product_visible_to_caller()`
became the single owner of *"may this caller see this product"*, consulted by both the basket write
gate and the basket read projection, and its comment says so.

- **The extraction only fixes drift between the callers you moved.** It silently creates drift with
  every *other* door that answers the same question and was not moved. Round 4 of the ship gate
  found `product_visible_to_caller` and `get_discoverable_shop` disagreeing on **three** terms —
  the seller company's `deleted_at` and `verification_status`, and the unfiled `location` rule.
- **Proving the two new callers agree is the cheap half of the claim.** "Single owner" asserts that
  this function is now *the authority* for the rule, so the audit is a **term-by-term diff against
  every other site that answers the same question** — not a check that the callers share a helper.
- **The catalogue answers it in one query.** `select proname, prosrc like '%c.deleted_at%' from
  pg_proc …` over the functions that project the same entity showed the split immediately: three
  discovery functions `t`, all three new basket functions `f`. Run that before claiming single
  ownership, not after a leak.
- **When a second copy of a predicate is genuinely justified** — here the base-table policy could
  not carry it, because RLS filters rows and not columns, so the rule had to move behind a
  `security definer` boolean — **say so in the file, and name the door it must stay equal to.**
  `20260823100000`'s buyer arm now carries that comment. A copy with a named twin is maintainable;
  a copy that believes it is the only one is not.

**Consequence for the buyer/seller split, which is the shape here:** the *owner* arm deliberately
carries none of the seller-company or unfiled terms — a seller sees their own products whatever
their company's state, and keeps their unfiled `Unassigned` pile. So the rule is "the buyer arm
equals the shop door", not "the function equals the shop door". Hoisting a term above both arms
breaks the seller; two test cells exist solely to fail if someone does.

**Surfaced by:** slug 0022 `/ship` security round 4 (2026-08-24). `docs/agents/LEARNINGS.md` L-038.
Related: [L-036's class — RLS filters rows, not columns](#) — a policy is not a projection.

---

## A migration's end state on REPLAY is not its end state on PUSH (2026-08-24)

**The pattern.** Local development replays the whole migration history from empty on every
`supabase db reset`. Production applies only the *new* files, on top of whatever is already there.
Those two produce the same end state **only if every migration is order-independent** — and a
migration that re-grants, re-creates or re-declares something is not.

- **The failure is invisible locally, by construction.** A migration that wrongly re-grants a
  privilege can be corrected by a *later* migration on replay, so `db reset` is green. On a cloud
  push, that later migration is already applied, so the re-grant is the end state. Slug 0022's
  `20260607090000` re-granted `execute on functions` to `anon`; locally it replayed *before* the
  session-77 revoke and was harmless, and on a push it would have landed *after* it.
- **A back-dated filename makes this worse and is easy to create.** That file is named `2026-06-07`
  but was authored `2026-08-22`, so it sorts ~14 months before cloud's tip. A plain `db push`
  **refuses** it and applies the rest while reporting success; `--include-all` is required, and the
  flag then pushes *everything* local that cloud lacks — so the batch must be verified in both
  directions first (`local-only` **and** `remote-only`) rather than trusting a remembered count.
- **The check that catches it:** for each migration in the batch, ask *"does this statement's
  correctness depend on another migration running after it?"* If yes, it is a replay artefact. Make
  it order-independent, or verify the end state on the target after the push — reading the object
  back off production (`pg_get_functiondef`, `pg_policy`, `has_function_privilege`) rather than
  trusting that applying the file produced what the file says.
- **Filename timestamp ≠ authoring date, and only one of the two tools preserves it.**
  `supabase db push` stamps the filename timestamp into the history table; MCP `apply_migration`
  stamps *call time*, which is what produced the 21-row history drift repaired in session 64. Prefer
  `db push` for anything that will later be diffed.

**Surfaced by:** slug 0022, T08 (2026-08-23) and its `/ship` (2026-08-24).
`docs/agents/LEARNINGS.md` L-034.

## Moving a signal to a new table moves it onto that table's integrity (2026-08-25)

**The shape.** A feature changes *where* a signal is written — from one table to another, or from a
table to a queue, a log, a message. The row's **contents** are reviewed carefully. Nobody reviews
what the destination **guarantees about who may write it**, because no policy was edited and the
diff shows no RLS change.

**The instance.** Slug 0023 moved the company-addressed deal signal off `pending_inbox_item` and
onto `chat_message`:

| | policy | identity guard |
|---|---|---|
| `pending_inbox_item` — signal **removed** | `inbox_insert` (`20260823090000:306-309`) | ✅ `sender_company_id = current_company_id() AND sender_person_id = auth.uid()` |
| `chat_message` — signal **added** | `msg_all` (`20260607170000:300-302`) | ❌ `can_access_thread(thread_id)` — nothing else |

`pending_inbox_item` had been hardened **one slug earlier**, and that migration's own header states
the intent: *"a request may no longer be attributed to someone who never asked."* Slug 0023 then
routed the deal signal onto a table where that sentence is not true — **without editing a single
policy.**

**Why review misses it.** The ADR recorded, accurately, that `chat_message` RLS was *"unchanged —
no policy is widened."* Both halves are true. **And it is the wrong question.** The policy did not
widen; **the signal migrated onto a weaker policy.** A diff-shaped review asks *what did this change
loosen?* and correctly answers *nothing*. The right question is *what did the thing I moved used to
be protected by, and what protects it now?* — which no diff can ask, because the old protection is
not in the diff either.

**The tell.** A change description containing *"we now write X to Y instead of Z"*, alongside a
review line reading *"no RLS/permissions change."* Those two sentences together are the signature.

**The check, and it is cheap.** For every table a change stops writing to and starts writing to,
put the two `WITH CHECK` clauses and the two grant sets **side by side** and diff them by hand.
Ask specifically: **who could forge this row before, and who can forge it now?** Not *did a policy
change* — the whole point is that none did.

**Related and distinct.** **L-027** (*a permission gate is only as strong as the write path to its
input*) is about a gate reading a forgeable value. This is the mirror image: **a value that was not
forgeable becomes forgeable by being relocated**, and the gate never moved at all. **L-036** (*RLS
filters rows, not columns*) is a third member of the family — each is a case where a protection is
assumed to travel with the data and does not.

**Surfaced by:** slug 0023 T01 / HEL-63, `security` finding B1, 2026-08-25. Filed as **HEL-67**
(widened) and **HEL-74**. Ruling recorded in `DECISIONS.md` 2026-08-25.

---

## 2026-08-25 — A policy predicate is a question about what the CALLER CAN SEE, not about the database

**The mechanism.** An RLS policy expression is evaluated in the **calling role's** row-security
context. So a subquery inside `USING` or `WITH CHECK` against another RLS-protected table is itself
filtered by that table's policies. `EXISTS (SELECT 1 FROM b WHERE …)` does not ask *"does this row of
`b` exist?"* — it asks **"does it exist AND may the caller see it?"** Those are different questions,
and nothing in the SQL distinguishes them.

**How it bit.** HEL-75 needed `inbox_insert` to refuse a connection request addressed to a
soft-deleted or deactivated company. The obvious inline `EXISTS` on `public.company` inherited
`company_select`, which shows `authenticated` only its own company, HS-team rows, and companies it
already `shares_connection_with_company()`. **A company you have never met is invisible** — so the
predicate collapsed into *"may I already see this company?"*, which for a connection request is
backwards: not having met them is the entire point.

Measured as Alice @ GreenLeaf: a direct `SELECT` on `company` returned **5 of 6 rows**, and the inline
predicate **refused a legitimate connect to the missing one** while blocking the deactivated company
only *by accident* — it was really gating on "do we already share a connection".

**Why it survives review.** Against a seeded database it looks correct. Every control an author
reaches for is an already-connected pair, so every control passes; the failing case only appears for a
counterparty the caller has never met, which is precisely the case no existing fixture covers.

**The rule.** *If a policy needs a fact about a row the caller is not entitled to read, that fact must
come from a `SECURITY DEFINER` function.* Inline `EXISTS` is safe only against a table with no RLS, or
when the caller's visibility is genuinely meant to be part of the predicate. This is the same reason
`product_visible_to_caller()` and `product_price_visible_to_caller()` exist, and why HEL-75 added
`company_can_receive_requests()` rather than two lines of inline SQL.

**Test discipline that catches it:** be red-first in *both* directions — one cell reproducing the
original bug, and one cell that fails against **the fix that was proposed**. A suite that only proves
the bug is gone cannot tell you it was closed with the wrong instrument.

See `docs/agents/LEARNINGS.md` **L-055**.

---

## 2026-08-25 — A SYMMETRIC policy cannot express an ASYMMETRIC rule; census the write path before fencing it

**The shape.** `deal_line_item`'s only policy, `line_all`, is `FOR ALL` with
`card_relationship_member(deal_card_id)` on both `USING` and `WITH CHECK`. That function is **true for
both sides of the relationship**. The rule it was being asked to enforce — *only the seller may set
allocation state* — is asymmetric. **No amount of policy cleverness closes that gap**, because the
policy has no term that distinguishes buyer from seller, and adding one means duplicating the
seller-gate that already lives in seven `SECURITY DEFINER` RPCs.

**The fix was not a better fence — it was noticing nobody used the gate.** A census across all of
`src/` found client code performs **exactly one** write to that table (an `INSERT`, `acceptPromotion`),
and **zero** UPDATEs and **zero** DELETEs. Every legitimate mutation already went through a definer,
which bypasses grants. So `UPDATE` and `DELETE` were **removed**, not guarded.

**The generalisation.** When a permission problem looks like it needs a policy predicate, a trigger,
or a column allowlist, first ask **who actually writes this table as this role**. An unused privilege
is deleted, not defended — and a deletion cannot drift, whereas a column allowlist silently breaks
every time a column is added and a trigger must keep enumerating the columns it protects.

**Postgres detail worth keeping:** a **column-level** `REVOKE` cannot subtract from a **table-level**
grant. DEV-159 recorded an earlier attempt at `REVOKE UPDATE (allocation_status, …)` that appeared to
do nothing; that is correct behaviour, not a bug. The table-level grant has to go first.

**Corollary for reviewers:** `REVOKE` migrations should say in a `COMMENT ON TABLE` *why* the
privilege is absent. Otherwise the next person adding a feature reads a missing grant as an oversight
and re-grants it, reopening the hole. `deal_line_item` now carries that comment.

Origin: DEV-159, `security_tickets` session, 2026-08-25.

---

## 2026-08-25 — A worktree isolates the tree, not the DATABASE. Parallel sessions share one Postgres, and migration files are per-branch.

**This CHANGES standing guidance rather than adding to it.** `CLAUDE.md` §2b concluded, after L-040,
that *"parallel sessions need separate branches or worktrees, not a sync file."* That is true for
**files** and **false for the local database**, which is the one resource neither mechanism isolates.

**Measured 2026-08-25**, two sessions on two branches against one stack:

| queried | answer |
| -- | -- |
| `pg_policy` — is the HEL-67 gate live? | **yes**, on both sessions' stack |
| `git show claude/muskan/work:supabase/migrations/20260825120000_…` | **fails** — the file exists only on `worktree-security-tickets` |

So one branch was **running against a policy it does not contain**. Two consequences, and the second
is worse than the first:

- **Silent revert.** A `db reset` from the branch without the file rebuilds from the migrations *that
  branch can see* and drops the other session's schema change. No conflict, no warning, no file
  collision — the detection mechanisms we have are all file-level, and nothing here is a file.
- **Silent grant.** Until that reset, the other branch's tests run against a gate its own tree cannot
  describe. A spec that *should* be blocked can pass because someone else's fix is present; a spec
  can fail for a reason its branch cannot explain, and the fix will look like a defect in its own
  code. **Tests measure a schema no tree describes, in both directions.**

This is `L-033` moved from the row level to the schema level: *a green suite is only evidence for the
database state it ran against* — where that state is now partly set by a branch you cannot see.

**⚠️ The uncomfortable part, worth keeping.** This surfaced **only because a step was skipped.** The
migration's effect was applied without stamping `schema_migrations`, so *"is it applied?"* answered
**yes** against `pg_policy` and **no** against the ledger table, and the disagreement is what prompted
the second session to look. **Had the stamp been done correctly — the right thing to do — both
sessions would have seen agreement and the hazard would have stayed fully armed and invisible.** A
detection mechanism that depends on someone forgetting a step is not one.

**What this does NOT justify:** stamping is still correct, and the fix is not to skip it. The fix is
that co-ordination between parallel sessions must include *what has been applied to the shared
database*, not only what files are locked — and that any "built and green" claim names the stack it
was measured on. Options not yet decided: a per-session database, a `supabase db diff` check at
session start, or simply declaring applied migrations the way files are declared today.

**Source:** `security_tickets` + `deal_land_t02`, 2026-08-25, found while cross-checking a
"built and green" claim. See `L-054`, `L-033`, `L-040`, `CLAUDE.md` §2b (now known insufficient).

---

## 2026-08-25 — A message type names a VOICE; RLS governs a WRITER. They are not the same axis, and our vocabulary hides it.

`chat_message.type` and `chat_message.sender` look like they encode the same fact — who produced this
line — and they do not. `sender` has three values (`person`, `system`, `sella`) and `type` has
fourteen, and the product **routinely has one identity speak in another's voice from an ordinary
browser session**: `announceDealEvent` writes four deal-lifecycle pills as `sella` with a NULL author
(`actions.ts:682` — ⚠️ **stale as of HEL-84's §12 addendum, 2026-08-27**: this call site was deleted;
the four pills now write through the `announce_deal_event` `SECURITY DEFINER` RPC instead, a
server-side writer, not an ordinary browser session — the underlying voice-vs-writer point this note
makes is unaffected, only this specific example moved), the accept rollout writes `intro` as `sella` and `connection_established` as
`system` (`rollout.ts:110,174`), and it writes a `person` message whose author is the **requester,
not the caller** (`rollout.ts:179`).

The consequence for anyone writing RLS on this table: **"only Sella writes X" is a statement about
the voice, and is never evidence about the writer.** A predicate derived from type names will either
ban writes the product depends on, or permit the ones it meant to stop. The only sound derivation is
a census of the write sites reachable as the role being narrowed.

This is why HEL-67 shipped one type rather than the list its ticket proposed, and why its
sender-forgery half is blocked until HEL-68 moves the rollout's three inserts out of the browser —
at which point `sender` finally *does* line up with the writer, and a predicate becomes possible.

The same shape has a name upstream: a comment on the read path is not a contract for the write path
(L-006). This entry is its schema-level twin — **a column that describes presentation is not a
column that describes authorship**, even when its values look like they do.

**Source:** HEL-67 build, `security_tickets` session, 2026-08-25. See `L-052`, `DECISIONS.md`
2026-08-25 ("HEL-67 ships as one type").

---

## 2026-08-25 — `supabase db reset` rotates the stack secret, and our own resets manufacture "pre-existing" e2e failures

The local Supabase stack issues a **new secret key on every `supabase db reset`**. The Playwright
fixtures resolve that key **once** (`e2e/fixtures/local-supabase.ts` — deliberately not hardcoded,
"the key rotates per stack"). So a session that resets frequently produces:

```
Error: E2E: cannot resolve the local Supabase secret key.
Error: createUser failed for <email>: {}
```

…which then cascades into `page.waitForURL` timeouts across unrelated specs, because signup and
login stop working. The result *looks* exactly like a broad regression.

**This is part of what has been recorded for months as the "pre-existing e2e auth-keys failures."**
Some of that class is genuinely pre-existing; some of it is **manufactured by the measurement
itself**. A full run taken shortly after a reset, or during a session doing repeated resets, is not
evidence about the code.

**Practical rules:**
- **SQL runners are immune** — they go through `psql` with `DB_URL` from `supabase status`, never the
  JS fixtures. A green SQL suite after a reset means what it says.
- **e2e is not.** Before reading an e2e failure as a regression, check whether the stack was reset
  under it.
- This compounds with **HEL-73** (committed specs permanently mutate the shared seed). Together they
  mean a full e2e run currently carries two independent sources of noise, and neither announces
  itself.

**Found by:** HEL-69, while A/B-ing whether a view change broke e2e — the *baseline* arm failed for
this reason, which is what exposed it. Related: **L-048**.

---

## 2026-08-25 — Single-owner delegation compounds: the second rule change is where it pays

The argument for routing a rule through one function is usually made as tidiness. The measurable
payoff showed up this week, and it is worth recording as a number rather than a principle.

**T13** pointed the `product` / `product_image` / `product_media` RLS policies at
`product_visible_to_caller()`. **HEL-69** pointed `current_pricelist_item` at
`product_price_visible_to_caller()`, which wraps it. Both consult the seller's `company` row through
a single `EXISTS`.

**Consequence:** HEL-70 (add `deactivated_at` to the visibility rule) was scoped as an **S** when
filed on 2026-08-24 — four doors, each edited separately, each a chance to diverge. By 2026-08-25 it
is **one edit** to `product_visible_to_caller()` — inherited by the product, image, media,
pricelist-item, tier, basket and price-view doors — plus the three Discover RPCs, which still carry
their own company predicates and remain the outstanding consolidation target.

**The rule.** The cost of consolidating a duplicated rule is paid once; the saving is collected on
**every subsequent change to that rule**, and it grows as more doors delegate. When judging whether
a "single owner" refactor is worth it, the question is not how much duplication it removes today but
**how often that rule changes** — a visibility rule on a marketplace changes constantly.

**Corollary (L-038 restated in the positive):** a single owner is only real if the doors actually
*call* it. `current_pricelist_item` reprinted the rule for months while three other doors delegated,
and it was the reprint that drifted — not any of the callers.

---

## 2026-08-25 — Two doors can agree on a row's existence and disagree on its *state*

**Found while building T02 / HEL-64 (slug 0023), by `plan-checker`. Not reachable in the seed,
so no test and no gate walk in that slug could ever have shown it. Offered at G4 and deliberately
left unfiled.**

The buyer's basket and the connections directory both answer *"which relationships does this viewer
have?"* — and they answer differently:

| door | predicate |
|---|---|
| `basket/supabase/reads.ts:101-104` | `deleted_at is null` |
| `messaging/supabase/connections.ts:119` | `deleted_at is null` **and** `status === 'active'` |

**The consequence, and why it is nastier than a plain divergence.** On a `suspended` or `ended`
relationship the basket still produces a non-null `relationshipId`, so the group is treated as
connected, the connect-first block does not render, and the addressee control mounts. The control
then looks its people up in the *directory*, which does not know that relationship — so the list is
empty. **Permanently, and silently.**

That empty list is **byte-identical to the legitimate case** the same ticket spent a whole
acceptance criterion proving: a connected company that genuinely has no people yet. **Two different
causes, one indistinguishable screen** — and the "correct" one was explicitly designed to look like
that ("never a dead control"). So the failure is not merely invisible; it is *camouflaged by an
intended behaviour*.

**The general shape, and it is a sharpening of [[L-038]] rather than a new rule.** L-038 says a
single owner is a claim about **agreement**, not file count. This adds: agreement has to cover the
**lifecycle**, not just the identity. Two doors that both find the same row, and both filter it the
same way *at the happy path*, can still part company on the states in between — and a state that
never occurs in the seed is a state no local evidence will ever produce.

**Practical rule.** When one module hands another an id, the receiver's *visibility* predicate is
part of the contract, not an implementation detail. Either the id-producer applies the same
predicate, or the receiver must be able to say **"I don't know that one"** distinguishably from
**"I know it and it's empty."** Here it cannot, and that is the whole defect.

---

## 2026-08-25 — A citation nobody can look up cannot go stale visibly

**Found by `builder` during T02 / HEL-64 while fixing two other stale citations. The slug had
already produced seven of them; this is the reason there were seven.**

The basket module's source comments cite decision IDs — `D-04`, `D-06`, `D-08`, `D-12`, `D-14`,
`D-15` — that **have no canonical definition anywhere in the tracked tree.** The IDs are per-phase
and collide across phases. `D-12` alone currently means four different things:

| where | what `D-12` means |
|---|---|
| `DECISIONS.md:1219` | "Inbox" is relabelled "Connection Request" |
| `cloud-migrations-pending.md:1366` | one active pending join request (partial-unique index) |
| `0021-tier-ladder/PLAN-T07.md:108` | price is seller-only |
| `basket/actions.ts` | delivery is `send_deal`'s alone |

**Why this belongs in the architecture record rather than a cleanup ticket.** A line-number citation
is *checkable*: it goes stale loudly the moment someone opens the file, which is how all seven of
that slug's stale citations were caught. An unresolvable ID is **worse precisely because it never
goes stale** — no reader can falsify it, so it quietly stops being true and keeps being copied
forward into new comments as if it carried authority. The slug's own migration header had five such
citations copied forward unverified.

**The rule this yields:** an identifier used as evidence must resolve to exactly one place. If a
scheme is scoped per-phase, the scope belongs **in the identifier** (`P17-D12`, not `D-12`), or the
scheme should not be used in source comments at all. Prefer the thing a reader can open.

**2026-08-25 addendum — the `basket/actions.ts` row above is now PARTIALLY superseded, for the
basket door specifically.** Found live during `/ship 0023`'s G5 walk: the buyer's basket picked a
recipient, birthed a private draft, then navigated into the opened deal card with a SEPARATE "Send
deal" click required — the picker's choice gave no visible confirmation it had gone anywhere.
Muskan's ruling: `createBasketDraft` now calls `sendDeal` immediately after `createDeal`, in one
action, and `BasketDrawer.tsx` no longer navigates into the deal card. **What did NOT change:**
delivery is still `send_deal`'s alone — no second delivery mechanism was added, `send_deal` still
owns the flip, the co-owner insert, and the announcement, all in one transaction. What changed is
*when* it's called for this one door: immediately after birth, not from a later, separate human
click. The seller's own-company door (`RecipientPicker`) goes through the exact same
`createBasketDraft` call and is affected identically. The OTHER creation door — "Start a deal" from
an open chat (`deal-c2c-create.spec.ts`, `deal-p2p-send.spec.ts`) — is UNCHANGED: birth and send
stay two separate steps there.

---

## 2026-08-25 — `deal_promotion` and `deal_line_item` are now SELECT-only for `authenticated`; every write is a SECURITY DEFINER RPC that re-checks membership itself (HEL-81)

**Locked by HEL-81, closing the confused-deputy gap a second review round found in its own first
draft.**

Both tables carry a single symmetric RLS policy (`card_relationship_member(deal_card_id)` — true for
BOTH sides of a relationship) that can express *membership* but not *which side* or *which
lifecycle step*. `authenticated` no longer holds INSERT/UPDATE/DELETE on either table. Every mutation
now goes through one of five SECURITY DEFINER functions:

- `offer_promotion` (seller) / `accept_promotion`, `decline_promotion` (buyer) — each re-derives the
  caller's company from the session and checks it against `card_seller_company_id`/
  `card_buyer_company_id` (new, card-level analogues of the existing `line_seller_company_id`).
- Each ALSO calls `card_relationship_member` explicitly, alongside the side check — a definer
  bypasses RLS entirely, so it re-implements membership + buyer/seller, not just buyer/seller;
  dropping the membership call would have silently narrowed the old policy's `unsent`-draft
  restriction (see [[L-057]] in `docs/agents/LEARNINGS.md`).
- `accept_promotion`/`decline_promotion` take `deal_card`/`deal_promotion` row locks (`FOR UPDATE`)
  so a concurrent double-accept resolves to "nothing pending" rather than double-applying a reward.

**A structural invariant, not a convention:** a partial unique index,
`uq_deal_promotion_one_pending ON deal_promotion (deal_card_id) WHERE state = 'pending'`, allows at
most one pending promotion per card. `offer_promotion` refuses outright (clear message) rather than
letting the constraint raise a raw violation. This exists so "the pending promotion" is never a
choice between rows — the alternative (an `ORDER BY … LIMIT 1` convention that every reader and
writer must independently agree on) is exactly what drifted apart during this same ticket's second
review round.

**Practical rule for the next promotion-adjacent change:** `deal_promotion.offered_by_company` and
`.line_deltas` are authorization-relevant input to `accept_promotion` — treat any new write path to
this table with the same suspicion as a grant, not as an ordinary data column. `line_deltas`/
`condition_deltas` are CHECK-constrained to `jsonb_typeof = 'array'`; don't re-add a client-side
`Array.isArray` fallback in a caller — that tolerance is exactly what let a non-array value ever
reach these tables in the first place.

---

## 2026-08-25 — `relationship.status` is now a real lifecycle (HEL-82); two things anyone touching relationship membership needs to know

**A relationship can be `active`, `suspended`, or `ended`** (`relationship_status`, seeded FK,
`ended` marked `is_terminal`). Three SECURITY DEFINER RPCs own every transition —
`suspend_relationship`/`reactivate_relationship` (suspended→active only, never from `ended`)/
`end_relationship` — each `is_hs_team()`-gated, each writing two `audit_log` rows (one per
`company_a_id`/`company_b_id`, as two separate single-row INSERTs — not one multi-row INSERT; the
hash-chain trigger reads the latest `sequence_number` per row and two statements make each row's
chain link unambiguous). `relationship` itself carries **no** RLS or grant change from this ticket
— `authenticated` is still `SELECT`/`REFERENCES`-only, same as before HEL-82. HS staff read via a
dedicated RPC, `list_relationships_admin()`, not via a broadened policy (see [[L-059]] in
`docs/agents/LEARNINGS.md` for why the broadened-policy version was reverted before shipping).

**"Delivering a deal" has two independent doors, and any future liveness/status/permission check on
deal delivery needs both.** `send_deal` is the obvious one. `confirm_detected_deal` (Sella's
double-accept path) is the other — it births a card straight into `negotiation` itself and, by its
own header, must NEVER call `send_deal` (the caller there is the confirmer, not the initiator;
`send_deal`'s initiator guard would reject it). HEL-74 added a relationship-liveness check to
both — `20260825180000` (`send_deal`) and `20260825190000` (`confirm_detected_deal`) — for exactly
this reason (see [[L-058]]). **Deliberately still open:** neither `create_deal_draft` (births a
PRIVATE draft — nothing has reached the counterparty yet) nor `confirm_deal_change`/`sign_deal`
(both operate on a deal that was already sent while the relationship WAS active) gained a liveness
check — whether a mid-suspension negotiation should also freeze is a product call, not decided.

**Two more doors that agree with `relationship.status` now, that didn't before:** `getMyConnections`
(`messaging/supabase/connections.ts`) already required `status = 'active'`; the basket's own
seller→relationship resolver (`basket/supabase/reads.ts`) filtered only `deleted_at is null` until
this ticket added the same `status = 'active'` check — before, once suspension became reachable, a
suspended seller's cart lines would still have resolved a `relationshipId` and let the basket try to
send through it. `RelationshipHeader.tsx` also stopped hardcoding "Connected… since" — it now
reflects the real status for both parties, not just for the HS operator.

**Still open, filed as HEL-84 (High), not closed by this ticket:** neither `msg_all` (chat message
insert) nor the pricing-request path (`discover/actions.ts`) carries a relationship-status check.
`authenticated` holds `INSERT` on both `chat_message` and `pending_inbox_item` directly, so a
suspended/ended pair can still exchange new chat messages and pricing asks — reachable the moment
suspension ships, not latent. Anyone touching either path should check HEL-84 first.

---

## 2026-08-25 — a claim that nothing executes stops being about the code

Three independent drifts surfaced in one session. They look unrelated and share one cause.

1. **Six SQL suites had no runner.** 54 suite files, 49 runners. They were written, they read as
   coverage, and they had never executed. When runners were finally written for all six, the first
   run found `announcement_projection_test.sql` asserting `sender='sella'` while
   `20260707130300_deal_event_system_voice.sql` had moved the announcement voice to `'system'` on
   2026-07-07 — **wrong for roughly seven weeks.** Two more suites carried the opposite error:
   `auth_gate` insisted in its own header that it must stay RED and passes; `rls_isolation` was
   filed as broken and passes.
2. **DEV-161 was fixed by accident and stayed open.** It reported `rls_isolation_test` failing on a
   fresh `db reset` for three named reasons. All three had been repaired incidentally by Wave 3
   (`be3abda`, `94f9b75`) — including, correctly, the assertion the ticket warned must not simply be
   loosened. Nobody knew, because the artifact that would have reported it was the suite with no
   runner.
3. **`AGENTS.md` had never been loaded.** `CLAUDE.md` said *"project-wide rules live in
   `AGENTS.md`"* as prose rather than an `@import`, and Claude Code reads `CLAUDE.md` and
   `.claude/rules/`, never `AGENTS.md`. 281 lines of project rules were inert. The tell was sitting
   in the file: its "current build state" section was last updated **2026-06-21**, two months
   earlier, because a log with no reader does not get updated.

**The shared cause.** In each case a written artifact continued to *look* authoritative while
having no execution path — no runner, no reader, no load. Review does not catch this, because
review reads the artifact and the artifact is well-formed. Only *trying to run it* catches it, and
in all three cases that is exactly what did.

**The implication for how we work.** Prefer executable verification over prose that stages a
decision. Where a rule must live in prose, give it a mechanism that fails when the prose goes
stale: suites and runners are kept **1:1 by census**, not by eye; a rule that governs Claude lives
in `.claude/rules/` where it actually loads, with `AGENTS.md` as the human long form that says on
line 3 that Claude does not read it. The same principle already had a narrower form in
`PIPELINE.md` — *"a policy stated in two places where only one of them runs is a policy you don't
actually have"* — which cost slug 0022 about thirty rulings. This is that rule generalised: **a
policy with no runner at all is not a policy either.**

**Corollary, from the same session.** The check that catches this class is usually cheap and
boring. Verifying a git worktree's commits had reached an integration branch before deleting it
took two minutes; the first time it ran it saved 1,965 lines of security work that was stranded on
a branch nobody had merged, and the second time it passed uneventfully. Value shows up in the one
run out of two where the obvious assumption is wrong.

## 2026-08-27 — A client-writable column is never the axis an authorization decision can key on

HEL-84's `msg_all` exemption let four system-authored chat-pill types (`deal_signed`,
`deal_cancelled`, `deal_change_proposed`, `deal_negotiation_requested`) bypass the new
relationship-suspension gate — keyed on `chat_message.type`, a column `authenticated` holds
unrestricted `INSERT`/`UPDATE` on. Live-proven exploitable: a thread member on a suspended
relationship set an ordinary message's `type` to one of the four exempt values and the write went
through. This is the third time this repo has hit this exact shape — HEL-67 Gap 1 (`type =
'deal_detected'` forgeable), 0024's `send_deal` refactor (a chat pill's authenticity depended on
which code path wrote it, not on anything the database could verify) — and each time the fix is
the same: stop trying to distinguish a "real" system row from a forged one by column value, and
instead move the write behind a `SECURITY DEFINER` RPC that bypasses RLS and performs its own
authorization. **If an RLS policy's `WITH CHECK` carves out an exemption keyed on any column the
writing role can set, that exemption is not a security boundary — it's decoration**, regardless of
how narrow the carve-out looks. The fix (`announce_deal_event`, `docs/muskan-build/
0026-relationship-write-gate/PLAN-HEL-84.md` §12) is the reusable shape: a definer function that
performs the authorization the RLS policy no longer needs to, once the client-facing path stops
being the place the write happens at all.

**One more turn, same session.** The definer fix itself then needed the standing rule
(`.claude/rules/supabase.md`: "a SECURITY DEFINER function must re-import every clause the RLS
policy it replaces checked") applied a second time within the same function — its first draft
re-imported the relationship-level authorization but dropped the workspace-level one
(`can_access_thread`'s `deal` arm is scoped to `deal_workspace` membership, not just relationship
membership), also live-proven exploitable before being closed. A definer function's authorization
checklist is exactly as long as the RLS predicate it replaces, not as long as the one clause the
current ticket had in mind when writing it.

