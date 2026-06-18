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

## How to push the pending migrations to cloud (Phase 1 + Phase 2 — one batch)

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
| 6 | `20260617140000_confirm_deal_change_announce.sql` | `create or replace confirm_deal_change`: re-emits the whole Phase 1 body unchanged and adds two `sender='sella'` `chat_message` inserts — one into the deal thread + one into the p2p thread — on the decline branch and on the both-accepted commit branch. Supersedes the function body of `20260617120000_..._no_seal_write`. `withdraw_deal_change` is untouched (Withdraw stays silent). |
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
| 8 | `20260618120000_deal_card_notes.sql` | Two nullable per-company note columns (`note_company_a` / `note_company_b`) on `deal_card`, mapped to `relationship.company_a_id` / `company_b_id`. Adds `deal_card` to the `supabase_realtime` publication. No new RLS policy - the existing row-level `card_all` policy already covers every column on the table. |
| 9 | `20260618120100_confirm_deal_change_notes.sql` | `create or replace confirm_deal_change`: re-emits the full `20260617140000_confirm_deal_change_announce.sql` body unchanged and adds two CASE writes inside the both-accept commit block - the proposer's note lands in their slot only (`note_company_a` if `v_proposer_co = v_ca`, else `note_company_b`). The other side's note column is left untouched. Supersedes the function body of #6 (`20260617140000`). |
| 10 | `20260618120200_create_deal_draft_notes.sql` | `create or replace create_deal_draft`: re-emits the full `20260612011145_two_owner_create_deal_draft.sql` body unchanged except the note block - the birth note now writes to the creator's card slot (`note_company_a`/`note_company_b`) instead of inserting into `deal_change_input`. Same 11-arg signature. Supersedes the function body of `20260612011145`. |

Cautions for the cloud apply:
- #9 lands AFTER `20260617140000_confirm_deal_change_announce.sql`, so a cloud push runs Phase 2's announce body and then immediately Phase 3c's `create or replace` - it ends in the correct final `confirm_deal_change` state; the intermediate version is never used mid-push.
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
| 12 | `20260618130100_confirm_deal_change_margin_carry.sql` | `create or replace confirm_deal_change`: re-emits the full `20260618120100_confirm_deal_change_notes.sql` body unchanged and adds ONE product_id-keyed `deal_line_item_private` carry-forward INSERT inside the both-accept commit block, so a side's per-line private input survives a version bump (D-08). Supersedes the function body of #9 (`20260618120100`). |
| 13 | `20260618130200_create_deal_draft_retire_private_box.sql` | `create or replace create_deal_draft`: re-emits the full `20260618120200_create_deal_draft_notes.sql` body verbatim MINUS the section-3 `deal_party_field` private-box INSERT (D-11/D-09). The per-line margin now lives in `deal_line_item_private`, so the old create-time write into `deal_party_field` has no reader left - removing it drops a dead, unreadable-by-design row. `p_private_value` stays in the 11-arg signature (positional-call compatibility) but is accepted-but-ignored. Supersedes the function body of #10 (`20260618120200`). |

Cautions for the cloud apply:
- #12 lands AFTER `20260618120100_confirm_deal_change_notes.sql`, so a cloud push runs Phase 3c's note body and then immediately Phase 3d's `create or replace` - it ends in the correct final `confirm_deal_change` state; the intermediate version is never used mid-push.
- #13 lands AFTER `20260618120200_create_deal_draft_notes.sql`, so a cloud push runs Phase 3c's `create_deal_draft` note body and then immediately Phase 3d's `create or replace` - it ends in the correct final `create_deal_draft` state (the section-3 private box dropped); the intermediate version is never used mid-push.
- #13's matching app change (createDeal stops forwarding the private value and writes the per-line `deal_line_item_private` rows after birth) is **App code that ships with the same PR (not a DB step)**: plan 05's edit to `src/modules/deals/actions.ts`. The DB half (#13) and the app half (plan 05) must ship together.
- #11 is a lossless widening ALTER on an empty table (0 rows in every environment); a widening type change cannot truncate. If ever re-run against a populated table, re-confirm no value exceeds the new precision first.
- The carry-forward in #12 does NOTHING until the app change ships: `proposeDealChange` must add `productId` to the held draft's `line_items` map, otherwise the new-version line's `product_id` is NULL and the carry-forward join matches nothing. This is **App code that ships with the same PR (not a DB step)**: plan 03's edit to `src/modules/deals/actions.ts` (the `productId` addition to the draft builder). The DB half (#12) and the app half (plan 03) must ship together.
- Push the whole Phase 1 + Phase 2 + Phase 3c + Phase 3d batch together, in timestamp order; local-first, cloud push is deferred and Muskan-coordinated (she holds a migrations lock until her own cloud push).

App code that ships with the same PR (not a DB step): the plan-03 / plan-05 edits to `actions.ts`
(the `productId` draft fix + the per-line private write), `reads.ts`, `types.ts`, `DealForm`,
`EditDealForm`, `CardFront`.

---

## APPLIED TO CLOUD

*(none yet — move rows here with the date once `supabase db push` is run)*
