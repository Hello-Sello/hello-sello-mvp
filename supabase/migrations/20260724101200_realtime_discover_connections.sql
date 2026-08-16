-- Live Discover: enable Supabase Realtime change-capture on the tables behind the
-- connection lifecycle, so requests + accepts reflect instantly on BOTH sides with
-- no manual refresh — the same change-capture pattern Chat already uses.
--
--   pending_inbox_item  a request is sent (INSERT) or resolved (UPDATE)  -> the
--                       recipient's Requests box; either side on accept/decline
--   person_connection   a person edge is minted on accept (INSERT)       -> the
--                       requester's My Network gains the person
--   relationship        a company edge is minted on accept (INSERT)      -> the
--                       requester's My Network gains the company
--
-- Change-capture only: no schema or RLS change. Realtime applies each table's RLS
-- SELECT policy to the stream, so a subscriber receives ONLY rows they may see:
--   pending_inbox_item  inbox_select: receiver_person_id = auth.uid() OR a party company
--   person_connection   person_connection_select: auth.uid() in (person_a_id, person_b_id)
--   relationship        rel_all: current_company_id() in (company_a_id, company_b_id)
-- so a request reaches its target, an accept reaches the requester, nobody else.
alter publication supabase_realtime add table public.pending_inbox_item;
alter publication supabase_realtime add table public.person_connection;
alter publication supabase_realtime add table public.relationship;
