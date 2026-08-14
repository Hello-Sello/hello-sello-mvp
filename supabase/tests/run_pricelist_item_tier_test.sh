#!/usr/bin/env bash
# Run the tier-ladder contract test (pricelist_item_tier_test.sql) against the
# LOCAL Supabase stack, then the two-session save_price_ladder race proof
# (T01 criterion: concurrent saves serialize on the parent FOR UPDATE lock and
# the last writer's ladder survives intact — never a merged ladder).
# Prefers host psql; falls back to the stack's DB container.
set -euo pipefail

TEST_FILE="supabase/tests/pricelist_item_tier_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  if [ -z "$DB_URL" ]; then
    echo "ERROR: could not get DB_URL from supabase status (is the local stack running?)" >&2
    exit 1
  fi
  PSQL=(psql "$DB_URL")
else
  DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
  if [ -z "$DBC" ]; then
    echo "ERROR: no host psql and no running supabase_db_* container" >&2
    exit 1
  fi
  PSQL=(docker exec -i "$DBC" psql -U postgres -d postgres)
fi

# ── Phase 1: single-session contract test (BEGIN…ROLLBACK, leaves no trace) ──
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"

# ── Phase 2: two-session race proof ──────────────────────────────────────────
# Needs REAL committed transactions (a rolled-back test can't hold a lock
# against another session), so it uses a throwaway fixture product/item that is
# created here and deleted in a trap — seed data is never mutated.
RACE_CODE='TIER-RACE'

cleanup() {
  "${PSQL[@]}" -q -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
DELETE FROM public.pricelist_item_tier t
  USING public.pricelist_item pli, public.product p
  WHERE t.pricelist_item_id = pli.id AND pli.product_id = p.id
    AND p.supplier_product_code = '$RACE_CODE';
DELETE FROM public.pricelist_item pli
  USING public.product p
  WHERE pli.product_id = p.id AND p.supplier_product_code = '$RACE_CODE';
DELETE FROM public.product WHERE supplier_product_code = '$RACE_CODE';
SQL
}
trap cleanup EXIT
cleanup   # clear any leftovers from a previous crashed run

ITEM_ID="$("${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 <<SQL
WITH prod AS (
  INSERT INTO public.product (company_id, name, supplier_product_code)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Race Fixture', '$RACE_CODE')
  RETURNING id
)
INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9', prod.id, 10.00, 'EUR' FROM prod
RETURNING id;
SQL
)"
if [ -z "$ITEM_ID" ]; then
  echo "ERROR: race fixture creation returned no pricelist_item id" >&2
  exit 1
fi

# Session A (background): saves ladder X, then holds its transaction open past
# COMMIT-time of a normal call so session B must queue on the parent lock.
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL >/dev/null &
BEGIN;
SELECT public.save_price_ladder('$ITEM_ID', 9,
  '[{"min_grams":500,"price_per_gram":8}]'::jsonb);
SELECT pg_sleep(2);
COMMIT;
SQL
A_PID=$!

sleep 0.5

# Session B (foreground, starts mid-sleep): ladder Y — must block until A
# commits, then win as the last writer.
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL >/dev/null
SELECT public.save_price_ladder('$ITEM_ID', 9,
  '[{"min_grams":700,"price_per_gram":7},{"min_grams":1400,"price_per_gram":6}]'::jsonb);
SQL

wait "$A_PID"

LADDER="$("${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c \
  "SELECT string_agg(trim_scale(min_grams)::text || ':' || trim_scale(price_per_gram)::text, ',' ORDER BY min_grams)
   FROM public.pricelist_item_tier
   WHERE pricelist_item_id = '$ITEM_ID' AND deleted_at IS NULL;")"
EXPECTED='700:7,1400:6'

if [ "$LADDER" != "$EXPECTED" ]; then
  echo "RACE FAIL: live ladder after the two-session race is '$LADDER', expected '$EXPECTED'" >&2
  echo "           (last-writer-wins violated — ladders merged or session A's rungs survived)" >&2
  exit 1
fi

echo "RACE PASS: two concurrent save_price_ladder calls serialized; last writer's ladder is intact"
