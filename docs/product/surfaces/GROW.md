# Grow

## One-sentence definition

Analytics + business control + viewing all deals over time + future geographic ops - how the C-suite grows the business. (Renamed from "Trade" on 2026-05-23, DEV-21.)

## Status

- Depth: stub
- Last updated: 2026-05-23
- Eventual depth: sketch

## Who uses this surface and why

(to be filled - primarily C-suite / business leadership / ops roles)

## Core objects this surface owns

(to be filled - candidates: Dashboard, Analytics Report, Deal Pipeline view, Geographic Map / Heat layer, Business Control settings)

## Core flows

(to be filled - step-by-step user journeys: view monthly deal volume, drill into regional performance, set business-level policies)

## What this surface shares with others

- **Foundation** (every surface uses): User, Brand, Notifications, Auth, Permissions, Event stream
- **Cross-cutting:** Sella (analytics-aware summarization, anomaly detection, growth recommendations - to be detailed)
- **Surface-to-surface contracts:** Reads aggregate data from Connect (deals), Buy/Sell (transactions), Discover (network growth); writes business-level policies that constrain all surfaces

## Open questions

- Linear "Trade" project label still bears the old name - to be renamed manually after team alignment.

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` (C-suite roles)
- `../layers/LAYER-2-SURFACES.md` §5 (Grow in Big 7, with Trade→Grow rename note)
- `../layers/LAYER-4-SELLA-BEHAVIOR.md` §5 (Grow→Sella routing)
