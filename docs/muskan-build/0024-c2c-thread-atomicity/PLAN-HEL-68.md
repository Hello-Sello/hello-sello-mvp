# PLAN — HEL-68 / 0024-c2c-thread-atomicity

Written 2026-08-26, `/build` step 2. Single ticket, no T-breakdown. Base sync: no
rebase needed — `origin/dev`'s 3 unique commits are stale merges of earlier states
of this and another branch; `git diff HEAD origin/dev` is net-negative for dev
(dev is missing this branch's dead-code cleanup, nothing dev has is new). Verified
directly with `/usr/bin/git log --oneline origin/dev --not HEAD`, NOT `rtk`'s
wrapper — `rtk git log` silently returned empty for the same query, a live
instance of the HEL-80 trap CLAUDE.md already tracks (rtk collapsing tool output),
now confirmed to hit `git log`, not just test runners.

## §0 — citations, verified live, not inherited from the ADR

- `accept_connection_request`'s live body: `20260825200000_accept_connection_
  request_status_guard.sql`, full function `:33-134`, `REVOKE`/`GRANT` `:136-137`.
- `acceptInbox`: `src/modules/messaging/supabase/store.ts:542-652`. Module
  docstring: `:1-18` (the "mints the relationship + threads + seed lines" claim
  is at `:15`).
- `send_deal`'s resolve-or-create precedent, exact text ported below:
  `20260825180000_send_deal_relationship_liveness_guard.sql:120-194` (p2p arm
  `:120-158`, c2c arm `:159-189`, bare-`ON CONFLICT` rationale `:191-194` —
  corrected from an earlier citation off by ~2 lines, `plan-checker` round 1's
  N7; the substance was already right). Both arms: SELECT first, bare
  `ON CONFLICT DO NOTHING ... RETURNING`, re-SELECT only if RETURNING was NULL.
- `chat_thread` schema verified live: THREE partial unique indexes — `uq_chat_
  thread_c2c` `(relationship_id, type) WHERE type='c2c' AND deleted_at IS NULL`,
  `uq_chat_thread_p2p` `(relationship_id, person_a_id, person_b_id) WHERE
  type='p2p' AND deleted_at IS NULL`, and `uq_chat_thread_p2p_companyless` (not
  this ticket's concern — `accept_person_connection`'s door). **The `deleted_at
  IS NULL` clause on both is load-bearing** (round 2's N3 — an earlier citation
  here dropped it): it's what makes §1's helpers correct, since a soft-deleted
  thread must be healed with a new row (matching `send_deal`'s own precedent),
  not silently block the INSERT while the re-SELECT (which already filters
  `deleted_at is null`) finds nothing. Plus `CHECK (person_a_id < person_b_id)`
  for p2p, `NOT NULL` on both person ids for p2p (a CHECK, not a column
  constraint — `chat_thread_p2p_has_both_people`).
- `rollout.ts`'s three message bodies (verbatim, ported into the migration since
  the file is deleted in this diff): `sellaIntroConnect`/`sellaIntroPricelist`
  (`:150-161`), `connectionEstablished` (`:108-114`).
- Four SQL call sites needing rewrite, plus one comparison needing no change
  because its target column gets renamed by the rewrite above it (round 3's
  N4 — `:132` isn't itself a call site, an earlier count folded it in as a
  fifth one) — plus four `PERFORM` call sites
  needing NO rewrite — `connection_consent_lockdown_test.sql:415,477,727` and
  `accept_connection_request_status_guard_test.sql:85`, all `PERFORM
  public.accept_connection_request(...)`, which discards the return value and
  is legal against a record-returning function unchanged — round 2's N4, named
  for census completeness):
  `connection_consent_lockdown_test.sql:512,574,581` (plpgsql assignments),
  `accept_connection_request_status_guard_test.sql:127` (CTAS — different
  rewrite shape), `:132` (comparison, needs no change once `:127`'s column is
  named `rel_id`).

## §1 — migration 1: the two internal helpers

New file: `<ts>__resolve_or_create_c2c_p2p_thread.sql`.

```sql
create function public._resolve_or_create_c2c_thread(
  p_relationship_id uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$
begin
  created := false;
  select id into thread_id
  from public.chat_thread
  where relationship_id = p_relationship_id and type = 'c2c' and deleted_at is null;

  if thread_id is null then
    insert into public.chat_thread (relationship_id, type)
    values (p_relationship_id, 'c2c')
    on conflict do nothing
    returning id into thread_id;

    if thread_id is null then
      select id into thread_id
      from public.chat_thread
      where relationship_id = p_relationship_id and type = 'c2c' and deleted_at is null;
    else
      created := true;
    end if;
  end if;
end;
$$;

create function public._resolve_or_create_p2p_thread(
  p_relationship_id uuid, p_person_x uuid, p_person_y uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$
declare
  v_a uuid; v_b uuid;
begin
  created := false;
  if p_person_x < p_person_y then v_a := p_person_x; v_b := p_person_y;
  else v_a := p_person_y; v_b := p_person_x; end if;

  select id into thread_id
  from public.chat_thread
  where relationship_id = p_relationship_id and type = 'p2p'
    and person_a_id = v_a and person_b_id = v_b and deleted_at is null;

  if thread_id is null then
    insert into public.chat_thread (relationship_id, type, person_a_id, person_b_id)
    values (p_relationship_id, 'p2p', v_a, v_b)
    on conflict do nothing
    returning id into thread_id;

    if thread_id is null then
      select id into thread_id
      from public.chat_thread
      where relationship_id = p_relationship_id and type = 'p2p'
        and person_a_id = v_a and person_b_id = v_b and deleted_at is null;
    else
      created := true;
    end if;
  end if;
end;
$$;

comment on function public._resolve_or_create_c2c_thread(uuid) is
  'Internal-only (0024/HEL-68). Callable only from accept_connection_request''s '
  'own definer body — no caller-authorization check of its own. Do not GRANT.';
comment on function public._resolve_or_create_p2p_thread(uuid, uuid, uuid) is
  'Internal-only (0024/HEL-68). Callable only from accept_connection_request''s '
  'own definer body — no caller-authorization check of its own. Do not GRANT.';

revoke all on function public._resolve_or_create_c2c_thread(uuid)
  from public, anon, authenticated;
revoke all on function public._resolve_or_create_p2p_thread(uuid, uuid, uuid)
  from public, anon, authenticated;
```
(round 3's N1: `.claude/rules/supabase.md` requires a `COMMENT` on any `REVOKE`
so the next reader doesn't mistake the missing grant for an oversight — this
must be in the actual SQL, not just plan prose.)

**Deliberately NOT `security definer`** (ADR Locked #2) — only ever called from
inside `accept_connection_request`'s own definer body, so they already execute as
that function's owner; a plain function closes the "if the REVOKE is ever undone"
risk for free (neither helper checks caller authorization on its own).

## §2 — migration 2: `accept_connection_request`, `DROP` + `CREATE`

New file: `<ts>_accept_connection_request_atomic_threads.sql`.

Full body is `20260825200000`'s live function (§0), re-emitted VERBATIM through
line `:128` (the mint/adopt block), **then one comment corrected** (`:130-131`,
item 7 below — not verbatim, it names `rollout.ts` which this diff deletes),
**then `RETURN v_rel_id;` at `:132` deleted** — replaced by the OUT-param
return — with:

1. **Signature**: `p_inbox_item_id uuid, OUT relationship_id uuid, OUT
   c2c_thread_id uuid, OUT p2p_thread_id uuid` (nullable), `RETURNS record`.
   **`v_rel_id` is NOT a uniform find-replace to `relationship_id`** (`plan-checker`
   round 1's B1 — a naive rename shadows the OUT param and the RPC silently
   returns `relationship_id = NULL` while still succeeding, since the local
   `DECLARE` would win). There are 9 occurrences total
   (`:45,95,103,104,107,119,123,124,132`); **two are DELETED, not renamed** — the
   `DECLARE v_rel_id uuid;` at `:45`, AND `RETURN v_rel_id;` at `:132` (round 2's
   B1: `RETURN <expr>` is a parse-time error in a function with OUT params —
   `RETURN` must be bare here, the OUT params carry the value). **Seven**
   occurrences rename to `relationship_id`: `:95,103,104,107,119,123,124`,
   including `:104`'s `RAISE EXCEPTION` argument list — a miss there compiles
   fine and only fails at runtime, on the HEL-82
   suspended/ended branch specifically, which is exactly the kind of miss that
   passes a casual read.
2. **`DROP FUNCTION public.accept_connection_request(uuid);` first** — a
   return-type change forbids `CREATE OR REPLACE`. Confirmed safe to drop
   (correcting `plan-checker`'s round-1 N1: an earlier version of this claim said
   the function was never called from SQL outside comments — false,
   `20260823090000_connection_consent_and_verification_lockdown.sql:98,192-193`
   is a real prior `CREATE OR REPLACE` + grants; harmless here because this
   migration's timestamp sorts after it, so replay order is v1 → v2 → this
   drop+v3 — but the evidence for "safe to drop" is timestamp ordering, not
   absence of other definitions).
3. **After the existing body's relationship mint/adopt block** (ends at old
   `:128`; `:130-131`'s corrected comment and the OUT-param return come next),
   append:

```sql
  -- Guard against a NULL OUT param reaching the helpers (round 1's N5) — the
  -- adopt branch's own double-failure path (INSERT conflicts AND the re-SELECT
  -- finds nothing) is the only way relationship_id can still be NULL here.
  -- chat_thread.relationship_id has no NOT NULL, so an unguarded call would
  -- mint an orphan thread with no error, rather than raising loudly.
  if relationship_id is null then
    raise exception 'accept_connection_request: relationship resolution failed';
  end if;

  -- Note (round 3's N3, not guarded — near-unreachable, named not fixed): the
  -- SAME double-failure shape can happen one level down, inside either helper
  -- (its own SELECT misses, INSERT conflicts, re-SELECT also misses — needs a
  -- concurrent soft-delete of the thread mid-call). That returns
  -- thread_id = NULL, created = false; the `if v_created` gates below correctly
  -- skip the seed-line insert, so nothing raises — but c2c_thread_id/
  -- p2p_thread_id come back NULL and §3's `.filter(Boolean)` drops them
  -- silently: a successful accept with no thread and no error. send_deal
  -- reasons about this identical case by name (20260825180000:196-201);
  -- reachability here is near-zero (no app path soft-deletes a chat_thread),
  -- so this is accepted, not fixed.

  -- Name composition — the only place these joins happen once rollout.ts is
  -- deleted. v_own already resolved above (existing body). Sender company comes
  -- from the INBOX ITEM's sender_company_id (already loaded into v_item, NOT
  -- NULL on the table), matching inbox.ts:272-282's own source exactly — NOT
  -- from person.company_id (round 1's N3: that column is nullable, and a NULL
  -- there would concatenate to a NULL body and hit chat_message.body's NOT NULL,
  -- rolling back the whole accept; it can also just be the wrong company if the
  -- sender has since changed employers).
  select (p.first_name || ' ' || p.last_name) into v_sender_person_name
  from public.person p where p.id = v_item.sender_person_id;
  select name into v_sender_company_name from public.company where id = v_item.sender_company_id;
  select name into v_own_company_name from public.company where id = v_own;

  select thread_id, created into c2c_thread_id, v_created
    from public._resolve_or_create_c2c_thread(relationship_id);
  if v_created then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
    values (c2c_thread_id, 'system', null, 'connection_established',
            v_own_company_name || ' and ' || v_sender_company_name || ' are now connected.',
            clock_timestamp());
  end if;

  if v_item.type in ('connect_message', 'pricelist_request') then
    select thread_id, created into p2p_thread_id, v_created
      from public._resolve_or_create_p2p_thread(relationship_id, v_uid, v_item.sender_person_id);
    if v_created then
      select (p.first_name || ' ' || p.last_name) into v_viewer_person_name
      from public.person p where p.id = v_uid;

      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
      values (
        p2p_thread_id, 'sella', null, 'intro',
        case v_item.type
          when 'connect_message' then
            v_sender_person_name || ' from ' || v_sender_company_name || ' wants to connect with ' ||
            v_viewer_person_name || ' from ' || v_own_company_name || '. Their note is below - take it from here.'
          when 'pricelist_request' then
            v_sender_person_name || ' from ' || v_sender_company_name || ' is asking ' ||
            v_viewer_person_name || ' (' || v_own_company_name || ') for a price list. Over to you both.'
        end,
        clock_timestamp());

      -- btrim over the ASCII whitespace set, not plain trim (round 1's N4): SQL
      -- trim() strips SPACES only, JS .trim() strips all whitespace — a note of
      -- just "\n\t" is falsy in rollout.ts's input.note?.trim() (skipped) but
      -- would be truthy under plain trim(). NOT full JS parity (JS also strips
      -- NBSP/BOM/Unicode separators; out of scope here). v_note computed once,
      -- matching the ADR's own local name.
      -- round 2's B2: \v is NOT a valid Postgres string escape (Postgres only
      -- recognizes \b\f\n\r\t + octal/hex/unicode; an unrecognized escape is
      -- taken LITERALLY) — E'...\v' would silently put the LETTER "v" in the
      -- trim set (corrupting any note starting/ending with "v") while never
      -- actually stripping a real vertical tab. \x0B is the correct hex escape.
      v_note := btrim(v_item.note, E' \t\n\r\f\x0B');
      if v_item.type = 'connect_message' and v_note is not null and v_note <> '' then
        insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
        values (p2p_thread_id, 'person', v_item.sender_person_id, 'message', v_note, clock_timestamp());
      end if;
    end if;
  end if;

  RETURN;
END;
$$;
```

4. New locals to declare: `v_created boolean; v_sender_person_name text;
   v_sender_company_name text; v_own_company_name text; v_viewer_person_name text;
   v_note text;`
5. **`REVOKE`/`GRANT` tail re-emitted** exactly as the live migration's `:136-137`
   — a `DROP` takes grants with it, this is not optional.
6. **Comment header** must state which live migration this re-emits VERBATIM from
   (`.claude/rules/supabase.md`'s rule) — name `20260825200000` by timestamp,
   not a paraphrase.
7. **One SQL comment inside the verbatim-re-emitted range is now wrong and must
   be corrected, not carried over silently** (round 2's N5): `20260825200000
   :130-131`'s *"connect.acceptItem owns that table and flips it after the
   rollout returns"* — `rollout.ts` is deleted in this diff. Reword to drop the
   "rollout" reference; the underlying fact (this function doesn't flip the
   inbox item's status) stays true.
8. **The `sella_enqueue_detection` trigger now fires inside the accept
   transaction, not a separate later one** (round 2's N7): it matches
   `sender='person' AND type='message'` on a p2p thread — exactly the requester's
   note insert this migration adds. Previously that insert was a separate
   browser-issued statement; now a `pgmq.send` failure inside the trigger would
   roll back the ENTIRE accept, not just the note. Not a reason to change the
   design (the transactional guarantee is the point, per Invariant 7) — named so
   `builder`/`security` don't discover it cold. **Applies to the two EXISTING
   test suites too, not just the new one** (round 3's N5 — an earlier draft
   named only the new suite): `connection_consent_lockdown_test.sql:581` and
   `accept_connection_request_status_guard_test.sql:127` will now fire this
   trigger too, if their fixture items are `connect_message` with a note. Passes
   on a fresh `db reset` (the queue exists from `20260612130000`) — named so a
   future edit to either fixture doesn't silently start depending on `pgmq`
   without anyone noticing why.
9. **Message ordering is weaker than what it replaces, not equivalent — say so**
   (round 3's N6). The deleted browser code staggered `created_at` by a
   constructed 100ms gap (`store.ts:644`, `base + ti*1_000 + mi*100`); the new
   SQL relies on two `clock_timestamp()` calls landing in different
   microseconds. Practically reliable, not a designed guarantee — Invariant 8's
   test should be written knowing the margin shrank from 100ms to sub-ms, not
   described as equally deterministic.

## §3 — browser: `acceptInbox` rewrite + `planRollout` deletion

`src/modules/messaging/supabase/store.ts`:
- `acceptInbox` (`:542-652`) loses the ENTIRE thread/message insert loop
  (`:594-649`). New body: call the RPC, defensively unwrap
  (`Array.isArray(data) ? data[0] : data`, matching `confirmDetectedDeal`'s
  pattern in `src/modules/deals/actions.ts:335`), return
  `{ relationshipId, threadIds: [c2c_thread_id, p2p_thread_id].filter(Boolean) }`
  to preserve the existing return shape (`threadIds: string[]`). **`acceptInbox`
  has exactly ONE caller** (`src/modules/connect/supabase/inbox.ts:290`, plus a
  barrel re-export at `messaging/index.ts:22` — round 2's N1 correction to an
  earlier draft's "two other callers" claim), and that caller destructures only
  `{ relationshipId }` — `threadIds` has zero consumers anywhere in the repo.
  Preserving the shape is free, not load-bearing; keep it anyway for the
  idempotent-early-return branch (`:554-559`, untouched) which already returns
  this same shape.
- The `deal_card` branch (`:566-578`) is untouched — different RPC entirely.
- Delete the `planRollout` import (`:24` in the current file — re-check after the
  above edit, line numbers shift) and `src/modules/messaging/lib/rollout.ts`
  itself, plus its call site's now-dead surrounding code. **No separate test
  file exists for it** (verified: repo-wide grep for
  `planRollout|RolloutPlan|SeedMessageSpec|ThreadSpec` returns only `rollout.ts`
  and `store.ts` — ADR's earlier assumption of a `rollout.test.ts` was wrong,
  corrected at design time).
- The generated TS type is WRONG, not absent: `src/types/database.types.ts:4643-
  4646` still says `Returns: string` for `accept_connection_request` — the RPC
  call needs the `"..." as never` cast bridge (matching `create_group_thread`'s
  and `confirm_detected_deal`'s equivalent OUT-param calls) until types
  regenerate.

## §4 — stale comments to correct in this diff

- `store.ts:15` — module docstring's "acceptInbox mints the relationship +
  threads + seed lines" (now the RPC does).
- `store.ts:352-356` — `resolveC2cThread`'s docstring (PRD AC5, the disproven
  "minted on every accept via planRollout" claim).
- `src/modules/messaging/types.ts:306` — "which rollout to run," goes stale with
  `planRollout`'s deletion. **`:264` documents `AcceptRequestType`, which
  survives and still drives the RPC's branch — do NOT touch it** (`plan-checker`
  round 1's N7 correction to an earlier draft here).
- `src/modules/messaging/types.ts:297-302` — `AcceptInput`'s own docstring
  ("mint relationship + threads + seed lines") also goes stale (round 1's N10,
  missed in an earlier draft) — most of `AcceptInput`'s fields
  (`ownCompany`/`senderCompany`/`viewerPerson`/`senderPerson`/`note`) are no
  longer read by `acceptInbox` itself after this diff; they survive only because
  `inbox.ts:324-334` reuses the same locals for the separate `sella-intro` edge
  function invoke. Correct the docstring to say so, don't just delete the fields
  — they're still live, just for a different caller.
- **NOT stale, leave as-is**: `store.ts:525-540`'s "does NOT touch the inbox
  item status" (still true), `src/modules/connect/supabase/inbox.ts:260-262`
  (still true), `supabase/functions/sella-intro/index.ts:8` (not worth its own
  diff).

## §5 — five SQL test call sites (verified NOT the same rewrite shape)

- `connection_consent_lockdown_test.sql:512,574,581` — plain assignments
  (`v_rel_id := public.accept_connection_request(...)`). Rewrite each as
  `SELECT relationship_id INTO v_rel_id FROM public.accept_connection_request(...)`.
- `accept_connection_request_status_guard_test.sql:127` — a CTAS, NOT an
  assignment: `CREATE TEMP TABLE _accepted ON COMMIT DROP AS SELECT
  public.accept_connection_request(...) AS rel_id`. Rewrite as `... AS SELECT
  relationship_id AS rel_id FROM public.accept_connection_request(...)`. `:132`'s
  comparison needs no change once the column is correctly named `rel_id`.
- `connection_consent_lockdown_test.sql:727-732` asserts `anon` cannot call the
  function — must still pass unchanged (the new signature keeps the same
  `REVOKE`/`GRANT` shape).
**New tests, homed and given a runner** (`plan-checker` round 1's N8 — an earlier
draft named the tests owed but not their file):
- **Deny-tests** for the two helpers (call each of
  `_resolve_or_create_c2c_thread`/`_resolve_or_create_p2p_thread` directly as
  `anon` and as `authenticated`, assert `42501`) join the existing suite
  `supabase/tests/accept_connection_request_status_guard_test.sql`, which
  already has a runner (`run_accept_connection_request_status_guard_test.sh`) —
  no new runner needed.
- **The five invariant tests** (fresh accept → c2c thread exists, AC1;
  person-addressed accept → p2p thread + correct type-specific intro text, AC2;
  duplicate accept on an adopted pair → no second thread/seed line, AC3; message
  ordering — intro's `created_at` sorts before the note's, for a
  `connect_message` accept, Invariant 8; the note-whitespace cases from N4
  above) join the same suite.
- **`resolveC2cThread`'s docstring no longer asserts the disproven claim** (AC5)
  — a `test-writer`/`critic` review check, not a runnable SQL assertion.
- **`e2e/inbox-accept.spec.ts` must be run deliberately, not incidentally**
  (`plan-checker` round 1's N9 — ADR 0007 named this as the one existing e2e
  guard on this invariant and an earlier plan draft dropped the pointer). It's
  the adopt-path proof: `countThreadsForPair("c2c") === 1` (`:157`),
  `countConnectionEstablishedLines()` unchanged (`:158`),
  `countThreadsForPair("p2p") === 1` (`:167`) after a `pricelist_request` accept
  on an already-connected pair — should pass unmodified under the new SQL (the
  helper returns `created=false` for the already-seeded c2c thread), but is the
  only end-to-end proof of AC3 and must be included in the `test-runner` pass,
  not just the new SQL suite additions.

## §6 — round 1 `plan-checker` findings, addressed above

One blocking (B1, the `v_rel_id`/`relationship_id` shadowing bug — fixed in §2)
and ten notes, all folded in: the wrong `DROP`-safety citation (N1, corrected in
§2), `acceptInbox`'s actual single caller (`inbox.ts:290`, confirmed —
`threadIds` has zero consumers anywhere, so the return-shape preservation is
free but N2's point stands: the plan's earlier G4-routing justification cited an
uncensused claim, now grounded), the sender-company-name source bug (N3, fixed
in §2), the whitespace-trim mismatch (N4, fixed in §2), the orphan-thread guard
(N5, added in §2), the `chat_thread` unique-index `deleted_at IS NULL` clause
that makes the helpers correct (N6 — already present in §1's SQL, just missing
from §0's prose citation, corrected above), the `send_deal` line-citation drift
(N7, fixed in §0), the new-tests' missing home (N8, fixed above), the dropped
`e2e/inbox-accept.spec.ts` pointer (N9, restored above), and `AcceptInput`'s
stale docstring (N10, added to §4). `rollout.ts`'s safe-to-delete claim, the
`chat_message` NOT NULL column coverage, and the five-SQL-call-site census were
all independently re-verified by the checker and confirmed correct as written.
Invariant 8 (message ordering) confirmed testable: `chat_message` reads sort on
`created_at` alone with no id tiebreaker (`store.ts:104,:283`), and
`clock_timestamp()`'s µs resolution makes a tie between the intro and note
inserts deterministically observable.

## §7 — acceptance criteria this plan closes

PRD AC1-AC5, all five. G4 routing: backend-only (no rendered component touched —
`acceptInbox`'s callers consume its return shape, which is preserved) → should
auto-close per PIPELINE §3 unless `security` (mandatory here — this touches
RLS-adjacent RPC/grants) raises a blocking finding, or behavior diverges from
these five ACs.
