# Security checklist — input for the pipeline builder

**Who this is for:** the agent building the pipeline described in [`PIPELINE.md`](./PIPELINE.md).
This file tells you what the security checks must *contain*. Turn it into the security
reviewer's rules and into the `/ship` pre-flight. Do not paraphrase the checks — they are
written as they are because each one is the residue of a real live incident.

**Where they run:** the DB-touching checks belong at **G3 (design lock)** as review questions and
again in **`/ship`** as executable pre-flight, because both incidents below were *grant* bugs that
no amount of reading the function body would have caught.

**The evidence rule that governs all of them:** never record a check as passed because the code
looks right. Every item below is phrased as something you *run* and read the output of. A security
claim without a command and its output is not a finding, it is a guess.

**The research rule that governs all remedies:** a finding is not done when you can name it. Before
proposing a fix, search the current published guidance for that class and quote it. Say what best
practice is, then say what it costs us here. A remedy chosen for being low-risk, without the correct
one stated beside it, is a recommendation Muskan cannot weigh.

**Then read the second source, which outranks the first: this repo's own decisions.** Search the ADRs,
`ARCHITECTURE-NOTES.md` and the defining migration's header for the thing you are about to change.
A documented local exception that still holds beats generic vendor guidance — and "still holds" is a
catalog query, not a reading of the ADR. Published advice assumes a default codebase; ours is not one.

