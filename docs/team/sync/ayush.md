# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-07 00:54 CEST
**Branch:** claude/ayush/work
**Status:** working (session active - screen ③ locked + recorded; docs released)
**Linear issue in progress:** none (DEV-37 multi-deal stays parked, explicitly later)
**Shared files locked:** none (DECISIONS / ARCHITECTURE-NOTES / CONTEXT edits committed in `a42e93a`)
**PR open:** none new (Connect ② chat is now in `dev`); I'll PR after screen ④ or on request

---

## Notes for the other agent

**2026-06-07 (screen ③ — the Relationship page) — LOCKED.** Built `prototypes/relationship-prototype/` (port 8771), on the decided Connect shell. Rebased onto `origin/dev` (your session-4/6 work — inbox lock, schema review, UUID v4, Q2) before touching shared docs. Full narrative → `prototypes/relationship-prototype/CONTEXT.md`.

**What's locked (relevant to your `relationship` + schema work):**
- **Nav:** the Relationship page is reached **from a P2P or C2C chat** — one page, two doors. **No person-level relationship page** (this answers DEV-8's never-closed sub-question = there is none). **No `Relationship`/`Deals` sub-nav tabs** — *supersedes the 2026-06-06 "drop Companies, add Relationship" line in DECISIONS.md:518*; Deals move to a future Grow/Trade surface.
- **Content / two-altitudes:** relationship-level lives on the page (header · Sella insight · analytics · log · notes · terms · pricelist · artifacts); deal-level stays on the deal card / in the deal. Layout = tabbed.
- **Tables I'm proposing for the page** (yours to reshape against `SCHEMA-DRAFT`): `note { relationship_id, side(supplier|buyer), scope(team|personal), author_id, body }` — **per-side team note + per-user personal note are two different things, both kept**; `agreed_term { relationship_id, key, value }` (both sides read); `pricelist_item { relationship_id, product, price, status(applied|proposed) }` (seller writes, Proposed→sign-off→Applied per DEV-41); `artifact { relationship_id, name, owner }` — **company-wide docs only; deal docs stay on the deal**; relationship-level `signal` (live-computed, cheap MVP — reuses your signal-type-keyed shape).
- **Per-viewer projection:** the page renders by side — per-side team notes hide across the boundary, PRIVATE deals hide from the other side, only the seller edits the pricelist.

**Answering your flag (`ARCHITECTURE-NOTES.md:23` "at pickup / connect"):** agreed — the trigger is **accept**, not pickup (pickup is ownership-only now). I'm rewording it to "at accept" while I edit ARCHITECTURE-NOTES this pass.

Decisions → `DECISIONS.md` (`## 2026-06-07`); data model → `ARCHITECTURE-NOTES.md`; terms → `CONTEXT.md`.
