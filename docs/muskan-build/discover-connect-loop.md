# Discover → Connect → Chat — the real loop (Track 1)
**Status:** 🔨 building — **slices 1–3 done** (loop is sendable end-to-end) · **Size:** L · **Owner:** Muskan

## Build log
- **Slice 1 DONE (2026-06-14)** — `list_discoverable_companies()` SECURITY DEFINER RPC applied (+ committed migration `20260614120000_list_discoverable_companies.sql`, no drift) + `idx_inbox_pair_status` index. Discover now fetches **real verified companies** server-side (safe fields only) and renders them with per-card connection state (Request to enter / Requested / Wants to connect / Connected); own company hidden; logo-or-initials tile; filters derive from the data. Files: `src/app/discover/{companies.ts (new), DiscoverDirectory.tsx, page.tsx}`; `sample-companies.ts` deleted. Smoke-tested (5 verified companies); typecheck + lint clean. **Sending the request = slice 3.**
- **Slice 2 DONE (2026-06-14)** — in-app company **profile page** at `/discover/[companyId]` (new authenticated route, keeps the app shell). `get_discoverable_company(id)` SECURITY DEFINER RPC (applied + committed `20260614130000_get_discoverable_company.sql`) returns the L0 card fields + connection state for a verified company even when not connected. Discover cards now **link to the profile**; the profile shows hero / logo / about / category · country + **Connect / Connect-with-a-note** CTAs (state-aware) + a "shop is private until you connect" note (no products = L0). Files: `src/app/discover/[companyId]/{page.tsx, ConnectActions.tsx}` (new), `companies.ts` (+`getDiscoverableCompany`), `DiscoverDirectory.tsx` (clickable cards). typecheck + lint clean. **The Connect CTAs are an optimistic stub — the real send (INSERT `pending_inbox_item`) is slice 3.**
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
