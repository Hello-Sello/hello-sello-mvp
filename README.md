# Hello Sello

AI-native deal room for B2B. Beachhead: German medical cannabis.
AI agent **Sella** mediates deal conversations end-to-end — extracts offers,
drafts confirmations, surfaces documents, handles negotiation.

**Stage:** design DONE. Build sprint active. Demo target: **June 11** (Canadian Craft, 25 pharmacies).
**Lead customer:** Canadian Craft (~€150k GMV from month one).

---

## Getting started

If you're a teammate joining the project, read in this order:

1. **[AGENTS.md](AGENTS.md)** — auto-loaded by Claude Code. 30-second briefing,
   repo layout, Session Checkpoint, and team protocols. **Start here.**
2. **[docs/product/PITCH.md](docs/product/PITCH.md)** — voice, framing, positioning.
3. **[docs/decisions/DECISIONS.md](docs/decisions/DECISIONS.md)** — every locked
   design decision with reasoning.
4. **Layer docs** (in `docs/product/layers/`) — all LOCKED:
   - [LAYER-1-USERS-AND-CORE-OBJECTS.md](docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md)
   - [LAYER-2-SURFACES.md](docs/product/layers/LAYER-2-SURFACES.md)
   - [LAYER-3-DEAL-EXECUTION.md](docs/product/layers/LAYER-3-DEAL-EXECUTION.md)
   - [LAYER-4-SELLA-BEHAVIOR.md](docs/product/layers/LAYER-4-SELLA-BEHAVIOR.md)
   - [LAYER-5-INPUTS-AND-OUTPUTS.md](docs/product/layers/LAYER-5-INPUTS-AND-OUTPUTS.md)
5. **Per-surface deep dives** (in `docs/product/surfaces/`): CONNECT, PRESENT, BUY, SELL, DISCOVER, GROW, SELLA. Each is a vertical view of one surface. See [docs/product/README.md](docs/product/README.md) for the structure.

---

## Repo layout

| Folder | What lives here |
|--------|----------------|
| `docs/product/` | Product design - PITCH, PRD, all Layer docs |
| `docs/decisions/` | Locked decisions log |
| `docs/architecture/` | Architecture notes, domain glossary, ADRs, codebase reference (`CODEBASE.md`), demo scope (`connect-demo.md`) |
| `docs/meeting-notes/` | Meeting notes |
| `docs/agents/` | Agent config (issue tracker, labels, domain) |
| `prototypes/` | Locked screen designs — these ARE the UI spec for builders |
| `src/` | App code (modular monolith); locked structure in [`docs/architecture/CODEBASE.md`](docs/architecture/CODEBASE.md) |
| `supabase/` | DB skeleton - migrations, RLS policies, seed (reference) |
| `.claude/skills/` | Project-scoped Claude skills |

> **One repo: `hello-sello-mvp`** (github.com/HelloSello/hello-sello-mvp). Docs and code live here together - design docs in `docs/`, app code in `src/` + `supabase/`. Details below.

---

## App code structure (locked)

> **Locked 2026-06-07. Full reference: [`docs/architecture/CODEBASE.md`](docs/architecture/CODEBASE.md). Demo scope (what gets built for June 11): [`docs/architecture/connect-demo.md`](docs/architecture/connect-demo.md). The app code lives here, in this repo.**

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

- **Build from the spec.** Prototypes in `prototypes/` are the UI spec - consume them, don't redesign.
- **Doubts → `AGENTS.md` context routing table first**, then `/track-doubt` for unresolved questions.
- **Decisions → `docs/decisions/DECISIONS.md`.** One-liner + reasoning per decision.
- **Always preview before writing.** No file or Linear write without explicit confirmation.
- **Update Session Checkpoint in `AGENTS.md`** at end of every session.
- **Shared decisions → also update AGENTS.md** and write to the other agent's sync file.
- **Personal config stays local.** Each engineer has their own `CLAUDE.md` - gitignored, never committed.
- **Branches.** Commit to `claude/*` branch, open a PR to `dev`. Don't push directly to main.

---

## Related repos

- [HelloSello/hellosello_lovable](https://github.com/HelloSello/hellosello_lovable) — Lovable.dev workspace (earlier prototype)
- [HelloSello/selloai-hub](https://github.com/HelloSello/selloai-hub)

---

**Private.** Contains internal product strategy, pitch content, and design decisions.
