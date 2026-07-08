/**
 * Pure CSV → validated purchase-history rows. No I/O, no Supabase.
 *
 * A minimal, backfill-only import for pre-Hello-Sello purchase history
 * (CONTEXT.md: "Exact CSV import minimal-version shape — keep it simple").
 * Ports `src/modules/catalog/parse.ts`'s tokenizer + per-cell coercion/error
 * discipline verbatim rather than inventing a second parsing approach — same
 * `CellError`/`ParseResult` 4-field contract, same "missing required column
 * blocks the whole import, a bad cell only excludes its own row" behaviour.
 *
 * The DB-insert side (writing parsed rows into the Analytics/Sheet's backing
 * store) is a separate later plan (18-08); this module only turns CSV text
 * into typed, validated rows.
 */

export type CellError = { row: number; column: string; message: string };

export type PurchaseHistoryRow = {
  row: number; // 1-based data row number (for error messages)
  supplierName: string;
  productName: string;
  purchaseDate: string; // ISO YYYY-MM-DD
  quantity: number;
  unit: "g" | "kg" | "unit";
  /** Price per the row's own Unit (g/kg/unit) — NOT normalized to grams here;
   *  that normalization happens in the analytics aggregation layer (plan 18-07,
   *  reusing `lineGrams()` from src/modules/allocate/calendar.ts). */
  unitPriceEur: number;
  currency: string; // defaults to "EUR" when the column is blank
};

export type ParseResult = {
  rows: PurchaseHistoryRow[];
  errors: CellError[];
  /** Required template headers missing from the upload — a blocking problem. */
  missingHeaders: string[];
  /** Uploaded headers we don't recognise — ignored, surfaced as a heads-up. */
  extraHeaders: string[];
};

type ColumnType = "text" | "number" | "date" | "enum";

type PurchaseHistoryColumn = {
  /** Exact header string the buyer's CSV must contain (case/whitespace tolerant match). */
  header: string;
  /** Destination field on `PurchaseHistoryRow`. */
  field: keyof Omit<PurchaseHistoryRow, "row">;
  type: ColumnType;
  required?: boolean;
  /** Allowed enum codes — must match `deal_line_unit.code` exactly (g/kg/unit). */
  codes?: readonly string[];
};

/** Must match `deal_line_unit.code` exactly — do not invent new unit codes. */
export const UNIT_CODES = ["g", "kg", "unit"] as const;

/**
 * The minimal purchase-history CSV template — one owner for both the parser
 * and any future "download a template" UI affordance / plan 18-08's import
 * action, so the column list can never drift between them.
 */
export const PURCHASE_HISTORY_COLUMNS: readonly PurchaseHistoryColumn[] = [
  { header: "Supplier Name", field: "supplierName", type: "text", required: true },
  { header: "Product Name", field: "productName", type: "text", required: true },
  { header: "Purchase Date", field: "purchaseDate", type: "date", required: true },
  { header: "Quantity", field: "quantity", type: "number", required: true },
  { header: "Unit", field: "unit", type: "enum", required: true, codes: UNIT_CODES },
  { header: "Unit Price (EUR)", field: "unitPriceEur", type: "number", required: true },
  { header: "Currency", field: "currency", type: "text" },
] as const;

// ---------- CSV parsing (quotes + embedded commas/newlines) ----------
// Ported verbatim from src/modules/catalog/parse.ts's `parseCsv` — that
// tokenizer is already solved and tested; this is not a new implementation.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().trim();

/** German money/decimal → number. "12,50" → 12.5 · "1.234,56" → 1234.56 */
export function parseGermanNumber(s: string): number | null {
  const t = s.replace(/[€%\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Accepts ISO (2026-07-02) or the platform's own DD-Mon-YY order-date shape
 * (01-Jul-26, `formatOrderDate` in src/modules/allocate/status.ts — 2-digit
 * year, assumed 20xx). Rejects anything else with a precise error upstream.
 */
export function parseDate(s: string): string | null {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return `20${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Resolve an enum value to its code (case/spacing tolerant, exact-match only). */
function toEnumCode(value: string, codes: readonly string[]): string | null {
  const v = norm(value);
  for (const code of codes) {
    if (norm(code) === v) return code;
  }
  return null;
}

/** Coerce one cell to its column's type. Returns the value or an error message. */
function coerce(raw: string, col: PurchaseHistoryColumn): { value: unknown } | { error: string } {
  const v = raw.trim();
  if (v === "") {
    if (col.required) return { error: "required, but empty" };
    return { value: null };
  }
  switch (col.type) {
    case "text": return { value: v };
    case "number": {
      const n = parseGermanNumber(v);
      return n === null ? { error: `"${v}" is not a number` } : { value: n };
    }
    case "date": {
      const d = parseDate(v);
      return d === null
        ? { error: `"${v}" is not a date (use 2026-07-02 or 01-Jul-26)` }
        : { value: d };
    }
    case "enum": {
      const code = toEnumCode(v, col.codes ?? []);
      return code === null
        ? { error: `"${v}" not one of: ${(col.codes ?? []).join(", ")}` }
        : { value: code };
    }
  }
}

export function parsePurchaseHistoryCsv(text: string): ParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0)
    return { rows: [], errors: [], missingHeaders: [], extraHeaders: [] };

  const header = grid[0];
  // map each uploaded header → its template column (by name), remembering the col index
  const colAt = new Map<number, PurchaseHistoryColumn>();
  const matchedHeaders = new Set<string>();
  header.forEach((h, i) => {
    const col = PURCHASE_HISTORY_COLUMNS.find((c) => norm(c.header) === norm(h));
    if (col) { colAt.set(i, col); matchedHeaders.add(col.header); }
  });

  const missingHeaders = PURCHASE_HISTORY_COLUMNS.filter(
    (c) => c.required && !matchedHeaders.has(c.header),
  ).map((c) => c.header);
  const extraHeaders = header.filter(
    (h) => h.trim() !== "" && !PURCHASE_HISTORY_COLUMNS.some((c) => norm(c.header) === norm(h)),
  );

  // A missing required column blocks the whole import (matches parse.ts's discipline).
  if (missingHeaders.length > 0) {
    return { rows: [], errors: [], missingHeaders, extraHeaders };
  }

  const rows: PurchaseHistoryRow[] = [];
  const errors: CellError[] = [];

  grid.slice(1).forEach((cells, ri) => {
    const rowNo = ri + 1;
    const out: Partial<PurchaseHistoryRow> = { row: rowNo };
    let rowHasError = false;

    colAt.forEach((col, idx) => {
      const res = coerce(cells[idx] ?? "", col);
      if ("error" in res) {
        errors.push({ row: rowNo, column: col.header, message: res.error });
        rowHasError = true;
        return;
      }
      if (res.value === null) return;
      (out as Record<string, unknown>)[col.field] = res.value;
    });

    if (rowHasError) return; // exclude only this row; the rest of the CSV still parses

    out.currency = out.currency ?? "EUR"; // blank Currency defaults, not an error
    rows.push(out as PurchaseHistoryRow);
  });

  return { rows, errors, missingHeaders, extraHeaders };
}
