# Buy

## One-sentence definition

Buyer-side experience for finding products, requesting quotes, and confirming purchases.

## Status

- Depth: stub
- Last updated: 2026-05-23
- Eventual depth: sketch

## Who uses this surface and why

(to be filled - primarily pharmacy procurement / buyer roles)

## Core objects this surface owns

(to be filled - candidates: Buyer Dashboard, Quote Request, Purchase Order draft, Buyer Basket)

## Core flows

(to be filled - step-by-step user journeys: browse → quote → confirm purchase)

## What this surface shares with others

- **Foundation** (every surface uses): User, Brand, Notifications, Auth, Permissions, Event stream
- **Cross-cutting:** Sella (Buyer-Sella - help evaluate offers, compare suppliers, draft purchase decisions - to be detailed)
- **Surface-to-surface contracts:** Reads Products from Present; creates Deals visible to Connect; reads supplier info from Discover

## Open questions

(to be filled)

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §1 (Users - buyer roles)
- `../layers/LAYER-2-SURFACES.md` §5 (Buy in Big 7)
- `../layers/LAYER-4-SELLA-BEHAVIOR.md` (Buyer-Sella variant)
