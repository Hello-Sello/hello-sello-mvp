---
name: ship
description: Take a G4-approved slug live - rebase, full gate, security scan,
  PR, merge, deploy, live walk, rollup. Stops at G5 and at the prod
  data-write ask rule. Use /ship <slug>.
---

# /ship — G4 to live, then close the slug

0. `docs/muskan-build/<slug>/STATE.md`: G4 must be passed for every ticket.

1. **Final rebase onto `origin/dev`.** A conflict touching tested or
   rendered files → back to G4 (capped at 2 rounds, then escalate).

2. **Full gate on the rebased code, naming every suite explicitly:**
   `npm run test:unit` (vitest) · `npm test` (playwright e2e, fresh
   `supabase db reset` first) · SQL suites via stdin (`psql -f - < file`) ·
   `tsc` · eslint. Compare against the known baseline (15 e2e = the
   `sb_secret_` key class); anything NEW → A/B prove it pre-existing or stop.

3. **Claude Security plugin, "scan changes" mode, on the branch.** Its
   findings + the `security` agent's REVIEW.md notes → one pre-release list.
   Blocking → fix before the PR (counts as a G4 round if the fix touches
   tested or rendered files).

4. **Migrations, if the slug carries any:**
   - **Diff every `create or replace` against the LIVE body first** — the
     stale-redeclare class has bitten this repo twice.
   - **Classify the wave: additive DDL vs data-writes.** Data-writes hit
     the ask rule on `apply_migration`/`execute_sql` → STOP; Muskan grants
     the rule or runs the SQL herself. A scheduled stop, not a failure.
   - Apply in filename order · repair history stamps to the local filename
     timestamps · write the ledger entry in
     `docs/deploy/cloud-migrations-pending.md` (insurance query first,
     APPLIED entry after).
   - **Same-deploy rule:** migrations and the app code that depends on them
     reach prod back-to-back — never a broken window.

5. **PR → merge PROMPTLY** (the §9 window: what you verified is what
   merges) → confirm the Vercel deploy goes READY.

6. **G5: walk the spec's acceptance criteria on the LIVE URL as a real
   user.** Muskan's walk is the gate — stage it for her, never pass it.

7. **Close:** spawn `rollup` (slug path only, nothing else). Its verdict
   table goes into the slug's records; anything tier-changing is flagged to
   Muskan. STATE.md → SLUG COMPLETE with date. Close the Linear tickets.
   Propose — never auto-write — DECISIONS.md entries, ARCHITECTURE-NOTES
   lines, and CONTEXT.md vocabulary the slug produced.
