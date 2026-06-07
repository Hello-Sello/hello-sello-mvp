# Connect Demo - Build Plan & Division of Work

**Status:** Locked. The June 11 build, split between the two of us.
**Owners:** Muskan (Foundation + Connect) · Ayush (Deal + Sella).
**Created:** 2026-06-07 16:25 CEST.
**Demo:** 2026-06-11.

> Who builds what for the Connect demo. Derived from the PRD ([connect-demo.md](connect-demo.md) §6 = the 9-step acceptance script) and the locked build strategy (foundation broad → surfaces vertical → Sella cross-cutting). The clean split lets us work in parallel without overlap and integrate at the end.

---

## Legend

- **Walk** - is this on the 9-step demo script? **★** = yes (demo breaks here if missing) · **○** = not on the walk.
- **MVP** - build it for June 11? **✓** = build · ***seed*** = seed or stub instead of building.
- **Size** - rough effort for one full-stack engineer: **S** ~2-4h · **M** ~½-1 day · **L** ~1.5-2+ days.

The 9 demo steps the "Walk" column points to:
1. A sends connect request → lands in B's inbox · 2. B accepts → relationship + C2C chat · 3. the two people chat · 4. Sella spots a deal, asks both · 5. both say yes → Sella drafts card + workspace born · 6. negotiate + advance stages, card versions · 7. each side confirms · 8. Draft → Confirmed · 9. audit trail (append-only).

---

## Assignment at a glance

| Group | Owner | Scope |
|---|---|---|
| **A** | **Muskan** | Foundation (F1-F5) |
| **B** | **Muskan** | Unit 1 (Onboarding + Home + Shell) + Unit 2 (Connect) |
| **C** | **Ayush** | Unit 3 (Deal) + Unit 4 (Sella) |

Clean split: no overlap. Muskan owns the data spine + the communication half (inbox → chat → relationship); Ayush owns the deal-execution half + the AI. Everything meets at one seam (see Integration below).

---

## Group A - Foundation (Muskan)

| # | Item | Walk | MVP | Size |
|---|---|---|---|---|
| F1 | Phase 1 + 2 migrations → Supabase | ★ | ✓ | L |
| F2 | RLS policies (multi-tenant `company_id`) - *the privacy spine* | ★ | ✓ | L |
| F3 | Auth setup (Supabase Auth) | ★ | ✓ | M |
| F4 | Seed: 2 companies + 2 users, verified | ★ | ✓ | S |
| F5 | `shared/db`, `shared/auth`, `audit_log` write helper | ★ | ✓ | M |

## Group B - Unit 1 + Unit 2 (Muskan)

**Unit 1 - Onboarding + Home + Shell**

| # | Item | Walk | MVP | Size |
|---|---|---|---|---|
| 1a | App shell + nav (5-surface frame, top bar, routing) | ★ | ✓ | M |
| 1b | Auth screens (sign in / up) wired to Supabase | ★ | ✓ | S |
| 1c | Company onboarding (setup, license upload, verification) | ○ | *seed* | M |
| 1d | Home / logged-in landing | ○ | *seed* | S |

**Unit 2 - Connect**

| # | Item | Walk | MVP | Size |
|---|---|---|---|---|
| 2a | Inbox (Variant A: lenses, claim/assign) | ★ | ✓ | M |
| 2b | Accept → relationship + C2C created | ★ | ✓ | S |
| 2c | Chat - C2C + P2P threads, send/store, message types | ★ | ✓ | L |
| 2d | Realtime (Supabase Realtime subscriptions) | ★ | ✓ | M |
| 2e | Relationship page (notes / terms / artifacts) | ★ | ✓ | M |

## Group C - Unit 3 + Unit 4 (Ayush)

**Unit 3 - Deal**

| # | Item | Walk | MVP | Size |
|---|---|---|---|---|
| 3a | Deal card (draft, PO/SO, role views, version history, front/back) | ★ | ✓ | L |
| 3b | Deal Workspace (born at draft, members, container) | ★ | ✓ | M |
| 3c | Stage pipeline (5-stage bar, manual advance) + Things checklist (by **stage**) | ★ | ✓ | M |
| 3d | Confirmation gate (two-sided confirm → Confirmed) | ★ | ✓ | M |

**Unit 4 - Sella** (leaf - built last; the demo works without it)

| # | Item | Walk | MVP | Size |
|---|---|---|---|---|
| 4a | Bedrock wrapper (provider interface, Sonnet/Haiku, EU) | ★ | ✓ | M |
| 4b | Detect (read chat → spot deal → suggestion line) | ★ | ✓ | M |
| 4c | Draft (chat → deal-card draft) | ★ | ✓ | L |
| 4d | Summarize (version one-liners) + Sella right-panel UI | ★ | ✓ | M |

**Audit** is not a unit - each group emits `audit_log` rows from its own actions, using the helper from F5.

---

## The integration seam (where A/B and C meet)

The split is clean because there is essentially **one contract** between the two halves:

- **Muskan's `messaging` module ↔ Ayush's `deals` + `sella`.** Sella reads `chat_message`; the deal-card draft appears in the P2P chat; the deal workspace's chat is a `chat_thread`. So Ayush's side depends on the **`messaging` module's public `index.ts`** (read a thread, post a message, the message types).
- **Both sides share the schema** (Foundation) - `deal_workspace`, `deal_card`, `thing`, `deal_stage` are Muskan's tables; Ayush reads/writes them through the `deals` module.

**Agree these two public interfaces up front**, then each side builds against the typed contract without waiting on the other. That is what makes "everything matches and works together" at the end actually true.

---

## Build order (★-first within each group)

Start the **four L long-poles early** - they hold the risk: **F2 (RLS), 2c (chat), 3a (deal card), 4c (Sella draft).**

- **Phase 0 (Muskan-gated):** F1-F5. Everything sits on this; can't parallelize around the schema/RLS.
- **Then parallel:** Muskan walks B (1a/1b → 2a/2b → 2c/2d → 2e); Ayush walks C (3a/3b → 3c/3d → 4a-4d, Sella last).
- **○ / seed:** 1c, 1d - seed verified companies instead of building onboarding; drop into Connect instead of a home page. Build only if time remains.

Thinnest walkable thread (demo insurance): **connect → accept → chat → [manually draft a card] → confirm → Confirmed.** Get that green before stages, Things, and Sella polish.

---

## Post-build phase

After everything is built and integrated:

- **Ayush** - polishing the UI across the app.
- **Muskan** - backend bug-fixing and hardening.
