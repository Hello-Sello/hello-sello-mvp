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
4. **Layer docs** (in `docs/product/layers/`):
   - [LAYER-1-USERS-AND-CORE-OBJECTS.md](docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md) — LOCKED
   - [LAYER-2-SURFACES.md](docs/product/layers/LAYER-2-SURFACES.md) — IN PROGRESS
   - [LAYER-3-DEAL-EXECUTION.md](docs/product/layers/LAYER-3-DEAL-EXECUTION.md) — IN PROGRESS
   - [LAYER-4-SELLA-BEHAVIOR.md](docs/product/layers/LAYER-4-SELLA-BEHAVIOR.md) — IN PROGRESS
   - [LAYER-5-INPUTS-AND-OUTPUTS.md](docs/product/layers/LAYER-5-INPUTS-AND-OUTPUTS.md) — drafted
5. **Per-surface deep dives** (in `docs/product/surfaces/`): CONNECT, PRESENT, BUY, SELL, DISCOVER, GROW, SELLA. Each is a vertical view of one surface. See [docs/product/README.md](docs/product/README.md) for the structure.

---

## Repo layout

| Folder | What lives here |
|--------|----------------|
| `docs/product/` | Product design - PITCH, PRD, all Layer docs |
| `docs/decisions/` | Locked decisions log |
| `docs/architecture/` | Architecture notes, domain glossary, ADRs, + the Connect-demo architecture (`connect-demo.md` + `diagrams/`) |
| `docs/meeting-notes/` | Meeting notes |
| `docs/agents/` | Agent config (issue tracker, labels, domain) |
| `prototypes/` | Throwaway click-through prototypes (e.g. phase-1 onboarding) |
| `src/` | App structure skeleton (modular monolith) - reference only; see [`src/README.md`](src/README.md) |
| `supabase/` | DB skeleton - migrations, RLS policies, seed (reference) |
| `.claude/skills/` | Project-scoped Claude skills |

> **App code is not implemented in this repo.** `src/` + `supabase/` are an empty reference skeleton showing the agreed shape; the real app is built in the [`HelloSello_MVP`](https://github.com/HelloSello/HelloSello_MVP) repo. Details below.

---

## Planned app code structure (modular monolith)

> **Target structure, agreed 2026-06-04. Now scaffolded as an empty reference skeleton in [`src/`](src/README.md) + `supabase/` so the team can see the shape - reference only, not the implementation. The real app code is built in the `HelloSello_MVP` repo following this layout. See [`docs/decisions/DECISIONS.md`](docs/decisions/DECISIONS.md), [`docs/architecture/ARCHITECTURE-NOTES.md`](docs/architecture/ARCHITECTURE-NOTES.md), and the demo slice [`docs/architecture/connect-demo.md`](docs/architecture/connect-demo.md).**

Modular monolith, partitioned **by domain** (not technical layer). One deployable: Next.js (App Router, TypeScript) on Vercel + Supabase (Postgres / Auth / Realtime / Storage), multi-tenant via RLS. Sella inference on Claude via AWS Bedrock (EU / Frankfurt).

```
src/
├── app/        # routing only (thin pages): (auth)/, connect/, inbox/, deals/[id]/, catalog/ …
├── modules/    # domain modules - the heart
│   ├── companies/  connections/  messaging/
│   └── deals/  catalog/  sella/
│       # each module: components/ · server/(actions+queries) · lib/ · types.ts · index.ts
└── shared/     # cross-cutting: auth/ · audit/ · db/ · ui/ · utils/ · types/
supabase/       # migrations, RLS policies, seed
```

**Rules:** a module talks to another only through its public `index.ts`. Surfaces (Connect / Present / Buy / Sell / Discover / Grow) are routes in `app/` that compose modules; a new surface = a new route + reuse of existing modules. Auth and audit are cross-cutting (`shared/`), not domain modules.

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
