-- SEC-02 — revoke anon catalogue read: close BOTH doors on product / pricelist_item /
-- product_image so anon cannot scrape any seller's opted-in catalogue via PostgREST.
-- ----------------------------------------------------------------------------
-- Two doors per table: (1) the role GRANT that PostgREST checks first, and (2) the
-- RLS policy TO clause. A TO authenticated policy alone does NOT block anon — Supabase's
-- default GRANT SELECT TO anon still lets anon hit the table (the policy just returns no
-- rows, so it looks closed but is half-closed; a future policy slip re-exposes everything).
-- This migration closes door 1 (the GRANT) here and door 2 (the policy) below.
--
-- The /c/[handle] public profile is unaffected: it reads only via the get_public_profile
-- DEFINER RPC (person/auth.users/company), never these tables (02-RESEARCH § Q2).
-- Own-company policies (product_all / pli_all / product_image_all) are untouched.
-- ----------------------------------------------------------------------------

-- Door 1 of 2 — strip Supabase's default SELECT grant to anon (PostgREST's first gate).
revoke select on public.product from anon;
revoke select on public.pricelist_item from anon;
revoke select on public.product_image from anon;
