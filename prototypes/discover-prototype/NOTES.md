# Discover prototype — decision capture

> **STATUS: PAUSED 2026-06-07.** Discover needs more thinking before a structure is
> picked. The prototype stays (don't delete) — next Discover session resumes here.
> The visibility rule is the one thing that got locked → see `DECISIONS.md`
> (2026-06-07 session 13) + `docs/product/surfaces/DISCOVER.md`.

## Question being answered

What does Discover look like, what objects does it own, and what tables does it
need — before writing any schema?

## What the prototype established

- **Discover does TWO jobs** (confirmed against Marcel's designs):
  1. **Supplier directory** — sellers grouped → their products; demand/supply toggle.
  2. **Ad / social feed** — campaign calendar + ad posts ("B2B social network").
- **Visibility rule (LOCKED):** listed = has a public shop; buyers hidden, search-only
  (Instagram model). Demonstrated: pharmacies absent from lists, found by name search.
- **3 combination variants mocked** (how the two jobs coexist):
  - **A — Tabs:** Directory tab | Feed tab.
  - **B — Feed-first + rail:** feed is the main scroll, directory in a side rail.
  - **C — Unified:** one scroll, ad posts interleaved between supplier categories.

## Still OPEN (the verdict, not yet given)

- **Page structure** — A vs B vs C (or a graft). Undecided.
- **Demand-side in MVP?** — the toggle assumes companies post what they want to buy.
- **Ad/social feed scope** — demo-scope or fast-follow (it's the heavier half)?
- `profile_claim` as a table vs just flipping `company.is_claimed` + an audit row.

## Tables the mock exercised (candidate schema, once structure is picked)

- `company` extensions: `has_public_shop` (drives listing), `source` (flowz|signup), `is_claimed`, `verification_status`, `region`
- `product` — supplier→products hierarchy; `side` (supply|demand), `category`
- `discovery_post` — the ad/social feed: `post_type`, `campaign_month`, `target_country`/`target_type`
- `profile_claim` — claim a pre-populated profile
- `connection_request` — Discover → Connect handoff (no auto-connect, DEV-63)

## Schema-draft proposal (after verdict)

_(NOT YET — propose `product` + `discovery_post` columns/FKs into SCHEMA-DRAFT.md
once the page structure + demand/feed scope are decided.)_
