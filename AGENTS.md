# Hello Sello — Project Context

This file is auto-loaded by Claude Code at every session start. It gives Claude the context to pick up where the team left off, without re-explaining everything.

**This is the shared team file.** Committed and co-owned by all engineers. Each engineer keeps their own personal `CLAUDE.md` locally — gitignored, never committed.

---

## What this project is

Hello Sello is an **AI-native deal room for B2B** — a shared chat space between seller (distributor) and buyer (pharmacy), with an AI agent named **Sella** that processes deal conversations end-to-end (extracts offers, drafts confirmations, surfaces product documents, mediates negotiation).

**Beachhead market:** German medical cannabis — 50 licensed wholesalers, ~2,500 dispensing pharmacies. Tightly bounded, regulated, named universe.

**Lead customer:** Canadian Craft (cannabis distributor) — launches fully on Hello Sello with 25 pharmacy partners. ~€150k GMV from month one.

**Stage:** design DONE. Build sprint active. Demo target: **June 11** (Canadian Craft, 25 pharmacies).

**Category claim:** not a CRM, not a marketplace, not an ERP. A **Superspace** — an intelligent layer above whatever ERP/email/fax systems each company already runs. The moat is **neutrality** — the platform serves both sides of every deal from one shared room.

---

## Product design - 5 layers + 7 surfaces

Two complementary views of the product:

**5 horizontal layers** - cross-cutting design across the whole product:

1. Users and Core Objects (`LAYER-1`)
2. Product Surfaces (`LAYER-2`)
3. Deal Execution (`LAYER-3`)
4. Sella Behavior (`LAYER-4`)
5. Inputs and Outputs (`LAYER-5`)

Files: `docs/product/layers/LAYER-*.md`

**7 vertical surfaces** - per-surface deep dives:

1. Connect (100% depth, built first)
2. Present (sketch)
3. Buy (sketch)
4. Sell (sketch)
5. Discover (sketch)
6. Grow (sketch)
7. Sella (cross-cutting AI agent - present in every surface, not a sibling surface)

Files: `docs/product/surfaces/<NAME>.md`. Build strategy locked in `docs/decisions/DECISIONS.md` "Build strategy" chapter.

---

## Where things live

| Need | Path |
|---|---|
| **Codebase reference (file structure, conventions, TDD)** | **`docs/architecture/CODEBASE.md`** |
| **Demo scope (6 blocks, in/out list, June 11)** | **`docs/architecture/connect-demo.md`** |
| Screen designs + interaction spec (prototypes are the spec) | `prototypes/` |
| Schema, tables, RLS | `supabase/` + `docs/architecture/SCHEMA-DRAFT.md` |
| Domain glossary (term definitions) | `docs/architecture/CONTEXT.md` |
| Why a decision was made | `docs/decisions/DECISIONS.md` |
| Product design layers (horizontal) | `docs/product/layers/LAYER-*.md` |
| Per-surface deep dives (vertical) | `docs/product/surfaces/<NAME>.md` |
| Investor + customer pitch | `docs/product/PITCH.md` |
| Engineering implications (running scratchpad) | `docs/architecture/ARCHITECTURE-NOTES.md` |
| ADRs (full writeups of load-bearing decisions) | `docs/architecture/adr/` |
| External research (GDPR, tools, market, technical) | `docs/research/` |
| How we work together (branching, sync ritual, hygiene) | `docs/team/WORKFLOW.md` |
| Team skill dictionary + protocols | `docs/team/SKILLS.md` |
| Live cross-agent sync state | `docs/team/sync/{muskan,ayush}.md` |
| App code structure (module boundaries, the one rule) | `src/README.md` |
| Meeting notes | `docs/meeting-notes/` |
| Personal session state | Each engineer's gitignored `CLAUDE.md` (at repo root) |

---

## Core rules

