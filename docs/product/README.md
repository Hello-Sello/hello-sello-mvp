# docs/product/

Product design lives in two complementary subfolders.

## Two views of the product

### `layers/` - 5 horizontal layers

Cross-cutting design that applies across the whole product:

- `LAYER-1-USERS-AND-CORE-OBJECTS.md` - users + core objects (LOCKED)
- `LAYER-2-SURFACES.md` - product surfaces overview (IN PROGRESS)
- `LAYER-3-DEAL-EXECUTION.md` - deal execution (IN PROGRESS)
- `LAYER-4-SELLA-BEHAVIOR.md` - Sella behavior (IN PROGRESS)
- `LAYER-5-INPUTS-AND-OUTPUTS.md` - inputs and outputs (drafted)

### `surfaces/` - 7 vertical per-surface deep-dives

One file per surface, each describing that surface's specific design:

- `CONNECT.md` - chat, relationships, deals, deal workspace (heart of the app, built first, eventual 100% depth)
- `PRESENT.md` - the shop / Deal Room (eventual sketch depth)
- `BUY.md` - buyer-side experience (eventual sketch depth)
- `SELL.md` - seller-side experience (eventual sketch depth)
- `DISCOVER.md` - pre-populated companies, supplier discovery, brand promotion (eventual sketch depth)
- `GROW.md` - analytics + business control + deals over time + future geo ops (renamed from "Trade" on 2026-05-23, DEV-21) (eventual sketch depth)
- `SELLA.md` - the cross-cutting AI agent (overview + per-surface touchpoints map; full behavior in `layers/LAYER-4-SELLA-BEHAVIOR.md`)

## Why split into layers vs surfaces?

- **Layers** describe concepts and behaviors that cut ACROSS surfaces (e.g., a User exists in Connect AND Present AND Buy; deal execution flows through Connect AND Sella).
- **Surfaces** describe one feature area at FULL depth (e.g., everything specific to Connect lives in `surfaces/CONNECT.md`, not scattered across layer files).

Both views are needed. The split keeps them from getting mixed up.

The reasoning behind the build strategy (foundation broad / surfaces vertical / Sella cross-cutting) lives in `../decisions/DECISIONS.md` → "Build strategy" chapter.

## Per-surface file template

All surface files (except `SELLA.md`, which is cross-cutting) follow this structure, in this order:

1. Title heading: `# [Surface Name]`
2. `## One-sentence definition`
3. `## Status` section with: Depth (stub / sketch / 100%), Last updated (YYYY-MM-DD), Eventual depth
4. `## Who uses this surface and why`
5. `## Core objects this surface owns` (things created here, not borrowed from another surface)
6. `## Core flows` (step-by-step user journeys)
7. `## What this surface shares with others`:
   - Foundation: User, Brand, Notifications, Auth, Permissions
   - Cross-cutting: Sella's role here
   - Surface-to-surface contracts
8. `## Open questions` (linked to Linear if tracked)
9. `## References to LAYER docs` (which sections of LAYER 1-5 this surface depends on)

`SELLA.md` uses a slightly different template since she's cross-cutting (no "core objects she owns" in the surface sense; instead a per-surface touchpoints table).

## Top-level files in this folder

- `PITCH.md` - investor + customer pitch
- `KNOWN-AMENDMENTS.md` - running corrections list
- `README.md` - this file
