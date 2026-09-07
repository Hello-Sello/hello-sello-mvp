---
paths:
  - "supabase/**"
  - "src/**/supabase/**"
  - "**/*migration*"
---

# Working on the database

Loads only when you touch `supabase/` or a module's `supabase/` layer.
Every item below is something this project got wrong once — see
`docs/agents/LEARNINGS.md` for the full entries.

## Before you replace a function

- **Diff `create or replace` against the LIVE body, not a local copy.** Basing a
  replacement on a stale file silently drops guards — that is how Discover lost
  its verified-caller gate. Base on the latest-timestamp definition and diff
  every predicate and grant.
- **A SECURITY DEFINER function must re-import every clause the RLS policy it
  replaces checked** — not just the one the current ticket cares about. A definer
  bypasses RLS entirely; it does not inherit the retired policy's predicate.

## Policies and grants

- **A policy predicate is a question about what the CALLER CAN SEE**, not about
  the database. Subqueries in `USING`/`WITH CHECK` run in the caller's RLS
  context; a fact about a row the caller cannot read must come from a definer.
- **A column-level `REVOKE` cannot subtract from a table-level grant.**
- **A `REVOKE` needs a `COMMENT ON TABLE` saying why** — otherwise the next
  person reads the missing grant as an oversight and re-grants it.
- **Census who actually writes the table as that role** before guarding it. An
  unused privilege is deleted, not guarded.

## Migrations

- **Check the timestamp against the live remote tip before assuming `db push`
  works.** A back-dated filename sorts before what is already deployed and needs
  `--include-all`. Verify against the remote, not the ledger:
  `supabase migration list --linked`, or `list_migrations` via MCP.
- **A migration's end state on replay is not its end state on push.**
- **Inserts into a seeded lookup need `on conflict do nothing`**, or `db reset`
  goes red the moment the migration replays.

## Tests

- **Every suite needs a runner, and the runner is what proves it.** A suite with
  no runner is not coverage — six of them silently rotted for weeks. Suites and
  runners must stay 1:1; check with a census, not by eye.
- **Runners pipe the file on stdin — `psql -f <path>` cannot open files under the
  sandbox** and fails with "No such file or directory" while `ls` and `cat` both
  work.
- **`ON_ERROR_STOP=1` is required.** Without it psql skips past an error to the
  final SELECT and prints a false PASS.
- **Prefer the zero-mutation fixture pattern:** build fixtures inside the same
  `BEGIN … ROLLBACK` as the assertions. No new rows, no teardown, nothing to leak,
  no pre-clean. Does **not** work for Playwright — the browser has its own
  connection.
- **Assert a delta, not a hardcoded count**, so seed changes cannot break the test.
- **Switch role explicitly** (`SET LOCAL ROLE authenticated`) so the test proves
  the security boundary rather than running around it.
