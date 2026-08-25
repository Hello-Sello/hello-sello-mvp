# Cloud migrations — pending apply ledger

> **Purpose:** every DB migration we build locally is applied to the LOCAL stack only.
> The cloud (main) database is updated later, deliberately, by a human. This file is the
> running list of migrations that are **on local but NOT yet on cloud**, plus exactly how
> to push them. When a batch is pushed to cloud, move it to the "Applied to cloud" section
> with the date.
>
> **Golden safety rule:** a Supabase command with no `--linked` and no remote `--db-url`
> cannot touch cloud. `supabase db reset` / `supabase migration up` = LOCAL only.
>
> **Two classes of debt, and they are not interchangeable (learned the hard way, T08 2026-08-23):**
> **migration** debt pushes with `db push` and lives in the one `⚠️ PENDING` section below;
> **non-migration** deploy debt — edge functions, secrets, dashboard steps, cloud UAT — does not
> push at all and lives in `## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`. A batch can be fully
> applied and still owe the second kind. Filing it under an "APPLIED" heading is how it disappears.
>
> **Correcting an entry: annotate in place, never delete.** Several entries carry pre-flight queries
> that were run against production, and they are the record of how a push was verified. When a claim
> goes stale, strike it (`~~…~~`) and say what is true now beside it. If a block must move, move it
> and say where it went at both ends. **Cite sections by heading text, never by line number** — this
> file grows, and every line citation in it has gone stale (L-030).

---

## ✅ APPLIED 2026-08-25 (was PENDING 2026-08-24) — THREE migrations, one plain `db push`

**Status: LIVE ON PRODUCTION.** Pushed 2026-08-25 by the `security_tickets` session on Muskan's
explicit go-ahead. Production tip is now `20260825110000`, verified against
`supabase_migrations.schema_migrations` — not against this file.

**Post-push evidence, all run against production, none of it inferred:**

| check | result |
| -- | -- |
| Pre-flight — `send_deal` drift | **zero drift.** `md5(prosrc) = b52ea5df…`, len 3591, byte-identical to `20260724120300`. The `create or replace` overwrote nothing hand-edited. |
| Migration tip | `20260825110000` |
| HEL-69 — the two leaking rows, read as a **connected buyer** (Aurora → StonePharm) | `Spirit Bear T28 STR MLS` **0 rows**, `fdsc` **0 rows** |
| …with its control on the same query | the same caller still sees **9** legitimate prices — the zeros are the gate, not a dark view |
| HEL-69 — does the view delegate? | `product_price_visible_to_caller` present, `profile_visible` reprint **gone** |
| HEL-70 — all five doors carry the term | 5/5 `deactivated_at`, and 5/5 **kept** `verification_status` (no door traded one for the other) |
| S8 advisors | **87: 1 ERROR, 85 WARN, 1 INFO.** The one ERROR is `security_definer_view` on `current_pricelist_item` — knowingly accepted, ADR-0004 §4 / ARCHITECTURE-NOTES.md:231. **No new ERROR.** |

⚠️ **On the S8 number, honestly.** The recorded baseline is "85" but its composition was never written
down precisely, and two migrations landed between that baseline and this push. **87 vs 85 is not a
clean diff and should not be reported as one.** What IS checkable, and was checked: no new ERROR, and
all five functions this batch touched were already `SECURITY DEFINER` before it, so none of them
entered the 82-strong `authenticated_security_definer_function_executable` class as a result of this
push. A baseline nobody can decompose is worth less than the check that replaced it.

> 🔴 **THIS ENTRY SAID "ONE MIGRATION" AND THE BATCH WAS ALREADY TWO.** Corrected 2026-08-25 by the
> `security_tickets` session while ledgering HEL-70. `20260825090000` (slug 0023 T01 / HEL-63) has
> been on `claude/muskan/work` since 2026-08-25 and **was never ledgered** — it appeared in this
> file only as a passing mention inside HEL-69's push paragraph. That is the `20260607090000`
> failure mode repeating: a migration nobody entered, found later by someone reading the push line
> rather than the table. A plain `db push` would have carried it silently either way; the risk is
> not that it fails to ship, it is that **nobody reviewed what shipped.**
>
> **Row 1's full entry was written by its author's session (`deal_land_t02`) and placed here by the
> `security_tickets` session, which held the file.** It was deliberately NOT summarised by whoever
> happened to hold the lock — that is how a ledger entry stops describing the migration it names.

| # | file | what it does |
|---|---|---|
| 1 | `20260825090000_send_deal_c2c_announce.sql` | **Slug 0023 / T01 / HEL-63.** `create or replace` of `public.send_deal(uuid)`, grant re-emitted. The **company** arm stops calling `deliver_deal` and posts the same clickable `deal_card` pill into the relationship's `c2c` thread that the person arm already posts. Full entry below. |
| 2 | `20260825100000_pricelist_view_single_owner.sql` | `current_pricelist_item` stops reprinting the product-price-visibility rule and calls `public.product_price_visible_to_caller()` — the function that already gates `pricelist_item_public_select` and `plit_public_select`. Also revokes `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES` that `authenticated` held on the view although the defining migration grants SELECT only. |
| 3 | `20260825110000_deactivated_company_gate.sql` | **HEL-70.** `company.deactivated_at` starts closing every discovery door. One predicate added to five functions: `product_visible_to_caller` (six doors inherit it), `list_discoverable_companies`, `get_discoverable_company`, `get_discoverable_shop`, `list_discoverable_people`. `create or replace` throughout, grants re-emitted. |

### Row 1 in full — `20260825090000_send_deal_c2c_announce.sql` (T01 / HEL-63)

*Written by the slug's own session; placed here verbatim.*

`create or replace` of `public.send_deal(uuid)`, **grant re-emitted** (`grant execute … to
authenticated` is a separate statement; a `drop`+`create` would kill Send for every user).

**What changes.** The **company** arm stops calling `perform public.deliver_deal(...)` — that call is
**deleted, not guarded** — and instead resolves the relationship's `c2c` thread and posts the same
clickable `deal_card` pill the person arm already posts. The pill insert is **hoisted**: the
`if/else` computes the thread only, and one `chat_message` insert serves both arms. The c2c lookup is
**resolve-or-create** (`on conflict do nothing` + re-select, `deleted_at is null`), so an interrupted
accept self-heals on first send. The **p2p** arm gets the same `on conflict` treatment — it had the
identical race.

**Not touched.** `deliver_deal`'s own body is byte-identical and keeps serving Sella's door via
`confirm_detected_deal_births_negotiation.sql:176`. No RLS, grant, or schema change.

**Behaviour change the moment it lands.** A company-addressed deal creates **zero**
`pending_inbox_item` rows and appears in the company chat instead. Pre-existing Connection-Requests
tickets survive and stay claimable.

**Breaks by design, rewritten in the same commit.** `deliver_deal_test.sql` (its idempotency case now
calls `deliver_deal` twice directly) and `claim_deal_ticket_test.sql`. New suite
`send_deal_c2c_announce_test.sql` + runner ships with it.

**Gate at close.** 5 SQL runners exit 0 · `tsc` 0 · unit 490/490 · nine ACs replayed on real data.

---

**The leak it closes, measured on production 2026-08-24.** The view's hand-written public arm was
missing three terms `product_visible_to_caller()` carries: the seller company's `deleted_at` and
`verification_status`, and the product's `location`. `is_caller_verified()` does not cover the
second — it reads the CALLER's company, and nothing in the old view read the seller's `company` row
at all. Same shape as slug 0022's round-4 basket leak (L-038).

**Who loses reads the moment this lands — by design, this IS the fix.** Connected buyers stop seeing
the price and tier ladder of any product that is unfiled, or whose seller company is soft-deleted or
unverified. Two named production rows go dark for buyers:

- StonePharm's `Spirit Bear T28 STR MLS` — unfiled (`location IS NULL`), EUR 9.50/g
- CNG Berlin's `fdsc` — seller `verification_status = 'pending'`, EUR 2.00/g

**Both sellers keep full sight of their own products.** The owner arm is asserted explicitly
(`pricelist_view_single_owner_test.sql` §B), including the unfiled one — unfiled is withheld from
buyers and kept for the owner so the Unassigned pile stays fileable.

**Push: THREE migrations, ONE plain `supabase db push --linked`, `--include-all` NOT needed and NOT
to be passed.** All three filenames sort after cloud's tip `20260824100000`, in this order:
`20260825090000` → `20260825100000` → `20260825110000`. Nothing is back-dated, so a plain push
takes the lot.

⚠️ **THE ORDER IS LOAD-BEARING BETWEEN ROWS 2 AND 3, and this was measured, not reasoned.** HEL-70
(row 3) claims one edit to `product_visible_to_caller()` closes six doors including the price view.
**That is only true once row 2 has landed.** Proven on the local stack 2026-08-25: with row 2
absent, HEL-70's suite failed at cell `B6/price` — a deactivated seller still handed a connected
buyer a per-gram price, because the pre-HEL-69 `current_pricelist_item` reprints the rule instead of
delegating to `product_price_visible_to_caller()`. Applying row 2 turned the same cell green with no
other change. Filename order already guarantees this; **do not reorder them by hand.**

⚠️ **PRE-FLIGHT, owed and not previously in this file (handed over by the `deal_land_t02` session).**
Row 1 is a `create or replace`, so if production's `send_deal` body ever drifted from the repo it
gets **silently overwritten** by this push. Diff it first and keep the output:

```sql
-- run against PRODUCTION, before pushing
select md5(prosrc), length(prosrc) from pg_proc
 where oid = 'public.send_deal(uuid)'::regprocedure;
```

✅ **RUN 2026-08-25, BEFORE THE PUSH — ZERO DRIFT.** Production's body is
`md5 = b52ea5dfddd626afc3074acd2615b48d`, length **3591**, a byte-for-byte match for the body in
`20260724120300_send_deal.sql`. Nothing was hand-edited on production, so row 1's `create or
replace` overwrites nothing unexpected. Compared on `prosrc` rather than `pg_get_functiondef` —
the latter re-renders the header and would differ on formatting alone.

This repo has been bitten by exactly this shape before — `ensure_rls` lived on production and in no
migration until `20260817130000` captured it.

**Who loses reads when ROW 3 lands — by design, this IS the fix.** Nothing changes today:
**0 of 21 live production companies are deactivated** (measured 2026-08-25). The moment a Superadmin
pauses a company, that company stops listing in Discover, its page stops opening on a direct link,
its shop and prices close, its people leave the People directory, and a buyer holding its products
in a basket **loses those lines with no warning** — a cost recorded and accepted in
`DECISIONS.md` 2026-08-25.

**Its own members lose nothing.** `/present` reads `getMyShop()` through plain RLS, and the owner arm
of `product_visible_to_caller` never consults the `company` row, so it is unreachable from this
change by construction — asserted anyway in §C of the suite. The one thing a paused company's member
does lose is the **buyer preview** at `/discover/<own id>`, because `get_discoverable_company` and
`get_discoverable_shop` have no owner arm on the company side. That is the shop, and the rule says
the shop is closed.

**What row 3 does NOT deliver.** The ruling's table says *new connections blocked*. These five edits
cannot do that: a connect request is a direct client `INSERT` into `pending_inbox_item` governed by
`inbox_insert`, which constrains only the **sender**. Hiding the company removes the button, not the
door. Filed as its own ticket — do not read this batch as having closed it.

**Post-flight for ROW 3 — should return 0 rows, and returns 0 today for a second reason.**

```sql
-- any deactivated company still reachable through a discovery door
select c.id, c.name, c.deactivated_at
  from company c
 where c.deactivated_at is not null
   and c.deleted_at is null
   and c.verification_status = 'verified';
