# 0026 relationship-write-gate — research

## Approaches (design)

### 1 · Dedupe the RPC list — the census's ~12 migration files, resolved to live bodies

The STATE.md census (`docs/muskan-build/0026-relationship-write-gate/STATE.md`, "Census (L-037)")
flagged migrations matching `insert into chat_message` and named the dedup as open `/design` work.
I read every flagged file and every later `create or replace`/`drop+create` on the same function
name, in timestamp order, to find the LIVE body of each. Three of the originally-flagged files
(`20260720130000`, `20260722100000`, `20260724121200`) turned out to be false positives — they
insert into `chat_message_type` (the lookup table), not `chat_message`; the grep matched on the
substring. Confirmed via targeted grep, no `insert into chat_message` in any of the three.

**Live function bodies, by name, oldest→newest chain:**

| Function | Migration chain (oldest → live) | Live definition |
|---|---|---|
| `create_deal_draft` | `20260611150000` → `20260612011145` → `20260618120200` → `20260618130200` → `20260618140000` → `20260720100100` → **`20260724120200`** | `supabase/migrations/20260724120200_create_deal_draft_private_birth.sql:39-190` |
| `confirm_deal_change` | `20260616120200` → `20260617120000` → `20260617140050` → `20260618120110` → `20260618130100` → `20260618140000` → `20260707130300` → **`20260724120100`** | `supabase/migrations/20260724120100_confirm_deal_change_negotiation_membership.sql:39-336` |
| `send_deal` | `20260724120300` → `20260825090000` → **`20260825180000`** | `supabase/migrations/20260825180000_send_deal_relationship_liveness_guard.sql:33-235` |
| `confirm_detected_deal` | `20260724120400` → **`20260825190000`** | `supabase/migrations/20260825190000_confirm_detected_deal_liveness_guard.sql:31-208` |
| `propose_deal` | **`20260614121000`** (only version) | `supabase/migrations/20260614121000_propose_deal_rpc.sql:26-85` |
| `deliver_deal` | **`20260720095000`** (only body version; `20260724121000` only revokes EXECUTE, doesn't touch the body) | `supabase/migrations/20260720095000_deliver_deal.sql:30-57` |

**Two corrections this dedup surfaces that the census language didn't have yet:**

1. **`create_deal_draft` should come OFF the call-site list entirely.** The census described it as
   "create_deal_draft_rpc (+ its notes/delivers/retire-private-box/two-owner variants)" — that
   description is now stale. `20260724120200_create_deal_draft_private_birth.sql` (header, lines
   1-37) deliberately made birth private: it **deletes** the `perform public.deliver_deal(v_card)`
   call the `20260720100100` migration had added, and **deletes** the `chat_thread`/
   `workspace_created` message insert entirely (item (c), lines 18-22). The live `create_deal_draft`
   (`:39-190`) touches neither `chat_message` nor `pending_inbox_item` — it only writes `deal_card`,
   `deal_line_item`, `deal_workspace`, `deal_member` (creator only), and `deal_card_log`. This is
   now byte-for-byte consistent with HEL-74's original reasoning ("births a PRIVATE draft the
   counterparty can't see yet — nothing has actually reached them",
   `20260825180000_send_deal_relationship_liveness_guard.sql:20-21`) — it just wasn't true of the
   code at the time HEL-74's header was written, and is now.
2. **`deliver_deal` has only two live callers**, both already inline-gated: `send_deal`
   (`20260825180000:107`) and `confirm_detected_deal`'s company-target branch
   (`20260825190000:193`). `deliver_deal` itself has had client `EXECUTE` revoked since
   `20260724121000_revoke_deliver_deal_execute.sql:30` — it is unreachable except nested inside
   another `SECURITY DEFINER` function. So today's exposure surface for `deliver_deal` is
   transitively covered by its two callers' own checks; gating it directly (PRD FR5) is not closing
   a live hole today, but it is the correct place to put the invariant so a **third** future caller
   doesn't reopen it silently — the PRD's own edge-case row 4 anticipates exactly this.

