# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-07 02:30 CEST
**Branch:** claude/ayush/work
**Status:** offline (session wrapped — all 4 Connect atoms locked + LAYER pass done; PR #40 open). **Next: write the PRD** (June 11 Connect-demo MVP) → split into 2 Claude Code build tracks.
**Linear issue in progress:** none (DEV-37 multi-deal stays parked, explicitly later)
**Shared files locked:** none (canon docs + LAYER-1/LAYER-2 committed in `1c1c102` + `b825234`)
**PR open:** [#40](https://github.com/HelloSello/hello-sello-mvp/pull/40) — Connect ④ Deal Workspace + LAYER reconciliation → `dev` (mergeable: clean; 9 files). PR #39 / screen ③ already merged.

---

## Notes for the other agent

**2026-06-07 (screen ④ — the Deal Workspace) — LOCKED + recorded.** Built `prototypes/deal-workspace-prototype/` (port 8772). Closes **DEV-9**. Full narrative → that folder's `CONTEXT.md`. The four Connect atoms (① card, ② chat, ③ relationship, ④ workspace) are now all locked.
- **Layer B (invited-only) container**, spawns at deal-card birth. Reached from the Relationship deals list or a **⤢ button on the Deal Card**. Layout = tabbed left (Things/People/Documents) + the **Deal Chat as the wide hero**.
- **THINGS = the visible work primitive, grouped by domain** (finance/logistics/delivery); **stages stay non-UI** (DEV-24/34). Approval THINGS = e-sign (Draft gate). Lifecycle Draft→Confirmed→Done (Done = delivery note + invoice attached, document-driven).
- **The Deal Card is the canonical flip card** (pinned `Deal card ▸` pill in the chat). **Change history is read from the card's `deal_card_log` (card back → Logs), never echoed as chat messages.**
- **Tables I touched/propose** (yours to shape vs `SCHEMA-DRAFT`): `deal_workspace`, `member`, `thing { domain, assignee, status, type }`, `artifact` (deal-level docs), `deal_confirmation` (your Q3 table — used for the Draft per-party e-sign gate). **Deal Room is OUT of Connect ④** (Present-surface tool).

**LAYER docs pass done (the big reconciliation):** updated **LAYER-1** §3 (chat types → P2P/C2C/Deal; P↔C retired), §4.1 (Relationship → created at accept, reached from chat, refreshed contents), §4.3 (Deal Workspace → DEV-9 closed, locked ④ design), §4.4 (Deal Room → Present-surface, out of ④), §7 (old P↔C flow → superseded callout); **LAYER-2** chat-model line. **LAYER-3 left as-is** (its stages/THINGS locks are already consistent). So the long narrative docs now match the canon (DECISIONS/ARCH/CONTEXT).

---

**Earlier 2026-06-07 (screen ③ — the Relationship page) — LOCKED.** `prototypes/relationship-prototype/` (port 8771). Reached from a P2P/C2C chat (one page, two doors; **no person-level page**, answers DEV-8); **no Relationship/Deals sub-nav tabs** (Deals → future Grow/Trade). Two altitudes (relationship-level on the page; deal-level on the card/in the deal). Tables proposed for your schema: `note { relationship_id, side(supplier|buyer), scope(team|personal), author_id, body }` (per-side **team note** + per-user **personal note**, both kept), `agreed_term`, `pricelist_item { …, status(applied|proposed) }` (seller writes, sign-off gated), `artifact` (company-wide; deal docs stay on the deal), relationship-level `signal`. Reworded your flagged `ARCHITECTURE-NOTES:23` "pickup → accept". (PR #39 — now merged to `dev`.)
