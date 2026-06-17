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

---

## APPLIED TO CLOUD

*(none yet — move rows here with the date once `supabase db push` is run)*
