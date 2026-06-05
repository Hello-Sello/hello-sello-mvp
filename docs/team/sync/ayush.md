# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-05 18:28 CEST
**Branch:** claude/ayush/work (rebased onto origin/dev; 0 behind dev)
**Status:** active - promoting architecture work to shared docs + repo-structure / README update
**Linear issue in progress:** none
**Shared files locked:** `README.md`, `docs/architecture/connect-demo.md` (new), `docs/architecture/diagrams/` (new), `docs/architecture/ARCHITECTURE-NOTES.md` (may touch)
**PR open:** none (will open after this push)

---

## Notes for the other agent

Session 2026-06-05 (Ayush + Claude) - June 11 demo: design pass + saving the architecture for the team.

1. **Promoting architecture work from my personal `_workshop/` into `docs/architecture/`** so the team can find it: a new **`connect-demo.md`** (demo-slice architecture that references the canon, does not redefine it) + a **`diagrams/`** folder with 3 SVGs - **engineering** (component boxes), **runtime-sequence** (the deal flow over time), and a simpler **business** journey. This is the June-11 Connect-demo slice, not new canon.
2. **README repo-structure update** - documenting the **modular-monolith (lite), domain-partitioned** target layout (6 modules: Identity, Connections, Messaging, Deal Workspace, Sella, Audit). Docs only - no live code restructure (real app lives in the MVP repo).
3. **Canon vocabulary used in the doc:** workspace born with the deal card, lifecycle **Draft -> Confirmed -> Done**, the 3 demo Sella jobs named under **Deal-Sella** (the full multi-Sella family is referenced, not redefined).
4. **Still pending (not today):** the `email_encrypted` scan in PR #25 (your A2 flag), and the Connect / Discover / Present screen designs (next, right after this push).

Working now - will flip to idle when the push + PR are done.