> Recorded 2026-08-24 ([HEL-69](https://linear.app/hellosello/issue/HEL-69)), where BOTH halves of
> this rule failed in one evening, in both directions.
>
> First: the remedy was proposed as a narrow predicate fix, with the `security_invoker = true` flip
> framed as an optional riskier extra — chosen from private risk reasoning, no research. Muskan had
> to ask what industry practice was to get the researched answer. **That is the failure the first
> paragraph exists to stop.**
>
> Then the researched answer was itself wrong here. `ADR-0004 §4` had **pre-declared** the trade-off:
> `current_pricelist_item` is owner-rights on purpose, the ERROR-level `security_definer_view` advisor
> entry is knowingly accepted, and flipping `security_invoker` on zeroes out every buyer read — the
> view joins `pricelist`, which carries one owner-only policy. Verified by catalog query, not by
> trusting the ADR text. Shipping the "best practice" fix would have taken the buyer price surface
> dark. **That is the failure the second paragraph exists to stop.**
>
> The real fix turned out to be smaller than either proposal: delete the hand-written predicate and
> call `product_price_visible_to_caller()`, which already owned the rule. Prefer removing a mechanism
> to adding one — the correct remedy is often the one that deletes code, and neither the private
> reasoning nor the generic guidance found it.

---

## Why this exists — two incidents, one week apart

**2026-08-16.** Five RPCs shipped with `REVOKE ALL ... FROM public` + `GRANT EXECUTE TO authenticated`.
That looks locked. It is not: on Supabase `anon` holds its own grant, and revoking PUBLIC never
touches it. All five were callable unauthenticated. Nothing leaked, purely because every body
happened to gate on `auth.uid()`.

**2026-08-17.** The follow-up audit of the other 60 functions found the anon exposure was the
*smaller* problem. `seed_company_superadmin` — `SECURITY DEFINER`, no caller check — had been granted
to `authenticated`. Any ordinary team member could call it and hand themselves `team.manage` +
`company.edit_profile` in one call. **The audit was aimed at `anon`; the real hole was one role over.**

Both were invisible in the function bodies and in code review. Both were found by querying the
catalog. That is the whole argument for making these mechanical.

---

## The checks

### S1 — Both grant paths, for every function
`anon` reaches a function through **two independent grants**: its own, and PUBLIC (Postgres grants
`EXECUTE TO PUBLIC` on every function at creation — a leading `=X/` in `proacl`). Revoking either
alone leaves the other. Proven: after revoking only `anon`, a fresh reset still had **39**
anon-executable functions.

- Required form on every new RPC: `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;`
- Check: `has_function_privilege('anon', p.oid, 'EXECUTE')` — it accounts for both paths, so it is
  the only assertion worth writing.

### S2 — Ask the `authenticated` question too, not just `anon`
For every `SECURITY DEFINER` function, answer both:
1. Should `anon` be able to call this? (almost always no)
2. **Should every logged-in user be able to call this?** (not automatic — internal helpers, workers,
   and anything invoked only by another `SECURITY DEFINER` function must be revoked from
   `authenticated` as well, since the inner call runs as the owner and does not need the grant)

Flag any function that writes privileged rows and does not read `auth.uid()` anywhere. That single
catalog query is what surfaced both `seed_company_superadmin` and `sella_detect_worker`.

### S3 — Deny-by-default needs an event trigger, not `ALTER DEFAULT PRIVILEGES`
`ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` **does not work** — Postgres
merges its built-in PUBLIC grant on top of any `pg_default_acl` entry. Verified: the same statement
against `authenticated` *did* propagate, so the stored default is honoured and PUBLIC specifically is
not removable. Supabase's own docs recommend the statement that doesn't work; Postgres BUG #8685
(2013) and supabase/supabase#43884 are the trail.

Enforcement therefore lives in the `revoke_anon_execute_on_new_function` event trigger
(`20260817120000` §4). **The check is that the trigger is firing, not that it exists** — assert by
creating a throwaway function and reading its privileges.

### S4 — Check policy dependencies BEFORE revoking anything
RLS policy expressions are evaluated with the privileges of the **calling** role. Revoking a helper
function that a policy calls breaks the policy for that role. Before any revoke, scan `pg_policies`
for policies granted to the affected role and check whether they call the function. Skipping this is
how a "safe" grants-only migration takes down reads.

### S5 — Diff `CREATE OR REPLACE` against the LIVE body
Already a standing rule from the lost `is_caller_verified()` gate. Restated here because it is the
same failure family: re-declaring from a stale copy silently drops guards. Base on the live
`pg_get_functiondef()`, diff predicate by predicate, grants included.

### S6 — Schema drift is a security check, not housekeeping
`rls_auto_enable` + its `ensure_rls` event trigger lived on production and in **no migration** for
months, so a fresh `db reset` produced a different database than prod. The failure mode is silent:
a new table whose migration forgets `enable row level security` is open locally (rows visible, tests
pass) and deny-all on prod (zero rows, no error).

- Run `supabase db diff --linked` as `/ship` pre-flight; drift must be a diff, never a surprise.
- Never type SQL into the Supabase dashboard. Migrations in version control are the only source of truth.
- Assert the RLS trigger fires by creating a throwaway table and reading `relrowsecurity`.

### S7 — Security tests must be proven RED-first
A guard that passes because it is asserting nothing looks identical to a codebase with nothing to
find. For each security test, remove the protection, watch the test fail with a message that names
the offender, then restore. Record both outcomes. Both guards shipped on 2026-08-17 were proven this
way; so was the escalation probe.

### S8 — Read the linter, it is free
Supabase's database linter caught the original class (`0028_anon_security_definer_function_executable`).
Pull `get_advisors(type: security)` in `/ship` and diff the finding count against the previous run.
A rising count is a regression; a count of zero unexplained findings is the pass condition.

---

## What "done" looks like for the reviewer

For a change that adds or modifies any `SECURITY DEFINER` function or any grant:

- [ ] S1 — `has_function_privilege('anon', ...)` is false for every new/changed function (or the
      exception is named in the allowlist with a stated reason)
- [ ] S2 — the `authenticated` question answered explicitly per function, not by default
- [ ] S3 — auto-revoke trigger proven firing
- [ ] S4 — `pg_policies` scanned for callers before any revoke
- [ ] S5 — every `CREATE OR REPLACE` diffed against the live body
- [ ] S6 — `supabase db diff --linked` clean, or the drift captured in a migration
- [ ] S7 — each new guard proven RED-first, with the failure message quoted
- [ ] S8 — advisor finding count recorded before and after

Existing guards to run rather than re-invent: `supabase/tests/anon_execute_lockdown_test.sql`,
`supabase/tests/ensure_rls_trigger_test.sql`, `supabase/tests/person_company_lockdown_test.sql`,
`supabase/tests/cross_tenant_lockdown_test.sql`.

**Full reasoning and evidence:** `docs/architecture/ARCHITECTURE-NOTES.md`, entries dated 2026-08-16
and 2026-08-17.
