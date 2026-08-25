-- ============================================================================
-- A relationship member can INSERT an extra line into a shared deal.
-- `authenticated` loses INSERT on `deal_line_item`. The table becomes
-- SELECT-only for authenticated, matching `deal_card`.
-- ----------------------------------------------------------------------------
-- THE GAP. A prior migration closed UPDATE/DELETE on this table but
-- deliberately kept INSERT for the one legitimate client write —
-- `acceptPromotion` — since `line_all` is the only policy on this table,
-- FOR ALL, with both USING and WITH CHECK equal to
-- `card_relationship_member(deal_card_id)` — TRUE for BOTH sides. Nothing
-- tied an INSERT to a promotion, a version, or a side, so any relationship
-- member could add an arbitrary line to a shared deal:
--
--     await supabase.from('deal_line_item').insert({
--       deal_card_id: theirCardId, version: currentVersion,
--       product_name: 'Rebate', quantity: 1, unit: 'g', unit_price: 0,
--       currency: 'EUR', sort_order: 9999,
--     });
--
-- Reproduced on the seeded stack before this was written: as the buyer, a
-- relationship member, the insert above succeeded on the seller's card. The
-- `(deal_card_id, version, sort_order)` unique key does NOT block it — it only
-- collides on an already-used sort_order, and the attacker picks a free one.
--
-- THE FIX. `acceptPromotion` moves behind a SECURITY DEFINER RPC that
-- re-derives the caller's company and the card's buyer, reads the pending
-- promotion itself, writes the reward lines, and flips the promotion state —
-- atomically, as one function call. INSERT is then removed the same way
-- UPDATE/DELETE were: the privilege is unused by any other path, so it is
-- revoked, not fenced.
--
-- ⚠️  THIS ALONE DOES NOT CLOSE THE DOOR. `accept_promotion` trusts
-- `deal_promotion.offered_by_company`/`.line_deltas` as its authorization
-- input, but `deal_promotion`'s own policy is the SAME symmetric predicate —
-- `authenticated` still holds INSERT/UPDATE/DELETE on it. A buyer could
-- self-author a "seller" promotion (or edit the seller's real one) and then
-- accept it as themselves, landing an arbitrary line the identical way. The
-- companion migration in this same change closes `deal_promotion` the same
-- way — this table's fix is necessary but not sufficient on its own; read it
-- together with that one.
--
-- ⚠️  A DEFINER BYPASSES RLS, WHICH MEANS IT MUST RE-IMPORT WHAT RLS WAS
-- ALSO GUARDING, NOT JUST THE PART THIS TICKET IS ABOUT.
-- `card_relationship_member(deal_card_id)` is not plain membership — it is
-- `is_relationship_member(...) AND (dc.status <> 'unsent' OR
-- dc.initiating_company_id = current_company_id())`, so a card's own
-- initiator can act on their private unsent draft but the counterparty
-- cannot. `accept_promotion` calls `card_relationship_member` explicitly
-- (not just the buyer-equality check) so that guard survives the move behind
-- a definer, instead of silently narrowing to "any buyer, any card status."
-- ============================================================================

-- card_buyer_company_id — the card-level analogue of `line_seller_company_id`
-- (buyer instead of seller, derived from a deal_card instead of a line). Same
-- deal_type/initiating_company_id logic as `sellerCompanyId`/`buyerCompanyId`
-- in src/modules/deals/lib/derive.ts — the buyer is whichever side did NOT
-- issue the offer/order. Invariant this relies on: `initiating_company_id` is
-- always one of the relationship's two companies (true today because
-- `create_deal_draft` writes it from the session, never client-supplied); if
-- that ever stops holding, this returns the caller's own id for an orphaned
-- card and the buyer gate below would wrongly pass a stranger.
-- Called only from other SECURITY DEFINER functions, never from a policy or
-- the client directly — EXECUTE is revoked from `authenticated` below.
CREATE FUNCTION public.card_buyer_company_id(p_deal_card_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
           WHEN dc.deal_type = 'offer' THEN
             CASE WHEN dc.initiating_company_id = r.company_a_id
                    THEN r.company_b_id ELSE r.company_a_id END
           ELSE dc.initiating_company_id
         END
  FROM public.deal_card dc
  JOIN public.relationship r ON r.id = dc.relationship_id
  WHERE dc.id = p_deal_card_id;
$$;
REVOKE EXECUTE ON FUNCTION public.card_buyer_company_id(uuid) FROM PUBLIC, anon, authenticated;

-- accept_promotion — the buyer accepts the seller's pending promotion.
-- Re-derives the caller's company; gates on BOTH `card_relationship_member`
-- (membership + the unsent-draft restriction the old RLS policy carried) and
-- buyer equality (a seller or a stranger must be refused, not just a
-- non-member) — same message for both so neither leaks which one failed.
-- The card-existence check runs BEFORE either gate so a nonexistent card
-- always raises the same "not found" regardless of the caller's own company
-- - a companyless caller (current_company_id() null) must not get a
-- different error and turn this into a card-existence oracle. This does not
-- hide card existence from an ordinary authenticated stranger, who can still
-- tell "not found" apart from "not the buyer" - only the companyless case is
-- what this ordering protects.
-- `FOR UPDATE` locks the card row first (same lock-first order as
-- `confirm_deal_change`/`update_deal_draft`) so a concurrent version bump
-- cannot land the reward on a version that changes under it, then the
-- promotion row, serializing a concurrent double-accept: the second caller's
-- WHERE state='pending' re-checks after the lock and finds nothing.
-- One function call = one atomic write: if any line_delta is malformed (bad
-- product FK, bad numeric text), the whole call rolls back — no orphan
-- lines, no half-flipped promotion.
CREATE FUNCTION public.accept_promotion(p_deal_card_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_version   integer;
  v_promo_id  uuid;
  v_deltas    jsonb;
  v_next_sort smallint;
  v_delta     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_promotion: not authenticated';
  END IF;

  SELECT version INTO v_version FROM public.deal_card WHERE id = p_deal_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_promotion: deal card not found';
  END IF;

  IF NOT public.card_relationship_member(p_deal_card_id)
     OR public.current_company_id() IS DISTINCT FROM public.card_buyer_company_id(p_deal_card_id) THEN
    RAISE EXCEPTION 'accept_promotion: Only the buyer can accept this promotion.';
  END IF;

  SELECT id, line_deltas INTO v_promo_id, v_deltas
    FROM public.deal_promotion
   WHERE deal_card_id = p_deal_card_id AND state = 'pending'
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_promotion: There is no pending promotion to accept.';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort
    FROM public.deal_line_item
   WHERE deal_card_id = p_deal_card_id AND version = v_version;

  FOR v_delta IN SELECT * FROM jsonb_array_elements(v_deltas)
  LOOP
    INSERT INTO public.deal_line_item
      (deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, sort_order)
    VALUES (
      p_deal_card_id,
      v_version,
      NULLIF(v_delta->>'productId', '')::uuid,
      COALESCE(NULLIF(trim(both from (v_delta->>'productName')), ''), 'Promotion reward'),
      COALESCE((v_delta->>'quantity')::numeric, 0),
      COALESCE(NULLIF(v_delta->>'unit', ''), 'g'),
      COALESCE((v_delta->>'unitPrice')::numeric, 0),
      COALESCE(NULLIF(v_delta->>'currency', ''), 'EUR'),
      v_next_sort
    );
    v_next_sort := v_next_sort + 1;
  END LOOP;

  UPDATE public.deal_promotion
     SET state = 'accepted', resolved_by_person = v_uid, resolved_at = now()
   WHERE id = v_promo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_promotion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_promotion(uuid) TO authenticated;

REVOKE INSERT ON public.deal_line_item FROM authenticated;

COMMENT ON TABLE public.deal_line_item IS
  'Deal line items. `authenticated` holds SELECT only: UPDATE, DELETE and '
  'INSERT were all removed because line_all is symmetric (card_relationship_member '
  'is true for BOTH sides) and could not tell buyer from seller, promotion, or '
  'version. Every legitimate mutation goes through one of the SECURITY DEFINER deal '
  'RPCs, including accept_promotion for the former client insert. Do not '
  're-grant INSERT/UPDATE/DELETE to add a feature — add a definer function. '
  'This alone is not enough: accept_promotion trusts deal_promotion as its '
  'authorization input, so deal_promotion must stay locked down too (see its '
  'own table comment).';
