---
name: design
description: Turn a written spec into an ADR + checked tickets. Runs the
  adr-checker loop under its locked budget, sorts invariants, writes tickets
  to Linear. Stops at G3, which now approves the SPEC and the ADR together
  (G1 merged in, PIPELINE 9a). Use /design <slug>.
allowed-tools: Read, Grep, Glob, Write, Edit, Task, Agent, mcp__claude_ai_Linear__save_issue
---

# /design — from written WHAT to checked HOW

**G3 is now the first gate for a non-frontend slug.** G1 was merged into it on
2026-08-25 (PIPELINE §9a), so this gate approves the **spec and the ADR
together** — the WHAT is still open here, not settled upstream. Before step 1,
read `STATE.md`'s `For Muskan` section: `/spec` carries its unclosed questions
there, and they are yours to close at step 6.

0. `docs/muskan-build/<slug>/STATE.md`: stage must be `spec ✅` (and
   `prototype ✅` if the lane included one). Read the PRD in full.

   **Then scan `docs/agents/LEARNINGS.md` — Trigger lines only**; open an entry
   when its trigger matches what this run is about to do. The moment a checker, a
   test, or Muskan catches something you authored, write the new entry there —
   at the catch, not at wrap.

1. **Spawn `researcher`** on APPROACHES (not prior art this time): how is
   this normally done, what does each option cost later. Append its report
   to `docs/muskan-build/<slug>/RESEARCH.md` under `## Approaches (design)`.

2. **Draft `docs/architecture/adr/NNNN-<slug>.md`** — NNNN = the next free
   number in `adr/` (the ADR corpus has its OWN sequence, independent of the
   slug's number: tier-ladder is slug 0021 but ADR 0004):
   - **Opens in plain English, before any technical body:** what each option
     means for the product · what it costs later (how hard to undo in six
     months) · what breaks if we picked wrong · how the industry normally
     does it and why · one recommendation with a one-sentence reason.
     If Muskan cannot tell from that section why the winner won, the ADR is
     not finished — and that is this skill's failure, not hers.
   - **Reused** — already built, we feed it, don't touch. This is builder's
     fence and consistency's checklist.
   - **Blast-radius** — every caller, every cross-surface dependency, every
     RPC and base table this work did not write.
   - **Invariants, each sorted as it is written:** a machine can check it →
     a lint rule or a test, it leaves the document · only judgment can check
     it → ADR prose + critic's brief. The skill cannot finish with an
     unsorted invariant.

3. **The checker loop — locked rules, no discretion:**
   - Each round = ONE fresh `adr-checker` spawn via the Agent tool. Never
     review inline — inline review does not count as a round. Its input is
     the ADR + the spec + `ADR-INDEX.md`, NEVER prior rounds' findings.
   - **Budget: 2 rounds. Stop at the first round that raises no NEW finding
     on severity ladder rungs 1-3** (leak · silent failure · won't run —
     the ladder is in PIPELINE §10 and in the checker's own prompt). Rungs
     4-5 (behavioural edge, contract/wording) are notes: they go to
     REVIEW.md and to the gate, and they **do not hold the loop open**.
     Never wait for zero findings total.
     **Do not treat the old rule as this one.** It said *"zero NEW blocking
     findings"*; that state never once occurred in the dry-run or in 8+
     tickets (blockers ran 5·8·4·6·6·8·4), so the cap blew every time and
     escalated by default. Find-rate is flat; severity is what decays.
     More rounds are Muskan's explicit call, not the default.
   - Fold-ins carry a **simplification bias**: prefer removing a mechanism
     over adding one. A fix that adds a mechanism gets flagged to Muskan
     before it goes in.
   - Checker findings are **claims to spot-verify** against the repo before
     folding in — checkers err.

4. **Tickets.** Break the work down with declared `depends on:` lines. Every
   ticket passes the Ready checkpoint:
   - **INVEST** — fails any letter → reshape it
   - **Sized S / M / XS** — bigger than M → split. No exceptions
   - **EARS criteria** — "When <trigger>, the system shall <response>"
   Parallel tickets must touch different files. Write
   `docs/muskan-build/<slug>/TICKETS.md`, then create the issues in Linear.

5. **Last step, not optional:** the ADR's one-line entry in
   `docs/architecture/adr/ADR-INDEX.md` — decision in one line + areas it
   touches. An ADR not in the index does not exist.

6. **Stop at G3 — the merged gate.** Hand Muskan ONE page, in this order:

   1. **The spec, in plain English, and what it commits to** — the acceptance
      criteria as a list. This half used to be G1. Say plainly: *"reject here
      and we lose the ADR too"*, so the raised cost of a late no is visible
      at the moment she rules.
   2. Any question `/spec` carried into `For Muskan`, unclosed.
   3. The ADR's plain-English opening + the checker's verdict.
   4. Every sign-off that needs her explicitly, and the ticket list.

   On approve, update STATE.md: `stage: design ✅ → build (next)`, `Locked`
   filled from the ADR, `Deferred` from the spec's Out list, `Files so far`,
   `Gate log` += `G3 (spec + ADR, merged gate)` with date.
