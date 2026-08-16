# DISC-1 — LinkedIn Discover prototype

**Question:** what should the open, LinkedIn-style Discover look like, and in what **section order**?

**Open in a browser:** `prototypes/discover-linkedin-prototype/index.html` — flip variants with the bottom bar or `←` `→` (or `?variant=A|B|C`).

## Variants (differ in arrangement, not colour)
| Key | Name | Order |
|---|---|---|
| A | Networking-first | Ads → Requests → My Network → New People → Companies |
| B | Directory-first | Ads → Requests → **Companies** → My Network → New People |
| C | Two-column | Left rail: Requests + My Network · Main: Ads → Companies → New People |

## Rules baked in (locked 2026-07-22, confirmed by Muskan)
- Open directory: every **selling-side** tag visible; **pharmacy = hidden-but-searchable** (shown dimmed in the mock to demonstrate).
- **Uniform gate**: the pharmacy rule applies to **People too** (a pharmacy-only person is hidden-but-searchable).
- Ads banner: in (empty placeholder slots).
- People + My Network: in (LinkedIn-style).

## Sub-decisions to resolve WHILE reviewing (feed the verdict)
- [x] **Winning section order** → **Variant D** (Ads → [Requests | My Network] → New People → Companies).
- [x] **Company-type filter** → a **multi-select DROPDOWN** (not pills), beside a Country dropdown; scales to ANY platform tag (each cert its own option, no grouping); selections → removable chips + Clear all; live-filters.
- [x] **Requests + My Network boxes** → **defined height (312px, equal)**; My Network → people expansion **scrolls inside** the box, keeping the side-by-side aligned.
- [x] **New People card** — cover strip · 72px circle avatar · name/title/company · mutual · outlined Connect · hover dismiss ✕.
- [x] **My Network row** — logo · name · city · contacts · open deals · expandable people.
- [ ] **Ads banner** — now a **full-width leaderboard banner** (per Muskan's SAN RAF / FLOWZ example), rotating creatives with dots. OK for v0? (Real v0 likely ships one empty placeholder banner until an ad exists.)

## Deferred to build (not a prototype-visual question)
- **Person-connect "+" mechanism** (DISC-10) — person-level vs company-level connect; research-gated against the data model before building.

## Verdict
> **Layout = Variant D — "Networking · split top"** (chosen 2026-07-23, Muskan).
> Order: Ads (full-width leaderboard) → **[ Connection Requests | My Network ] side by side** → New People → Companies.
> Next: rebuild the prototype as a polished, Variant-D-only page — informed by design research on
> professional B2B directory/networking pages, and mirroring the real reusable components
> (`DiscoverDirectory` rows + 4-state Connect button + type-pill/country facet bar + multi-tint `Logo`,
> `InboxRow` w/ assignee chip, `Avatar`, `VerifiedBadge`, `BackButton`). Then fold into `src/app/discover`.

## Reusable components to mirror (fidelity, and reuse at build time)
| Element | Real source |
|---|---|
| Company logo tile (multi-tint + verified tick) | `DiscoverDirectory.tsx` `Logo` + `VerifiedBadge` (tick) |
| Connect CTA (4 states: none/requested/incoming/connected) | `DiscoverDirectory.tsx` `ConnectButton` |
| Facet bar (type pills + counts + country dropdown + active chips) | `DiscoverDirectory.tsx` filter band |
| Company row (glass grid, hover) | `DiscoverDirectory.tsx` row |
| Request/ticket row (avatar · company · time · type badge · preview · **assignee chip**) | `connect/components/InboxRow.tsx` |
| Person avatar (circle, `ring-brand/60`) | `shared/ui/Avatar.tsx` |
| Back control | `shared/ui/BackButton.tsx` |
