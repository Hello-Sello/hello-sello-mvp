---
name: design
description: Turn an approved spec into an ADR + checked tickets. Runs the
  adr-checker loop under its locked budget, sorts invariants, writes tickets
  to Linear. Stops at G3. Use /design <slug>.
allowed-tools: Read, Grep, Glob, Write, Edit, Task, Agent, mcp__claude_ai_Linear__save_issue
---

# /design — from approved WHAT to checked HOW

0. `docs/muskan-build/<slug>/STATE.md`: stage must be `spec ✅` (and
   `prototype ✅` if the lane included one). Read the PRD in full.

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
   - **Budget: 2 rounds. Stop at the first round with zero NEW blocking
     findings** — never wait for zero findings total. More rounds are
     Muskan's explicit call, not the default.
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

6. **Stop at G3.** Hand Muskan: the plain-English opening, the checker's
   verdict on top of the ADR, every sign-off that needs her explicitly, and
   the ticket list. On approve, update STATE.md: `stage: design ✅ → build
   (next)`, `Locked` filled from the ADR, `Deferred` from the spec's Out
   list, `Files so far`, `Gate log` += G3 with date.
