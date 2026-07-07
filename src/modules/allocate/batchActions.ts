"use server";

/**
 * Batches allocator - server actions (Sell surface, DEV-76/DEV-157).
 *
 * Four thin wrappers, one per Plan 1 seller-only RPC. Same convention as
 * `src/modules/deals/actions.ts`: resolve the caller's company from the
 * SESSION (never trusted from input), call the RPC, `writeAudit` AFTER the
 * write succeeds, then `revalidatePath` so the worklist re-reads fresh - the
 * row's true persisted state (never a client-side-only "decided" flag).
 *
 * No seller-ownership check is duplicated here (T-260707-06): every RPC
 * already raises if the caller's company is not the line's derived seller.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { writeAudit } from "@/shared/audit";
import type { Json } from "@/types/database.types";

/** The seller's Decline/Substitute/Supply decision on a line, plus optional
 *  batch/batch-split assignment. `batchSplits` grams are HELD client-side
 *  until this call - the RPC re-verifies every batchId server-side against
 *  the caller's own catalogue before writing (T-260707-07). */
export async function setLineAllocation(
  lineItemId: string,
  decision: "pending" | "supply" | "decline",
  batchId?: string | null,
  batchSplits?: { batchId: string; grams: number }[] | null,
): Promise<void> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("setLineAllocation: no company in session");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("setLineAllocation: no authenticated user");

  const { error } = await supabase.rpc("set_line_allocation", {
    p_line_item_id: lineItemId,
    p_decision: decision,
    p_batch_id: batchId ?? undefined,
    p_batch_splits: (batchSplits ?? null) as unknown as Json,
  });
  if (error) throw new Error(error.message);

  // 'pending' has no matching action code in Plan 1's audit lookup (this
  // wrapper is never called with 'pending' from the UI - cancelSubstitution
  // owns reverting a line to pending, and audits that separately below); skip
  // the write rather than force a wrong code.
  const action = decision === "supply" ? "deal_line_item.allocated" : decision === "decline" ? "deal_line_item.declined" : null;
  if (action) {
    await writeAudit({
      actorType: "user",
      action,
      contentType: "deal_line_item",
      contentId: lineItemId,
      actorPersonId: user.id,
    });
  }

  revalidatePath("/sell");
}

/** Substitute a line onto a different product from the seller's OWN catalogue
 *  - atomically marks the row Supply too (DEV-157 #1, one click). */
export async function substituteLine(lineItemId: string, newProductId: string): Promise<void> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("substituteLine: no company in session");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("substituteLine: no authenticated user");

  const { error } = await supabase.rpc("substitute_line_product", {
    p_line_item_id: lineItemId,
    p_new_product_id: newProductId,
  });
  if (error) throw new Error(error.message);

  await writeAudit({
    actorType: "user",
    action: "deal_line_item.substituted",
    contentType: "deal_line_item",
    contentId: lineItemId,
    actorPersonId: user.id,
  });

  revalidatePath("/sell");
}

/** Undo a substitution (the small ✕, DEV-157 #5) - reverts to the original
 *  product, undecided. */
export async function cancelSubstitution(lineItemId: string): Promise<void> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("cancelSubstitution: no company in session");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("cancelSubstitution: no authenticated user");

  const { error } = await supabase.rpc("cancel_line_substitution", {
    p_line_item_id: lineItemId,
  });
  if (error) throw new Error(error.message);

  await writeAudit({
    actorType: "user",
    action: "deal_line_item.substitution_cancelled",
    contentType: "deal_line_item",
    contentId: lineItemId,
    actorPersonId: user.id,
  });

  revalidatePath("/sell");
}

/** Partial CONFIRM & SEND - locks every eligible id, leaving the rest pending
 *  for a later pass. Returns the count actually locked (the RPC's own count,
 *  the source of truth). */
export async function confirmAllocations(lineItemIds: string[]): Promise<number> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("confirmAllocations: no company in session");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("confirmAllocations: no authenticated user");

  const { data: count, error } = await supabase.rpc("confirm_line_allocations", {
    p_line_item_ids: lineItemIds,
  });
  if (error) throw new Error(error.message);

  // Audit exactly the lines this call actually locked. The UI only ever
  // passes ids that were NOT YET locked before this call (see AllocationTable's
  // "n = decided AND not locked" count), so re-reading which of THOSE ids are
  // now locked is an honest "what really changed" signal - the RPC's own
  // count has no per-id breakdown to audit against directly.
  if (lineItemIds.length > 0) {
    const { data: lockedRows } = await supabase
      .from("deal_line_item")
      .select("id")
      .in("id", lineItemIds)
      .not("allocation_locked_at", "is", null);
    for (const row of lockedRows ?? []) {
      await writeAudit({
        actorType: "user",
        action: "deal_line_item.allocation_confirmed",
        contentType: "deal_line_item",
        contentId: row.id,
        actorPersonId: user.id,
      });
    }
  }

  revalidatePath("/sell");
  return count ?? 0;
}
