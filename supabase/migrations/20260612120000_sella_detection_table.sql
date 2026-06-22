-- Sella 4b, step 3: the detection memory table.
--
-- `sella_detection` is Sella's PRIVATE state - one row per detection run. People
-- never read it; the human-facing view is the `deal_detected` chat_message this
-- run posts. The table exists so detection does not repeat itself: it carries the
-- idempotency guard, the dedup/supersession identity, and the GDPR rule.
--
-- Why a separate table (not the chat rows): a `no_deal` run must be REMEMBERED for
-- dedup but must NOT spam the chat, and a no_deal verdict must keep no verbatim
-- quotes (GDPR). Splitting Sella's memory from the visible suggestion lets both be
-- true. See docs/PRD/muskan-proposed-sella-architecture.md B2 + _workshop/pov/sella.md.

create table public.sella_detection (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null references public.chat_thread(id) on delete cascade,
  -- the newest chat_message.id at run time; with thread_id this is the idempotency key
  last_message_id     uuid not null references public.chat_message(id),
  verdict             text not null check (verdict in ('no_deal', 'forming', 'firm')),
  confidence          text check (confidence in ('low', 'med', 'high')),
  -- normalized identity for dedup (e.g. sorted product names); null on no_deal
  product_key         text,
  draft               jsonb,            -- the proposed deal (DetectDealResult.deal); null on no_deal
  evidence            jsonb,            -- grounded verbatim quotes; GDPR: only on forming|firm
  -- the deal_detected message this run posted/refreshed; null if no_deal or suppressed
  surfaced_message_id uuid references public.chat_message(id) on delete set null,
  created_at          timestamptz not null default now(),
  -- GDPR: a no_deal verdict must never retain verbatim chat quotes
  constraint sella_detection_no_deal_has_no_evidence
    check (not (verdict = 'no_deal' and evidence is not null))
);

-- idempotency: a given thread state (its newest message) is detected at most once
create unique index sella_detection_thread_lastmsg_uniq
  on public.sella_detection (thread_id, last_message_id);

-- fast "latest detection for this thread" lookups (dedup reads the most recent row)
create index sella_detection_thread_created_idx
  on public.sella_detection (thread_id, created_at desc);

-- Background-worker state: the service role writes it, no person reads it directly
-- (the deal_detected MESSAGE is the human-facing view). RLS on with no policies means
-- only service_role / superuser can touch it - intentional, not an oversight.
alter table public.sella_detection enable row level security;

comment on table public.sella_detection is
  'Sella detection memory (4b). One row per run; drives idempotency, dedup, supersession. Not user-visible - the deal_detected chat_message is the human view. GDPR: evidence only on forming|firm rows.';