```

⚠️ **That query returns 0 rows on today's production whether or not row 3 shipped**, because nothing
is deactivated yet — so it is NOT evidence the gate works. The evidence is
`supabase/tests/deactivated_company_gate_test.sql` (26 cells: 7 controls, 7 gate, 3 owner, 7 round
trip, 2 source-agreement), which was proven **red before green** and whose five gate cells were shown
to discriminate 1:1 — reverting any single door made exactly that door's cell fire and no other.

---

**Post-flight — re-run the two queries that found it. Both must return 0 rows:**

```sql
-- 1. rows the view would hand a connected buyer that the canonical rule denies
select p.id, p.name, c.name as seller, p.location, c.verification_status
  from pricelist_item pli
  join pricelist pl on pl.id = pli.pricelist_id
  join product p on p.id = pli.product_id and p.company_id = pl.company_id
  join company c on c.id = p.company_id
 where pli.deleted_at is null and pl.deleted_at is null and p.deleted_at is null
   and p.price_public
   and (p.location is null or c.deleted_at is not null or c.verification_status <> 'verified')
   and not public.product_price_visible_to_caller(p.id);

-- 2. the compensating control survived the replace (must contain security_barrier=true,
--    and must NOT contain security_invoker=true)
select reloptions from pg_class where oid = 'public.current_pricelist_item'::regclass;
```

> ⚠️ **DO NOT "fix" the `security_definer_view` advisor ERROR while you are in there.** The view is
> owner-rights **deliberately** — ADR-0004 §4 pre-declared the trade-off and accepts the advisor
> entry (precedent: `ARCHITECTURE-NOTES.md:231`). Re-verified against production 2026-08-24 rather
> than read off the ADR: `pricelist` carries exactly one policy, `pricelist_all USING (company_id =
> current_company_id())`, and this view joins it — so `security_invoker = true` returns **zero rows
> to every buyer** and takes the price surface dark. Supabase's general "always set security_invoker"
> guidance assumes base tables whose policies admit the intended readers; ours deliberately do not.

**Gate evidence at time of filing:** RED reproduced before the fix (the unfiled product handed EUR
7.77 to a connected buyer), green after. Four neighbouring SQL suites green
(`connection_visibility_override`, `cross_tenant_lockdown`, `discoverable_shop_spec_columns`,
`pricelist_item_tier`), `tsc` clean, unit 490/490.

**What this entry does NOT claim.** The full Playwright e2e run did not complete at filing time (the
local DB was held by a parallel session), so this migration is **not** backed by an e2e A/B against a
clean base. Do not read the green list above as a full gate.

---

## ✅ APPLIED 2026-08-25 (was PENDING 2026-08-24, Muskan) — T11 table privilege lockdown (ONE migration)

**Status: LIVE ON PRODUCTION.** Pushed 2026-08-25 with `supabase db push --linked` (plain — no
`--include-all`; the filename sorts after cloud's tip `20260823100000`), together with T13's
migration in the same push. ~~LOCAL ONLY. Not pushed.~~

| # | migration | ticket |
|---|---|---|
| 1 | `20260824100000_table_privilege_lockdown.sql` | T11 (`0022-buyer-shop-view/TICKETS.md`) |

**What it closes.** Deny-by-default for TABLES — the half session 77 installed for functions and
never for relations. Measured before: **`anon` held 614 table privileges in `public`** (TRUNCATE on
89 tables, INSERT on 88, SELECT on 85); `authenticated` held TRUNCATE on 91 and TRIGGER on 92.
After: **anon 0, authenticated TRUNCATE/TRIGGER 0.** RLS does not apply to TRUNCATE, so the
hash-chained `audit_log` was erasable by an unauthenticated role.

**Reachability, not overclaimed:** PostgREST emits neither TRUNCATE nor DDL, so this was not
reachable from the app's public surface. It is a grant-level hole one FK or one new client from
mattering.

**Who loses access, by design:** `anon` loses every `public` table privilege. **Nothing uses them** —
no RLS policy in `public` names `anon` (the only three naming anon/public are in `cron` and
`storage`, untouched), and the one public route that renders database content, `/c/[handle]`, runs
through the `get_public_profile` SECURITY DEFINER RPC. **Proven after the change:** with anon holding
zero table privileges, `get_public_profile` still returns the row (1 row for a probe handle).
`authenticated` keeps SELECT/INSERT/UPDATE/DELETE — only TRUNCATE and TRIGGER go.

**Push order:** independent of T13's migration and of any app deploy; no app code references these
grants. Plain `supabase db push`.

**Advisors:** no change expected. This adds one event-trigger function, which is not `SECURITY
DEFINER`-executable by `authenticated` and does not appear in the advisor classes.

**Proof:** `supabase/tests/table_privilege_lockdown_test.sql` — 5 cells, 4 RED-first. Cell 3 asserts
the mechanism **fires** (creates a throwaway table, reads the ACL back) rather than that it exists;
cell 5 reproduces the actual exploit (anon TRUNCATE of a self-seeded `audit_log`). Verified on a
clean `supabase db reset`: **41/41 SQL runners**, `tsc` 0, unit 490/490.

**✅ Verified ON PRODUCTION after the push (2026-08-25), by query, not by assumption:**

| claim | before | after |
|---|---|---|
| `anon` privileges on `public` tables | **614** (REFERENCES 89, TRIGGER 89, TRUNCATE 89, INSERT 88, DELETE 88, UPDATE 86, SELECT 85) | **0 — the role returns no rows at all** |
| `authenticated` TRUNCATE / TRIGGER | 91 / 92 | **0 / 0** |
| `authenticated` SELECT/INSERT/UPDATE/DELETE | 93 / 91 / 88 / 91 | **unchanged** — 93 / 91 / 88 / 91 |
| the public route still works with anon holding nothing | — | `get_public_profile('clara-vogt')` as `anon` → **1 row** |
| the mechanism is installed | — | `revoke_anon_privileges_on_new_table_trg` present, `ddl_command_end`, enabled |

The push emitted `NOTICE: event trigger "revoke_anon_privileges_on_new_table_trg" does not exist,
skipping` — that is the migration's own idempotent DROP running on a database that had never seen
it. Expected, not a warning.

---

## ✅ APPLIED 2026-08-25 (was PENDING 2026-08-24, Muskan) — T13 product column confidentiality (ONE migration)

**Status: LIVE ON PRODUCTION.** Pushed 2026-08-25 with `supabase db push --linked`, in the same push
as T11's migration. ~~LOCAL ONLY. Not pushed.~~

| # | migration | ticket |
|---|---|---|
| 1 | `20260824090000_product_column_confidentiality.sql` | T13 (`0022-buyer-shop-view/TICKETS.md`) |

**What it closes — live on production right now.** `product_public_select` admitted any
`profile_visible = true` row to any verified caller, and RLS filters rows, not columns, so the row
came back whole. Measured locally as Bob (verified, connected buyer): **4 GreenLeaf rows, all four
carrying `rrp_per_gram`, two of them `price_public = false`.** After: **0 rows, 0 leaked**, and the
buyer still reads all six products through `get_discoverable_shop`.

**Push order:** plain `supabase db push` — the filename timestamp sorts after cloud's tip
(`20260823100000`), so no `--include-all` is needed. **App code does NOT need to ship with it:**
every client read of `product` is own-company and carried by `product_all` (verified path by path —
see the migration header). This migration is safe to land alone, in either order relative to app
deploys.

**Who loses reads, by design — the pre-push question this file exists to answer:** nobody who was
entitled to the data. A buyer loses the *base-table* read of another company's `product` row; every
column she is entitled to still arrives via `get_discoverable_shop`. **One deliberate widening:** a
connected buyer gains the `pricelist_item` row of a `profile_visible = false` + `price_public = true`
product, because the shop RPC already showed her that product and price — the base-table policy was
the narrower of the two doors.

**Advisors:** expect `authenticated_security_definer_function_executable` **85 → 86** (one new
definer function, `product_price_visible_to_caller`). **No new ERROR** — the `product_public` view
that would have added a second `security_definer_view` was built and then removed, because no client
path needed it.

**Proof:** `supabase/tests/product_column_confidentiality_test.sql` (6 cells, RED-first on cell 1).
Verified on a clean `supabase db reset`: **40/40 SQL runners**, `tsc` 0, unit 490/490.
`connection_visibility_override_test.sql` needed two assertions flipped — its `[door a]` cells
asserted the base-table read this migration removes; the change is annotated in place, and a warning
was added to that file so a green `[door a]` line is not mistaken for live signal.

**✅ Verified ON PRODUCTION after the push (2026-08-25), impersonating a real verified buyer**
(`Nord Apotheke Berlin`, active relationship with `Canadian Craft Cannabis Company GmbH`, via
`set local role authenticated` + `request.jwt.claims`):

| claim | result |
|---|---|
| the buyer's base-table read of the seller's `product` | **0 rows, 0 `rrp_per_gram`** (the leak this ticket exists to close) |
| the buyer's entitled read still arrives | `get_discoverable_shop(<Canadian Craft>)` → **4 products, 4 with a price** |
| `public.product` policies | only **`product_all`** remains — `product_public_select` is gone |
| the four borrowing policies re-pointed, not blanked | `pricelist_item_public_select` and `plit_public_select` → `product_price_visible_to_caller()`; `product_image_public_select` and `product_media_public_select` → `product_visible_to_caller()` |

**⚠️ The advisor prediction in this entry was one short.** It said *"expect
`authenticated_security_definer_function_executable` **85 → 86** (one new definer function,
`product_price_visible_to_caller`)"*. Measured: **85 → 87**, because the migration adds **two**
definer helpers, not one — `product_visible_to_caller` as well. The substantive half of the
prediction held: **no new ERROR** (still the one pre-existing `security_definer_view`), and the
class breakdown after the push is 1 ERROR / 84 WARN / 1 INFO.

---

## ✅ APPLIED 2026-08-24 (was PENDING 2026-08-20, Muskan) — slug 0022 buyer-shop-view

> **ALL SIX MIGRATIONS ARE LIVE ON PRODUCTION as of 2026-08-24**, pushed with
> `supabase db push --include-all`. `supabase migration list --linked` now reports
> **152 local <-> 152 remote, 0 local-only, 0 remote-only**. No history repair was needed — the CLI
> stamps filename timestamps (the call-time drift class comes from MCP `apply_migration`, not from
> `db push`).
>
> **Post-push verification, all run against production and all passing** — the four checks added to
> this entry on 2026-08-24 plus the original policy checks: three functions `prosecdef` with
> `search_path` pinned · **`anon` EXECUTE denied on all three** · buyer arm read back via
> `pg_get_functiondef` carries **all six terms** · `basket_line_admission` restrictive, `polcmd='*'`,
> `polqual` NULL · `basket_line_owner_all` present and unmodified · **`authenticated` INSERT on
> `relationship` = false** (the live privilege escalation is closed).
>
> **S8 after the push: 80 -> 85.** The +5 are all
> `authenticated_security_definer_function_executable` (75 -> 80) — the batch's own five new definer
> functions (`accept_connection_request`, `resubmit_company_verification`,
> `product_visible_to_caller`, `product_admissible_to_basket`, `get_my_basket_lines`). **`anon`
> definer-executable stays at exactly 1** (`get_public_profile`). Predicted, not a regression.
>
> **App code deployed the same day**: PR #163 -> `dev`, PR #164 -> `main`, Vercel production
> deployment `6060572217` **success**. ⚠️ **A broken window existed between the migration push and
> the `main` merge** — `main`'s `store.ts:573` wrote `relationship` directly and that grant is
> revoked by this batch, so connection-accept failed on production for that interval. **The
> same-deploy rule on this repo means `dev`->`main`, not `dev`.** Recorded in the slug's STATE.md.
>
> **⚠️ THIS SECTION IS MIGRATION DEBT ONLY.** The non-migration deploy debt below
> (§ OUTSTANDING — edge functions, `RESEND_API_KEY`, dashboard settings) is a **different class**
> and is **NOT** discharged by this push. Do not fold it in — that is exactly the mistake T08 caught.

> ### ✅ S6 + S8 RUN AGAINST PRODUCTION 2026-08-23 — read-only, nothing written
>
> **S6 — `supabase migration list --linked`.** Confirms **exactly six** local-only migrations,
> independently of this ledger:
> ```
> 20260607090000   ← sorts FIRST; every migration after it is already on cloud
> 20260820090000 · 20260822090000 · 20260822100000 · 20260823090000 · 20260823100000
> ```
> **Six, not five.** `20260607090000` appears at the TOP of the list with applied migrations
> below it — which is exactly why a plain `supabase db push` refuses it and **`--include-all`
> is required.** The CLI's own message: *"Found local migration files to be inserted before the
> last migration on remote database."*
>
> **S8 — `get_advisors(type: security)`, BASELINE BEFORE THE PUSH: 80 findings**
> (`1 ERROR · 78 WARN · 1 INFO`). **None caused by this slug.**
> - `ERROR security_definer_view` — `current_pricelist_item` is owner-rights **by design**; T06
>   re-creates it and preserves that property. Pre-existing.
> - `75 × authenticated_security_definer_function_executable` — the normal pattern for this app.
> - `1 × anon_security_definer_function_executable` — `get_public_profile` only, **deliberately
>   public**; matches session 77's recorded end state (65 → 1).
> - `INFO rls_enabled_no_policy` — `sella_detection`, the row this ledger already flags as
>   *"worth one conscious confirmation"*.
> - `WARN auth_leaked_password_protection` — **OFF**. A dashboard setting, not code; worth
>   enabling independently of this push.
>
> **Re-run S8 after the push and diff against 80.** A baseline nobody recorded is not a baseline.
> ⚠️ CLI is **v2.75.0**; v2.115.0 is available. Deliberately **not** upgraded mid-ship.


> ✅ **COMPLETE as of 2026-08-23 (T08).** All **six** local-only migrations in this batch now have
> an entry below, in timestamp order. **This is the only section of this file that claims un-pushed
> migrations** — every other section is applied, and any that still reads as pending is annotated in
> place with the date it landed.
>
> Non-migration deploy debt (edge functions, secrets, dashboard steps, cloud UAT) is a **different
> class** and does not live here: a batch can be fully applied and still owe those. It is collected
> under **§ ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT**, immediately after this section.
>
> | # | migration | ticket |
> |---|---|---|
> | 1 | `20260607090000_stack_default_privileges.sql` | **none** — belongs to no ticket; unledgered until T08 found it |
> | 2 | `20260820090000_discoverable_company_shop_chrome.sql` | T01 / HEL-55 |
> | 3 | `20260822090000_discoverable_shop_spec_columns.sql` | T05 / HEL-59 |
> | 4 | `20260822100000_connection_visibility_override.sql` | T06 / HEL-60 |
> | 5 | `20260823090000_connection_consent_and_verification_lockdown.sql` | T09 |
> | 6 | `20260823100000_basket_admission.sql` | T07 / HEL-61 |

**🔴 PUSH THE SLUG AS ONE BATCH, IN TIMESTAMP ORDER — THE SLUG SHIPS AS A UNIT.** This governs
every entry in this section. The G4/T00 condition: T00 reaching `dev` without T06 would put every
seller's catalogue into every other seller's deal-line picker; T07 applied without T06 gates the
basket against the old, narrower visibility rule; and **T09 must be live before the app code that
calls it** — `store.ts` and `onboarding/actions.ts` already call two RPCs that do not exist on
production. Do not push a subset.

### How to push THIS batch — current procedure (supersedes every other push procedure in this file)

```bash
# 1. confirm the link
supabase projects list                       # the linked project is byipusuthdlskdxoexkt

