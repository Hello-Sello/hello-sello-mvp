# Discover — Directory (v0, closed + tagged) · search-first lobby
**Status:** 🧪 UI built (placeholder data) · **Size:** M · **Owner:** Muskan

## Scope lock (2026-06-10): **UI only**
Build just the page UI. No RPC, no real data, no gate wiring — placeholder
`sample-companies` + stubbed "Request to enter". The data RPC and the accept
flow are the *next* slices, not this one.
**Built:** `src/app/discover/{page,DiscoverDirectory,sample-companies}.tsx|ts`;
prototype `_prototype/` deleted. typecheck + lint clean, verified in preview.

## Goal
Replace the `/discover` placeholder with the real **closed, tagged company directory** —
a **NON-marketplace**. You search/filter the directory, see each company as a brand line
(logo · name · category · country), and **"Request to enter"**. A company's shop stays
**hidden** until they let you in. No open catalog, no prices, no feed.

## Research notes (sources: Marcel directive 2026-06-10 · DISCOVER.md · this session's prototype)
- **Marcel's directive (2026-06-10):** "Discover closed to not see shit, but a line with the
  company logo and a request to enter… It needs to be a **NON-Marketplace**." → drove every call below.
- **Model decisions (this session, chat):**
  1. **Closed, not browsable** — you do *not* see products/prices up front. *(Choice B.)*
  2. **Tagged line** — each company shows logo + name + **category + country**, and is
     **filterable** by those. Enough to *find* who to request; not enough to *browse* a catalog.
     *(Choice "Tagged" — "Bare" = undiscoverable, "Teaser" = drifts back to marketplace.)*
  3. **Layout = search-first lobby** (prototype Variant C): centred search + category pills +
     single-column result list. Sells "ask to come in", not "scroll a feed".
- **⚠️ Supersedes the locked DISCOVER.md visibility entry (2026-06-07).** That entry said a public
  shop is **"browsable, grouped by category/country."** We keep *who is listed* (the "has a public
  shop" key) but **change browse-depth: the shop is now gated behind request-to-enter.** → must be
  written back to [DISCOVER.md](../product/surfaces/DISCOVER.md) when this scope locks.
- **Prototype lives at** `src/app/discover/_prototype/` (variants A/B/C + switcher, stub data,
  stub button). C won; A/B get deleted on fold-in.

## Scope — in / out
**In (v0 — a real READ slice + a stub gate):**
- Fold Variant C into the real `/discover` page; delete `_prototype/` (A, B, switcher).
- **Real listing data** — only *listable* companies (the "has a public shop" key), safe fields only.
- Filters: name search + category + country (client-side over the listed set is fine for v0).
- "Request to enter" button — **stub** (local "Requested" state, no write). Wiring waits for Connect.

**Out (deferred — additive, off this slice):**
- **The gate itself** (access grant / shop unlock) and its enforcement — lands with the wiring decision.
- **Ad / social feed** — *cut* under "NON-marketplace" (was the heavy half in DISCOVER.md open Qs).
- **Demand-side posting** (companies posting what they want to *buy*).
- **FLOWZ pre-populated companies** — GDPR-gated (DEV-62); affects `company.source` + consent.

## Open question — carried, does NOT block this slice
**What does "Request to enter" *do* when accepted?** (decides the handoff, not the page)
- **A — Unlock shop:** Discover owns a shop-access grant, separate from connections. Ships standalone.
- **C — = a Connect request:** entering *is* connecting; gate state lives in Connect (Ayush). One door.
- **Lean:** **C** (cleanest NON-marketplace story, reuses Connect plumbing) — but it couples Discover
  to Connect. **Resolve when Connect's request/accept flow is ready.** The button stays stubbed till then.

## Schema notes (no new tables in this slice)
- **Listing key = "has a public shop"** (per the surviving half of the 2026-06-07 model) — *not* a
  buy/sell role. Tags come from existing `company_type` (+ assignment); country from `company.country`;
  logo from the `shop-media` bucket (`logo_path`).
- **Privacy pattern (reuse):** list via a **`list_discoverable_companies()` SECURITY DEFINER RPC**
  returning only safe fields (id, name, logo_path, category, country, public handle) for *listed* companies
  only — mirrors `get_public_profile` so anon/non-members never touch restricted `company`/`person` columns.
- **Gate schema is deferred** — when the wiring decision lands as **C**, reuse Connect's request object
  (`pending_inbox_item` / connection); as **A**, a small `shop_access_request` table. No schema now.

## Task checklist (build — after scope-lock)
- [ ] **RPC** `list_discoverable_companies()` — `SECURITY DEFINER`, safe fields, listed-only. Apply to remote · regen `database.types.ts`.
- [ ] **Page** — fold Variant C into `src/app/discover/page.tsx`; server-fetch the RPC; map rows → the list.
- [ ] **Filters** — category + country + name search over the fetched set (client).
- [ ] **Request button** — keep stubbed (local "Requested"); leave a `// TODO: wire to Connect (A vs C)` seam.
- [ ] **Delete** `src/app/discover/_prototype/` (A, B, switcher, sample data).
- [ ] **Empty/edge** — "no companies match" + a "no listed companies yet" state.

## Done criteria
- `/discover` renders the real closed directory: listed companies as logo · name · category · country,
  filterable, shop hidden, request button stubbed. RPC returns only safe fields (verified: anon cannot
  read restricted columns). typecheck + lint clean. `_prototype/` gone. DISCOVER.md updated to the gated
  model + DECISIONS.md entry. Status → ✅.

## Follow-ups (after v0)
- Resolve the **A-vs-C wiring** → build the real gate + accept flow.
- Per-field publicness already a Profile follow-up; same toggle likely governs what a *listed* line shows.
- Board: add a Discover row/number to [BUILD-PLAN.md](../PRD/BUILD-PLAN.md) (shared file → sync-lock first).
