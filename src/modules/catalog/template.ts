/**
 * The product-upload CSV template — the single source of truth for the import.
 *
 * We define the columns (name + order); users fill our sheet rather than us
 * guessing at theirs. This same list drives BOTH the validator (parse.ts) and
 * the template file we hand sellers, so the two can never drift.
 *
 * One row = one product + its current batch. A row fans out across several
 * tables on insert (see import.ts): product · pricelist_item · product_cost
 * (seller-only) · product_batch · batch_terpene.
 */

export type TargetTable = "product" | "pricelist" | "product_cost" | "batch" | "terpene";
export type ColumnType = "text" | "number" | "money" | "percent" | "bool" | "date" | "enum";

export type TemplateColumn = {
  /** Exact header string the seller sees in the template. */
  header: string;
  /** Destination column (or a synthetic key handled in import.ts). */
  field: string;
  table: TargetTable;
  type: ColumnType;
  required?: boolean;
  /** Allowed enum codes (already normalised). */
  codes?: readonly string[];
};

export const UNIT_CODES = ["g", "mL", "pack"] as const;
export const DOMINANCE_CODES = ["indica", "sativa", "hybrid", "indica_dominant", "sativa_dominant"] as const;
export const IRRADIATION_CODES = ["beta", "gamma", "un_irradiated"] as const;

export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  // --- product identity ---
  { header: "Product name", field: "name", table: "product", type: "text", required: true },
  { header: "Cultivar", field: "cultivar", table: "product", type: "text" },
  { header: "THC %", field: "thc_percent", table: "product", type: "percent", required: true },
  { header: "CBD %", field: "cbd_percent", table: "product", type: "percent", required: true },
  { header: "CBG %", field: "cbg_percent", table: "product", type: "percent" },
  { header: "CBN %", field: "cbn_percent", table: "product", type: "percent" },
  { header: "Pack size (g)", field: "pack_size_grams", table: "product", type: "number", required: true },
  { header: "Unit", field: "unit_code", table: "product", type: "enum", required: true, codes: UNIT_CODES },
  { header: "Supplier code", field: "supplier_product_code", table: "product", type: "text", required: true },
  { header: "PZN", field: "local_code_pzn", table: "product", type: "text" },
  { header: "Dominance", field: "dominance_code", table: "product", type: "enum", required: true, codes: DOMINANCE_CODES },
  { header: "Irradiation", field: "irradiation_code", table: "product", type: "enum", required: true, codes: IRRADIATION_CODES },
  { header: "Country", field: "country_of_origin", table: "product", type: "text" },
  { header: "Region", field: "region", table: "product", type: "text" },
  { header: "Cultivator", field: "cultivator", table: "product", type: "text" },
  { header: "Lineage A", field: "lineage_parent_a", table: "product", type: "text" },
  { header: "Lineage B", field: "lineage_parent_b", table: "product", type: "text" },
  { header: "Packaging", field: "packaging_material", table: "product", type: "text" },
  { header: "Resealable", field: "resealable", table: "product", type: "bool" },
  { header: "RRP per g", field: "rrp_per_gram", table: "product", type: "money" },
  { header: "Image filename", field: "image_path", table: "product", type: "text" },
  { header: "Visibility start", field: "visibility_start", table: "product", type: "date" },
  { header: "Visibility end", field: "visibility_end", table: "product", type: "date" },
  { header: "Show price publicly", field: "price_public", table: "product", type: "bool" },
  { header: "Note", field: "note", table: "product", type: "text" }, // → product.metadata.note

  // --- company-wide price (pricelist_item) ---
  { header: "Basic price per g", field: "price_per_gram", table: "pricelist", type: "money", required: true },
  { header: "Bundle min (g)", field: "bundle_threshold_grams", table: "pricelist", type: "number" },
  { header: "Bundle price per g", field: "bundle_price_per_gram", table: "pricelist", type: "money" },

  // --- seller-only ---
  { header: "COGS", field: "cogs", table: "product_cost", type: "money" },

  // --- current batch (product_batch) ---
  { header: "Batch number", field: "batch_number", table: "batch", type: "text" },
  { header: "Lab THC %", field: "thc_percent", table: "batch", type: "percent" },
  { header: "Lab CBD %", field: "cbd_percent", table: "batch", type: "percent" },
  { header: "Ready for sale date", field: "ready_for_sale_date", table: "batch", type: "date" },
  { header: "Expiry date", field: "expiry_date", table: "batch", type: "date" },

  // --- terpene profile (batch_terpene) — up to 3 ---
  { header: "Terpene 1", field: "t1_name", table: "terpene", type: "text" },
  { header: "Terpene 1 %", field: "t1_pct", table: "terpene", type: "percent" },
  { header: "Terpene 2", field: "t2_name", table: "terpene", type: "text" },
  { header: "Terpene 2 %", field: "t2_pct", table: "terpene", type: "percent" },
  { header: "Terpene 3", field: "t3_name", table: "terpene", type: "text" },
  { header: "Terpene 3 %", field: "t3_pct", table: "terpene", type: "percent" },
] as const;

/** The header row, in order — used to emit the downloadable template + match uploads. */
export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);

/** Render the empty template as CSV text (header row only). */
export function templateCsv(): string {
  return TEMPLATE_HEADERS.map(csvCell).join(",") + "\n";
}

/**
 * Render rows (keyed by template header) as a CSV the validator can parse. The
 * manual-add form uses this to route one product through the SAME validation +
 * import path as a CSV upload — so there is one authority, not two.
 */
export function buildCsv(rows: Record<string, string>[]): string {
  const head = TEMPLATE_HEADERS.map(csvCell).join(",");
  const body = rows.map((r) =>
    TEMPLATE_HEADERS.map((h) => csvCell(r[h] ?? "")).join(","),
  );
  return [head, ...body].join("\n") + "\n";
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
