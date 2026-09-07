# T02 · Pricing ask to a connected company posts to chat — PLAN

ADR 0009, D2, I-M3, I-M4, I-M12, I-M13, I-J6. TICKETS.md T02.
**Revised after `plan-checker` round 1: REVISE, 3 blocking + 6 notes, all folded in below.**

## What changes

Two halves, per the ticket:
(a) A new `SECURITY DEFINER` RPC, `public.request_product_pricing_c2c`, that
resolves-or-creates the c2c thread and posts a person-voiced pricing-request
message.
(b) `requestProductPricing` (`src/app/discover/actions.ts:148-171`) branches
on `is_connected_to_company(receiverCompanyId)`: connected → the new RPC,
unconnected → today's `createPairInboxItem` path, unchanged.

## File 1 — migration

New file: `supabase/migrations/20260903130000_request_product_pricing_c2c.sql`
(sorts after `20260903120000`, T01's migration — check
`ls supabase/migrations | sort | tail -3` at build time in case something
newer landed).

### The RPC's signature — I-M15, not negotiable, confirmed sufficient by plan-checker

```sql
create function public.request_product_pricing_c2c(
  p_receiver_company_id uuid,
  p_product_id          uuid
) returns boolean   -- true = a new message was posted, false = deduped (I-M13)
language plpgsql
security definer
set search_path = ''
as $function$
```