**Deduplicated result: 4 distinct functions need a NEW call, 2 already-gated functions are
candidates for a REFACTOR (not a new gate), 2 RLS policies need a WITH CHECK term, and 1
`create_deal_draft` needs nothing.** Full list in Recommendation.

### 2 · The existing liveness-guard precedent — read in full

`supabase/migrations/20260825180000_send_deal_relationship_liveness_guard.sql:69-81` and
`supabase/migrations/20260825190000_confirm_detected_deal_liveness_guard.sql:106-119` both write
the **identical** check, duplicated inline, not routed through any shared function:

```sql
select status into v_rel_status
from public.relationship
where id = v_card.relationship_id and deleted_at is null;
if v_rel_status is null then
  raise exception '<fn>: relationship not found';
end if;
if v_rel_status <> 'active' then
  raise exception '<fn>: relationship is % — no new deals can be sent/born', v_rel_status;
end if;
```

Confirmed: **no shared function exists today.** Grepping `supabase/migrations/` for
`create.*function.*assert_relationship` or any prior `relationship_writable`/`relationship_is_live`
helper returns nothing. This is exactly the drift risk this ticket's PRD warns against — "Must
follow L-057's rule: import the check via a function call from each site, never re-derive/re-type
the predicate inline per RPC."

**Recommendation: extract, and refactor both existing callers to use the extraction.** The PRD's
task framing (#2 in the brief) already treats this as in-scope, not optional — do both:
- Write `assert_relationship_writable` once (new migration).
- Re-emit `send_deal` and `confirm_detected_deal`'s live bodies, replacing their inline
  `v_rel_status` blocks with `perform public.assert_relationship_writable(v_card.relationship_id)`
  / `perform public.assert_relationship_writable(v_rel)` respectively. Same pattern this repo
  already uses for every other "re-emit VERBATIM + one delta" migration (see `20260724120100`'s own
  header, lines 12-16, doing exactly this move for a different delta).

Out-of-scope alternative (not recommended, noted for completeness): leave the two inline checks as
duplicated and just add the new function elsewhere. Rejected — it directly contradicts L-057, which
the PRD already cites as a hard constraint, not a suggestion.

### 3 · RLS `WITH CHECK` calling a `SECURITY DEFINER` function — published guidance + local precedent

**Published guidance**, current (2026):
- PostgreSQL's own RLS docs and the Supabase RLS guide both treat a `STABLE`, `SECURITY DEFINER`
  helper function as the standard mechanism for a policy that needs a fact about a row the caller
  cannot otherwise see — this is not an edge case, it's the documented pattern.
- Supabase's own troubleshooting doc and community writeups (Bytebase, SupaExplorer, makerkit)
  converge on the same rule set: the function must be `STABLE` (lets Postgres cache/reuse the
  result via an initPlan instead of re-evaluating per row), must pin `SET search_path = ''` and
  schema-qualify every identifier inside it (prevents a caller from shadowing an unqualified name),
  and — if it's reachable from the exposed API schema — must do its own authorization inside the
  function body rather than assuming RLS will catch it, since `SECURITY DEFINER` bypasses RLS by
  definition.
- Performance tip specific to this shape: wrapping the call as `(select public.fn(...))` inside the
  policy expression lets the planner treat it as a single initPlan rather than re-running per row.
  **This repo's own precedent does NOT do this** — `company_can_receive_requests` is called
  unwrapped: `inbox_insert` `WITH CHECK (... OR public.company_can_receive_requests(receiver_company_id))`
  (`20260825130000_inbox_insert_receiver_gate.sql:121`). Flagging as a known available optimization,
  not a blocker — consistency with the existing unwrapped style is the safer default unless a
  measured perf problem shows up.

**This repo's own precedent, already shipped, is exactly this shape.**
`supabase/migrations/20260825130000_inbox_insert_receiver_gate.sql:76-97` defines
`company_can_receive_requests(p_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY
DEFINER SET search_path = ''`, called directly inside `ALTER POLICY inbox_insert ... WITH CHECK
(... OR public.company_can_receive_requests(receiver_company_id))` at line 121. The migration's own
header (lines 20-40) explains WHY it must be a definer and not an inline `EXISTS`: an inline
subquery against `company` would run under the CALLER's RLS on `company`, and a company the caller
has never connected to is invisible to them — so the inline form would silently invert the rule.
This is this repo's second implementation of the same shape (`product_visible_to_caller`, cited in
the same header, is the first).

