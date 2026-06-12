-- Sella 4b, step 4: the durable auto-trigger for detection.
--
-- Chain: a new PERSON message on a p2p thread -> enqueue {thread_id} on a pgmq queue
-- -> a pg_cron worker (every 10s) reads the queue, dedups thread ids, and pg_net-POSTs
-- each to the sella-detect Edge Function -> deletes the handled jobs.
--
-- Why a queue + cron instead of a raw pg_net webhook: pg_net does not retry, so a raw
-- webhook is fire-and-hope. pgmq holds the job durably; the worker only deletes it after
-- dispatch. With step 3's idempotency guard (a re-run on an unchanged thread skips before
-- the model), the chain is at-least-once and self-healing - a lost detection re-queues on
-- the next person message and the re-run is safe + cheap.
--
-- Scope: only `type='p2p'` threads (buyer/seller negotiation). `deal` workspace threads
-- and `c2c` company threads are intentionally excluded - a born card runs its own flow.

create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the durable work queue
select pgmq.create('sella_detect');

-- the public project URL (NOT a secret) for the cron->edge call. The anon key is seeded
-- into Vault out-of-band (see the deploy note) so it never lives in a committed file.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      'https://byipusuthdlskdxoexkt.supabase.co', 'project_url', 'Supabase project URL for cron edge-function calls'
    );
  end if;
end $$;

-- 1. ENQUEUE: a person message on a p2p thread drops a detection job onto the queue.
create or replace function public.sella_enqueue_detection()
returns trigger
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  if NEW.sender = 'person'
     and NEW.type = 'message'
     and NEW.deleted_at is null
     and exists (
       select 1 from public.chat_thread t
       where t.id = NEW.thread_id and t.type = 'p2p'
     )
  then
    perform pgmq.send('sella_detect', jsonb_build_object('thread_id', NEW.thread_id));
  end if;
  return NEW;
end;
$$;

drop trigger if exists sella_enqueue_detection_after_insert on public.chat_message;
create trigger sella_enqueue_detection_after_insert
after insert on public.chat_message
for each row
execute function public.sella_enqueue_detection();

-- 2. WORKER: read a batch, dedup thread ids, POST each to sella-detect, clear the batch.
create or replace function public.sella_detect_worker()
returns void
language plpgsql
security definer
set search_path = public, pgmq, net, vault
as $$
declare
  v_url  text;
  v_key  text;
  v_msg  record;
  v_thread uuid;
  v_seen uuid[] := '{}';
  v_ids  bigint[] := '{}';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_anon_key';
  if v_url is null or v_key is null then
    raise warning 'sella_detect_worker: missing vault secret(s) project_url/edge_anon_key';
    return;
  end if;

  -- visibility timeout 60s: if the worker dies mid-batch the jobs re-surface and re-run
  -- (idempotency makes the re-run safe).
  for v_msg in select * from pgmq.read('sella_detect', 60, 20) loop
    v_ids := array_append(v_ids, v_msg.msg_id);
    v_thread := (v_msg.message->>'thread_id')::uuid;
    if v_thread is not null and not (v_thread = any (v_seen)) then
      v_seen := array_append(v_seen, v_thread);
      perform net.http_post(
        url     := v_url || '/functions/v1/sella-detect',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('thread_id', v_thread),
        timeout_milliseconds := 20000
      );
    end if;
  end loop;

  if array_length(v_ids, 1) is not null then
    perform pgmq.delete('sella_detect', v_ids);
  end if;
end;
$$;

-- 3. SCHEDULE: run the worker every 10s (Realtime delivers the message the instant it lands).
do $$
begin
  perform cron.unschedule('sella-detect-worker');
exception when others then null;  -- not scheduled yet
end $$;
select cron.schedule('sella-detect-worker', '10 seconds', $$select public.sella_detect_worker();$$);

-- 4. PRE-WARM: a daily ping (06:00 UTC) keeps the structured-output grammar compiled, so
-- the first real detection of the day is not cold (~7s compile, cached ~24h). It hits the
-- edge function's `warm` path, which touches no thread and writes nothing.
do $$
begin
  perform cron.unschedule('sella-grammar-prewarm');
exception when others then null;
end $$;
select cron.schedule('sella-grammar-prewarm', '0 6 * * *', $prewarm$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sella-detect',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_anon_key')
    ),
    body := jsonb_build_object('warm', true),
    timeout_milliseconds := 20000
  );
$prewarm$);
