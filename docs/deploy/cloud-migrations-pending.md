# Cloud migrations — pending apply ledger

> **Purpose:** every DB migration we build locally is applied to the LOCAL stack only.
> The cloud (main) database is updated later, deliberately, by a human. This file is the
> running list of migrations that are **on local but NOT yet on cloud**, plus exactly how
> to push them. When a batch is pushed to cloud, move it to the "Applied to cloud" section
> with the date.
>
> **Golden safety rule:** a Supabase command with no `--linked` and no remote `--db-url`
> cannot touch cloud. `supabase db reset` / `supabase migration up` = LOCAL only.

---

## ⚠️ READ FIRST (2026-06-20, Muskan) — cloud history has DIVERGED; a naive `db push` FAILS

A `supabase db push --dry-run` on 2026-06-20 **failed**: *"Remote migration versions not found
in local migrations directory."* Cause: the cloud `schema_migrations` table recorded the early
migrations under **different timestamps** than the repo files (cloud was first seeded via MCP /
an earlier push with other timestamps — e.g. cloud `auth_person_trigger` = `20260607161101`,
local file = `20260607160000`). The CLI matches by exact version string, so it can't line them up
and refuses to push. **The "How to push" section below is SUPERSEDED for this batch** — use the
reconciliation here instead.

