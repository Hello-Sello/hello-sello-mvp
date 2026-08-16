# Handoff — Priority: the Deal Loop (Connect → Deal → Detect)
**Date:** 2026-07-22 · **Owners:** Muskan + Ayush · **Target:** full Lane A/B/C by **2026-07-24** (sooner if possible)

> Single resume point for this priority. Read this + the relevant lane plan to pick up. Estimates are **AI-agent wall-clock**; the calendar is set by human checkpoints, not build time.

## The priority (finalize before anything else)
End-to-end loop: a company **sends a connection request from Discover** → it **lands in the other company's Connection Requests box** → they **connect** → **send deals** in the C2C chat → the seller's **Sella detects the deal from the conversation**. Everything else is Priority 2+.

The connection flow (send → box → accept → connect) **already works today** — Discover's Connect button + the Connect inbox. The only new pieces are: (a) show that box **in Discover**, and (b) **Sella c2c detection**.

## Status
| Lane | What | Status | Plan file |
|---|---|---|---|
| **A** | Deal creation from C2C + delivery (ticket / chat message) | ✅ **Built + gated** (cloud-pending Ayush review) | [deal-creation-and-delivery.md](deal-creation-and-delivery.md) |
| **B** | Discover LinkedIn redesign | 📋 **Planned + verified** (2026-07-20, post-Lane-A) | [discover-linkedin.md](discover-linkedin.md) |
| **C** | Sella c2c detection + provider port | 📝 **Outline only** (pre-research) | [sella-c2c-detection.md](sella-c2c-detection.md) |

## Timeline (AI-agent build; calendar = human checkpoints)
- **Priority loop** (requests-in-Discover + Sella c2c detection): **~1–2h agent**, two agents in parallel.
- Full **Lane B**: ~3–6h agent · Full **Lane C**: ~4–8h agent. All parallelizable → the whole remaining scope is ≈ **one day of agent build**.
- The clock is set by: Discover prototype approval, UAT of the loop, Ayush's RPC review, Sella eval-quality iteration — **not the code.**

## Who does what
| | Priority loop | Then |
|---|---|---|
| **Muskan** (Present/Discover lane) | Requests box in Discover (DISC-11/12 + minimal mount) | Full Lane B LinkedIn redesign |
| **Ayush** (deals/RLS/Sella lane) | **Sella c2c detection** (C1+C2) + **review Lane A's 2 cloud RPCs** | Ionos provider port + product resolution + eval |
| **Both** | UAT the loop end-to-end | — |

## Open items / dependencies
- **Lane A cloud push** (4 migrations) needs Ayush's review before production (`create_deal_draft` re-emit + `deal_member` write = his lane). Works locally now.
- **Discover prototype (DISC-1)** needs Muskan's approval before UI sections.
- **Cross-lane:** `getInbox` overlap (Lane A A4 ↔ Lane B DISC-11/12) — verified compatible; commit often. **DISC-13** touches shared `messaging/connections.ts` → sync-lock first.
- Branch: 4 behind `dev` (Buy housekeeping, irrelevant), 1 behind Ayush.

## How to resume (next session, main folder)
1. Read this file + the relevant lane plan.
2. For a lane **not yet task-broken** (Lane C): do full research + very-small-task breakdown + verify against live code (like A/B) **before** building. Re-confirm cited line numbers before each edit.
3. Build per the plan's tickets; gate (tsc/eslint/pgTAP/unit/e2e) + live-verify on a fresh `supabase db reset`.

## Still to create
- ✅ **Timeline table for ALL priorities — DONE (session 67, 2026-07-22).** Dates live in Muskan's Google Sheet (July-sprint tab): loop + full Discover by Fri 24 · Present cluster Sat 25–Wed 29 · heavy/design-first items (cross-product bundle, Phase 15/16 full, Buy 💗, Allocate By-Batch/Product, Home) → Aug. Sequence + owners + AI-hour sizing in CLAUDE.md "What's next" / session-log session 67.
