# ADR 0008 — block new writes on a suspended/ended relationship

**Status:** Accepted — approved at G3 (Muskan, 2026-08-26)
**Slug:** 0026-relationship-write-gate · **Ticket:** HEL-84
**Date:** 2026-08-26

## In plain English

A compliance operator can now suspend a relationship between two companies (shipped
2026-08-25, HEL-82) — say, because one side's license lapsed. The promise made at
the time was that suspension blocks new deals, new chat messages, and new pricing
requests. Only the "new deals" part actually got built. Right now, two companies on
a suspended relationship can keep chatting and keep asking each other for pricing as
if nothing happened — the compliance control looks like it's working (because deals
are visibly blocked) while two of its three promises are silently not enforced. This
is reachable directly against the database, not just through the app, so it isn't a
UI oversight — it's a real gap in what the database itself will accept.

**What each option costs later:**
- **Add a check to the one function the ticket happens to name** (`send_deal`, which
  already has this check from a related ticket): cheapest today, but this exact
  mistake already happened once this week — a sibling ticket shipped a check on the
  one function it was thinking about and left two other doors wide open, which is
  why this ticket exists at all. Doing it again here would very likely produce
  another HEL-84-shaped gap next month, on a different pair of doors.
- **Add the SAME check, copy-pasted, into every place that needs it (~6 functions,
  2 database policies):** closes the hole today, but the next person who changes the
  rule (e.g. "also block X") has to remember to find and update every copy. This
  codebase has already been burned by exactly this pattern once this week (a
  duplicated liveness check, found and named as a problem during this ticket's own
  research).