# 2. dry-run — expect EXACTLY the six above, in timestamp order
supabase db push --dry-run --include-all

# 3. push
supabase db push --include-all
```

⚠️ **`--include-all` is REQUIRED for this batch — it is not optional and not defensive.**
`20260607090000_stack_default_privileges.sql` carries a filename ~14 months older than cloud's tip
(cloud is at `20260817130000`). `supabase db push` will not apply a migration whose version sorts
before the remote history's tip unless the flag is passed — *"`--include-all`   Include all
migrations not found on remote history table."* (CLI v2.75.0, the installed binary). **Without the
flag the push applies five of the six and reports success**, and the batch that "ships as a unit"
has silently shipped in part.

⚠️ **Filename timestamps ≠ authoring dates in this batch — L-034.** `20260607090000` is named
2026-06-07 and was **authored 2026-08-22** (`d052371`). Before pushing **any** future batch, diff the
two: `git log --diff-filter=A --format='%ad %s' -- <file>`. Where they disagree, that file's
"runs first / runs last" reasoning is an artifact of `db reset` replay order and is **wrong on
cloud** — see that migration's own entry below for the defect this rule caught.

⚠️ **History is contiguous; no `migration repair` is needed.** The orphan `20260708155722
buy_schema` row that once blocked a plain `db push` was deleted by hand on 2026-08-16 (recorded in
the tier-ladder Migration E entry), and the 2026-08-17 lockdown batch then pushed with a plain
`supabase db push` and took the filename timestamps directly. The 2026-07-22 reconcile note that
still calls that row a live blocker is **superseded** and annotated in place.

---

`20260607090000_stack_default_privileges.sql` — **NO TICKET. Unledgered until T08 (2026-08-23).**
It belongs to no slice of this slug and to no ticket anywhere in the project; it was authored during
session 81's grant work and never entered here, which is exactly how it stayed invisible. Ledgered
now so the batch instruction above is executable from this file alone. LOCAL only.

**What it does.** Re-states the Supabase stack's `ALTER DEFAULT PRIVILEGES` for role `postgres` in
schema `public` — three statements: `grant all on tables to anon, authenticated, service_role`,
`grant all on sequences to anon, authenticated, service_role`, and `grant execute on functions to
authenticated, service_role`. The local CLI (10.9.7) stopped issuing them, which left
`authenticated` able to SELECT 1 of 93 tables and made the local database unusable. It exists to
state the rule **once**, first, so every object born in the migrations that follow inherits it and
every deliberate REVOKE still runs later and still wins.

**⚠️ THE FILENAME LIES ABOUT WHEN IT WAS WRITTEN. That is the whole risk here — L-034.**
Named `2026-06-07`; **authored 2026-08-22** (`d052371`). Locally that is harmless: `db reset`
replays by timestamp, so it runs *first* and every later revoke wins. **On cloud it inverts** —
cloud is already at `20260817130000`, so this file pushes **last**, and any grant it makes has
nothing left to narrow it.

**Because of that it was AMENDED IN PLACE on 2026-08-23 (`466cfc2`; Muskan ruled it live rather
than at the gate, because it changes what lands on production).** The functions statement originally
read `to anon, authenticated, service_role`; **`anon` was removed.**
`20260817120000_anon_execute_lockdown.sql` §3 revokes exactly that default and **has been live on
production since 2026-08-17** — it will not re-run. Pushed as originally written, this file would
have re-widened the functions default on production with nothing left to narrow it, re-opening
session 77's deny-by-default. The statement is now **order-independent**: it asserts the same end
state whether it replays first or pushes last. **Do not "restore" `anon` for symmetry with the
tables and sequences statements** — the file carries an inline note saying so.

**Pre-flight for this one — the check MUST NAME THE ROLES, not just the privilege letters.**
The migration header's original production check recorded letters only (*"functions `X`"*), which
structurally cannot tell you *who* holds the grant — and that omission is exactly why the defect
above went undetected (L-034). Run this on cloud **before and after** the push:

```sql
select  d.defaclobjtype                as objtype,   -- r = tables, S = sequences, f = functions
        pg_get_userbyid(d.defaclrole)  as grantor,
        n.nspname                      as schema,
        d.defaclacl                    as acl        -- ← read the GRANTEES, entry by entry
