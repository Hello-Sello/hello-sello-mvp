-- ============================================================================
-- Migration — Allocate schema (Sell surface, DEV-76 / DEV-157 / DEV-151)
-- ----------------------------------------------------------------------------
-- Additive-only. No ALTER/DROP of anything pre-existing, no touch to
-- deal_card_status / deal_type / RLS policies / deal_card.hs_deal_number.
--
-- Adds the minimum real schema the Batches allocator + 7-state order-status
-- vocabulary need on top of deal_card / deal_line_item / product_batch:
--   1. Three lookups: order_channel, deal_card_ticket_status,
--      deal_line_item_allocation_status.
--   2. Additive columns: deal_card.ordered_via/ticket_status;
--      deal_line_item.allocation_status/allocation_locked_at/
--      substituted_from_product_id; product_batch.quantity_grams.
--      Batch splitting reuses deal_line_item.metadata->'batchSplits'
--      (no new column/table).
--   3. Four SECURITY DEFINER RPCs, all seller-only. These gate the APP's own
--      write path (the Allocate UI only ever calls the RPCs, never a direct
--      table write). ⚠️ KNOWN RESIDUAL (T-260707-01): the RPC guard is NOT a
--      complete control. deal_line_item.line_all / deal_card.card_all are
--      symmetric `FOR ALL` RLS policies (either relationship side may write
--      the row), so a malicious BUYER could bypass the RPCs and flip
--      allocation state with a raw PostgREST UPDATE. A column-level REVOKE
--      does NOT close this (Supabase grants `authenticated` table-level
--      UPDATE, which a column REVOKE cannot override); the real fix is
--      base-grant/RLS surgery on Ayush's deal-domain tables — SAME root cause
--      and lane as the tracked-Urgent DEV-88 hole, to be fixed together with
--      him, not unilaterally here. For the seed-data demo this is not
--      demo-blocking; it is documented + flagged, not silently shipped.
--   4. Additive audit-lookup rows consumed by Plan 3's `writeAudit` calls
--      (JS-side, mirrors the confirmDeal/createDeal convention — never
--      written to from inside these RPCs).
--
-- Section 1 (lookups) copies the uppercase INSERT style of
-- 20260607090001_lookups_and_seeds.sql. Section 4 (audit rows) copies the
-- uppercase style of 20260611120000_audit_actions_deal_confirm.sql. Sections
-- 2 (columns) and 3 (RPCs) follow the lowercase plpgsql house style of
-- 20260618140000_deal_line_item_batch.sql (create_deal_draft /
-- confirm_deal_change) — this project's two conventions live side by side by
-- author/era; each section here matches the specific predecessor it extends.
--
-- RLS note: the phase-1 "enable RLS on every table" loop
-- (20260607170000_rls_policies.sql) only covered tables that existed at that
-- time. Every new table since (see 20260704090000_business_category_taxonomy.sql)
-- explicitly enables RLS + adds its own policy — the three lookups below do
-- the same (plain `<name>_read` SELECT-for-authenticated, matching every
-- other lookup table in the app).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lookups
-- ----------------------------------------------------------------------------

