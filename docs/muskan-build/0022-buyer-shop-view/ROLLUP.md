# ROLLUP — slug 0022 buyer-shop-view

**Run 2026-08-24 at `/ship` step 7, read-only over `REVIEW.md` (1336 ln), `STATE.md` (1223 ln),
`TICKETS.md` (781 ln).**

⚠️ **This slug sealed NO predictions of its own**, so each agent is scored against its charter class
rather than against a sealed prediction. **That substitution is itself a finding** — the dry-run
method depends on predictions being sealed before the run.

---

## A · Per-stage verdict

| Stage | Agent | Predicted catch? | Decisive? |
|---|---|---|---|
| triage | `issue-triage` | **Partly** — lane right, premise wrong | **Yes** |
| spec G1 | `researcher` | Yes | Yes |
| design G3 | `researcher` (2nd) | **No — overruled twice** | — |
| design G3 | `adr-checker` | **Unscoreable — zero attribution** | Yes, but unattributed |
| prototype G2 | human gate | Yes | Yes |
| build · plan | `plan-checker` | **Yes, repeatedly — but the agent never ran** | Yes |
| build · tests | `test-writer` | **Yes — and exceeded it** | Yes |
| build · code | `builder` | Yes | Yes |
| build · run | `test-runner` | Yes | Yes |
| build · review | `critic` | Yes | Yes |
| build · review | `consistency` | Yes in kind, note-severity only | No blocking; one decisive affirmative |
| build · review | `security` | **Yes — outright, the slug's headline** | **Yes, four separate times** |
| verify G4 | `visual-verifier` | Partly — the thing to match was deleted | Yes |
| ship G5 | — | — | **Not run — owed** |

**Notes carried on the sharpest verdicts:**

- **`issue-triage`** routed FULL correctly but on a false premise: *"this slug is frontend-heavy with
  no expected migration."* It shipped **six**. Decisive anyway — its UNCERTAIN→YES on *"is a basket
  write gated on product visibility?"* is the origin of T07/AC 10, the rule four security rounds
  later hardened.
- **`plan-checker` is not a registered agent.** It errors `Agent type 'plan-checker' not found` and
  was worked around by running its ruleset verbatim in `general-purpose` — surfaced every time,
  never silently swapped (L-001 honoured). Ten tickets of Tier-1-grade catches, **zero registered
  runs**.
- **`test-writer` refused wrong instructions three times**, each time correctly — e.g. *"Complying
  would have produced a test that passes against a broken build."* Against it: a T06 unit file died
  on a `vi.mock` hoist with **0 tests executed** — *"a test that does not RUN is not a RED test."*
- **`security` is the only agent whose findings changed what shipped.** T09 exists because of it;
  the 2026-08-23 push halted because of it; the 2026-08-24 push carried a fix that exists only
  because round 4 ran.

---

## B · What got NO workout — "no evidence either way" is the result

| Path | Reading |
|---|---|
| **`builder`'s right to reject a blocking finding** | Zero rejections in ten tickets + four ship rounds. **Now zero across two slugs.** Do not let a second silent slug read as validation |
| **`blocking-findings` budget 2/2 → STOP** | Never fired (max reached: 1/2). Unproven |
| **`tests` budget 2/2 → STOP** | Never fired — tests-first held on every ticket. Unproven |
| **The plan-check budget's STOP** | **It DID blow — 8 tickets at 2/2 — and the prescribed stop was NOT taken.** Resolved by proceeding with `critic` + `security` as carriers, with **no per-ticket Muskan ruling recorded**. `/build` step 2 says *"revise once, then STOP"* |
| **`adr-checker` attribution** | 32 blocking G3 findings with **no agent name on them** |
| **Linear** | T09–T17: *"owed (MCP auth blocked)"* ×9 — nine tickets never entered the tracker |
| **T00's owed G4 walk** | No record it was ever walked; T06 closed the leak in code instead |
| **Browser check 3 / rejected-company resubmit** | Zero e2e cover, zero manual cover, one known bad path (error fires **after** licence uploads commit, so a retry re-uploads every file) |
| **T04 criterion A7** | *"Not reachable in the seed"* — static markup unit-covered, state never walked |
| **Pixel rendering of banner/logo** | URL construction verified; **image bytes never loaded by any shot** |

---

## C · Tier-changing verdicts — FOR MUSKAN'S RULING

