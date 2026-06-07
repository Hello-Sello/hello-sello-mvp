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
