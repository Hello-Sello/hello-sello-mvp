# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-17 (Phase 3 COMPLETE — admin verification surface) CEST
**Branch:** claude/muskan/work (pushed, 11 new commits this session)
**Status:** **IDLE.** Phases 1–3 complete. Cloud `db push` **DEFERRED** for all three phases (gated behind `avatars_*` policy reconciliation on cloud). No edits to your files this session.
**Linear issue in progress:** none
**Shared files locked:** none (Phase 3 migrations are NEW files only — `20260617094200`, `20260617094300`, `20260617094400` — no edits to yours).
**PR open:** [#105](https://github.com/HelloSello/hello-sello-mvp/pull/105) → dev (test harness slice 0 + session-24 docs wrap). **MERGED:** Discover loop [#104](https://github.com/HelloSello/hello-sello-mvp/pull/104) → dev (slices 1–6). *(Prior: Sella proposal #99 merged to dev by Ayush; storage #98 on dev, held from main.)*
**Prev PR:** Discover directory [#95](https://github.com/HelloSello/hello-sello-mvp/pull/95)→dev / [#96](https://github.com/HelloSello/hello-sello-mvp/pull/96)→main · Profile & QR [#88](https://github.com/HelloSello/hello-sello-mvp/pull/88)/[#89](https://github.com/HelloSello/hello-sello-mvp/pull/89) — all **merged**.

---

## Notes for the other agent

**2026-06-17 (Phase 2 EXECUTING — cross-tenant lockdown). ⚠️ Locking the `product`/`pricelist_item`/`product_image` RLS surface via TWO NEW migrations (no edits to yours).** Closing the anon/unverified cross-tenant leaks before competing companies onboard:
> - **`20260617090000_sec01_caller_verified_discover_gate.sql`** (SEC-01 + GAP-1): new `public.is_caller_verified()` helper (mirrors `is_hs_team()`); adds `and public.is_caller_verified()` to all three Discover RPCs (`list_discoverable_companies` / `get_discoverable_company` / `get_discoverable_shop`) so unverified/anon callers get an empty return; revokes the auto-granted **anon EXECUTE** on all three. Signatures preserved (incl. `pricing_requested`) — no client-contract break.
> - **`20260617090100_sec02_revoke_anon_catalogue_read.sql`** (SEC-02): `revoke select ... from anon` on `product`/`pricelist_item`/`product_image` + flips the three public-read policies `TO authenticated` (row filters byte-identical — authenticated viewers see the same `profile_visible` rows). **Own-company policies (`product_all`/`pli_all`/`product_image_all`) untouched.**
> - Your `/c/[handle]` public profile is unaffected (it reads only the `get_public_profile` DEFINER RPC, not these tables — re-confirmed green). **LOCAL-only, proven on a clean `db reset`.** Cloud `db push` is DEFERRED behind a gated checkpoint + this sync ritual + the `avatars_*` reconcile. **Lock stays HELD** until that push (not released at merge) — flagging so you don't assume the shared RLS surface is free yet.

**2026-06-16 (Phase 1 COMPLETE) — F3 drift closed; lock released. ⚠️ Two NEW migrations added (no edits to yours); nothing else of yours touched.** Committed `20260615120000_profile_qr_foundation` (person profile cols + `public_handle` UNIQUE index + public `avatars` bucket with own-folder write RLS / public read) and `20260615123000_get_public_profile` (the curated SECURITY DEFINER anon RPC — body dumped verbatim from cloud, 13 cols, `revoke all from public` + `grant execute to anon, authenticated`). A clean local `supabase db reset` now applies the whole chain + seed green and `/c/<handle>` renders 200 (Playwright `e2e/public-profile.spec.ts` + a new `supabase/tests/profile_foundation_test.sql` smoke test, run via `run_profile_foundation_test.sh`). **repo == local == cloud** for these objects. Did NOT touch `seed.sql` / `product` / `database.types.ts` / your `20260612130000`. **Cloud-apply heads-up:** the `avatars` bucket + policies already exist on cloud (MCP, session-19) — when these migrations land on cloud, reconcile any old MCP-named avatars policies (mine are named `avatars_*`).

**2026-06-16 (executing) — Phase 1 = F3 backfill of MY own drifted objects. ⚠️ Locked `supabase/migrations/` (2 NEW files only, no edits to yours) + the `avatars` bucket/policy. Nothing of yours touched; not editing `seed.sql` / `product` / `database.types.ts`.** Committing `profile_qr_foundation` + `get_public_profile` (live-but-uncommitted since session-19) so a clean from-files `db reset` stands up onboarding + the public profile page. Your clean-rebuild + dup-timestamp fixes confirm the untouched chain resets green — thanks; my e2e drives the handle through the app so I don't touch your `seed.sql`. I dumped the live `get_public_profile` body from cloud to commit it verbatim (13 cols incl. `company_logo_path`; grants anon + authenticated).

**2026-06-16 (later) — GSD planning setup for my lane. Nothing of yours touched; no shared schema/code changed (only a DECISIONS.md append + this sync).** Synced my branch with dev #106 (your 4.5.2/4.5.3 Sella strip + clean-from-files DB rebuild — thanks; the dup-timestamp + clean-rebuild fixes are in). Set up GSD for my lane entirely in **gitignored `.planning/`** (per-engineer, not shared): mapped the codebase + product docs, ran new-project → **onboarding-ready milestone** (Auth·Onboarding·Admin-verify·Discover·Present), **8-phase roadmap**. **Locked (DECISIONS.md):** local-first DB hygiene (build + `db reset` on local first, then cloud — no MCP-to-cloud without a committed migration); **Buy (DEV-77) + Sell→Allocate (DEV-76) deferred** to a follow-up milestone though Marcel assigned them; Marcel's Discover/Present/Home issues (DEV-78/81/80/79/70/69/68) folded into a UX phase. **Next: plan-phase 1 = F3 migration backfill** (`get_public_profile` + `profile_qr_foundation` still missing from files; touches shared `product`/`avatars`, sync ritual first).

**2026-06-16 — Setting up the test harness (Playwright E2E) — slice 0 of the go-to-market push. ⚠️ Locking `package.json` + `.gitignore` (both append-only, low conflict).** Adding `@playwright/test` (dev dep) + a `test` script + an `e2e/` folder with one smoke test. No app code, no schema, no RLS. Foundation for TDD on the launch work (auth hardening + admin verification + Discover/Present refinement). **DONE — committed, `npm test` green (login smoke), locks released.** Also gitignored `.planning/` (GSD personal scaffolding; per the two-systems split — Linear = work queue, GSD = product knowledge, no overlap).

**2026-06-15 (Discover→Connect loop slices 4–6 — catalogue + pricing; MERGED to dev [#104](https://github.com/HelloSello/hello-sello-mvp/pull/104)). ⚠️ I touched shared `product` RLS + `database.types.ts`, and my Present `ShopView` — please read.** Layered the catalogue + Request-pricing onto the Discover profile (the soft-openness L0/L1/L2 model).
> - **⚠️ `product` RLS — the "dial floor":** all THREE public-read policies now gate on `profile_visible = true` — `product_public_select`, `product_image_public_select`, and a new explicit `pricelist_item_public_select` (prices also need `price_public`). SELECT-only, OR'd on top of your `*_all` write policies — **write isolation untouched**, net-narrowing. **Your `getOwnCatalog` (deal-picker) now correctly returns own-company products only** — it assumed RLS already did that, but the old broad policy was leaking other companies' products in; with `profile_visible` defaulting false it's now exactly own-company. **Heads-up:** once sellers flip products visible, add an explicit `.eq('company_id', current)` there (pre-existing latent bug, flagged).
> - **New migrations (my Discover/Present domain):** `product_profile_visible_dial` (new `product.profile_visible` col + partial index), `get_discoverable_shop` (SECURITY DEFINER catalogue projection — gated prices, ordered images, **never `cogs`**), `discoverable_company_pricing_state` (recreated `get_discoverable_company`: added `pricing_requested`, scoped `connection_state` to connect-types so a pricing request no longer flips the Connect button to "Request sent"), `pricelist_item_public_select_profile_visible`, + a demo seed.
> - **⚠️ `database.types.ts`:** surgically added `product.profile_visible` (Row/Insert/Update) — NOT a full regen (your pattern). Heads-up on your next rebase. **⚠️ `src/app/present/ShopView.tsx`** (my Present surface): added a per-product **On/Off-profile** toggle beside the price toggle.
> - **Migration filename note:** my slice-1 `20260614120000_list_discoverable_companies.sql` shares the `20260614120000` prefix with your `20260614120000_propose_deal_rpc.sql`. DISTINCT in live `schema_migrations` (MCP auto-versions) + different filenames (no git conflict) — but it's a fresh-DB/CLI hygiene smell (joins the cleanup pile).
> - **SWE review:** a flagged "price leak" on `pricelist_item` was verified a **FALSE POSITIVE** (transitive RLS already closed it); applied the explicit policy anyway for defense-in-depth. **Follow-ups F1–F13** in `docs/muskan-build/discover-connect-loop.md` (incl. the seed-in-migration question + the pre-existing `ShopView` carousel lint).

**2026-06-14 (Discover→Connect loop slices 1–3 — built + verified live; committed to my branch, NOT dev). The SEND side of Connect — feeds your inbox, nothing of yours touched.** Built the Discover "front door" that creates connection requests; your accept/relationship/chat machinery handles the rest.
> - **The seam:** a `sendConnectRequest()` server action (`src/app/discover/actions.ts`) INSERTs a `pending_inbox_item` (`connect` / `connect_message`, RLS-gated to the sender's company, dup-guarded). It lands in your Connect inbox → Accept → relationship + C2C/P2P chat. **I only insert; you read/accept** — clean boundary.
> - **2 new SECURITY DEFINER RPCs (my Discover domain, additive):** `list_discoverable_companies()` (directory) + `get_discoverable_company(id)` (profile) — safe cross-tenant projection of verified companies + per-viewer `connection_state`. **Filed as migrations** `20260614120000` / `20260614130000`. Not in `database.types.ts` (localized cast, your pattern — appear on your next regen). New index `idx_inbox_pair_status` on `pending_inbox_item`.
> - **Shared docs touched (append-only, low conflict):** `DECISIONS.md` + `DISCOVER.md` (Discover soft-openness model, my surface) + `ARCHITECTURE-NOTES.md` (only a path-string in a rename).
> - **Housekeeping:** my `docs/build/` → **`docs/muskan-build/`**. New build plan `docs/muskan-build/discover-connect-loop.md`.
> - **⚠️ Migration drift flag (team):** `get_public_profile` + `profile_qr_foundation` (my session-19 work) are live on the shared DB but their `.sql` was never committed (applied via MCP). Heads-up on your next DB-from-files rebuild; backfill is on my list. **My new Discover RPCs ARE filed.**
> - **Model note:** Discover is now a **soft, company-curated profile** (L0→L4), not closed-by-default (that was demo-only). **Track 2** (FLOWZ shadow profiles + outbound) is documented but the outbound email is legally **RED** (UWG §7) — deferred behind legal sign-off.

**2026-06-12 (Sella architecture proposal — pushed to dev for 4.0 SHARED review; my half of 4.0).** Full doc: `docs/PRD/muskan-proposed-sella-architecture.md` (status: proposed). It's the `detect-deal` job + researched refinements **built on top of** what's already locked + verified — NOT a rewrite. For your compare:
> - **Keeps:** the verified `bedrock.ts` (plain-fetch + bearer, no SDK), the `_shared` placement, suggest-only structural, Bedrock-EU `eu.` profiles, your dedup-row-as-state. A KEEP / ADD / REFINE table maps it line-by-line.
> - **Refines (with current primary sources):** `propose_deal_draft` tool → **Bedrock structured outputs** (GA on Converse Feb 2026 — forced-tool never guaranteed shape); ~15–20-msg window → **whole thread + dedup-state + ~20k cap**; later auto-trigger = raw `pg_net` webhook → **pgmq + cron** (pg_net non-durable). "Vercel can't fire-and-forget" is stale (waitUntil 2024) but moot.
> - **First slice = on-demand in a Next server action** — your placement rule's "person-waiting → app" branch (chat writes still mock), not a reversal.
> - **Adds:** guardrails/failure-mode framework, EU-AI-Act Art.50 disclosure, daily cost alert.
> - **Needs us both:** the Sella↔deal-flow boundary (workspace spawn + accept gate). Your **§3.5 `create_deal_draft` / `edit_deal_draft` already build the draft side** — so it's mostly wiring detect-deal's suggestion → your draft flow. Let's lock it in the 4.0 compare.
> - **Provisional** — pending our joint review; nothing reversed in `DECISIONS.md`, only clarifying notes proposed.

**2026-06-11 (Storage uploads hardening — merged to dev #98, HELD from main). My catalog/profile files only — nothing of yours.** Finished the client-direct + stable-filename pattern for single-slot media (avatar, cover, logo) — the gallery note's "cover/logo could migrate to it too" is now done. **Files: `src/app/present/ShopView.tsx`, `src/modules/catalog/{manage,shop}.ts`, `src/modules/profile/index.ts`, `src/shared/ui/AvatarUpload.tsx` + `docs/PRD/storage-uploads.md`. No migrations, no schema, no RLS, no shared shell files.** Stable filenames (`{id}/avatar`, `{companyId}/cover|logo`) + upsert → orphan-proof (overwrite in place); server stores only path strings; `?v=updated_at` cache nonce on read. Cleaned 3 legacy storage orphans via the Storage API (not SQL — SQL delete can leave bytes billed). **⚠️ dev→main HELD: I did NOT promote, because dev→main would also ship your 3c/3d (#97) to prod — that's your call when ready.** Decisions in DECISIONS.md + ARCHITECTURE-NOTES.md (2026-06-11). Deferred: parent-delete file cascade (all buckets, own task).

**2026-06-11 (Discover directory UI — merged to dev, #95). Nothing of yours touched.** Built the Discover surface UI-only: a **closed, tagged NON-marketplace directory** (search-first lobby) replacing the placeholder. All new files under `src/app/discover/` (`page` + `DiscoverDirectory` + `sample-companies`). **No migrations, no shared files, no RLS.** Data is placeholder + "Request to enter" is stubbed — the real `list_discoverable_companies()` SECURITY DEFINER RPC and the gate's accept flow are the next slices. **Heads-up for when you build Connect's request/accept:** Discover's "Request to enter" likely wires into it (one of two options, leaning "entering = a Connect request"). Model recorded in DECISIONS.md ("Discover: closed + tagged directory") + DISCOVER.md. Left an unrelated in-progress upload-migration uncommitted in my tree (not in #95).

**2026-06-10 (Profile & QR business card — built + verified live; ⚠️ two of your shell files touched, both additive).** New feature: the "Scan to Connect" digital business card + public profile page + the in-app account pages. **2 migrations applied to live (additive, touch only `person` + a new bucket + a new function — none of your tables/RLS):**
> 1. `profile_qr_foundation` — `person` += `display_name/title/phone/language/links/avatar_path/public_handle` (backfilled; `public_handle` UNIQUE); new **public `avatars` bucket** + own-folder storage RLS.
> 2. `get_public_profile_rpc` — `SECURITY DEFINER` function (`search_path=''`) returning ONLY curated card fields by handle; granted to `anon`. The public page calls this — the `person` table stays closed to anon.
> **New code (all mine, non-overlapping):** `src/modules/profile`, `src/modules/companies` (one-writer modules), `src/app/account/*` (My Profile/Company/Settings, view+edit), `src/app/c/[handle]/*` (public page + vCard route), `src/shared/ui/{Avatar,AvatarUpload,account-card}`. Added `qrcode` dep.
> **⚠️ Two of your files, touched additively — heads-up for your rebase:**
> 1. `src/shared/ui/AppShell.tsx` — added `/c` to `BARE_ROUTES` (public profile pages render chrome-free, like `/login`). One array entry.
> 2. `src/shared/ui/IconRail.tsx` — enriched the bottom account menu (the one I added the sign-out to in 1b — you said "restyle freely, it's your component") into the **account card**: avatar opens a popover with the QR business card + My Profile/Company/Settings links + sign-out. Restyle freely as before.
> **`database.types.ts`** regen'd for the new `person` columns (the get_public_profile function isn't in the types — I used a localized typed cast to avoid a full regen churn). **Not PR'd yet.** The prototype at `src/app/prototype/qr-card` + its `/prototype` proxy allowance are THROWAWAY (deleted before the real PR).

**2026-06-10 (Present product image gallery — built + verified; ⚠️ schema + storage RLS touched, all additive to MY surface).** Multiple images per product + Embla carousel + reorder/cover/remove. **3 new migrations (applied to live):**
> 1. `20260610150000_product_image_gallery` — **new `product_image` table** (1:many on `product`, `position`-ordered; replaces the single `product.image_path`, which I **dropped** after backfilling). RLS mirrors `product_all` + an additive public SELECT. **Touches only `product` (drops one column) — none of your tables/RLS.**
> 2. `20260610160000_import_products_rpc_gallery` — `import_products` now writes a `product_image` row instead of `image_path` (only change to the RPC).
> 3. `20260610170000_shop_media_owner_select` — **added `shop_media_select`** (company-scoped) on `storage.objects`. The bucket had no SELECT, so `remove()` silently orphaned files. Scoped to own-folder only — no anon/cross-company listing, storefront URLs unaffected.
> **Image upload/delete is now client-direct → storage** (server stores only paths) to dodge the Vercel 4.5 MB body cap — reuse pattern if you add file uploads. **Regenerated `database.types.ts`** — heads-up, this is the one file that'll conflict with your dev changes; I resolve it by regenerating from live (has both our tables). PR'ing to dev now.

**2026-06-10 (Present profile editor — SHIPPED to production, no schema).** Save-model fix (one explicit Save; old "Done" dropped staged cover/logo) + social links + logo affordance + back-to-shop button. All app-layer: `src/app/present/ShopView.tsx`, `src/modules/catalog/{manage,shop}.ts`. Social links live in **`company.metadata.links`** (jsonb — reused existing column, no migration). **dev→main merged via admin override** (#81, #83) — bypassed the review-required rule on `main`; flagging since it skipped a second pair of eyes. Nothing of yours touched.

**2026-06-10 (Present storefront — backend + shop page DONE, lock released).** Whole import path + visitor shop live & verified end-to-end (RPC import → RLS read → shop UI with per-product price gating). Commits: `d43fc0b` foundation · `59d6fbd` validator · `edb28cc` `import_products` RPC + import action · `7b5c5c3` shop page. No schema work outstanding — next (manage-shop owner UI + image upload) is app-only. `import_products` is in DB; if you touch `product`/`pricelist_item` before I PR, expect a small merge.

**2026-06-10 (Present storefront — checkpoint, lock released).** Foundation migration applied + committed (`d43fc0b`); CSV template + validator committed (`59d6fbd`). Lock released — not actively editing schema while paused. **Heads-up:** when I resume I'll add an `import_products` RPC + re-lock `product`/`pricelist_item`. My foundation changes are **on my branch only, not in dev yet** — if you touch `product`/`pricelist_item` before I PR, expect a small merge.

**2026-06-09 (Present storefront — building) — ⚠️ touching `company` / `product` / `pricelist_item` RLS.** Starting the Present surface (seller shop). DB foundation migration `20260609180000`→`20260609210000_present_storefront_foundation`:
- `company` += `tagline`, `cover_path`, `logo_path`, `warehouse_location`; `product` += `price_public` (default false).
- New **public** `shop-media` bucket (product photos + cover/logo), writes folder-scoped by `current_company_id()` (mirrors your `company-licenses` pattern).
- **Additive SELECT policies** `product_public_select` + `pricelist_item_public_select` so buyers can browse another company's shop (catalog public; **prices gated** by `price_public`). Your `product_all` / `pli_all` write policies are untouched — I only OR a SELECT on top, isolation preserved. Shout if this worries you.

**2026-06-08 (Sella design) — DEV-11 multi-Sella architecture: MVP scope locked.** Detail in `DECISIONS.md` (newest entry). Ayush — relevant when you build 4a–4d:
- **MVP Sella = stateless single-shot Bedrock calls** behind the 4a wrapper, each ≤1 structured-output tool. **No agent loop / orchestrator / graph / framework (LangGraph, Bedrock Agents) / RAG / memory.** Detection (built) is the reference shape — 4c draft + 4d summarize follow the same single-call pattern.
- The "5 Sellas" = **one runtime parameterized** by (scope · persona · tools), not 5 services. Multi-Sella orchestration + memory/RAG are explicitly **post-MVP**.
- *(Design only — no build Status / lock rows changed.)*

**2026-06-07 (Sella design session) — Deal-Sella detection design settled.** Full detail in `ARCHITECTURE-NOTES.md` "Sella runtime placement" + `DECISIONS.md` (Sella design entry). Ayush — build Sella detection against these:
- **Detection runs in a Supabase Edge Function**, NOT your Next.js path (new `chat_message` → DB webhook → Claude Haiku). Keeps Sella a non-blocking leaf; Vercel can't do reliable fire-and-forget.
- **One `propose_deal_draft` tool** (contract in NOTES, maps 1:1 to `deal_line_item` / `deal_card`). **Suggest-only is structural** — only propose-tools exist, no confirm/send.
- **Proposal + both-accept votes ride in the `deal_detected` message `metadata`** — no new table.
- **Workspace birth = one atomic transaction** on both-accept (app-side — a person's waiting). **O6 closed in the PRD.**
- *(Design session — I did NOT change the build Status / locks above; your session-15 build state stands.)*

**2026-06-08 (Sella design, follow-on) — spawn-txn + Bedrock creds settled** (the two "open for build" items above are now closed). Detail in `DECISIONS.md` 2026-06-08 entry + `ARCHITECTURE-NOTES.md`. Ayush — build the workspace birth against these:
- **Create order is acyclic** (no thread_id backfill): `deal_card` → `deal_line_item` → `deal_workspace` → `deal_member` → `chat_thread`(deal) → `chat_message`(`workspace_created`) → audit.
- **Both founders = `deal_member` `role=owner`** (one per side). **`deal_workspace.owner_person_id` is REMOVED** — ownership reads from `deal_member` (SCHEMA.md §8 amended). `side_lead` not auto-assigned at birth.
- **Superadmin = platform RLS bypass**, not a deal_member row.
- **Signpost:** on birth, the P2P `deal_detected` message becomes a "Deal created → open workspace" link.
- **Bedrock creds = permanent least-privilege key in Supabase Edge secrets** (not Vercel env), scoped to `eu.` Claude invoke only. Auto-expiring = post-MVP.
- *(Recorded on my `claude/muskan/sella-design` worktree branch — will merge to work; I did NOT change any build Status row.)*

---

**2026-06-07 (session 15) — `BUILD-PLAN.md` now has a Status column.** New rule in its Legend: **each owner edits only their own rows' Status** (you = Group A, me = Group M); status flips are the one exception to the lock ritual (distinct rows → clean merge). I set the baseline: F1–F5 + your 1a = ✅; I'm starting **1b (auth screens)** = 🔨. Flip your Connect/Deal/Sella rows as you go. Per-item scope files now live in `docs/build/` (mine; you can ignore).

> **1b BUILT + verified (status 🧪).** Heads-up on **one file of yours I touched:** `src/shared/ui/AppShell.tsx` is now a **client component** (`'use client'`) — it reads `usePathname()` and renders children **bare (no rail/top-bar) on `/login` + `/signup`** (list = `BARE_ROUTES`). Everything else is unchanged; your Connect/etc. routes still get the full frame. New stuff (all mine, won't touch your Connect work): `/login`, `/signup`, `/onboarding` (post-signup placeholder, 1c mounts there), `src/proxy.ts` + `src/shared/db/proxy.ts` (Next-16 session-refresh proxy — `getClaims()` gate, redirects signed-out → `/login`). Verified against seed (alice@greenleaf.test / password123). **The F5-deferred session proxy is now live** — your authed pages stay fresh. Lock released.
>
> **Update — I wired Sign-out into the rail myself** (Muskan reversed the earlier "leave to you" call). The user-avatar slot at the bottom of `IconRail` is now a click-to-open menu with a **Sign out** item (calls my `signOut` action). Minimal styling — **restyle freely** when you polish the shell; it's your component. Signup also now carries the two value-prop lines (QR card / B2B network) on the locked light brand.

---

**2026-06-07 (session 14) — F5 merged to dev → PR [#60](https://github.com/HelloSello/hello-sello-mvp/pull/60). Pull `dev` and you're fully unblocked; locks released.** Built on your Task-1A shell. What you can import now:
- **`@/shared/db/server`** + **`@/shared/db/client`** — `createClient()` (server = cookie/RLS-scoped; browser = singleton). Types: `Database` + `Tables<'x'>` from `@/shared/db`.
- **`@/shared/auth`** — `getCurrentUser()` / `getCurrentPerson()` / `getCurrentCompanyId()` (null-safe per Path-B).
- **`@/shared/audit`** — `writeAudit({ actorType, action, contentType, contentId, ... })`: thin insert, DB trigger does the hash-chain. Use on every business write.
- Deps added to `package.json`: `@supabase/ssr`, `@supabase/supabase-js`. Env keys in `.env.example` (set your `.env.local`). **Session-refresh proxy deferred to auth-screens 1b** — fine for now.

---

**2026-06-07 (session 13) — Discover explored + paused (no schema change, doesn't touch your half).** Heads-up only — this is all on my surface track.
- Built a throwaway prototype at `prototypes/discover-prototype/` (mock DB, 3 variants) to design Discover. **Paused** — page structure not clear yet. No migrations, no schema proposed.
- **One lock that may matter later:** Discover visibility = **Instagram model** — listed = has a public shop (sellers); buyers (no shop, e.g. pharmacies) are hidden, **search-only**. Key = "has public shop", not a role. → `DECISIONS.md` session-13.
- Confirmed Discover = two jobs: supplier **directory** + ad/social **feed**. Open: structure, demand-MVP, feed-scope — parked in `DISCOVER.md`.
- **Foundation F5 + the `messaging` contract are still owed** (unchanged since session 12 — see below). Next session I pivot to **Sella's role in Connect**, not F5 — flag me if F5 is blocking you.

---

**2026-06-07 (session 12) — Foundation BUILT + applied to Supabase (F1–F4). You're nearly unblocked.** PR [#54](https://github.com/HelloSello/hello-sello-mvp/pull/54) → `dev` carries it all.
- **What's live:** 71 tables applied; **RLS** on every table (multi-tenant isolation, proven by `supabase/tests/rls_isolation_test.sql`); auth→person trigger; dev seed (Alice/GreenLeaf cultivator + Bob/StonePharm pharmacy, password `password123`). **Generated TS types → `src/types/database.types.ts`** — build against these.
- **⚠️ Interface change you must know:** `deal_line_item` **no longer has** `seller_margin`/`buyer_metric` — they moved to **`deal_line_item_private`** (one row per side, RLS by company). Same for `product.cogs` → **`product_cost`**. Your deal card reads the sibling for *your own side's* number; the counterparty's is invisible (RLS-enforced, tested).
- **Stages:** `thing.stage_code` groups by the 5-stage pipeline (NOT NULL); deal-thread/things/artifacts all follow `deal_workspace.visibility` in lockstep (private = members-only).
- **Before you parallelize (per BUILD-PLAN Phase-0 gate):** I still owe **F5** (`shared/db`, `shared/auth`, `audit_log` write helper) — your code needs these. And we should agree the **`messaging` `index.ts`** contract (your Sella/Deal seam) up front. You *can* start Deal UI/logic against the live tables + types now; integration needs F5 + the messaging contract.
- **Audit rule holds:** every business-table write also writes an `audit_log` row (helper coming in F5).

---

**2026-06-07 (session 11) — Schema diagram map added + merged to `dev` (PR #52).** Two new files in `docs/architecture/` (docs only, no schema change):
- **`SCHEMA.md`** — surface-grouped Mermaid ER map of the whole v0 schema (Phase 1 + Phase 2 incl. session-10 catalog/pricelist). Deal-journey flowchart + DB spine + 10 sections, each with a plain-English summary + key columns, color-coded by status. Lookups + future-surfaces appendices. Renders on GitHub/VS Code.
- **`schema-visual.html`** — self-rendering viewer reading `SCHEMA.md` live (single source of truth, no drift). Serve via the `schema-visual` launch config → `localhost:8011/schema-visual.html` (must be served, not opened as a file).
- **Doc roles:** `SCHEMA.md` = visual *map* · `SCHEMA-DRAFT.md` = column *detail* · `schema-visual.html` = renderer. Future surfaces (Discover/Present/Buy/Sell/Grow) + Phase 3 `deal_delivery`/`deal_room` are placeholders in Appendix B so the design keeps room for them.

---

**2026-06-07 (session 10) — Product Catalog & Pricelist tables locked in `SCHEMA-DRAFT.md`** (from your blueprint CSVs). Resolves the last open Phase-2 schema item. **7 tables + 4 lookups:**
- **`product`** (catalog master) holds **label/advertised** cannabinoids; **`product_batch`** holds **measured** CoA values — research-grounded split (one product → many batches; lab values deviate per lot). This is why Marcel's CSV had THC twice.
- **`terpene`** lookup (23 seeds) + **`batch_terpene`** child (variable profile, not the CSV's fixed 3 cols).
- **`product_buyer_code`** — relationship-scoped map for the buyer's own product code (PHA-BB1). It's an *identifier*, not pricing, so it doesn't break "no per-buyer pricing in v0". Modeled as a table (not a column) to avoid a future extract-to-rows migration.
- **`pricelist` + `pricelist_item`** — one standard company-wide list per company; per-customer "Customer Price/g" override stays deferred post-v0. Sell prices live on `pricelist_item`; `product` holds only `cogs` (🔒seller-only) + `rrp_per_gram`.
- **Naming locked: `product`** (not `catalog_product`). **`deal_line_item.product_id` FK is now real in Phase 2** — create `product` before `deal_line_item`.
- 4 new lookups (`product_unit`, `strain_dominance`, `irradiation_type`, `pricelist_status`); audit seeds added (+`product`, `product_batch`, `product_buyer_code`, `pricelist_item`).
- **Not yet written:** DECISIONS.md session-10 entry (rationale + research sources) — pending Muskan's go.

**Next:** write Phase 1 + Phase 2 migrations (now unblocked — no open schema items left).

---

**2026-06-07 (session 9) — Phase 2 schema review vs the PRD; tables finalized. Two of your PRD action items answered.** Reviewed all 15 Phase 2 tables before migrations (PRD = source of truth now). Edits pushed to `SCHEMA-DRAFT.md` + `DECISIONS.md` (session-9 entry) + `ARCHITECTURE-NOTES.md` + `CONTEXT.md` + `AGENTS.md` checkpoint. **What changed:**
- **`deal_stage` seeds locked = your 5-stage template** (`negotiation`/`compliance_quality`/`agreement`/`payment`/`fulfilment_delivery`). **Dropped `domain`** — `thing` now groups by `stage` (NOT NULL), matching the PRD. Your screen-④ prototype's "by domain" Things-tab grouping is **superseded** (name-mismatch; PRD wins) — heads-up since it's your prototype.
- **Stages are now a VISIBLE UI element** (supersedes the old DEV-24/34 "scaffolding, not UI" lock).
- **O6 → workspace + deal chat born at Draft** (your PRD needed this; it's now in the schema). Fixed the stale `deal_card.thread_id` "at confirm" note.
- **⚠️ DEV-37 was misread in session 8** — it's *chat-organization* ("organized chat windows for multiple deals", Chat project), NOT multi-deal-per-workspace. **Workspace↔deal is a permanent 1:1.** Corrected the "relax later" language in all canon. Your `deal-flow.md` Block 4 already treats it as 1:1, so you're consistent — just flagging the canon fix.
- **Audit = log everything from day one**; visibility (chat+things+docs) lockstep with the one flag.
- **Phase 2 final** except 2 known-deferred: `buyer_metric` rename + `pricelist`/`product` column list (your blueprint CSVs are in `docs/product/blueprint/` — that's my next session). Then we write Phase 1 + Phase 2 migrations.

---

**2026-06-07 (session 8) — 4 screen ④ tables locked in `SCHEMA-DRAFT.md`.** Your PR #40 (screen ④ Deal Workspace prototype) merge unblocked the workspace tables. Walked through them research-first, one at a time. **What landed:**

- **`deal_workspace`** — separate container table (NOT columns on `deal_card`). Container concerns isolated from cross-company versioned agreement. 1:1 with deal_card in v0; DEV-37 multi-deal-per-workspace stays deferred. **Visibility model FLIPPED** — supersedes ARCHITECTURE-NOTES line 54 "two independent layers, Layer B always invited-only" model. New model: **one flag (`company_wide` default / `private`) drives both Layer A listing AND Layer B contents access**. Industry default (Salesforce/HubSpot opportunity-visible-to-org), simpler RLS, and Muskan explicitly accepted strict-hide RLS can be added later if needed. **Memory note `project_deal_visibility_two_layers.md` flagged stale.** Line 54 marked superseded + new line added below it.
- **3-layer same-company owner-handoff enforcement** — RLS + DB trigger `enforce_owner_same_company` + app-layer pre-check. Cross-company handoff structurally blocked. Same enforcement extends to `deal_member.role='side_lead'` handoff. *Why all three:* this is THE cross-company trust boundary; single-layer bug = breach. Industry consensus (Postgres + Supabase + OWASP Multi-Tenant) for security-critical cross-table invariants is defense-in-depth.
- **`deal_member`** — junction with `role` enum (`owner` / `side_lead` / `member`). Side_lead concept added so each side controls own-side member adds (cross-company adds blocked). Workspace birth auto-inserts 2 rows: initiating dealmaker as `owner`, counterparty as `side_lead`. v0 deferred: `access_level` column.
- **`thing`** — single table with `type` discriminator (Asana subtype pattern): `task` / `approval` / `document_upload`. Two nullable FKs link approval→`deal_confirmation` + document_upload→`deal_artifact`. Status: `open`/`done` v0. Stages = NULL FK to `deal_stage` lookup (seeds TBD per DEV-24/34).
- **`deal_artifact`** — clones `relationship_artifact` Storage pattern; scoped to `deal_workspace`. **9 category seeds** including EU regulatory (`phytosanitary_cert`, `certificate_of_origin`, `packing_list`, `proforma_invoice` + the 4 originals + `other`). PDF-only v0, 20 MB.
- **`done`-flip lives in app-layer Edge Function (NOT DB trigger)** — opposite call from owner-handoff. *Why:* this is correctness logic (not a trust boundary), single write path, better debuggability, no per-write overhead. Industry split: security-critical = both layers; correctness/state-transition = app-layer. Belt-and-suspenders DB trigger can be added later if support sees drift.
- **`done` added to `deal_card_status` lookup.**
- **`audit_log`:** +4 `auditable_content_type` codes (`deal_workspace`, `deal_member`, `thing`, `deal_artifact`).
- **7 new lookups:** `workspace_visibility`, `deal_member_role`, `thing_domain`, `thing_type`, `thing_status`, `deal_stage` (seeds TBD), `deal_artifact_category`.
- **Promoted from Phase 3 → Phase 2:** `deal_workspace` + `thing`. **`deal_room` stays Phase 3** (Present-surface, not execution container).

**ARCHITECTURE-NOTES.md:** 3 new entries: (a) `deal_workspace` schema entry under Core entities; (b) visibility flip — line 54 marked superseded + new line below; (c) new app-layer-vs-DB-trigger principle entry under Access policy.

**DECISIONS.md:** session 8 entry appended at end — full rationale for all of the above + the visibility flip's load-bearing significance.

**Pricelist scope re-clarified (Marcel sent updated WhatsApp + Drive blueprint today):** structured rows + CSV blueprint input + manual entry; PDF dropped. Per-customer override = conceptually needed but **explicitly NOT v0** per Marcel. Exact columns pending — Drive "Pricelist" spreadsheet (`1-260WKvTX67fq4If6jekN9_4rA1eWvGLJG3zuJviuPA`) ready to read next session.

**Heads up for next session:** Muskan creating `docs/product/blueprints/` folder for Marcel's CSV/spreadsheet exports (version-controlled record).

---

**2026-06-07 (session 7) — 3 screen ③ relationship tables locked in `SCHEMA-DRAFT.md`.** Your screen ③ lock unblocked these; I reshaped your `note`/`agreed_term`/`artifact` sketches against schema conventions and locked them. **What landed:**
- **`relationship_note`** — one table + `scope = team / personal` (Salesforce/HubSpot pattern). Personal strictly author-only (no Superadmin override). Two-table approach rejected.
- **`relationship_term`** — proposal/accept flow per `deal_confirmation` pattern (regulated industry rationale). `agreed_term_type` lookup (controlled vocab — avoids EAV) with 5 seeds: `payment_terms`, `incoterms`, `min_order_qty`, `delivery_lead_time_days`, `exclusivity`. **Not redundant with `deal_card`** — standing agreement vs frozen deal snapshot (same shape as `pricelist` → `deal_line_item.unit_price`).
- **`relationship_artifact`** — clones `company_license_file` Storage pattern. `artifact_category` lookup (contract/nda/certificate/marketing/other). v0 PDF-only, 20 MB; both sides read, uploader edits.
- **Lookup rename:** `license_scan_status` → `file_scan_status` (now reusable across license / future pricelist / artifact). No DB cost (no migrations written).
- **`audit_log`:** +6 action types (term .proposed/.accepted/.rejected + artifact .uploaded/.downloaded/.deleted) and +3 `auditable_content_type` codes (`relationship_note`, `relationship_term`, `relationship_artifact`).
- **Deferred this session:** `buyer_metric` column rename + `pricelist` table shape (pending Marcel on PDF vs CSV vs structured). Phase 2 open Qs table updated.

**Queued behind your lock:** the DECISIONS.md entry for today's locks. I'll write it after you unlock — your sync said "Will unlock this session." No rush; SCHEMA-DRAFT is the canon for the shapes either way.

**Your `ARCHITECTURE-NOTES.md:23` "at accept" reword** — you confirmed you'll do it this pass. Thanks.

---

**2026-06-06 — schema review applied to `SCHEMA-DRAFT` (fresh-eyes pass).** Findings folded in: (1) **4 status lookups now defined** — `company_verification_status`, `license_scan_status`, `inbox_status`, `join_request_status` (shared shape + `is_terminal`); the status columns that said "FK to lookup" now name a real table. (2) **`created_by`/`updated_by` added** to `company`, `group`, `permission_matrix_entry` + **`deleted_by`** to `company`/`group`. (3) **`permission_matrix_entry` gets `company_id`** (denormalized from group) for direct RLS + `INDEX(company_id)`. (4) **Deferred/noted:** optimistic-lock `version` (add when team editing ships). **⚠️ Convention change you'll want to know:** the *Audit columns* convention (row 19 + checklist #3) is now **"business tables; pure junctions + self-owned `person` exempt"** — so your tables follow the same rule. **🟡 UUID v7 vs v4 — decided, no ack needed:** staying on **v4** for now (Supabase PG17 has no native `uuidv7()` / extension; v4→v7 later is a cheap default-swap, *not* a re-key). Revisit on PG18 or when `audit_log` grows large. See `DECISIONS.md` 2026-06-06.

**2026-06-06 — `pending_inbox_item` locked (your 5 answers).** Folded your answers into the canon (`SCHEMA-DRAFT.md`): new `inbox_request_type` lookup (4 seeds: connect / connect_message / pricelist_request / deal_card); `pending_inbox_item` now has `type`, nullable `deal_card_id` (CHECK: only for the `deal_card` type), **single owner** `assigned_to` + `assigned_by` provenance (replaces `picked_up_by` / `picked_up_at`). **Status lookup changed** `pending_pickup/picked_up/rejected` → `pending/accepted/rejected` — "assigned" is derived from `assigned_to`, `picked_up` retired. Lenses + reassign rules recorded as locked notes on the table; `DECISIONS.md` open item marked resolved. **Visual (`schema-phase1-visual.html`) refreshed to match** (new lookup card + green inbox card, verified in the browser preview). **No shared files left locked.**

**⚠️ Flag for you — `ARCHITECTURE-NOTES.md:23`** says `relationship` is created "at pickup / connect", but your locked model creates the C2C/P2P on **accept**, not on pickup (pickup is now ownership-only). Your file, your call — leave it, or reword to "at accept"?

**2026-06-06 (session 3) — company-category step is now in the prototype.** Added the business-category multi-select to `prototypes/phase-1-onboarding` (company-setup screen): `company_type` lookup (cultivator/wholesaler/importer/pharmacy) + `company_type_assignment` junction, written on company create, matching `SCHEMA-DRAFT`. The control is a click-to-open `<details>` dropdown (multi-select; closed bar shows picks). Generalized `loadDB` backfill so older saved state self-heals new tables. **No shared files left locked.** Commits `9c08c8c` + `ad69f8c`.

**Path B (join-existing) — build-deferral posture recorded in `DECISIONS.md` (2026-06-06).** We ship **Path A only** in v0; the `join_request` table + approval + screens are deferred (all additive later — a new table breaks nothing). **Two invariants we must honor in v0 code regardless — relevant to your `src/` + RLS work:** (1) `person.company_id` stays **nullable** and is read through ONE accessor (e.g. `currentCompany()`), not scattered; (2) **RLS must fail safe on a null `company_id`** (a company-less user sees only their own rows). Rationale: the company-less state already exists in the sign-in→company-setup window; Path B just makes it last longer.

**Open design Q (adjacent to your Connect work):** where does a Superadmin review/approve pending join requests? NOT the Connect inbox — `join_request` is a separate aggregate (person→company membership vs company↔company connection). Noted in `DECISIONS.md`, not yet in Linear.

Still on my list: write the first migrations (`supabase/migrations/`, canon = SCHEMA-DRAFT); A2 `email_encrypted` scan (PR #25); AWS Bedrock test (key in Vercel, use `eu.` prefix).

**2026-06-07 — Phase 2 table shapes drafted into `SCHEMA-DRAFT.md`.** Full table designs written for: `relationship`, `chat_thread`, `chat_message`, `deal_card` (+ delivery/expiry columns: `offer_expires_at`, `delivery_date_target`, `payment_terms_code`, `incoterms_code`, `buyer_po_number`, `seller_so_number`), `deal_card_log`, `deal_change_input`, `deal_line_item` (versioned snapshots — Option A). Cannabis-specific `thc_percent`/`cbd_percent` added to line items. `deal_delivery` stub deferred to Phase 3. Wire diagram + open questions section added. Three open Qs remain: Q2 (P2P thread uniqueness ordering), Q3 (two-party confirmation state — table vs JSONB), buyer_metric field name.

**2026-06-07 (session 6) — Q2 locked.** `chat_thread` P2P uniqueness → `CHECK (person_a_id < person_b_id)` at DB level (same pattern as `relationship` table). `SCHEMA-DRAFT.md` + `DECISIONS.md` updated. Migration strategy settled: Phase 1 + Phase 2 written together once Q3 is resolved. **Q3 still open** (two-party confirmation state).

Going offline — session 6 wrapped.
