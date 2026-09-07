-- ============================================================================
-- request_product_pricing_c2c — a pricing ask to a CONNECTED company posts a
-- person-voiced message into the existing c2c thread instead of cutting a
-- pending_inbox_item ticket (T02, 0027-retire-connect-inbox, DEV-170).
-- ----------------------------------------------------------------------------
-- ADR 0009 D2, I-M3, I-M4, I-M12, I-M13, I-J6. PLAN-T02.md, `plan-checker`
-- round 1 REVISE folded in (B1/B2/B3, N1-N6).
--
-- SIGNATURE (not negotiable, I-M15): no author parameter, no thread-id
-- parameter, no free-text body parameter. `sender_person_id` comes from
-- `auth.uid()` inside the function and the thread is derived from the
-- caller's own company + the receiver — a `p_body`/`p_sender_person_id`
-- parameter on a SECURITY DEFINER RPC would be directly callable via
-- PostgREST by any `authenticated` session, re-opening the message-forgery
-- hole `msg_all`'s attribution gate (20260903090000) closed one day earlier.
--
-- `set search_path = ''`: every identifier below is schema-qualified
-- (`public.relationship`, `public.product`, `public.chat_message`,
-- `public.assert_relationship_writable`,
-- `public._resolve_or_create_c2c_thread`). Unqualified names still let the
-- function CREATE (Postgres doesn't resolve bodies at CREATE FUNCTION time)
-- but fail at first CALL with "relation does not exist" — do not "clean up"
-- the `public.` prefixes. Built-ins (`least`, `greatest`, `clock_timestamp`,
-- `trim`, `left`, `length`, `jsonb_build_object`) resolve via the always-
-- implicit `pg_catalog` search entry and need no qualification.
--
-- STEP 4 vs STEP 5 — existence is not liveness. The relationship is resolved
-- by EXISTENCE only (no `status = 'active'` filter) so that a suspended pair
-- reaches `assert_relationship_writable` (step 5) and is refused THERE, with
-- its own distinct raise text — proving liveness is a real, independently
-- testable gate rather than dead code shadowed by a status filter on the
-- lookup itself. This is a genuinely different predicate from
-- `is_connected_to_company` (which DOES filter `status = 'active'`), not a
-- reimplementation of it: this function only proves a relationship ROW
-- exists; `assert_relationship_writable` alone decides whether it is open
-- for new writes. An ordinary UI caller with a suspended relationship never
-- reaches this RPC at all — `is_connected_to_company` is false for them, so
-- `requestProductPricing` (TS) routes to `createPairInboxItem` instead,
-- whose `inbox_insert` gate already calls the same liveness function. This
-- RPC's own step 5 is defense-in-depth for a direct PostgREST caller.
--
-- DUP-GUARD SCOPE (I-M13, round 1's B3) — scoped to (thread, sender's
-- COMPANY, product), not sender PERSON. `person.company_id` carries no
-- unique constraint (two colleagues at the same company are both real), so a
-- person-scoped guard under-fires: two colleagues asking about the same
-- product would each get a message through. I-M13 says "the same pricing
-- ask", not "by the same person". Deliberately no expiry (unlike
-- `createPairInboxItem`'s guard, which only blocks while `status =
-- 'pending'`): a chat message has no resolved/pending state and stays
-- visible in the thread indefinitely, so re-asking is genuinely redundant.
-- The caller still gets `true`/`false` (posted vs deduped) rather than an
-- error on a dedup — matching, not diverging from,
-- `createPairInboxItem:70-72`'s own silent-success-on-duplicate pattern.
--
-- THREAD HEALING (I-J6) — a relationship minted before ADR-0007 may have no
-- c2c thread at all. `_resolve_or_create_c2c_thread` (schema-qualified,
-- exact call shape from `accept_connection_request`, 20260826100000:206-207)
-- heals it, and when it does, this function posts the SAME
-- `connection_established` system intro `accept_connection_request` posts on
-- a fresh thread, so no c2c thread in the product ever opens with a pricing
-- request and no intro line.
--
-- ORDERING (the `clock_timestamp()` trap `test-writer` caught, not
-- `plan-checker`; sharpened in review round 1): two independent bare
-- `clock_timestamp()` calls are NOT guaranteed to order correctly within one
-- transaction on a coarse/virtualized clock — they can tie. This function
-- does not rely on ordering by chance: a single `v_now := clock_timestamp()`
-- is captured once, before the healing intro insert (step 8); that insert
-- uses `v_now` as `created_at`, and the pricing message insert (step 11)
-- uses `v_now + interval '1 millisecond'`. This is the EXACT technique
-- `accept_connection_request` uses for its own two same-transaction inserts
-- (20260826100000:222-229) — an explicit offset, not clock ordering alone.
-- Neither insert uses the `created_at` column DEFAULT (`NOW()`, frozen at
-- transaction start) — both messages would land on the identical frozen
-- timestamp regardless of program order if either did.
--
-- METADATA KEY — the literal `'product_id'` string below mirrors
-- `PRODUCT_ID_KEY`'s VALUE (`src/app/discover/pricingRequest.ts`), not an
-- import of it — SQL cannot import a TS constant. Keep the two in sync by
-- hand; `pricingRequest.ts` carries a matching comment.
-- ============================================================================

create function public.request_product_pricing_c2c(
  p_receiver_company_id uuid,
  p_product_id          uuid
) returns boolean   -- true = a new message was posted, false = deduped (I-M13)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid            uuid := auth.uid();
  v_sender_company uuid;
  v_rel            uuid;
  v_product_name   text;
  v_price_public   boolean;
  v_thread         uuid;
  v_created        boolean;
  v_body           text;
  -- ORDERING — single capture, offset on the second insert. See header note.
  v_now            timestamptz;
  -- Mirrors buildPricingRequestNote (pricingRequest.ts:25-28) — SQL cannot
  -- call a TS function, so the clamp constants are duplicated deliberately
  -- (the RPC must be safe standing alone, ADR §2 Rejected). product.name is
  -- VARCHAR(200) (20260607090004:19), always under this threshold today —
  -- the truncation branch is implemented anyway, for the same reason
  -- buildPricingRequestNote implements it.
  v_prefix   constant text := 'Pricing request for "';
  v_suffix   constant text := '".';
  v_name_max constant int  := 280 - length(v_prefix) - length(v_suffix);
begin
  -- Step 1
  if v_uid is null then
    raise exception 'request_product_pricing_c2c: not authenticated';
  end if;

  -- Step 2 (Path B invariant — same guard shape as confirm_detected_deal)
  select p.company_id into v_sender_company
  from public.person p
  where p.id = v_uid;
  if v_sender_company is null then
    raise exception 'request_product_pricing_c2c: caller has no company';
  end if;

  -- Step 3 (mirrors createPairInboxItem:54's existing check)
  if v_sender_company = p_receiver_company_id then
    raise exception 'request_product_pricing_c2c: cannot request pricing from your own company';
  end if;

  -- Step 4 — existence only, not status. See header note.
  select r.id into v_rel
  from public.relationship r
  where r.deleted_at is null
    and r.company_a_id = least(v_sender_company, p_receiver_company_id)
    and r.company_b_id = greatest(v_sender_company, p_receiver_company_id);
  if v_rel is null then
    raise exception 'request_product_pricing_c2c: relationship not found';
  end if;

  -- Step 5 — the real liveness gate (I-M4). Raises
  -- 'assert_relationship_writable: relationship is % — no new writes' for a
  -- suspended/ended pair, already mapped by requestActionError.ts.
  perform public.assert_relationship_writable(v_rel);

  -- Step 6 — resolve the product AND re-check the price-public rule.
  -- actions.ts already refuses a price-public ask through the normal UI
  -- flow; this is the RPC's own defense-in-depth copy for a direct caller.
  -- `product_visible_to_caller` (20260825110000:74-129) is the repo's single
  -- owner of "may this caller see this product" — it internally re-checks
  -- the visibility window, `is_caller_verified()`, the unfiled rule, and the
  -- seller company's `deleted_at`/`verification_status`/`deactivated_at`.
  -- Without this call, a connected caller holding a stale/withdrawn product
  -- id could get its CURRENT name posted into the chat thread even when
  -- every other door in the app (get_discoverable_shop, product_all RLS)
  -- would refuse to show it (review round 1, security F1). Called, not
  -- reimplemented — auth.uid() still names the real caller from inside this
  -- SECURITY DEFINER body.
  select p.name, p.price_public into v_product_name, v_price_public
  from public.product p
  where p.id = p_product_id
    and p.company_id = p_receiver_company_id
    and p.deleted_at is null
    and public.product_visible_to_caller(p_product_id);
  if v_product_name is null then
    raise exception 'request_product_pricing_c2c: product not found for that company';
  end if;
  if v_price_public then
    raise exception 'request_product_pricing_c2c: price is already public for this product';
  end if;

  -- Step 7 — schema-qualified, exact call shape from accept_connection_request.
  select thread_id, created into v_thread, v_created
  from public._resolve_or_create_c2c_thread(v_rel);

  -- Step 8 — heal a freshly-created thread with the same system intro
  -- accept_connection_request posts (I-J6). v_now (captured once, below),
  -- not clock_timestamp() called bare and not the column default — see
  -- header ORDERING note.
  v_now := clock_timestamp();
  if v_created then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
    select v_thread, 'system', null, 'connection_established',
           ca.name || ' and ' || cb.name || ' are now connected.', v_now
    from public.company ca, public.company cb
    where ca.id = v_sender_company and cb.id = p_receiver_company_id;
  end if;

  -- Step 9 — dup-guard scoped to (thread, sender's COMPANY, product). See
  -- header DUP-GUARD SCOPE note.
  if exists (
    select 1 from public.chat_message cm
    join public.person p on p.id = cm.sender_person_id
    where cm.thread_id = v_thread
      and p.company_id = v_sender_company
      and cm.type = 'message'
      and cm.metadata->>'product_id' = p_product_id::text
      and cm.deleted_at is null
  ) then
    return false;
  end if;

  -- Step 10 — build the body, mirroring buildPricingRequestNote exactly.
  v_body := v_prefix ||
    (case when length(trim(v_product_name)) > v_name_max
          then left(trim(v_product_name), v_name_max - 1) || '…'
          else trim(v_product_name)
     end) || v_suffix;

  -- Step 11 — hardcoded sender/sender_person_id re-imports exactly what
  -- msg_all's WITH CHECK (20260903090000:115-116) would have required had
  -- this gone through RLS (I-J6). `v_now + interval '1 millisecond'`, not a
  -- second bare clock_timestamp() call and not the column default — see
  -- header ORDERING note; the explicit offset is what guarantees this row
  -- sorts after step 8's, not mere program order.
  insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata, created_at)
  values (v_thread, 'person', v_uid, 'message', v_body,
          jsonb_build_object('product_id', p_product_id), v_now + interval '1 millisecond');

  -- Step 12
  return true;
end;
$function$;

-- Grant contract — SECURITY-CHECKLIST.md S1's required form verbatim.
-- `FROM PUBLIC` is load-bearing: a bare `FROM anon` leaves anon inheriting
-- through PUBLIC (20260724121000:23-28). The function is newly created (not
-- `create or replace`), so `revoke_anon_execute_on_new_function`
-- (20260817120000/20260817130000:27-30) already auto-revokes PUBLIC/anon at
-- CREATE FUNCTION time — the explicit REVOKE below is required by the
-- ticket's contract and the checklist's check form regardless.
REVOKE EXECUTE ON FUNCTION public.request_product_pricing_c2c(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_product_pricing_c2c(uuid, uuid) TO authenticated;

-- _resolve_or_create_c2c_thread now has a second caller. No grant change —
-- the helper stays un-granted (revoke all ... from public, anon,
-- authenticated, 20260826090000:98-99); a call from inside this function's
-- own SECURITY DEFINER body runs under this function's owner privileges.
comment on function public._resolve_or_create_c2c_thread(uuid) is
  'Internal-only. Callable only from accept_connection_request''s and '
  'request_product_pricing_c2c''s own definer bodies — no caller-'
  'authorization check of its own. Do not GRANT.';
