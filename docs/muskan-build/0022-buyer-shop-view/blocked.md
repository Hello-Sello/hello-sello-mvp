# BLOCKED — T04 (HEL-58) post-fix e2e re-verification

**Status:** T04 is BUILT, REVIEWED and its full gate was GREEN. What is blocked is the
**re-run of e2e after the reviewer fix pass**. The blocker is the local Supabase stack,
not the ticket.

## The fault

After a clean `npx supabase db reset`, role `authenticated` holds **SELECT on 1 of 92
public tables** (`current_pricelist_item` — a view granted explicitly by a migration).
`anon` and `service_role` are likewise stripped. Only `REFERENCES / TRIGGER / TRUNCATE`
remain on the rest.

Consequence: `GET /rest/v1/person?select=company_id&id=eq.<uid>` returns **403**, so
`getCurrentPerson()` fails, `requireVerified()` fails closed, and every gated surface
bounces to `/home`. The app cannot read its own database.

Reproduced deterministically in a scripted browser run:
```
after sign-in   -> /home
goto /discover/<GreenLeaf> -> /home        (redirected)
product-card count -> 0
HTTP 403 /rest/v1/person?select=company_id&id=eq.2222…
```

## Proven NOT caused by T04

- `git status supabase/migrations/` → **0 changed**; `git diff HEAD -- supabase/migrations/`
  → **0 files**. Table grants come only from migrations + stack init, so this diff cannot
  have produced it.
- All **147** migrations on disk are applied (`schema_migrations` matches the file set
  exactly; `comm` both directions is empty). Not a partial apply.
- T04's only DB-adjacent change is one additive seed product row.
- `test-runner` ran the full gate GREEN earlier the same session on a working database —
  445 unit, 37/37 SQL, 6/6 on `discover-shop.spec.ts`, 23/23 dependents, full suite
  105 pass / 22 fail (all pre-existing, 9 of them A/B-proven against the base commit).

## Suspected cause

No migration in this repo grants table DML to `anon` / `authenticated` / `service_role`;
the project has always relied on the Supabase local stack applying them at init. The CLI
is **unpinned** — no devDependency, no lockfile entry, no `.tool-versions`, no CI pin —
so `npx supabase` resolves to whatever is current (now **10.9.7**). A stack that no longer
applies those defaults would produce exactly this state, and would do so on every
developer's next `db reset`.

Worth weighing against session 77's direction of travel: that session moved the project
toward **explicit** grant management (`REVOKE … FROM PUBLIC, anon`, the `ensure_rls` event
trigger) and pushed with `db push` rather than a history repair. If production carries
grants that no migration states, local and prod have diverged and the repo is missing the
statements that make a database usable.

## Options for Muskan (a decision, not a fix I should pick)

1. **Pin the CLI** to the last version that worked and reset. Cheapest if the guess is
   right; needs the working version, which nothing in the repo records.
2. **Add an explicit grants migration.** Arguably the correct permanent fix — it removes
   the dependency on unpinned stack defaults and matches session 77's direction. But it is
   a schema-permissions change on 92 tables, which is emphatically not an S ticket's work
   and must not ride T04.
3. **Verify T04 on the pre-existing green run** and defer the environment repair to its own
   slug. Honest position: everything except the post-fix e2e re-run is verified.

## Do NOT do

Blanket-granting `authenticated` on all tables to force a green run. It would mask genuine
permission defects — including DEV-88's deliberate column-level revoke on `person.company_id`
— and produce a green e2e that proves nothing.