**L-055, read in full**: the mechanism is specifically about an inline **subquery/EXISTS/IN against
another table** inside a policy expression — that subquery runs under the *caller's* RLS context on
the referenced table, so it silently answers "does this row exist AND may I see it" instead of
"does this row exist." **This does not apply to a plain function CALL to a `SECURITY DEFINER`
function.** L-055's own fix section says so directly: "The fix is a SECURITY DEFINER helper... if a
policy needs a fact about a row the caller is not entitled to read, that fact must come from a
definer function." A `SECURITY DEFINER` function's *internal* queries run as the function owner,
bypassing RLS on whatever it touches internally — that is precisely why it is the escape hatch from
the L-055 trap, not another instance of it.

**One real technical correction to the PRD's I/O section.** The PRD specifies
`assert_relationship_writable(p_relationship_id uuid) RETURNS void`. A `void`-returning function
**cannot** be used inside `WITH CHECK (...)` — Postgres requires the whole `WITH CHECK` expression
to type as `boolean`; a `void` term is a type error at `ALTER POLICY` time, not a runtime failure.
This works fine for the RPC call sites (`perform public.assert_relationship_writable(...)` discards
any return value and only cares about the RAISE), but it cannot compile into `msg_all` or
`inbox_insert`'s `WITH CHECK`. **Fix: declare it `RETURNS boolean`, always `return true` on success,
`RAISE EXCEPTION` on failure (never returns `false`).** This is directly precedented —
`company_can_receive_requests` is exactly this shape and is called unwrapped as a boolean term
inside `WITH CHECK` (`20260825130000:114-123`) — and it still works via `perform` in a plpgsql body
the same as a `void` function would, since `perform` discards whatever is returned. One function
signature serves both call shapes; the PRD's `void` needs updating before `/build`.

### 4 · Where the function lives — this repo's convention

Confirmed pattern, three generations of it:
- `is_relationship_member`, `can_access_thread`, `card_relationship_member`,
  `is_workspace_member`, `can_access_workspace` — all defined in the original foundational RLS
  migration, `supabase/migrations/20260607170000_rls_policies.sql:91-139`, one function per
  `CREATE OR REPLACE FUNCTION`, `RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET
  search_path = public` (older convention — `public`, not `''`).
- `product_visible_to_caller` — first defined `20260823100000_basket_admission.sql:121`,
  re-emitted in `supabase/migrations/20260825110000_deactivated_company_gate.sql:74-97`, same
  shape but the newer `SET search_path = ''` (not `public`) — matches the current published
  Supabase guidance found in research step 3.
- `company_can_receive_requests` — new function AND its one caller's `ALTER POLICY` wired in the
  **same** migration file, `20260825130000_inbox_insert_receiver_gate.sql` (function at lines
  76-109, grant/revoke at 106-109, the policy alter at 111-123).

**Convention for a NEW shared predicate/assertion function that guards exactly one policy or one
family of call sites: a dedicated migration file, named after what it gates, containing the
function definition + its `GRANT`/`REVOKE` pair.** Every RPC-body re-emit that consumes it gets its
own separate migration (see `20260825180000`/`20260825190000` — one file per RPC, not a combined
file), because a `plpgsql` function body change is always a full re-emit, never a partial edit, and
this repo's practice is one migration = one diffable unit with its own header explaining the delta.

### 5 · `deliver_deal` — exact insertion point

