/**
 * Pure CSV → validated rows, checked against TEMPLATE_COLUMNS. No I/O.
 *
 * Because we own the template, this validates rather than guesses: it matches
 * uploaded headers to template columns by name (order-independent), coerces each
 * cell to its declared type (German numbers, %/€, enum codes, dates), and reports
 * a precise error per offending cell. import.ts consumes the typed rows.
 */
import {
  TEMPLATE_COLUMNS,
  type TemplateColumn,
} from "./template";

export type CellError = { row: number; column: string; message: string };

export type ParsedRow = {
  row: number; // 1-based data row number (for error messages)
  product: Record<string, unknown>;
  pricelist: Record<string, unknown>;
  productCost: Record<string, unknown>;
  batch: Record<string, unknown>;
  terpenes: { name: string; pct: number | null }[];
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: CellError[];
  /** Required template headers missing from the upload — a blocking problem. */
  missingHeaders: string[];
  /** Uploaded headers we don't recognise — ignored, surfaced as a heads-up. */
  extraHeaders: string[];
};

// ---------- CSV parsing (quotes + embedded commas/newlines) ----------
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

/** German money/decimal → number. "13,00€" → 13 · "27,91%" → 27.91 */
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

/** Accepts ISO (2026-08-13) or DD-Mon-YYYY (13-Aug-2026 / 13-Aug.-2026). */
export function parseDate(s: string): string | null {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-.\s]+([A-Za-z]{3})\.?[-.\s]+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const BOOL_TRUE = new Set(["yes", "true", "1", "y", "ja"]);
const BOOL_FALSE = new Set(["no", "false", "0", "n", "nein", ""]);

/** Resolve an enum display value to its code (case/spacing/hyphen tolerant). */
function toEnumCode(value: string, codes: readonly string[]): string | null {
  const want = norm(value).replace(/[\s-]+/g, "_");
  for (const code of codes) {
    if (norm(code) === norm(value) || norm(code) === want) return code;
  }
  return null;
}

/** Coerce one cell to its column's type. Returns the value or an error message. */
function coerce(raw: string, col: TemplateColumn): { value: unknown } | { error: string } {
  const v = raw.trim();
  if (v === "") {
    if (col.required) return { error: "required, but empty" };
    return { value: null };
  }
  switch (col.type) {
    case "text": return { value: v };
    case "number":
    case "money":
    case "percent": {
      const n = parseGermanNumber(v);
      return n === null ? { error: `"${v}" is not a number` } : { value: n };
    }
    case "bool": {
      const n = norm(v);
      if (BOOL_TRUE.has(n)) return { value: true };
      if (BOOL_FALSE.has(n)) return { value: false };
      return { error: `"${v}" is not yes/no` };
    }
    case "date": {
      const d = parseDate(v);
      return d === null ? { error: `"${v}" is not a date (use 2026-08-13 or 13-Aug-2026)` } : { value: d };
    }
    case "enum": {
      const code = toEnumCode(v, col.codes ?? []);
      return code === null
        ? { error: `"${v}" not one of: ${(col.codes ?? []).join(", ")}` }
        : { value: code };
    }
  }
}

export function parseProductsCsv(text: string): ParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0)
    return { rows: [], errors: [], missingHeaders: [], extraHeaders: [] };

  const header = grid[0];
  // map each uploaded header → its template column (by name), and remember the col index
  const colAt = new Map<number, TemplateColumn>();
  const matchedHeaders = new Set<string>();
  header.forEach((h, i) => {
    const col = TEMPLATE_COLUMNS.find((c) => norm(c.header) === norm(h));
    if (col) { colAt.set(i, col); matchedHeaders.add(col.header); }
  });

  const missingHeaders = TEMPLATE_COLUMNS.filter(
    (c) => c.required && !matchedHeaders.has(c.header),
  ).map((c) => c.header);
  const extraHeaders = header.filter(
    (h) => h.trim() !== "" && !TEMPLATE_COLUMNS.some((c) => norm(c.header) === norm(h)),
  );

  const rows: ParsedRow[] = [];
  const errors: CellError[] = [];

  grid.slice(1).forEach((cells, ri) => {
    const rowNo = ri + 1;
    const out: ParsedRow = {
      row: rowNo, product: {}, pricelist: {}, productCost: {}, batch: {}, terpenes: [],
    };
    const terp: Record<string, unknown> = {};
    colAt.forEach((col, idx) => {
      const res = coerce(cells[idx] ?? "", col);
      if ("error" in res) {
        errors.push({ row: rowNo, column: col.header, message: res.error });
        return;
      }
      if (res.value === null) return;
      switch (col.table) {
        case "product": out.product[col.field] = res.value; break;
        case "pricelist": out.pricelist[col.field] = res.value; break;
        case "product_cost": out.productCost[col.field] = res.value; break;
        case "batch": out.batch[col.field] = res.value; break;
        case "terpene": terp[col.field] = res.value; break;
      }
    });
    // fold the 3 terpene pairs into a list
    for (const n of ["1", "2", "3"]) {
      const name = terp[`t${n}_name`] as string | undefined;
      if (name) out.terpenes.push({ name, pct: (terp[`t${n}_pct`] as number) ?? null });
    }
    rows.push(out);
  });

  return { rows, errors, missingHeaders, extraHeaders };
}
