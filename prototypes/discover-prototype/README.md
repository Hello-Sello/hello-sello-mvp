# Discover — surface prototype

**Throwaway prototype.** Built to flesh out the `Discover` surface (stub → sketch)
by clicking through it, *before* proposing tables into `SCHEMA-DRAFT.md`.

Discover does **two jobs** and this prototype mocks both, three different ways:
1. **Supplier directory** — browse sellers (grouped) → their products (Marcel Screen 1).
2. **Ad / social feed** — campaign calendar + ad posts ("B2B social network", Marcel Screen 2/3).

## Three variants (switch with the bottom bar or ←/→)

Each variant is a different way to combine the directory + the feed in one surface:

| Key | Name | Combination structure |
|---|---|---|
| **A** | Tabs | "Directory" tab + "Feed" tab — clean separation |
| **B** | Feed-first + rail | ad/social feed is the main scroll; suppliers in a side rail |
| **C** | Unified feed | one directory scroll with ad posts interleaved (Instagram-style) |

Grafted from Marcel: supplier→products hierarchy, the **demand/supply toggle**, the campaign calendar.

`?variant=A|B|C` in the URL is reload-stable and shareable.

## Visibility rule (locked 2026-06-07)

**Listed-in-Discover = has a public shop.** Sellers appear in the directory; buyers
(e.g. pharmacies, no shop) are **hidden** and only surface via exact-name **search**
(the "🔎 Found by search — not listed publicly" block). Instagram model.

## What to watch — the data panel (right side)

Every action writes a row; the new row highlights yellow. This panel is the
**actual deliverable** — it shows exactly which tables Discover touches, which is
what feeds the schema proposal.

| Table | Role in Discover | New? |
|---|---|---|
| `company` | sellers (`has_public_shop`) + buyers; FLOWZ vs signup `source`; `is_claimed` | extends existing |
| `product` | the supplier→products hierarchy; `side` = supply/demand listing | **new** |
| `discovery_post` | the ad/social feed: `post_type`, `campaign_month`, `target_*` audience | **new** |
| `profile_claim` | you Claim an unclaimed FLOWZ profile | **new** |
| `connection_request` | you hit Connect (no auto-connect — lands in Connect's inbox) | new/shared |

## Flows it exercises

1. **Browse the directory** — sellers grouped, expand to products, supply/demand toggle.
2. **Visibility rule** — buyers (no shop) are hidden; **search** their name to reveal them.
3. **Follow the feed** — campaign calendar + ad posts (the "B2B social network").
4. **Claim** an unclaimed FLOWZ profile → writes `profile_claim`.
5. **Connect** → writes a pending `connection_request` (DEV-63: no auto-connect).

## How to run

```bash
cd "prototypes/discover-prototype"
python3 -m http.server 8012
# open http://localhost:8012
```

ES modules require serving over HTTP — opening `file://` won't work.

## Throwaway-grade behaviors

- "FLOWZ scrape" is faked — `SEED_COMPANIES` is the data. No real scrape (that's gated on GDPR, DEV-62).
- Claim/Connect are idempotent guards; no real auth or ownership checks.
- localStorage persists across refreshes — "Reset DB" wipes it.

## Cleanup

When Discover is designed for real, capture the verdict in `NOTES.md`, fold the
winning variant's decisions into `docs/product/surfaces/DISCOVER.md` +
`SCHEMA-DRAFT.md`, then delete this folder:

```bash
rm -rf "prototypes/discover-prototype"
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell + Tailwind CDN + data panel |
| `app.js` | State, render loop, switcher, data panel, action handlers |
| `variants.js` | The 3 variant renderers (A/B/C) |
| `db.js` | Mock DB + actions + localStorage |
| `seed.js` | FLOWZ-style seed companies, lookups, seed promotion |
| `styles.css` | Minor custom CSS beyond Tailwind |
