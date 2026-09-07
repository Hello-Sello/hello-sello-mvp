# 0025 e2e-seed-isolation — work order

lane:   BUG
branch: claude/muskan/work
stage:  triage ✅ → diagnose ✅ → build ✅ → G4 auto ✅ → 🏁 SLUG COMPLETE

## Seed
Muskan, 2026-08-26. Origin: HEL-73 (Linear). Was T12 in
`docs/muskan-build/0022-buyer-shop-view/TICKETS.md`, filed 2026-08-23 at T07's G4.
**Not a vulnerability — a trust problem in the evidence every security ticket relies on.**

**The problem, in one sentence:** several committed e2e specs edit shared demo rows and
never restore them, `npm test` never resets, so a suite's result depends on what ran
before it — two agents on T07 reported opposite results for the same suite on the same
machine, both honestly, because the stack had changed underneath them.

**Proven instances (measured, not inferred, per the ticket):**
- `e2e/present-card-edit.spec.ts:244` flips `AUR-1A.price_public` permanently and poisons
  its own re-run (`:240` asserts the pre-flip state as negative space).
- `e2e/present-manage.spec.ts:78-84` soft-deletes `AUR-1A` outright.
- Two shipped SQL suites (`seed_visibility_matrix_test.sql`,
  `connection_visibility_override_test.sql`) already go green pre-e2e, red post-e2e, with
  no reset between.
- Three specs declare seed mutation in their own headers and ship no teardown.
- Consequence: "39/39 SQL runners green" is true only on a fresh reset, reported without
  that qualifier everywhere — including in security sign-offs.

**Acceptance criteria (from the ticket):**
- A spec needing a product in a particular state creates its own and removes it after,
  rather than editing a seeded row.
- A spec that must use a seeded row restores it in `afterAll`, with a comment citing why
  the row is safe to use.
- The full suite run twice with no reset in between produces the same result both times
  — this is the acceptance test.

## Triage — the YES answer
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | **YES** | a green run has never reliably meant what it claims — tests silently corrupt the fixtures later runs (and security sign-offs) depend on |
| 1 | new screen or surface? | NO | |
| 2 | migration / RLS / RPC / auth? | NO | e2e spec files only |
| 3 | concept not in CONTEXT.md? | NO | |
| 4 | changes what the product does? | NO | test infra only |
| 5 | file locked elsewhere? | NO | both sync files clean |
| 6 | more than one ticket? | NO | one theme — seed isolation across 3 named spec files |

Q0 fires first → **BUG lane**, not FULL: `/diagnose` → `/build` → `/ship`.

## Warning carried from the ticket
`AUR-1A`–`AUR-1F` are each pinned by a cell of `basket_admission_test.sql`'s matrix and
`seed_visibility_matrix_test.sql`. Any spec touching them breaks SQL suites in a
different file. **Recorded as L-033**: a seed row is not a stable fixture until you grep
what mutates it.

## Working pattern already in the repo
`e2e/discover-shop.spec.ts:586-594` and T07's own new test create a throwaway row
(`T07-E2E-WITHDRAW`) and hard-delete it in `afterAll` — mutating zero seed rows. The fix
follows this pattern, not a new one.

