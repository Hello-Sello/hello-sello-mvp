"use client";

/**
 * Buy — the merged "Analytics + Sheet" glass card (plan 18-12). This is the ONE
 * place the filter/selection state that steers BOTH the chart (18-10) and the
 * table (18-11) actually lives — neither child owns any of it (Interface-First:
 * both were built and verified standalone first; this is the wiring layer).
 *
 * Also mounts the CSV upload entry point (`importPurchaseHistoryCsv`, plan
 * 18-08), rendering `CsvImportResult.errors` inline per-cell on a failed import.
 *
 * v0 data-shape honesty notes (read before changing the derivation logic below):
 *
 * 1. "Type" filter (`categoryId`) is degenerate-per-product (18-07's locked v0
 *    rule — no real `product.category` schema exists yet), so filtering by
 *    `categoryId` and by `productId` narrow to the exact same single row. Both
 *    pills render the same option list and produce identical re-scoping. This
 *    is an honest v0 limitation, not a stub — documented inline near the Type
 *    pill below.
 *
 * 2. "Pack size" (`packSize`) has NO backing field anywhere in `BuyAnalytics`
 *    (`getBuyAnalytics()`, plan 18-07, is out of this plan's `files_modified`
 *    scope) — the real per-product `product.pack_size_grams` column exists on
 *    the `product` table, but it isn't threaded through the Analytics
 *    aggregation. The pill is rendered and wired into `FilterState` (so it
 *    participates in "any filter change clears row selection" and the dynamic
 *    subtitle), but it has no real options to select and does not change what
 *    the chart/table show — documented inline near the Pack size pill. A
 *    follow-up plan should extend `getBuyAnalytics()` to carry pack-size data
 *    before this pill can filter anything for real.
 *
 * 3. There is no per-transaction date anywhere in `BuyAnalytics` either —
 *    `getBuyAnalytics()` returns period-summed totals per (supplier, product),
 *    not a real time series. So the chart cannot honestly render true weekly/
 *    monthly/daily bars. Instead of fabricating calendar buckets, the chart's
 *    bars are ONE PER ENTITY at the current scope's most granular level
 *    (supplier, or category/product once narrowed) — see `buildChartPoints()`.
 *    The "Time" pill / Quick-range chips still work (they narrow the label
 *    text used in the subtitle and clear row selection like any other filter)
 *    but do not change WHICH purchase lines are summed, for the same reason.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, X } from "lucide-react";
import type { BuyAnalytics, AnalyticsProductRow } from "@/modules/buy/analytics";
import { weightedAveragePrice } from "@/modules/buy/lib/money";
import { importPurchaseHistoryCsv, type CsvImportResult } from "@/modules/buy/csvImport";
import { saveBuyerResalePrice } from "@/modules/buy/resalePriceActions";
import { AnalyticsChart, MEASURE_LABELS, type ChartMeasure, type ChartSeriesPoint } from "./AnalyticsChart";
import { AnalyticsTable, type TableColumnClick } from "./AnalyticsTable";

type TimeFilter = "7d" | "14d" | "month" | "3months";

interface FilterState {
  time: TimeFilter;
  supplierKey: string | null;
  /** "Type" pill — v0 degenerate-per-product, see file header note #1. */
  categoryId: string | null;
  productId: string | null;
  /** "Pack size" pill — no backing data yet, see file header note #2. */
  packSize: string | null;
}

const TIME_OPTIONS: Array<{ value: TimeFilter; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "month", label: "Last month" },
  { value: "3months", label: "Last 3 months" },
];
const TIME_LABEL: Record<TimeFilter, string> = Object.fromEntries(
  TIME_OPTIONS.map((o) => [o.value, o.label.toLowerCase()]),
) as Record<TimeFilter, string>;

/** Table column -> chart measure, for the 5 columns that ARE chartable. The
 *  other 4 numeric columns (margin %, qty, share, db1/unit) have no
 *  corresponding `ChartMeasure` (18-10's `AnalyticsChart.tsx`, out of this
 *  plan's file scope, deliberately excludes them so an invalid chart state is
 *  unrepresentable) — clicking any of those shows the toast instead. */
const CHARTABLE_COLUMNS: Partial<Record<TableColumnClick, ChartMeasure>> = {
  revenue: "revenue",
  wap: "wap",
  net: "net",
  gross: "gross",
  db1_total: "db1_total",
};

interface FlatProduct {
  product: AnalyticsProductRow;
  supplierName: string;
}

function flattenAll(data: BuyAnalytics): FlatProduct[] {
  const out: FlatProduct[] = [];
  for (const s of data.suppliers) {
    for (const c of s.categories) {
      for (const p of c.products) out.push({ product: p, supplierName: s.supplierName });
    }
  }
  return out;
}

