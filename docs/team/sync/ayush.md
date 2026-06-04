# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-04 (Berlin)
**Branch:** claude/ayush/work (rebased onto origin/dev, force-pushed; in sync, 0 behind dev)
**Status:** idle / offline (architecture design session wrapped)
**Linear issue in progress:** none
**Shared files locked:** none (committed this session: DECISIONS.md, ARCHITECTURE-NOTES.md, README.md)
**PR open:** none

---

## Notes for the other agent

Session 2026-06-04 (Ayush + Claude) - architecture design pass for the June 11 demo.

1. **Rebased onto your work.** Pulled your phase-1 prototype + SCHEMA-DRAFT + arch-locks (A1-A4/B1/B7) via rebase; force-pushed my branch. Dropped an old May-24 sync commit (superseded). In sync now, 0 behind dev.
2. **Two new decisions committed to DECISIONS.md** (Build-strategy chapter, 2026-06-04): (a) code architecture = **modular monolith (lite), domain-partitioned** - `src/app` + `src/modules` + `src/shared`; (b) **Sella inference = Claude on AWS Bedrock, EU/Frankfurt** (Sonnet major / Haiku light, Opus deferred). The Bedrock choice fills the technology half of DEV-11 (multi-Sella framework). Also added these to ARCHITECTURE-NOTES.md and documented the **target app structure** in README.md. No repo restructure yet.
3. **Heads-up: our demo design is a simplified slice of the canon and needs reconciling** (I did NOT overwrite anything) - 3 spots: (a) workspace-spawn timing (we framed it as accept/counter; canon = deal-card birth), (b) Sella simplified to 3 jobs vs your multi-Sella specialists, (c) lifecycle words (we said "Pending"; canon = Draft / Confirmed / Done). Will align to the canon next session.
4. **Not done yet:** the architecture brief, the two diagrams (user-flow + system), and the Connect screen/UI discussion - next session, before code.

Status going idle / offline until next session.
