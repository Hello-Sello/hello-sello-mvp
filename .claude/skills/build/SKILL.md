---
name: build
description: Build one ticket end to end - plan, check, tests-first, build,
  run, review, stage G4. Runs without stopping between G3 and G4.
  Use /build <ticket>.
---

# /build — one ticket, G3 to G4, no stops

0. Open `docs/muskan-build/<slug>/STATE.md`: lane, `Locked`, `Deferred`, the
   branch, and this ticket's budgets. **A re-entry after a failed G4 is a NEW
   round:** reset `tests` and `blocking-findings` counters, `G4 rounds` +1.
   Never refuse to start because a previous round's counters are spent.

1. **Base sync — once, at the start, then frozen:**
   - `git pull --rebase` the current branch (another session may have pushed)
   - checkout the branch STATE.md names
   - `git fetch origin dev`; if behind, **rebase onto dev NOW — before any
     work.** Rebasing is safe here (nothing in flight) and dangerous later.
   - From this point the base is frozen: **no rebasing mid-build, ever.**
     Whatever lands on dev during the build is `/ship`'s final rebase's job.

2. **Plan** → `docs/muskan-build/<slug>/PLAN-<ticket>.md`: files, signatures,
   steps in runnable order. Respect `Locked`, the ADR's `Reused` fence, and
   `Deferred` (must NOT be built).

3. **Spawn `plan-checker`.** REVISE → spot-verify its findings, fold accepted
   ones into the plan. OK → continue.

4. **Spawn `test-writer`:** the ticket's EARS criteria → red tests. Test
   files only.

5. **Spawn `builder`:** implement until green. Deviations logged in its
   return, never silent.

6. **Spawn `test-runner`:** full report. Red → builder retries.
   Budget: `tests 2/2`, then STOP → write `blocked.md`, escalate.

7. **Reviewers — routed by what the diff touches, spawned in ONE message:**
   - migration · RLS · RPC · auth · server action · cross-company reads →
     `critic` + `security`
   - a new component or new pattern → `critic` + `consistency`
   - CSS / copy only → `critic` alone
   Findings: `blocking` → builder fixes (budget counts fix ROUNDS — three
   findings fixed in one pass = one attempt; `blocking-findings 2/2` then
   STOP) · `note` → REVIEW.md, never retried · builder REJECTION → REVIEW.md
   with reasoning, costs no attempt, Muskan adjudicates at G4.

8. **Everything appends to the slug's ONE `REVIEW.md`**, every finding
   attributed: `(critic, file:line)`, `(security, S3)`, `(consistency)`.

9. Diff renders anything? → **spawn `visual-verifier`** (screenshots →
   `g4/`, staging table appended to REVIEW.md).

10. **STOP at G4.** Hand Muskan ONE page: the criteria walk, the visual
    staging table, the notes, and every rejection to adjudicate. Never pass
    the gate yourself. On her pass, update STATE.md: budgets spent, `Gate
    log` += G4, stage advanced (or `→ build (next ticket)` if more remain).
