-- ============================================================================
-- HEL-75 — a connection request may no longer be landed on a company that has
--          left: `inbox_insert` gains a RECEIVER predicate.
-- ----------------------------------------------------------------------------
-- THE GAP. `inbox_insert`'s WITH CHECK was
--     sender_company_id = current_company_id() AND sender_person_id = auth.uid()
-- (20260823090000:306-309). Both terms constrain the SENDER. Nothing constrained
-- the RECEIVER, so HEL-70 hiding a deactivated company from the five discovery
-- doors removed the BUTTON, not the DOOR: anyone holding the company id from a
-- bookmark, an old page or a previous listing could still land a pending request
-- on it through PostgREST. L-027 — a permission gate is only as strong as the
-- write path to its input.
--
-- SCOPE (Muskan's ruling, 2026-08-25). Deleted + deactivated ONLY. An UNVERIFIED
-- or re-verifying company stays REACHABLE: it is trying to arrive, not leave, and
-- blocking inbound interest would punish it at precisely the wrong moment. This
-- is deliberately NARROWER than the term HEL-70 gave the five read doors, and the
-- narrowness is the decision, not an oversight.
--
-- ⚠️ WHY A SECURITY DEFINER HELPER AND NOT AN INLINE `EXISTS`.
-- The ticket sketched a bare `EXISTS (SELECT 1 FROM public.company …)`. A
-- subquery inside a policy expression is evaluated AS THE CALLING ROLE, so it is
-- subject to `company`'s own RLS — and `company_select` (20260607170000) shows
-- `authenticated` only its own company, HS-team rows, and companies it already
-- `shares_connection_with_company()`. A company you have never met is INVISIBLE.
--
-- Measured on the local stack before this was written, as Alice @ GreenLeaf:
--     direct SELECT on `company`  ->  5 of 6 rows; PendingCo GmbH absent
--     inline-EXISTS predicate, Alice -> PendingCo (live, unverified)  ->  REFUSED
--     inline-EXISTS predicate, Alice -> NordCanna (deactivated)       ->  refused
-- The first refusal VIOLATES the ruling above. The second is right by accident:
-- the inline form is really gating on "do we already share a connection", not on
-- liveness, and the two only look alike on the seeded pairs. So the sketch would
-- have shipped a gate that breaks connecting to any new company — the product's
-- primary flow — while reading as a two-line liveness check. L-052.
--
-- The definer helper is also the shape this repo already converged on for
-- exactly this problem: `product_visible_to_caller()` and
-- `product_price_visible_to_caller()` own their rules so six doors inherit one
-- term (DECISIONS 2026-08-25). This is that pattern for receiver liveness.
--
-- ⚠️ `receiver_company_id` IS NULLABLE and the null case is not a loophole.
-- Two CHECK constraints make the split total and enforced by the database:
--     inbox_connect_person_has_no_company     : connect_person => company IS NULL
--     inbox_company_request_requires_company  : every other type => company NOT NULL
-- So `receiver_company_id IS NULL` is provably equivalent to
-- `type = 'connect_person'`, whose receiver is a PERSON. Person liveness is a
-- different rule with a different owner and is NOT in this ticket's scope.
--
-- READER CENSUS (L-037), from source, before narrowing. Only TWO client sites
-- insert here as `authenticated`:
--     discover/actions.ts:76        connect | connect_message | pricelist_request
--                                   -> sets receiver_company_id   (GATED here)
--     discover/personActions.ts:56  connect_person
--                                   -> receiver_company_id null   (untouched)
-- `deal_card` rows are written by `deliver_deal`, SECURITY DEFINER owned by
-- postgres (rolbypassrls), so RLS does not apply to it and the deal path cannot
-- be broken by this change.
--
-- ⚠️ ALTER POLICY, not DROP + CREATE. `inbox_insert` is `TO authenticated`;
-- re-creating it without repeating that clause would silently widen it to
-- {public} — the trap 20260823090000:295-298 called out. ALTER touches only the
-- WITH CHECK expression and leaves the role list where it is.
--
-- NOT CLOSED BY THIS MIGRATION, deliberately: a request that was already pending
-- when the receiver deactivated. WITH CHECK governs the INSERT only, and accept
-- runs through `accept_connection_request` (SECURITY DEFINER, bypasses RLS), so
-- RLS cannot be the mechanism there. Verified on production 2026-08-25: that
-- function checks item state, addressee and type, and never the receiver
-- company's liveness. Recorded in HEL-75; it needs its own decision.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The owner of "may this company still be written to?".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_can_receive_requests(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- SECURITY DEFINER on purpose: this must answer for a company the caller
  -- cannot SELECT. See the header — the whole point of a connection request is
  -- that you have not met the receiver yet.
  --
  -- Verification is NOT a term here. Ruled 2026-08-25: unverified companies stay
  -- reachable. If that is ever revisited, this function is the single place to
  -- change, and the suite's A4 cell is what will go red.
  SELECT EXISTS (
    SELECT 1
      FROM public.company c
     WHERE c.id = p_company_id
       AND c.deleted_at     IS NULL
       AND c.deactivated_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.company_can_receive_requests(uuid) IS
  'True when a company may still be sent a new inbound request: not soft-deleted '
  'and not deactivated. Verification status is deliberately NOT a term (ruling '
  '2026-08-25 — a re-verifying company is arriving, not leaving). SECURITY '
  'DEFINER because callers legitimately cannot SELECT a company they have not '
  'met. Single owner for receiver liveness; add callers, do not restate it.';

-- Both halves, not just PUBLIC: a bare `REVOKE … FROM PUBLIC` leaves `anon`'s
-- own grant in place (the session-77 rule, 20260817120000).
REVOKE EXECUTE ON FUNCTION public.company_can_receive_requests(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.company_can_receive_requests(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The gate itself.
-- ----------------------------------------------------------------------------
ALTER POLICY inbox_insert ON public.pending_inbox_item
  WITH CHECK (
    sender_company_id = public.current_company_id()
    AND sender_person_id = auth.uid()
    AND (
      -- connect_person: receiver is a PERSON, company is NULL by CHECK. Out of scope.
      receiver_company_id IS NULL
      OR public.company_can_receive_requests(receiver_company_id)
    )
  );
