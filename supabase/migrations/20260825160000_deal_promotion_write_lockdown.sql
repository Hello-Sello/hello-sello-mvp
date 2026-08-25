-- ============================================================================
-- deal_promotion write lockdown — the companion fix the deal_line_item INSERT
-- lockdown (previous migration) depends on to actually hold.
-- ----------------------------------------------------------------------------
-- THE GAP. `accept_promotion` trusts `deal_promotion.offered_by_company` and
-- `.line_deltas` as its authorization input: it checks the CALLER is the
-- buyer, then blindly writes whatever that row's line_deltas say. But
-- `deal_promotion`'s only policy, `promotion_member_all`, is the same
-- symmetric predicate as `deal_line_item`'s old one —
-- `card_relationship_member(deal_card_id)`, TRUE for BOTH sides — and
-- `authenticated` still held INSERT/UPDATE/DELETE on the table. So the buyer,
-- a genuine relationship member, could:
--
--   1. INSERT a self-authored promotion, spoofing offered_by_company as the
--      seller, with arbitrary line_deltas (WITH CHECK only checks membership,
--      not who offered_by_company names);
--   2. call accept_promotion as themselves — the buyer gate passes, because
--      they ARE the buyer;
--   3. the definer writes those arbitrary lines into deal_line_item.
--
-- Reproduced (rolled back) before this was written: the buyer forged a
-- 1000-gram free-product line through exactly that path. The FOR ALL policy
-- also means UPDATE was open the same way — a buyer could edit the seller's
-- REAL pending promotion's line_deltas before accepting it, or flip an
-- already-resolved row back to pending to accept it twice. Locking down
-- deal_line_item's own grants did not shrink "a relationship member can add
-- an extra line to a shared deal" — it just moved the door onto this table.
--
-- THE FIX, same shape as deal_line_item. `offerPromotion` (seller) and
-- `declinePromotion` (buyer) move behind SECURITY DEFINER RPCs that derive
-- company/side server-side, matching accept_promotion. Their buyer/seller
-- checks were client-side only in deals/actions.ts — the same class of gap
-- prior tickets on this table family caught elsewhere (a permission gate is
-- only as strong as the write path to its input). INSERT/UPDATE/DELETE are
-- then revoked from `authenticated`; the table becomes SELECT-only.
--
-- ⚠️  TWO STRUCTURAL GUARANTEES ADDED HERE, NOT JUST GRANTS.
-- (1) `line_deltas`/`condition_deltas` gain a `jsonb_typeof = 'array'` CHECK.
-- The client code this replaces tolerated a non-array (`Array.isArray(...) ?
-- ... : []`); the RPC does not re-check it inline (that tolerance would hide
-- a real data problem), and neither should every future reader — validate
-- once at the column, not in each caller.
-- (2) a partial unique index allows at most one PENDING promotion per card.
-- Without it, "the newest pending promotion" is a chosen convention that the
-- read side (getPromotion, any state, no tiebreak) and the write side
-- (state='pending' only) can disagree about, and a second accept can apply a
-- second, already-superseded offer. With it, there is nothing left to choose
-- between — offer_promotion refuses outright while one is still pending
-- rather than silently picking a "latest wins" rule.
-- ============================================================================

ALTER TABLE public.deal_promotion
  ADD CONSTRAINT deal_promotion_line_deltas_is_array
    CHECK (jsonb_typeof(line_deltas) = 'array'),
  ADD CONSTRAINT deal_promotion_condition_deltas_is_array
    CHECK (jsonb_typeof(condition_deltas) = 'array');

CREATE UNIQUE INDEX uq_deal_promotion_one_pending
  ON public.deal_promotion (deal_card_id)
  WHERE state = 'pending';