/** Narrows `data` to the supplier/category-or-product currently in `filters`
 *  scope — the SAME re-scoped tree is passed to `AnalyticsTable` (so the table
 *  visibly reflects the filter, per the must-have) and used as the chart's
 *  scope when no row is explicitly selected. `categoryId` and `productId` are
 *  treated as one combined "product-ish" filter (note #1 above — they resolve
 *  to the same row in v0). */
function filterAnalytics(data: BuyAnalytics, filters: FilterState): BuyAnalytics {
  const productFilter = filters.categoryId ?? filters.productId;
  let suppliers = data.suppliers;
  if (filters.supplierKey) {
    suppliers = suppliers.filter((s) => s.supplierKey === filters.supplierKey);
  }
  if (productFilter) {
    suppliers = suppliers
      .map((s) => ({
        ...s,
        categories: s.categories.filter(
          (c) =>
            c.categoryId === productFilter ||
            c.products.some((p) => (p.productId ?? p.productName) === productFilter),
        ),
      }))
      .filter((s) => s.categories.length > 0);
  }
  return { suppliers, totalRevenue: data.totalRevenue };
}

interface ResolvedScope {
  label: string;
  products: FlatProduct[];
}

/** Resolves a table row key (supplierKey, categoryId, or productId/productName
 *  — the same three key spaces `AnalyticsTable` uses for `onSelectRow`) to its
 *  own data slice, searched depth-first supplier -> category -> product so a
 *  key is matched at its most specific level first. */
function resolveScope(data: BuyAnalytics, key: string): ResolvedScope | null {
  for (const s of data.suppliers) {
    if (s.supplierKey === key) {
      const products = flattenAll({ suppliers: [s], totalRevenue: data.totalRevenue });
      return { label: s.supplierName, products };
    }
  }
  for (const s of data.suppliers) {
    for (const c of s.categories) {
      if (c.categoryId === key) {
        return { label: c.categoryName, products: c.products.map((p) => ({ product: p, supplierName: s.supplierName })) };
      }
      for (const p of c.products) {
        if ((p.productId ?? p.productName) === key) {
          return { label: p.productName, products: [{ product: p, supplierName: s.supplierName }] };
        }
      }
    }
  }
  return null;
}

function valueForMeasure(product: AnalyticsProductRow, measure: ChartMeasure): number {
  switch (measure) {
    case "price_by_volume":
    case "revenue":
      return product.revenue ?? 0;
    case "db1_total":
      return product.db1Total ?? 0;
    case "wap":
      return product.wap;
    case "net":
      return product.net ?? 0;
    case "gross":
      return product.gross ?? 0;
  }
}

/** One bar's worth of data for a given (label, products-in-that-bar) pairing —
 *  the weighted-avg-price line value is reconstructed via the SAME authoritative
 *  `weightedAveragePrice()` (lib/money.ts) the server aggregation itself uses,
 *  never re-derived: `product.wap * product.qty` recovers that product's own
 *  total spend exactly (wap is defined as totalSpend / totalGrams), so summing
 *  it back across products in the bar is not a fabrication. */
function pointFor(label: string, products: FlatProduct[], measure: ChartMeasure): ChartSeriesPoint {
  const byProduct = products.map(({ product }) => ({
    productId: product.productId ?? product.productName,
    productName: product.productName,
    value: valueForMeasure(product, measure),
  }));
  const totalGrams = products.reduce((sum, { product }) => sum + product.qty, 0);
  const totalSpend = products.reduce((sum, { product }) => sum + product.wap * product.qty, 0);
  return {
    label,
    byProduct,
    weightedAvgPrice: totalGrams > 0 ? weightedAveragePrice(totalSpend, totalGrams) : null,
  };
}

/**
 * Builds the chart's bars. There is no real per-transaction date in
 * `BuyAnalytics` (file header note #3) so this renders one bar per entity at
 * the current scope's most granular level, instead of fabricating calendar
 * buckets: multiple suppliers in scope -> one bar per supplier; a single
 * supplier with multiple categories -> one bar per category; fully narrowed to
 * one category -> one bar for its products.
 */
function buildChartPoints(scoped: BuyAnalytics, measure: ChartMeasure): ChartSeriesPoint[] {
  if (scoped.suppliers.length > 1) {
    return scoped.suppliers.map((s) =>
      pointFor(s.supplierName, flattenAll({ suppliers: [s], totalRevenue: scoped.totalRevenue }), measure),
    );
  }
  const supplier = scoped.suppliers[0];
  if (!supplier) return [];
  if (supplier.categories.length > 1) {
    return supplier.categories.map((c) =>
      pointFor(c.categoryName, c.products.map((p) => ({ product: p, supplierName: supplier.supplierName })), measure),
    );
  }
  const category = supplier.categories[0];
  if (!category) return [];
  return [pointFor(category.categoryName, category.products.map((p) => ({ product: p, supplierName: supplier.supplierName })), measure)];
}

