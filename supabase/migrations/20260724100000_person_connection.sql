-- ============================================================================
-- person_connection — the person↔person social-graph edge (Lane B, PG-1)
-- ----------------------------------------------------------------------------
-- Hello Sello's existing `relationship` graph is company↔company (commercial:
-- deals, pricing, shops). This adds a SECOND, independent graph: person↔person
-- (social, LinkedIn-style). Two people can be connected with NO company
-- relationship behind them — the edge stands on its own.
--
-- Pure social: the edge just EXISTS or is soft-deleted. "Pending" lives in
-- pending_inbox_item (a connect_person request), NOT here — so there is
-- deliberately no `status` column (add one only when a real state like `blocked`
-- actually arrives). Mirrors relationship's canonical-order pattern, person-keyed.
--
-- Writes go through the SECURITY DEFINER accept path (PG-7) — authenticated gets
-- SELECT via the policy below and NO write policy, so RLS denies any direct
-- client write (same protection chat_thread_member relies on). A client cannot
-- forge an edge.
-- ============================================================================

create table public.person_connection (
  id                      uuid primary key default gen_random_uuid(),
  person_a_id             uuid not null references public.person(id),   -- lower UUID
  person_b_id             uuid not null references public.person(id),   -- higher UUID
  initiated_by_person_id  uuid not null references public.person(id),
  created_at              timestamptz not null default now(),
  deleted_at              timestamptz null,
  constraint person_connection_canonical_order check (person_a_id < person_b_id)
);

-- One ACTIVE edge per person pair; a soft-deleted edge frees the pair to reconnect.
create unique index uq_person_connection_active
  on public.person_connection (person_a_id, person_b_id)
  where deleted_at is null;

create index idx_person_connection_person_a on public.person_connection (person_a_id);
create index idx_person_connection_person_b on public.person_connection (person_b_id);

-- RLS: you can read an edge you are one of the two people in. No write policy →
-- direct client INSERT/UPDATE/DELETE is denied; the accept RPC (SECURITY DEFINER)
-- performs the write.
alter table public.person_connection enable row level security;

create policy person_connection_select on public.person_connection
  for select to authenticated
  using (auth.uid() in (person_a_id, person_b_id));
