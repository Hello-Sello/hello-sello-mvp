-- ============================================================================
-- Migration — Row Level Security (F2, the privacy spine)
-- ----------------------------------------------------------------------------
-- Multi-tenant isolation by company. A logged-in (authenticated) user may only
-- touch rows belonging to their company, or a relationship/deal their company
-- is in. Service role (backend, seed) bypasses RLS entirely.
--
-- Chain-following tables (chat, deals, things) reach their owning company
-- through 1-3 hops, written ONCE as SECURITY DEFINER helpers so a policy on
-- chat_message doesn't recurse through chat_thread's own policy.
--
-- FAIL-SAFE: current_company_id() is NULL for a user with no company yet
-- (sign-in -> company-setup window, and Path B). NULL = no match = deny.
--
-- Recreated 2026-06-07 (prior untracked draft was lost). Integrates review
-- fixes: H1 (audit hash fn -> SECURITY DEFINER) + M1 (deal-thread visibility
-- follows workspace lockstep).
--
-- NOT in this migration (tracked follow-ups):
--   * Seller-only COLUMN hiding (deal_line_item.seller_margin/buyer_metric,
--     product.cogs) — needs a view or table split; design decision pending.
--   * RLS test suite (run separately; proves A cannot read/write B).
--   * audit_log app_writer role/grants (F5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- H1 fix — audit hash chain must read the GLOBAL previous row, so the hash
-- trigger must bypass RLS. Without this, once audit_log has a SELECT policy the
-- trigger's tip-read is filtered per-tenant and the chain forks.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.audit_log_compute_hash() SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 0. Reset — drop existing public policies so this file is authoritative,
--    then ensure RLS is on for every public table (idempotent; the project's
--    rls_auto_enable already enables it, this is belt-and-suspenders).
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER — bypass RLS while resolving ownership)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.person WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_hs_team()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hs_team_member
    WHERE person_id = auth.uid() AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_group(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."group" g
    WHERE g.id = p_group_id AND g.company_id = public.current_company_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_relationship_member(p_rel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.relationship r
    WHERE r.id = p_rel_id
      AND public.current_company_id() IN (r.company_a_id, r.company_b_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.card_relationship_member(p_card_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_card dc
    WHERE dc.id = p_card_id AND public.is_relationship_member(dc.relationship_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_member m
    WHERE m.deal_workspace_id = p_ws_id
      AND m.person_id = auth.uid() AND m.removed_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace(p_ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_workspace w
    WHERE w.id = p_ws_id
      AND public.card_relationship_member(w.deal_card_id)
      AND (w.visibility = 'company_wide' OR public.is_workspace_member(w.id))
  );
$$;

-- M1 fix — deal threads follow the workspace visibility lockstep (private =
-- members only), not plain relationship scope. c2c/p2p keep their own scope.
CREATE OR REPLACE FUNCTION public.can_access_thread(p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_thread t
    WHERE t.id = p_thread_id
      AND (
        (t.type = 'p2p'  AND auth.uid() IN (t.person_a_id, t.person_b_id))
        OR (t.type = 'c2c' AND public.is_relationship_member(t.relationship_id))
        OR (t.type = 'deal' AND EXISTS (
              SELECT 1 FROM public.deal_workspace w
              WHERE w.deal_card_id = t.deal_card_id
                AND public.can_access_workspace(w.id)
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_product_batch(p_batch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.product_batch pb
    WHERE pb.id = p_batch_id AND pb.company_id = public.current_company_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_pricelist(p_pricelist_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pricelist p
    WHERE p.id = p_pricelist_id AND p.company_id = public.current_company_id()
  );
$$;

GRANT EXECUTE ON FUNCTION
  public.current_company_id(), public.is_hs_team(), public.owns_group(uuid),
  public.is_relationship_member(uuid), public.card_relationship_member(uuid),
  public.is_workspace_member(uuid), public.can_access_workspace(uuid),
  public.can_access_thread(uuid), public.owns_product_batch(uuid),
  public.owns_pricelist(uuid)
TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Lookup / reference tables — public read for any logged-in user
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
  lookups text[] := ARRAY[
    'company_type','inbox_request_type','artifact_category','agreed_term_type',
    'permission_action','contact_role','contact_provider','deal_line_unit',
    'deal_type','chat_thread_type','content_author','deal_change_origin',
    'note_scope','chat_message_type','payment_terms','incoterms','product_unit',
    'strain_dominance','irradiation_type','pricelist_status',
    'company_verification_status','file_scan_status','relationship_term_status',
    'relationship_status','inbox_status','join_request_status','deal_card_status',
    'deal_confirmation_status','workspace_visibility','deal_member_role',
    'thing_type','thing_status','deal_stage','deal_artifact_category',
    'audit_actor_type','audit_action_type','auditable_content_type','terpene'
  ];
BEGIN
  FOREACH t IN ARRAY lookups LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Phase 1 — identity / tenancy / governance
-- ----------------------------------------------------------------------------

-- person: see yourself + your company's people (+ HS team). INSERT is done by
-- the handle_new_user() trigger (definer). Update self only.
CREATE POLICY person_select ON person FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = current_company_id() OR is_hs_team());
CREATE POLICY person_update ON person FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- company: see/modify your own (+ HS team). Anyone may create their own at
-- onboarding (company_id not yet on the person -> WITH CHECK can't gate it).
CREATE POLICY company_select ON company FOR SELECT TO authenticated
  USING (id = current_company_id() OR is_hs_team());
CREATE POLICY company_insert ON company FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY company_update ON company FOR UPDATE TO authenticated
  USING (id = current_company_id() OR is_hs_team())
  WITH CHECK (id = current_company_id() OR is_hs_team());

CREATE POLICY clf_all ON company_license_file FOR ALL TO authenticated
  USING (company_id = current_company_id() OR is_hs_team())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY cta_all ON company_type_assignment FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY group_all ON "group" FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- person_group: your own memberships + memberships of groups you own.
-- Platform-role rows (group_id NULL) are service-role managed.
CREATE POLICY person_group_all ON person_group FOR ALL TO authenticated
  USING (person_id = auth.uid() OR owns_group(group_id))
  WITH CHECK (owns_group(group_id));

CREATE POLICY pme_all ON permission_matrix_entry FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY contact_all ON contact_record FOR ALL TO authenticated
  USING (person_id = auth.uid())
  WITH CHECK (person_id = auth.uid());

-- inbox: receiver + sender both see it; only sender creates; receiver acts.
CREATE POLICY inbox_select ON pending_inbox_item FOR SELECT TO authenticated
  USING (receiver_company_id = current_company_id() OR sender_company_id = current_company_id());
CREATE POLICY inbox_insert ON pending_inbox_item FOR INSERT TO authenticated
  WITH CHECK (sender_company_id = current_company_id());
CREATE POLICY inbox_update ON pending_inbox_item FOR UPDATE TO authenticated
  USING (receiver_company_id = current_company_id())
  WITH CHECK (receiver_company_id = current_company_id());

CREATE POLICY jr_select ON join_request FOR SELECT TO authenticated
  USING (requester_person_id = auth.uid() OR target_company_id = current_company_id());
CREATE POLICY jr_insert ON join_request FOR INSERT TO authenticated
  WITH CHECK (requester_person_id = auth.uid());
CREATE POLICY jr_update ON join_request FOR UPDATE TO authenticated
  USING (target_company_id = current_company_id() OR requester_person_id = auth.uid())
  WITH CHECK (target_company_id = current_company_id() OR requester_person_id = auth.uid());

-- hs_team_member: see yourself; only HS team modifies the allowlist.
CREATE POLICY hstm_all ON hs_team_member FOR ALL TO authenticated
  USING (person_id = auth.uid() OR is_hs_team())
  WITH CHECK (is_hs_team());

-- audit_log: read own company's trail (+ HS). Insert for own company. No
-- update/delete policy -> denied (append-only trigger also enforces this).
CREATE POLICY audit_select ON audit_log FOR SELECT TO authenticated
  USING (company_id = current_company_id() OR is_hs_team());
CREATE POLICY audit_insert ON audit_log FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id());

-- ----------------------------------------------------------------------------
-- 4. Phase 2 — relationships, chat, deals
-- ----------------------------------------------------------------------------

CREATE POLICY rel_all ON relationship FOR ALL TO authenticated
  USING (current_company_id() IN (company_a_id, company_b_id))
  WITH CHECK (current_company_id() IN (company_a_id, company_b_id));

-- notes private to the authoring company; personal-scope to the author only.
CREATE POLICY relnote_all ON relationship_note FOR ALL TO authenticated
  USING (company_id = current_company_id() AND (scope = 'team' OR created_by = auth.uid()))
  WITH CHECK (company_id = current_company_id());

CREATE POLICY relterm_all ON relationship_term FOR ALL TO authenticated
  USING (is_relationship_member(relationship_id))
  WITH CHECK (is_relationship_member(relationship_id));
CREATE POLICY relart_all ON relationship_artifact FOR ALL TO authenticated
  USING (is_relationship_member(relationship_id))
  WITH CHECK (is_relationship_member(relationship_id));

-- chat_thread: p2p = the two people; c2c = both companies; deal = workspace
-- lockstep (via can_access_thread). INSERT uses inline predicate (row is new).
CREATE POLICY thread_all ON chat_thread FOR ALL TO authenticated
  USING (can_access_thread(id))
  WITH CHECK (
    (type = 'p2p' AND auth.uid() IN (person_a_id, person_b_id))
    OR (type IN ('c2c', 'deal') AND is_relationship_member(relationship_id))
  );

CREATE POLICY msg_all ON chat_message FOR ALL TO authenticated
  USING (can_access_thread(thread_id))
  WITH CHECK (can_access_thread(thread_id));

CREATE POLICY card_all ON deal_card FOR ALL TO authenticated
  USING (is_relationship_member(relationship_id))
  WITH CHECK (is_relationship_member(relationship_id));

CREATE POLICY conf_all ON deal_confirmation FOR ALL TO authenticated
  USING (card_relationship_member(deal_card_id))
  WITH CHECK (card_relationship_member(deal_card_id));

CREATE POLICY line_all ON deal_line_item FOR ALL TO authenticated
  USING (card_relationship_member(deal_card_id))
  WITH CHECK (card_relationship_member(deal_card_id));

CREATE POLICY cardlog_all ON deal_card_log FOR ALL TO authenticated
  USING (card_relationship_member(deal_card_id))
  WITH CHECK (card_relationship_member(deal_card_id));

CREATE POLICY changein_all ON deal_change_input FOR ALL TO authenticated
  USING (card_relationship_member(deal_card_id))
  WITH CHECK (card_relationship_member(deal_card_id));

-- workspace + children: relationship membership, gated by visibility.
-- INSERT checks the parent card's relationship (the row is new).
CREATE POLICY ws_all ON deal_workspace FOR ALL TO authenticated
  USING (can_access_workspace(id))
  WITH CHECK (card_relationship_member(deal_card_id));
CREATE POLICY member_all ON deal_member FOR ALL TO authenticated
  USING (can_access_workspace(deal_workspace_id))
  WITH CHECK (can_access_workspace(deal_workspace_id));
CREATE POLICY dealart_all ON deal_artifact FOR ALL TO authenticated
  USING (can_access_workspace(deal_workspace_id))
  WITH CHECK (can_access_workspace(deal_workspace_id));
CREATE POLICY thing_all ON thing FOR ALL TO authenticated
  USING (can_access_workspace(deal_workspace_id))
  WITH CHECK (can_access_workspace(deal_workspace_id));

-- ----------------------------------------------------------------------------
-- 5. Catalog — a company's own catalog (cross-company pricelist sharing is a
--    later Present-surface feature). product_buyer_code is relationship-scoped.
-- ----------------------------------------------------------------------------
CREATE POLICY product_all ON product FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY batch_all ON product_batch FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY bterp_all ON batch_terpene FOR ALL TO authenticated
  USING (owns_product_batch(product_batch_id))
  WITH CHECK (owns_product_batch(product_batch_id));
CREATE POLICY pbc_all ON product_buyer_code FOR ALL TO authenticated
  USING (is_relationship_member(relationship_id))
  WITH CHECK (is_relationship_member(relationship_id));
CREATE POLICY pricelist_all ON pricelist FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY pli_all ON pricelist_item FOR ALL TO authenticated
  USING (owns_pricelist(pricelist_id))
  WITH CHECK (owns_pricelist(pricelist_id));
