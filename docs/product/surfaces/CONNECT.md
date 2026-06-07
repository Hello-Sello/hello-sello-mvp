# Connect

## One-sentence definition

Chat, relationship pages, deals, and deal workspace - the heart of the app where buyers and sellers interact and deals are born.

## Status

- Depth: stub (awaiting Connect deep grill, resuming from Q1: connection request flow)
- Last updated: 2026-05-23
- Eventual depth: 100% (built first)

## Who uses this surface and why

(to be filled during Connect deep grill)

## Core objects this surface owns

(to be filled - candidates: Connection, Chat, Conversation, Deal Card, Deal Workspace, Relationship Page)

## Core flows

(to be filled - step-by-step user journeys: connection request, chat-to-deal, deal lifecycle, relationship page navigation)

## What this surface shares with others

- **Foundation** (every surface uses): User, Brand, Notifications, Auth, Permissions, Event stream
- **Cross-cutting:** Sella (suggest replies, extract deal signals from chat, draft confirmations - to be detailed)
- **Surface-to-surface contracts:** Connect creates Deals visible to Present (Deal Room); Connect creates Connections visible to Discover (relationship-aware suggestions)

## Open questions

- **Q1: Connection request flow** (initiation / approval / collision) - paused from prior session. Draft answer: group-based initiation per DEV-40, bilateral consent, collision = auto-merge. Not yet locked.
- C↔C general chat "responsible people" - left open per user direction (KNOWN-AMENDMENTS Amendment 3).
- Linear DEV-1, 5, 6-12 (Marcel/Muskan answers in comments) need processing into this surface.

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §3 (chat types), §4 (Deal Card / Deal Workspace), §5.2 (deal birth paths), §11 (16-Connection Matrix)
- `../layers/LAYER-2-SURFACES.md` (Big 7 framework, Connect's place in it)
- `../layers/LAYER-3-DEAL-EXECUTION.md` (deal lifecycle stages)
- `../layers/LAYER-4-SELLA-BEHAVIOR.md` §5 (surface→Sella routing for Connect)
