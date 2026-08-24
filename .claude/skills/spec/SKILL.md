---
name: spec
description: Write the WHAT for a triaged slug - researcher sweep, interview,
  then the PRD. Stops at G1. Use /spec <slug>, or /spec --amend <slug> for
  the STANDARD lane's one-paragraph amendment.
allowed-tools: Read, Grep, Glob, Write, Edit, Task, Agent
---

# /spec — from seed to approved WHAT

0. Open `docs/muskan-build/<slug>/STATE.md` — read lane, seed; stage must be
   `triage ✅`. **`--amend` mode (STANDARD lane):** one paragraph appended to
   the existing PRD it amends, then straight to the G1 stop. Everything below
   is the FULL lane.

   **Then scan `docs/agents/LEARNINGS.md` — Trigger lines only**; open an entry
   when its trigger matches what this run is about to do. The moment a checker, a
   test, or Muskan catches something you authored, write the new entry there —
   at the catch, not at wrap.

1. **Spawn `researcher`** (Agent tool) on the seed's area. Write its report
   to `docs/muskan-build/<slug>/RESEARCH.md` under `## What exists (spec)` —
   what exists, what conflicts, what already claims this area, a citation per
   claim. That file opens the interview. Never sweep inline; the sweep IS
   the agent.

2. **Interview Muskan — one question at a time, plain English.** The goal is
   the ambiguity list: what could this seed mean that she did not say?
   (replace-or-sit-beside · thresholds `>=` or `>` · who sees what ·
   all-or-only-reachable). Researcher conflicts are put to her, never
   resolved silently. She may overrule any researcher claim — record the
   overrule in the spec.

3. **Write `docs/PRD/<NNNN>-<slug>.md`** (NNNN = the slug's number).
   Preview it to Muskan before writing. Sections, in order:
   problem · **In / Out for v1** (the scope cut first) · functional
   requirements · I/O · constraints · edge cases · **acceptance criteria**.

   Rules:
   - **Capabilities and constraints, never implementations.** "Enforced
     server-side, not in the client" — yes. "Use a SECURITY DEFINER RPC" —
     no; that is the ADR's line.
   - **Every acceptance criterion must be checkable on a running page.**
     "Approval works" fails. "Seller sends → buyer sees Pending on the
     relationship page → buyer approves → seller sees Approved" passes.
     Reject and rewrite vague ones — G4 walks these lines verbatim.
   - New vocabulary → propose a CONTEXT.md line; never write it unasked.

4. **Stop at G1.** Hand Muskan: the spec, the researcher's conflict list,
   and any question you could not close. She approves, amends, or rejects.
   On approve, update STATE.md: `stage: spec ✅ → prototype|design (next)`
   (prototype only if the lane's path includes a frontend surface),
   `Files so far` += the PRD + RESEARCH.md paths, `Gate log` += G1 passed
   with date.
