# PLAN T01 — Migration E (expand)

**Ticket:** HEL-46 · TICKETS.md T01 · **ADR:** 0004 rev 8 §1–§3 E-steps 0–5.
Disposable — dies with the ticket.

## Files

| File | Action |
|---|---|
| `supabase/migrations/20260814120000_tier_ladder_expand.sql` | NEW — everything below |
| `supabase/seed/seed.sql` | EDIT — §6c gains one well-formed bracket row (AUR-1A) |
| `supabase/tests/pricelist_item_tier_test.sql` + `run_pricelist_item_tier_test.sh` | NEW — pgTAP-style assertions |
| `supabase/tests/cross_tenant_lockdown_test.sql` | EDIT — extend anon doors to child table + view |
| `src/types/database.types.ts` | REGEN — `supabase gen types typescript --local` |

Latest existing migration is `20260724121200`; `20260814120000` sorts after it. ✔

## Migration file layout, in order

### 0. Precondition note (comment only)
`buy_schema` orphan repair is a CLOUD-push precondition (T08 verifies) — local `db reset`
is unaffected. The migration carries a header comment; no SQL.

### 1. Table

```sql
CREATE TABLE public.pricelist_item_tier (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_item_id UUID NOT NULL REFERENCES public.pricelist_item(id),
  min_grams         NUMERIC(12,2) NOT NULL CHECK (min_grams > 0),
  price_per_gram    NUMERIC(15,4) NOT NULL CHECK (price_per_gram > 0),
  created_by        UUID NULL REFERENCES public.person(id),
  updated_by        UUID NULL REFERENCES public.person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ NULL,
  deleted_by        UUID NULL REFERENCES public.person(id)
);
CREATE UNIQUE INDEX uq_pricelist_item_tier_min ON public.pricelist_item_tier
  (pricelist_item_id, min_grams) WHERE deleted_at IS NULL;
CREATE INDEX idx_pricelist_item_tier_item ON public.pricelist_item_tier(pricelist_item_id);
```

House-column shape copied from `pricelist_item` (`20260607090004:138-156`).

### 2. Rituals

1. `ALTER TABLE public.pricelist_item_tier ENABLE ROW LEVEL SECURITY;` (explicit even
   with `rls_auto_enable()` — ADR §1 ritual 1).
2. `CREATE TRIGGER trg_pricelist_item_tier_set_updated_at BEFORE UPDATE ON
   public.pricelist_item_tier FOR EACH ROW EXECUTE FUNCTION set_updated_at();`
   (the `20260607090005:56-58` attach is a hard-coded list; new tables wire explicitly).
3. `INSERT INTO auditable_content_type (code, description, target_table) VALUES
   ('pricelist_item_tier', 'A volume-tier rung on a pricelist row', 'pricelist_item_tier')
   ON CONFLICT (code) DO NOTHING;` — convention parity (`20260607090001:505`), inert today.

### 3. Helper + doors

```sql
CREATE OR REPLACE FUNCTION public.owns_pricelist_item(p_pricelist_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pricelist_item pli
    JOIN public.pricelist pl ON pl.id = pli.pricelist_id
    WHERE pli.id = p_pricelist_item_id AND pl.company_id = public.current_company_id()
  );
$$;
REVOKE ALL ON FUNCTION public.owns_pricelist_item(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_pricelist_item(uuid) TO authenticated;
```

Shape = `owns_pricelist` (`20260607170000:142-148`) + GAP-1 revoke pair.

Policies (ADR §2):

```sql
CREATE POLICY plit_all ON public.pricelist_item_tier FOR ALL TO authenticated
  USING (public.owns_pricelist_item(pricelist_item_id))
  WITH CHECK (public.owns_pricelist_item(pricelist_item_id));

CREATE POLICY plit_public_select ON public.pricelist_item_tier
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.pricelist_item pli
      JOIN public.product p ON p.id = pli.product_id
      WHERE pli.id = pricelist_item_tier.pricelist_item_id
        AND pli.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.profile_visible = true
        AND p.price_public = true
        AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
        AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
    )
  );

REVOKE ALL ON public.pricelist_item_tier FROM anon;
```