1. **`plan-checker` — Tier 1 is not earnable from this slug as written.** PIPELINE.md:884 justifies
   Tier 1 on *"REVISE on all three plans it ran on."* On slug 0022 it ran on **none**. Either the
   tier attaches to **the ruleset** (say so in §13 — that is what has two slugs of evidence), or
   `plan-checker` has zero registered runs across both slugs and its tier is inherited from work a
   `general-purpose` agent did. **Also: fix the registration.**
2. **`consistency` — DO NOT downgrade, but record the shape.** Three deployments, **zero blocking**.
   Its Tier 1 evidence is still a single finding from slug 0021. It stays Tier 1 because
   REVIEW.md:493 (*"the lookalike was retired, not kept alongside"*) is the proof of the slug's
   headline G2 lock and no other agent produced it — but its catch rate here is **note-only**.
3. **`security` — Tier 1 reconfirmed at the top of the table.**
4. **`adr-checker` — no tier movement defensible from this slug** (nothing attributable). Its
   promotion still rests entirely on slug 0021.
5. **`researcher` — "Tier 1, humbled" reconfirmed** on independent evidence.
6. **`visual-verifier` — Tier 1 strengthened.**

---

## D · Internal contradictions in STATE.md's own gate log — 11 found

These are the record contradicting itself. Worth a cleanup pass; several would mislead a future
reader who stops at the first one.

1. **T08 is ruled both PASSED and unstaged** — gate log says *"G4 · T08 · PASSED"*; the Attempts
   table two sections above still says *"0 / 2 — not yet run"*, G4 rounds *"0 — not yet staged."*
2. **T07 is ruled both PASSED and PART-RULED** — gate log says *"all 8 items ruled"*; the stage
   banner at the top of the same file still says *"3 of 8 ruled… 4 still owed."*
3. **G4·T00** claims *"no blocking findings from `critic` or `security`"*; REVIEW.md carries a
   section headed *"Blocking — for the slug, not for T00."* Ticket-scoped true, slug-scoped false,
   stated unqualified.
4. **T06's Attempts row carries "—"** for tests, blocking-findings and G4 rounds — but T06 was
   BLOCKED at G4 on **3** `security` blocking findings.
5. **The "8th consecutive ticket" streak is asserted, not derived** — T03 converged in 1 round, and
   T00 ended on 2 blocking at rev 3 yet is excluded from the count.
6. **SQL suite counts contradict within one file** — *"all 35 suites"* / *"37/37"*, while
   STATE.md:898 corrects: *"'38/38 SQL suites' was not a real number… 41 suite files, 36 runners…
   FIVE suites have no runner and never execute. Never say 'all'."*
7. **"39/39 runners green" is reported without its qualifier** — T12 records it is true *only on a
   fresh reset*, and names two shipped suites already failing post-e2e, one of them T06's own.
8. **G1 says "No researcher claim overruled"; G3 says "Two researcher claims were overruled."** Same
   slug, same agent. A reader stopping at G1 carries the wrong one.
9. **G4·T02's deviations table omits** that `critic`'s 2 blocking findings were fixed **by the
   orchestrator**, not `builder` — `/build` step 4 routes them to `builder`. Declared at T03 and
   T05; at T02 it exists only in a table column.
10. **147 vs 149 commits** — both stated for the same `main`↔`dev` gap, ten lines apart. *(Both are
    right at different moments: 147 at PR #163's open, 149 including the two merge commits. The
    record should say which.)*
11. **T06's heading still says "all seven sites"** while its own inline block says *"CORRECTED at
    /build T06: the tightening is on SITE 1 ONLY"* and its criterion 6 says *"exactly three
    objects."* The heading was never fixed.

---

## E · The catch against this session's own work

`rollup` caught **G5-WALK.md putting AC 9 on the live walk sheet as a tick-or-fail row.** AC 9 was
split to its own slug at G3 and sits under *Deferred — must NOT be built*. The sheet would have
failed the slug on a criterion it deliberately does not own.

**The reasoning error:** PRD §8 was copied verbatim as "the acceptance criteria" without reconciling
it against the deferral list. **The spec's §8 and the slug's actual scope are not the same list** —
§8 minus what G3 split out is. Fixed 2026-08-24; the row is struck through with the reason inline so
the next reader does not re-add it.
