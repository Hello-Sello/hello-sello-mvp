"use server";

/**
 * Server action: parse a purchase-history CSV, then — only if the whole sheet
 * is clean — insert every row into `purchase_history_import` in one atomic
 * multi-row INSERT (a single SQL statement is already atomic in Postgres; no
 * RPC needed for this flat, single-table case). Mirrors
 * `importProductsFromCsv`'s validate-then-insert discipline
 * (src/modules/catalog/import.ts), minus the RPC — this table has no
 * multi-table fan-out to justify one.
 *
 * `buyer_company_id` is always resolved server-side via `getCurrentCompanyId()`
 * — never accepted from the client — so a caller can only ever backfill their
 * own company's purchase history (T-18-14).
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId, getCurrentUser } from "@/shared/auth";
import { parsePurchaseHistoryCsv, type CellError } from "./lib/csvParse";

export type CsvImportResult = {
  imported: number;
  errors: CellError[]; // from csvParse.ts — empty on success
  missingHeaders: string[];
};

export async function importPurchaseHistoryCsv(csvText: string): Promise<CsvImportResult> {
  const result = parsePurchaseHistoryCsv(csvText);

  // Block the import unless the whole sheet is clean — never a partial/silent
  // import (CONTEXT.md, ASVS V5). This guard runs BEFORE any `.insert(` call.
  if (result.errors.length > 0 || result.missingHeaders.length > 0) {
    return { imported: 0, errors: result.errors, missingHeaders: result.missingHeaders };
  }

  if (result.rows.length === 0) {
    return { imported: 0, errors: [], missingHeaders: [] };
  }

  const buyerCompanyId = await getCurrentCompanyId();
  if (!buyerCompanyId) {
    return {
      imported: 0,
      errors: [{ row: 0, column: "—", message: "No company found for the current user" }],
      missingHeaders: [],
    };
  }

  const user = await getCurrentUser();

  const supabase = await createClient();
  const { error } = await supabase.from("purchase_history_import").insert(
    result.rows.map((r) => ({
      buyer_company_id: buyerCompanyId,
      supplier_name: r.supplierName,
      product_name: r.productName,
      purchase_date: r.purchaseDate,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unitPriceEur,
      currency: r.currency,
      created_by: user?.id ?? null,
    })),
  );

  if (error) {
    return {
      imported: 0,
      errors: [{ row: 0, column: "—", message: error.message }],
      missingHeaders: [],
    };
  }

  revalidatePath("/buy");
  return { imported: result.rows.length, errors: [], missingHeaders: [] };
}