Note: parent policy `pricelist_item_public_select` (`20260614180000`) omits the
visibility window because its `EXISTS (… FROM product)` runs under product RLS which
enforces it; the child policy is on a table whose subquery ALSO runs under caller
rights, but we inline the window anyway (harmless double-check, matches the ADR's
"defense in depth" instruction and the view's public arm).

### 4. Ladder-shape constraint trigger

One plpgsql function `check_price_ladder_shape()` + two plain (non-deferred)
constraint triggers:

- `trg_plit_ladder_shape` — AFTER INSERT OR UPDATE ON `pricelist_item_tier` FOR EACH ROW
- `trg_pli_base_ladder_shape` — AFTER UPDATE OF price_per_gram ON `pricelist_item` FOR EACH ROW

Body (both call the same checker with the parent id):
1. `SELECT price_per_gram INTO v_base FROM public.pricelist_item WHERE id = <parent>
   FOR UPDATE;` — the lock first (ADR §1: without it two concurrent rung writes
   validate against snapshots and both commit into a broken ladder).
   `IF NOT FOUND THEN RAISE` (plan-checker note: NULL v_base would make the
   comparison neither TRUE nor FALSE — unreachable today via RLS, pinned anyway).
2. Load live rungs `WHERE pricelist_item_id = <parent> AND deleted_at IS NULL ORDER BY
   min_grams`. Assert: every `price_per_gram < v_base`, and strictly descending as
   `min_grams` ascends. On violation: `RAISE EXCEPTION 'TIER_LADDER_SHAPE: …'`
   (prefixed so `pricelist.ts` (T03) can map it to a clear message).
3. Soft-delete flips (UPDATE setting `deleted_at`) also fire the trigger — correct:
   removing a middle rung can't break descent, but the re-check is cheap and uniform.

Trigger function is `SECURITY INVOKER` (default) — it reads the parent row the caller
can already see via RLS; sellers own their rows, and the public-select path never
INSERTs/UPDATEs. Edge case: `plit_public_select` grants SELECT on other companies'
rungs, but the trigger only fires on writes, which `plit_all` gates. ✔

### 5. `save_price_ladder` RPC

```sql
CREATE OR REPLACE FUNCTION public.save_price_ladder(
  p_pricelist_item_id uuid, p_base numeric, p_tiers jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ … $$;
```

Body order (ADR §1):
0. Input validation before any write: `p_base IS NULL OR p_base < 0` →
   `RAISE EXCEPTION 'TIER_LADDER_SHAPE: base price is required'` (plan-checker note:
   the column is NOT NULL — without this a null base surfaces raw Postgres text,
   breaking the clear-message contract). Base `0` stays legal (§5: free product,
   ladder unconstructible — the trigger enforces that).
1. `PERFORM 1 FROM public.pricelist_item WHERE id = p_pricelist_item_id FOR UPDATE;`
   — FIRST lock statement; if 0 rows (RLS-hidden or nonexistent) → `RAISE EXCEPTION`.
   INVOKER means RLS enforces ownership for free.
2. `UPDATE public.pricelist_item_tier SET deleted_at = now(), deleted_by = auth.uid()
   WHERE pricelist_item_id = p_pricelist_item_id AND deleted_at IS NULL;`
3. `UPDATE public.pricelist_item SET price_per_gram = p_base, updated_by = auth.uid()
   WHERE id = p_pricelist_item_id;`
4. Insert rungs from `jsonb_array_elements(p_tiers)` (`min_grams`, `price_per_gram`),
   `created_by = auth.uid()`.
5. Whole body wrapped in `BEGIN … EXCEPTION WHEN raise_exception THEN` re-raise with
   the clear-message contract (keep `TIER_LADDER_SHAPE:` prefix intact).
6. `REVOKE ALL … FROM public, anon; GRANT EXECUTE … TO authenticated;`

Delete-then-insert (not in-place UPDATE) because the partial unique index can't be
deferred and a ladder shift (500→1000) would trip it mid-statement (ADR §1).

### 6. View `current_pricelist_item` (ADR §4)

```sql
CREATE VIEW public.current_pricelist_item
WITH (security_barrier = true) AS
SELECT DISTINCT ON (pli.product_id)
  pli.id, pli.pricelist_id, pli.product_id, pli.price_per_gram, pli.currency,
  pli.updated_at,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'min_grams', t.min_grams, 'price_per_gram', t.price_per_gram)
      ORDER BY t.min_grams), '[]'::jsonb)
     FROM public.pricelist_item_tier t
     WHERE t.pricelist_item_id = pli.id AND t.deleted_at IS NULL) AS tiers
FROM public.pricelist_item pli
JOIN public.pricelist pl ON pl.id = pli.pricelist_id
JOIN public.product p ON p.id = pli.product_id AND p.company_id = pl.company_id
WHERE pli.deleted_at IS NULL
  AND pl.deleted_at IS NULL
  AND (
    pl.company_id = public.current_company_id()          -- owner arm
    OR (                                                  -- public arm
      p.deleted_at IS NULL AND p.profile_visible
      AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
      AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
      AND p.price_public
      AND public.is_caller_verified()
    )
  )
ORDER BY pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC;

GRANT SELECT ON public.current_pricelist_item TO authenticated;
REVOKE ALL ON public.current_pricelist_item FROM anon;
```

Owner-rights (NOT `security_invoker`) — deliberate, ADR §4: caller-rights would hit the
`pricelist` owner-only policy wall and buyers would get zero rows. Enumerated 7-column
projection, no legacy bundle columns (keeps C dependency-clean). Deliberately NO
`status_code` filter (matches the live RPC). Accepted `security_definer_view` advisor
finding — pre-declared in the ADR.

### 7. Backfill — as a shipped, test-callable function

**Plan-checker finding (blocking, accepted): the naive `NOT (a AND b AND c)` WHERE
evaluates to NULL — not TRUE — for half-filled brackets (threshold set, price NULL),
silently excluding the main malformed case from the rescue path.** Guard must be
`(… ) IS NOT TRUE` / `NOT COALESCE(…, false)`.

**Plan-checker finding (blocking, accepted): criterion 2 must be proven against the
SHIPPED statement, not a copy.** So the backfill is a named function the migration
creates, calls once, and leaves callable by the pgTAP test (superuser session only —
all grants revoked):

```sql
CREATE FUNCTION public.backfill_bundle_to_tiers()
RETURNS TABLE (migrated int, rescued int)
LANGUAGE plpgsql AS $$
DECLARE v_migrated int; v_rescued int;
BEGIN
  -- well-formed brackets → one rung each
  INSERT INTO public.pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram, created_by)
  SELECT pli.id, pli.bundle_threshold_grams, pli.bundle_price_per_gram, pli.created_by
  FROM public.pricelist_item pli
  WHERE pli.deleted_at IS NULL
    AND (pli.bundle_threshold_grams > 0 AND pli.bundle_price_per_gram > 0
         AND pli.bundle_price_per_gram < pli.price_per_gram)
    AND NOT EXISTS (SELECT 1 FROM public.pricelist_item_tier t          -- idempotent
                    WHERE t.pricelist_item_id = pli.id AND t.deleted_at IS NULL);
  GET DIAGNOSTICS v_migrated = ROW_COUNT;

  -- malformed brackets → metadata.legacy_bundle (recoverable), never rungs
  UPDATE public.pricelist_item pli
  SET metadata = pli.metadata || jsonb_build_object('legacy_bundle',
        jsonb_build_object('threshold', pli.bundle_threshold_grams,
                           'price',     pli.bundle_price_per_gram))
  WHERE pli.deleted_at IS NULL
    AND (pli.bundle_threshold_grams IS NOT NULL OR pli.bundle_price_per_gram IS NOT NULL)
    AND (pli.bundle_threshold_grams > 0 AND pli.bundle_price_per_gram > 0
         AND pli.bundle_price_per_gram < pli.price_per_gram) IS NOT TRUE;
  GET DIAGNOSTICS v_rescued = ROW_COUNT;

  RAISE NOTICE 'tier backfill: % migrated to rungs, % rescued to legacy_bundle',
    v_migrated, v_rescued;
  RETURN QUERY SELECT v_migrated, v_rescued;
END $$;

SELECT * FROM public.backfill_bundle_to_tiers();          -- run once, in E
REVOKE ALL ON FUNCTION public.backfill_bundle_to_tiers() FROM public, anon, authenticated;
```

Migration C (T08) drops this function — add to T08's contract list.
Ordering: runs AFTER the trigger exists — well-formed brackets satisfy the shape by
construction. Runs as migration role (superuser locally) — RLS not in play. ✔

### 8. `get_discoverable_shop` — DROP + CREATE

DROP (OUT columns change: `+ tiers jsonb`). New body = the sec01 body
(`20260617090000:191-268`) with:
- price lateral **replaced** by `LEFT JOIN public.current_pricelist_item v
  ON v.product_id = p.id` — single-owner row pick.
- legacy bundle fields from one further `LEFT JOIN public.pricelist_item pli2
  ON pli2.id = v.id` (keyed off the view's picked row id — no second lateral).
- returns legacy fields AND `case when p.price_public then v.tiers end AS tiers`.
- WHERE gains the visibility window (G3 sign-off 1):
  `and (p.visibility_start is null or p.visibility_start <= current_date)
   and (p.visibility_end   is null or p.visibility_end   >= current_date)`.
- Wrinkle: the RPC runs `set search_path to ''` and `security definer` — the view is
  owner-rights so the JOIN works regardless of caller; `public.`-qualify everything.
- Re-issue ALL THREE grant statements (sec01 pattern, `20260617090000:267-277`):
  `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated; REVOKE EXECUTE … FROM anon;`

### 9. `import_products` — re-declare from LIVE body

Base = `20260610160000` (verified current; grep shows no later re-declare). Change:
after the `pricelist_item` insert, add dual-write under the same guard as the backfill:

Compile fixes from plan-checker (accepted): the live insert has NO `RETURNING id` and
no `v_item_id` in DECLARE — both get added. Guard on extracted VALUES, not key
presence (a null-valued key must not stamp `legacy_bundle: {null, null}`):

```sql
-- DECLARE gains: v_item_id uuid; v_thr numeric; v_bpg numeric;
if v_pl ? 'price_per_gram' then
  v_thr := (v_pl->>'bundle_threshold_grams')::numeric;
  v_bpg := (v_pl->>'bundle_price_per_gram')::numeric;
  insert into pricelist_item (pricelist_id, product_id, price_per_gram,
    bundle_threshold_grams, bundle_price_per_gram, currency, created_by)
  values (v_pricelist, v_product_id, (v_pl->>'price_per_gram')::numeric,
    v_thr, v_bpg, 'EUR', auth.uid())
  returning id into v_item_id;
  if v_thr > 0 and v_bpg > 0 and v_bpg < (v_pl->>'price_per_gram')::numeric then
    insert into pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram, created_by)
    values (v_item_id, v_thr, v_bpg, auth.uid());
  elsif v_thr is not null or v_bpg is not null then
    update pricelist_item set metadata = metadata
      || jsonb_build_object('legacy_bundle',
           jsonb_build_object('threshold', v_thr, 'price', v_bpg))
    where id = v_item_id;
  end if;
end if;
```

Re-issue its grant/revoke pair (`revoke all … from public, anon; grant execute … to
authenticated;` — matches its own footer).

### 10. Repair `20260618120100`'s missing anon revoke (G3 sign-off 4)

The T08 files list carries this, but it is a live defect and this migration already
touches the function family — per ADR §3.3 ("flagged as a defect to repair in this
same ticket") it lands HERE:
`REVOKE EXECUTE ON FUNCTION public.list_discoverable_companies() FROM anon;`
(zero-arg signature — plan-checker verified against `20260618120100:17`).
**Amend TICKETS.md T08:** mark this item "done in T01" so T08 doesn't re-issue it.

## Seed edit

§6c: give AUR-1A a bundle bracket (`bundle_threshold_grams = 2000,
bundle_price_per_gram = 6.50`; base 8.00 → well-formed) so the legacy path stays
walkable, **plus one rung row** for AUR-1A in `pricelist_item_tier` (2000 g → 6.50) so
the ladder is demo-visible on a fresh reset. Keep idempotent-guard shape.

Seed runs AFTER migrations, so E's backfill never sees seed rows — criterion 2 is
proven by pgTAP calling the SHIPPED `backfill_bundle_to_tiers()` against fixtures
inside its rolled-back transaction (see Backfill section above).

**Flagged into T08 (plan-checker note, accepted):** migration C's `DROP COLUMN` will
break seed §6c's bracket columns — T08's file list gains `supabase/seed/seed.sql`
(strip the bracket columns, keep the rung row) + `DROP FUNCTION
backfill_bundle_to_tiers()`. Amend TICKETS.md T08 accordingly.

## Types regen

`supabase gen types typescript --local > src/types/database.types.ts` after `db reset`.
⚠️ Known cross-branch touchpoint: Ayush hand-added `update_deal_draft` to Functions —
regen on this branch (post-reset with all migrations) includes everything in the local
schema, so no hand-merge needed; diff the regen to confirm nothing vanishes.

## Tests (T01's EARS → assertions)

New `supabase/tests/pricelist_item_tier_test.sql` (BEGIN…ROLLBACK, impersonation via
`request.jwt.claims` + `SET LOCAL ROLE`, style = `cross_tenant_lockdown_test.sql`):

1. **Schema door:** RLS enabled (`relrowsecurity`), both policies exist, trigger
   attached, anon has no privilege on table or view.
2. **Backfill semantics** (fixture): insert parent with well-formed bracket → run the
   same INSERT…SELECT the migration uses → exactly 1 rung; malformed fixture →
   0 rungs + `legacy_bundle` in metadata.
3. **RPC:** as Alice (GreenLeaf owner) `save_price_ladder` on her item with 2 rungs →
   rungs live; ladder-shape violation (rung ≥ base) → raises `TIER_LADDER_SHAPE`;
   as Bob (other company) on Alice's item → exception (RLS: FOR UPDATE finds 0 rows).
4. **View:** Alice sees her row with `tiers` ordered; Bob (verified, price_public on)
   sees it via public arm; Bob with product `visibility_end < today` (fixture flip) →
   0 rows (window enforced); unverified caller → 0 rows.
5. **`get_discoverable_shop`:** returns both legacy fields + tiers for a public
   product; anon EXECUTE = false (grant door).
6. **Race** (criterion 5) — **real two-session proof (plan-checker finding,
   accepted):** the runner `run_pricelist_item_tier_test.sh` gains a second phase
   after the single-session SQL file: session A (background `psql`) opens a
   transaction, calls `save_price_ladder` (ladder X), holds with `pg_sleep(2)`,
   commits; session B (foreground, started mid-sleep) calls `save_price_ladder`
   (ladder Y) — B must block on A's parent lock, and after both commit the live
   ladder equals Y exactly (last-writer-wins, no merged ladder). Fixture rows
   created/dropped by the script around the two sessions.

Extend `cross_tenant_lockdown_test.sql`: policy door (`count(*) FROM
pricelist_item_tier` = 0 as anon) + grant door (`has_table_privilege('anon',
'public.pricelist_item_tier', 'SELECT')` = false; same for the view;
`has_function_privilege('anon', 'public.save_price_ladder(uuid,numeric,jsonb)',
'EXECUTE')` = false).

## Out of scope (fences)

- NO app-code reads move (T03). NO editor UI (T04/T05). NO basket (T06). NO deal card (T07).
- NO migration C — authored `.hold` in T08, not here.
- NO per-customer pricing, NO cross-product bundles, NO audit wiring beyond the inert
  seed row (STATE.md "Deferred").
