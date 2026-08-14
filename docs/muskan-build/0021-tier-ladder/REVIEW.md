# REVIEW — T01 + T02 (build round 1, 2026-08-14)

Pipeline run: plan → plan-checker (fresh) → test-writer (fresh) → builder → test-runner
(fresh, read-only) → reviewers (fresh, parallel). Every checker a separate-context agent.

## Verdicts

| Ticket | Tests | Blocking findings | Outcome |
|---|---|---|---|
| T01 (HEL-46, migration E) | all green, independently re-verified | 0 | done, awaiting G4 |
| T02 (HEL-47, resolver) | all green, independently re-verified | 1 → fixed same round | done, awaiting G4 |

Budgets spent: T01 `tests 0/2 · blocking 0/2` · T02 `tests 0/2 · blocking 1/2`.

## Plan-checker round (before any code)

Both plans came back REVISE; all findings accepted and folded into the plans:
- T01: backfill NULL-logic hole (`NOT(a AND b AND c)` excludes half-filled brackets —
  the main malformed case — from the rescue path); backfill made a shipped,
  test-callable function so pgTAP proves the REAL statement; race criterion got a real
  two-psql-session proof in the runner; + 5 notes (compile fixes, signature fixes,
  null guards).
- T02: `packSizes` had to see BOTH product size sources (`packSizes[]` +
  `pack_size_grams`) or every index-based pick shifts; `lineValueOf` barrel export
  amendment (agreement test needs the real import); units-multiplier test case added.

## ⚠️ Escalations for Muskan (not blocking, but real)

1. **LIVE SECURITY DEFECT FOUND & FIXED LOCALLY — likely live on cloud production:**
   `list_discoverable_companies()` lost its SEC-01 `is_caller_verified()` gate —
   `20260617150000` re-declared it from a pre-sec01 copy and `20260618120100` carried
   the gap forward. An UNVERIFIED company can list discoverable companies on prod
   today (verified via `pg_proc.prosrc` inspection + the lockdown test failing red on
   it). Migration E re-declares from the LIVE body + restores exactly the one
   predicate + full grant ritual (critic diffed it: byte-identical otherwise, no
   stale-base drift). **Cloud remains vulnerable until E is pushed** — same class as
   the Discover gate loss your `feedback-sql-replace-diff-against-live` rule records.
2. `run_cross_tenant_lockdown_test.sh` (and possibly other `run_*.sh`) is broken on
   this machine: host `psql` is a docker-exec shim, so the "host psql" branch passes a
   host path into the container. The tier runner uses stdin (`-f - < file`) and works.
   Worth one sweep over the runner scripts — separate ticket, not this slug.

## T01 notes (critic + security; NOT fixed, per pipeline — surfacing at G4)

1. `save_price_ladder`'s `EXCEPTION WHEN raise_exception` re-raise is a no-op that
   doesn't cover the real raw-text risks (missing jsonb key → 23502, bad numeric →
   22P02 pass through raw). T03's `pricelist.ts` mapping should handle these, or
   widen the handler. *(critic, migration:192)*
2. `current_pricelist_item`'s `DISTINCT ON` has no final `pli.id` tiebreak — equal
   `published_at`+`created_at` picks nondeterministically. Faithful port of the live
   RPC (inherited, not introduced); the one soft spot in "every reader picks the same
   row". *(critic, :234)*
3. `plit_public_select` lacks `is_caller_verified()` — an authenticated-but-pending
   caller can read public ladders via direct table read (view + RPC both gate it; the
   table door doesn't). Matches parent-policy parity per ADR §4, but the policy is new
   and could ship the gate. **Candidate one-line tightening for G4 decision.**
   *(security, :68-83)*
4. Owner arm of the view returns price rows for soft-deleted products
   (`p.deleted_at` only in the public arm — matches ADR literal text; T03 readers
   inherit it). *(security, :222-227)*
5. `owns_pricelist_item` ignores `deleted_at` — rungs can be saved under a
   soft-deleted price row (invisible downstream; silent-success oddity only).
   *(critic + security, :53-57)*
6. `check_price_ladder_shape` lacks the revoke ritual (benign: trigger fns aren't
   PostgREST-callable; repo revokes no trigger fn anywhere). *(security, :94)*
7. `backfill_bundle_to_tiers` has no `SET search_path` (safe: INVOKER, all names
   qualified, revoked from everyone, C drops it). *(security, :249)*
8. Comment at :67 claims the table policy "matches the view's public arm" — it
   doesn't (no verified gate); comment overstates. *(critic)*
9. Types regen: `update_deal_draft`'s hand-edit needed a 4-line null-ability restore
   post-regen (generator normalizes `string|null`→`string` there); regen also
   legitimately dropped two stale Buy-era tables and picked up previously-missing
   RPCs. *(builder deviation, verified benign)*
10. Pre-existing red suites, unrelated to this diff: `announcement_projection_test`,
    `onboard_company_categories_test` (runnerless, deal/onboarding domain);
    `rls_isolation_test` (known-stale, DEV-161).

## T02 notes (critic + consistency)

1. **[FIXED — the round's one blocking]** `packSizes` param field was camelCase
   `packSizeGrams`; real `ShopProduct` is snake `pack_size_grams` — would have forced
   both T05 call sites into hand-built adapter objects. Plan amended; builder +
   test-writer updated both halves. *(consistency)*
2. Rung-threshold dedupe loses the `+` marker when a rung equals a pack size
   (`500g` not `500g+`) — sanctioned by the plan, flag forward to T05's visual pass.
   *(critic)*
3. Index-count delta for T05: today the card pushes the bundle bubble unconditionally;
   `packSizes` dedupes — `sizes[packIndex]` callers must migrate in the same change
   (that IS T05's file set). *(critic)*
4. The agreement test imports the whole server-tainted deals barrel to reach one
   4-line function; works (vitest shims `server-only`), but couples a leaf-module
   spec to the deals load graph. Deliberate trade for real-import drift detection.
   *(consistency)*
5. Float drift is inherited by design: `0.29kg×1000 ≠ 290` exactly — same miss on
   both sides of the agreement, so pricing still equals billing. Unpinned edge.
   *(critic)*
6. `export interface` vs catalog's uniform `export type` — module-local style outlier.
   *(consistency)*
7. Hostile-input behavior (NaN → base, Infinity → top rung, negative → base) is
   benign-by-construction, untested. *(critic)*

## Builder rejections

None — every blocking finding was accepted and fixed.