### Mapping — cloud's 47 recorded versions vs 74 local files
- **49 local files already on cloud (or superseded)** → mark applied in history, do NOT re-run:
  - the early 46 (same migrations, wrong cloud timestamp)
  - two F3 drift-backfills: `profile_qr_foundation`, `get_public_profile` (= cloud's `get_public_profile_rpc`; body captured verbatim from cloud)
  - `seed_demo_world` — now an INTENTIONALLY-EMPTY no-op (demo moved to `seed.sql`)
  - `confirm_detected_deal_proposer_initiator` — superseded by #15 `confirm_detected_deal_batch`
- **25 genuinely-new** → the real push set (deal-domain Phase 1–3f + Muskan's sec/verif/discover/city + `oauth_person_trigger_fix`). **No demo seed** (only the `chat_message_type_declined_seed` lookup row).

### Reconciliation commands — run from a LINKED machine, coordinated, in one sitting
Steps 1–2 edit ONLY the `schema_migrations` history table (no schema/data change, recoverable).
Step 4 is the only real change. After step 4: optionally drop orphan `avatars_read` policy
(cosmetic), enable Google/Azure in the dashboard, flip `.env.local` → cloud, run 6.1 cloud UAT.

```bash
# 1. revert cloud's 47 wrong-timestamp records (history table only)
supabase migration repair --status reverted 20260607153213 20260607153307 20260607153438 20260607153514 20260607153558 20260607153751 20260607161101 20260607161156 20260607161418 20260607162313 20260607222021 20260609165519 20260609173745 20260609174802 20260609215708 20260609221619 20260609223440 20260609225546 20260610095712 20260610103436 20260610105256 20260610105408 20260610105607 20260610114841 20260610162647 20260610165011 20260610165032 20260610170809 20260610215912 20260611111522 20260611111904 20260611143301 20260611154759 20260611160131 20260612011423 20260612103438 20260612110434 20260612113030 20260612211018 20260614182314 20260614184134 20260614194457 20260614200037 20260614200513 20260614210220 20260614212704 20260614221510

# 2. mark the 49 already-applied/superseded local versions as applied (no re-run)
supabase migration repair --status applied 20260607090001 20260607090002 20260607090003 20260607090004 20260607090005 20260607090006 20260607160000 20260607170000 20260607180000 20260607190000 20260608120000 20260609180000 20260609183000 20260609193000 20260609194500 20260609210000 20260610010000 20260610020000 20260610120000 20260610130000 20260610140000 20260610150000 20260610160000 20260610161000 20260610170000 20260610171000 20260610180000 20260610190000 20260611120000 20260611123000 20260611140000 20260611150000 20260611160000 20260612011145 20260612120000 20260612130000 20260612140000 20260612160000 20260614120000 20260614120100 20260614121000 20260614130000 20260614140000 20260614150000 20260614160000 20260614170000 20260614180000 20260615120000 20260615123000

# 3. dry-run — expect EXACTLY 25 pending, in timestamp order
supabase db push --dry-run

# 4. push the 25 genuinely-new
supabase db push
```

### The 25 that actually push (verify against the dry-run output)
`deal_pending_change` · `propose_deal_change_rpc` · `confirm_deal_change_rpc` ·
`sec01_caller_verified_discover_gate` · `sec02_revoke_anon_catalogue_read` · `verif_admin_rpcs` ·
`verif_reject_and_licence` · `verif_revoke_anon` · `confirm_deal_change_no_seal_write` ·
`deal_pending_change_realtime` · `auth04_revoked_status` · `confirm_deal_change_announce` ·
`chat_message_type_declined_seed` · `list_discoverable_companies_connect_scope` · `company_city` ·
`deal_card_notes` · `list_discoverable_companies_city` · `confirm_deal_change_notes` ·
`create_deal_draft_notes` · `resize_dli_private_columns` · `confirm_deal_change_margin_carry` ·
`create_deal_draft_retire_private_box` · `deal_line_item_batch` · `confirm_detected_deal_batch` ·
`oauth_person_trigger_fix`

### Before running
- **Ayush:** confirm #15 `confirm_detected_deal_batch` carries ALL of
  `confirm_detected_deal_proposer_initiator`'s logic — we mark the June-14 file applied on that
  assumption (it's your code).
- Math check: 49 marked-applied + 25 pushed = 74 local total. All 25 are dated after the highest
  marked-applied (`20260615123000`), so the push is sequential — **no `--include-all` needed**.

---

## How to push the pending migrations to cloud (Phase 1 + 2 + 3c + 3d + 3f — one batch of 15)

> **SUPERSEDED for the combined batch — see "⚠️ READ FIRST" above.** A plain `db push` fails on
> the history divergence; the steps below only work after the reconciliation repair.

Do this only AFTER the work is reviewed/merged, and coordinate with Muskan first — the
shared cloud DB has her catalogue work and a live Sella detection cron.

1. Confirm the project is linked: `supabase projects list` (the linked one is `byipusuthdlskdxoexkt`).
2. Dry-run / see what will go up: `supabase db push --dry-run` (lists every local migration not yet on cloud, in order).
3. Push: `supabase db push` (applies ALL pending local migrations to the linked cloud DB, in timestamp order).
4. Regenerate types from live if needed and verify the three RPCs + the table exist on cloud.

Note: migrations go as a **batch in timestamp order**, not one-by-one. The two fix migrations
below (`...120000_no_seal_write`, `...130000_realtime`) come AFTER the originals, so cloud runs
the original `confirm_deal_change` and then immediately the fixed `create or replace` — it ends
in the correct final state; the intermediate version is never used mid-push.

---

## PENDING (local only — NOT on cloud yet)

### Phase 1 — Held Two-Sided Deal Change (the held-change backbone)

All deal-domain, additive (a new table + new functions + one publication add). **Nothing of
Muskan's catalogue/product schema or RLS is touched.** Apply order is timestamp order:

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260616120000_deal_pending_change.sql` | New `deal_pending_change` table + the one-active-row UNIQUE lock + member RLS + 4 `deal.change_*` audit codes |
| 2 | `20260616120100_propose_deal_change_rpc.sql` | `propose_deal_change` RPC (holds a change, auto-accepts the proposer, never touches the live card) |
| 3 | `20260616120200_confirm_deal_change_rpc.sql` | `confirm_deal_change` + `withdraw_deal_change` RPCs (two-sided commit / discard) |
| 4 | `20260617120000_confirm_deal_change_no_seal_write.sql` | Fix: `confirm_deal_change` stops writing `deal_confirmation` (it leaked into the Seal gate). `create or replace`, supersedes #3's function body |
| 5 | `20260617130000_deal_pending_change_realtime.sql` | Fix: adds `deal_pending_change` to the `supabase_realtime` publication so held changes update live on both screens |

Cautions for the cloud apply:
- #5 is `alter publication supabase_realtime add table ...` — additive, but confirm the table is not already published on cloud (it is not, as of writing).
- #4/#5 assume #1–#3 are present; push the whole batch together.
- RLS on `deal_pending_change` is member-scoped, so realtime events only reach relationship members — no cross-tenant leak.

App code that depends on these (ships with the same PR, not a DB step): the three server
actions in `src/modules/deals/actions.ts`, the reads in `supabase/reads.ts`, and the strip
UI in `DealPin.tsx` / `EditDealForm.tsx` / `ConfirmBar.tsx`.

### Phase 2 — Announcements & Gate Cleanup (held-change resolutions announce into both chats)

Deal-domain only and additive (a `create or replace` of one function + an additive lookup
seed). **Nothing of Muskan's catalogue/product schema or RLS is touched.** Apply order is
timestamp order:

| # | Migration file | What it does |
|---|----------------|--------------|
| 6 | `20260617140050_confirm_deal_change_announce.sql` | `create or replace confirm_deal_change`: re-emits the whole Phase 1 body unchanged and adds two `sender='sella'` `chat_message` inserts — one into the deal thread + one into the p2p thread — on the decline branch and on the both-accepted commit branch. Supersedes the function body of `20260617120000_..._no_seal_write`. `withdraw_deal_change` is untouched (Withdraw stays silent). |
| 7 | `20260617140100_chat_message_type_declined_seed.sql` | Additive lookup seed for the `deal_change_declined` message type (`on conflict do nothing`). |

Cautions for the cloud apply:
- These land AFTER `20260617120000_..._no_seal_write.sql`, so a cloud `supabase db push` runs Phase 1's final `confirm_deal_change` body and then Phase 2's `create or replace` — it ends in the correct final state; the intermediate version is never used mid-push.
- #7 is additive (`on conflict do nothing`); safe to re-run.
- The announcement is RLS-filtered like every `chat_message` (`msg_all` = `can_access_thread`) — only relationship members receive it, no cross-tenant leak.
- #6 assumes Phase 1's migrations (#1–#5) are present; push the whole batch together.

App code: NONE new for Phase 2 — the announcement lives entirely inside the RPC (a projection
of the log line). No server action or component changed.

### Phase 3c - Card Note (held)

Deal-domain only and additive (two new columns + one publication add + two `create or replace`
function bodies). **Nothing of Muskan's catalogue/product schema or RLS is touched.** Apply order
is timestamp order:

| # | Migration file | What it does |
|---|----------------|--------------|
| 8 | `20260618120010_deal_card_notes.sql` | Two nullable per-company note columns (`note_company_a` / `note_company_b`) on `deal_card`, mapped to `relationship.company_a_id` / `company_b_id`. Adds `deal_card` to the `supabase_realtime` publication. No new RLS policy - the existing row-level `card_all` policy already covers every column on the table. |
| 9 | `20260618120110_confirm_deal_change_notes.sql` | `create or replace confirm_deal_change`: re-emits the full `20260617140050_confirm_deal_change_announce.sql` body unchanged and adds two CASE writes inside the both-accept commit block - the proposer's note lands in their slot only (`note_company_a` if `v_proposer_co = v_ca`, else `note_company_b`). The other side's note column is left untouched. Supersedes the function body of #6 (`20260617140050`). |
| 10 | `20260618120200_create_deal_draft_notes.sql` | `create or replace create_deal_draft`: re-emits the full `20260612011145_two_owner_create_deal_draft.sql` body unchanged except the note block - the birth note now writes to the creator's card slot (`note_company_a`/`note_company_b`) instead of inserting into `deal_change_input`. Same 11-arg signature. Supersedes the function body of `20260612011145`. |

Cautions for the cloud apply:
- #9 lands AFTER `20260617140050_confirm_deal_change_announce.sql`, so a cloud push runs Phase 2's announce body and then immediately Phase 3c's `create or replace` - it ends in the correct final `confirm_deal_change` state; the intermediate version is never used mid-push.
- #8's `alter publication supabase_realtime add table public.deal_card` is additive - confirm `deal_card` is not already published on cloud before pushing (it is not, as of writing).
- #10 changes WHERE the create-time note lands (the card's per-company column, not the `deal_change_input` log) and does NOT back-fill any existing `deal_change_input` create-time notes - those rows are left as-is.
- Push the whole Phase 1 + Phase 2 + Phase 3c batch together, in timestamp order; local-first, cloud push is deferred and Muskan-coordinated (she holds a migrations lock until her own cloud push).

App code that ships with the same PR (not a DB step): the plan-03 edits to `types.ts`, `actions.ts`,
`reads.ts`, `EditDealForm`, `DealPin`, `DealForm`, `CardFront`.

### Phase 3d - Margin per product

Deal-domain only and additive (one widening column ALTER on an empty table + one `create or replace`
function body). **Nothing of Muskan's catalogue/product schema or RLS is touched.** Apply order is
timestamp order:

| # | Migration file | What it does |
|---|----------------|--------------|
| 11 | `20260618130000_resize_dli_private_columns.sql` | Widens `deal_line_item_private.seller_margin` + `buyer_metric` from `NUMERIC(6,4)` to `NUMERIC(15,4)` (a real price precision, matching `product_cost.cogs`, D-07). Additive/structural; the table has 0 rows in every environment, so the widening ALTER is instant and lossless. |
| 12 | `20260618130100_confirm_deal_change_margin_carry.sql` | `create or replace confirm_deal_change`: re-emits the full `20260618120110_confirm_deal_change_notes.sql` body unchanged and adds ONE product_id-keyed `deal_line_item_private` carry-forward INSERT inside the both-accept commit block, so a side's per-line private input survives a version bump (D-08). Supersedes the function body of #9 (`20260618120110`). |
| 13 | `20260618130200_create_deal_draft_retire_private_box.sql` | `create or replace create_deal_draft`: re-emits the full `20260618120200_create_deal_draft_notes.sql` body verbatim MINUS the section-3 `deal_party_field` private-box INSERT (D-11/D-09). The per-line margin now lives in `deal_line_item_private`, so the old create-time write into `deal_party_field` has no reader left - removing it drops a dead, unreadable-by-design row. `p_private_value` stays in the 11-arg signature (positional-call compatibility) but is accepted-but-ignored. Supersedes the function body of #10 (`20260618120200`). |

Cautions for the cloud apply:
- #12 lands AFTER `20260618120110_confirm_deal_change_notes.sql`, so a cloud push runs Phase 3c's note body and then immediately Phase 3d's `create or replace` - it ends in the correct final `confirm_deal_change` state; the intermediate version is never used mid-push.
- #13 lands AFTER `20260618120200_create_deal_draft_notes.sql`, so a cloud push runs Phase 3c's `create_deal_draft` note body and then immediately Phase 3d's `create or replace` - it ends in the correct final `create_deal_draft` state (the section-3 private box dropped); the intermediate version is never used mid-push.
- #13's matching app change (createDeal stops forwarding the private value and writes the per-line `deal_line_item_private` rows after birth) is **App code that ships with the same PR (not a DB step)**: plan 05's edit to `src/modules/deals/actions.ts`. The DB half (#13) and the app half (plan 05) must ship together.
- #11 is a lossless widening ALTER on an empty table (0 rows in every environment); a widening type change cannot truncate. If ever re-run against a populated table, re-confirm no value exceeds the new precision first.
- The carry-forward in #12 does NOTHING until the app change ships: `proposeDealChange` must add `productId` to the held draft's `line_items` map, otherwise the new-version line's `product_id` is NULL and the carry-forward join matches nothing. This is **App code that ships with the same PR (not a DB step)**: plan 03's edit to `src/modules/deals/actions.ts` (the `productId` addition to the draft builder). The DB half (#12) and the app half (plan 03) must ship together.
- Push the whole Phase 1 + Phase 2 + Phase 3c + Phase 3d batch together, in timestamp order; local-first, cloud push is deferred and Muskan-coordinated (she holds a migrations lock until her own cloud push).

App code that ships with the same PR (not a DB step): the plan-03 / plan-05 edits to `actions.ts`
(the `productId` draft fix + the per-line private write), `reads.ts`, `types.ts`, `DealForm`,
`EditDealForm`, `CardFront`.

### Phase 3f - Batches end-to-end

Deal-domain only and additive (two new columns + one index + two `create or replace` function
bodies + a demo seed in `seed.sql`). The migration ADDS a FK from `deal_line_item.batch_id` to
Muskan's `product_batch(id)`, but it does NOT alter `product_batch` itself or any catalogue
schema/RLS - it only references an existing table. Apply order is timestamp order:

| # | Migration file | What it does |
|---|----------------|--------------|
| 14 | `20260618140000_deal_line_item_batch.sql` | Adds `deal_line_item.batch_id UUID NULL REFERENCES product_batch(id)` + `batch_number VARCHAR(60) NULL` (nullable; required is form-enforced, D-01/D-02) + `idx_deal_line_item_batch`. `create or replace create_deal_draft`: re-emits the full `20260618130200` body, changing ONLY the section-2 line insert to write `batch_id`/`batch_number`/`thc_percent`/`cbd_percent` into the REAL columns on birth (D-03/D-04; fixes the dead-metadata latent bug). `create or replace confirm_deal_change`: re-emits the full `20260618130100` body, (a) carrying the same four fields forward verbatim from the held draft on a version bump (snapshot-through-draft, no product_id JOIN, D-04; fixes the drop-on-bump latent bug) and (b) upgrading the 3d `deal_line_item_private` margin carry-forward join to key on `product_id` AND `batch_id` (`new_line.batch_id is not distinct from old_line.batch_id`, D-09) so two batches of one product keep their own margins. Supersedes the function bodies of #12 and #13. |
| 15 | `20260618150000_confirm_detected_deal_batch.sql` | `create or replace confirm_detected_deal`: re-emits the full live body VERBATIM, changing ONLY the `jsonb_build_object` that maps the proposal-message draft `line_items` into `create_deal_draft`'s `p_lines` - ADDS `batchId`/`batchNumber`/`thcPercent`/`cbdPercent` so the batch snapshot survives the PROPOSAL birth door (proposeDeal -> `deal_detected` -> accept -> `confirm_detected_deal` -> `create_deal_draft`). #14 wired the snapshot through the DIRECT createDeal path + version bumps but NOT this proposal path, so a picked batch was silently dropped the moment the other side accepted a proposal. Caught by the Plan 05 batch-snapshot e2e (Rule 1 bug). Pairs with the `proposeDeal` app change (`actions.ts`) that puts the four keys onto the draft line. Deal-domain only; no catalogue/RLS touched. |

Cautions for the cloud apply:
- #14 lands AFTER `20260618130100` (margin carry) and `20260618130200` (retire private box), so a cloud push runs Phase 3d's bodies and then immediately Phase 3f's `create or replace` for each RPC - it ends in the correct final state; the intermediate version is never used mid-push.
- The new `batch_id` FK targets `product_batch`, which exists on cloud already (0 rows). Confirm the `product_batch` table is present before pushing (it is, as of writing). No catalogue schema or RLS of Muskan's is altered - only referenced.
- The demo `product_batch` seed lives in `seed.sql` (LOCAL `supabase db reset` only). Cloud is seeded separately/never by `db push`; coordinate any cloud demo-batch seeding with Muskan (she owns the catalogue surface).
- The matching app change (the batch picker + `batchId` flowing into the create/propose drafts) is **App code that ships with the same PR (not a DB step)**: plan 03F-03's edits to `types.ts`, `reads.ts`, `actions.ts`, `DealForm`, `CardFront`. The carry-forward + snapshot do nothing until that app half feeds `batchId`/`batchNumber`/`thcPercent`/`cbdPercent` into the draft lines.
- Push the whole Phase 1 + Phase 2 + Phase 3c + Phase 3d + Phase 3f batch together, in timestamp order; local-first, cloud push is deferred and Muskan-coordinated (she holds a migrations lock until her own cloud push).

---

## APPLIED TO CLOUD

### 2026-06-20 — combined batch (Muskan + Ayush), reconciled + pushed
Ran the "⚠️ READ FIRST" reconciliation against `byipusuthdlskdxoexkt`:
1. `migration repair --status reverted` × 47 (cleared wrong-timestamp records)
2. `migration repair --status applied` × 49 (already-applied/superseded — incl. `profile_qr_foundation`, `get_public_profile`, no-op `seed_demo_world`, `confirm_detected_deal_proposer_initiator` superseded by `confirm_detected_deal_batch`)
3. `db push` — **25 applied, 0 errors**, in timestamp order `deal_pending_change` → `oauth_person_trigger_fix`

Result: cloud history = **74**, matches local. Security advisor: **0 errors** (warnings all pre-existing/by-design). No demo seed pushed. `oauth_person_trigger_fix` live → Google/Azure sign-up unblocked.

Post-push: `.env.local` flipped to cloud; Google + Azure enabled in dashboard. Open: drop orphan `avatars_read` policy (cosmetic); 6.1 cloud UAT (sign-up tests 10–12).

### 2026-06-20 — canonical display_name (single migration)
`20260620120000_canonical_display_name.sql` pushed via a clean sequential `db push` (1 migration; history already reconciled, no repair needed). Updates `handle_new_user` to set the canonical `display_name` on every signup path + one-time backfill of existing rows. **Applied, 0 errors; cloud history = 75.** Verified: the test account's `display_name` backfilled, `profile_complete = true`. (See DECISIONS.md 2026-06-20 canonical-name entry.)
