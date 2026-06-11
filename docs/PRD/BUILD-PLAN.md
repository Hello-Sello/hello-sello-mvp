# Connect Demo - Build Plan & Division of Work

**Status:** Locked. The June 11 build, split between the two of us.
**Owners:** **Ayush** = the whole demo (Connect + Deal + Sella) · **Muskan** = Foundation → Onboarding/Home → the next surfaces (Present / Discover).
**Created:** 2026-06-07 16:25 CEST · **Updated:** 2026-06-07 17:13 CEST (re-cut: Connect+Sella to one owner) · **2026-06-11 reshape (Ayush):** 3.5 closed; the UI work moved out to a new **Section 5 (5A)**; **4.0 Sella research (SHARED)** added as the first step of Section 4. Sella stays Section 4 (matches DECISIONS "4a-4d"). Section 4 (Sella) + Section 5 (UI) are **open / unassigned** - we pick them up ourselves; 4.0 research is shared first.
**Demo:** 2026-06-11.

> Who builds what for the Connect demo. Derived from the PRD ([connect-demo.md](connect-demo.md) §6 = the 9-step acceptance script) and the locked build strategy (foundation broad → surfaces vertical → Sella cross-cutting). The cut keeps the tightly-coupled connected experience under one owner so it has no internal seams, and lets the other owner build ahead on the next surfaces.

---

## Legend

- **Walk** - on the 9-step demo script? **★** yes (demo breaks here if missing) · **○** not on the walk.
- **MVP** - build for June 11? **✓** build · ***seed*** = seed/stub instead · **next** = not June-11 (build-ahead).
- **Size** - rough effort: **S** ~2-4h · **M** ~½-1 day · **L** ~1.5-2+ days.
- **Status** - `(blank)` not started · 🔨 WIP · 🧪 review (built, in PR) · ✅ done (merged) · ⏸ blocked.

> **Status-column rule (both agents, read this):** each owner edits **only the Status cells of their own rows** — Muskan edits Group M, Ayush edits Group A. Status flips are the **one exception to the shared-file lock ritual**: distinct rows = distinct lines = clean git merge, so **no sync-lock needed for a status flip.** Any *structural* edit to this file (adding/removing rows or columns, rewording) still follows the normal lock ritual.

The 9 demo steps the "Walk" column points to:
1. A sends connect request → B's inbox · 2. B accepts → relationship + C2C chat · 3. the two people chat · 3b. open the relationship page · 4. Sella spots a deal, asks both · 5. both say yes → Sella drafts card + workspace born · 6. negotiate + advance stages · 7. each side confirms · 8. Draft → Confirmed · 9. audit trail.

---

## Assignment at a glance

| Owner | Owns | Order |
|---|---|---|
| **Muskan** | **Foundation** (F1-F5) → **Onboarding + Home + Auth screens** (1b/1c/1d) → **Present + Discover** (design + schema + build) | front-loaded; only Foundation is June-11-critical |
| **Ayush** | **The whole demo:** App shell (1a) + **Connect** (2a-2e) + **Deal** (3a-3d) + **Sella** (4a-4d) | starts once Foundation lands |

**Why this cut.** Connect + Deal + Sella are one tightly-coupled connected experience - and **Sella reads the DB through tool calls**, so it can't cleanly leave the Connect modules. Putting all of it under one owner means **zero internal seams on the live demo path** - it can't break at a handoff on stage. Muskan provides the foundation, then builds ahead on Present/Discover (also needed, not in this demo). The two halves' active work never overlaps.

---

## Group M - Muskan

### Foundation (the only June-11-critical thing Muskan owns - it gates Ayush)

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| F1 | Phase 1 + 2 migrations → Supabase | ★ | ✓ | L | ✅ done |
| F2 | RLS policies (multi-tenant `company_id`) - *the privacy spine* | ★ | ✓ | L | ✅ done |
| F3 | Auth setup (Supabase Auth) | ★ | ✓ | M | ✅ done |
| F4 | Seed: 2 companies + 2 users, verified | ★ | ✓ | S | ✅ done |
| F5 | `shared/db`, `shared/auth`, `audit_log` write helper | ★ | ✓ | M | ✅ done |

### Entry experience (real build, but the demo uses seed - so not June-11-blocking)

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| 1b | Auth screens (sign in / up) | ○ | ✓ | S | 🧪 review |
| 1c | Company onboarding (setup, license upload, verification) | ○ | ✓ *(seed for demo)* | M | 🔨 WIP |
| 1d | Home / logged-in landing | ○ | ✓ *(seed for demo)* | S | |