- **Write the rule once, in one function, and have everything else call it**
  (this ADR's recommendation): costs one extra database object today. Buys a single
  place to look, single place to change, and — because two of the six call sites
  already have this exact check duplicated inline — an opportunity to delete that
  duplication as part of the same change instead of adding a third copy next to it.

**How the industry normally does this:** a shared, callable predicate function is the
standard way to enforce one business rule across multiple write paths in Postgres —
this repo already has two working examples of the identical pattern
(`company_can_receive_requests`, `product_visible_to_caller`), so this isn't a new
idea for this codebase, it's applying an existing one to a new rule.

**Recommendation: one function, `assert_relationship_writable`, called from every
place that writes a new chat message or a new pricing/connect request — both the
two RLS-governed client doors and the handful of server-side automated doors that
bypass RLS entirely.** One sentence why: a rule enforced in one place can't drift out
of sync with itself; a rule copy-pasted six times eventually will.

## Locked (from Muskan's interview + `/design`'s research, `STATE.md`)

1. Suspension blocks **new** pricing/connect requests only — pricing a buyer already
   had access to before suspension keeps working. This is a write-path narrowing,
   not a read/visibility change.
2. One shared function, called from every write site — not independent inline
   checks, and not a search for a different mechanism.
3. Sella's automated delivery (`deliver_deal`) gets the same check — no exemption for
   automated vs. human-initiated writes.
4. **An in-flight held change (a pricing/quantity ask already pending when
   suspension happens) is allowed to finish** — accepting or declining it is not a
   "new" write in the sense this ticket cares about; it's resolving something that
   started while the relationship was active. `confirm_deal_change` is therefore
   **excluded** from this gate, the same way `create_deal_draft` is excluded because
   its own write no longer reaches the counterparty at all.

## Reused — already built, this ADR feeds it, does not touch it

- `is_relationship_member()` — stays a pure membership check, untouched. Every read
  path that depends on it (deal history, threads, notes, terms, artifacts) stays
  exactly as open as it is today. This ADR adds a **separate, additive** gate; it
  does not modify the shared read/write membership function.
- `send_deal` and `confirm_detected_deal`'s existing relationship-liveness checks
  (HEL-74, shipped 2026-08-25) — **refactored**, not left alone: their duplicated
  inline check is replaced by a call to this ADR's new shared function. This is a
  planned exception to "reused means untouched" — see Invariant 6.
- `company_can_receive_requests` and `product_visible_to_caller` — read as the
  established local convention for a `STABLE SECURITY DEFINER` predicate callable
  from an RLS `WITH CHECK`; this ADR's function follows the same shape.

## Blast-radius

- **Two RLS policies** (`msg_all` on `chat_message`, `inbox_insert` on
  `pending_inbox_item`) gain a new `WITH CHECK` term — narrows who can INSERT, does
  not touch `SELECT`/read access at all.
- **Three RPCs gain a new call**: `deliver_deal` (new gate, currently zero
  relationship-liveness check), `send_deal`, `confirm_detected_deal` (refactored
  from their existing duplicated inline check to call the shared function instead).
  **`propose_deal` was in an earlier draft of this list and is removed** (round 2's
  F2): the function was `DROP FUNCTION`ed in
  `20260724120800_drop_propose_edit_rpcs.sql` — it belonged to a retired lifecycle
  and does not exist in the live catalog (confirmed: `select count(*) from pg_proc
  where proname = 'propose_deal'` returns 0). Its replacement,
  `propose_deal_change`, writes only `deal_pending_change`, never `chat_message` —
  needs no gate. **This was a genuine research-pass error, not a naming
  ambiguity**: the original citation (a real migration, a real `chat_message`
  insert) was accurate for the file it named, but that file's function was later
  dropped and the research pass didn't check for a later DROP on the same name.
  Named here so `/build` doesn't write `create or replace function
  public.propose_deal(...)` from that old file, which would silently resurrect a
  `SECURITY DEFINER` door around `msg_all`'s own `type <> 'deal_detected'` gate.
- **Two Supabase Edge Functions gain a new check**: `sella-detect`, `sella-summarize`
  — both write `chat_message` over `service_role`, entirely outside RLS and outside
  the RPC census; found by `adr-checker` round 1, not the original research pass.
- **`accept_person_connection` is read, not changed** — it's `SECURITY DEFINER` and
  writes `chat_message`, but always onto a thread it just created with
  `relationship_id NULL`, which the assertion function's NULL-passthrough already
  allows without an explicit call.
- **`create_deal_draft` and `confirm_deal_change` are explicitly excluded** — the
  former no longer reaches the counterparty at all (verified against its live body,
  a fact the original census didn't have), the latter by Muskan's ruling above.
- **`requestActionError.ts`'s allow-list gains one entry** for the new raise message
  (Invariant 13).
- **0024-c2c-thread-atomicity** deletes the browser-side insert loop this ADR's
  census originally counted as a write site (`store.ts:646`). **Sequencing note
  (0007's own `adr-checker` round 1 flagged this as needing to say why it's
  low-stakes, not just who goes first):** 0024's replacement inserts land inside
  `accept_connection_request`, which either mints a relationship at `'active'` status
  or raises on a non-active adopt before reaching them — so those new inserts can
  never land on a suspended pair, and this ADR's gate is never actually reachable
  from that code path. The re-target is cheap correctness bookkeeping (0026's
  `/build` step updates the census entry once 0024's migration exists), not a
  dependency this ADR's own correctness relies on.
- **No change to any read path, any historical record, or `is_relationship_member`
  itself.**

## Invariants

**Machine-checkable (become a test, not just prose):**

1. Given a suspended relationship, a chat message posted via the app is refused.
   *(PRD AC1)*
2. Given a suspended relationship, a chat message posted via a direct PostgREST call
   (bypassing the app) is refused — proves the gate is server-side. *(PRD AC2)*
3. Given a suspended relationship, a new pricing/connect request addressed to that
   pair is refused. *(PRD AC3)*
4. Given a suspended relationship, Sella's `deliver_deal` attempting to deliver onto
   it is refused. *(PRD AC4)*
5. Given a suspended relationship, every existing message, thread, and pricing
   history remains fully readable — unchanged from today. *(PRD AC5)*
6. Given a suspended relationship with pricing already shared before suspension, the
   buyer can still view and use that pricing — suspension does not retroactively
   hide it. *(PRD AC6)*
7. **New, from Muskan's ruling above:** given a relationship with a held pricing
   change already pending when it's suspended, accepting or declining that change
   still succeeds — `confirm_deal_change` is not gated by this ADR. **Now also in the
   PRD** (round 1's `adr-checker` N6: this invariant existed only here, and the PRD
   is this repo's source of truth for what `/build` derives its test list from).
8. **New, from `adr-checker` round 1 (closes B1/B2/B3):** given a `pending_inbox_item`
   with no relationship yet (a first-contact request), a `chat_thread` with
   `relationship_id IS NULL` (a company-less p2p thread, or a `group` thread), the
   write is allowed — the gate only fires when a relationship genuinely exists and
   is not `active`.
9. **New, from `adr-checker` round 1 (closes B6):** given an authenticated user who
   is NOT a party to relationship X, calling `assert_relationship_writable` with X's
   id raises the same "not found" message as a genuinely nonexistent id — the
   function does not let a caller distinguish "doesn't exist" from "not yours",
   and does not leak X's status to a non-party caller.
10. **New, from `adr-checker` round 2 (closes F1 — round 1's B6 fix broke round 1's
    B5 fix):** given a `service_role` caller (Sella's edge functions) with no
    end-user company context, calling `assert_relationship_writable` on an
    `active` relationship still succeeds — the membership check only restricts
    `authenticated`-role callers, which is the only role B6's leak was ever
    reachable from. **Reproduced live before this fix, and must be re-proven
    live after it**: `set local role service_role` with no `sub` claim, call the
    function against a genuinely active relationship, confirm it returns `true`
    rather than raising.

**Judgment-only (ADR prose + `critic`'s brief, not independently testable):**

11. **The function returns `boolean`, not `void`.** A `void`-typed Postgres function
    cannot appear inside an RLS `WITH CHECK` expression — this is a hard type
    constraint, not a style choice, and it's the one place the earlier draft PRD had
    this wrong (corrected during `/design`'s research). It returns `true` on success
    and always raises rather than returning `false`, so `perform` in a `plpgsql` RPC
    body works identically to calling a `void` function would have.
12. **`send_deal` and `confirm_detected_deal`'s refactor is a full re-emit of their
    live bodies, using `create or replace` — never `drop` + `create`.** A drop would
    silently take the existing `authenticated` EXECUTE grant with it; ADR 0006 (round
    2, its own B7) already named this exact failure mode for `send_deal` by name.
    Both migrations must diff against the CURRENT live body, not an earlier cited
    version (this repo has been burned by exactly this mistake before — diffing a
    replacement against a stale copy silently drops guards).
13. **`pending_inbox_item` has no `relationship_id` column.** The `inbox_insert`
    policy must derive the relationship from the sender/receiver company pair
    (the same canonical `least`/`greatest` ordering `accept_connection_request`
    already uses) before it can call the assertion function — and must skip that
    derivation entirely for a `connect_person` row (Invariant 8's NULL-passthrough
    covers it either way, but the derivation shouldn't compute a meaningless pair),
    and must filter `deleted_at is null` on the derivation (round 2's F4 — without
    it, a pair with both a soft-deleted and a live relationship row raises "more
    than one row returned by a subquery" on an ordinary send, not a suspended one).
14. **A new raise needs a caller-facing message, not a silent fallback to
    "we couldn't complete that."** `src/modules/connect/lib/requestActionError.ts`
    is a closed allow-list keyed on the raise's message text; its own docstring says
    to extend it when a new raise becomes reachable. This ADR makes
    `assert_relationship_writable`'s message reachable from the pricing-request and
    connect-request doors — add a matching entry so a suspended-relationship refusal
    reads as what it is, not a generic retry prompt.
15. **Both derivation subqueries (`msg_all`'s via `chat_thread`, `inbox_insert`'s via
    the company pair) run in the CALLING user's RLS context, not the function's**
    (round 2's F5) — `.claude/rules/supabase.md`'s rule: a fact the caller can't
    read must come from a definer, and a derivation that returns NULL because the
    caller can't see the row would fail OPEN (NULL-passthrough lets the write
    through). Currently safe because `rel_all`/`thread_all` have no status filter of
    their own — but that safety is load-bearing on those two policies staying that
    shape, and must be re-checked if either is ever narrowed.
16. **The four system-authored deal-lifecycle types are exempt from the gate —
    ruled, not deferred (Muskan, 2026-08-26).** `deal_signed`, `deal_cancelled`,
    `deal_change_proposed`, and `deal_negotiation_requested` (four members) are
    NOT gated by `assert_relationship_writable` — same reasoning as Invariant 7:
    an event already in motion when suspension happens (a deal signing, a
    change being proposed) is not a "new" write in the sense this ticket cares
    about. **Mechanism, corrected post-ship (§12 addendum,
    `docs/muskan-build/0026-relationship-write-gate/PLAN-HEL-84.md`):** the
    original build implemented this ruling as a client-facing carve-out in
    `msg_all`'s `WITH CHECK`, keyed on `chat_message.type` — found live-exploitable
    (a thread member could bypass the entire gate by mislabeling an ordinary
    message's `type` as one of the four exempt values). Closed by moving these
    four types into a new `SECURITY DEFINER` RPC, `announce_deal_event`
    (formerly the client-side `announceDealEvent` helper in
    `src/modules/deals/actions.ts`, now deleted), which bypasses `msg_all`
    entirely and performs its own party + deal-workspace-membership
    authorization instead of a client-writable exemption. The ruling above is
    unchanged; only the mechanism moved. `announceDealEvent`'s old fail-soft
    behavior (catches its own error, logs to console, no user-facing signal)
    carries over to the new RPC call site — still a pre-existing gap, still
    not this ADR's job.

## The design

**Round 1's `adr-checker` found the function as first drafted would have broken
Discover's Connect button, all group chats, and every company-less p2p thread —
and let any authenticated user probe any relationship's status by id. Both are
closed by two changes to the same function, not two different mechanisms:**

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
  -- NULL means "no relationship to gate" — not an error. Reachable, legitimately,
  -- from: a first-contact pending_inbox_item (no relationship exists yet — that's
  -- what accepting the request creates); a company-less p2p chat_thread
  -- (accept_person_connection creates these with relationship_id NULL by design,
  -- confirmed in its own header comment); and any `group` chat_thread, which has
  -- no relationship at all. None of these are suspendable, so none are gated.
  if p_relationship_id is null then
    return true;
  end if;

  -- The caller must be a party to the relationship — UNLESS the caller has no
  -- company context at all, which is exactly what a `service_role` caller looks
  -- like (round 2's F1: an EARLIER version of this check unconditionally required
  -- membership and would have made every Sella edge-function call raise
  -- "not found" on every relationship, active ones included — `auth.uid()`/
  -- `current_company_id()` are both NULL under `service_role`, since there is no
  -- end-user JWT). `service_role` already bypasses RLS system-wide by definition,
  -- so it is not a caller this membership check needs to restrict — the two
  -- `authenticated`-role RLS call sites are the ones the leak (B6) was ever about.
  select status into v_status
  from public.relationship
  where id = p_relationship_id
    and deleted_at is null
    and (public.current_company_id() is null
         or public.current_company_id() in (company_a_id, company_b_id));

  if v_status is null then
    raise exception 'assert_relationship_writable: relationship not found';
  end if;

  if v_status <> 'active' then
    raise exception 'assert_relationship_writable: relationship is % — no new writes', v_status;
  end if;

  return true;
end;
$$;

revoke execute on function public.assert_relationship_writable(uuid) from public, anon;
grant  execute on function public.assert_relationship_writable(uuid) to authenticated;
```

The membership check is safe at every call site, not just the two RLS policies: an
RPC calling this function has, by that point in its own body, already established
the caller is a legitimate party to the relationship (or the RPC would have raised
earlier for an unrelated reason) — so the added check is redundant-but-harmless
there, and load-bearing at the two RLS sites where nothing else establishes it.

**Call sites, corrected against a live-catalog check (round 1's `adr-checker`
independently queried `pg_proc` for every function whose body inserts into
`chat_message` — the result differs from the census in two places, both folded in
below):**

| Site | Change |
|---|---|
| `msg_all` (RLS, `chat_message`, `FOR ALL`) | Add `AND public.assert_relationship_writable((select relationship_id from public.chat_thread where id = thread_id))` to `WITH CHECK`. `FOR ALL` also governs `UPDATE`/`DELETE` on this table, not just `INSERT` — `authenticated` holds no client-side `UPDATE`/`DELETE` on `chat_message` today (verified), so this is a wording correction, not a behavior gap, but worth stating plainly rather than implying `WITH CHECK` is INSERT-only. |
| `inbox_insert` (RLS, `pending_inbox_item`) | Add the same, deriving the relationship from the canonical company pair (Invariant 13) — **only when `receiver_company_id IS NOT NULL`**; a `connect_person` row has no company pair at all (`receiver_company_id` is NULL by its own CHECK constraint), so the derived id is NULL and the function's NULL-passthrough correctly allows it without a special case, but the derivation itself should skip the lookup rather than compute a meaningless one. Filter `deleted_at is null` on the derivation (Invariant 13). |
| `send_deal` | Replace its existing inline liveness check with `perform public.assert_relationship_writable(v_card.relationship_id);` — **`create or replace`, never `drop`+`create`** (Invariant 12 — a drop would silently take the existing `authenticated` EXECUTE grant with it, which ADR 0006 already named as the exact failure mode that would make Send fail for every user). |
| `confirm_detected_deal` | Same refactor, `perform public.assert_relationship_writable(v_rel);`, **placed inside the existing accept/birth branch it already lives in** (not hoisted to the top of the function) — the current check is deliberately guarded so a *decline* on a suspended relationship still succeeds; moving it would change that behavior. |
| `deliver_deal` | New call, inserted immediately after its relationship id is resolved and before any read/write that follows. Its only two live callers (`send_deal`, `confirm_detected_deal`) already check liveness before reaching it, so this call is currently unexercised through the product — kept anyway so a third future caller can't reopen the gap silently (this is the exact failure class the ticket itself exists to close). |
| `accept_person_connection` | **New — missed by the original census, found by `adr-checker` round 1.** `SECURITY DEFINER`, inserts `chat_message` directly (`20260724100400_accept_person_connection.sql:87`), bypassing `msg_all` entirely. Its own insert always targets a thread it just created with `relationship_id NULL` (a company-less p2p thread, by design) — the NULL-passthrough makes an explicit call inert here, so none is added; noted so a future reader doesn't wonder why this RPC is exempt from a rule everything else follows. |
| `sella-detect` / `sella-summarize` (Supabase Edge Functions, not RPCs) | **New — a class of writer the RPC-only census structurally couldn't see.** Both authenticate with `SUPABASE_SERVICE_ROLE_KEY` and insert `chat_message` directly (`supabase/functions/sella-detect/index.ts:229-231`, `sella-summarize/index.ts:145`), bypassing RLS the same way a `SECURITY DEFINER` RPC does. Locked #3 ("no exemption for automated writes") applies here as much as to `deliver_deal` — and Invariant 10's `service_role` carve-out (round 2's F1 fix) is what makes this actually work rather than break every write. Each function calls the Postgres RPC `assert_relationship_writable(relationship_id)` itself, in TypeScript, before its insert, and lets the RAISE surface as a caught error the function already logs and skips past (matching each function's existing error-handling shape — read the live file before writing this, don't assume the shape). A third Sella function, `sella-intro`, was checked and correctly excluded — it only `UPDATE`s an existing `sella`/`intro` row, never inserts. |
| `create_deal_draft` | **Excluded** — verified live, touches neither table |
| `confirm_deal_change` | **Excluded** — Muskan's ruling, Invariant 7 |
| `announce_deal_event` | **New `SECURITY DEFINER` RPC (§12 addendum, post-ship correction) — replaces the client-side `announceDealEvent` helper, deleted.** Writes the four Invariant-16-exempt types (still not gated by `assert_relationship_writable`, per that ruling) via its own party + `deal_workspace`-membership authorization instead of a `msg_all` client-facing carve-out — the original carve-out design was live-exploitable (client-controlled `type` bypassed the whole gate) and is what this row used to describe. |

One migration per unit of change, following this repo's established convention
(function + grants in its own file; each RPC re-emit in its own file); the two
edge-function changes are ordinary TypeScript diffs, not migrations.

## Deferred — must NOT be built here

- Any change to `is_relationship_member()`.
- Any change to what "new pricing ask" covers beyond the initial request (existing
  pricing access is explicitly out — Locked #1).
- Gating `confirm_deal_change` (Locked #4) — a deliberate exclusion, not an
  oversight; do not reopen without a fresh product ruling.
- 0024's own migration — this ADR only re-targets its census entry once 0024 ships,
  it does not build or wait on 0024's work.
- **The four system-authored deal-lifecycle types** — see Invariant 16 above.
  **Ruled 2026-08-26 (Muskan): exempt from the gate, same reasoning as
  `confirm_deal_change`.** No longer an open question. Mechanism corrected
  post-ship — see Invariant 16's own note.
