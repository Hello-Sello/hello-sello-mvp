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

## ✅ APPLIED 2026-07-22 — Lane A (deal creation & delivery) + Ayush's group-thread gate drop, 6 migrations

Pushed to production ahead of the `dev` → `main` merge (Muskan's explicit call, PR review skipped for
`create_deal_draft`/`claim_deal_ticket` — same override precedent as DEV-88 — since `create_deal_draft`
is on the golden path for every deal creation and shipping the app code without these live would break
deal creation/delivery/pickup in production). See **APPLIED TO CLOUD** below for the full record.

## ✅ RECONCILED 2026-07-22 — cloud `schema_migrations` history now matches local filenames (the pre-Lane-A reconcile pass CLAUDE.md #0 flagged as owed)

Every migration applied via `mcp__supabase__apply_migration` (rather than a CLI `db push`) gets stamped
with the *call time* as its version, not the local file's timestamp — that's what caused the divergence
this ledger has been carrying since the 2026-07-08 Buy-era batch. Reconciled by directly `UPDATE`ing
`supabase_migrations.schema_migrations.version` (the same effect as `supabase migration repair`, just
via SQL since no linked CLI session was available) — **21 rows repaired to their real local filenames**,
0 schema/data change, verified no version collisions before each batch:

- The 2026-07-22 Lane A + group-thread-gate batch (6, applied earlier this session — see above)
- The 2026-07-08 Buy-era batch (10): `product_basket_line`, `chat_thread_member`, `group_thread_rls`,
  `create_group_thread_rpc`, `deal_artifacts_storage`, `thing_stage_code_nullable`,
  `confirm_detected_deal_born_now`, `deal_event_system_voice`, `deal_promotion`, `lifecycle_status_codes`
- Session 64's direct pushes (2): `person_company_id_lockdown`, `drop_buy_orphaned_tables`

**⚠️ One entry deliberately NOT reconciled:** `20260708155722_buy_schema` — Buy's schema migration file
was stripped from git in session 64 (its tables already dropped by `drop_buy_orphaned_tables`), so there
is no local file to repair it against. This one row will still trip "remote migration version not found
locally" on a future plain `supabase db push` — the only full fix would be re-adding a no-op placeholder
file, which is a call for whoever next needs a clean CLI push, not a mechanical repair.

**Full history is now clean** except that single known exception. This closes the CLAUDE.md #0 "pre-Lane-A
reconcile pass" item.

## ✅ STATUS 2026-07-07 (historical) — cloud == local, tip `20260707090000`

Every migration through `20260707090000` is applied to cloud. The most recent batch (**9 migrations** —
DEV-99 taxonomy + Phase 7 Present + Phase 13 lifecycle + Allocate) was pushed **2026-07-07** (0 errors,
`get_advisors(security)` = 0 ERROR); see the top of **APPLIED TO CLOUD**. All "PENDING" sections below
that predate this entry are **historical / superseded** — kept for their apply notes, not because
anything from THEM is outstanding (see the 2026-07-20 marker above for what actually is).
The ONLY genuinely-outstanding cloud work THIS entry knew about is **non-migration**: deploy edge fns
`send-lifecycle-email` + `erase-expired-accounts`, set `RESEND_API_KEY`, and (optional) unschedule the
harmless `erase-expired-accounts` 3am cron. Details in the 2026-07-07 APPLIED entry.

---

## ✅ APPLIED 2026-08-16 — tier-ladder Migration E (1 migration; Migration C still HELD below)

**`20260814120000_tier_ladder_expand.sql` is LIVE on production** (applied 2026-08-16 via
`mcp apply_migration`, file content byte-diffed against the local file before sending; history row
repaired from the call-time stamp to `20260814120000` per the 2026-07-22 reconcile convention).
Sequence + verification record:

1. **Precondition cleared by Muskan (manual, 2026-08-16):** the orphan `20260708155722 buy_schema`
   history row deleted (history-table-only; verified gone — 115 rows remained, none matching).
2. **Diff-against-live honored** for all 3 function re-declares before apply:
   `list_discoverable_companies` = live body verbatim + exactly the restored
   `is_caller_verified()` predicate + full 3-statement grant ritual; `import_products` = live
   body + the documented dual-write only; `get_discoverable_shop` = DROP+CREATE off the live
   sec01 base (+ view join, visibility window, tiers — all G3-signed).
3. **Post-apply verification (all green):** the 🚨 security repair is CONFIRMED live —
   `list_discoverable_companies()` body now contains `is_caller_verified()`, anon has NO
   EXECUTE on it, anon has NO SELECT on `pricelist_item_tier`, RLS enabled on the tier table.
   Backfill: **0 migrated / 0 rescued** (production had no bundle brackets set — clean no-op).
4. **Advisors:** exactly 1 ERROR — `security_definer_view` on `current_pricelist_item`,
   **pre-declared and accepted in ADR-0004 §4** (owner-rights view is the design) — plus the
   same 126 benign WARNs as every prior batch.
- **Types: NO cloud regen needed (supersedes the earlier note).** `database.types.ts` already
  carries the tier table/view shapes (regenerated from LOCAL in T01); regenerating from cloud
  now would silently DROP the local-only Discover-batch tables from the types. Regen from cloud
  only after the Discover batch ships.

**✅ Migration C APPLIED 2026-08-16 — `20260816190000_tier_ladder_contract.sql` LIVE on production.**