CREATE TABLE order_channel (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO order_channel (code, description, sort_order) VALUES
  ('hello_sello', 'Hello Sello', 1),
  ('email',       'E-mail',      2),
  ('fax',         'Fax',         3);

CREATE TABLE deal_card_ticket_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_card_ticket_status (code, description, sort_order, is_terminal) VALUES
  ('open',   'Ticket created', 1, FALSE),
  ('closed', 'Ticket closed',  2, TRUE);

CREATE TABLE deal_line_item_allocation_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO deal_line_item_allocation_status (code, description, sort_order) VALUES
  ('pending', 'Awaiting a Decline/Substitute/Supply decision', 1),
  ('supply',  'Seller will supply from batch stock',           2),
  ('decline', 'Seller declined this line',                     3);

ALTER TABLE order_channel                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_card_ticket_status               ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_line_item_allocation_status      ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_channel_read ON order_channel
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_card_ticket_status_read ON deal_card_ticket_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_line_item_allocation_status_read ON deal_line_item_allocation_status
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 2. Additive columns
-- ----------------------------------------------------------------------------

-- deal_card.ordered_via — every deal_card created through the app today is
-- native Hello Sello traffic (no email/fax intake pipeline yet), so the
-- default covers all existing/future organic rows; only seeded demo rows use
-- 'email'/'fax'.
alter table public.deal_card
  add column if not exists ordered_via varchar(20) not null default 'hello_sello'
    references public.order_channel(code);

-- deal_card.ticket_status — null means no ticket is open; independent of the
-- base deal_card.status lifecycle (a ticket can be raised on a confirmed or
-- done deal without changing its underlying status).
alter table public.deal_card
  add column if not exists ticket_status varchar(20) null
    references public.deal_card_ticket_status(code);

alter table public.deal_line_item
  add column if not exists allocation_status varchar(20) not null default 'pending'
    references public.deal_line_item_allocation_status(code);

-- allocation_locked_at — set once an allocation decision has been sent via
-- CONFIRM & SEND; null means still editable.
alter table public.deal_line_item
  add column if not exists allocation_locked_at timestamptz null;

-- substituted_from_product_id — the ORIGINAL product, when a line's
-- product_id has been swapped by a substitution. product_id itself holds the
-- replacement.
alter table public.deal_line_item
  add column if not exists substituted_from_product_id uuid null
    references public.product(id);

-- product_batch.quantity_grams — the lot's total physical stock in grams.
-- "Allocated so far" is never stored — it is always derived live by summing
-- deal_line_item.quantity (or, for split lines, the per-batch grams inside
-- deal_line_item.metadata->'batchSplits') across lines with
-- allocation_status = 'supply' pointing at that batch. Mirrors the existing
-- "derive, don't store" convention already used for docTerm/sellerCompanyId
-- in src/modules/deals/lib/derive.ts.
--
-- Batch splitting across multiple lots for one demand row is NOT a new
-- column or table: it reuses the existing deal_line_item.metadata jsonb
-- column, storing an optional `batchSplits` key shaped as an array of
-- {batchId, grams} objects. When absent, the line is fulfilled from the
-- single batch_id/batch_number pair as today.
alter table public.product_batch
  add column if not exists quantity_grams numeric(12, 2) not null default 0;

create index if not exists idx_deal_line_item_allocation_status
  on public.deal_line_item(allocation_status);
create index if not exists idx_deal_line_item_substituted_from
  on public.deal_line_item(substituted_from_product_id);

-- ----------------------------------------------------------------------------
-- 2b. Direct-write hardening — DEFERRED to a cross-lane fix (see header §3)
-- ----------------------------------------------------------------------------
-- A column-level `REVOKE UPDATE (...) ON deal_line_item FROM authenticated`
-- was evaluated here and does NOT work: Supabase grants `authenticated`
-- TABLE-level UPDATE, and a column-level REVOKE cannot override a table-level
-- grant (verified — the buyer's direct update still succeeded). Making it
-- actually deny the write requires table-level REVOKE + re-GRANT of every
-- OTHER column (fragile — silently breaks Ayush's writes when he adds a
-- column), a trigger on his hot deal_line_item write path, or fixing the
-- symmetric base RLS itself. All three are base-grant/RLS surgery on the
-- shared deal-domain tables (Ayush's lane) and belong with the DEV-88
-- coordination, so NOTHING is applied here — the residual is documented in
-- §3, flagged to Ayush in docs/team/sync/muskan.md, and tracked for a joint
-- fix. The RPCs remain the app's own seller-gate.

-- ----------------------------------------------------------------------------
-- 3. Seller-only RPCs (T-260707-01/02/03 mitigations)
-- ----------------------------------------------------------------------------

-- line_seller_company_id — internal helper, NOT part of the public interface
-- contract of this plan. Ports sellerCompanyId() from
-- src/modules/deals/lib/derive.ts into SQL exactly once so the four RPCs
-- below don't each repeat the deal_card/relationship join; every RPC still
-- calls current_company_id() directly at its own guard site (kept local and
-- readable, one line per RPC) rather than trusting a value computed
-- elsewhere.
create or replace function public.line_seller_company_id(p_line_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when dc.deal_type = 'offer' then dc.initiating_company_id
           when dc.initiating_company_id = r.company_a_id then r.company_b_id
           else r.company_a_id
         end
  from public.deal_line_item dli
  join public.deal_card dc on dc.id = dli.deal_card_id
  join public.relationship r on r.id = dc.relationship_id
  where dli.id = p_line_item_id;
$$;

grant execute on function public.line_seller_company_id(uuid) to authenticated;

-- set_line_allocation — the seller's Decline/Substitute/Supply decision on a
-- line, plus optional batch/batch-split assignment (T-260707-03: every
-- batchId referenced, single or split, is verified to belong to the caller's
-- own company AND the line's current product before being written).
create or replace function public.set_line_allocation(
  p_line_item_id uuid,
  p_decision     text,
  p_batch_id     uuid default null,
  p_batch_splits jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_product_id uuid;
  v_batch_no   varchar(60);
  v_split      jsonb;
begin
  if v_uid is null then
    raise exception 'set_line_allocation: not authenticated';
  end if;
  if public.current_company_id() is distinct from public.line_seller_company_id(p_line_item_id) then
    raise exception 'set_line_allocation: caller is not the seller on this line';
  end if;
  if p_decision not in ('pending', 'supply', 'decline') then
    raise exception 'set_line_allocation: decision must be pending, supply, or decline';
  end if;

  select product_id into v_product_id from public.deal_line_item where id = p_line_item_id;
  if not found then
    raise exception 'set_line_allocation: line not found';
  end if;

  if p_batch_id is not null then
    -- Existence-based ownership check (not `v_batch_no is null`, which would
    -- also reject a validly-owned batch that happened to have a null number).
    if not exists (
      select 1 from public.product_batch
      where id = p_batch_id
        and company_id = public.current_company_id()
        and product_id = v_product_id
    ) then
      raise exception 'set_line_allocation: batch does not belong to the caller or this line''s product';
    end if;
    select batch_number into v_batch_no from public.product_batch where id = p_batch_id;
    update public.deal_line_item
      set batch_id = p_batch_id, batch_number = v_batch_no
    where id = p_line_item_id;
  end if;

  if p_batch_splits is not null then
    if jsonb_array_length(p_batch_splits) = 0 then
      update public.deal_line_item
        set metadata = metadata - 'batchSplits'
      where id = p_line_item_id;
    else
      for v_split in select * from jsonb_array_elements(p_batch_splits)
      loop
        if not exists (
          select 1 from public.product_batch
          where id = nullif(v_split->>'batchId', '')::uuid
            and company_id = public.current_company_id()
            and product_id = v_product_id
        ) then
          raise exception 'set_line_allocation: split batch % does not belong to the caller or this line''s product',
            v_split->>'batchId';
        end if;
        -- The RPC, not the client, is the trust boundary: reject a crafted
        -- negative split (would produce nonsensical negative allocated totals
        -- in computeBatchStock). The client already clamps at >= 0.
        if coalesce((v_split->>'grams')::numeric, 0) < 0 then
          raise exception 'set_line_allocation: split grams must be non-negative';
        end if;
      end loop;
      update public.deal_line_item
        set metadata = jsonb_set(metadata, '{batchSplits}', p_batch_splits, true)
      where id = p_line_item_id;
    end if;
  end if;

  update public.deal_line_item
    set allocation_status = p_decision
  where id = p_line_item_id;
end;
$$;

grant execute on function public.set_line_allocation(uuid, text, uuid, jsonb) to authenticated;

-- substitute_line_product — swap the line onto a different product from the
-- seller's OWN catalogue (T-260707-02: the replacement is verified to belong
-- to the caller's own company before the swap). Resets to the new product's
-- FIFO-oldest live batch and clears any batchSplits.
create or replace function public.substitute_line_product(
  p_line_item_id   uuid,
  p_new_product_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := auth.uid();
  v_current_product  uuid;
  v_substituted_from uuid;
  v_new_batch_id     uuid;
  v_new_batch_no     varchar(60);
begin
  if v_uid is null then
    raise exception 'substitute_line_product: not authenticated';
  end if;
  if public.current_company_id() is distinct from public.line_seller_company_id(p_line_item_id) then
    raise exception 'substitute_line_product: caller is not the seller on this line';
  end if;

  if not exists (
    select 1 from public.product
    where id = p_new_product_id
      and company_id = public.current_company_id()
      and deleted_at is null
  ) then
    raise exception 'substitute_line_product: replacement product does not belong to the caller''s catalogue';
  end if;

  select product_id, substituted_from_product_id
    into v_current_product, v_substituted_from
  from public.deal_line_item
  where id = p_line_item_id;
  if not found then
    raise exception 'substitute_line_product: line not found';
  end if;
  if v_substituted_from is not null then
    raise exception 'substitute_line_product: line is already substituted — cancel the existing substitution first';
  end if;

  select id, batch_number into v_new_batch_id, v_new_batch_no
  from public.product_batch
  where product_id = p_new_product_id
    and company_id = public.current_company_id()
    and deleted_at is null
  order by ready_for_sale_date asc nulls last, created_at asc
  limit 1;

  update public.deal_line_item
    set substituted_from_product_id = v_current_product,
        product_id                  = p_new_product_id,
        allocation_status           = 'supply',
        batch_id                    = v_new_batch_id,
        batch_number                = v_new_batch_no,
        metadata                    = metadata - 'batchSplits'
  where id = p_line_item_id;
end;
$$;

grant execute on function public.substitute_line_product(uuid, uuid) to authenticated;

-- cancel_line_substitution — revert a substitution back to the original
-- product, resetting to ITS FIFO-oldest live batch and clearing batchSplits.
create or replace function public.cancel_line_substitution(
  p_line_item_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := auth.uid();
  v_reverted_product uuid;
  v_new_batch_id     uuid;
  v_new_batch_no     varchar(60);
begin
  if v_uid is null then
    raise exception 'cancel_line_substitution: not authenticated';
  end if;
  if public.current_company_id() is distinct from public.line_seller_company_id(p_line_item_id) then
    raise exception 'cancel_line_substitution: caller is not the seller on this line';
  end if;

  select substituted_from_product_id into v_reverted_product
  from public.deal_line_item
  where id = p_line_item_id;
  if not found then
    raise exception 'cancel_line_substitution: line not found';
  end if;
  if v_reverted_product is null then
    raise exception 'cancel_line_substitution: line has no active substitution to cancel';
  end if;

  select id, batch_number into v_new_batch_id, v_new_batch_no
  from public.product_batch
  where product_id = v_reverted_product
    and company_id = public.current_company_id()
    and deleted_at is null
  order by ready_for_sale_date asc nulls last, created_at asc
  limit 1;

  update public.deal_line_item
    set product_id                  = v_reverted_product,
        substituted_from_product_id = null,
        allocation_status           = 'pending',
        batch_id                    = v_new_batch_id,
        batch_number                = v_new_batch_no,
        metadata                    = metadata - 'batchSplits'
  where id = p_line_item_id;
end;
$$;

grant execute on function public.cancel_line_substitution(uuid) to authenticated;

-- confirm_line_allocations — partial CONFIRM & SEND: locks every id that (a)
-- passes the seller-authorization rule, (b) is DECIDED — either 'supply' or
-- 'decline' (a decline is a decision the seller sends to the buyer, so it is
-- locked/sent too, matching SELL.md's "locks the currently-decided rows
-- (supply/decline)"), and (c) is not already locked; silently skips only
-- still-'pending' or foreign rows. Returns the count actually locked. The JS
-- caller (batchActions.confirmAllocations) audits each locked line by its own
-- final status, so a locked decline is audited as a decline, not a confirm.
create or replace function public.confirm_line_allocations(
  p_line_item_ids uuid[]
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'confirm_line_allocations: not authenticated';
  end if;

  with eligible as (
    select dli.id
    from public.deal_line_item dli
    where dli.id = any(p_line_item_ids)
      and dli.allocation_status <> 'pending'
      and dli.allocation_locked_at is null
      and public.current_company_id() = public.line_seller_company_id(dli.id)
  )
  update public.deal_line_item
    set allocation_locked_at = now()
  where id in (select id from eligible);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.confirm_line_allocations(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Audit lookups (consumed by Plan 3's writeAudit calls, JS-side — never
--    written to from inside the RPCs above, matching the existing
--    confirmDeal/createDeal convention)
-- ----------------------------------------------------------------------------
INSERT INTO auditable_content_type (code, description, target_table) VALUES
  ('deal_line_item', 'A deal line item', 'deal_line_item')
ON CONFLICT (code) DO NOTHING;

INSERT INTO audit_action_type (code, description, category) VALUES
  ('deal_line_item.allocated',              'A deal line was set to Supply',                    'lifecycle'),
  ('deal_line_item.declined',               'A deal line was declined',                         'lifecycle'),
  ('deal_line_item.substituted',            'A deal line''s product was substituted',           'lifecycle'),
  ('deal_line_item.substitution_cancelled', 'A deal line''s substitution was cancelled',         'lifecycle'),
  ('deal_line_item.allocation_confirmed',   'A deal line''s allocation was confirmed and sent',  'lifecycle')
ON CONFLICT (code) DO NOTHING;
