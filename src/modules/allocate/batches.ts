/**
 * Batches allocator - read side (Sell surface, DEV-76/DEV-157).
 *
 * `getAllocationWorklist()` is the seller's permanent work surface: one row
 * per real `deal_line_item` across the seller's own live orders, joined to
 * the CURRENT (possibly-substituted) product and its FIFO-ordered live
 * batches. Same "flat fetches stitched in JS" discipline as
 * `src/modules/deals/supabase/reads.ts` - no view, no RPC for the read side
 * (only the 4 writes are RPCs, per Plan 1's threat model).
 *
 * Grams-only scope (DEV-157 #4): only lines whose `unit` is 'g' or 'kg' carry
 * a batch/weight concept to allocate; a plain `unit`-coded line (a box count)
 * has nothing to FIFO-batch against, so it is filtered out here, never shown
 * half-broken in the allocator.
 *
 * `AllocationRow`/`computeBatchStock` live in `./lib/batchStock` (pure, no
 * server import) so client components can import them without dragging this
 * file's `next/headers`-dependent `createClient` into the client bundle —
 * mirrors `src/modules/deals/lib/derive.ts` vs `supabase/reads.ts`.
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { sellerCompanyId, buyerCompanyId } from "@/modules/deals";
import type { DealType, DealCardStatus } from "@/modules/deals";
import type { Json } from "@/types/database.types";
import type { AllocationRow } from "./lib/batchStock";

export type { AllocationRow } from "./lib/batchStock";
export { computeBatchStock } from "./lib/batchStock";

/** Statuses whose lines can still need an allocation decision: done/cancelled
 *  orders need no further allocation work, and `unsent` private drafts are NOT
 *  committed demand (D-16 / Open Q5: excluded from the worklist). This array
 *  feeds a DB-side `.in('status', ...)` filter that fails SILENTLY on unknown
 *  codes - it MUST ship in the same deploy as the status-rename migration
 *  (Phase-12 same-deploy rule). */
const LIVE_CARD_STATUSES = new Set<DealCardStatus>(["negotiation", "confirmed"]);

/** Grams-only scope (DEV-157 #4) - see module doc. */
const GRAMS_UNITS = new Set(["g", "kg"]);

/** Pull `{batchId, grams}[]` out of a line's `metadata` jsonb, tolerating any
 *  legacy/foreign shape (returns null rather than throwing on bad data) - the
 *  same discipline as `catalog/shop.ts`'s `parseLinks`. */
function parseBatchSplits(metadata: Json): { batchId: string; grams: number }[] | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)["batchSplits"];
  if (!Array.isArray(raw)) return null;
  const splits = raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const batchId = (s as Record<string, unknown>)["batchId"];
      const grams = (s as Record<string, unknown>)["grams"];
      if (typeof batchId !== "string" || typeof grams !== "number") return null;
      return { batchId, grams };
    })
    .filter((s): s is { batchId: string; grams: number } => s !== null);
  return splits.length > 0 ? splits : null;
}

/** Derive the display-only units/unit-vol decomposition of a line's real
 *  stored `volTotalGrams` (see the module + type doc: deal_line_item only
 *  ever stores the total, never a separate pack-count). */
function decomposeUnits(
  volTotalGrams: number,
  packSizeGrams: number | null,
): { unitsOrdered: number; unitVolGrams: number } {
  if (packSizeGrams && packSizeGrams > 0) {
    return {
      unitsOrdered: Math.max(1, Math.round(volTotalGrams / packSizeGrams)),
      unitVolGrams: packSizeGrams,
    };
  }
  return { unitsOrdered: 1, unitVolGrams: volTotalGrams };
}