/** Distinct products across the whole (unfiltered) dataset — the shared option
 *  list for BOTH the Type pill and the Product pill (note #1: they're the same
 *  list in v0, since a "category" is always exactly one product). */
function distinctProducts(data: BuyAnalytics): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const { product } of flattenAll(data)) {
    const id = product.productId ?? product.productName;
    if (!seen.has(id)) seen.set(id, product.productName);
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

export function PartnersAnalyticsCard({ data }: { data: BuyAnalytics }) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>({
    time: "3months",
    supplierKey: null,
    categoryId: null,
    productId: null,
    packSize: null,
  });
  const [measure, setMeasure] = useState<ChartMeasure>("price_by_volume");
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  // Rule 1: any filter-pill change clears the row selection ("last interaction
  // wins" — a filter change and a row selection are mutually exclusive scopes).
  function updateFilters(patch: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setSelectedRowKey(null);
  }

  function handleSelectRow(key: string | null) {
    setSelectedRowKey(key);
  }

  function handleColumnHeaderClick(column: TableColumnClick) {
    const chartMeasure = CHARTABLE_COLUMNS[column];
    if (!chartMeasure) {
      showToast("This column only highlights, it doesn't chart in euros.");
      return;
    }
    setMeasure(chartMeasure);
  }

  async function handleSaveResalePrice(
    supplierName: string,
    productName: string,
    field: "net" | "gross",
    value: number,
  ) {
    const result = await saveBuyerResalePrice({ supplierName, productName, field, value });
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  const filteredData = useMemo(() => filterAnalytics(data, filters), [data, filters]);

  const chartScope = useMemo((): ResolvedScope => {
    if (selectedRowKey) {
      return (
        resolveScope(filteredData, selectedRowKey) ??
        resolveScope(data, selectedRowKey) ?? { label: "", products: [] }
      );
    }
    return { label: "", products: flattenAll(filteredData) };
  }, [data, filteredData, selectedRowKey]);

  const series = useMemo(
    () => buildChartPoints({ suppliers: filteredData.suppliers, totalRevenue: filteredData.totalRevenue }, measure),
    [filteredData, measure],
  );
  // When a specific row is selected, the chart shows that node's own slice as
  // ONE bar rather than the scope's progressive per-entity breakdown (rule 3).
  const chartSeries = selectedRowKey ? [pointFor(chartScope.label, chartScope.products, measure)] : series;

  const supplierOptions = data.suppliers.map((s) => ({ key: s.supplierKey, name: s.supplierName }));
  const productOptions = useMemo(() => distinctProducts(data), [data]);

  const supplierCount = new Set(chartScope.products.length ? chartScope.products.map((p) => p.supplierName) : filteredData.suppliers.map((s) => s.supplierName)).size;
  const productCount = chartScope.products.length
    ? new Set(chartScope.products.map(({ product }) => product.productId ?? product.productName)).size
    : new Set(flattenAll(filteredData).map(({ product }) => product.productId ?? product.productName)).size;

  const title = [MEASURE_LABELS[measure], chartScope.label].filter(Boolean).join(" — ");
  const subtitleParts = [
    `${supplierCount} supplier${supplierCount === 1 ? "" : "s"}`,
    `${productCount} product${productCount === 1 ? "" : "s"}`,
    TIME_LABEL[filters.time],
  ];
  if (filters.packSize) subtitleParts.push(`${filters.packSize} packs`);
  const subtitle = subtitleParts.join(" · ");

  const tableTitle = selectedRowKey ? `Purchases & margins — ${chartScope.label}` : "Purchases & margins";

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Analytics</h2>
          <p className="text-[12px] text-ink-muted">
            the graph is the graph view of the table &middot; the filter rail on the left steers both
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-stretch">
        <FilterRail
          filters={filters}
          onChange={updateFilters}
          supplierOptions={supplierOptions}
          productOptions={productOptions}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AnalyticsChart
            measure={measure}
            series={chartSeries}
            title={title}
            subtitle={subtitle}
            onResetToDefault={() => setMeasure("price_by_volume")}
          />

          <div className="h-px bg-black/[0.06]" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-ink">{tableTitle}</h3>
              <p className="text-[11.5px] text-ink-muted">
                click a supplier, category or product row &mdash; the graph follows &middot; click a
                euro column header to chart it
              </p>
            </div>
          </div>

          <AnalyticsTable
            data={filteredData}
            selectedRowKey={selectedRowKey}
            onSelectRow={handleSelectRow}
            onSaveResalePrice={handleSaveResalePrice}
            onColumnHeaderClick={handleColumnHeaderClick}
            highlightedColumn={
              (Object.keys(CHARTABLE_COLUMNS) as TableColumnClick[]).find(
                (col) => CHARTABLE_COLUMNS[col] === measure,
              ) ?? null
            }
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-muted">
              DB1 is computed per selling unit &mdash; never averaged across pack sizes.
            </span>
            <CsvUploadButton onImported={() => router.refresh()} />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}

function FilterRail({
  filters,
  onChange,
  supplierOptions,
  productOptions,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  supplierOptions: Array<{ key: string; name: string }>;
  productOptions: Array<{ id: string; name: string }>;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-56">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted/70">Filters</div>
        <div className="text-[11px] text-ink-muted">filter the graph and the table together</div>
      </div>

      <FilterPill
        label="Time"
        value={filters.time}
        display={TIME_OPTIONS.find((o) => o.value === filters.time)?.label ?? "All"}
        options={TIME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onSelect={(v) => onChange({ time: v as TimeFilter })}
      />

      <FilterPill
        label="Supplier"
        value={filters.supplierKey}
        display={supplierOptions.find((s) => s.key === filters.supplierKey)?.name ?? "All"}
        options={[
          { value: "", label: "All suppliers" },
          ...supplierOptions.map((s) => ({ value: s.key, label: s.name })),
        ]}
        onSelect={(v) => onChange({ supplierKey: v || null })}
      />

      <div>
        <FilterPill
          label="Type"
          value={filters.categoryId}
          display={productOptions.find((p) => p.id === filters.categoryId)?.name ?? "All"}
          options={[
            { value: "", label: "All types" },
            ...productOptions.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onSelect={(v) => onChange({ categoryId: v || null })}
        />
        <p className="mt-1 text-[10px] leading-snug text-ink-muted/70">
          v0: no real product-category data yet, so Type narrows to the same single row as Product.
        </p>
      </div>

      <FilterPill
        label="Product"
        value={filters.productId}
        display={productOptions.find((p) => p.id === filters.productId)?.name ?? "All"}
        options={[
          { value: "", label: "All products" },
          ...productOptions.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onSelect={(v) => onChange({ productId: v || null })}
      />

      <div>
        <FilterPill
          label="Pack size"
          value={filters.packSize}
          display={filters.packSize ?? "All"}
          options={[{ value: "", label: "All pack sizes" }]}
          onSelect={(v) => onChange({ packSize: v || null })}
        />
        <p className="mt-1 text-[10px] leading-snug text-ink-muted/70">
          v0: pack-size data isn&apos;t threaded through Analytics yet &mdash; no effect until it is.
        </p>
      </div>

      <div className="mt-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted/70">Quick range</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TIME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange({ time: o.value })}
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition ${
                filters.time === o.value ? "bg-brand text-white" : "bg-ink/5 text-ink-muted hover:bg-ink/10"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function FilterPill({
  label,
  display,
  options,
  onSelect,
}: {
  label: string;
  value: string | null;
  display: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-left text-[12px] font-semibold text-ink hover:border-brand/40"
      >
        <span className="text-ink-muted/70">{label}</span>
        <span className="truncate">{display}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[180px] overflow-auto rounded-xl border border-black/[0.06] bg-white p-1 shadow-lg">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-brand/[0.06]"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CsvUploadButton({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    const text = await file.text();
    const outcome = await importPurchaseHistoryCsv(text);
    setBusy(false);
    setResult(outcome);
    if (outcome.errors.length === 0 && outcome.missingHeaders.length === 0) {
      onImported();
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const hasFailure = result && (result.errors.length > 0 || result.missingHeaders.length > 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-ink-muted hover:border-brand/40 hover:text-brand-deep disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
        Upload CSV to see your sales &amp; purchases
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPick} />

      {hasFailure && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-2xl border border-rose-200 bg-white p-3 text-[12px] shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-bold text-rose-700">Import failed</span>
            <button type="button" onClick={() => setResult(null)} aria-label="Dismiss">
              <X size={14} className="text-ink-muted" />
            </button>
          </div>
          {result.missingHeaders.length > 0 && (
            <p className="text-ink-muted">
              Missing required column{result.missingHeaders.length === 1 ? "" : "s"}:{" "}
              {result.missingHeaders.join(", ")}
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-auto">
              {result.errors.map((error, i) => (
                <li key={i} className="text-ink-muted">
                  Row {error.row}, {error.column}: {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && !hasFailure && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-2xl border border-emerald-200 bg-white p-3 text-[12px] font-semibold text-emerald-700 shadow-xl">
          Imported {result.imported} row{result.imported === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}