- **Research before recommending** — on any security fix, schema/RLS change, or design decision: web-search the current published guidance FIRST (Postgres/Supabase docs, the vendor's own linter rules, OWASP), state what best practice says with the source, and only then recommend. Never lead with your own reasoning. Never propose the smaller fix because it feels safer without first naming the correct one — Muskan decides the trade-off, you supply the researched options.
- **Doubts** via `/track-doubt` skill — never create Linear issues directly
- **Decisions** via propose-mode → preview the one-liner, ask, then write to `docs/decisions/DECISIONS.md`
- **Writes always preview first** — file edits, new files, Linear writes, anything external
- **Plain English** — preserve German verbatim where it appears in pitches
- **Linear** is our issue tracker (workspace `hellosello`, team `Development`)

---

## Git workflow

Three-tier: `main` ← `dev` (default branch for PRs) ← `claude/{name}/work` (personal).

Personal work PRs to `dev`; `dev` merges to `main` on a cadence. Run the sync ritual before any shared-file edit. Full protocol: `docs/team/WORKFLOW.md`.

---

## Agent skills

- **Issue tracker** — Linear via MCP. See `docs/agents/issue-tracker.md`.
- **Triage labels** — 5 canonical state labels. See `docs/agents/triage-labels.md`.
- **Domain docs** — Single-context. See `docs/agents/domain.md`.

---

## When building - context routing

If you're building and hit a doubt, go here:

| Doubt | Go to |
|---|---|
| How should this file be named / where does it live? | `docs/architecture/CODEBASE.md` |
| What's in scope for the demo? | `docs/architecture/connect-demo.md` |
| What should this screen look like / how should it behave? | `prototypes/` — the locked screens are the spec |
| What tables / fields exist? | `supabase/` + `docs/architecture/SCHEMA-DRAFT.md` |
| What does a term mean (P2P, Deal, Artifact, etc.)? | `docs/architecture/CONTEXT.md` |
| Why was this decision made? | `docs/decisions/DECISIONS.md` |
| How does this module talk to another module? | `src/README.md` (the one rule: only through `index.ts`) |
| What are the product rules for this flow? | `docs/product/layers/LAYER-*.md` + `docs/product/surfaces/<NAME>.md` |

---

## Session Checkpoint

*(Updated at end of every session by whoever worked last.)*

**2026-06-21 (latest) - Ayush (Phase 04 UI & chat COMPLETE: 04A Deal Strip + 04B Conversation list + 04C Card/Form UI touch all BUILT + gate-green; LOCAL on `claude/ayush/work`, UNPUSHED; cloud UNTOUCHED)**
- **⚠️ Theme change, app-wide:** the brand deep-pink `--color-brand-deep` `#76002d`→**`#7a1638` (Damson)** - calmer (the old 100%-sat maroon read too bright). `--glass-shadow` now **derives from that token** via `color-mix` (single source of truth), so the whole glass language re-tints with it. THC=deep-pink, CBD=periwinkle on the deal card/form (was off-theme purple/teal). All in `src/app/globals.css` + deal/messaging components.
- **The Deal Card now opens as a LEAFLET over the conversation rail** (panel 3) instead of floating in the chat thread - `DealPin` portals it into a `hs-deal-card-slot` in `ConversationList`; the rail widened `w-64`→`w-72`. The Deal Room (workspace) variant keeps the inline card. The card got a **slim shaded header** (replacing the tall `#76002d` band) + a one-tap-batch-rail Deal Form (no modal popup).
- **Scope:** `src/modules/deals/components/*` + `src/modules/messaging/components/{ChatView,ConversationList}.tsx` + `globals.css` + two banner gradients. **No migrations, no schema, no RLS.** Decision recorded in `DECISIONS.md` 2026-06-21. Applied directly (no GSD) per Ayush; gate-green; **human visual UAT still owed** (needs a minted deal). **Next = the Deal Room build.**

**2026-06-17 - Ayush (Phase 1 = 4.5.4 held two-sided deal change BUILT + verified + GSD-complete; on `claude/ayush/work` rebased onto dev + pushed; cloud UNTOUCHED)**
- **The held-change loop is real + green.** An edit is now a HELD pending change: the editor auto-accepts, the OTHER side must Accept (commit base+1, status stays `draft`) or Decline/Withdraw (discard), with a required change reason on every response → the deal log. e2e suite green (`npm test`, 8 passed) + 2 SQL invariant tests green.
- **5 new migrations, all deal-domain + additive (none of Muskan's catalogue/product schema or RLS):** `…120000_deal_pending_change` (table + one-active-row UNIQUE lock + member RLS + 4 audit codes), `…120100_propose_deal_change_rpc`, `…120200_confirm_deal_change_rpc`, `…20260617120000_confirm_deal_change_no_seal_write`, `…20260617130000_deal_pending_change_realtime`. **LOCAL only — NOT on cloud.** Cloud-apply checklist: `docs/deploy/cloud-migrations-pending.md`.
- **⚠️ Muskan: I removed the two-seat golden Seal control from the deal strip** (`DealPin` / `ConfirmBar` usage / `EditDealForm`) — accepting a *change* was leaking into the *seal* state (a false "Awaiting" pill + golden card). The golden Seal is now **deferred to the deal's final stage** (design TBD). The `ConfirmBar` component + the `confirmDeal` action remain (just not wired into the strip). If you reference the strip Seal anywhere, ping me. Decision: `DECISIONS.md` 2026-06-17.
- **Realtime:** `deal_pending_change` added to the `supabase_realtime` publication so held changes update live on both screens (it was missing → the other side only saw the change after a refresh).
- **All deal-module only** (`src/modules/deals/`, `supabase/migrations/`, `e2e/`) + `docs/deploy/`. Rebased onto your latest dev (PR #108 security work); nothing of yours touched. Phase 2 (announcements + gate cleanup) is next session.

**2026-06-16 - Ayush (4.5.4 deal-CHANGE flow DESIGN locked via a grill; no code yet)**
- **Held-change backbone (4.5.4) locked.** An edit becomes a **held two-sided proposal**, NOT an instant version bump (supersedes the 2026-06-11 instant `edit_deal_draft`): the live card is untouched until **both companies accept**; a decline or a proposer **withdraw** discards it. Full design: `_workshop/build-plans/6-pending-map.md` (§1, §2, §3A). Decision: `DECISIONS.md` 2026-06-16. **New ADR-0001.**
- **Pending change = the strip's data, on the deal** (`deal_pending_change`, one row per deal, DB-unique), read by BOTH the p2p strip and the deal-chat strip (synced). **Full lock** while pending. Three exits: other company **Accept/Decline** (+ required **Change reason**), proposer **Withdraw** (no reason). Per-company decisions; propose = deal-workspace membership.
- **Announcements: both chats, both outcomes** (supersedes the D18 split). Private numbers (buying price) NEVER enter the pending change (privacy - the strip syncs into the deal chat where both companies sit).
- **Glossary:** added **Pending change / Change proposed-detected / Change reason / Note (card) / Decision strip** to `CONTEXT.md`.
- **Parked:** final golden seal (end stage); per-product cost->margin + edit-form redesign (T5b); Sella-detects-changes (T6); C2C ticketing (T7/T8). **No code yet; nothing of Muskan's touched.**

**2026-06-14 - Ayush (4.5.2 the Sella strip BUILT + verified live; `propose_deal` applied to the cloud; committed, NOT pushed)**
- **4.5.2 DONE.** Rebuilt `DealPin` into the **Sella strip** (States A/B/C): **A** = "Start a deal" (p2p); **B** = a pending proposal → a loud **"Review"** pill → popover → **Accept/Decline** → `confirm_detected_deal` → **atomic birth** (a "Waiting for {other}" chip for the side that already voted); **C** = the deal selector + an `✦ AI` badge + a "thinking" animation. Verified live two-screen on BOTH doors (manual propose + Sella-detect).
- **New code (7 files, tsc/eslint clean) - ⚠️ nothing of Muskan's touched:** `getPendingProposal` read + `confirmDetectedDeal` action (deals); `CreateDealForm` → `proposeDeal` (+ a new `DealForm` `showPrivate` prop, default true, so create/edit are unchanged); `ThreadView` passes the p2p `threadId`; an **inline** realtime subscription in `DealPin` (its own channel) to keep `deals` independent of `messaging` (no module cycle).
- **⚠️ `propose_deal` APPLIED to the LIVE cloud DB** (additive - a new function nothing else calls; zero cron impact). The **`…120100_confirm_detected_deal_proposer_initiator` replace is STILL HELD** (it changes the function the live detect cron uses; backward-compatible, only affects offer/order labelling) - apply when we validate against the live cron.
- **Committed, NOT pushed** (Ayush: commit-only so next session opens on 4.5.3). **Next = 4.5.3** (card → pure display; move the Seal gate from `CardFront`'s `ConfirmBar` into the strip).

**2026-06-14 - Ayush (Waypoint 4.5 deal birth/acceptance DESIGNED + locked; 4.5.1 engine BUILT + HELD)**
- **Resolved the deal birth/acceptance tangle** (the blocker before 5A.4): the card is born too early and acceptance lived on the card → "accept your own deal", orphan workspaces, and Sella had nowhere to ask (the fence). Full design + reasoning: `_workshop/build-plans/4.5-deal-birth-acceptance.md` + DECISIONS 2026-06-14.
- **Model = one birth path, two doors.** Manual-create AND Sella-detect both write a **proposal** = a `deal_detected`-shaped chat message (no card, no new status). Manual = sender pre-voted `accept`; Sella = both null. Card + workspace born ONLY on both-accept, atomically via `confirm_detected_deal` → `create_deal_draft`. **Supersedes 3.5a D5** (workspace-at-draft → at-accept, no orphan).
- **Card becomes pure display; the Sella strip (the `DealPin` bar) owns birth-accept + the change-note + the Seal gate** (the `ConfirmBar` moves off the card). Strip = shared/neutral; right panel = private Sella.
- **4.5.1 (engine) BUILT, tsc/eslint clean, HELD — NOT applied to ANY DB.** 2 migrations (`…120000_propose_deal_rpc`, `…120100_confirm_detected_deal_proposer_initiator`) + a `proposeDeal` action. All migrations apply clean on a fresh DB; behaviour (propose→accept→birth) NOT yet tested. ⚠️ **Nothing of Muskan's touched** (deal/Sella-only); the `confirm_detected_deal` tweak is backward-compatible (detection falls back). The live cron is unchanged — cloud apply deliberately held until 4.5.2. **Next = 4.5.2 (strip UI).**
- **Separate finding: the repo can't rebuild a fresh LOCAL DB cleanly** — 5 pre-existing snags (demo-seed migrations need post-migration seed data; duplicate migration version `20260610170000`; the `::` folder name breaks Docker volume mounts; the pgmq/cron trigger; the GoTrue seed). None touch the feature or the cloud, but a new dev / CI can't stand up local. Worth its own cleanup task.

**2026-06-12 - Ayush (Chapter 4 / Sella COMPLETE: 4b steps 3-5 + 4d done + verified live; → dev this wrap-up)**
- **Chapter 4 (Sella) is DONE** - 4a/4b/4c/4d all built + verified live. Detection → both-confirm birth → 3d seal runs end to end; Sella also narrates card changes into every chat the card lives in.
- **4d (summaries):** on a card edit, Haiku writes the "why it changed" → `deal_card_log` (`changed_by='sella'`, Logs tab) AND a `deal_card_updated` message posted to BOTH the deal workspace chat AND the relationship's P2P chat (linked via `metadata.deal_card_id`) - the people stay aware wherever they are. Plus an AI-written first-contact intro (`sella-intro`, rewrites the static seeded intro on accept). Both run INLINE (person-waiting), fail-soft. **No migrations.**
- **⚠️ Nothing of Muskan's touched.** New Sella edge fns (`sella-summarize`, `sella-intro`) + 2 inline triggers (`editDeal`, `acceptItem`) + a `tsconfig` exclude of `supabase/functions/**` (Deno files out of the Next typecheck; `tsc` clean). The pgmq/cron detection trigger is live on the shared DB (since 4b).
- **→ dev this wrap-up:** this session = 4b/3-5 + 4d (the prior 4a/4c/4b-1-2 + 3.5 were already on dev). **Next = 5A (UI):** Sella chat UI, deal-card open mode, the typing `+` menu; folds in the per-side owner/side_lead DB enforcement (Parked) + a 5A renderer for the `deal_detected` / `deal_card_updated` message types.

**2026-06-12 (4b) - Ayush (Sella 4b COMPLETE: detection → birth; built + verified live; committed to branch, NOT dev)**
- **4b is DONE (steps 3/4/5), all verified live on thread `91b6f4b8`.** Chapter 4 now needs only **4d** (summaries). **4b/3:** Sella writes a `deal_detected` suggestion + a private `sella_detection` memory table (dedup / supersession / idempotency; GDPR — verbatim evidence only on `forming|firm`, DB-enforced). **4b/4:** the auto-trigger is LIVE — `pgmq` + `pg_cron` (10s) + `pg_net`, scoped to `p2p` threads; a person message now makes Sella detect on her own in ~10s; daily grammar pre-warm. **4b/5:** `confirm_detected_deal` RPC — both-accept births a **Draft** via the two-owner `create_deal_draft` (confirmer-as-initiator, both equal owners).
- **Journey LOCKED (DECISIONS 2026-06-12 Sella 4b): Sella only ever DRAFTS, never finalizes.** Detection → both confirm (Birth, Draft) → negotiate → both confirm 3d gate (Seal). Two stages = open vs close; the verdict never skips a stage. The AI fence holds — Sella suggests + pre-fills, a human click is the only write.
- **⚠️ LIVE on the shared DB now:** the queue + 10s cron + the 3 extensions (`pgmq`/`pg_cron`/`pg_net`) are enabled and active. Detection fires automatically on any new person message in a `p2p` thread. Demo data is clean (test thread back to 15 msgs, 5 deal cards intact). 3 new migrations (`…120000` table, `…130000` trigger, `…140000` confirm RPC) + `confirm_detected_deal`/`sella_detection` are deal/Sella-only — **nothing of Muskan's touched**.
- **Committed to `claude/ayush/work` (`9afa335`), NOT pushed.** Plan: finish **4d**, then the full sync ritual + wrap-up closes chapter 4 and pushes everything to dev.

**2026-06-12 (earlier) - Ayush (Sella 4a + 4c + 4b steps 1-2 BUILT + verified live; → dev this session)**
- **Phase 0 (chat real) = verified already-done** (since 2d, commit ac00a78; the "chat is mock" note was stale). **4a** provider layer (`bedrock.ts`: Bedrock structured outputs + retries + timeout) smoke-tested live - the untested **Sonnet 4.5 id works**. **4c** detect-deal contract (`tools.ts`: JSON schema + zod fail-soft + evidence grounding) smoke-tested. **4b step 1** the detection brain (`prompts.ts`/`context.ts`/`detect.ts` + the `sella-detect` edge fn) verified LIVE on the real Alice↔Bob thread (Haiku: `forming`, 5kg @ €3.80, grounded evidence). The Sella engine lives in `supabase/functions/_shared/sella/` (Deno - can't import `src/`; the placement rule's background branch).
- **⚠️ Muskan - one deal-RPC change (additive, backward-compatible, NOTHING of yours):** migration `20260612011145_two_owner_create_deal_draft.sql` adds a nullable `p_counterparty_person_id` to `create_deal_draft` + a second `owner` deal_member (validated to the other side). The existing 10-arg call still works (default null → one owner). Verified: 2 owners created, rolled back (demo clean). Not in `database.types.ts` (localized cast, your pattern).
- **Known issue captured (deferred to 5A):** per-side owner/side_lead DB enforcement isn't in place. Chosen fix: `company_id` on `deal_member` + partial unique indexes (owner-per-side, side_lead-per-side) + a deferred ≥1-owner trigger (this resolves the 3b "partial index can't reach person.company_id" note). Harmless today (one person/owner per company). Design in ARCHITECTURE-NOTES 2026-06-12.
- **Deployed live (not git):** `sella-detect` v1, `bedrock-smoke` v5. **Next: 4b step 3** (deal_detected message + dedup) → step 4 (pgmq+cron trigger; ⚠️ neither extension installed) → step 5 (Option B birth).

**2026-06-11 - Ayush (3.5 CLOSED; Phase plan reshaped - ⚠️ numbering note for Muskan)**
- **Section 3.5 is DONE / closed.** 3.5a (create) + 3.5b (edit) + 3.5c (re-confirm, free via the version bump) shipped on `claude/ayush/work`. **3.5d (card v2 UI) is PARKED - it does NOT happen as 3.5d.** No code shipped this session (a live UI prototype was reverted).
- **Why the reshape:** Sella (Section 4) is next and will reshape the chat + card UI. Styling now = styling twice. So we research Sella first, then do the UI in PARALLEL with the Sella build.
- **⚠️ Numbering (so we stay in sync):**
  - **Section 4 = Sella** - unchanged, your `DECISIONS.md` "4a-4d" still holds. New **4.0 = Sella research**, COMMON to both of us (each does their own research, then we compare + lock). See `_workshop/build-plans/4.0-sella-research.md`.
  - **Section 5 = UI pass (5A)** - the old 3.5d grew, so the whole UI job moves to a fresh Section 5 to avoid clashing with your Sella 4a-4d. Scope: deal card (open mode + layout), chat heading, the message typing bar (expand / formatting / a `+` menu whose first item is "Create a deal"), the left chat/relationship nav minimised to icon buttons, and the Sella chat UI. See `_workshop/build-plans/5a-ui-pass.md`.
- **Both 4 (Sella build) and 5A (UI) are OPEN / unassigned** - we pick them up ourselves. 4.0 research is the shared first step before either starts.
- No schema, no shared-file code changes this session. The 3.5a/b work is still held on `claude/ayush/work`, NOT dev.

**2026-06-11 (later) - Ayush (Deal 3.5a Create + 3.5b Edit - BUILT + verified live; held in `claude/ayush/work`, NOT dev)**
- **3.5a (create) + 3.5b (edit) DONE, verified live as Aurora/Alice, `tsc`+eslint clean, no console errors.** The deal card now has a real WRITE side: you can **create** a draft from a chat and **edit** it into a new version. Kept on my branch (Ayush: not pushed to dev this session).
- **3.5a:** a "Create a deal" entry in a chat's blank deal area opens a light/glass/raspberry form (the shared `DealForm`). Create runs the `createDeal` action → the **`create_deal_draft` SECURITY DEFINER RPC**, which births the whole deal in ONE transaction (card draft v1 + lines + the creator's private box + workspace + owner + deal thread + opening line + log line + optional note + `deal.created` audit). Recipient auto = the chat counterparty; prices optional ("Price TBD"); the creator makes an OFFER from their OWN catalogue (RLS-safe). *(Why an RPC: the workspace/member/thread inserts have a bootstrap chicken-and-egg under RLS, and a multi-row write must be atomic - a definer RPC solves both. Same pattern as your `import_products`.)*
- **3.5b:** an **Edit** button on the card opens the same form, prefilled, with a **MANDATORY note** (Update is disabled until a note is typed). `editDeal` → the **`edit_deal_draft` RPC** bumps the version, snapshots the new lines (old version frozen), carries the private boxes forward, drops the card back to `draft`, and writes the log + note + `deal.amended` audit. **The version bump resets 3d's gate for free** (confirmations are per-version) - so **3.5c (re-confirm) is already satisfied**.
- **Guardrail (load-bearing): Sella can NEVER commit a deal change on its own.** Every create/edit is committed by a human pressing a button that calls a server action - Sella may FILL the form later (4a-4d) but the human's click is the only write path. The form is "dumb + fed" so Sella plugs in without a rewrite.
- **→ Muskan (your catalogue domain - additive only):** one seed migration `…140000_3p5a_create_seed.sql` adds the `deal.created` audit code + seeds Aurora's 4 blueprint products into her existing "Standard" pricelist (the seller had only 1 product, so the create picker was empty). Idempotent, additive - **no `product`/`pricelist` schema or RLS change**. The two new RPCs (`create_deal_draft`, `edit_deal_draft`) are deal-only and not yet in `database.types.ts` (localized cast used, your documented pattern) - they appear on your next regen-from-live, no conflict.
- **Next = 3.5d (card v2 UI):** rearrange the card + the full-screen "blank + only the card" open mode. Create/edit exist now, so every field is known - the restyle is done once.

**2026-06-11 - Ayush (Connect 3c Stage pipeline + Things, 3d Confirmation gate - BUILT + verified both sides; merged to dev #97)**
- **3c + 3d both DONE, verified live Bob+Alice, `tsc`+eslint clean, no console errors.** The deal workspace now has a stage bar, a real per-stage Things checklist, and the two-sided confirm gate that turns the card golden.
- **3c:** a **screen-only** 5-stage bar (click to navigate; NOT saved - stages become custom later, so no DB plumbing built) + the **Things tab is real** (tick toggles `thing.status`, and **"+ Add a thing"** creates a `task` - both live DB writes via RLS `thing_all`). One seed migration (`…190000_seed_demo_things.sql`, 12 Things across the 5 stages). Things group **by stage**. *Design note:* the old "by domain" idea + the prototype's "stages are NOT a UI element" are superseded - decided with Ayush.
- **3d:** the **two-sided confirmation gate**. A reusable `ConfirmBar` at the **top** of the card (both seats + Confirm/Decline/Withdraw); a **server action** `confirmDeal` derives your company from the session (you can only confirm your own side), upserts your `deal_confirmation` row, and when **both** sides are in flips `deal_card.status` `draft`→`confirmed`, writes the log line, and audits. The whole card turns **golden** + the header lifecycle pill flips to Confirmed **live** (via a `hs:deal-updated` window event - the pill loads the card separately from the in-chat dialog). 2 migrations: `…120000_audit_actions_deal_confirm.sql` (4 new `deal.*` action codes) + `…123000_seed_demo_deal_draft.sql` (reset demo card to Draft).
- **→ Muskan (no schema of yours touched):** all changes are in `modules/deals/` + 3 deal-scoped migrations (Things seed, audit action codes, demo-card reset). **No catalog/product/RLS changes.** First real `writeAudit` callers in the app - **the correct actor_type code is `user`** (not `person`; the lookup has no `person`). `audit_log` is **append-only** (trigger blocks DELETE) - by design.
- **Reusability for 3.5:** `ConfirmBar` is dumb + fed (seats + handlers, no `deal_confirmation` knowledge) so the **3.5 v2** per-change confirm reuses it. **Next = 3.5 (deal create/edit, "card v2"):** the card WRITE side, the full-screen open mode, card rearrangement, and the per-change confirm - all bundled so the card UI is touched once more, not piecemeal.

**2026-06-10 - Ayush (Connect 3a Deal card + 3b Deal Workspace - SHIPPED to production)**
- **3a (deal card, READ side) + 3b (Deal Workspace, screen ④) both DONE + merged** (3b: [#93](https://github.com/HelloSello/hello-sello-mvp/pull/93)→dev, [#94](https://github.com/HelloSello/hello-sello-mvp/pull/94)→main). Connect is now real end to end: inbox → chat → realtime → relationship → **deal card → deal workspace**.
- **3a:** the deal card lives in the chat (`modules/deals/`): front (facts + role-private Margin/metric via the `deal_party_field` table, RLS-scoped) + back (Signals seeded · Logs real). PO/SO derived; gross computed; versions = `deal_card_log`.
- **3b:** the deal CONTAINER, born with a deal. Route `/connect/deal/[dealCardId]` (composition root - deals owns the container, messaging owns the chat, composed at the route so the modules stay ACYCLIC). Header band + **real People tab** + deal chat hero (new `DealChat`, reuses the messaging spine + the card pill). **Three doors:** the Chat list's new **Deals tab**, the chat card-bar **"Deal workspace ↗"**, and the relationship-page **"Open workspace"**.
- **→ Muskan (schema):** I altered ONE of your foundation tables - **dropped `deal_workspace.owner_person_id`** + index `uq_deal_member_one_owner`. Ownership is now a **role** (`deal_member.role='owner'`, your `deal_member_role` lookup guards it): a deal has **two owners, one per company side**, which a single not-null column couldn't model. Safe drop (both tables were empty; no code/RLS used the column). `chat_thread type='deal'` is now live-used. The Chat list gained a `deals` filter (deal threads excluded from All/Unread/Companies).
- **Verified both sides live** (Bob then Alice): "(you)" follows login, message sides mirror, both write through RLS. Next: **3c** (stage pipeline + Things).

**2026-06-10 - Ayush (Connect 2e - Relationship page BUILT + verified both sides; PR'd to dev)**
- **2e DONE (all 8 phases), real + verified live both sides, zero console errors, `tsc` + eslint clean.** The company↔company record, reached from the chat header ("My Relationship with {company}"). **One page, two doors:** the P2P and C2C thread of a pair open the *same* record (proven - both threads carry the same `relationship_id`). New module `src/modules/relationship/` + route `app/connect/relationship/[relationshipId]`.
- **Shape:** top band (two-logo **bridge mark** + Sella-insight box + Analytics box) + tabbed record (Overview · Deals · Notes · Terms · Docs) + two blurred-backdrop dialogs (Sella insight; full analytics = KPIs + bar charts + share pie). Real RLS-scoped reads, viewer side from session.
- **Live writes:** team/personal **notes** (private per side) + **artifact upload** (new `relationship-artifacts` bucket, magic-byte validated, signed-URL download; **virus scan stubbed clean** - real scanner deferred).
- **Privacy proven both sides (FR-C6):** as Bob, Alice's notes are hidden; deals/terms/artifacts/analytics are relationship-SHARED. Shared-vs-private is decided entirely by Muskan's existing table RLS - **Ayush wrote no public-schema RLS**, only the new storage-bucket policies.
- **→ Muskan:** 2 new migrations applied to live - (1) `…010000_relationship_artifact_storage.sql` **ADDS** a private bucket + its `storage.objects` policies (relationship-membership-scoped); touches **none** of your public-schema RLS. (2) `…020000_seed_relationship_demo.sql` = demo-world seed (4 historical deals + 4 terms on Alice↔Bob, tag `metadata.seed='demo-world'`, idempotent, **reused by 3a**). Also: the top-bar "Aurora Deutschland" placeholder (`TopBar.tsx`) is left for you to wire to the real logged-in company.
- Rebased onto your Present #75 cleanly. Next: **3a (deal card)** - the live Sella-drafts-a-deal moment sits on top of the seeded history.

**2026-06-08 - Ayush (Connect 2b + 2c BUILT + verified; C2C-as-ticket direction decided + parked)**
- **2b + 2c DONE (accept → chat), mock-first, verified live, zero console errors.** `/connect/chat` is live: conversation list (All / Unread / Companies) + thread view (centered system + centered Sella + person bubbles) + composer + a Sella rail (panel 5, with an "Ask Sella" input). Accepting an inbox request fires the rollout: C2C always + P2P for the 3 substantive types, seeded by a Sella intro. `modules/messaging` is mine (built): schema-shaped types bound to `chat_thread`/`chat_message`/`relationship` Rows; `mock/store.ts` is the only throwaway (swap-to-real = body rewrite behind `index.ts`).
- **New decision (DECISIONS.md 2026-06-08): C2C = a ticket channel, not a free chat.** P2P = people talk; Deal chat = deal thread; C2C = reach-a-company + record. A C2C message → a ticket in the **same Inbox** (different view) → claimed → opens/reuses a P2P (Sella drops a system line) → outcome posted back to C2C. **Parked, NOT building now** — the demo keeps the current C2C chat as-is; the ticket slice comes after the core path. 4 open problems recorded in DECISIONS.md.
- **→ Muskan:** nothing owed by you — this is all my half. The future C2C-ticket build will **reuse your Inbox machinery (2a) + the P2P thread model**, no new foundation needed. Flagging in case it touches anything on your side later.
- Next: **2d (realtime feel)** → 2e (relationship page + the "My Relationship with…" chat top bar).

**2026-06-07 - Ayush (Connect 2a - inbox BUILT + verified, UI-first / mock)**
- **Inbox live at `/connect/inbox`:** Connect sub-nav (panel 2; Inbox active, Chat + Relationships greyed) + lens tabs (Unassigned / Mine / All / History, live counts) + list + state-driven detail. Claim / Accept / Reassign work over async mock data. Verified live, zero console errors; typecheck + eslint clean.
- **Implements existing locked decisions** (DEV-7 + 2026-05-20 ticket model): claim = first-come; **no forceful take-over**; head admin can (re)assign; refinement - the current owner can also reassign. No new DECISIONS lock needed.
- **Mock-first, schema-shaped:** `modules/connect/types.ts` binds to your generated `pending_inbox_item` Row (can't drift); `mock/inbox.mock.ts` is the only throwaway. Swap to real = rewrite `getInbox` + mutators behind `index.ts` (already async). Arch notes added (Connect 2a section).
- 2a merged to dev (PR #62). Next: **2b (Accept side-effects) - unblocked.**
- **Correction to my earlier note:** there is **no messaging-contract dependency on you.** Per BUILD-PLAN line 110 the re-cut gives me the whole demo incl. chat/messaging, so `modules/messaging` is mine to build. **Your Foundation (F1-F5) is fully delivered - nothing of mine is blocked on you.**
- **-> Muskan:** saw your 1b on your branch (AppShell -> client + BARE_ROUTES + session proxy) - not in dev yet; when it merges my Connect routes still get the full frame, all good. (Parked for the Sella phase: your Supabase edge-functions finding for agent DB access - we'll weigh tool-call vs edge-function then.)

**2026-06-07 - Ayush (Task 1A — app shell BUILT, UI-first)**
- **App is stood up:** Next.js 16 + React 19 + Tailwind v4 + lucide-react, in the locked modular-monolith `src/`. Glass app shell live: light rail (Hello Sello `//` logo, 7 surfaces, user-photo slot) + search top bar + active-route highlight; stub page per surface, `/` → `/connect`. Verified live, zero console errors.
- **Design language locked:** pink/white glassmorphic. Palette in `globals.css` `@theme` (raspberry #E30B5D, cotton-candy #FFB7D5, red-pink #76002D, ink #1F2020, success #34B233, periwinkle #6C7BD9, danger #DC2626). Light-only; dark deferred post-demo.
- **Consumed your foundation cleanly** — rebased onto dev; `src/types/database.types.ts` + `supabase/` came in no-conflict. Noted the interface changes (`deal_line_item_private`, `product_cost`).
- **→ Muskan, before I wire data:** I still need **F5** (`shared/db` / `shared/auth` / `audit_log` helper) + the **messaging `index.ts`** contract (the Sella/Deal seam). 1a was pure UI so it didn't need them — Connect 2a/2c UI is next and also mock-first.
- 1a on `claude/ayush/work` (`bf776a5`); PR → dev pending.

**2026-06-07 - Muskan (session 12 — Foundation BUILT: F1–F4 applied + RLS)**
- **F1–F4 are live on Supabase:** 71 tables, RLS on every table (multi-tenant isolation, **isolation-tested** — `supabase/tests/rls_isolation_test.sql`), auth→person trigger, dev seed (Alice/GreenLeaf cultivator + Bob/StonePharm pharmacy, pw `password123`). TS types → `src/types/database.types.ts` (build against these).
- **⚠️ Ayush — interface change you consume:** `deal_line_item` no longer has `seller_margin`/`buyer_metric` (moved to `deal_line_item_private`); `product.cogs` → `product_cost`. Per-side, RLS-hidden from the counterparty — read the sibling for *your own side's* number.
- RLS = 10 `SECURITY DEFINER` chain-following helpers; deal thread + things + artifacts follow `deal_workspace.visibility` in lockstep (private = members only).
- **F5 still owed** (`shared/db`, `shared/auth`, `audit_log` write helper) — that's the foundation Ayush consumes (auth / db / RLS / schema), per the re-cut below. Ayush can build Connect + Deal + Sella against the live tables + types now.
- Full detail: DECISIONS.md + ARCHITECTURE-NOTES.md session 12.

**2026-06-07 - Ayush (Build plan - re-cut: Connect + Sella to one owner)**
- `docs/PRD/BUILD-PLAN.md` updated. **Split:** **Ayush** = the whole demo (app shell + Connect 2a-2e + Deal 3a-3d + Sella 4a-4d); **Muskan** = Foundation (F1-F5) → Onboarding/Home → **Present + Discover (design + schema + build)**.
- **No bidirectional seam:** Sella reads the DB via tool calls, so it stays inside Connect with Ayush; the only interface is **Muskan's foundation → Ayush consumes** (auth / db / RLS / schema). Lock the foundation shapes in Phase 0.
- **Sella is a leaf, built last → Muskan's backstop** if she finishes her track or Ayush is underwater near the deadline.
- Long-poles: **F2 (RLS)** on Muskan; **2c (chat), 3a (deal card), 4c (Sella draft)** on Ayush.
- Only Foundation (F1-F5) is June-11-critical on Muskan's side; onboarding/home are demo-seeded, Present/Discover are build-ahead (not in this demo).
- PRD: relationship page is MVP + on the demo walk (step 3b, FR-C6). (Linear: parked for the post-demo team cleanup, per Ayush.)

**2026-06-07 - Muskan (session 9 — Phase 2 schema review vs the PRD)**
- Reviewed all 15 Phase 2 tables against the PRD (now source of truth) before migrations. Net change: tiny — one column swap + two stale-note fixes. Session-7/8 tables held up.
- **Answered your two PRD action items:** (1) `deal_stage` seeds locked to your 5-stage template (`negotiation`/`compliance_quality`/`agreement`/`payment`/`fulfilment_delivery`); **dropped `domain`** — `thing` now groups by `stage` (NOT NULL), matching the PRD. **Stages = visible UI** (your prototype's "by domain" was a name-mismatch; PRD wins). (2) **O6 → workspace + deal chat born at Draft** (negotiation lives in the deal chat pre-confirm); fixed the stale `deal_card.thread_id` "at confirm" note.
- **DEV-37 was misread in session 8** — it's *chat-organization* ("organized chat windows for multiple deals"), NOT multi-deal-per-workspace. **Workspace↔deal is a permanent 1:1.** Corrected in SCHEMA-DRAFT + DECISIONS + ARCHITECTURE-NOTES.
- **Audit = log everything from day one** (full verb vocab seeded up front; every business write → `audit_log`). Deal visibility (chat + things + docs) moves in lockstep with the one `workspace_visibility` flag.
- **Phase 2 is now final** except two known-deferred items: `buyer_metric` rename (placeholder ships) + `pricelist`/`product` column list (your blueprint CSVs are in `docs/product/blueprint/` — next schema session). Then write Phase 1 + Phase 2 migrations.
- Full detail: DECISIONS.md 2026-06-07 session 9 + SCHEMA-DRAFT.md.

**2026-06-07 - Ayush (Connect-demo PRD)**
- New `docs/PRD/` folder: `connect-demo.md` (overview + 9-step acceptance script), `foundation.md` (Identity / Connections / Audit), `deal-flow.md` (Messaging / Deal Workspace / Sella).
- Deal model locked across 3 layers: **status** `Draft → Confirmed` (demo stops here; `done` = Phase 3) · **stage** = 5-stage cannabis pipeline · **things** = per-stage checklist.
- **→ Muskan: your `deal_stage` seeds (TBD, DEV-24/34) = this 5-stage template.** Seeds (researched, German/EU medical-cannabis journey): `negotiation`, `compliance_quality`, `agreement`, `payment`, `fulfilment_delivery` (sort_order 1-5). Demo builds/walks 1-3; 4-5 greyed (Phase 3). Status flips Draft→Confirmed at stage 3 (`agreement`).
- **? Needs your call (O6): is `deal_workspace` born at Draft or at Confirmation?** The PRD needs it at **Draft** - the two sides negotiate inside the deal chat *before* they confirm (this resolved O2). Your session-8 `deal_workspace` table didn't pin the birth trigger; the old `deal_card.thread_id` note said "at confirm".
- Demo scope: manual stage advance + read-only Things checklist over your `thing` table. Auto-advance-when-Things-done engine + user-created stages/Things deferred post-demo.

**2026-06-07 - Ayush (GitHub sync + docs wrap)**
- All PRs merged to dev: #39, #40, #41, #42. Dev is clean. Branch: 0/0.
- `gh` now authenticated (ayush1330) - PR management works from Claude Code.
- AGENTS.md restructured: builder context routing table added (above), Session Checkpoint added.
- README.md updated: statuses fixed, stage = build sprint.
- No production code yet - `src/` empty, `supabase/migrations/` not applied.
- **Muskan:** session 8 active - writing screen ④ tables. Files locked: SCHEMA-DRAFT, DECISIONS, ARCHITECTURE-NOTES.
- **Ayush:** offline. Next = write PRD (June 11, 6 blocks from `connect-demo.md`) → divide build tracks.

---

## Quick orientation for a fresh session

1. Hello Sello = B2B AI deal room (German medical cannabis beachhead)
2. Read your personal `CLAUDE.md` for current focus / what's next
3. Check Session Checkpoint above for current build state
4. Cross-agent state in `docs/team/sync/` — check before editing any shared file
5. Linear (workspace `hellosello`) for your assigned issues
