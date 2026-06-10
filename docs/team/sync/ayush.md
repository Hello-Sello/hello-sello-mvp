# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-10 11:56 CEST
**Branch:** claude/ayush/work
**Status:** building **3a (deal card)** - Phase 0-5 DONE (card lives in the chat now: "Talking about" bar + floats right; front/back/flip/privacy all proven). Building Phase 6 (manual draft write). Phase 0+1 merged to dev (#79); **2-8 then ONE merge at the end.** **No locks.**
**Linear issue in progress:** none
**Shared files locked:** none - demo log seed (`20260610160000`, 2 `deal_card_log` rows on card `04695a2d`) applied. No schema/RLS change.
**PR open:** none - [#79](https://github.com/HelloSello/hello-sello-mvp/pull/79) (3a Phase 0+1) **merged to dev**. Pull `dev` to get the `deals/` module + `deal_party_field` table. ([#76](https://github.com/HelloSello/hello-sello-mvp/pull/76)/[#77](https://github.com/HelloSello/hello-sello-mvp/pull/77) earlier.)

---

## Notes for the other agent

**2026-06-10 (Task 3a - Deal card, Phase 1 DONE; ⚠️ NEW table `deal_party_field` - additive, applied to live).** Added ONE new table `public.deal_party_field` (migration `20260610130000`) to give role-scoped private fields (seller Margin + buyer placeholder, more later from Sell/Buy pages) a home - the schema had none. **One row per (card, version, side, field), RLS `owner_company_id = current_company_id()`** - same privacy spine as `relationship_note`; the other side's app never receives the row. **ADDITIVE only:** new table + its own policy + unique key + index + a demo seed; **touches none of your existing tables or RLS.** Isolated (only FKs to `deal_card` + `company`), so droppable later with zero blast radius if Sell/Buy design changes it. **Privacy proven in SQL** (JWT impersonation): Alice sees only her Margin, Bob sees only his placeholder. Regenerated `database.types.ts`. (PO/SO label is derived, gross is computed, version history reads your `deal_card_log` - no other schema changes in 3a.)

**2026-06-10 (Task 2e - Relationship page (screen ③) DONE; ⚠️ I added a STORAGE bucket + storage RLS - please read).** The full relationship page is real + verified both sides (reached from the chat header "My Relationship with {company}"; one page, two doors). Top band (bridge-mark header + Sella/Analytics boxes → dialogs) + tabs (Overview · Deals · Notes · Terms · Docs). Real reads/writes, RLS-scoped, viewer side from session.
> **I wrote NO public-schema RLS** - your existing `relationship_note` / `relationship_term` / `relationship_artifact` / `deal_card` policies already do the side-aware projection (notes = per-company private; terms/artifacts/deals = relationship-shared). Verified live: Bob can't see Alice's notes; both see deals/terms/artifacts.
> **2 new migrations (applied to live):**
> 1. `20260610010000_relationship_artifact_storage.sql` - **NEW private bucket `relationship-artifacts`** + its `storage.objects` policies, scoped to `is_relationship_member((foldername)[1]::uuid)` (files namespaced `<relationship_id>/...` so BOTH sides reach the shared folder). **ADDS a bucket + storage policies only - touches none of your public-schema RLS.** Mirrors your `company-licenses` pattern, swapping own-company-folder for relationship membership. Artifact upload is real (magic-byte validated, signed-URL download); **virus scan is STUBBED `clean`** - real scanner deferred.
> 2. `20260610020000_seed_relationship_demo.sql` - **demo-world seed** on Alice↔Bob (`5e64f146`): 4 historical `deal_card`s + 4 accepted `relationship_term`s, tagged `metadata.seed='demo-world'`, idempotent. **Reused by 3a** (the live Sella-drafts-a-deal moment sits on top of this past history). No threads (deal page reads cards directly).
> **PR'ing to dev now.** Rebased onto your Present #75 cleanly - no conflicts (my work = new `modules/relationship/` + light `modules/messaging` edits; didn't touch `company`/`product`/`pricelist_item`/AppShell). Thanks for the AppShell-client + sign-out heads-up.
> **One for you:** the top bar still shows the hardcoded "Aurora Deutschland GmbH" placeholder for every user (`src/shared/ui/TopBar.tsx`) - Ayush says that's yours to wire to the real logged-in company. Left it untouched.

**2026-06-09 (Task 2d - Connect backend went REAL + realtime; ⚠️ I touched your RLS - please read).** The whole Connect experience now runs on Supabase (mock deleted) with live realtime. Verified end to end (inbox, chat, accept→chat, send-persists, Bob→Alice live, optimistic send, unread, privacy). **4 new migrations - 3 are in your foundation/RLS area:**
> 1. `20260609180000_seed_demo_world.sql` - **3 new dummy logins** (Clara/David/Eva, all `password123`) + 3 companies + 2 connected relationships (C2C+P2P+messages) + 2 pending inbox items. Tagged `metadata.seed='demo-2d'`. Created via the `auth.users` + `auth.identities` + your `handle_new_user` trigger pattern.
> 2. `20260609183000_rls_connect_counterparty_visibility.sql` - **broadened `company_select` + `person_select`** so a user can read the NAME of a company/person they have a relationship or pending-inbox link with (WhatsApp-style). The base policies only allowed your own company/people, so every inbound request showed "Unknown company". Strangers still see nothing (isolation verified). Added 2 SECURITY DEFINER helpers: `shares_connection_with_company`, `can_see_person`.
> 3. `20260609193000_rls_thread_select_inline.sql` - **rewrote `thread_all` SELECT (USING)** to check the row's own columns directly instead of `can_access_thread(id)`. That helper re-queries chat_thread for the row's own id, which fails during `INSERT…RETURNING` (the new row isn't in its STABLE snapshot) → normal users couldn't create a chat (42501). `can_access_thread` is unchanged + still used by `chat_message` (WITH CHECK unchanged too).
> 4. `20260609194500_realtime_chat_publication.sql` - added `chat_message` + `chat_thread` to `supabase_realtime`. Postgres Changes respects the SELECT RLS, so realtime privacy = read privacy (no new policy).
> **MERGED to dev via [#71](https://github.com/HelloSello/hello-sello-mvp/pull/71)** (rebased onto your #70 cleanly). Shout if any RLS change worries you (I kept them minimal + isolation-preserving). Demo logins: Alice / Bob / Clara / David / Eva, all `password123`. Two-screen realtime demo = Alice + Bob.

**2026-06-08 (Task 2b + 2c BUILT + verified; C2C-as-ticket decided + parked).** `/connect/chat` is live (mock-first): conversation list (All / Unread / Companies) + thread view + composer + a Sella rail (panel 5, with an "Ask Sella" input). Accept in the inbox fires the rollout: C2C always; P2P for the 3 substantive types, seeded by a Sella intro. `modules/messaging` is built (mine) - `mock/store.ts` is the only throwaway (swap-to-real = body rewrite behind `index.ts`). Committed + pushed to `claude/ayush/work`; not PR'd to dev yet.
> **C2C = ticket channel (new decision - DECISIONS.md 2026-06-08) - PARKED.** P2P = people talk; C2C = reach-a-company + the record; a C2C message becomes a ticket in **your Inbox machinery (2a)** → claimed → opens/reuses a P2P (Sella drops a system line) → outcome posted back to C2C. **Not building now** - the demo keeps the current C2C chat. The future build reuses your Inbox + the P2P model, so **no new foundation owed by you**. 4 open problems recorded in DECISIONS.md + the AGENTS Session Checkpoint.
> **Touched shared files** this session (DECISIONS.md + AGENTS.md) - you had no locks; committed + pushed. FYI in case you rebase.

**2026-06-07 (Task 2a - Connect inbox BUILT + verified, UI-first / mock).** `/connect/inbox` is live: Connect sub-nav (panel 2) + lens tabs (Unassigned / Mine / All / History, live counts) + list + state-driven detail; Claim / Accept / Reassign over async mock data. §2 model enforced (claim first-come, no force take-over, owner or head-admin reassign) - matches your DEV-7 + 2026-05-20 ticket locks, so no new decision. Mock-first: `modules/connect/types.ts` binds to your `pending_inbox_item` Row; `mock/inbox.mock.ts` is the only throwaway - swap-to-real = rewrite `getInbox` + mutators behind `index.ts` (already async). Committed `3eb5474`, pushed; PR -> dev pending. Flipped my BUILD-PLAN 2a row -> 🧪.
> **Saw + thank you for 1b** (on your branch, not in dev yet): AppShell -> client + BARE_ROUTES (/login, /signup) + the session proxy. When it merges, my Connect routes still get the full frame - no conflict expected (I only ever read AppShell).
> **Correction (so there's no confusion):** I had earlier said I needed a messaging `index.ts` contract from you - that's stale. Per the re-cut (BUILD-PLAN line 110) I own the whole demo incl. chat/messaging, so `modules/messaging` is **mine to build** - no contract owed by you. F1-F5 all delivered; I'm not blocked on you. Starting 2b now.
> **Parked for the Sella phase:** noted your Supabase **edge-functions** finding for agent DB access (vs the tool-call assumption in BUILD-PLAN line 110). Unresolved - let's weigh it when we get to Sella (4a-4d).

**2026-06-07 (Task 1A — app shell BUILT).** Stood up the Next.js app (16 + React 19 + Tailwind v4 + lucide) in the locked `src/`. Glass app shell: light rail (Hello Sello `//` logo + 7 surfaces + user-photo slot) + search top bar; stub per surface; `/` → `/connect`. **Rebased onto your dev foundation cleanly** — your `database.types.ts` + `supabase/` came in no-conflict. Thank you for F1-F4 + RLS. Two asks before I wire data on Connect/Deal: **F5** (`shared/db` / `shared/auth` / `audit_log` helper) + the **messaging `index.ts`** contract (the Sella/Deal seam). 1a was pure UI so it's done + unblocked. Next: Connect 2a inbox → 2c chat.
> **Merged (19:18 CEST):** PR #56 → dev, PR #57 → main. **Design system now locked in DECISIONS.md + ARCHITECTURE-NOTES.md** (pink/white glassmorphic palette, 7 surfaces, wordmark, `globals.css` `@theme` tokens) — please build Present/Discover against those so the surfaces match. Saw you pushed Discover work (951cc77) while I released — you'll want to rebase onto the new dev.

**2026-06-07 (Build plan session) — `docs/PRD/BUILD-PLAN.md` + division of work.** Synced with your session 9 (thank you - O6 + stages + DEV-37 all resolved to the PRD; we're aligned). Then wrote the build plan:

- **Re-cut (final):** **I take the whole demo** - app shell + Connect (inbox / chat / realtime / relationship) + Deal + Sella. Sella reads the DB via tool calls, so it stays inside Connect with me - no cross-team seam. **You take** Foundation (F1-F5) → Onboarding/Home → **Present + Discover (design + schema + build)** - those are sketch-depth with no schema yet, so design+schema first.
- **The only interface:** your foundation → I consume it (auth / db / RLS / schema), one-way. Lock the foundation shapes in Phase 0 and I build the whole demo on top. Only Foundation is June-11-critical on your side.
- **Sella backstop:** Sella is a leaf, built last. If you finish your track or I'm underwater on Sella near June 11, I'll grab you for Sella - the one place you can jump into my half late without disrupting anything.
- Long-poles: **F2 (RLS)** on you; **2c (chat), 3a (deal card), 4c (Sella draft)** on me.
- PRD changes shipped with the plan: relationship page → MVP + on the demo walk (step 3b, FR-C6).
- **Linear:** parked for a post-demo team cleanup day (Ayush's call - ticket churn isn't worth it pre-demo). I'd already posted 5 "superseded by PRD" pointer-comments on DEV-24/31/34/9/47; left them as-is (they help, don't hurt).

**2026-06-07 (Connect-demo PRD session) — new `docs/PRD/` folder + two things that touch your schema work.**

The PRD (3 files: `connect-demo.md`, `foundation.md`, `deal-flow.md`) rides directly on the tables you locked in schema session 8 (`deal_workspace`, `deal_member`, `thing`, `deal_artifact`, `deal_stage`). Two action items for you:

1. **`deal_stage` seeds — I filled your TBD (DEV-24/34).** Researched 5-stage cannabis-B2B pipeline: `negotiation`, `compliance_quality`, `agreement`, `payment`, `fulfilment_delivery` (sort_order 1-5). The deal's status flips `Draft → Confirmed` at stage 3 (`agreement`); stages 4-5 are post-Confirmed (Phase 3). Full rationale + Things mapping in `docs/PRD/deal-flow.md` Block 4. These are a *proposal* for your lookup — adjust naming if the schema convention wants different codes.

2. **⚠️ Open question (O6) — when is `deal_workspace` born?** The PRD needs it born **at Draft** (the two sides negotiate inside the deal chat *before* they confirm — that's the whole demo flow, steps 5-7). Your session-8 `deal_workspace` table didn't state the birth trigger, and the old `deal_card.thread_id` note said "set when both confirm". If the workspace only exists at confirmation, the negotiation has nowhere to live. Need your call: move the trigger to Draft, or the demo negotiates in the c2c/p2p chat instead. Logged as O6 in `connect-demo.md` §9.

Also synced both into **AGENTS.md Session Checkpoint** (the shared channel) so it's not buried here.

---

**2026-06-07 (GitHub sync + docs session) — AGENTS.md restructured.** Two things you need to know:

1. **AGENTS.md now has a "When building - context routing" table** (8 rows mapping builder doubts to the right file). This replaces the old general orientation. Read it before your next build session - it tells Claude exactly where to look for any doubt during construction.

2. **AGENTS.md now has a Session Checkpoint section** (just above "Quick orientation"). Both agents should update it at session end. I've written the current state there.

**README.md also updated:** layer statuses corrected (all LOCKED), stage line updated to "build sprint active", "How we work" section updated for build mode.

**`gh` is now authenticated** (ayush1330, keyring) with `repo` + `read:org` + `workflow` scopes. PR management works from Claude Code now.

**My next session:** write the PRD (June 11 Connect-demo MVP, 6 blocks from `connect-demo.md`), then divide build tracks with you.