No `p_body`/free-text parameter — a `text` parameter on a `SECURITY DEFINER`
RPC is callable directly via PostgREST by any `authenticated` session,
bypassing the TS server action's resolved product name entirely. No author
parameter (`sender_person_id` from `auth.uid()`), no thread-id parameter
(derived from the caller's own company + the receiver).

### ⚠️ `set search_path = ''` means EVERY identifier below must be schema-qualified

**`plan-checker` round 1 caught this as blocking (B1):** with `search_path`
cleared, `relationship`, `product`, `chat_message`,
`assert_relationship_writable`, `_resolve_or_create_c2c_thread` — every one
of them — must be written `public.relationship`, `public.product`, etc.
Unqualified, the function still *creates* (Postgres doesn't resolve bodies at
`CREATE FUNCTION` time), and fails at first *call* with `relation "…" does
not exist`. Every SQL fragment below is written qualified; the builder must
not "clean up" the `public.` prefixes.

### Body, in order (each line maps to an ADR invariant or a named trap)

1. `v_uid := auth.uid()`; raise `'request_product_pricing_c2c: not authenticated'` if null.
2. Resolve `v_sender_company` from `public.person.company_id` for `v_uid`;
   raise `'request_product_pricing_c2c: caller has no company'` if null
   (Path B invariant, same guard shape as T01's `confirm_detected_deal`).
3. Raise `'request_product_pricing_c2c: cannot request pricing from your own company'`
   if `v_sender_company = p_receiver_company_id` (mirrors
   `createPairInboxItem:54`'s existing check).
4. **Resolve the relationship by EXISTENCE, not by `status = 'active'` —
   corrected after `plan-checker` round 1 (N2).** Round 1 caught that filtering
   `status = 'active'` here makes step 5's `assert_relationship_writable` call
   dead code: a suspended pair would already be null-filtered out at this
   step and never reach the liveness check, so the suite could never tell
   *which* line refused, and ADR I-M4 explicitly says "assert it, do not
   assume it."
   ```sql
   select id into v_rel from public.relationship
    where deleted_at is null
      and company_a_id = least(v_sender_company, p_receiver_company_id)
      and company_b_id = greatest(v_sender_company, p_receiver_company_id);
   ```
   Raise `'request_product_pricing_c2c: relationship not found'` if `v_rel is null`
   — **this exact text is chosen to hit `requestActionError.ts:66,84`'s
   existing `RELATIONSHIP_NOT_FOUND` branch for free**, same wording
   `assert_relationship_writable` itself uses for its own not-found case.
   **This is now a genuinely different predicate from `is_connected_to_company`
   (which requires `status = 'active'`), not a reimplementation of it** — round
   1's N3 flagged the *original* (status-filtered) version as an unstated ADR
   §3 fence exception ("D2 does not reimplement it"); relaxing the status
   filter here resolves that, since this step now only proves a relationship
   row exists at all, leaving *liveness* entirely to step 5. Note this
   distinction in the migration header so a future reader doesn't conflate
   the two functions' predicates.
5. `perform public.assert_relationship_writable(v_rel)` — now a real,
   independently testable gate (I-M4). Raises `'assert_relationship_writable:
   relationship is % — no new writes'`, already mapped by
   `requestActionError.ts:59,80-82`.

   **End-to-end note, not a code change:** a normal UI caller with a
   suspended relationship never reaches this RPC at all —
   `is_connected_to_company` (status-filtered) is false, so TS routes them to
   `createPairInboxItem`, whose `inbox_insert` gate already refuses via the
   same function (`requestActionError.ts:24-32`). This RPC's own step 5 is
   defense-in-depth for a *direct* PostgREST call, not the path an ordinary
   user hits.
6. Resolve `v_product_name` and `v_price_public` from `public.product` where
   `id = p_product_id and company_id = p_receiver_company_id and deleted_at
   is null`. Raise `'request_product_pricing_c2c: product not found for that
   company'` if no row. **Added after plan-checker round 1's closing
   observation:** `actions.ts:162-163` refuses a pricing ask when the price
   is already public; the RPC omitted that check, which "undercuts the safe
   standing alone claim" for a direct caller. Raise
   `'request_product_pricing_c2c: price is already public for this product'`
   if `v_price_public` is true.
7. `select thread_id, created into v_thread, v_created from
   public._resolve_or_create_c2c_thread(v_rel)` — **schema-qualified, exact
   call shape from `accept_connection_request`
   (`20260826100000:206-207`)**, which reads
   `from public._resolve_or_create_c2c_thread(relationship_id)` — round 1
   caught the plan's first draft dropping the `public.` prefix from its own
   "copy this exactly" instruction.
8. **New c2c thread healed → post the same system intro
   `accept_connection_request` posts, added after plan-checker round 1's
   catch that `v_created` was captured and never read:**
   ```sql
   if v_created then
     insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
     select v_thread, 'system', null, 'connection_established',
            ca.name || ' and ' || cb.name || ' are now connected.', clock_timestamp()
     from public.company ca, public.company cb
     where ca.id = v_sender_company and cb.id = p_receiver_company_id;
   end if;
   ```
   This matters for a relationship minted before ADR-0007 (its c2c thread
   was never created at connection time — ADR §2's "Rejected" list names
   this exact healing case as the reason a raw client-side insert was
   rejected). Without this, that thread would open with a pricing request
   and no `connection_established` line, unlike every other thread in the
   product.
9. **Dup-guard (I-M13), scoped to (thread, sender's COMPANY, product) — not
   sender person. Corrected after plan-checker round 1 (B3), the sharper of
   the two blocking findings:** the original draft scoped by
   `sender_person_id = v_uid`. Round 1 proved this under-fires:
   `person.company_id` has no unique constraint (Carla and Alice are both
   GreenLeaf, `seed.sql:114`), so two colleagues asking about the same
   product would each get through — one ticket on the unconnected arm
   (company-scoped, `actions.ts:56-65`) but two chat messages on the
   connected arm. I-M13 says "the same pricing ask", not "by the same
   person". Fix:
   ```sql
   if exists (
     select 1 from public.chat_message cm
     join public.person p on p.id = cm.sender_person_id
     where cm.thread_id = v_thread
       and p.company_id = v_sender_company
       and cm.type = 'message'
       and cm.metadata->>'product_id' = p_product_id::text
       and cm.deleted_at is null
   ) then
     return false;
   end if;
   ```
   **Deliberately no expiry** (unlike `createPairInboxItem`'s guard, which
   only blocks while `status = 'pending'`): a chat message has no
   resolved/pending state and stays visible in the thread indefinitely, so
   re-asking would be genuinely redundant, not a "the first ask was already
   handled, ask again" situation. The caller still gets `{ ok: true }` on a
   dedup (see File 2) — **matching, not diverging from,**
   `createPairInboxItem:70-72`'s own silent-success-on-duplicate pattern.
   This is a product-consistency choice, not an oversight; call it out as
   such in the migration header rather than leaving it implicit.
10. Build the body, mirroring `buildPricingRequestNote`
    (`src/app/discover/pricingRequest.ts:37-41`): prefix `Pricing request
    for "`, suffix `".`, same 280-char/256-char-name clamp constants. A
    deliberate, necessary duplication — SQL cannot call a TS function, and
    the RPC must be safe standing alone (ADR §2 Rejected). `product.name` is
    `VARCHAR(200)` (`20260607090004:19`), always under the 256-char clamp
    threshold today, so the truncation branch is presently unreachable —
    implement it anyway, for the same reason `buildPricingRequestNote` does.
    **The `'product_id'` metadata key is a literal string in SQL, mirroring
    `PRODUCT_ID_KEY`'s *value*, not importing it** — `pricingRequest.ts:16-19`
    claims exactly one owner of that constant; note in both the SQL header
    and a one-line comment in `pricingRequest.ts` that the RPC's metadata
    key must be kept in sync with `PRODUCT_ID_KEY`'s literal value by hand,
    since SQL cannot import a TS constant.
11. `insert into public.chat_message (thread_id, sender, sender_person_id,
    type, body, metadata, created_at) values (v_thread, 'person', v_uid,
    'message', v_body, jsonb_build_object('product_id', p_product_id),
    clock_timestamp())`. Hardcoded `sender`/`sender_person_id` — re-imports
    exactly what `msg_all`'s WITH CHECK (`20260903090000:115-116`) would have
    required had this gone through RLS (I-J6, supabase.md's re-import rule).
    ⚠️ **`created_at` must be explicit `clock_timestamp()`, not the column
    default — caught by `test-writer` while building the suite, not by
    `plan-checker`.** The column default is `NOW()`, which freezes at
    transaction start, same value step 8's healing insert would get if it
    too used the default. Since both inserts can happen in the same
    transaction (a healed thread's pricing message), relying on the default
    risks the healing `connection_established` line sorting *after* the
    pricing message it's supposed to precede — indistinguishable order,
    wrong story. `accept_connection_request`'s own precedent
    (`20260826100000:222-229`) names this exact trap and uses
    `clock_timestamp()` (wall-clock, advances per call) on both its inserts.
    Step 8's insert already used `clock_timestamp()`; this step must match.
12. `return true`.

### Grants — the exact form the checklist mandates

```sql
REVOKE EXECUTE ON FUNCTION public.request_product_pricing_c2c(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_product_pricing_c2c(uuid, uuid) TO authenticated;
```
`SECURITY-CHECKLIST.md` S1's required form verbatim — confirmed by
`plan-checker` round 1 against the live event trigger
(`20260817120000`/`20260817130000:27-30`): the function is newly created (not
`create or replace`), so `revoke_anon_execute_on_new_function` already
auto-revokes PUBLIC/anon at `CREATE FUNCTION` time. The explicit REVOKE above
is required by the ticket's contract and the checklist's check form
regardless — not because omitting it would leave the function
anon-executable by default (L-010's exact mistake, avoided).

### The `_resolve_or_create_c2c_thread` comment fix — in scope, no grant change

```sql
comment on function public._resolve_or_create_c2c_thread(uuid) is
  'Internal-only. Callable only from accept_connection_request''s and '
  'request_product_pricing_c2c''s own definer bodies — no caller-'
  'authorization check of its own. Do not GRANT.';
```
The helper's own `revoke all ... from public, anon, authenticated` stays
untouched — a nested call from inside another `SECURITY DEFINER` body runs
under that body's owner privileges. ADR §3 names this exact edit as in-scope
and this exact non-edit as required.

## File 2 — `src/app/discover/actions.ts`

**Corrected after plan-checker round 1 (B2): the original snippet didn't
compile** — `requestProductPricing` has no Supabase client in scope
(`createClient()` is called inside `createPairInboxItem`, not the caller),
and the wrapper helper had no stated home.

```ts
export async function requestProductPricing(
  receiverCompanyId: string,
  productId: string,
): Promise<{ ok: true } | { error: string }> {
  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified to request pricing." };

  const product = (await getDiscoverableShop(receiverCompanyId)).find((p) => p.id === productId);
  if (!product)
    return { error: "We couldn't confirm that product is available from this shop. Try again." };
  if (product.price_public)
    return { error: "This product's price is already shown, so there's nothing to request." };

  const supabase = await createClient();
  const { data: connected, error: connError } = await supabase.rpc("is_connected_to_company", {
    p_company_id: receiverCompanyId,
  });
  // FAIL CLOSED to a refusal, not to a write — corrected after plan-checker
  // round 1 (N1). Falling through to createPairInboxItem on a query error
  // would let a transient fault create a pricelist_request ticket between
  // two ALREADY-connected companies, which I-J2 says must never exist ("the
  // only reason a row exists in pending_inbox_item is that someone awaits
  // permission from a company they have not spoken to"). The cited local
  // precedent (actions.ts:140-143, getDiscoverableShop swallowing errors)
  // degrades to a REFUSAL, not to a different write — this must match that
  // shape, not diverge from it.
  if (connError) return { error: requestActionError(connError) };

  if (connected) {
    const { error } = await supabase.rpc("request_product_pricing_c2c", {
      p_receiver_company_id: receiverCompanyId,
      p_product_id: productId,
    });
    if (error) return { error: requestActionError(error) };
    revalidatePath("/discover");
    revalidatePath(`/discover/${receiverCompanyId}`);
    return { ok: true };
  }

  return createPairInboxItem(
    "pricelist_request",
    receiverCompanyId,
    buildPricingRequestNote(product.name),
    productId,
  );
}
```

No separate `isConnectedToCompany` wrapper function — inlined as a direct
`supabase.rpc(...)` call, removing the "where does this helper live" question
round 1 raised entirely.

**Error wording (N6):** `not authenticated` and `caller has no company`
should never be reachable through this action (guarded upstream by
`requireVerified()` and existing Path B invariants elsewhere) — they fall
through `requestActionError` to `GENERIC`, matching that file's own stated
philosophy ("an unmatched raise is, by definition, one we have not reasoned
about"). `relationship not found` and the suspended/ended text are both
already mapped (see step 4/5 above). `product not found for that company`
and `price is already public...` are pre-empted by the checks earlier in
this same function (product resolution + `price_public`) — the RPC's own
copies of those checks are defense-in-depth for a direct caller, not a path
this action's own flow can reach, so `GENERIC` for them is the accepted,
stated answer, not a gap.

Do **not** touch `createPairInboxItem` itself — its dup-guard, its 280-char
clamp, its `requestActionError` handling all stay exactly as they are; the
connected arm never calls it.

## File 3 — SQL test suite

New: `supabase/tests/request_product_pricing_c2c_test.sql` +
`run_request_product_pricing_c2c_test.sh`, mirroring T01's suite shape.

**This suite proves the RPC's own behavior only** (I-M4, I-M12, I-M13, and
the connected half of I-M3). It cannot invoke `requestProductPricing` (a TS
server action) — the unconnected half of I-M3 and the TS-branch regression
are File 4's job, not this file's (round 1's N5: name which file proves
which half).

Fixture: the seeded GreenLeaf↔StonePharm relationship (`seed.sql:308`) and
any seeded product with `price_public = false` belonging to either company
(the RPC's own logic doesn't require GreenLeaf specifically).

**Assertions:**
1. Connected ask (Alice → StonePharm's product, direct RPC call) → **delta**
   of exactly one `chat_message` row scoped to `type = 'message'` in the c2c
   thread (not a bare `count(*)` — corrected after plan-checker round 1's N4:
   the seeded c2c thread already carries a `connection_established` system
   row, `seed.sql:321-323`, so an unscoped count is 2, not 1, and would be a
   hardcoded-count fixture-fragility bug on top of that). State which role
   the count query runs as (L-066's lesson: a count run as an actor who
   cannot see the rows proves nothing). Zero `pending_inbox_item` rows.
2. Direct RPC call on a company pair with **no relationship row at all**
   (any two unconnected seeded companies) → raises, text matches
   `relationship not found`.
3. Same ask (same product, same connected company), called twice **by two
   different people in the same company** (Alice, then Carla — both
   GreenLeaf) → second call returns `false`, delta stays at exactly one
   `chat_message` row. **This is the case round 1's B3 finding named
   explicitly** — the original single-person-repeat case could not have
   caught the company-scope bug.
4. Relationship suspended (via `suspend_relationship`, T01's liveness suite
   pattern) → direct RPC call raises, text matches `relationship is
   suspended`, distinguishing this from assertion 2's `relationship not
   found` (proving step 5, not step 4, is what refused — round 1's N2).
5. `has_function_privilege('anon', 'public.request_product_pricing_c2c(uuid,uuid)', 'EXECUTE')`
   is `false`, and the same for `'public'` (I-M12).
6. A pre-existing relationship with **no c2c thread yet** (simulate by
   deleting the seeded one inside the transaction, or use a second seeded
   pair that never got one) → after a successful ask, exactly one
   `connection_established` system message exists in the newly-created c2c
   thread, dated before the pricing message (mirrors
   `accept_connection_request`'s own healing behavior, round 1's "smaller"
   catch on `v_created`).

## File 4 — unit test

New assertions in `requestProductPricing.gate.test.ts`. Per round 1's N5:
this file currently mocks `createClient` to return `undefined`
(`:24-26`) — extend the mock to a chainable stub whose `.rpc()` records the
function name and args called, and whose `.from("pending_inbox_item")...`
chain records an insert payload, so both branches are independently
observable in one test file:

- Connected branch: mock `is_connected_to_company` → `true`; assert
  `request_product_pricing_c2c` is called with `{ p_receiver_company_id,
  p_product_id: productId }` and nothing else; assert the action returns
  `{ ok: true }` on RPC success and `{ error: ... }` (via
  `requestActionError`) on RPC failure.
- Unconnected branch (regression guard — **must not change at all**): mock
  `is_connected_to_company` → `false`; assert `request_product_pricing_c2c`
  is never called and the `pending_inbox_item` insert path fires exactly as
  it does today.
- `is_connected_to_company` query error: assert the action returns
  `{ error: ... }` and neither the RPC nor the `pending_inbox_item` insert
  fires (N1's fail-closed-to-refusal fix).

## Not in scope

- `createPairInboxItem`, `accept_connection_request`,
  `_resolve_or_create_c2c_thread`'s grants, `assert_relationship_writable`,
  `is_connected_to_company` itself — all Reused (ADR §3), called, not edited.
- `msg_all`'s policy — untouched; the RPC bypasses it by construction and
  re-imports its clauses manually (step 11 above).
- Discover's request list / badge / retitle — D3/D4/D9/D10, later tickets
  (T03/T04), not this one.

## Verification after builder runs

- `supabase db reset` clean.
- New SQL suite passes standalone; existing suites touched indirectly
  (`accept_connection_request_status_guard_test.sql`,
  `msg_all_sender_gate_test.sql`, `assert_relationship_writable_test.sql`)
  stay green.
- `requestProductPricing.gate.test.ts` — new cases green, existing
  price-gate cases unaffected.
- `tsc --noEmit` clean (new RPC needs `database.types.ts` regenerated —
  builder's job).