-- card_seller_company_id — the card-level counterpart to card_buyer_company_id
-- (previous migration). Same invariant and caveat: initiating_company_id must
-- be one of the relationship's two companies. Internal only — EXECUTE is
-- revoked from `authenticated` below.
CREATE FUNCTION public.card_seller_company_id(p_deal_card_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
           WHEN dc.deal_type = 'offer' THEN dc.initiating_company_id
           ELSE CASE WHEN dc.initiating_company_id = r.company_a_id
                       THEN r.company_b_id ELSE r.company_a_id END
         END
  FROM public.deal_card dc
  JOIN public.relationship r ON r.id = dc.relationship_id
  WHERE dc.id = p_deal_card_id;
$$;
REVOKE EXECUTE ON FUNCTION public.card_seller_company_id(uuid) FROM PUBLIC, anon, authenticated;

-- offer_promotion — the seller offers a promotion. Derives offered_by_company
-- and offered_by_person from the SESSION, never from the caller's input — the
-- one column direct writes let an attacker spoof. Gates on BOTH
-- card_relationship_member (membership + the unsent-draft restriction, see
-- the previous migration's header) and seller equality, same message for
-- both. Refuses outright, with a clear message, if a promotion is already
-- pending — the unique index would raise a raw constraint-violation
-- otherwise.
CREATE FUNCTION public.offer_promotion(
  p_deal_card_id uuid,
  p_line_deltas jsonb,
  p_condition_deltas jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_version integer;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'offer_promotion: not authenticated';
  END IF;

  SELECT version INTO v_version FROM public.deal_card WHERE id = p_deal_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_promotion: deal card not found';
  END IF;

  v_company := public.current_company_id();
  IF NOT public.card_relationship_member(p_deal_card_id)
     OR v_company IS DISTINCT FROM public.card_seller_company_id(p_deal_card_id) THEN
    RAISE EXCEPTION 'offer_promotion: Only the seller can offer a promotion.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.deal_promotion WHERE deal_card_id = p_deal_card_id AND state = 'pending') THEN
    RAISE EXCEPTION 'offer_promotion: A promotion is already pending on this deal.';
  END IF;

  INSERT INTO public.deal_promotion
    (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, condition_deltas, state)
  VALUES (
    p_deal_card_id, v_version, v_company, v_uid,
    COALESCE(p_line_deltas, '[]'::jsonb), COALESCE(p_condition_deltas, '[]'::jsonb), 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.offer_promotion(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_promotion(uuid, jsonb, jsonb) TO authenticated;

-- decline_promotion — the buyer declines a pending promotion. Same
-- existence-before-side-check order, card_relationship_member + buyer
-- equality gate, and FOR UPDATE as accept_promotion. At most one pending
-- promotion can exist per card (the unique index), so there is nothing left
-- to pick between - no ORDER BY/tiebreak needed on the SELECT below.
CREATE FUNCTION public.decline_promotion(p_deal_card_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_promo_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'decline_promotion: not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.deal_card WHERE id = p_deal_card_id) THEN
    RAISE EXCEPTION 'decline_promotion: deal card not found';
  END IF;

  IF NOT public.card_relationship_member(p_deal_card_id)
     OR public.current_company_id() IS DISTINCT FROM public.card_buyer_company_id(p_deal_card_id) THEN
    RAISE EXCEPTION 'decline_promotion: Only the buyer can decline this promotion.';
  END IF;

  SELECT id INTO v_promo_id
    FROM public.deal_promotion
   WHERE deal_card_id = p_deal_card_id AND state = 'pending'
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decline_promotion: There is no pending promotion to decline.';
  END IF;

  UPDATE public.deal_promotion
     SET state = 'declined', resolved_by_person = v_uid, resolved_at = now()
   WHERE id = v_promo_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decline_promotion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_promotion(uuid) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.deal_promotion FROM authenticated;
REVOKE ALL ON public.deal_promotion FROM PUBLIC, anon;

COMMENT ON TABLE public.deal_promotion IS
  'Promotion offers on a deal. `authenticated` holds SELECT only: INSERT, '
  'UPDATE and DELETE were removed because promotion_member_all is symmetric '
  '(card_relationship_member is true for BOTH sides), and accept_promotion '
  '(deal_line_item''s own lockdown migration) trusts offered_by_company and '
  'line_deltas as authorization input — a buyer with direct write access '
  'could self-author a fake seller promotion, or edit a real one, then '
  'accept it. Every legitimate mutation goes through offer_promotion '
  '(seller), or accept_promotion / decline_promotion (buyer). At most one '
  'row per card may be state=''pending'' (uq_deal_promotion_one_pending); '
  'line_deltas/condition_deltas must be jsonb arrays (CHECK). Do not '
  're-grant to add a feature — add a definer function.';
