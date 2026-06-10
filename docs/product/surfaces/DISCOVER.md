# Discover

## One-sentence definition

A **closed, tagged company directory** (NON-marketplace): find a company by category/country, see its brand line, and **request to enter** — the shop stays hidden until they let you in.

## Status

- Depth: UI built (placeholder data) — closed tagged directory, search-first lobby
- Last updated: 2026-06-11
- Eventual depth: built (pending data RPC + gate wiring)

## Model — closed + tagged (locked 2026-06-11, session 20)

**NON-marketplace.** Per Marcel (2026-06-10): "closed to not see shit, but a line with the company logo and a request to enter." Full reasoning in [DECISIONS.md](../../decisions/DECISIONS.md) → "Discover: closed + tagged directory".

- **Closed by default.** No open catalog, no prices, no feed. You never see a company's products until you **"Request to enter"** and are accepted.
- **Tagged line.** Each company = **logo · name · category · country**, filterable by all three. Enough to *find* who to request; not enough to *browse* a shop.
- **Layout = search-first lobby** (centred search + category pills + single-column list). Built UI-only first (placeholder data, stubbed button); real listing RPC + the gate are the next slices. Build plan: [`docs/build/discover-directory.md`](../../build/discover-directory.md).
- **"Request to enter" wiring OPEN** — unlock-shop (Discover owns the grant) vs a Connect request (one door). Leaning Connect; deferred until Connect's accept flow lands.
- **Ad / social feed = CUT** (contradicts a closed non-marketplace).

## Visibility model (locked 2026-06-07)

> **Updated 2026-06-11 — browse-depth changed (see *Model — closed + tagged* above).** *Who is listed* (below) is unchanged, but a listed company's shop is **no longer browsable on sight** — it's gated behind "Request to enter." The asymmetric *listing* rule survives; the open *catalog* does not.

**Asymmetric, Instagram-style.** Discover lists the *selling* side by default and keeps the *buying* side private-but-findable.

- **Listed by default = a company with a public shop.** If you present products/pricing publicly, you appear in the Discover directory (~~browsable~~ **gated**, grouped/filtered by category/country).
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

Resolved 2026-06-11 (session 20): the closed + tagged model + search-first layout above. Remaining open items:

- ~~**Page structure undecided.**~~ **DECIDED — search-first lobby** (single closed directory). The old "two jobs / tabs vs feed vs scroll" question is moot: the **ad/social feed is CUT** and demand-side is dropped from v0.
- ~~**Is demand-side in MVP?**~~ **No** — v0 is a directory of companies (supply-side listing key), not a buy-request board.
- ~~**Is the ad/social feed demo-scope or a fast-follow?**~~ **CUT** — contradicts a closed non-marketplace.
- **"Request to enter" wiring** — unlock-shop vs Connect request; deferred until Connect's accept flow lands (see Model above).
- FLOWZ scrape gated on GDPR check (DEV-62) — affects `company.source` + consent posture.
- Linear DEV-63 — UX for "no auto-connect, smart suggestions on signup".

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §13 (FLOWZ-style pre-populated companies)
- `../layers/LAYER-2-SURFACES.md` §5 (Discover in Big 7)
- `../layers/LAYER-5-INPUTS-AND-OUTPUTS.md` (FLOWZ scrape = MVP contingent on GDPR; no auto-connect on signup)