Read in full: `supabase/migrations/20260720095000_deliver_deal.sql:30-57`.

```sql
create or replace function public.deliver_deal(p_deal_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rel uuid; v_initiator uuid; v_creator uuid;
        v_a uuid; v_b uuid; v_receiver uuid; v_has_coowner boolean;
begin
  select relationship_id, initiating_company_id, created_by
    into v_rel, v_initiator, v_creator from public.deal_card where id = p_deal_card_id;
  if v_rel is null then return; end if;                      -- line 37

  -- <<< INSERT HERE: perform public.assert_relationship_writable(v_rel); >>>

  select exists (                                             -- line 41, first read w/ no side effect
    select 1 from public.deal_member dm
    ...
  ) into v_has_coowner;
  if v_has_coowner then return; end if;                       -- line 46

  select company_a_id, company_b_id into v_a, v_b from public.relationship where id = v_rel;
  v_receiver := case when v_initiator = v_a then v_b else v_a end;
  if not exists (select 1 from public.pending_inbox_item ...) then
    insert into public.pending_inbox_item (...) values (...); -- line 51-56, THE side effect
  end if;
end; $$;
```

The only side effect in this function is the `pending_inbox_item` INSERT at lines 51-56. The check
must land **after** `v_rel` is resolved (line 36, needs the value) and **before** the co-owner probe
at line 41 — inserting it immediately after the `if v_rel is null then return; end if;` guard (line
37) is the earliest point that has what it needs and fires before any read or write that matters.
Placing it any later (e.g., after the co-owner check) would let a suspended-relationship,
person-target call still run the co-owner `SELECT` — harmless, but there's no reason to do
unnecessary work before the gate.

---

## Recommendation

### Function

```sql
create or replace function public.assert_relationship_writable(p_relationship_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.relationship
  where id = p_relationship_id and deleted_at is null;

  if v_status is null then
    raise exception 'assert_relationship_writable: relationship not found';
  end if;

  if v_status <> 'active' then
    raise exception 'assert_relationship_writable: relationship is % — no new writes', v_status;
  end if;

  return true;
end;
$$;

comment on function public.assert_relationship_writable(uuid) is
  'Single owner of "is this relationship open for NEW writes" (0026 / HEL-84). Returns true or '
  'raises — usable both as a boolean WITH CHECK term and via perform in a definer RPC. Does not '
  'touch is_relationship_member() or any read-side rule; historical reads stay open regardless of '
  'status. Mirrors the liveness check first shipped inline in send_deal/confirm_detected_deal '
  '(HEL-74) — this is that check, extracted to a single owner.';

revoke execute on function public.assert_relationship_writable(uuid) from public, anon;
grant  execute on function public.assert_relationship_writable(uuid) to authenticated;
```

