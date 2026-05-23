# Discover

## One-sentence definition

Find new suppliers globally, browse pre-populated companies (FLOWZ-style), and surface brand promotion to verified audiences.

## Status

- Depth: stub
- Last updated: 2026-05-23
- Eventual depth: sketch

## Who uses this surface and why

(to be filled - both buyers seeking new suppliers, and sellers/brands seeking new connections)

## Core objects this surface owns

(to be filled - candidates: Discovery Feed, Company Profile (pre-populated and claimed), Brand Promotion / Ad, Search/Filter state)

## Core flows

(to be filled - step-by-step user journeys: browse suppliers, claim a pre-populated profile, advertise to verified audience)

## What this surface shares with others

- **Foundation** (every surface uses): User, Brand, Notifications, Auth, Permissions, Event stream
- **Cross-cutting:** Sella (relevance ranking, surface "X companies already have you in their records" smart suggestions on signup - to be detailed)
- **Surface-to-surface contracts:** Reads Brand/Product data from Sell/Present; initiates Connections that flow into Connect; cold-start data source for new signups

## Open questions

- FLOWZ scrape gated on GDPR check (DEV-62)
- Linear DEV-63 - UX details for "no auto-connect, smart suggestions on signup"

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §12 (FLOWZ-style pre-populated companies)
- `../layers/LAYER-2-SURFACES.md` §5 (Discover in Big 7)
- `../layers/LAYER-5-INPUTS-AND-OUTPUTS.md` (FLOWZ scrape = MVP contingent on GDPR; no auto-connect on signup)
