# Work item — `supabase db reset` produces a database the app cannot read

**Status:** seed, not yet triaged. Route through `/triage` to get a slug number.
**Found:** 2026-08-21, session `buyer_shop_view`, while re-running T04's e2e (slug 0022).
**Severity:** blocks all local e2e and all local browser work, for every developer, on the
next `db reset`. **Production is believed unaffected — verify that first, it is the whole
premise of the fix.**

## Symptom

After a clean `npx supabase db reset`:

```
GET /rest/v1/person?select=company_id&id=eq.<uid>   →  403 Forbidden
```

`getCurrentPerson()` fails → `requireVerified()` fails closed → every gated surface bounces
to `/home`. Reproduced in a scripted browser run: sign in as Bob → `/discover/<GreenLeaf>`
→ redirected to `/home`, zero product cards.

Role `authenticated` holds SELECT on **1 of 92** public tables (`current_pricelist_item`, a
view a migration grants explicitly). `anon` and `service_role` are stripped the same way.
Only `REFERENCES / TRIGGER / TRUNCATE` survive.

## Root cause — located, not guessed

`pg_default_acl` for **role `postgres`, schema `public`, object type `r`**:

```
postgres=arwdDxtm/postgres  anon=Dxtm/postgres  authenticated=Dxtm/postgres  service_role=Dxtm/postgres
```

`Dxtm` = TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. **`arwd` — INSERT, SELECT, UPDATE, DELETE —
has been stripped.** Every table in `public` is owned by `postgres` (`pg_tables.tableowner`),
so this is the rule that applies.

The `supabase_admin` row for the same schema, in the same database, still reads
`anon=arwdDxtm authenticated=arwdDxtm service_role=arwdDxtm` — the stack's own statement of
what a public-schema table is supposed to get. That contrast is the evidence.

Confirmation: `CREATE TABLE public.zz_probe(id int)` as `postgres` → `authenticated` gets **no**
SELECT. Nothing revoked an existing grant; the grants were never issued.

## Ruled out

- **Not T04, and not any repo migration.** `git diff HEAD -- supabase/migrations/` is empty.
  The only `ALTER DEFAULT PRIVILEGES` in the tree is
  `20260817120000_anon_execute_lockdown.sql:167`, which targets **FUNCTIONS**, not TABLES, and
  is correctly scoped (`authenticated` untouched).
- **Not a partial migration apply.** 147 migrations on disk, 147 in `schema_migrations`, `comm`
  empty in both directions.
- **Not `supabase/policies/`.** It holds only a tracked `.gitkeep`; the
  `WARN: no files matched pattern` line is longstanding and benign.
- **Not the app config.** `.env.local` points at `127.0.0.1:54321`; the cloud line is commented.

## Suspected trigger

The Supabase CLI is **completely unpinned** — no devDependency, no `package-lock` entry, no
`.tool-versions`, no CI pin. `npx supabase` resolves to whatever is current (**10.9.7** at time
of writing). A stack whose init no longer issues the old blanket table grants produces exactly
this state, and reproduces it on every `db reset`.

## ⚠️ The obvious workaround is UNSAFE — do not take it

Adding a repair script under `supabase/policies/*.sql` looks ideal: `config.toml`'s
`[db.seed] sql_paths` already runs that directory on every reset, and seed paths **cannot** reach
production (`db push` never executes them — confirmed by the `security` agent at T00).

**But those scripts run AFTER migrations.** A blanket
`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role` would therefore
re-grant what migrations deliberately revoked — including **DEV-88's** column-level revoke of
`UPDATE` on `person.company_id`, the privilege-escalation fix from session 77. It would unblock
the tests by reopening a security hole locally and making
`supabase/tests/anon_execute_lockdown_test.sql` and the DEV-88 guards assert against a state no
real environment has.

Same objection, harder, to "just grant `authenticated` everything to get a green run".

## Candidate fixes, in preference order

1. **Pin the CLI** to the last version whose init matches production, in `package.json`
   `devDependencies` so `npx` stops floating. Needs the working version — nothing in the repo
   records it, so find it by bisecting releases or from a machine that still works.
2. **State the defaults explicitly in a migration**, then re-apply the deliberate revokes
   *after* it in timestamp order. Removes the dependency on stack defaults permanently and
   matches session 77's direction of travel — but it is a permissions change across 92 tables
   and it ships to production, so it needs the prod-state check below first and its own review.
3. **Local-only repair script that grants and then re-revokes** — cheapest unblock, but it
   duplicates every deliberate revoke in a second place, which is the DRY violation that made
   DEV-88 hard to find in the first place. Only as a stopgap, with an expiry.

## Do this first, whichever fix is chosen

Verify production's actual grants (read-only) before changing anything:

```sql
select grantee, privilege_type, count(*)
from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
group by 1,2 order by 1,2;
```

If production also lacks `arwd`, the diagnosis above is wrong and this is far more urgent than a
local environment bug. If production has them, fix 1 or 2 restores parity and the premise holds.

## Related, found in the same pass

**The recorded e2e baseline is stale.** Project `CLAUDE.md` says 105 pass / **16** fail. It is
105 pass / **22** fail. The 9 beyond the documented `sb_secret_`/GoTrue class — `deal-c2c-create`
×1, `present-edit-model` ×3, `present-info` ×4, `public-profile` ×1 — were A/B-proven pre-existing
against the base commit (stash + reset) by `test-runner` during slug 0022 T04. Not regressions
from any recent ticket, but the stale figure masks real signal on every full run.