### Next surfaces (post-Foundation; build-ahead, not in the June-11 demo)

| Surface | Job | Size | Status |
|---|---|---|---|
| **Present** | **design + schema first**, then build | L+ | |
| **Discover** | **design + schema first**, then build | L+ | |

*These are sketch-depth today with no schema (Phase 1/2 = Connect/Deal only). So the first job is design + schema - Muskan's strength - then build. This sets up the post-demo product instead of building on undesigned ground.*

---

## Group A - Ayush (the whole demo)

### App shell

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| 1a | App shell + nav (5-surface frame, top bar, routing) | ★ | ✓ | M | ✅ done |

### Connect (Unit 2)

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| 2a | Inbox (Variant A: lenses, claim/assign) | ★ | ✓ | M | ✅ done |
| 2b | Accept → relationship + C2C created | ★ | ✓ | S | ✅ done |
| 2c | Chat - C2C + P2P threads, send/store, message types | ★ | ✓ | L | ✅ done |
| 2d | Realtime (Supabase Realtime subscriptions) | ★ | ✓ | M | ✅ done |
| 2e | Relationship page (notes / terms / artifacts) | ★ | ✓ | M | ✅ done (merged; 3a-3d built on it) |

### Deal (Unit 3)

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| 3a | Deal card - **READ side** (show card, PO/SO derived, role-private field, front + back w/ Signals/Logs tabs + flip, placed in chat) | ★ | ✓ | L | ✅ done (merged; read side) |
| 3b | Deal Workspace (born at draft, members, container) | ★ | ✓ | M | ✅ done (merged #93→dev, #94→main) |
| 3c | Stage pipeline (5-stage bar, manual advance) + Things checklist (by **stage**) | ★ | ✓ | M | ✅ done (bar screen-only; Things tick + add, real DB) |
| 3d | Confirmation gate (two-sided confirm → Confirmed) | ★ | ✓ | M | ✅ done (golden card + live pill + audit; both sides verified) |
| **3.5a** | **Create a draft from chat** - `createDeal` → atomic `create_deal_draft` RPC (card+lines+private box+workspace+owner+thread+log+note+audit, one txn) + the shared `DealForm` + the chat entry. Recipient auto; prices optional; offer from own catalogue. | ★ | ✓ | M | ✅ done (built + verified live; my branch) |
| **3.5b** | **Edit a draft** - `editDeal` → atomic `edit_deal_draft` RPC: version bump, immutable snapshot, carry private boxes, MANDATORY note, human Update. Same `DealForm`, prefilled. | ★ | ✓ | M | ✅ done (built + verified live; my branch) |
| **3.5c** | **Re-confirm a change** - both sides re-confirm the new version (reuse 3d's `ConfirmBar`). | ★ | ✓ | S | ✅ done (free - the version bump resets 3d's gate; verified) |
| **3.5d** | **Card v2 UI** - *PARKED.* The visual pass grew into the whole UI job (card + chat + nav + Sella chat) and moved to **Section 5 (5A)** below. Re-approach fresh after Sella research (4.0). | ★ | ✓ | M | 🅿️ parked → §5 |

> **3.5 doors note:** the three create doors were *shop · chat "+" · Sella*. 3.5a built the **chat** door (manual). Shop + Sella doors come later (Sella = 4a-4d). The AI fence: Sella may FILL the form, only a human's button click writes (server action).

> **3a scope note (Ayush, 2026-06-10):** 3a delivered the **read side** of the deal card (display + flip + in-chat
> placement + role privacy, verified both sides). The **write side** (create a draft, edit/version-bump) was pulled
> out into the new **3.5** row above - it sits between the deal machinery (3b-3d) and Sella, because a deal is born
> from 3 places (shop · chat · Sella) and should share **one** creation core. Version **display** (Logs tab) is
> already done in 3a; only the version **write** moved. Build 3b-3d on the seeded card `04695a2d`.

### Section 4 - Sella (leaf, built last; the demo works without it)

**Owner:** OPEN / unassigned (Ayush or Muskan; Muskan = backstop). **4.0 research DONE + locked (2026-06-12).**
**Build guide:** `_workshop/build-plans/4-sella-build.md` · **decisions/synthesis:** `_workshop/pov/sella.md`.

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| **4.0** | **Sella research - SHARED** - both researched, compared, and locked the 4a-4d shape. Synthesis: `_workshop/pov/sella.md`. | ★ | ✓ | M | ✅ done |
| **4·0** | **Make the chat real (Path A)** - wire chat send to INSERT a real `chat_message` row (table/RLS/realtime already exist). Prereq for auto-detection; keeps the Bedrock key in Supabase only. | ★ | ✓ | M | (next - first) |
| 4a | **Provider layer** - wrapper exists (`_shared/sella/bedrock.ts`); add retries/timeout + **Bedrock structured-outputs** body shape; smoke-test Sonnet+Haiku ids in `eu-central-1`. | ★ | ✓ | S | (mostly done) |
| 4c | **Draft contract** - one structured-output schema (`verdict`/`confidence`/`deal` nullable + **evidence quotes**), maps 1:1 to `deal_line_item`/`deal_card`; zod-validate + fail-soft. Serves detection + the manual `+` door. | ★ | ✓ | M | |
| 4b | **Detect** - new `chat_message` → **pgmq + pg_cron** → Edge Function (Haiku, whole-thread + cachePoint), writes a `sella` `deal_detected` msg (draft+votes in `metadata`); dedup/supersession. **Both-confirm (Option B) → two-owner birth RPC** - the AI fence: only the human button writes. | ★ | ✓ | L | |
| 4d | **Summarize** - `deal_card_updated` "why it changed" as a `sella` chat line **and** `deal_card_log` (`changed_by=sella`); first-contact intro. (Sella right-panel/co-pilot UI = 5A / post-MVP.) | ★ | ✓ | M | |

**Audit** - every Sella action: `audit_log` with `actor: sella` + `on_behalf_of: person` (dual-identity), via the F5 helper.
**Guardrails** - AI fence (L1 suggest, propose-only) · fail-soft · EU AI Act Art. 50 AI badge · cost guardrail (`max_tokens` + AWS budget alert). See `_workshop/pov/sella.md` §5.

### Section 5 - UI pass (5A) - absorbs the old 3.5d

**Owner:** OPEN / unassigned (Ayush or Muskan). **Runs in PARALLEL with Section 4, AFTER 4.0 research.**
Plan: `_workshop/build-plans/5a-ui-pass.md`. *(Why Section 5: keeps the UI clear of Sella's 4a-4d numbering.)*

| # | Item | Walk | MVP | Size | Status |
|---|---|---|---|---|---|
| 5A | **UI pass** - deal card (open mode + layout), chat heading, the message typing bar (expand / formatting / a `+` menu, first item "Create a deal"; uploads = later storage slice), left chat/relationship nav minimised to icon buttons, and the Sella chat UI. Step-by-step (one surface, review live, next). | ○ | ✓ | L | |

---

## The interface between us (one-way, low-risk)

The only thing connecting our work is **Muskan's foundation → Ayush consumes it**: auth, db client, RLS, the schema. She provides, you consume. **No bidirectional seam** - Sella stays inside Connect (it reads the DB via tools), so there is no cross-team Sella/messaging contract to negotiate. Lock the foundation shapes in Phase 0, then Ayush builds the whole demo on top.

**Sella backstop.** Sella is a leaf, built last. If Muskan finishes her track - or if Ayush is underwater on Sella near the deadline - **Muskan helps on Sella.** It's the one place she can jump into Ayush's half late without disrupting the rest, because nothing depends on it.

---

## Build order

- **Phase 0 (Muskan, gating):** Foundation F1-F5. Nobody builds features until this lands.
- **Then parallel, no overlap:**
  - **Ayush** - the whole demo: shell → Connect (inbox/accept → chat/realtime → relationship) → Deal (card → workspace → stages/Things → confirm) → Sella (last). Start the **3 L long-poles early: 2c (chat), 3a (deal card), 4c (Sella draft).**
  - **Muskan** - Onboarding/Home (demo uses seed, so not blocking) → Present + Discover (design + schema, then build).
- **Thinnest walkable thread (demo insurance):** connect → accept → chat → manually draft a card → confirm → Confirmed. Get that green before stages, Things, and Sella polish.

---

## Post-build phase

After everything is built and integrated:

- **Ayush** - polishing the UI across the app.
- **Muskan** - backend bug-fixing and hardening.
