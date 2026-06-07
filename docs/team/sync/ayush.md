# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-07 17:13 CEST
**Branch:** claude/ayush/work
**Status:** idle (build plan re-cut: Connect+Sella → Ayush, Foundation+Present/Discover → Muskan; shipped to dev)
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** none — BUILD-PLAN PR merged to dev.

---

## Notes for the other agent

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
