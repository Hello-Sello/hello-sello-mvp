# August MVP — scope lock

**Target:** 31 Aug 2026 · **Owner:** Muskan (Ayush weekends only)
**Marcel's ask:** log in → connect to Canadian Craft → order with volume price brackets
**Locked:** 2026-08-10, from Marcel's message + scoping session

---

## Already built — not on this list for a reason

Verified in code, not from notes:

- Login / onboarding / verification
- Discover → find Canadian Craft → connect (`sendConnectRequest` → Connect inbox → `relationship`)
- Company profile page renders their catalogue, tier-gated (`/discover/[companyId]`)
- Chat (c2c + p2p) with realtime
- Deal card + full negotiation loop (create, edit, propose change, decline, sign)
- Basket module (built, but only mounted on `/present`, `/buy`, landing)

The gap between "connect" and "put in orders" is **one wire** — item 2 below.

---

## Build order

1. **Push pending migrations to production** (13 Discover + Phase 7 + Allocate)
   Nothing has been live since 22 Jul. Riskiest item, least predictable — goes first
   so everything else gets tested against the real thing. 4 touch Ayush's tables.

2. **Wire the basket onto the connected-company catalogue page**
   The buyer can see Canadian Craft's products but can't add them. The basket module
   is fully built — it just isn't mounted on `/discover/[companyId]`. This is the one
   genuinely missing link in Marcel's loop.

3. **`pricelist_tier` table**
   Today's schema holds exactly ONE bracket (`pricelist_item.bundle_threshold_grams` +
   `bundle_price_per_gram`). A ladder needs somewhere to put rows 2, 3, 4. ~15 lines of SQL.

4. **Tier editor in the product card edit section** (seller)
   "+ Add tier" repeatable rows: `min grams → price per gram`. Copy the existing
   editable-lot-row pattern already in `ProductCard.tsx` (~line 878).

5. **Tier dropdown on the product card** (buyer)
   Base price + "See all prices" reveal — Marcel's screenshot, standard B2B
   quantity-break pattern. Per-product only.

6. **Basket resolves quantity → correct tier price**
   Pure function, easily tested. The only real logic in the pricing feature.

7. **Deal card renders the resolved price** (DEV-156)
   Was Ayush's lane; now ours. Smallest of the four pricing pieces.

8. **End-to-end UAT as a real pharmacy, on production**
   Sign up → connect → browse → add to basket → send → Marcel receives and signs.

---

## Blocks launch — not our build

- **Supabase custom domain** (Marcel) — without it Google shows an "app not verified"
  warning at login and real pharmacies will bounce. Infra, needs paid Supabase.
- **Marcel uploads the real Canadian Craft catalogue** — he does this himself via the
  Present page or CSV import. Not a dependency for our build; only for launch.

---

## Deferred to September — say this to Marcel explicitly

- **Per-customer pricelists** (Phase 15) — different prices per pharmacy + approval flow.
  Different feature from volume brackets. This is the one most likely to be confused
  with what he asked for.
- **Cross-product bundles** — his screenshot showed "1000g + 500g OG Kush together."
  Design-first, much harder.
- **Threshold nudge** — "add 20g more and pay €7/g." The dropdown already carries the
  information before the buyer commits, so v1 is safe without it.
- **Person-to-person deals** — deals require a company `relationship`; Discover's
  person↔person graph deliberately doesn't create one. Out of scope for pharmacies.

---

## Timeline

| Window | What |
|---|---|
| **11–17 Aug** | Item 1 — production push |
| **18–24 Aug** | Items 2–7 — the basket wire + the tier ladder |
| **25–31 Aug** | Item 8 — UAT, fixes, Marcel loads catalogue, soft launch |

Build is ~8–12 agent-hours. The calendar is set by decisions, UAT, and the deploy —
not by build time. Muskan gives 2–3 h/day, which is the right shape for that.

---

## Open

- **Two tiers or a ladder?** Marcel's example had three rungs (`>2000g → €2.99`,
  `>3000g → €2.50`); his message implies more. Building the ladder either way —
  two-tier is a ladder with one rung.
- **Compliance** — real pharmacies ordering cannabis. Worth asking Marcel what the
  position is before launch, not after.