`RETURNS boolean`, not `void` (correction to the PRD's I/O section — see Approaches §3): a
`void`-typed function cannot appear inside a `WITH CHECK` boolean expression, and this signature
serves both the two RLS policies and the RPC bodies with one definition. `plpgsql` (not `sql`,
unlike `is_relationship_member`) because it needs `RAISE EXCEPTION ... %` message formatting.

### Deduplicated call sites `/build` must touch

**A · Two RLS policies (client-side write doors), new WITH CHECK term:**

| Policy | File:line (current live WITH CHECK) | Change |
|---|---|---|
| `msg_all` on `chat_message` | `supabase/migrations/20260825120000_msg_all_deal_detected_gate.sql:77-83` | `ALTER POLICY msg_all ... WITH CHECK (public.can_access_thread(thread_id) AND type <> 'deal_detected' AND public.assert_relationship_writable((select relationship_id from public.chat_thread where id = thread_id)))` |
| `inbox_insert` on `pending_inbox_item` | `supabase/migrations/20260825130000_inbox_insert_receiver_gate.sql:114-123` | Add `AND public.assert_relationship_writable(relationship_id)` if `pending_inbox_item` carries the relationship directly, else derive it the same way as `msg_all` — **confirm the column exists before writing this; not verified in this pass** |

**B · Refactor (already gated — extract inline check to the shared function, per L-057 + PRD task #2):**

| Function | Live definition | Change |
|---|---|---|
| `send_deal` | `supabase/migrations/20260825180000_send_deal_relationship_liveness_guard.sql:33-235`, inline check at `:69-81` | Replace the inline block with `perform public.assert_relationship_writable(v_card.relationship_id);` |
| `confirm_detected_deal` | `supabase/migrations/20260825190000_confirm_detected_deal_liveness_guard.sql:31-208`, inline check at `:106-119` | Replace the inline block with `perform public.assert_relationship_writable(v_rel);` |

**C · New gate (currently zero relationship-liveness check):**

| Function | Live definition | Insertion point |
|---|---|---|
| `deliver_deal` | `supabase/migrations/20260720095000_deliver_deal.sql:30-57` | Immediately after `if v_rel is null then return; end if;` (line 37), before the co-owner probe (line 41) |
| `propose_deal` | `supabase/migrations/20260614121000_propose_deal_rpc.sql:26-85` | After the participant-membership check (lines 55-57), before the `chat_message` insert (line 66) |

**D · Excluded, with reason:**

| Function | Reason |
|---|---|
| `create_deal_draft` | Live body (`20260724120200_create_deal_draft_private_birth.sql:39-190`) writes neither `chat_message` nor `pending_inbox_item` — birth is fully private since this migration; nothing here reaches the counterparty. Do not gate. |

**E · Open, needs a product ruling before a migration is written (flagging per instructions, not
resolving):**

| Function | Why it's ambiguous |
|---|---|
| `confirm_deal_change` | Live body (`20260724120100_confirm_deal_change_negotiation_membership.sql:39-336`) inserts NEW `chat_message` rows on decline/accept of a held change (`:155-166`, `:316-327`) — literally a "new row" per PRD FR4's letter. But this operates on a deal that was already sent while the relationship WAS active; HEL-74's own header explicitly punted this exact question as "a genuine product call, not an engineering one" (`20260825180000:21-26`). The PRD's AC1-AC4 test chat-post, pricing-request, and `deliver_deal` — none test held-change resolution. Recommend surfacing to Muskan as the same question HEL-74 deferred, not silently deciding it here. |

### Migration filenames — following this repo's one-unit-per-file convention (Approaches §4)

```
<ts>_assert_relationship_writable.sql               -- the function, GRANT/REVOKE
<ts>_msg_all_relationship_write_gate.sql             -- ALTER POLICY msg_all
<ts>_inbox_insert_relationship_write_gate.sql        -- ALTER POLICY inbox_insert
<ts>_deliver_deal_relationship_write_gate.sql        -- re-emit deliver_deal + the new perform call
<ts>_propose_deal_relationship_write_gate.sql        -- re-emit propose_deal + the new perform call
<ts>_send_deal_relationship_write_gate_refactor.sql  -- re-emit send_deal, inline check -> shared fn
<ts>_confirm_detected_deal_relationship_write_gate_refactor.sql  -- same, for confirm_detected_deal
```

`<ts>_confirm_deal_change_relationship_write_gate.sql` stays unwritten pending the open ruling
(row E above).

### Uncertainty flagged, not resolved

- `pending_inbox_item`'s exact column shape for deriving `relationship_id` in the `inbox_insert`
  WITH CHECK wasn't verified in this pass — the table wasn't read directly, only its policy. Check
  where `pending_inbox_item` is defined for whether `relationship_id` exists directly on the row or
  must be derived from `sender_company_id`/`receiver_company_id` before writing the WITH CHECK term.
- The `confirm_deal_change` scope question (row E) is a real open product decision, not an
  engineering gap — do not let `/build` default to either "gate it" or "skip it" without an
  explicit ruling, since the PRD's own text points both ways depending on which sentence you read.