from    pg_default_acl d
join    pg_namespace  n on n.oid = d.defaclnamespace
where   n.nspname = 'public'
order by 1;
```

Read the `acl` array itself, element by element — a summary of the privilege letters is not an
answer to this question:

- **`objtype = 'f'` (functions) — `anon=X/postgres` MUST NOT be present after the push.** Expect
  `authenticated=X/postgres` and `service_role=X/postgres` only. If `anon=X` appears, this file has
  re-opened the 2026-08-17 lockdown and a compensating revoke is needed in the same sitting.
- **`objtype = 'r'` (tables) and `'S'` (sequences)** — `anon`, `authenticated` and `service_role`
  all present is **CORRECT and unchanged**. That is the standard Supabase model, RLS is the access
  boundary, and it matches production today. Narrowing the tables arm is **T11's** job
  (deny-by-default for TABLES was never installed) and must not be smuggled in here.

Then confirm the 2026-08-17 lockdown still holds end-to-end, both mechanisms:
- database linter `0028_anon_security_definer_function_executable` stays at its **single**
  allowlisted finding (`get_public_profile`);
- the `revoke_anon_execute_on_new_function` event trigger is still present
  (`select tgname from pg_event_trigger;`). It is session 77's *second* mechanism, installed as belt
  **and** braces — a green linter with a missing trigger is only half the state.

**Tables and sequences are expected to be a true no-op on production** (`pg_default_acl` already
holds those values there). After the amendment the functions statement is a no-op too — it
re-asserts what production already has. The risk in this file was never the grants it lands; it was
**the push protocol and the ordering assumption**, and both are now stated above.

---

`20260820090000_discoverable_company_shop_chrome.sql` — **T01 / HEL-55.** DROP + CREATE of
`public.get_discoverable_company(uuid)`, adding five projections (`address`,
`warehouse_location`, `updated_at`, `metadata->'links'`, `metadata->'locations'`) so the buyer's
shop can render the seller's chrome. LOCAL only.

**⚠️ SAME-DEPLOY with the app code.** The RPC's return shape changes; an old client against the
new function is fine, but the new `companies.ts` mapper against the OLD function returns
`undefined` for five fields. Ship the migration and the branch together (ADR-0005 blast-radius
table).

**Pre-flight for this one:**
- `DROP` discards the ACL. The migration re-issues the three-statement ritual
  (`revoke all … from public` · `grant execute … to authenticated` · `revoke execute … from anon`).
  **Verify on cloud after applying:** `proacl` must read `postgres=X, authenticated=X,
  service_role=X` — no PUBLIC entry, no `anon` entry.
- The body was built from `20260617090000_sec01_caller_verified_discover_gate.sql:112-183`,
  verified byte-identical to the then-live function. **Re-diff against the CLOUD body before
  applying** — this is the class that once stripped `list_discoverable_companies()`'s verified
  gate on production.
- After applying, confirm `public.is_caller_verified()` and `c.id = p_company_id` are both still
  in the live body. Losing either is silent and severe.
- Advisor 0028 should stay at its single allowlisted finding (`get_public_profile`) — the
  function was already `SECURITY DEFINER` and already anon-revoked.

---

`20260822090000_discoverable_shop_spec_columns.sql` — **T05 / HEL-59.** `DROP + CREATE` of
`public.get_discoverable_shop(uuid)`, adding **twelve** OUT columns (`cbg_percent`, `cbn_percent`,
`terpene_percent`, `cultivator`, `lineage_parent_a`, `lineage_parent_b`, `irradiation_code`,
`packaging_material`, `resealable`, `location`, `pack_sizes`, `media`) plus two deliberate
visibility changes. LOCAL only. **Flagged as missing at /build T06; written at T08 (2026-08-23).**

**⚠️ SAME-DEPLOY with the app code.** The RPC's return shape changes; the new buyer-shop mapper
against the OLD function returns `undefined` for twelve fields. Ship the migration and the branch
together (ADR-0005 blast-radius table).

**⚠️ AND IT MUST PRECEDE T06.** `20260822100000` re-declares this same function's `profile_visible`
term. Applied out of order, T06's edit lands on a function that does not have these columns — or is
overwritten by this one. Timestamp order is not a formality for this pair.

**The two visibility changes, both deliberate, both G4-ruled:**
1. **The owner arm.** `p.profile_visible = true` becomes
   `(p.profile_visible = true or p.company_id = public.current_company_id())`, so a member of the
   seller's own company reads their whole catalogue through this door. It attaches to
   `profile_visible` **only** — the visibility WINDOW stays outside it.
2. **Unfiled products are not served to buyers.** A product with no `location` is withheld unless
   the caller is a member of the owning company (T05's G4, DECISIONS 2026-08-22). The owner
   exception exists so `/discover/<own company id>` does not show a member a *smaller* catalogue
   than their own `/present` shop.

**Pre-flight for this one:**
- **`DROP` discards the ACL.** The migration re-issues the full three-statement ritual
  (`revoke all … from public` · `grant execute … to authenticated` · `revoke execute … from anon`).
  **Verify on cloud after applying:** `proacl` must read `postgres=X, authenticated=X,
  service_role=X` — no PUBLIC entry, no `anon` entry.
- **Re-diff the base body against the CLOUD function before applying.** The body was copied verbatim
  from `20260816190000_tier_ladder_contract.sql:82-154` and diffed byte-identical against the running
  DB on 2026-08-22. Confirm again on cloud — this is the class that once stripped
  `list_discoverable_companies()`'s verified gate on production.
- **After applying, confirm `public.is_caller_verified()` is still in the live body**, and that the
  visibility window (`visibility_start` / `visibility_end`) is still **outside** the owner
  parenthesis. An expired product must stay invisible to every caller; no amount of non-expiring
  production data would ever reveal that mistake.
- **THE LEAK RULE (ADR-0005 §4) — re-read the live body after applying.** `pack_sizes` must project
  `p.metadata -> 'pack_sizes'`, **one named key**, never `p.metadata` (which carries the seller's
  private per-company notes), and **`supplier_product_code` must be ABSENT from the OUT list
  entirely** (a G3 commercial-confidentiality call). Both are a one-word edit away from a leak, and
  neither has a substring check that would catch it.
- Advisor 0028 should stay at its single allowlisted finding (`get_public_profile`) — the function
  was already `SECURITY DEFINER` and already anon-revoked.

---

`20260822100000_connection_visibility_override.sql` — **T06 / HEL-60.** New helper
`public.is_connected_to_company(uuid)` (SECURITY **INVOKER**, signed), applied at three sites:
the `product_public_select` RLS policy, `current_pricelist_item`'s public arm, and
`get_discoverable_shop`'s `profile_visible` term. Rides along: the G3-signed **verification
tightening** on site 1, and the `anon` SELECT revoke on `product_media`. LOCAL only.

**🔴 THIS MIGRATION REMOVES READS FROM LIVE CALLERS. Two classes, both real on production:**

1. **Members of an UNVERIFIED company.** Today `product_public_select` carries no
   `is_caller_verified()`, so *any* authenticated company member — verified or not — reads every
   `profile_visible` product in the database. After this migration they read none of another
   company's. **On production that is `CNG Berlin`** — the one product-holding company still
   `pending` (4 companies hold products; 3 verified, 1 pending). Its members lose every
   cross-company catalogue read until it is verified.
2. **COMPANYLESS authenticated callers** (`current_company_id()` IS NULL → `is_caller_verified()`
   is false). HS staff/reviewer accounts with no `person.company_id` are in this class. They read
   cross-company products today; they will read none.

**And it CASCADES beyond `product`.** `pricelist_item_public_select`,
`product_image_public_select` and `product_media_public_select` each nest
`EXISTS (SELECT 1 FROM product p …)`, and a policy subquery is RLS-filtered **as the calling
role** — so the site-1 edit propagates into all three with no edit to them.
`plit_public_select` nests the same EXISTS but is **not** a fourth: it already inlines
`public.is_caller_verified()` itself (`20260814120000:74`), so the site-1 edit changes
nothing for it. That is why `pricelist_item_tier` is absent from the effect list below. Both classes above
therefore also lose direct reads of `product_image`, `product_media` and `pricelist_item`.
Measured locally, not inferred. The *override* does **not** propagate in the other direction:
each nested predicate restates `p.profile_visible = true` itself.

**Pre-flight for this one:**
- **Re-diff all three bodies against the CLOUD versions before applying** — `pg_policy.polqual`
  for `product_public_select`, `pg_get_viewdef('public.current_pricelist_item', true)`, and
  `pg_get_functiondef('public.get_discoverable_shop(uuid)')`. Local↔prod were byte-identical for
  the policy at plan time; confirm again. This is the class that once stripped
  `list_discoverable_companies()`'s verified gate on production.
- **After applying, confirm `current_pricelist_item` still carries `security_barrier=true`**:
  `select reloptions from pg_class where relname = 'current_pricelist_item'`.
  `CREATE OR REPLACE VIEW` without a `WITH` clause silently drops the reloption and a
  body-to-body predicate diff cannot see the loss. The migration re-states it explicitly.
- **Confirm the visibility WINDOW is still OUTSIDE the override parenthesis** at all three sites.
  An expired product must stay invisible to a connected buyer, and no amount of non-expiring
  production data would reveal the mistake.
- **Confirm `p.price_public` is still un-`or`-ed** in the view's public arm. Connection reveals
  the product, never the price.
- `get_discoverable_shop` uses `CREATE OR REPLACE` (grants survive); the 3-statement ritual is
  re-issued anyway. Verify `proacl` on both it and `is_connected_to_company` reads
  `postgres=X, authenticated=X, service_role=X` — no PUBLIC entry, no `anon` entry.
- **`anon` must hold no SELECT on `product_media`** afterwards, and `product_media_public_select`
  must list only `authenticated`:
  `select has_table_privilege('anon','public.product_media','SELECT');` → `f`.
- **Performance, named not solved:** `is_connected_to_company` is **not inlined** — it appears
  literally in the `Filter:`, so it runs per row and `idx_product_company_profile_visible` is lost
  to a Seq Scan. Measured on 20 000 synthetic rows: 1.7 ms → 1327 ms. Production holds 13
  products, so this is a scaling cliff, not a live problem. Watch it if the catalogue grows.

---

`20260823090000_connection_consent_and_verification_lockdown.sql` — **T09.** The connection and
verification **write** lockdown. `relationship` loses `INSERT/UPDATE/DELETE/TRUNCATE` from
`authenticated` and **all** privileges from `anon`; the one legitimate relationship write moves into
a new consent-checking `accept_connection_request(uuid)` SECURITY DEFINER RPC; `company` and
`pending_inbox_item` lose table-wide UPDATE and get explicit column **allowlists**; a new
`resubmit_company_verification()` RPC carries the only verification write a member may make; and
`inbox_insert` is re-created with `sender_person_id = auth.uid()`. LOCAL only. **Flagged as missing
at /build T07; written at T08 (2026-08-23).**

**🔴 SAME-DEPLOY — AND THE APP HALF IS ALREADY IN THIS BRANCH.**
`src/modules/messaging/supabase/store.ts:589` calls **`accept_connection_request`** and
`src/app/onboarding/actions.ts:182` calls **`resubmit_company_verification`**. **Neither function
exists on production.** Shipping the branch without this migration breaks accepting a connection and
resubmitting a rejected company, live, on the golden path. This is the entry in the batch that most
needs same-deploy ordering.

**What it closes — three live holes, each reproduced end-to-end and rolled back before the fix:**
1. **Self-declared connections.** `rel_all`'s WITH CHECK only requires the *caller's own* company to
   be one side of the pair and never consults the counterparty, so any signed-in user could
   `INSERT INTO relationship (…, status) VALUES (me, anyone, 'active')` through a direct PostgREST
   call. Since the buyer-shop work that row **is** the confidentiality gate for hidden catalogue
   data — one forged row and a stranger reads every hidden product. The attacker never had to defeat
   the status logic; they wrote `'active'`.
2. **The consent evidence was itself forgeable.** `inbox_update`'s WITH CHECK pinned only the
   `receiver_*` columns and never re-checked who **sent** the request; and **nothing anywhere
   constrained `sender_person_id`**. Proven live against the *shipped* `accept_person_connection`,
   which minted a non-consensual `person_connection` edge whose `initiated_by_person_id` named the
   victim. A permission gate is only as strong as the write path to its input.
3. **Self-verification.** Any member could `UPDATE company SET verification_status = 'verified'` on
   their own row, clearing every `is_caller_verified()` gate in the product and forging the
   `verified_by` / `verified_at` audit trail.

**⚠️ THIS REMOVES WRITES FROM LIVE CALLERS, deliberately.** Nothing in the application can now
suspend, end or soft-delete a relationship — no disconnect surface exists today, and re-opening that
door belongs to whichever ticket builds one. SELECT on `relationship` is untouched; every read stays
on `rel_all`.

**Pre-flight for this one:**
- **Re-diff `inbox_insert` against the LIVE policy before applying.** The live policy is
  `INSERT | {authenticated} | with_check: (sender_company_id = current_company_id())`
  (`20260607170000_rls_policies.sql:233`). The migration re-creates it **`TO authenticated`**
  deliberately: re-creating it without the role list silently widens it to `{public}` — a defect an
  earlier round of this very fix introduced and a checker caught. Verify afterwards:
  `select polname, polroles::regrole[], pg_get_expr(polwithcheck, polrelid) from pg_policy
   where polrelid = 'public.pending_inbox_item'::regclass;`
- **After applying, confirm the column allowlists landed as allowlists and not as a table-wide
  re-grant:**
  `select table_name, column_name from information_schema.column_privileges
   where table_name in ('company','pending_inbox_item') and grantee = 'authenticated'
     and privilege_type = 'UPDATE' order by 1,2;`
  → `company` must **not** list `verification_status`, `verified_at`, `verified_by`;
  `pending_inbox_item` must **not** list `id`, `type`, `sender_company_id`, `sender_person_id`,
  `receiver_company_id`, `receiver_person_id`. A column-only REVOKE cannot override a table-level
  grant — that is why these are REVOKE-then-re-GRANT, the DEV-88 pattern statement for statement.
- **Confirm `relationship` holds no write privilege in either role afterwards:**
  `select relacl from pg_class where oid = 'public.relationship'::regclass;`
  → no `anon=` entry at all, and `authenticated` keeping **`r` (SELECT) only**.
- **Verify both new RPCs carry the three-statement ritual:** `proacl` on
  `accept_connection_request(uuid)` and `resubmit_company_verification()` must read
  `postgres=X, authenticated=X, service_role=X` — no PUBLIC entry, no `anon` entry.
- **TRUNCATE is closed by a grant, never by a policy.** RLS does not apply to TRUNCATE at all — it
  is checked against the privilege alone — so no policy that could be written on these tables would
  close it. Do not "simplify" these revokes into policy edits.
- **`FROM PUBLIC` alone does not revoke `anon`** (the 2026-08-17 rule). Both roles are named in the
  file and both must stay named through any future edit.
- **⚠️ MAINTENANCE CAVEAT that outlives this push:** because `company` and `pending_inbox_item` are
  now per-column allowlists, a future `ALTER TABLE … ADD COLUMN` on either will **not** be updatable
  by `authenticated` until the column is added to the re-GRANT. Same documented trade-off as
  `person` (DEV-88, `20260710120000`). If you add a column the app writes directly — not via a
  definer RPC — extend the GRANT in a new migration.
- **Known follow-on, filed not fixed:** the accept path swallows its own errors. The RPC now RAISEs
  on a re-accept and neither `InboxView.tsx:137` nor `RequestsSection.tsx:95-103` catches it, so it
  degrades to a silent no-op with an unhandled rejection (DEV-83's exact shape, made reachable by
  this migration). Tracked as **T10** in the slug's `TICKETS.md`.

---

`20260823100000_basket_admission.sql` — **T07 / HEL-61.** One **new** restrictive policy
`basket_line_admission` on `public.product_basket_line`, **three `create or replace` functions**
(`product_visible_to_caller`, `product_admissible_to_basket`, `get_my_basket_lines` — all
`security definer`), plus `revoke all … from anon` and `from public`. LOCAL only.

> **⚠️ THIS PARAGRAPH USED TO SAY THE OPPOSITE — corrected 2026-08-24 at `/ship`.** It read
> *"Nothing existing is re-declared … there is no `create or replace` in the file"* and
> *"no visibility predicate is restated"*. Both were true when this entry was written and both
> were falsified **inside the same slug**, by the ship gate's security rounds 2 and 3, which
> moved the visibility rule into a function and added the curated read RPC. Nobody reopened the
> ledger. **L-031's class, and the ledger is the push procedure — so a stale entry here is not a
> documentation defect, it is an unverified production change.** The pre-flight below is
> extended accordingly.

**What it closes.** `product_basket_line` carried ownership as its only rule, so any
authenticated caller could POST a line for **any** `product_id` — a competitor's hidden product
included. The read hid the product's name; the row still existed, the count was wrong, and
`toDraftLines` carried it into a deal draft. The new policy's `WITH CHECK` requires the caller
to be able to SEE the product **and**, unless they own it, `price_public`.

**Where the visibility rule lives now — and why it is not inherited.** The original design
inherited visibility from the `product` policies via an RLS-filtered `EXISTS`. That is gone.
RLS filters **rows, not columns**, so admitting a connected buyer's hidden rows through the base
table handed over `rrp_per_gram`, `supplier_product_code` and raw `metadata` (L-036). The base
policy therefore stays narrow and the rule lives in **`product_visible_to_caller()`**, evaluated
`security definer` so it returns a boolean and never a readable row. `get_my_basket_lines()`
gates its four detail columns on the same function per read, so the write gate and the read
projection cannot drift.

**⚠️ Its buyer arm must stay term-for-term equal to `get_discoverable_shop`.** Round 4 of the
ship gate found three terms present in the shop door and absent here — the seller company's
`deleted_at` and `verification_status`, and the unfiled (`location is not null`) rule — and a
soft-deleted seller's hidden product was still returning its current name, cultivar, PZN and
price through the basket while the shop door returned nothing. All three are now in the buyer
arm. **The owner arm deliberately carries none of them** (a seller sees their own products
regardless of company state, and keeps their unfiled `Unassigned` pile). See L-038.

**⚠️ TWO GROUPS LOSE BASKET DETAIL THE MOMENT THIS LANDS, by design** — on top of the two
caller classes the slug already names: buyers holding lines from a seller whose company is
**soft-deleted or not verified**, and buyers holding lines on a product with **no location set**.
Both go dark (line still listed, still deletable) rather than erroring.


**⚠️ THIS REMOVES WRITES FROM LIVE CALLERS — deliberately, and in one further way than the
attack it closes.** The policy is `FOR ALL`, so its `WITH CHECK` runs on UPDATE as well as
INSERT. A buyer holding a basket line for a product that has since gone hidden **or**
price-hidden can no longer change that line's pack count or pack size. This is the ticket's
**accepted consequence** (PRD §7 puts it out of scope for v1). The line stays **readable and
deletable** — the policy carries `WITH CHECK` only and **deliberately no `USING` clause**, and
`SELECT`/`DELETE` have no `WITH CHECK` phase. Both client callers now surface the refusal
instead of dropping it (`ShopView.handleAddToBasket`, `BasketDrawer`'s pack-count stepper).

**It also closes one T11 instance early — in BOTH roles.** `anon` **and** `authenticated` each
hold **TRUNCATE** on this table today (`has_table_privilege(…,'TRUNCATE')` → `t` for both,
measured). RLS does not reach TRUNCATE at all — it is a table-level operation checked against
the privilege alone — so no policy stood between a caller and an emptied basket table, and no
policy that could be written on this table would change that. The `authenticated` half was
**proven reachable with real rows at G4**: a signed-in buyer truncated a basket line belonging
to a seller he cannot see. So the file carries a third revoke:

    revoke truncate, references, trigger, maintain
      on public.product_basket_line from authenticated;

`authenticated` **keeps SELECT / INSERT / UPDATE / DELETE** — the whole basket depends on them,
and the named-verb form (rather than `revoke all` + re-`grant`) is what keeps them out of reach
of a re-grant list. `MAINTAIN` is PG17+; the cloud project reports `postgres_engine: 17`
(17.6.1.127), so the bare verb parses there. T11's sweep should not re-report this table as
open in either role.

**Pre-flight for this one:**
- **Confirm `basket_line_owner_all` is still present and unmodified on cloud AFTER applying**:
  `select polname, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
   from pg_policy where polrelid = 'public.product_basket_line'::regclass;`
  → **two** rows; `basket_line_owner_all` permissive with qual **and** with-check
  `(owner_person_id = auth.uid())`.
- **Confirm `basket_line_admission`'s `polqual` is NULL.** A non-NULL qual means a `USING`
  clause got added, which delete-proofs rows and silently shrinks baskets. This is the shape
  decision, and `supabase/tests/basket_admission_test.sql` cell 9 is its guard.
- **Confirm `polcmd` is `*` (ALL), not `a` (INSERT).** An INSERT-only policy is ornamental here:
  `authenticated` holds table-wide UPDATE, so a buyer inserts a legal line and PATCHes its
  `product_id` onto a hidden product.
- **Do not answer this with a column-REVOKE on `product_id`.** `addToBasket` is a PostgREST
  upsert and `ON CONFLICT DO UPDATE` needs UPDATE privilege on every payload column — the
  revoke breaks the real add path.
- **After applying, check the whole ACL, not just `anon`**:
  `select relacl from pg_class where oid = 'public.product_basket_line'::regclass;`
  → no `anon=` entry, no PUBLIC entry, and **`authenticated=arwd/postgres` exactly** — the
  letters render in the fixed order `arwdDxtm` (INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
  REFERENCES, TRIGGER, MAINTAIN), so `arwd` is the four kept verbs and nothing else. Anything
  longer means a revoke did not land; anything shorter means it over-reached and the basket is
  broken. Local reads exactly `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,
  service_role=arwdDxtm/postgres}` after a clean `db reset`. Note that `relacl` carried **no
  PUBLIC entry before this migration either** — tables get no default PUBLIC grant, so
  `from public` is defence in depth, not a door being closed.
- **This migration depends on T06 (`20260822100000`) — a HARD dependency, corrected 2026-08-24.**
  This bullet used to say the dependency was that "the buyer arm of the EXISTS resolves through
  `product_public_select`, which T06 rewrites". That mechanism no longer exists (see the note at
  the top of this entry). The real dependency is stronger: **`product_visible_to_caller()` calls
  `public.is_connected_to_company()`, and that function is CREATED by `20260822100000`.** So
  applying T07 without T06 does not merely gate against an older rule — the `create or replace`
  itself fails to resolve. Filename order already handles this; do not reorder the batch.
- **Confirm the three functions exist, are `security definer`, and pin `search_path`** (added
  2026-08-24 — the original pre-flight verified the policy and nothing else, while the file
  declares three functions):

      select p.proname, p.prosecdef, p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('product_visible_to_caller',
                           'product_admissible_to_basket',
                           'get_my_basket_lines');

  → **three** rows, `prosecdef` = `t` on all three, `proconfig` = `{search_path=}` on all three.

- **Confirm `anon` cannot execute any of them** (the 2026-08-17 rule: revoke from PUBLIC alone
  does NOT revoke `anon`):

      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('product_visible_to_caller',
                           'product_admissible_to_basket',
                           'get_my_basket_lines');

  → `anon_exec` **false** on all three. `auth_exec` true on all three (the
  `product_visible_to_caller` leg is unnecessary — **T14** removes it later; it is not a defect).

- **Confirm the buyer arm carries all six terms.** Read the body back and check for the three
  round-4 terms by name — `deleted_at`, `verification_status`, `location` — alongside the
  original three. A `create or replace` from a stale copy is exactly how this repo lost
  `list_discoverable_companies()`'s verified gate:

      select pg_get_functiondef('public.product_visible_to_caller(uuid)'::regprocedure);

  → the buyer arm contains `c.deleted_at is null`, `c.verification_status = 'verified'` and
  `p.location is not null`; the **owner arm contains none of them**.

- **`get_my_basket_lines` is a NEW RPC the shipped app already calls.** `reads.ts` invokes it on
  every basket render. **Same-deploy rule applies with no slack**: if the app code reaches
  production before this migration, every basket read fails — and `BasketProvider`'s bare
  `.catch` renders that failure as an **empty basket**, not an error (**T15**). Push migrations
  first, confirm this function exists on cloud, then let the app deploy.

---

## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT (nothing here is a migration; `db push` will never do it)

**Migration debt and non-migration deploy debt are different classes, and this file used to conflate
them.** A batch can be fully applied — every migration live, history clean — and still owe edge
functions, secrets, dashboard steps and cloud UAT. Filed under an "APPLIED" heading, that debt
disappears. Everything below belongs to a batch whose **migrations are all live**; each item is a
separate manual step somebody has to run.

**Collected here at T08 (2026-08-23), moved out of the batch subsections that owned them.** Each
item says where it came from, and a pointer was left at each origin. Nothing was dropped or
summarised. **One deliberate edit, disclosed:** the `erase-expired-accounts` bullet said the cron
`net.http_post` was *"above"* — a word that stopped resolving the moment the block moved. It now
names the migration, `20260706090200_erasure_cron.sql`. Everything else is verbatim.

---

### 1. Phase 13 — lifecycle emails + the erasure sweep · **OWED** · migrations applied 2026-07-07

*Moved from* `## HISTORICAL … › ### 2026-07-06 (Muskan) — Phase 13 Settings + Lifecycle Emails`.
Its three migrations (`account_lifecycle`, `notification_preference`, `erasure_cron`) went live on
2026-07-07 — see `## APPLIED TO CLOUD › ### 2026-07-07`. **These three steps did not.**
Corroborated independently in that same APPLIED entry and in `CLAUDE.md` item 0.