export async function getAllocationWorklist(): Promise<AllocationRow[]> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return [];

  // 1. Every still-live deal_card (both relationship members can see these
  // via RLS) - narrowed to the caller's own SELLER-side cards below.
  const { data: cardRows, error: cardErr } = await supabase
    .from("deal_card")
    .select("id, version, relationship_id, deal_type, initiating_company_id, status, created_at")
    .is("deleted_at", null)
    .in("status", Array.from(LIVE_CARD_STATUSES));
  if (cardErr) throw cardErr;
  const cards = cardRows ?? [];
  if (cards.length === 0) return [];

  // 2. The relationship pairs, to compute sellerCompanyId/buyerCompanyId per card.
  const relIds = Array.from(new Set(cards.map((c) => c.relationship_id)));
  const { data: relRows, error: relErr } = await supabase
    .from("relationship")
    .select("id, company_a_id, company_b_id")
    .in("id", relIds);
  if (relErr) throw relErr;
  const relById = new Map((relRows ?? []).map((r) => [r.id, r] as const));

  // 3. Narrow to cards where the CALLER is the derived seller (same guard as
  // Plan 2's getSellerOrders) - Allocate is a seller-ops surface, never buyer.
  type LiveCard = {
    id: string;
    version: number;
    deal_type: DealType;
    initiating_company_id: string;
    buyerCompanyId: string;
    createdAt: string;
  };
  const sellerCards: LiveCard[] = [];
  for (const c of cards) {
    const rel = relById.get(c.relationship_id);
    if (!rel) continue;
    const card = { deal_type: c.deal_type as DealType, initiating_company_id: c.initiating_company_id };
    if (sellerCompanyId(card, rel.company_a_id, rel.company_b_id) !== companyId) continue;
    sellerCards.push({
      id: c.id,
      version: c.version,
      deal_type: card.deal_type,
      initiating_company_id: card.initiating_company_id,
      buyerCompanyId: buyerCompanyId(card, rel.company_a_id, rel.company_b_id),
      createdAt: c.created_at,
    });
  }
  if (sellerCards.length === 0) return [];

  const versionByCard = new Map(sellerCards.map((c) => [c.id, c.version] as const));
  const buyerByCard = new Map(sellerCards.map((c) => [c.id, c.buyerCompanyId] as const));
  const receivedAtByCard = new Map(sellerCards.map((c) => [c.id, c.createdAt] as const));
  const cardIds = sellerCards.map((c) => c.id);

  // 4. The line items across those cards, grams-only (DEV-157 #4) - then keep
  // only each card's CURRENT version (no per-row join filter in postgrest, so
  // this mirrors getDealCard's own "fetch then filter in JS" discipline).
  const { data: lineRows, error: lineErr } = await supabase
    .from("deal_line_item")
    .select(
      "id, deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, batch_id, batch_number, allocation_status, allocation_locked_at, substituted_from_product_id, metadata",
    )
    .in("deal_card_id", cardIds)
    .in("unit", Array.from(GRAMS_UNITS));
  if (lineErr) throw lineErr;
  const lines = (lineRows ?? []).filter(
    (l) => l.version === versionByCard.get(l.deal_card_id) && l.product_id != null,
  );
  if (lines.length === 0) return [];

  // 5. Buyer company names (the "Customer" column).
  const buyerIds = Array.from(new Set(sellerCards.map((c) => c.buyerCompanyId)));
  const { data: companyRows, error: coErr } = await supabase
    .from("company")
    .select("id, name")
    .in("id", buyerIds);
  if (coErr) throw coErr;
  const companyNameById = new Map((companyRows ?? []).map((c) => [c.id, c.name] as const));

  // 6. The CURRENT (post-substitution) product for every line, real name + pack
  // size, PLUS the ORIGINAL product's name for any substituted line (so the
  // UI can render "struck-through original -> replacement" — the batch
  // picker below stays scoped to the CURRENT product only, never the original).
  const currentProductIds = Array.from(new Set(lines.map((l) => l.product_id as string)));
  const originalProductIds = lines
    .map((l) => l.substituted_from_product_id)
    .filter((id): id is string => id != null);
  const nameLookupIds = Array.from(new Set([...currentProductIds, ...originalProductIds]));
  const { data: productRows, error: prodErr } = await supabase
    .from("product")
    .select("id, name, pack_size_grams")
    .in("id", nameLookupIds);
  if (prodErr) throw prodErr;
  const productById = new Map((productRows ?? []).map((p) => [p.id, p] as const));

  // 7. Every LIVE batch of those products, FIFO oldest-first (ready_for_sale_date
  // ASC NULLS LAST, created_at ASC - the same ordering Plan 1's RPCs apply
  // server-side for substitution/cancel defaults; the read side must match).
  const { data: batchRows, error: batchErr } = await supabase
    .from("product_batch")
    .select("id, batch_number, product_id, quantity_grams")
    .in("product_id", currentProductIds)
    .is("deleted_at", null)
    .order("ready_for_sale_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (batchErr) throw batchErr;
  const batchesByProduct = new Map<string, { id: string; batchNumber: string; quantityGrams: number }[]>();
  for (const b of batchRows ?? []) {
    const list = batchesByProduct.get(b.product_id) ?? [];
    list.push({ id: b.id, batchNumber: b.batch_number, quantityGrams: Number(b.quantity_grams) });
    batchesByProduct.set(b.product_id, list);
  }

  // 8. Assemble the rows.
  const rows: AllocationRow[] = [];
  for (const l of lines) {
    const product = productById.get(l.product_id as string);
    // Defensive skip (should not happen against real catalog data): a line
    // whose current product no longer resolves has nothing to FIFO-batch
    // against, same reasoning as the grams-only filter above.
    if (!product) continue;

    const volTotalGrams = l.unit === "kg" ? Number(l.quantity) * 1000 : Number(l.quantity);
    const { unitsOrdered, unitVolGrams } = decomposeUnits(volTotalGrams, product.pack_size_grams);
    const pricePerGram = Number(l.unit_price);

    rows.push({
      lineItemId: l.id,
      dealCardId: l.deal_card_id,
      customerName: companyNameById.get(buyerByCard.get(l.deal_card_id) ?? "") ?? "Unknown company",
      buyerCompanyId: buyerByCard.get(l.deal_card_id) ?? "",
      productId: product.id,
      productName: product.name,
      substitutedFromProductId: l.substituted_from_product_id,
      substitutedFromProductName: l.substituted_from_product_id
        ? productById.get(l.substituted_from_product_id)?.name ?? null
        : null,
      unitsOrdered,
      unitVolGrams,
      volTotalGrams,
      pricePerGram,
      priceTotal: volTotalGrams * pricePerGram,
      batchId: l.batch_id,
      batchNumber: l.batch_number,
      batchSplits: parseBatchSplits(l.metadata),
      allocationStatus: l.allocation_status as "pending" | "supply" | "decline",
      locked: l.allocation_locked_at != null,
      availableBatches: batchesByProduct.get(product.id) ?? [],
      // Always resolves — every line here belongs to a sellerCards entry by
      // construction (its deal_card_id came from cardIds); the fallback only
      // guards TS's Map.get() optionality, not a real missing-data path.
      receivedAt: receivedAtByCard.get(l.deal_card_id) ?? new Date(0).toISOString(),
    });
  }
  return rows;
}
