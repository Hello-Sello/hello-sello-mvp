# REVIEW — T01–T07 (build rounds, 2026-08-14)

## T04 (HEL-49) · T06 (HEL-51) · T07 (HEL-52) — built in parallel

**Verdicts:** all suites green (323 unit · 11/11 e2e incl. 3 new tier cases · tsc ·
eslint · SQL+race suites re-verified on fresh reset). Blocking found and fixed same
round: T04 ×3 (see below), T06 ×1, T07 0.

**Blocking (fixed):**
- T04: unpriced product + drafted rungs passed the Save gate then failed mid-flush;
  clearing a ladder with a blank price field silently no-opped; **security — the
  price-row create-branch could insert a `pricelist_item` referencing ANOTHER
  company's product** (cross-tenant pollution; ownership check added to the shared
  helper, both doors).
- T06: `toDraftLines`' fallback wrote `pack`/`mL` into `deal_line_item.unit` (FK
  `g/kg/unit`) → createDeal FK failure for pack-unit products with unknown pack
  size. **Pre-existing bug surfaced by review**; fallback now writes `"unit"`.

**Diff-introduced conformance (fixed by orchestrator call):** T06 server-rejected
pack-size writes left the rejected value in the DOM (silent-swap violation);
T07 hint pill hardcoded `€x/g` beside `formatMoney` cells + read-row chip lacked the
explicit seller guard (D-12 made structural).

**Prototype deviations (G4 ledger — T04):** per-editor Save + "✓ Saved" flash
dropped in favor of the card's one-pink-Save contract (ladder rides the draft flow,
atomic via the one RPC); one invalid ladder blocks the whole shop Save with a
message; whole-row red kept per prototype.

**T07 criterion 7 (snapshot) — verified, not built:** existing lines read
`deal_line_item.unit_price` at `card.version`; the catalog fetch is
`editMode && isSeller` gated; the render-time tier back-fill never writes
`unitPrice`; no auto-reprice path exists (decision B holds).

**Standing notes (tracked, not fixed):**
1. T04: `parseNum`/`draftNumber` byte-identical twins (ShopView/ladderDraft) — one
   exported helper would prevent drift. Flush routing covered by e2e only.
2. T06: `pack`/`mL` products resolve as grams-as-is by design; no test pins the
   reachable non-g units (kg fixtures pin unreachable ones). Stepper/remove
   callbacks still throw unhandled (pre-existing asymmetry made visible).
   Null-pack-size line label reads "{count} g" for a pack count.
3. T06: criterion 5a (commit/revert parsing) has no automated coverage — node env
   can't drive the input; covered by the G4/G5 live walk.
4. T07: `suggestedMin` exported but unconsumed; empty-tiers+current==base returns
   `matchesLadder:true` (guarded by the consumer today — second consumer would
   mislabel); price-less line with catalog base shows the hint (declared
   over-trigger, no test).
5. Security: `lookupStandardPriceRow` isn't owner-filtered — the ladder write's
   tenant boundary rests on Postgres applying UPDATE-policy USING to
   `SELECT … FOR UPDATE` (correct, but single-point); the RLS rejection surfaces
   the victim's item UUID via the error message.
6. Security (pre-existing): `updateProductFields` never verifies product ownership —
   relies on RLS 0-row updates returning ok. Same class as the fixed create-branch.
7. e2e `present-card-edit.spec.ts` requires a fresh `db reset` per run (F-05
   persistence pollutes re-runs — pre-existing, now documented).

---

# REVIEW — T01–T03 (build rounds, 2026-08-14)

## T03 (HEL-48) — single-owner reads

**Verdict:** built green (262/262 unit · 13 new pricelist tests · grep-guard live ·
tsc/eslint clean · SQL suites re-verified) — 1 blocking, fixed same round.

**Plan-checker (REVISE, folded in):** guard regex tripped on two manage.ts comments
(reworded); two test files with exhaustive type literals broke tsc (added to fence —
builder found a third, `toDraftLines.test.ts`, same fix class, accepted);
`@supabase/supabase-js` confirmed a direct dep; coalescing rules pinned; named the
real behavior changes (view-arm tightening on basket reads, row-pick unification,
bridge display window) instead of "keeps behavior".

**Blocking (fixed):** `getMyShop` would hard-fail the seller's own page on a price
read error where the old embed degraded to a priceless shop — degrade restored.

**Diff-introduced conformance (note-tagged by reviewers, fixed by orchestrator call
since this diff added them):** a new getOwnCatalog docstring claimed a company scope
that doesn't exist (reworded to state the known unscoped-picker bug — Ayush's lane);
`index.client.ts` blanket-exported the ladder WRITE through the client door where ADR
§4 defines the door as pricing + reads (narrowed to named read exports; README +
barrel comments aligned).

**Standing notes (not fixed, tracked):**
1. `pricePerGram` from the view lacks the sibling readers' `Number()` coercion —
   if PostgREST ever returns NUMERIC as string, arithmetic silently changes. *(critic)*
2. Guard has no `pricelist_item_tier` pattern — a future direct child-table read
   bypasses the single owner unseen; 80-char regex window can be padded past. *(critic)*
3. `ProductPrice.pricelistId/updatedAt` have zero consumers — speculative surface.
   *(critic)*
4. **Pre-existing, cross-lane (Ayush):** `getOwnCatalog`'s product query has no
   company filter → the create-form picker lists every company's visible products,
   now with their tier ladders attached. ADR blast-radius already flags it. *(security)*
5. **Follow-up migration candidate:** parent `pricelist_item` public policy still
   lacks the verified gate + window the child/view have — an authed caller can read a
   base price directly on an expired product but not its rungs. Asymmetry, parent's
   fix is T08/C-adjacent or its own ticket. *(security)*
6. `ladderErrorMessage`'s generic path passes raw Postgres text (constraint names)
   to the seller UI — low impact, owner-only surface. *(security)*

---

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
3. ~~`plit_public_select` lacks `is_caller_verified()`~~ **RESOLVED at G4
   (Muskan: yes, 2026-08-14):** the gate is in the policy; the pgTAP suite now also
   probes the direct table door as an unverified caller (0 rows). All three doors —
   table, view, RPC — now agree. *(security, :68-83)*
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