**Non-migration cloud steps — REQUIRED for lifecycle emails + the erasure sweep (do WITH the push):**
- `supabase functions deploy send-lifecycle-email` — SET-03 sender (Deno `fetch` → Resend; resolves the recipient from `auth.users` via a service-role client; invoked fire-and-forget via Next 16 `after()` from each event's server action).
- `supabase functions deploy erase-expired-accounts` — SET-02 day-30 sweep worker (performs the `auth.admin` email-tombstone + soft-delete that Postgres itself can't; called by the pg_cron `net.http_post` in `20260706090200_erasure_cron.sql`).
- `supabase secrets set RESEND_API_KEY=…` — **net-new edge secret**. The Resend sending domain is already verified for auth SMTP; confirm the same domain works for API `from: Hello Sello <noreply@hello-sello.com>` sends before relying on it (**Assumption A1** — silent rejection if the from-address isn't on a verified domain). Reused / already set: `SUPABASE_SERVICE_ROLE_KEY` (edge, auto-injected), Vault `project_url` / `edge_anon_key`.

**Live consequence today:** `erasure_cron` scheduled the nightly `erase-expired-accounts` job on
production, so it **fires at 3am and errors harmlessly** (edge fn missing / no key). Deploy the two
functions + the secret to activate lifecycle emails and the day-30 sweep, or
`select cron.unschedule('erase-expired-accounts');` to silence it. **Emails do not send until then.**

### 2. Phase 13 — cloud UAT on two admin-API paths · **OWED** · cannot be proven locally

*Moved from the same Phase 13 subsection.* This block is **unique in this file** — unlike the deploy
steps above, nothing else records it. It is owed whether or not the edge functions ship, because the
paths it covers cannot be exercised against the local GoTrue at all.

**⚠️ Cloud UAT required — two admin-API paths that 403 on the LOCAL GoTrue (RESEARCH A3):**
- **Erasure auth-scrub** — `erase-expired-accounts` calls `auth.admin.updateUserById` (email tombstone) + `deleteUser({ shouldSoftDelete: true })`. Only the DB-side `scrub_person_pii` half is proven locally (invariant test); the GoTrue admin half must be UAT'd on cloud.
- **Session-revoke** — the same `sb_secret_`-vs-local-GoTrue caveat as the Phase 11 token-revoke; exercise once on cloud to confirm the sign-out/revoke path.

### 3. Phase 11 — invite/remove config · **ONE DISCHARGED, ONE UNCONFIRMED** · migrations applied 2026-06-23

*Moved from* `## HISTORICAL … › #### Phase 11 — RBAC activation + company team`. Its 6 migrations
went live on 2026-06-23 — see `## APPLIED TO CLOUD › ### 2026-06-23`. **T08 ruled both of its
non-migration steps explicitly rather than sweeping them with the batch:**

- ✅ **`SUPABASE_SECRET_KEY` in Vercel — DISCHARGED.** The `### 2026-06-23` APPLIED entry records,
  by name, *"Cloud config set same day: `SUPABASE_SECRET_KEY` in Vercel + 3 email templates in
  dashboard."* Same day as this batch's push. Closed.
- ⚠️ **`supabase/templates/invite.html` pasted into the dashboard — NOT CONFIRMED, so still owed.**
  The same line says *"3 email templates"* but **does not name which three**, and Phase 10 left
  "cloud email templates" owed for `recovery.html` and `email_change.html` — so three templates on
  that date is consistent with the Invite one being included and equally consistent with it not
  being. **No record anywhere in the repo names it.** Kept as owed rather than assumed discharged:
  the cost of checking is one dashboard page, and the cost of being wrong is that every invite email
  goes out on GoTrue's default template, whose `{{ .ConfirmationURL }}` link **bypasses the
  safeNext-guarded `/auth/confirm` route** this project deliberately uses.

**The step, verbatim as Phase 11 wrote it:**

**Non-migration cloud steps — REQUIRED for live invite/remove (do WITH the push):**
- Set **`SUPABASE_SECRET_KEY`** in Vercel env (server-only service-role key) — `src/shared/db/admin.ts` / `inviteUserByEmail` / admin `signOut` all need it. Until then the local `sb_secret_` key 403s the GoTrue admin API (HS256 caveat) → invite/remove can't run end-to-end.
- Paste **`supabase/templates/invite.html`** into the cloud dashboard → Auth → Email Templates → **Invite** (`config.toml` is local-only; cloud templates are dashboard-managed).

**How to close it:** open the Supabase dashboard → Auth → Email Templates → Invite and compare
against `supabase/templates/invite.html`. If it matches, mark this item discharged here and say
where it was checked. If it does not, paste it — that IS the step.

### Ruled and NOT outstanding — recorded so the survey is not re-run

- **Phase 12 (Path B)** states its own answer in place: *"No non-migration cloud steps (pure DB — no
  new env var or email template)."* Nothing owed.
- **Every other subsection** under `## HISTORICAL — every migration below is APPLIED to cloud`
  carries migrations only. The three blocks above are the complete set of non-migration residue in
  this file; the survey covered all 13 subsections.

---

## ✅ APPLIED 2026-08-17 — anon/PUBLIC execute lockdown + `ensure_rls` drift capture (2 migrations)

Pushed with **`supabase db push`** (not MCP), so cloud `schema_migrations` took the filename
timestamps directly — **no history repair needed**, a first for this project. `migration list --linked`
confirms local and remote columns match on both rows.

- `20260817120000_anon_execute_lockdown.sql` — 61 functions lose `EXECUTE` from **PUBLIC *and* anon**
  (both grants are needed; revoking either alone leaves the other — see ARCHITECTURE-NOTES 2026-08-17).
  `seed_company_superadmin` + `sella_detect_worker` also lose `authenticated`. Narrows
  `ALTER DEFAULT PRIVILEGES` for anon, and installs the `revoke_anon_execute_on_new_function`
  event trigger that strips PUBLIC + anon at `CREATE FUNCTION` time.
- `20260817130000_capture_ensure_rls_drift.sql` — captures `rls_auto_enable()` + the `ensure_rls`
  event trigger, which existed on cloud but in no migration. Body diffed **byte-identical** against
  prod's live `pg_get_functiondef()` first → a proven no-op on cloud, a real creation locally.

**Grants only — no function body, table, or row touched.** `get_public_profile` deliberately keeps
`anon` (the public `/c/<handle>` QR page).

**Verified on production after the push:** database linter `0028_anon_security_definer_function_executable`
went **65 → 1** (only `get_public_profile`); `seed_company_superadmin` and `sella_detect_worker` no longer
appear in the advisor at all, confirming their `authenticated` grants are gone.

**Pre-flight baseline recorded:** 63 anon-executable · 81 authenticated-executable · 92/92 tables RLS on ·
7 event triggers · 144 migrations.

**Gate before push:** fresh `supabase db reset` green · 36/38 SQL suites (the 2 failures —
`announcement_projection`, `onboard_company_categories` — A/B-proven pre-existing against a reset
*without* these migrations) · tsc clean · 375/375 unit · both new guard tests proven RED-first.

**Open, not fixed:** `public.sella_detection` has RLS enabled with no policies (linter INFO). For a table
written only by SECURITY DEFINER functions that is the correct secure shape — worth one conscious
confirmation, not assumed to be a bug.

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
is no local file to repair it against. ~~This one row will still trip "remote migration version not found
locally" on a future plain `supabase db push` — the only full fix would be re-adding a no-op placeholder
file, which is a call for whoever next needs a clean CLI push, not a mechanical repair.~~

> **🔴 SUPERSEDED — and this file carried BOTH claims at once until T08 (2026-08-23).** The struck
> sentence says the orphan row still blocks a plain `db push`; the tier-ladder Migration E entry
> (`## ✅ APPLIED 2026-08-16`) says the opposite, in the same file, about the same command. **The
> 2026-08-16 one is right and it is later:** Muskan deleted the orphan history row by hand that day
> (history-table-only; verified gone, 115 rows remained, none matching). **Proven since:** the
> 2026-08-17 lockdown batch pushed with a plain `supabase db push` and took the filename timestamps
> directly — *"no history repair needed, a first for this project"*. No placeholder file was ever
> needed. **A plain `db push` is no longer blocked by this row.**

**Full history is now clean** except that single known exception. This closes the CLAUDE.md #0 "pre-Lane-A
reconcile pass" item.

## ✅ STATUS 2026-07-07 (historical) — cloud == local, tip `20260707090000`

Every migration through `20260707090000` is applied to cloud. The most recent batch (**9 migrations** —
DEV-99 taxonomy + Phase 7 Present + Phase 13 lifecycle + Allocate) was pushed **2026-07-07** (0 errors,
`get_advisors(security)` = 0 ERROR); see the top of **APPLIED TO CLOUD**. All "PENDING" sections below
that predate this entry are **historical / superseded** — kept for their apply notes, not because
anything from THEM is outstanding. ~~(see the 2026-07-20 marker above for what actually is)~~
**⚠️ CORRECTED AT T08 (2026-08-23): there is no "2026-07-20 marker" and there never was** — no
section of this file has ever carried that date. The pointer was dangling, and what it pointed at
would be stale now anyway. **What is actually outstanding today:**
- **Migrations** → `## ✅ APPLIED 2026-08-24 (was PENDING 2026-08-20, Muskan) — slug 0022 buyer-shop-view`, at the top of
  this file. That is the only such section.
- **Non-migration** → `## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`, immediately after it.

The ONLY genuinely-outstanding cloud work THIS entry knew about is **non-migration**: deploy edge fns
`send-lifecycle-email` + `erase-expired-accounts`, set `RESEND_API_KEY`, and (optional) unschedule the
harmless `erase-expired-accounts` 3am cron. Details in the 2026-07-07 APPLIED entry — **and now
stated in full under § OUTSTANDING — NON-MIGRATION DEPLOY DEBT item 1**, which also carries a
cloud-UAT block neither this entry nor the 2026-07-07 one knew about.

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

## ✅ APPLIED 2026-07-16 (session 64) — person.company_id self-write lockdown (SECURITY)
<!-- Heading until 2026-08-23 (T08): "## ⚠️ PENDING (2026-07-10, Muskan) — 1 migration: person.company_id self-write lockdown (SECURITY)" -->

> **🔴 THIS SECTION READ `⚠️ PENDING` AND SHOUTED A LIVE PRODUCTION VULNERABILITY UNTIL 2026-08-23.
> IT HAD BEEN CLOSED FOR FIVE WEEKS.** `20260710120000_person_company_id_lockdown.sql` was pushed
> directly to production in **session 64 (2026-07-16)** and its history row reconciled on
> 2026-07-22 — see `## ✅ RECONCILED 2026-07-22`, which lists it under *"Session 64's direct pushes
> (2)"*, and `CLAUDE.md` item 0b, which records the production grants verified post-deploy
> (`company_id` confirmed absent from `authenticated`'s UPDATE column list). Corrected at T08.
>
> The body below is kept **unchanged** — it is the apply record and the reason the fix has the shape
> it does. Only the heading and the one false claim inside it are annotated.

- **`20260710120000_person_company_id_lockdown.sql`** — closes the cross-tenant self-join hole
  (any authenticated user could `UPDATE person SET company_id = <any>` on their own row via a
  direct API call and read that company's private data). Two parts, one migration:
  1. `REVOKE UPDATE ON person FROM authenticated` + re-`GRANT UPDATE` on every column **except**
     `company_id`. (A column-only `REVOKE (company_id)` does NOT work — Supabase's table-level
     grant overrides it; same lesson as the allocate-schema note.)
  2. `onboard_company` → `SECURITY DEFINER` so founder onboarding can still set `company_id`.
- ~~**⚠️ PRODUCTION IS STILL VULNERABLE until this is pushed** — cloud has the same base RLS + table
  grant. Push together with any other pending migration; additive + safe (no data change). Apply
  the two halves atomically (this one migration does that).~~
  **NO LONGER TRUE — closed 2026-07-16.** Struck rather than deleted: the sentence is why the
  migration was pushed without review. Production grants were verified directly after the deploy.
  Kept for the record; **do not act on it.**
- **Before/after push, run:** `bash supabase/tests/run_person_company_lockdown_test.sh` (proves the
  direct write is denied + onboard_company still links). Local: RED→GREEN verified 2026-07-10.
- ~~**Needs Ayush review before cloud**~~ — **overridden and shipped without it** (Muskan's explicit
  call, session 64; the same precedent later reused for Lane A). Base RLS (`20260607170000`) + the
  onboarding security model are the shared lane. Tracked: DEV-88 (Urgent).

---

## ~~⚠️ READ FIRST~~ 🔴 SUPERSEDED — HISTORICAL (2026-06-20, Muskan) — cloud history HAD diverged
<!-- Heading until 2026-08-23 (T08): "## ⚠️ READ FIRST (2026-06-20, Muskan) — cloud history has DIVERGED; a naive `db push` FAILS" -->

> **🔴 DO NOT RUN ANY COMMAND IN THIS SECTION. Bannered at T08, 2026-08-23.**
> This is the record of a **one-time reconciliation that was carried out and completed on
> 2026-06-20** — see `## APPLIED TO CLOUD › ### 2026-06-20 — combined batch`: 47 versions reverted,
> 49 marked applied, 25 pushed, *"cloud history = 74, matches local"*. **The divergence it describes
> no longer exists.** The `migration repair` command lists below name **historical version strings
> that are no longer on cloud**; re-running them would corrupt a currently-clean history table.
>
> **History has been contiguous since**, and the one later exception (the `20260708155722 buy_schema`
> orphan row) was itself deleted on 2026-08-16 — the 2026-08-17 batch then pushed with a plain
> `supabase db push`, no repair.
>
> **The current push procedure is `## ✅ APPLIED 2026-08-24 (was PENDING 2026-08-20, Muskan) — slug 0022 buyer-shop-view ›
> How to push THIS batch`**, at the top of this file. That batch needs **`--include-all`**, which
> nothing in this section mentions.
>
> Kept in full — every command, every version list, every note — because it is the only record of
> how the history was repaired, and the technique will be needed again if it ever diverges.

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

## 🔴 SUPERSEDED — HISTORICAL: how the Phase 1 + 2 + 3c + 3d + 3f batch of 15 was pushed
<!-- Heading until 2026-08-23 (T08): "## How to push the pending migrations to cloud (Phase 1 + 2 + 3c + 3d + 3f — one batch of 15)" -->

> **🔴 DO NOT FOLLOW THESE STEPS. Bannered at T08, 2026-08-23.**
> **Those 15 migrations were applied to cloud on 2026-06-20** (`## APPLIED TO CLOUD ›
> ### 2026-06-20 — combined batch`, inside the 25 that pushed). Nothing here is pending.
>
> **This section's own qualifier is now stale too.** Verbatim, it read:
> *"**SUPERSEDED for the combined batch — see "⚠️ READ FIRST" above.** A plain `db push` fails on
> the history divergence; the steps below only work after the reconciliation repair."*
> But that section is now bannered as historical as well, so the pointer no longer qualifies
> anything, and its premise — that a plain `db push` fails on a history divergence — has been false
> since 2026-08-16. Both are history; **neither is a procedure to run.** Left unstruck
> because a reader who lands here mid-incident must not be handed four live-looking commands with a
> dead disclaimer above them — this banner is the disclaimer.
>
> **The current push procedure is `## ✅ APPLIED 2026-08-24 (was PENDING 2026-08-20, Muskan) — slug 0022 buyer-shop-view ›
> How to push THIS batch`**, at the top of this file. It differs in the way that matters: **this
> batch requires `--include-all`**, and step 3 below (`supabase db push`) would silently push five
> of its six migrations.
>
> Kept in full for its apply notes on `create or replace` ordering, which are still correct.

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

## ✅ HISTORICAL — every migration below is APPLIED to cloud (apply notes kept)
<!-- Heading until 2026-08-23 (T08): "## PENDING (local only — NOT on cloud yet)" -->

> **🔴 THIS HEADER READ `## PENDING (local only — NOT on cloud yet)` UNTIL 2026-08-23, AND WAS
> IMMEDIATELY FOLLOWED BY A `✅ APPLIED` SUBSECTION.** It has **13** subsections and **every
> migration in all 13 is live on cloud**. Reconciled at T08 so the section states one truth.
>
> **Nothing was deleted or moved out except non-migration debt** (see the ruling below). Every apply
> note, caution, ordering rule and `create or replace` explanation stays exactly where it was — they
> are why the pushes worked, and they are the reference for the next batch of the same shape.
>
> **The 13 subsections, and where each one's push is recorded:**
>
> | # | subsection | migrations | applied — recorded at |
> |---|---|---|---|
> | 1 | `### 2026-07-24 — Discover person↔person social graph` | 13 + 1 follow-up | ✅ 2026-08-16, Release 2 — stated in its own heading and body |
> | 2 | `### 2026-07-07 — Allocate/Sell schema (DEV-76)` | 1 | ✅ 2026-07-07 — `## APPLIED TO CLOUD › ### 2026-07-07` |
> | 3 | `### 2026-07-06 — Phase 7 Present fidelity` | 1 (+3 siblings) | ✅ 2026-07-07 — same entry |
> | 4 | `### 2026-07-05 — DEV-99 #3 business-category taxonomy` | 1 | ✅ 2026-07-07 — same entry |
> | 5 | `### ⚠️ 2026-06-21 — verified against live cloud` | 1 (`get_public_profile_verification`, listed as "Deferred") | ✅ 2026-06-23 — `## APPLIED TO CLOUD › ### 2026-06-23`, "Phase 10" |
> | 6 | `#### Phase 11 — RBAC activation + company team` | 6 | ✅ 2026-06-23 — same entry. **Non-migration residue → § OUTSTANDING item 3** |
> | 7 | `#### Phase 12 — Path B (join existing company)` | 3 | ✅ 2026-06-23 — same entry. States its own "no non-migration cloud steps" |
> | 8 | `### Phase 1 — Held Two-Sided Deal Change` | 5 | ✅ 2026-06-20 — the 25-migration push (`### 2026-06-20 — combined batch`) |
> | 9 | `### Phase 2 — Announcements & Gate Cleanup` | 2 | ✅ 2026-06-20 — same push |
> | 10 | `### Phase 3c — Card Note (held)` | 3 | ✅ 2026-06-20 — same push |
> | 11 | `### Phase 3d — Margin per product` | 3 | ✅ 2026-06-20 — same push |
> | 12 | `### Phase 3f — Batches end-to-end` | 2 | ✅ 2026-06-20 — same push |
> | 13 | `### 2026-07-06 — Phase 13 Settings + Lifecycle Emails` | 3 | ✅ 2026-07-07 — `## APPLIED TO CLOUD › ### 2026-07-07`. **Non-migration residue → § OUTSTANDING items 1 and 2** |
>
> **Every filename in rows 8-12 appears in "The 25 that actually push" list and in the 2026-06-20
> APPLIED entry** — checked file by file, not inferred from the batch label.
>
> **⚠️ Two subsections owed non-migration work that survives their migrations** (rows 6 and 13).
> That debt is a different class, it does not push, and filing it under an APPLIED heading is how it
> would have been lost. It now lives under **`## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`** near
> the top of this file, verbatim, with a pointer left at each origin.
>
> **Do not read "APPLIED" here as "finished".** Read it as "every migration is on cloud".

### 2026-07-24 (Muskan) — Discover person↔person social graph (Lane B, PG-1..7) — ✅ APPLIED 2026-08-16 (Release 2)

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

| 14 | `20260816210000_person_graph_rpc_anon_revoke.sql` | **Follow-up fix, authored during the Release 2 push.** Explicit `REVOKE EXECUTE ... FROM anon` on the 5 person-graph RPCs. The originals only did `REVOKE ALL FROM public`, which does NOT strip `anon` — on Supabase `anon` gets EXECUTE via ALTER DEFAULT PRIVILEGES, so all 5 were callable unauthenticated (database linter 0028). No data was exposed (bodies gate on `auth.uid()` + `is_caller_verified()`; probed on prod as `anon` → 0 rows, `accept_person_connection` raised before any write), but this restores the standard `20260814120000` set. Grants only — no body touched. |

- **Status:** ✅ **LIVE ON PRODUCTION 2026-08-16** (Release 2). All 13 applied via MCP `apply_migration` in filename order, then `schema_migrations.version` repaired to the local filenames (13 rows, no duplicates, no leftover call-time stamps) — same protocol as Release 1. Row 14 applied + stamped immediately after.
- **Pre-flight (out-of-order apply).** These 13 are timestamped EARLIER than migrations already live (the Phase-12 wave `202607241200*` and the tier ladder), so each was checked for the stale-redeclare class before applying: (a) prod state queried directly — `person_connection`, `receiver_person_id`, all 5 functions and all 3 publication rows confirmed ABSENT, so nothing to overwrite; (b) the 3 shared-table policies (`inbox_select`, `inbox_update`, `person_select`) diffed predicate-by-predicate against their LIVE text — all are strict supersets, no live predicate dropped; (c) `list_discoverable_companies` verified byte-identical to live (migration E already carried the gate) — a true no-op, and `CREATE OR REPLACE` was proven locally NOT to reset grants, so E's `anon` revoke survived (re-verified on prod after apply); (d) confirmed none of the 13 reference anything the later migrations dropped.
- **Verified after apply:** table/column/index/constraints/type-row all present, `list_my_person_connections` carries `thread_id`, 3 realtime publication rows, `chat_message_type` has the `intro` row `accept_person_connection` needs at runtime, and the security linter shows no anon-executable person-graph RPC (post row 14).
- Local gate before the push: fresh `supabase db reset` green, tsc clean, 375 unit, **31/31 SQL suites**, Discover e2e 4/4.
- **⚠️ Touches Ayush's base lane** (`pending_inbox_item` schema + inbox RLS, `chat_thread` index). Rebuilt inbox RLS from the LIVE body per the create-or-replace lesson; sync-locked while editing. The `receiver_company_id`-nullable + polymorphic-target call is flagged for his review in `docs/team/sync/muskan.md`.
- **Migration before code** — the Discover person-connect actions/reads (PG-8+) call `accept_person_connection` + read `person_connection`; shipping the app without these 5 breaks person connect on cloud. Push the whole set together, in timestamp order.
- **Realtime (row 13)** — live change-capture for the connection lifecycle; verified live in-browser (instant send + accept across two sessions). Publication membership only, no schema/RLS change. Two of the three tables it publishes (`pending_inbox_item`, `relationship`) are Ayush's — flagged for him in the sync file. On cloud, Realtime picks up the new publication tables automatically at apply time.

### 2026-07-07 (Muskan) — Allocate/Sell schema (DEV-76) — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|---------------|
| 1 | `20260707090000_allocate_schema.sql` | 3 lookup tables + 6 columns + 4 seller-gated `SECURITY DEFINER` RPCs backing the Allocate page (Orders & Offers + Batches allocator). Additive only — no existing catalogue/deal schema altered, only referenced (`deal_card`, `deal_line_item`, `product_batch`). |

- **Status:** local-first; applied via `supabase db reset` (GREEN) + `database.types.ts` regenerated. Gate green (tsc + eslint + 21/21 unit) + browser + DB-probe verified (session 53, 2026-07-07). ~~**Not pushed to cloud.**~~ **⚠️ STALE — corrected at T08, 2026-08-23.** Pushed 2026-07-07 — see this subsection's own heading and `## APPLIED TO CLOUD › ### 2026-07-07`.
- **Migration before code** — Allocate's server actions call the 4 RPCs directly; shipping the app without this migration 404s every Allocate read/write.
- **⚠️ Known residual after push:** [DEV-159](https://linear.app/hellosello/issue/DEV-159) (High) — a buyer can forge allocation state via a direct table write (symmetric base RLS gap, same family as DEV-88). Non-blocking for a no-real-users demo; fix is Ayush's base-RLS lane.
- **Push:** sorts last in the current pending set (`20260707090000` — after Phase 13's `20260706090xxx` and Phase 7's `20260706120000`); a single sequential `supabase db push` handles it with everything else, in timestamp order.

### 2026-07-06 (Muskan) — Phase 7 Present fidelity + card-front batch schema — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|--------------|
| 1 | `20260706120000_product_terpene_percent.sql` | **F-02.** `alter table public.product add column if not exists terpene_percent numeric;` — one headline total-terpenes value, editable inline on the card. Additive, nullable, **no backfill** (existing rows read NULL and fall back to the derived batch-terpene sum). The ONLY schema change of the whole fidelity pass. |

- **Status:** local-first; applied via `supabase db reset` (GREEN) + `database.types.ts` regenerated from local. ~~**Not pushed to cloud.**~~ **⚠️ STALE — corrected at T08, 2026-08-23.** Pushed 2026-07-07.
- ~~**Sibling Phase-7 migrations also still local-only** (from 07-03/04/05, appear to predate this ledger's PENDING list): `20260705120000_product_location.sql`, `20260705120100_product_media.sql`, `20260705120200_shop_media_allow_pdf.sql`. Push the whole Phase-7 set together, in timestamp order, when the human deploys.~~
  **⚠️ STALE — corrected at T08, 2026-08-23.** **All three siblings are LIVE** — `## APPLIED TO CLOUD › ### 2026-07-07` lists
  `product_location`, `product_media`, `shop_media_allow_pdf` and `product_terpene_percent` by name.
  The whole Phase-7 set did go together, in timestamp order, exactly as this bullet asked.
- **Migration before code** — `shop.ts` reads `product.terpene_percent`; shipping the app without this column errors the Present read on cloud.
- **Push:** a clean single `supabase db push` from a LINKED machine, in timestamp order (`20260706120000` sorts last). Coordinate with Ayush if his lane added migrations in the meantime.

### 2026-07-05 (Muskan) — DEV-99 #3 business-category taxonomy — ✅ APPLIED 2026-07-07 (see APPLIED TO CLOUD)

| # | Migration | What it does |
|---|-----------|--------------|
| 1 | `20260704090000_business_category_taxonomy.sql` | NEW `business_category` lookup (6 rows incl. `custom`) + `company_business_category` junction (nullable `custom_label`; CHECK = label present **iff** `code='custom'`; RLS `business_category_read` + `cbc_all` scoped to `current_company_id()`). Grows `company_type` (Activity) 4→8 to Marcel's list; **remaps** legacy `cultivator`→`eu_gmp_cultivator` then drops it; **backfills** the `pharma` category onto every company that has an activity. `CREATE OR REPLACE onboard_company` — **drops the old 3-arg**, adds a 5-arg (`+p_category_codes text[]`, `+p_custom_category text`) with a parallel category loop. Additive + idempotent. |

- ~~**Status:** local-first; **rollback-verified** (`BEGIN…ROLLBACK`, non-destructive) — **not yet `migration up`'d even to local** (89 files on disk vs 88 rows in local `schema_migrations`; this is the 1 gap). Next session: `migration up` + update `seed.sql` to the new codes + `supabase db reset` to prove a clean replay + regen `database.types.ts`.~~
  **⚠️ STALE — corrected at T08, 2026-08-23.** A snapshot of 2026-07-05, superseded twice over: the migration is applied locally
  **and** pushed to cloud on 2026-07-07, and every follow-up listed here was done. Local now
  reads 152 files ↔ 152 `schema_migrations` rows, no gaps.
- **Migration before code** — the OnboardingStepper reads `business_category` and calls the 5-arg `onboard_company`; shipping app code without this migration errors onboarding.
- **⚠️ Drops the old 3-arg `onboard_company`** (the current cloud body). The `DROP FUNCTION public.onboard_company(text,text,text[])` + the new 5-arg must land as **one unit** — no window where only the old signature exists beside new app code.
- **Push:** a clean single `supabase db push` from a LINKED machine, in timestamp order (`20260704090000` sorts last, after any earlier pending batch). Coordinate with Ayush if his lane added migrations in the meantime.

### ⚠️ 2026-06-21 (Muskan) — verified against live cloud: the batch below is DONE; only Phase 10 remains

A live `list_migrations` on 2026-06-21 shows cloud's tip = `20260620120000_canonical_display_name`.
**Everything in the "READ FIRST" reconciliation and the Phase 1–3f / sec / verif / discover / city /
oauth / canonical_display_name lists below is now APPLIED to cloud** (reconciled + pushed 2026-06-20).
Those sections are kept for history only — they are no longer pending.

~~**Migrations still local-ahead-of-cloud:**~~ **⚠️ STALE — corrected at T08, 2026-08-23.** None. The one row below is applied.

| Migration file | What it does | Push when / how |
|----------------|--------------|-----------------|
| `20260620160000_get_public_profile_verification.sql` | Adds `company_verification_status` (14th column) to the `get_public_profile` RPC → the verified pill on the public `/c/[handle]` card (Phase 10 / ACCT-01). | ~~**Deferred** — Phase 10 isn't in prod. Push when it ships: a clean single `supabase db push` (cloud now matches local through `canonical_display_name`, no reconcile needed).~~ **⚠️ STALE — corrected at T08, 2026-08-23.** **✅ SHIPPED 2026-06-23** — `## APPLIED TO CLOUD › ### 2026-06-23` lists it as "Phase 10: `get_public_profile_verification`". Do not push it again. **Migration before code** — if Phase 10 app code goes live without it, `/c/[handle]` errors (app reads a column the old RPC won't return). |

#### Phase 11 — RBAC activation + company team (Muskan, 2026-06-21) — ~~NOT on cloud~~ ✅ APPLIED 2026-06-23

> **⚠️ STALE — corrected at T08, 2026-08-23.** All 6 migrations are LIVE — `## APPLIED TO CLOUD › ### 2026-06-23`. The heading
> read *"local-first — NOT on cloud"* until then. **Its non-migration steps are a separate
> matter and one is still owed** → `## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`, item 3.

~~6 migrations applied LOCAL only (clean `db reset` green; cloud tip is still `canonical_display_name`, so these push cleanly in timestamp order — **no reconcile needed**):~~
**⚠️ STALE — corrected at T08, 2026-08-23.** They pushed cleanly on 2026-06-23, exactly as predicted. Table kept as the record:

| # | Migration file | What it does |
|---|----------------|--------------|
| 1 | `20260621100000_phase11_rbac_activation.sql` | `has_permission()` + `seed_company_superadmin()` (SECURITY DEFINER, `search_path=''`); **§9 lockdown** — `person_group`/`permission_matrix_entry` → SELECT-only; gated permission codes (`team.manage`, `company.edit_profile`) + `team.*` audit codes |
| 2 | `20260621110000_phase11_onboard_superadmin.sql` | `onboard_company` `CREATE OR REPLACE` — one additive `PERFORM seed_company_superadmin(...)` (founder→Superadmin); stays SECURITY INVOKER, `already_has_company` guard intact |
| 3 | `20260621120000_phase11_backfill_superadmin.sql` | idempotent backfill of existing companies' founders → Superadmin |
| 4 | `20260621130000_phase11_team_rpcs.sql` | `invite_member` / `change_member_role` / `remove_member` / `list_company_members` (SECURITY DEFINER, tenant-scoped, `has_permission`-gated, D-15 lockout) |
| 5 | `20260621140000_phase11_invite_accept_link.sql` | `handle_new_user` `CREATE OR REPLACE` — links invited person to company+role from invite metadata; additive + metadata-gated (password/Google/Outlook signups unchanged) |
| 6 | `20260621150000_phase11_lockout_race_fix.sql` | `pg_advisory_xact_lock` on the D-15 lockout (CR-01 race fix) + `record_invite_sent` audit RPC (WR-01/02) |

**🔴 A NON-MIGRATION BLOCK LIVED HERE, IN THE IDENTICAL SHAPE TO PHASE 13'S. MOVED AND RULED
(T08, 2026-08-23)** → **`## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`**, item **3**, near the top
of this file, where both bullets are reproduced verbatim. The ruling there:
`SUPABASE_SECRET_KEY` is **discharged** (named by the `### 2026-06-23` APPLIED entry);
`invite.html` is **not confirmed** — that entry says *"3 email templates"* without naming which —
so it is **kept as owed** with a one-page dashboard check to close it. Do not restate them here.

**Cautions:**
- Migrations 2 + 5 are `CREATE OR REPLACE` of shared functions (`onboard_company`, `handle_new_user`). Both compose cleanly on top of cloud's current `handle_new_user` (canonical `display_name` @ `20260620120000`) — the invite-linking + founder-seed are additive. Confirm the final body before push.
- `supabase/seed/seed.sql` (founder-Superadmin backfill block + Carla demo member) is **LOCAL demo data only — never pushed** (cloud is seeded separately).
- **Migration before code** — when Phase 11 app code (`/team`, the account gate, `admin.ts`) goes to prod, these 6 must be on cloud first or those paths error.

#### Phase 12 — Path B (join existing company) (Muskan, 2026-06-22) — ~~NOT on cloud~~ ✅ APPLIED 2026-06-23

> **⚠️ STALE — corrected at T08, 2026-08-23.** All 3 migrations are LIVE — `## APPLIED TO CLOUD › ### 2026-06-23`. The heading
> read *"local-first — NOT on cloud"* until then. Nothing non-migration is owed: this
> subsection states its own *"No non-migration cloud steps"* below.

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

**🔴 TWO NON-MIGRATION BLOCKS LIVED HERE AND ARE STILL OWED. MOVED, NOT DROPPED (T08, 2026-08-23)**
→ **`## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT`**, items **1** and **2**, near the top of this
file. Both are reproduced there verbatim:
- the three deploy steps — `supabase functions deploy send-lifecycle-email`, `… erase-expired-accounts`, `supabase secrets set RESEND_API_KEY=…`;
- the **⚠️ Cloud UAT required** block (erasure auth-scrub + session-revoke), which is **unique in
  this file** — the deploy steps are also echoed in `## APPLIED TO CLOUD › ### 2026-07-07`, but this
  UAT block is recorded nowhere else.

They were moved because this subsection's migrations are **applied** and the two classes of debt do
not belong under one heading. Do not restate them here — one owner per fact.

**Ordering dependency:**
- ~~Push **AFTER** the still-pending Phase 10 + 6×Phase 11 + 3×Phase 12 batches (CLAUDE.md #0).~~
  **⚠️ STALE — corrected at T08, 2026-08-23.** **Those three batches went live on 2026-06-23** and this one on 2026-07-07, so
  the dependency was satisfied in the right order and nothing here is outstanding. The reasoning
  is kept because it is the correct rule for the next batch of this shape: SET-02's RPCs reference `person_group` / `has_permission` / `current_superadmin_group_id` (Phase 11) and the lifecycle emails fire off the Phase 11/12 RPCs — those must be live first. The three `20260706090xxx` stamps sort last, so a single sequential `supabase db push` runs them in order after any earlier pending batch (no reconcile needed if cloud history is contiguous).
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

**⚠️ STILL PENDING (non-migration — the erasure/email async half of Phase 13).**
**The full, current statement of this debt is `## ⚠️ OUTSTANDING — NON-MIGRATION DEPLOY DEBT` item 1
(T08, 2026-08-23) — go there; it also carries a cloud-UAT block this summary never had.** Kept here
because it is part of the 2026-07-07 push record:
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
