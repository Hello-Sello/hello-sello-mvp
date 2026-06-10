"use server";

/**
 * Server action: validate a product CSV against the template, then import it
 * atomically via the `import_products` RPC (all rows or none). The seller's
 * company is resolved inside the RPC from the session — never passed in — so a
 * caller can only ever import into their own shop.
 */
import { createClient } from "@/shared/db/server";
import type { Json } from "@/types/database.types";
import { parseProductsCsv, type CellError } from "./parse";

export type ImportOutcome =
  | { ok: false; stage: "validate"; missingHeaders: string[]; extraHeaders: string[]; errors: CellError[] }
  | { ok: false; stage: "insert"; message: string }
  | { ok: true; imported: number; extraHeaders: string[] };

export async function importProductsFromCsv(csvText: string): Promise<ImportOutcome> {
  const parsed = parseProductsCsv(csvText);

  // Block the import unless the whole sheet is clean — the seller fixes the CSV
  // and retries, rather than getting a half-mapped catalog.
  if (parsed.missingHeaders.length > 0 || parsed.errors.length > 0 || parsed.rows.length === 0) {
    return {
      ok: false,
      stage: "validate",
      missingHeaders: parsed.missingHeaders,
      extraHeaders: parsed.extraHeaders,
      errors: parsed.rows.length === 0 && parsed.errors.length === 0
        ? [{ row: 0, column: "—", message: "No data rows found" }]
        : parsed.errors,
    };
  }

  const supabase = await createClient();
  const p_rows = parsed.rows.map((r) => ({
    product: r.product,
    pricelist: r.pricelist,
    productCost: r.productCost,
    batch: r.batch,
    terpenes: r.terpenes,
  }));

  // rows are plain scalars/arrays/objects → valid JSON; the RPC arg is typed Json
  const { data, error } = await supabase.rpc("import_products", { p_rows: p_rows as unknown as Json });
  if (error) return { ok: false, stage: "insert", message: error.message };

  const imported = (data as { imported?: number } | null)?.imported ?? p_rows.length;
  return { ok: true, imported, extraHeaders: parsed.extraHeaders };
}
