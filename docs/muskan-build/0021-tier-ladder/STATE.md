# 0021 tier-ladder — work order
lane:   FULL
stage:  triage ✅ → spec ✅ (G1) → prototype ✅ (G2) → design ✅ (G3) → build T01–T07 ✅ + T08 authored → G4 ✅ → **/ship ✅ (G5, 2026-08-16)** — only migration C (`.hold`) remains → closes HEL-53
branch: feature/tier-ladder   (cut from origin/dev 337f112, 2026-08-14; merged via PR #158, branch deleted 2026-08-16)
seed:   "Create 3 price tiers per product with dropdown." — Marcel, verbatim

> ⚠️ This slug is ALSO the pipeline's manual dry-run (`docs/agents/DRY-RUN-tier-ladder.md`
> — predictions, 7 checker rounds, convergence data). Build findings feed that file too.

## Files so far
| stage     | wrote |
|-----------|-------|
| triage    | docs/agents/DRY-RUN-tier-ladder.md (doubles as the triage record) |
| spec      | docs/PRD/0021-tier-ladder.md |
| prototype | prototypes/0021-tier-ladder-prototype/ (Variant B chosen) |
| design    | docs/architecture/adr/0004-tier-ladder.md (rev 8) · docs/architecture/adr/ADR-INDEX.md · TICKETS.md · this file |

## Locked   (from the ADR — G3 pending)
- Child rows (`pricelist_item_tier`), REPLACE the bundle columns; base price stays on `pricelist_item`
- Expand → deploy → contract; C authored `.hold`, moved into migrations/ only after the tiers deploy is live
- One row-picker: `current_pricelist_item` view (owner-rights, security_barrier, enumerated 7-col projection)
- One rung-resolver: `resolveTierPrice` in catalog, reached via `index.client.ts`; kg×1000, else grams-as-is; null base → null
- `save_price_ladder` = SECURITY INVOKER, parent `FOR UPDATE` first, soft-delete → base → insert
- Decision B (G3): post-draft prices negotiation-owned; hint → held change via propose/accept
- Decision A (G3): basket line gains a grams/pack-size editor
- Ladder shape DB-enforced (constraint trigger); 3-rung cap = advisory UI only

## Deferred — must NOT be built
- Per-customer pricing (separate system, post-v0 per Marcel)
- Cross-product bundles (Sept list)
- Multi-tier CSV import (single bracket lands as rung 1)
- Auto re-price of living deals (decision B forbids it)
- Price-change audit wiring (seed row exists, inert — G3 follow-up ticket candidate)

## Attempts   three separate budgets — see PIPELINE §10
T01  tests 0/2 · blocking 0/2 · T02  tests 0/2 · blocking 1/2 (fixed)
T03  tests 0/2 · blocking 1/2 (fixed) · T04  tests 0/2 · blocking 3/2? NO — 3 findings, ONE fix round (fixed)
T05  tests 0/2 · blocking 2/2 (e2e locators — fixed) · T06  tests 0/2 · blocking 1/2 (fixed)
T07  tests 0/2 · blocking 0/2 · T08  authoring only · G4 rounds 0 (gate not yet run)

## Gate log
- G1 spec — passed 2026-08-14 (2 question rounds; dropdown-as-order-tool amendment)
- G2 prototype — passed 2026-08-14 (Variant B, no changes)
- G3 design — passed 2026-08-14 (Muskan accepted all 5 sign-offs, plain-English walkthrough)
- G4 — **PASSED 2026-08-16** (3 Agentation feedback rounds, sessions `dry_run` cont.):
  round 2 = was/now strikethrough price + scrollable edit footer + spec-floor 80px;
  round 3 = **the "See all prices" panel became a floating POPOVER below the link**
  (portaled past the fixed card, follows scroll; Muskan's design call — recorded as a
  prototype DEVIATION in REVIEW.md top section). Muskan: "perfect". 2 ARCHITECTURE-NOTES
  entries written (one-price-door + stale-redeclare incident).
- G5 /ship — **PASSED 2026-08-16**: rebased onto dev clean → full gate green
  (342 unit · 102/102 e2e incl. F-02 on fresh reset · tier SQL + race + BOTH lockdown
  suites · tsc/eslint) → **PR #158 merged to dev** → **migration E LIVE on production**
  (security repair verified; ledger APPLIED entry 2026-08-16; buy_schema orphan cleared
  by Muskan) → **13-migration Phase-12 wave applied to prod** (filename order, stamps
  repaired, grants + backfill verified live) → dev→main merged back-to-back, Vercel
  deploy READY (`714d738`) → **Muskan's live walk on prod: fine.** Ledger APPLIED entry
  written; stale branches cleaned (local+remote). REMAINING for this slug: migration C
  (re-diff `.hold` vs live at move time, fresh timestamp, push, regen types) closes HEL-53.

## For Muskan — G3 sign-offs bundled in the ADR
1. Visibility-window tightening: out-of-window products leave Discover entirely (§3.3)
2. `is_caller_verified()` added to the view's public arm — tightening over today's ungated table policy (§4)
3. Decisions A + B recorded above — confirm as read
4. Incidental defect found by checker round 8: `20260618120100` never restored its anon revoke — repaired in T08
5. E precondition: `buy_schema` orphan row repair (T08 verifies; blocks any `db push`)