Both hold conditions were met the same day: (1) the tiers-reading app went LIVE via the
Phase-12/dev→main deploy (`714d738`, G5 walk passed); (2) all three bodies (view,
`get_discoverable_shop`, `import_products`) re-diffed against the live `pg_get_viewdef` /
`pg_get_functiondef` — **zero drift**, only the two documented C deltas. Fresh timestamp per
condition (3); `.hold` file moved into `supabase/migrations/` (git rename). Record:
- **Verified live post-apply:** both bundle columns gone, `backfill_bundle_to_tiers` gone,
  `get_discoverable_shop` OUT row tiers-only, anon blocked on view + shop fn,
  `is_caller_verified()` present in the shop fn body. History stamp repaired to
  `20260816190000`.
- **Ride-alongs shipped same commit (`6f4f317`):** seed §6c stripped; tier SQL suite updated to
  the post-C contract (backfill + dual-shape sections retired) — suite + race proof PASS from a
  fresh reset; `database.types.ts` regenerated from LOCAL (update_deal_draft nullable-args
  hand-fix retained); dead `bundle*` fields removed from `src/app/discover/companies.ts`
  (zero consumers).
- **Known pre-existing e2e failures (NOT C):** 15 auth/team/email-class tests fail on dev with
  or without C (A/B-verified on a no-C reset) — the documented `sb_secret_`/GoTrue admin-API
  deferral (CLAUDE.md loose end (b)). Deals/pricing/tier/discover e2e all pass.
- ~~**⚠️ PRE-PUSH PRECONDITION**~~ **CLEARED 2026-08-16:** the orphan `20260708155722
  buy_schema` history row was deleted manually by Muskan (see the APPLIED record above).
  Plain `supabase db push` is no longer blocked by it.

---

## ✅ APPLIED 2026-08-16 — Phase-12 deal status machine, 13 migrations (Ayush's wave, pushed by Muskan)