## Files so far
- `e2e/present-card-edit.spec.ts` — regression test added (`beforeAll` captures
  `AUR-1A.price_public`, `afterAll` asserts it's unchanged). **Currently RED**, source
  untouched. This is the ONE regression test for this diagnose pass; the other two
  proven-instance files (`present-manage.spec.ts` soft-delete, the two SQL suites) are
  the same bug class and are named below for `/build`, not separately diagnosed —
  re-diagnosing each would just re-prove the same root cause.

## Locked
(none yet)

## Deferred
(none yet)

## Attempts
- **diagnose, 2026-08-26** — reproduced on the live local stack (not inherited from the
  3-day-old ticket text), one round, converged first try. Machinery note: this repo's
  own `.claude/skills/diagnose/SKILL.md` says it "overrides the generic global one
  inside this repo," but invoking `/diagnose` loaded the global skill anyway — followed
  the project version's shorter 4-step process manually since it's what PIPELINE.md's
  BUG lane documents. Flagged, not silently worked around.

## Gate log
(none yet)

## For Muskan

### Root cause (diagnose step 3)
`present-card-edit.spec.ts`'s T05 test (`:279` as of this run) flips `AUR-1A.price_public`
from `false` to `true` through the real Save flow, as an intentional step in proving the
buyer-facing reveal appears once the seller opts pricing in. No test in the file, and no
outer harness (`npm test` never resets), restores it afterward. The file's own header
(`:15-17`) already documents "these cases MUTATE the local seed... re-run `supabase db
reset` to restore" as a known, accepted cost — but nothing downstream honors that
warning, so any suite run after this file inherits the flip.

**Reproduced fresh, on this stack, 2026-08-26 — not assumed from the ticket:**
1. Baseline: `supabase/tests/run_seed_visibility_matrix_test.sql` → `ALL SEED
   VISIBILITY MATRIX TESTS PASSED`.
2. `npx playwright test present-card-edit.spec.ts` → 12/12 passed. `AUR-1A.price_public`
   confirmed flipped `f → t` in the DB immediately after.
3. Re-ran the SAME SQL suite, no reset between → `ERROR: MATRIX: 1 of the 5 expected
   (code, visible, priced, location) triples did not match seed data`. Exactly the
   ticket's claimed failure mode, reproduced independently.
4. New regression test added (`beforeAll`/`afterAll` pair, this file) → confirmed RED
   after a fresh `db reset` + one run: `Error: AUR-1A.price_public must be restored to
   its pre-file value — Expected: false, Received: true`, at
   `present-card-edit.spec.ts:66`. 11 other tests in the file unaffected, so the new
   hooks isolate the exact defect without perturbing existing coverage.

**One extra finding beyond the ticket's named instances**: running the file TWICE with
no reset also breaks test `F-05 · a Cultivator (text spec-row) edit is batched` (`:150`)
on the second pass — `data-dirty` never flips to `"true"` because the field's dirty-check
compares against a value a LATER test in the same file (`:165`, "Save flushes...") had
already persisted on the first pass, so `.fill()` with the same literal string produces
no diff. Same root cause (no teardown), different symptom, same file. Not separately
regression-tested — the AUR-1A hook already proves the file needs restoration; this is
recorded so `/build` doesn't stop at treating T05 as the only mutator in this file.

**DB left clean.** Ran `supabase db reset` after the final RED confirmation — the next
session starts from a correct, unmutated seed, not from my reproduction's leftover state.

### Files `/build` needs to touch (per the ticket, not independently re-diagnosed here)
- `e2e/present-card-edit.spec.ts` — T05 needs its own teardown (or a private fixture)
  for `AUR-1A.price_public`; the regression hooks already added stay as the acceptance
  check. F-05's Cultivator test (above) needs the same treatment.
- `e2e/present-manage.spec.ts:78-84` — soft-deletes `AUR-1A` outright, per the ticket.
- `e2e/present-grid.spec.ts:68` — already written AROUND the damage per the ticket; worth
  confirming it can go back to something simpler once the other two files stop leaking.

### STOP — never fix (diagnose step 4)
Superseded — this ticket ran through `/build` to completion. See Gate log below.

## Gate log
- **`/build`, 2026-08-26.** Plan (`PLAN-HEL-73.md`) went through **4 `plan-checker`
  rounds** before converging — every round but the last found a genuine new bug in
  the previous round's own fix (round 2: wrong DB fields entirely; round 3: `.first()`
  silently resolves to a different product than assumed, traced through the shop's
  sort/grouping logic; round 4: a dedup that dropped a second capture's fields, and
  every capture call missing `await`). `test-writer` implemented rev 3 verbatim.
  **Verified by the orchestrator directly (L-023), not claimed:** `tsc` clean; the
  full spec pair run twice with no `db reset` between, 20/20 both times; both named
  SQL suites (`seed_visibility_matrix_test.sql`, `basket_admission_test.sql`) green
  after both runs — this is the ticket's own AC2, executed, not assumed.
  `/code-review high` and `critic` both ran clean (zero blocking) — `critic` traced
  every mutating test to its restore against the live source, not the ticket's
  description. Ten review notes total; two fixed immediately (Linear issue codes
  removed from code comments per standing rule; a `company_id` filter added for
  defense-in-depth; a self-contradicting stale comment corrected; a missing
  `PLAYWRIGHT_FORCE_ASYNC_LOADER=1` warning added to both docstrings). Remaining
  notes are latent-not-reachable-on-current-seed risks (NULL/pipe-character edge
  cases in the psql `-At` encoding) or out-of-scope follow-ups (a stale comment in
  `seed_visibility_matrix_test.sql` — `supabase/tests/**` is outside this ticket's
  fence) — recorded here, not silently dropped.
- **G4 — auto-closed**, backend/test-only diff (PIPELINE §3): no rendered surface
  touched, no outstanding builder rejection (no `builder` was even spawned —
  L-035, every file is under `e2e/**`), no blocking security finding. None of the
  three human-escalation carve-outs apply.

🏁 **SLUG COMPLETE.**
