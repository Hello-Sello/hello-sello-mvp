# Hello Sello

AI-native deal room for B2B. Beachhead: German medical cannabis.
AI agent **Sella** mediates deal conversations end-to-end — extracts offers,
drafts confirmations, surfaces documents, handles negotiation.

**Stage:** MVP in progress. Design layers 1-4 active.
**Lead customer:** Canadian Craft (~€150k GMV from month one).

---

## Getting started

If you're a teammate joining the project, read in this order:

1. **[AGENTS.md](AGENTS.md)** — auto-loaded by Claude Code. 30-second briefing,
   repo layout, Session Checkpoint, and team protocols. **Start here.**
2. **[docs/product/PITCH.md](docs/product/PITCH.md)** — voice, framing, positioning.
3. **[docs/decisions/DECISIONS.md](docs/decisions/DECISIONS.md)** — every locked
   design decision with reasoning.
4. **Layer docs** (in `docs/product/`):
   - [LAYER-1-USERS-AND-CORE-OBJECTS.md](docs/product/LAYER-1-USERS-AND-CORE-OBJECTS.md) — LOCKED
   - [LAYER-2-SURFACES.md](docs/product/LAYER-2-SURFACES.md) — IN PROGRESS
   - [LAYER-3-DEAL-EXECUTION.md](docs/product/LAYER-3-DEAL-EXECUTION.md) — IN PROGRESS
   - [LAYER-4-SELLA-BEHAVIOR.md](docs/product/LAYER-4-SELLA-BEHAVIOR.md) — IN PROGRESS

---

## Repo layout

| Folder | What lives here |
|--------|----------------|
| `docs/product/` | Product design - PITCH, PRD, all Layer docs |
| `docs/decisions/` | Locked decisions log |
| `docs/architecture/` | Architecture notes, domain glossary, ADRs |
| `docs/meeting-notes/` | Meeting notes |
| `docs/agents/` | Agent config (issue tracker, labels, domain) |
| `frontend/` | Frontend code |
| `backend/` | Backend code |
| `infra/` | Infrastructure, deploy, CI |
| `.claude/skills/` | Project-scoped Claude skills |

---

## How we work

- **Layer by layer.** Don't jump ahead. Layer 1 locked; Layers 2-4 in progress.
- **Doubts → `/track-doubt`.** Surfaces design questions as Linear issues + Layer doc markers.
- **Decisions → `docs/decisions/DECISIONS.md`.** One-liner + reasoning per decision.
- **Always preview before writing.** No file or Linear write without explicit confirmation.
- **Update Session Checkpoint in `AGENTS.md`** at end of every session.
- **Personal config stays local.** Each engineer has their own `CLAUDE.md` - gitignored, never committed.
- **Branches.** Commit to `claude/*` branch, open a PR. Don't push directly to main.

---

## Related repos

- [HelloSello/HelloSello_MVP](https://github.com/HelloSello/HelloSello_MVP) — MVP codebase (Next.js / pnpm / Supabase)
- [HelloSello/hellosello_lovable](https://github.com/HelloSello/hellosello_lovable) — Lovable.dev workspace
- [HelloSello/selloai-hub](https://github.com/HelloSello/selloai-hub)

---

**Private.** Contains internal product strategy, pitch content, and design decisions.
