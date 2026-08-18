---
name: triage
description: Route a work seed into its lane and open the slug's STATE.md.
  Use for any new work item - "triage this", a Marcel ask, a bug report.
  No gate - it routes.
---

# /triage — route the seed, open the work order

1. **Capture the seed verbatim** — quoted, with who said it. It goes into
   STATE.md unedited.

2. **Answer the six questions from PIPELINE.md §2, in order, each with one
   line of evidence:**

   | # | Question | YES → |
   |---|---|---|
   | 0 | Broken that used to work, or never worked as specified? | **BUG** |
   | 1 | A screen/section/surface that does not exist yet? | FULL |
   | 2 | Touches a migration, RLS, an RPC, or auth? | FULL |
   | 3 | A concept not in `docs/architecture/CONTEXT.md`? — grep it, don't guess | FULL |
   | 4 | Changes what the product *does* — a rule, a condition, who sees what? | STANDARD |
   | 5 | Touches a file locked in another session's sync file? | STANDARD + sync ritual |
   | 6 | More than one ticket of work? | STANDARD |

   Any YES pushes the lane up. All NO → TRIVIAL.
   **When unsure between two lanes, take the higher one** — the lane-vs-diff
   hook catches under-triage; over-triage only costs minutes.
   Diff size is not the ruler: a one-line visibility change can be FULL.

3. **Slug** = next NNNN number in `docs/muskan-build/` + a short kebab name.

4. **Preview the STATE.md to Muskan before writing it** (her standing rule).
   Then write `docs/muskan-build/<slug>/STATE.md` from the §6 template:
   `lane` · `stage: triage ✅ → <next> (next)` · `branch` · `seed` · empty
   `Files so far` / `Locked` / `Deferred` / `Attempts` / `Gate log` /
   `For Muskan` sections.

5. **New vocabulary in the seed** → propose a CONTEXT.md line; never write it
   unasked.

6. **Announce:** the lane, the YES answers that put it there, and the exact
   next command to type (per the §2 lane table).
