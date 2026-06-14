# Discover → Connect → Chat — the real loop (Track 1)
**Status:** 🔨 building — **slices 1–3 done** (loop is sendable end-to-end) · **Size:** L · **Owner:** Muskan

## Build log
- **Slice 1 DONE (2026-06-14)** — `list_discoverable_companies()` SECURITY DEFINER RPC applied (+ committed migration `20260614120000_list_discoverable_companies.sql`, no drift) + `idx_inbox_pair_status` index. Discover now fetches **real verified companies** server-side (safe fields only) and renders them with per-card connection state (Request to enter / Requested / Wants to connect / Connected); own company hidden; logo-or-initials tile; filters derive from the data. Files: `src/app/discover/{companies.ts (new), DiscoverDirectory.tsx, page.tsx}`; `sample-companies.ts` deleted. Smoke-tested (5 verified companies); typecheck + lint clean. **Sending the request = slice 3.**
- **Slice 2 DONE (2026-06-14)** — in-app company **profile page** at `/discover/[companyId]` (new authenticated route, keeps the app shell). `get_discoverable_company(id)` SECURITY DEFINER RPC (applied + committed `20260614130000_get_discoverable_company.sql`) returns the L0 card fields + connection state for a verified company even when not connected. Discover cards now **link to the profile**; the profile shows hero / logo / about / category · country + **Connect / Connect-with-a-note** CTAs (state-aware) + a "shop is private until you connect" note (no products = L0). Files: `src/app/discover/[companyId]/{page.tsx, ConnectActions.tsx}` (new), `companies.ts` (+`getDiscoverableCompany`), `DiscoverDirectory.tsx` (clickable cards). typecheck + lint clean. **The Connect CTAs are an optimistic stub — the real send (INSERT `pending_inbox_item`) is slice 3.**
- **Slice 4 P1–P4 DONE (2026-06-14)** — the data + read/write foundation, **applied to live + verified by impersonated SQL**. **P1** `product.profile_visible` column (default false) + partial index + tightened `product_public_select` → `profile_visible = true` (migration `20260614140000`). **P2** `get_discoverable_shop(p_company_id)` SECURITY DEFINER RPC (verified-company gate · `profile_visible` only · ordered `images` jsonb · prices via `CASE WHEN price_public` from the company's own pricelist · **no `cogs`**) + tightened `product_image_public_select` to match the dial (migration `20260614150000`). Verified live: outsider sees 0 hidden products but their own catalogue is intact; L2 shows price, L1 lists the product with null price, no cost leak. **P3** `getDiscoverableShop()` reader + `DiscoverProduct` type (`companies.ts`). **P4** `requestPricing()` action + extracted `createPairInboxItem()` helper w/ per-ask dup-guard (`actions.ts`). tsc + eslint clean. **⚠️ 2 migrations applied but not yet committed** (drift risk — commit before push). **Next: P5 prototype the L0/L1/L2 UI, then P6/P7 render + CTA.**
- **Slice 3 DONE (2026-06-14)** — wired the real send. **Prototyped the note UI first** (`prototypes/connect-note-prototype/`; chosen: unified = a little optional note box + one Connect button). `sendConnectRequest()` server action (`src/app/discover/actions.ts`) INSERTs a `pending_inbox_item` (`connect` if no note / `connect_message` if note; RLS-gated to the sender's company; dup-guarded). `ConnectActions` rebuilt to the chosen design + state-aware (connected → chat, incoming → inbox, requested → "Request sent"). Profile header restyled to match the prototype (logo peeks over the banner, name on white). **Loop closes:** the request lands in the receiver's Connect inbox → accept → C2C/P2P chat (Ayush's existing machinery). typecheck + lint clean. **Next: slice 6 — the two-account live walkthrough.**

## What this is (and is NOT)
The end-to-end loop needed to **onboard real users and start testing**: a person at Company A lands on **Discover**, finds Company B, opens B's **profile**, sends a **connect request** (optionally a note / a pricing request), B **accepts** in their Connect inbox, and a **chat opens into the company**. Two real, onboarded, verified companies.

**The back half already exists** (Ayush's modules): accept → `relationship` + C2C/P2P `chat_thread` → `/connect/chat`. This plan builds the **front door** (real Discover data + the in-app profile + the request-creating CTAs) and layers the soft profile openness on top.

**Track 1 is NOT:**
- NOT the FLOWZ shadow-profile / outbound-email growth engine (**Track 2** — deferred; outbound is legally RED, see research note).
- NOT the offer-card (`deal_card`) first-contact path (heavier; a follow-up slice).
- NOT a rebuild of the accept/chat machinery — that's built; we feed it.

## Model (what we build to)
Soft, company-curated profile. Full lock in [DECISIONS.md](../decisions/DECISIONS.md) (2026-06-14). Recap:
- Two per-product dials: `profile_visible` (**new**) × `price_public` (exists). Levels **L0→L4** emerge.
- **Audience-scoped:** products/prices to logged-in **verified members**; anon `/c/<handle>` stays bare.
- **4 CTAs = 4 existing inbox types** (`connect` / `connect_message` / `pricelist_request` / `deal_card`); a note is optional on every connect.

## Resolved decision (2026-06-14)
**Click a company on Discover → a new in-app authenticated route `/discover/[companyId]`** (keeps the app shell; verified members only — NOT the bare anon `/c/<handle>`). Company has no handle, so the route keys on `company.id`. Respects audience-scoping (products to verified-but-unconnected members) without touching the anon page's compliance line.

## Research notes (2026-06-14 — web-verified)
Design checked against official Supabase + Postgres guidance + perf benchmarks. Verdict: **`SECURITY DEFINER` function is the right tool** (beats an RLS policy / view / projection table for exposing a safe cross-tenant slice).
- **Adopted:** `search_path=''` + fully-qualified names (privilege-escalation hardening) · `REVOKE … FROM PUBLIC` then `GRANT … TO authenticated` · canonical-pair (`least/greatest`) lookup for `connected` (hits the existing unique index) · `LIMIT` + deterministic `ORDER BY` · new `idx_inbox_pair_status`.
- **Deferred (judgment call):** kept **client-side filtering** for now — small directory, snappier UX, non-personal company data. Move to **server-side filter + keyset pagination** on the same RPC when it grows (most likely with Flowz). Per-card state kept as `EXISTS` subqueries (index-backed, negligible at this scale); refactor to `LEFT JOIN LATERAL` only if the directory gets large.

## Schema (no new tables)
| Change | Detail |
|---|---|
| **New column** | `product.profile_visible boolean not null default false` — Dial A (show on public profile). `price_public` already = Dial B. |
| **RLS tweak** | Tighten the product public-read policy to gate on `profile_visible = true` (today it exposes *all* products). |
| **RPCs** | `list_discoverable_companies()` `SECURITY DEFINER` (safe fields, listed-only — mirrors `get_public_profile`); a `get_public_shop(handle)` (or extend `get_public_profile`) returning card + visible products (+ price where `price_public`). **Code, not schema.** |
| **Reused, no change** | `pending_inbox_item` (4 types), `relationship`, `chat_thread`, `company`, `pricelist_item`. |

## Slices (dependency order)
| # | Slice | New/existing | Closes loop? |
|---|---|---|---|
| 1 | ✅ **done** — `list_discoverable_companies()` RPC + Discover real data (per-card state; own company hidden) | New (data) | — |
| 2 | ✅ **done** — company **profile page** `/discover/[companyId]` at **L0** (card + Connect / Connect+note CTAs) | New | — |
| 3 | ✅ **done** — Connect → `sendConnectRequest()` action → `pending_inbox_item` | New (small write) | ✅ **loop closes** |
| 4 | `product.profile_visible` + RLS + `get_public_shop` → render products on profile (L1/L2) + **Request pricing** (`pricelist_request`) | New (data + UI) | — |
| 5 | Seller controls: `profile_visible` toggle in ShopView (price toggle already exists) | Small | — |
| 6 | **Verify** end-to-end (two verified companies) + a way to flip test companies to `verified` | Test setup | — |

**Build order to close the loop fastest:** **1 → 2 (L0) → 3 → 6 (verify the loop)**, then **4 → 5** (layer products + pricing). Offer-card (`deal_card`) path = follow-up.

---

## Slice 4 — detailed phase plan (research-grounded, 2026-06-14)
Layer the **catalogue** onto the `/discover/[companyId]` profile + add the **Request-pricing** path. Built top-down; each phase = one commit + one verify. (Research: web-verified Postgres/Supabase RPC+RLS patterns + B2B gated-catalogue UX — see Decisions.)

### Display-level model (derived, NOT a stored column)
The openness "level" falls out of the two per-product dials: `profile_visible` (**new**, Dial A) × `price_public` (exists, Dial B).

| Level | Condition (per company, derived) | Buyer sees | CTAs |
|---|---|---|---|
| **L0** | 0 products with `profile_visible = true` | Catalogue locked (count + "connect to view") | Connect (+ note) |
| **L1** | ≥1 visible product, some/all **without** `price_public` | Product cards; **"Price on request"** in the price slot | Connect + **Request pricing** |
| **L2** | visible products **with** `price_public` | Product cards **with** price | Connect (Request pricing only if some prices still hidden) |

Page logic: no visible products → L0; else render the grid (each card shows price if `price_public`, else "Price on request"); show the one shop-level **Request pricing** CTA when **any** visible product lacks a public price.

### Decisions (research-grounded)
| # | Decision | Why |
|---|---|---|
| D1 | New RPC `get_discoverable_shop(p_company_id)`, **separate** from `get_discoverable_company` | Slice-2 RPC stays untouched (lower risk); clean identity-vs-catalogue split; the 2nd read parallelizes. *Rejected the RLS-only/no-RPC path: it would leak unverified companies' visible products + break the slice 1–3 pattern.* |
| D2 | RPC = `RETURNS TABLE`, one row/product, `images jsonb` (ordered, `coalesce …'[]'`), price fields **nullable + `CASE WHEN price_public`** | Best supabase-js typing; a jsonb blob kills client types; prices are 1-to-1 so don't fan out rows |
| D3 | Gate **in the function body**: `profile_visible = true` + the verified-company gate (`deleted_at is null and verification_status='verified'`); **exclude `cogs`/`rrp_per_gram`** | SECURITY DEFINER bypasses RLS, so the WHERE is the only guard; cogs is seller-only — project safe fields only |
| D4 | Price via `left join lateral (… where pl.company_id = p.company_id order by published_at desc nulls last, created_at desc limit 1)` | Schema allows >1 pricelist/product; pick one deterministic price from the company's own list (mirrors `getMyShop` + the public pricelist policy) |
| D5 | Also **tighten `product_public_select`** → add `profile_visible = true` (keep `to anon, authenticated`) | Makes Dial A real at the DB floor — today any logged-in user can `from('product')` another company's whole catalogue. Anon-audience-scoping stays deferred (separate axis). |
| D6 | Index `product(company_id) where profile_visible` + `product_image(product_id, position)` | RLS adds the predicate to every read; the lateral sorts on position |
| D7 | **One primary shop-level "Request pricing" CTA** → one `pricelist_request`; "Price on request" in the price slot; tier chip names level + unlock; "~1 day" reassurance line | B2B buyers want a price *list* not per-SKU; long forms kill conversion; no dead-ends / broken states |

Load-bearing (D5 enforcement, the derived-level model) → propose to `DECISIONS.md` when slice 4 lands.

### Blast-radius (why D5 is safe — traced every public product reader)
`/c/<handle>` reads `company_products` as **text** (untouched) · Present `getMyShop()` reads own products via `company_id`/`product_all` (untouched) · cross-company browse doesn't exist yet · the deal-picker `getOwnCatalog` **narrows to own-company** (it assumed RLS already did this — 4.2 makes its docstring true; once slice 5 adds visible products it needs an explicit `.eq('company_id')` — flag for Ayush).

### Phases (each = commit + verify; apply+commit every `.sql` — no drift)
| # | Phase | Type | Verify |
|---|---|---|---|
| **P1** | Migration A — `profile_visible` column + partial index + tighten `product_public_select` (the dial, atomic) | migration | SQL: other tenant can't read a hidden product; own company still sees all; deal-picker returns own-only |
| **P2** | Migration B — `get_discoverable_shop` RPC (per D2–D4) + `product_image` index | migration | SQL: visible products + ordered images; prices null unless `price_public`; unverified company → 0 rows; no `cogs` |
| **P3** | `getDiscoverableShop()` reader + `DiscoverProduct` type (`companies.ts`); builds `shop-media` URLs | code | `tsc` clean |
| **P4** | `requestPricing()` action + extract shared `createPairInboxItem(type, …)` helper w/ per-type dup-guard (`actions.ts`) | code | `tsc`; `pricelist_request` inserts, RLS-gated |
| **P5** | **Prototype** the L0/L1/L2 + Request-pricing UI → `prototypes/discover-shop-prototype/` | prototype | open in browser; pick layout before React |
| **P6** | Render products section on the profile (`[companyId]/page.tsx`); `Promise.all` company+shop; tier chip; L0 count | code | live: L0/L1/L2 render; typecheck + lint |
| **P7** | Request-pricing CTA wiring (`RequestPricingActions.tsx`, sticky shop-level, state-aware) | code | live: send → `pricelist_request` in seller inbox → accept rollout |
| **P8** | Seed + end-to-end verify (L0→L1→L2 + request) + docs (build log, propose D5 to DECISIONS) | verify | full walk, checks clean |

### Tail — slices 5 & 6 (lighter, planned)
| # | Phase | Notes |
|---|---|---|
| **P9** | `setProfileVisible(productId, isVisible)` data path — mirror existing `setPriceVisible` (`catalog/manage.ts`) | small |
| **P10** | `profile_visible` toggle in `ShopView.tsx` (alongside the `price_public` one) | **shared-ish file → sync-lock if Ayush active** |
| **P11** | Verified-company test helper — flip 2 test companies to `verified` + a couple of visible products each | seed |
| **P12** | Two-account end-to-end walk (A discovers B → catalogue → Request pricing/Connect → accept → chat), both ways → mark slice 4–6 ✅ | verify |

## Files (anticipated)
- `supabase/migrations/*` — `list_discoverable_companies()`; `product.profile_visible` + RLS; `get_public_shop`. Regen `src/types/database.types.ts`.
- `src/app/discover/DiscoverDirectory.tsx` — swap `sample-companies` → RPC; per-card state; hide own company.
- `src/app/discover/page.tsx` — server-fetch the RPC.
- `src/app/<profile-route>/[handle]/page.tsx` + a `companies`/`profile` module view — the in-app authenticated profile.
- `src/modules/<discover|connect>/…` — a `sendConnectRequest()` write (INSERT `pending_inbox_item`) behind a module `index.ts`.
- `src/app/present/ShopView.tsx` — add the `profile_visible` toggle (alongside the existing `price_public` one).

## Reused (already built — we feed it, don't touch)
- `src/modules/connect/supabase/inbox.ts` → `acceptItem()` (accept).
- `src/modules/messaging/supabase/store.ts` → `acceptInbox()` (relationship + threads); `/connect/chat` `ChatView`.

## Done criteria
- Discover shows real listed companies (safe fields only — verified: anon can't read restricted columns), filterable, own company hidden, per-card request state correct.
- Clicking a company opens the in-app profile (verified members) at the company's chosen openness (L0–L4); anon `/c/<handle>` unchanged (bare).
- Connect / Connect+note / Request pricing create the right `pending_inbox_item`; it lands in B's Connect inbox; **accept opens the C2C/P2P chat** — full loop walked with two real companies.
- typecheck + lint clean. DECISIONS.md + DISCOVER.md updated (done 2026-06-14). Status → ✅.

## Deliberately deferred (NOT Track 1)
- **Offer-card (`deal_card`) first contact** — create-deal-from-Discover; heavier (needs `create_deal_draft` from a non-connected state). Follow-up slice.
- **Track 2 — FLOWZ growth engine** — shadow profiles + claim-on-signup (defensible) + outbound offer/inquiry email (**RED**, consent-gated). See [`docs/research/dev-62-dev-44-flowzz-mirror-shop.md`](../research/dev-62-dev-44-flowzz-mirror-shop.md).
- **Per-field profile publicness toggles**, hero product/pitch polish, custom per-connection pricelists.
- **Research follow-ups (non-blocking):** server-side filter + keyset pagination (at scale / with Flowz) · `LEFT JOIN LATERAL` for per-card state (at scale) · harden the shared `current_company_id()` helper to `search_path=''` · regenerate `database.types.ts` to drop the local RPC cast (also backfills the `get_public_profile` migration drift).

## References
- Locks/model: [`docs/decisions/DECISIONS.md`](../decisions/DECISIONS.md) (2026-06-14) · surfaces [`DISCOVER.md`](../product/surfaces/DISCOVER.md) · [`CONNECT.md`](../product/surfaces/CONNECT.md) · [`PRESENT.md`](../product/surfaces/PRESENT.md)
- Prior slice: [`docs/muskan-build/discover-directory.md`](discover-directory.md) (Discover UI, placeholder data)
- Board: add a Discover-loop row to [`docs/PRD/BUILD-PLAN.md`](../PRD/BUILD-PLAN.md) (**shared file → sync-lock first**)
- Track 2 legal: [`docs/research/dev-62-dev-44-flowzz-mirror-shop.md`](../research/dev-62-dev-44-flowzz-mirror-shop.md)
