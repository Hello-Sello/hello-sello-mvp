-- ============================================================================
-- A promotion may only be offered or accepted while the deal is IN NEGOTIATION
-- (HEL-83)
-- ----------------------------------------------------------------------------
-- None of the three promotion RPCs checked `deal_card.status`. A promotion could
-- be offered and accepted on a deal in ANY status — including `done` (delivery
-- note + invoice already present) and `cancelled`. `accept_promotion` inserts
-- real `deal_line_item` rows, so accepting one on a `done` card silently makes
-- the deal's lines disagree with the invoice already issued against it.
--
-- Reachable through the normal UI, not just a direct API call: `CardFront.tsx`
-- renders the promotion track with no status condition, and `PromotionTrack.tsx`
-- shows Accept/Decline for any `pending` row regardless of the card's status.
--
-- ── THE RULING, AND WHO MADE IT ──
-- Muskan, 2026-09-03: **only `negotiation`**. HEL-83 explicitly deferred this to
-- a product decision rather than an engineering one, because the gap is not an
-- unauthorized actor — it is the legitimate buyer or seller acting at a bad time
-- in the lifecycle, and "which statuses are still open for business" is a
-- product question. Recorded in `docs/decisions/DECISIONS.md` under 2026-09-03.
--
-- The full vocabulary this rules on (`deal_card_status`, seven codes):
--   unsent          draft, private to the creating company  -> REFUSED
--   negotiation     sent, being negotiated                  -> ALLOWED
--   confirmed       both sides confirmed                    -> REFUSED
--   done            delivery note + invoice present         -> REFUSED (terminal)
--   cancelled       cancelled                               -> REFUSED (terminal)
--   ticket_created  reopen ticket open                      -> REFUSED
--   ticket_closed   reopen ticket closed                    -> REFUSED
--
-- ── WHY THIS MATCHES WHAT THE PRODUCT ALREADY DECIDED ──
-- `sign_deal` is the only sibling with a real status gate and it raises
-- "only a deal in negotiation can be signed" — same rule, same shape, same
-- wording. And `20260707140100_lifecycle_status_codes.sql` already records
-- D-29: after a deal closes, "the ONLY path back in is a reopen ticket, and the
-- sealed deal terms never change again." The two ticket states are refused here
-- for exactly that reason. (⚠️ D-29 survives ONLY in that migration's header —
-- it is in no decision doc — which is part of why this went unenforced.)
--
-- A promotion is deliberately SIGN-AGNOSTIC (D-26,
-- `20260707140000_deal_promotion.sql`): accepting one never touches
-- `deal_confirmation` and never bumps the version. So there is no confirmation
-- gate standing behind this one — `deal_card.status` is the ONLY available
-- lever, which is why its absence mattered.
--
-- ── decline_promotion IS DELIBERATELY NOT GATED ──
-- Gating the decline would strand data. If a deal leaves `negotiation` while a
-- promotion is still `pending`, a gated decline leaves that row `pending`
-- forever, behind two buttons that both refuse — with no path to clear it.
-- Declining mutates nothing on the deal: it sets `state='declined'` and stamps
-- the resolver. It is cleanup, not business.
--
-- This mirrors HEL-84's own ruling one slug earlier, where a decline had to keep
-- working on a SUSPENDED relationship for the same reason (ADR 0008, and
-- `20260827130000`'s gate sits inside the both-accepted branch precisely so a
-- decline still succeeds). Same principle: gate what CHANGES the deal, never the
-- exit.
--
-- ── ORDER OF CHECKS IS DELIBERATE ──
-- The gate is placed AFTER each function's authorization check, never before. An
-- outsider must be refused for not being a party to the deal, and must not learn
-- this card's status from the error message. Only a legitimate seller/buyer ever
-- sees the status-based refusal.
--
-- ── PROVENANCE ──
-- Both bodies were generated from the LIVE production definitions and confirmed
-- byte-identical to local before editing:
--   offer_promotion   md5 e1a743b778b02054fe92776044e1157f  (1207 chars)
--   accept_promotion  md5 8861480b6ab62a25e655f24c6ce57a5b  (1957 chars)
-- The only edits are additive: one `v_status` declaration, one widened SELECT
-- (`version` -> `version, status` — same row, same lock, no extra query), and
-- one guard per function. Signatures are unchanged, so `create or replace` is
-- legal and the existing grants survive untouched.
--
-- ── BLAST RADIUS: ZERO TODAY ──
-- `deal_promotion` has NO rows on production. Nothing to migrate, nothing to
-- reconcile, no back-compat risk. Strict now is cheap; widening later is a
-- one-line change, whereas deals that already gained lines after confirmation
-- would have to be reconciled by hand.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.offer_promotion(p_deal_card_id uuid, p_line_deltas jsonb, p_condition_deltas jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_version integer;
  v_status  text;      -- HEL-83
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'offer_promotion: not authenticated';
  END IF;

  SELECT version, status INTO v_version, v_status FROM public.deal_card WHERE id = p_deal_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_promotion: deal card not found';
  END IF;

  v_company := public.current_company_id();
  IF NOT public.card_relationship_member(p_deal_card_id)
     OR v_company IS DISTINCT FROM public.card_seller_company_id(p_deal_card_id) THEN
    RAISE EXCEPTION 'offer_promotion: Only the seller can offer a promotion.';
  END IF;

  -- HEL-83: only a deal still IN NEGOTIATION can carry a promotion.
  -- Placed AFTER the authorization check above on purpose: an outsider must be
  -- refused for not being a party, and must never learn this deal's status.
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION '%: only a deal in negotiation can carry a promotion (this one is %)',
      'offer_promotion', v_status;
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
$function$;

CREATE OR REPLACE FUNCTION public.accept_promotion(p_deal_card_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_version   integer;
  v_status    text;      -- HEL-83
  v_promo_id  uuid;
  v_deltas    jsonb;
  v_next_sort smallint;
  v_delta     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_promotion: not authenticated';
  END IF;

  SELECT version, status INTO v_version, v_status FROM public.deal_card WHERE id = p_deal_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_promotion: deal card not found';
  END IF;

  IF NOT public.card_relationship_member(p_deal_card_id)
     OR public.current_company_id() IS DISTINCT FROM public.card_buyer_company_id(p_deal_card_id) THEN
    RAISE EXCEPTION 'accept_promotion: Only the buyer can accept this promotion.';
  END IF;

  -- HEL-83: only a deal still IN NEGOTIATION can carry a promotion.
  -- Placed AFTER the authorization check above on purpose: an outsider must be
  -- refused for not being a party, and must never learn this deal's status.
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION '%: only a deal in negotiation can carry a promotion (this one is %)',
      'accept_promotion', v_status;
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
$function$;

-- Grants re-emitted explicitly. `create or replace` preserves them; this is
-- belt-and-braces and documents the intended reachability in the migration.
grant execute on function public.offer_promotion(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.accept_promotion(uuid) to authenticated, service_role;
