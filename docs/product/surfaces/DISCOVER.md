# Discover

## One-sentence definition

Find new suppliers globally, browse pre-populated companies (FLOWZ-style), and surface brand promotion to verified audiences.

## Status

- Depth: stub
- Last updated: 2026-06-07
- Eventual depth: sketch

## Visibility model (locked 2026-06-07)

**Asymmetric, Instagram-style.** Discover lists the *selling* side by default and keeps the *buying* side private-but-findable.

- **Listed by default = a company with a public shop.** If you present products/pricing publicly, you appear in the Discover directory (browsable, grouped by category/country).
- **Everyone else = exact-search only.** A company without a public shop (e.g. a pharmacy acting purely as a buyer) is **not** shown in any list. It's only reachable if you know its name and search for it — and only if it's on the platform.
- **Why:** sellers want to be found; buyers don't want to be cold-listed. Mirrors Marcel's note "list suppliers by category… no pharmacies shown first."
- **Note:** "buyer" / "seller" is *not* a company flag (buy/sell is per-deal). The listing key is **"has a public shop"**, not a role.

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

Explored 2026-06-07 via `prototypes/discover-prototype/` (mock DB, 3 combination variants). Visibility rule locked (above); these stayed open — Discover paused here:

- **Page structure undecided.** Discover does two jobs — a **supplier directory** (sellers→products, demand/supply toggle) and an **ad/social feed** (campaign calendar + posts). How they coexist is open: prototype mocks (A) tabs, (B) feed-first + rail, (C) unified scroll. No structure picked.
- **Is demand-side in MVP?** The directory's "demand" toggle assumes companies can post what they *want to buy*. Confirm that's MVP, not just supply.
- **Is the ad/social feed demo-scope or a fast-follow?** It's the heavier half (post templates, post types, calendar).
- FLOWZ scrape gated on GDPR check (DEV-62) — affects `company.source` + consent posture.
- Linear DEV-63 — UX for "no auto-connect, smart suggestions on signup".

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §13 (FLOWZ-style pre-populated companies)
- `../layers/LAYER-2-SURFACES.md` §5 (Discover in Big 7)
- `../layers/LAYER-5-INPUTS-AND-OUTPUTS.md` (FLOWZ scrape = MVP contingent on GDPR; no auto-connect on signup)
