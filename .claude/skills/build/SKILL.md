---
name: build
description: Build one ticket end to end - plan, check, tests-first, build,
  run, review, stage G4. Runs without stopping between G3 and G4.
  Use /build <ticket>.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, Agent
---

# /build — one ticket, G3 to G4, no stops

0. Open `docs/muskan-build/<slug>/STATE.md`: lane, `Locked`, `Deferred`, the
   branch, and this ticket's budgets. **A re-entry after a failed G4 is a NEW
   round:** reset `tests` and `blocking-findings` counters, `G4 rounds` +1.
   Never refuse to start because a previous round's counters are spent.

   **Then scan `docs/agents/LEARNINGS.md` — Trigger lines only**; open an entry
   when its trigger matches what this run is about to do. The moment a checker, a
   test, or Muskan catches something you authored, write the new entry there —
   at the catch, not at wrap.

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

7. **Review — two always, one routed. Spawn in ONE message:**
   - **always** → **`/code-review high`** on the ticket's diff. It owns
     general correctness, reuse, simplification and efficiency — including
     the invented-lookalike class (a camelCase `packSizeGrams` beside the
     real `pack_size_grams` in `database.types.ts`).
   - **always** → **`critic`** — the three things `/code-review` has no way
     to know: the acceptance criteria, scope against them, the ADR's Reused
     fence.
   - migration · RLS · RPC · auth · server action · cross-company reads →
     **+ `security`**. Not optional and not substitutable: it runs
     `SECURITY-CHECKLIST.md` S1-S8 (grants on both client roles,
     `pg_policies`, RLS), which a general reviewer does not do.

   Findings: `blocking` → builder fixes (budget counts fix ROUNDS — three
   findings fixed in one pass = one attempt; `blocking-findings 2/2` then
   STOP) · `note` → REVIEW.md, never retried · builder REJECTION → REVIEW.md
   with reasoning, costs no attempt, Muskan adjudicates at G4.

8. **Everything appends to the slug's ONE `REVIEW.md`**, every finding
   attributed: `(code-review, file:line)`, `(critic, file:line)`,
   `(security, S3)`.

9. Diff renders anything? → **spawn `visual-verifier`** (screenshots →
   `g4/`, staging table appended to REVIEW.md).

10. **G4 is routed by the diff (PIPELINE §3) — it is NOT run on every
    ticket.** Step 9 already asks the routing question; this step obeys the
    same answer.

    - **Diff renders anything** → **STOP at G4.** Hand Muskan ONE page: the
      criteria walk, the visual staging table, the notes, and every rejection
      to adjudicate. Never pass the gate yourself.
    - **Backend only** — migration, RPC, server action, job, types → **no
      human stop.** Replay the acceptance criteria on real data, append the
      replay to REVIEW.md, and close the ticket on green tests + `/code-review` +
      `critic` + `security`.

    **Escalate a backend-only ticket to Muskan anyway when ANY of these is
    true** — these are the carve-outs, and they are not optional:
      - a builder REJECTION is outstanding (step 7 defers it to G4);
      - `security` raised a blocking finding;
      - the ticket changed behaviour its written criteria do not cover.

    On close, update STATE.md: budgets spent, `Gate log` += G4 — marked
    `G4 auto` when it closed with no human — stage advanced (or
    `→ build (next ticket)` if more remain).
