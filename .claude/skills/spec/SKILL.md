---
name: spec
description: Write the WHAT for a triaged slug - researcher sweep, interview,
  then the PRD. Does NOT stop - hands to /prototype or /design; the spec is
  approved at G3 with the ADR (PIPELINE 9a). Use /spec <slug>, or
  /spec --amend <slug> for the STANDARD lane's one-paragraph amendment.
allowed-tools: Read, Grep, Glob, Write, Edit, Task, Agent
---

# /spec — from seed to approved WHAT

0. Open `docs/muskan-build/<slug>/STATE.md` — read lane, seed; stage must be
   `triage ✅`. **`--amend` mode (STANDARD lane):** one paragraph appended to
   the existing PRD it amends, then straight to the hand-off in step 4.
   Everything below is the FULL lane.

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

4. **Show, then hand off — do NOT stop.** G1 was merged into G3 on
   2026-08-25 (PIPELINE §9a): the spec is approved together with the ADR
   that acts on it.

   Show Muskan the spec, the researcher's conflict list, and any question
   you could not close — **as a report, not a gate.** She may redirect; if
   she says nothing, continue.

   **Carry every unclosed question forward into `STATE.md`'s `For Muskan`
   section, verbatim.** They are now G3's business, and an unclosed
   question that is not carried is a question that is silently dropped.

   Update STATE.md: `stage: spec ✅ → prototype|design (next)` (prototype
   only if the lane's path includes a frontend surface), `Files so far` +=
   the PRD + RESEARCH.md paths, `Gate log` += `spec written (no gate — G1
   merged into G3, PIPELINE §9a)` with date. Then hand straight to
   `/prototype` if the lane has a frontend surface, else `/design`.