**LIVE on production 2026-08-16** — all 13 applied via `mcp apply_migration` in filename order
(review-skip = Muskan's explicit call, solo-owner / DEV-88 precedent), then **dev→main merged and
Vercel deploy READY back-to-back** (commit `714d738`) per the same-deploy rule — no window where
the old app wrote against the revoked door. Record:

1. **Pre-push insurance re-run:** 22 cards / 5 statuses (draft 13, cancelled 3, confirmed 2,
   done 2, withdrawn 2) — matched the recorded run; no unknown codes, backfill covered all.
2. **Post-apply state:** negotiation 13 · cancelled 5 · confirmed 2 · done 2; the three retired
   lookup rows deleted; default now `'unsent'`.
3. **Grants verified live:** `deal_card` INSERT/UPDATE/DELETE revoked from authenticated+anon
   (CR-01); `deliver_deal` EXECUTE revoked incl. PUBLIC (WR-01 — ACL now postgres+service_role
   only); all 8 new/replaced RPCs present with authenticated EXECUTE.
4. **History stamps repaired** to `20260724120000`–`20260724121200` (2026-07-22 reconcile
   convention; verified all 13 rows).
5. **Bodies live == local files byte-for-byte** (`confirm_deal_change` re-emitted verbatim after
   an initial comment-trimmed apply — zero functional delta; diff-against-live stays clean).
6. **Not re-run on prod:** the SQL harness (rls_isolation / deliver_deal / claim_deal_ticket) —
   those suites write fixtures and are local-only; live verification was done via the grant +
   status checks above instead. Local runs PASSED 2026-07-24 from a clean reset.

*(Original batch documentation kept below for reference.)*

The whole board-Wave-2 status machine: birth/send split, status vocabulary rename, server-side
transition authority, draft privacy RLS, and the client status-write revoke. Applied LOCAL via
`supabase db reset` (green, 2026-07-24) + proven by the re-timed SQL harness (`rls_isolation` /
`deliver_deal` / `claim_deal_ticket`, all PASSED). **Push all 10 together, in timestamp order** -
they are one chain (lookup rows before RPCs that write them; the REVOKE sorts last so transitions
always have an RPC path before the raw door closes).

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260724120000_status_vocab_unsent_negotiation.sql` | Lookup rows `unsent` + `negotiation`, 3-line backfill (`draft`->`negotiation`, `amended`->`confirmed`, `withdrawn`->`cancelled`), default flip to `'unsent'`, retired-code delete, `deal.sent` audit rider |
| 2 | `20260724120100_confirm_deal_change_negotiation_membership.sql` | `confirm_deal_change` re-emit: commit writes `negotiation`; adds the missing relationship-membership guard (closes the foreign-decline forge hole) |
| 3 | `20260724120200_create_deal_draft_private_birth.sql` | Slim `create_deal_draft`: births PRIVATE `'unsent'`, no delivery/co-owner/birth thread; persists the picked counterparty in `metadata.counterparty_person_id` |
| 4 | `20260724120300_send_deal.sql` | NEW `send_deal(uuid)` - the ONE delivery writer: guards + flip to `negotiation` + co-owner + `deliver_deal` + p2p deal pill + log, in one transaction |
| 5 | `20260724120400_confirm_detected_deal_births_negotiation.sql` | Sella double-accept door births straight into `negotiation` (delivered-by-construction; never routes through `send_deal`) |
| 6 | `20260724120500_sign_deal.sql` | `sign_deal(uuid)`: fixed-signer guard (initiator can never sign) + own-held-change guard + atomic nested change-commit + flip to `confirmed` |
| 7 | `20260724120600_deal_transition_rpcs.sql` | `decline_deal` / `finalize_deal` / `reopen_deal_ticket` / `close_deal_ticket` definers with the ported action guards |
| 8 | `20260724120700_draft_privacy_rls.sql` | D-08 helper narrow (`card_relationship_member`: `unsent` visible to the initiating company only) + `card_all` re-create + `deal_confirmation` SELECT-only |
| 9 | `20260724120800_drop_propose_edit_rpcs.sql` | Drops the dead two-sided-confirm era `propose_deal` + `edit_deal_draft` |
| 10 | `20260724120900_revoke_deal_card_status_writes.sql` | `REVOKE UPDATE ON deal_card FROM authenticated, anon` - all client status writes go through the RPCs (sorts LAST deliberately) |

- **⚠️ SAME-DEPLOY RULE (agreed board Wave 0):** the cloud push of this wave MUST ship in the
  same deploy as the app-side rename sweep AND Muskan's `statusOf` / `batches.ts` /
  `connections-shape.ts` / seed edits. Her `.in('status', ...)` filters keyed on the old codes
  return **empty silently** against the renamed vocabulary - no error, just missing calendar
  pills/worklist rows. DB half + app half are one unit.
- **Pre-push insurance (RESEARCH A1):** run `SELECT status, count(*) FROM deal_card GROUP BY 1`
  on CLOUD first. The backfill covers `draft`/`amended`/`withdrawn`; any UNKNOWN status code
  left behind would FK-fail the retired-lookup delete loudly mid-push. Know the answer before
  pushing, not during.
- **Before/after push, run the harness:** `supabase/tests/rls_isolation_test.sql`,
  `bash supabase/tests/run_deliver_deal_test.sh`, `bash supabase/tests/run_claim_deal_ticket_test.sh`
  (all three re-timed to the birth/send split; PASSED locally 2026-07-24).
- **Migration before code** - the Wave-2 app code (thin RPC actions, sendDeal, the rename sweep)
  errors on cloud without these live (dropped RPCs + renamed statuses + the revoke).

### Wave 3 addendum (2026-07-24, board Wave 3) - 3 NEW + 3 edited-in-place, same batch

Wave 3 (DecisionBar fixed roles + the Phase-12 review fixes) edits three of the 10 above IN PLACE
(still local-only, so the edits ride the same push) and adds three new migrations. **Push all 13 as
ONE batch, in timestamp order, together with the app code.**

| # | Migration file | What Wave 3 changed |
|---|----------------|---------------------|
| 2* | `20260724120100_confirm_deal_change_negotiation_membership.sql` | + WR-03 card-lock-before-pending-lock (deadlock fix); + IN-01 metadata MERGE instead of replace (keeps `counterparty_person_id` on commit) |
| 7* | `20260724120600_deal_transition_rpcs.sql` | + WR-02 `decline_deal` negotiation-only guard (`unsent` raises, `confirmed`->`cancelled` dropped, `cancelled`/`done` idempotent); + WR-04 `finalize_deal` membership check moved ABOVE the `done` early-return (closes the status oracle) |
| 10* | `20260724120900_revoke_deal_card_status_writes.sql` | CR-01 widened: `REVOKE INSERT, UPDATE, DELETE` (was UPDATE only) - closes the forged-born-`confirmed` INSERT door + the DELETE door |
| 11 | `20260724121000_revoke_deliver_deal_execute.sql` | WR-01 `REVOKE EXECUTE ON deliver_deal FROM public, authenticated, anon`. `deliver_deal` is ALREADY ON CLOUD, so this is a NEW forward migration (an in-place edit would never reach prod). ⚠️ **`FROM public` is load-bearing** - a plain `authenticated, anon` revoke leaves PUBLIC's default EXECUTE grant intact. Nested `send_deal`/`confirm_detected_deal` callers run as owner, unaffected. |
| 12 | `20260724121100_update_deal_draft.sql` | CR-02 NEW `update_deal_draft` RPC (initiator-only, `unsent`-only, rewrites v1 in place, no version bump, no pending row). ⚠️ deletes+reinserts v1 `deal_line_item` -> the ON-DELETE-CASCADE drops per-line `deal_line_item_private`; the app caller re-writes them after (same as `createDeal` after birth). |
| 13 | `20260724121200_chat_message_type_pills_seed.sql` | E1 seed 2 pill types: `deal_change_proposed` + `deal_negotiation_requested` (additive, `on conflict do nothing`). |

- **Proven LOCAL 2026-07-24:** `supabase db reset` green; 8 new/extended SQL suites PASS from a clean reset (`rls_isolation`, `deliver_deal`, `decline_deal`, `finalize_deal`, `confirm_deal_change_lock_order`, `confirm_deal_change_metadata_merge`, `update_deal_draft`, `chat_message_type_pills_seed`). Deal e2e 19 pass / 5 skip; 221/221 unit; `next build` clean.
- **CR-01 (#10*) MUST be in this push** - it closes a real forged-signature hole. It is included above.
- **Same-deploy rule still holds:** DB batch (13) + the Wave-2/3 app code ship as ONE unit; the pre-push `SELECT status, count(*) FROM deal_card GROUP BY 1` insurance query above still applies.

---

## ⚠️ PENDING (2026-07-10, Muskan) — 1 migration: person.company_id self-write lockdown (SECURITY)

- **`20260710120000_person_company_id_lockdown.sql`** — closes the cross-tenant self-join hole
  (any authenticated user could `UPDATE person SET company_id = <any>` on their own row via a
  direct API call and read that company's private data). Two parts, one migration:
  1. `REVOKE UPDATE ON person FROM authenticated` + re-`GRANT UPDATE` on every column **except**
     `company_id`. (A column-only `REVOKE (company_id)` does NOT work — Supabase's table-level
     grant overrides it; same lesson as the allocate-schema note.)
  2. `onboard_company` → `SECURITY DEFINER` so founder onboarding can still set `company_id`.
- **⚠️ PRODUCTION IS STILL VULNERABLE until this is pushed** — cloud has the same base RLS + table
  grant. Push together with any other pending migration; additive + safe (no data change). Apply
  the two halves atomically (this one migration does that).
- **Before/after push, run:** `bash supabase/tests/run_person_company_lockdown_test.sh` (proves the
  direct write is denied + onboard_company still links). Local: RED→GREEN verified 2026-07-10.
- **Needs Ayush review before cloud** — base RLS (`20260607170000`) + the onboarding security model
  are the shared lane. Tracked: DEV-88 (Urgent).

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

### 2026-07-24 (Muskan) — Discover person↔person social graph (Lane B, PG-1..7) — ⏳ PENDING

| # | Migration | What it does |
|---|-----------|--------------|
| 1 | `20260724100000_person_connection.sql` | New `person_connection` edge table (person↔person social graph, independent of company `relationship`) + canonical-order CHECK + one-active-edge partial unique index + SELECT-only RLS. |
| 2 | `20260724100100_inbox_person_target.sql` | `pending_inbox_item` gains `receiver_person_id` + `connect_person` type; **`receiver_company_id` made NULLABLE** + 4 per-type CHECKs (exactly one of person/company target). |
| 3 | `20260724100200_inbox_person_rls.sql` | `inbox_select`/`inbox_update` rebuilt from live, adding ONLY `OR receiver_person_id = auth.uid()`. |
| 4 | `20260724100300_p2p_companyless_dedup.sql` | Partial unique index `uq_chat_thread_p2p_companyless` — one company-less p2p DM thread per pair. |
| 5 | `20260724100400_accept_person_connection.sql` | `accept_person_connection(uuid)` SECURITY DEFINER — edge + company-less p2p thread + intro, no `relationship`, no `planRollout`. |
| 6 | `20260724100500_is_person_connected.sql` | `is_person_connected(uuid)` SECURITY DEFINER visibility helper. |
| 7 | `20260724100600_person_select_person_branch.sql` | `person_select` rebuilt from live + `is_person_connected(id)` branch (see a person you're personally connected to). |
| 8 | `20260724100700_list_my_person_connections.sql` | `list_my_person_connections()` SECURITY DEFINER — My Network people (safe fields + verified gate). |
| 9 | `20260724100800_list_incoming_person_requests.sql` | `list_incoming_person_requests()` SECURITY DEFINER — incoming person requests (sender safe fields + verified gate). |
| 10 | `20260724100900_list_discoverable_companies_reinstate_verified_gate.sql` | Restore the SEC-01 `is_caller_verified()` gate on `list_discoverable_companies` (security regression — unverified callers could read the directory since 2026-06-17). |
| 11 | `20260724101000_list_discoverable_people.sql` | `list_discoverable_people()` SECURITY DEFINER — People directory (safe fields + type_codes + per-person connection_state + verified gate). |
| 12 | `20260724101100_list_my_person_connections_thread_id.sql` | Add the p2p DM `thread_id` to `list_my_person_connections` (the My Network Message button; rebuilt from live + LEFT JOIN, DROP+CREATE for the new OUT column). |
| 13 | `20260724101200_realtime_discover_connections.sql` | Add `pending_inbox_item`, `person_connection`, `relationship` to the `supabase_realtime` publication so Discover requests + accepts reflect instantly on both sides (live change-capture, same pattern as chat). Publication membership only — no schema/RLS change. |

- **Status:** local-first; applied via `supabase db reset` (GREEN chain + seed) + 5 new pgTAP suites green + 2 existing suites (`join_request_isolation`, `person_company_lockdown`) regression-green (session 2026-07-24). **Not pushed to cloud.** No `database.types.ts` regen needed yet (app-layer reads land next).
- **⚠️ Touches Ayush's base lane** (`pending_inbox_item` schema + inbox RLS, `chat_thread` index). Rebuilt inbox RLS from the LIVE body per the create-or-replace lesson; sync-locked while editing. The `receiver_company_id`-nullable + polymorphic-target call is flagged for his review in `docs/team/sync/muskan.md`.
- **Migration before code** — the Discover person-connect actions/reads (PG-8+) call `accept_person_connection` + read `person_connection`; shipping the app without these 5 breaks person connect on cloud. Push the whole set together, in timestamp order.
- **Realtime (row 13)** — live change-capture for the connection lifecycle; verified live in-browser (instant send + accept across two sessions). Publication membership only, no schema/RLS change. Two of the three tables it publishes (`pending_inbox_item`, `relationship`) are Ayush's — flagged for him in the sync file. On cloud, Realtime picks up the new publication tables automatically at apply time.

### 2026-07-07 (Muskan) — Allocate/Sell schema (DEV-76) — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|---------------|
| 1 | `20260707090000_allocate_schema.sql` | 3 lookup tables + 6 columns + 4 seller-gated `SECURITY DEFINER` RPCs backing the Allocate page (Orders & Offers + Batches allocator). Additive only — no existing catalogue/deal schema altered, only referenced (`deal_card`, `deal_line_item`, `product_batch`). |

- **Status:** local-first; applied via `supabase db reset` (GREEN) + `database.types.ts` regenerated. Gate green (tsc + eslint + 21/21 unit) + browser + DB-probe verified (session 53, 2026-07-07). **Not pushed to cloud.**
- **Migration before code** — Allocate's server actions call the 4 RPCs directly; shipping the app without this migration 404s every Allocate read/write.
- **⚠️ Known residual after push:** [DEV-159](https://linear.app/hellosello/issue/DEV-159) (High) — a buyer can forge allocation state via a direct table write (symmetric base RLS gap, same family as DEV-88). Non-blocking for a no-real-users demo; fix is Ayush's base-RLS lane.
- **Push:** sorts last in the current pending set (`20260707090000` — after Phase 13's `20260706090xxx` and Phase 7's `20260706120000`); a single sequential `supabase db push` handles it with everything else, in timestamp order.

### 2026-07-06 (Muskan) — Phase 7 Present fidelity + card-front batch schema — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|--------------|
| 1 | `20260706120000_product_terpene_percent.sql` | **F-02.** `alter table public.product add column if not exists terpene_percent numeric;` — one headline total-terpenes value, editable inline on the card. Additive, nullable, **no backfill** (existing rows read NULL and fall back to the derived batch-terpene sum). The ONLY schema change of the whole fidelity pass. |

- **Status:** local-first; applied via `supabase db reset` (GREEN) + `database.types.ts` regenerated from local. **Not pushed to cloud.**
- **Sibling Phase-7 migrations also still local-only** (from 07-03/04/05, appear to predate this ledger's PENDING list): `20260705120000_product_location.sql`, `20260705120100_product_media.sql`, `20260705120200_shop_media_allow_pdf.sql`. Push the whole Phase-7 set together, in timestamp order, when the human deploys.
- **Migration before code** — `shop.ts` reads `product.terpene_percent`; shipping the app without this column errors the Present read on cloud.
- **Push:** a clean single `supabase db push` from a LINKED machine, in timestamp order (`20260706120000` sorts last). Coordinate with Ayush if his lane added migrations in the meantime.

### 2026-07-05 (Muskan) — DEV-99 #3 business-category taxonomy — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|--------------|
| 1 | `20260704090000_business_category_taxonomy.sql` | NEW `business_category` lookup (6 rows incl. `custom`) + `company_business_category` junction (nullable `custom_label`; CHECK = label present **iff** `code='custom'`; RLS `business_category_read` + `cbc_all` scoped to `current_company_id()`). Grows `company_type` (Activity) 4→8 to Marcel's list; **remaps** legacy `cultivator`→`eu_gmp_cultivator` then drops it; **backfills** the `pharma` category onto every company that has an activity. `CREATE OR REPLACE onboard_company` — **drops the old 3-arg**, adds a 5-arg (`+p_category_codes text[]`, `+p_custom_category text`) with a parallel category loop. Additive + idempotent. |

- **Status:** local-first; **rollback-verified** (`BEGIN…ROLLBACK`, non-destructive) — **not yet `migration up`'d even to local** (89 files on disk vs 88 rows in local `schema_migrations`; this is the 1 gap). Next session: `migration up` + update `seed.sql` to the new codes + `supabase db reset` to prove a clean replay + regen `database.types.ts`.
- **Migration before code** — the OnboardingStepper reads `business_category` and calls the 5-arg `onboard_company`; shipping app code without this migration errors onboarding.
- **⚠️ Drops the old 3-arg `onboard_company`** (the current cloud body). The `DROP FUNCTION public.onboard_company(text,text,text[])` + the new 5-arg must land as **one unit** — no window where only the old signature exists beside new app code.
- **Push:** a clean single `supabase db push` from a LINKED machine, in timestamp order (`20260704090000` sorts last, after any earlier pending batch). Coordinate with Ayush if his lane added migrations in the meantime.

### ⚠️ 2026-06-21 (Muskan) — verified against live cloud: the batch below is DONE; only Phase 10 remains

A live `list_migrations` on 2026-06-21 shows cloud's tip = `20260620120000_canonical_display_name`.
**Everything in the "READ FIRST" reconciliation and the Phase 1–3f / sec / verif / discover / city /
oauth / canonical_display_name lists below is now APPLIED to cloud** (reconciled + pushed 2026-06-20).
Those sections are kept for history only — they are no longer pending.

**Migrations still local-ahead-of-cloud:**

| Migration file | What it does | Push when / how |
|----------------|--------------|-----------------|
| `20260620160000_get_public_profile_verification.sql` | Adds `company_verification_status` (14th column) to the `get_public_profile` RPC → the verified pill on the public `/c/[handle]` card (Phase 10 / ACCT-01). | **Deferred** — Phase 10 isn't in prod. Push when it ships: a clean single `supabase db push` (cloud now matches local through `canonical_display_name`, no reconcile needed). **Migration before code** — if Phase 10 app code goes live without it, `/c/[handle]` errors (app reads a column the old RPC won't return). |

#### Phase 11 — RBAC activation + company team (Muskan, 2026-06-21, local-first) — NOT on cloud

6 migrations applied LOCAL only (clean `db reset` green; cloud tip is still `canonical_display_name`, so these push cleanly in timestamp order — **no reconcile needed**):

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260621100000_phase11_rbac_activation.sql` | `has_permission()` + `seed_company_superadmin()` (SECURITY DEFINER, `search_path=''`); **§9 lockdown** — `person_group`/`permission_matrix_entry` → SELECT-only; gated permission codes (`team.manage`, `company.edit_profile`) + `team.*` audit codes |
| 2 | `20260621110000_phase11_onboard_superadmin.sql` | `onboard_company` `CREATE OR REPLACE` — one additive `PERFORM seed_company_superadmin(...)` (founder→Superadmin); stays SECURITY INVOKER, `already_has_company` guard intact |
| 3 | `20260621120000_phase11_backfill_superadmin.sql` | idempotent backfill of existing companies' founders → Superadmin |
| 4 | `20260621130000_phase11_team_rpcs.sql` | `invite_member` / `change_member_role` / `remove_member` / `list_company_members` (SECURITY DEFINER, tenant-scoped, `has_permission`-gated, D-15 lockout) |
| 5 | `20260621140000_phase11_invite_accept_link.sql` | `handle_new_user` `CREATE OR REPLACE` — links invited person to company+role from invite metadata; additive + metadata-gated (password/Google/Outlook signups unchanged) |
| 6 | `20260621150000_phase11_lockout_race_fix.sql` | `pg_advisory_xact_lock` on the D-15 lockout (CR-01 race fix) + `record_invite_sent` audit RPC (WR-01/02) |

**Non-migration cloud steps — REQUIRED for live invite/remove (do WITH the push):**
- Set **`SUPABASE_SECRET_KEY`** in Vercel env (server-only service-role key) — `src/shared/db/admin.ts` / `inviteUserByEmail` / admin `signOut` all need it. Until then the local `sb_secret_` key 403s the GoTrue admin API (HS256 caveat) → invite/remove can't run end-to-end.
- Paste **`supabase/templates/invite.html`** into the cloud dashboard → Auth → Email Templates → **Invite** (`config.toml` is local-only; cloud templates are dashboard-managed).

**Cautions:**
- Migrations 2 + 5 are `CREATE OR REPLACE` of shared functions (`onboard_company`, `handle_new_user`). Both compose cleanly on top of cloud's current `handle_new_user` (canonical `display_name` @ `20260620120000`) — the invite-linking + founder-seed are additive. Confirm the final body before push.
- `supabase/seed/seed.sql` (founder-Superadmin backfill block + Carla demo member) is **LOCAL demo data only — never pushed** (cloud is seeded separately).
- **Migration before code** — when Phase 11 app code (`/team`, the account gate, `admin.ts`) goes to prod, these 6 must be on cloud first or those paths error.

#### Phase 12 — Path B (join existing company) (Muskan, 2026-06-22, local-first) — NOT on cloud

One additive migration. The `join_request` table + status enum (incl. `cancelled`) + `jr_*` RLS already exist from Phase 1; this adds only RPCs + one index + 4 audit codes. No non-migration cloud steps (pure DB — no new env var or email template).

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260622091500_phase12_join_request_rpcs.sql` | 5 SECURITY DEFINER RPCs (`search_joinable_companies`, `list_pending_join_requests`, `request_to_join`, `approve_join_request`, `reject_join_request`, `withdraw_join_request`) + the `uq_join_request_active_pending` partial-unique index (one active pending request, D-12) + 4 `join.*` audit action codes. All `search_path=''`, two-door granted. Additive only — no `create table`/`create type`/`auditable_content_type` insert. |
| 2 | `20260622100000_phase12_join_request_fixes.sql` | Code-review follow-up: `create or replace` of two RPCs from #1. **Fix A** — `request_to_join` rejects a caller who already belongs to a company (`current_company_id() is not null → raise`), closing a queue-pollution hole. **Fix B** — `approve_join_request` raises `'superadmin group missing'` instead of silently linking a Superadmin approval as an effective Member with a lying audit. No schema change; must be pushed in the same batch AFTER #1. |
| 3 | `20260622110000_phase12_pathb_followups.sql` | Review follow-ups #6 + #4. **#6** — `create or replace search_joinable_companies` escaping LIKE metacharacters (`\ % _`) so a literal `%`/`_` in the search box matches literally instead of as a wildcard. **#4** — `create or replace onboard_company` (full body re-emit of `20260621110000`; only change is added step 2c) that cancels the caller's pending `join_request` on Path-A company birth by reusing `withdraw_join_request`, so a "create my own company instead" no longer leaves a phantom in the target's queue. No schema change; push AFTER #2 (depends on `withdraw_join_request`). |

**Cautions:**
- ⚠️ **Timestamp renamed `20260622090000` → `20260622091500`** to avoid a collision with Ayush's merged `20260622090000_thing_artifact_visibility.sql`; the new stamp sits after his `20260622091000` tail. Independent of his deal migrations (mine touches only `join_request`/`company`/`person`/`audit_log` + the RBAC helpers `current_company_id()`/`has_permission()`).
- **Migration before code** — when the Phase 12 app code (onboarding Path B fork + the `/team` pending-requests queue) goes to prod, this must be on cloud first or those paths error (the RPCs won't exist).
- Push alongside the Phase 10/11 deferred batch (Muskan-coordinated, local-first).

---

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

### 2026-07-06 (Muskan) — Phase 13 Settings + Lifecycle Emails (SET-02/03/04) — ✅ MIGRATIONS APPLIED 2026-07-07 (edge fns + RESEND key still pending — see APPLIED TO CLOUD)

Local-first: a clean `supabase db reset` replays all three in order and stays green; the three SQL
invariants pass (`account_lifecycle`, `erasure_chain`, `notification_pref_rls`); `database.types.ts`
regenerated (additive — person/company lifecycle columns + `notification_*` tables). Three additive
migrations + two edge functions + one net-new edge secret. **Cloud push DEFERRED — this is a ledger
entry only; nothing below has been run against cloud.**

**Migrations (push in timestamp order, together):**

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260706090000_account_lifecycle.sql` | SET-02 sync half. Adds nullable lifecycle timestamps `person.deactivated_at` / `person.deletion_scheduled_for` / `person.anonymized_at` + `company.deactivated_at`; 6 `lifecycle` audit codes (`account.deactivated`/`reactivated`/`deletion_requested`/`deletion_cancelled`, `company.deactivated`/`reactivated`; `on conflict (code) do nothing`); 6 SECURITY DEFINER own-row/own-company RPCs (`deactivate_account`, `reactivate_account`, `request_account_deletion` [sole-Superadmin lockout], `cancel_account_deletion`, `deactivate_company` / `reactivate_company` [gated `has_permission('team.manage')`]). Additive only; **no base `person`/`company` grant or RLS widened** (DEV-88 discipline). |
| 2 | `20260706090100_notification_preference.sql` | SET-04 stub. 3 tables — `notification_category` (4 transactional rows) + `notification_channel` (`email` wired, `in_app` reserved) + `notification_preference` (per-person category×channel, empty in v1). RLS: lookup `_read` to authenticated; preference SELECT-only own-row (`person_id = auth.uid()`), **no** write policy → the Notifications settings section is read-only. Additive. |
| 3 | `20260706090200_erasure_cron.sql` | SET-02 async half. `scrub_person_pii(uuid)` + `audit_person_scrub(uuid)` (SECURITY DEFINER, **service_role ONLY** — explicitly revoked from anon/authenticated) + `run_scheduled_erasures()` (pg_cron entry: reads Vault `project_url`/`edge_anon_key`, `net.http_post` → `/functions/v1/erase-expired-accounts`). Daily `cron.schedule('erase-expired-accounts','0 3 * * *', …)`, idempotent unschedule-then-schedule. Reuses the `sella-detect` pg_cron/pg_net/Vault chain — extensions + Vault secrets already present, NOT re-created (`create extension if not exists`). |

**Non-migration cloud steps — REQUIRED for lifecycle emails + the erasure sweep (do WITH the push):**
- `supabase functions deploy send-lifecycle-email` — SET-03 sender (Deno `fetch` → Resend; resolves the recipient from `auth.users` via a service-role client; invoked fire-and-forget via Next 16 `after()` from each event's server action).
- `supabase functions deploy erase-expired-accounts` — SET-02 day-30 sweep worker (performs the `auth.admin` email-tombstone + soft-delete that Postgres itself can't; called by the pg_cron `net.http_post` above).
- `supabase secrets set RESEND_API_KEY=…` — **net-new edge secret**. The Resend sending domain is already verified for auth SMTP; confirm the same domain works for API `from: Hello Sello <noreply@hello-sello.com>` sends before relying on it (**Assumption A1** — silent rejection if the from-address isn't on a verified domain). Reused / already set: `SUPABASE_SERVICE_ROLE_KEY` (edge, auto-injected), Vault `project_url` / `edge_anon_key`.

**⚠️ Cloud UAT required — two admin-API paths that 403 on the LOCAL GoTrue (RESEARCH A3):**
- **Erasure auth-scrub** — `erase-expired-accounts` calls `auth.admin.updateUserById` (email tombstone) + `deleteUser({ shouldSoftDelete: true })`. Only the DB-side `scrub_person_pii` half is proven locally (invariant test); the GoTrue admin half must be UAT'd on cloud.
- **Session-revoke** — the same `sb_secret_`-vs-local-GoTrue caveat as the Phase 11 token-revoke; exercise once on cloud to confirm the sign-out/revoke path.

**Ordering dependency:**
- Push **AFTER** the still-pending Phase 10 + 6×Phase 11 + 3×Phase 12 batches (CLAUDE.md #0). SET-02's RPCs reference `person_group` / `has_permission` / `current_superadmin_group_id` (Phase 11) and the lifecycle emails fire off the Phase 11/12 RPCs — those must be live first. The three `20260706090xxx` stamps sort last, so a single sequential `supabase db push` runs them in order after any earlier pending batch (no reconcile needed if cloud history is contiguous).
- ⚠️ **Verify current cloud state first:** the "APPLIED TO CLOUD → 2026-06-23" entry below records a P10/11/12 push (cloud history 75→88). If that record is authoritative, the P10/11/12 dependency is already satisfied and only this Phase-13 batch remains pending — reconcile the pending list against a live `list_migrations` before pushing.

---

## APPLIED TO CLOUD

### 2026-07-22 — Lane A (deal creation & delivery) + group-thread gate drop (6 migrations)
Applied via `mcp__supabase__apply_migration` against `byipusuthdlskdxoexkt` (not a CLI `db push`) —
**cloud history now records these under fresh timestamps** (`20260722120421`…`20260722120711`), not
the local filenames' timestamps. Same divergence class as the 2026-07-08 Buy-era batch below; the
pre-Lane-A reconcile pass (CLAUDE.md #0) still needs to fold this batch in too. **6 applied, 0 errors:**
- `deliver_deal` (local `20260720095000_deliver_deal.sql`)
- `create_deal_draft_delivers` (local `20260720100100_create_deal_draft_delivers.sql`)
- `claim_deal_ticket` (local `20260720110000_claim_deal_ticket.sql`)
- `chat_message_type_deal_card_seed` (local `20260720130000_chat_message_type_deal_card_seed.sql`)
- `chat_message_type_deal_signed_seed` (local `20260722100000_chat_message_type_deal_signed_seed.sql`)
- `drop_group_thread_external_gate` (local `20260720100000_drop_group_thread_external_gate.sql`, Ayush)

Before applying: diffed `create_deal_draft`'s and `create_group_thread`'s LIVE `pg_get_functiondef`
bodies against each migration's assumed base — both matched exactly (no stale-base drift). Verified
`pending_inbox_item` / `chat_message_type` / `deal_member` exist on cloud first. **Applied without
Ayush's review** (Muskan's explicit call, same override precedent as DEV-88) — `create_deal_draft` is
the golden path for every deal creation, so shipping `dev`'s app code to `main` without these live would
break deal creation/delivery/pickup in production. `get_advisors(security)` = **0 ERROR** (126 WARN, all
pre-existing/by-design SECURITY DEFINER RPCs — my 4 new functions added the same benign
anon/authenticated-executable-definer pattern every prior batch has). Flag for Ayush to review after the
fact, same as DEV-88.

### 2026-07-07 — Present + Allocate + Phase 13 deploy (9 migrations)
Clean sequential `supabase db push` against `byipusuthdlskdxoexkt` — **no reconciliation needed**
(dry-run clean; cloud was contiguous at `20260622110000`). **9 applied, 0 errors:**
- DEV-99 taxonomy: `business_category_taxonomy`
- Phase 7 Present: `product_location`, `product_media`, `shop_media_allow_pdf`, `product_terpene_percent`
- Phase 13 lifecycle: `account_lifecycle`, `notification_preference`, `erasure_cron`
- Allocate/Sell: `allocate_schema`

Verified on cloud (read-only SQL): all target objects present — `product.location` + `terpene_percent`,
`product_media`, `business_category` + `company_business_category`, `notification_preference`,
`company_type_assignment` remap, allocate lookups, the `erase-expired-accounts` cron row.
`get_advisors(security)` = **0 ERROR** (117 WARN, all pre-existing / by-design SECURITY DEFINER RPCs; my
9 added 8 of the same benign anon/authenticated-executable-definer pattern). Aurora's
`cultivator`→`eu_gmp_cultivator` remap intact (valid FK, **0 orphaned** type assignments, 0 legacy
`cultivator` rows). Cloud tip now `20260707090000` — **local == cloud**. Shipped via **PR #137 (dev→main)**;
production Vercel deploy READY (`hello-sello-mvp.vercel.app`); product-add smoke-tested live (a product
persisted with its `location`).

**⚠️ STILL PENDING (non-migration — the erasure/email async half of Phase 13):**
- `supabase functions deploy send-lifecycle-email` + `supabase functions deploy erase-expired-accounts` — **NOT deployed.**
- `supabase secrets set RESEND_API_KEY=…` — **NOT set.**
- Consequence: `erasure_cron` scheduled the nightly `erase-expired-accounts` job → it **fires at 3am and
  errors harmlessly** (edge fn missing / no key). Deploy the fns + secret to activate lifecycle emails +
  the day-30 sweep, or `select cron.unschedule('erase-expired-accounts');` to silence it. Emails won't send until then.
- **Security residual [DEV-159]** (Linear, High): a buyer can forge allocation state via a direct table
  write (symmetric base RLS, DEV-88 family). Non-blocking (seed data only); real fix = Ayush's base-RLS lane.

### 2026-06-23 — Phase 10 + 11 + 12 + Deal-Room batch (13 migrations)
Clean sequential `supabase db push` against `byipusuthdlskdxoexkt` — **no reconciliation
needed** (history aligned since the 06-20 reconcile). 13 applied, 0 errors:
- Phase 10: `get_public_profile_verification`
- Phase 11 (6): `rbac_activation`, `onboard_superadmin`, `backfill_superadmin`, `team_rpcs`,
  `invite_accept_link`, `lockout_race_fix`
- Deal Room (Ayush, 3): `thing_artifact_visibility`, `stage_done_and_finalize`,
  `thing_artifact_withcheck_ownership`
- Phase 12 (3): `join_request_rpcs`, `join_request_fixes`, `pathb_followups`

Backfill: 6 real companies seeded Superadmin, 10 headless demo skipped (NULL `created_by`).
Security advisor: **0 errors** (94 WARN, all pre-existing/by-design SECURITY DEFINER RPCs).
Cloud config set same day: `SUPABASE_SECRET_KEY` in Vercel + 3 email templates in dashboard.
Cloud history: 75 → 88.

### 2026-06-20 — combined batch (Muskan + Ayush), reconciled + pushed
Ran the "⚠️ READ FIRST" reconciliation against `byipusuthdlskdxoexkt`:
1. `migration repair --status reverted` × 47 (cleared wrong-timestamp records)
2. `migration repair --status applied` × 49 (already-applied/superseded — incl. `profile_qr_foundation`, `get_public_profile`, no-op `seed_demo_world`, `confirm_detected_deal_proposer_initiator` superseded by `confirm_detected_deal_batch`)
3. `db push` — **25 applied, 0 errors**, in timestamp order `deal_pending_change` → `oauth_person_trigger_fix`

Result: cloud history = **74**, matches local. Security advisor: **0 errors** (warnings all pre-existing/by-design). No demo seed pushed. `oauth_person_trigger_fix` live → Google/Azure sign-up unblocked.

Post-push: `.env.local` flipped to cloud; Google + Azure enabled in dashboard. Open: drop orphan `avatars_read` policy (cosmetic); 6.1 cloud UAT (sign-up tests 10–12).

### 2026-06-20 — canonical display_name (single migration)
`20260620120000_canonical_display_name.sql` pushed via a clean sequential `db push` (1 migration; history already reconciled, no repair needed). Updates `handle_new_user` to set the canonical `display_name` on every signup path + one-time backfill of existing rows. **Applied, 0 errors; cloud history = 75.** Verified: the test account's `display_name` backfilled, `profile_complete = true`. (See DECISIONS.md 2026-06-20 canonical-name entry.)
