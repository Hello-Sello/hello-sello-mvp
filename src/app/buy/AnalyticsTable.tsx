"use client";

import { useState } from "react";
import Link from "next/link";
import type { BuyAnalytics, AnalyticsSupplierRow, AnalyticsCategoryRow, AnalyticsProductRow } from "@/modules/buy/analytics";
import { PencilEditCell } from "./PencilEditCell";
import type { ChartMeasure } from "./AnalyticsChart";

/**
 * Every numeric column a header click can identify — the 5 chartable
 * `ChartMeasure` values PLUS the 4 columns that have no chart representation
 * (`margin_percent`/`qty`/`share`/`db1_per_unit` — 18-10's `ChartMeasure`
 * deliberately excludes these so an invalid chart state is unrepresentable;
 * the parent, plan 18-12, shows a toast for these instead of switching the
 * chart's measure). This is the "ONE additional optional prop" plan 18-12's
 * `<interfaces>` calls for, typed to cover every real column rather than only
 * the chartable subset.
 */
export type TableColumnClick = ChartMeasure | "margin_percent" | "qty" | "share" | "db1_per_unit";

/**
 * Buy — the Analytics/Sheet block's 3-level drill-down table (plan 18-11).
 *
 * ONE sticky "Supplier / Product" tree column (18-CONTEXT.md, locked) — NOT
 * three separate supplier/category/product columns. Supplier -> category ->
 * product, +/- expand chips, indentation 16px (category) / 42px (product).
 * Collapsed rows show ONLY honest rollups (revenue/wap/DB1 total/margin/qty/
 * share) — net/gross/db1-per-unit stay visually blank (an em dash, never a
 * fabricated 0) above product level, since those are per-unit buyer-entered
 * values that cannot be honestly aggregated.
 *
 * Net/gross cells at product level render via the shared `PencilEditCell`
 * (plan 18-09) — this component integrates it, it does not reimplement the
 * edit affordance. A connected supplier's name links to its real
 * Relationship page (`relationshipId` from `getBuyPartners()`, plan 18-06);
 * an unconnected (history/CSV-only) supplier renders as plain text.
 *
 * v0 "degenerate category-per-product" rule (18-CONTEXT.md, locked): there is
 * no real `product.category` schema, so each category always wraps exactly
 * one product. This component renders whatever `getBuyAnalytics()` hands it
 * — it never fabricates or infers a category field itself.
 */

const fmtInt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatEur0(n: number | null): string {
  return n == null ? "–" : `${fmtInt.format(Math.round(n))} €`;
}
function formatEur2(n: number | null): string {
  return n == null ? "–" : `${fmt2.format(n)} €`;
}
function formatPercent(n: number | null): string {
  return n == null ? "–" : `${fmt2.format(n * 100)} %`;
}
function formatQty(n: number): string {
  return `${fmtInt.format(Math.round(n))} g`;
}

/** Blank marker for cells that must stay honestly empty above product level
 *  (never a fabricated 0/dash-as-zero) — an em dash, matching the rollup
 *  columns' own null-formatting convention above. */
function Blank() {
  return <span className="text-ink-muted/40">–</span>;
}

export function AnalyticsTable(props: {
  data: BuyAnalytics;
  selectedRowKey: string | null;
  onSelectRow: (key: string | null) => void;
  onSaveResalePrice: (
    supplierName: string,
    productName: string,
    field: "net" | "gross",
    value: number,
  ) => Promise<void>;
  /** Fires on any numeric column header click — the parent (plan 18-12) maps
   *  chartable columns to a `ChartMeasure` and shows a toast for the rest. */
  onColumnHeaderClick?: (column: TableColumnClick) => void;
  /** The column currently steering the chart (or null) — highlighted so
   *  "clicking a column highlights it" (18-CONTEXT.md, locked) is visible. */
  highlightedColumn?: TableColumnClick | null;
}) {
  const { data, selectedRowKey, onSelectRow, onSaveResalePrice, onColumnHeaderClick, highlightedColumn } = props;

  // Local expand/collapse state, keyed "supplierKey" and "supplierKey::categoryId"
  // so identically-named categories under different suppliers never collide.
  // Default: first supplier expanded, with its first category also expanded
  // (mirrors the finalized prototype's own demo-affordance default).
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(() => {
    const first = data.suppliers[0];
    return new Set(first ? [first.supplierKey] : []);
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    const first = data.suppliers[0];
    const firstCategory = first?.categories[0];
    return new Set(firstCategory ? [`${first.supplierKey}::${firstCategory.categoryId}`] : []);
  });

  function toggleSupplier(key: string) {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCategory(key: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectRow(key: string) {
    onSelectRow(selectedRowKey === key ? null : key);
  }

  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr>
            <Th sticky>Supplier / Product</Th>
            <Th numeric column="revenue" highlighted={highlightedColumn === "revenue"} onColumnClick={onColumnHeaderClick}>
              Revenue
            </Th>
            <Th numeric column="wap" highlighted={highlightedColumn === "wap"} onColumnClick={onColumnHeaderClick}>
              Avg. purchase price
            </Th>
            <Th numeric column="net" highlighted={highlightedColumn === "net"} onColumnClick={onColumnHeaderClick}>
              Net price
            </Th>
            <Th numeric column="gross" highlighted={highlightedColumn === "gross"} onColumnClick={onColumnHeaderClick}>
              Gross price
            </Th>
            <Th numeric column="db1_total" highlighted={highlightedColumn === "db1_total"} onColumnClick={onColumnHeaderClick}>
              DB1 total
            </Th>
            <Th numeric column="margin_percent" highlighted={highlightedColumn === "margin_percent"} onColumnClick={onColumnHeaderClick}>
              Margin %
            </Th>
            <Th numeric column="db1_per_unit" highlighted={highlightedColumn === "db1_per_unit"} onColumnClick={onColumnHeaderClick}>
              DB1 / unit
            </Th>
            <Th numeric column="qty" highlighted={highlightedColumn === "qty"} onColumnClick={onColumnHeaderClick}>
              Qty
            </Th>
            <Th numeric column="share" highlighted={highlightedColumn === "share"} onColumnClick={onColumnHeaderClick}>
              Share
            </Th>
          </tr>
        </thead>
        <tbody>
          {data.suppliers.map((supplier) => (
            <SupplierRows
              key={supplier.supplierKey}
              supplier={supplier}
              expandedSuppliers={expandedSuppliers}
              expandedCategories={expandedCategories}
              selectedRowKey={selectedRowKey}
              onToggleSupplier={toggleSupplier}
              onToggleCategory={toggleCategory}
              onSelectRow={selectRow}
              onSaveResalePrice={onSaveResalePrice}
            />
          ))}
          {data.suppliers.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-sm text-ink-muted">
                No purchase history yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SupplierRows({
  supplier,
  expandedSuppliers,
  expandedCategories,
  selectedRowKey,
  onToggleSupplier,
  onToggleCategory,
  onSelectRow,
  onSaveResalePrice,
}: {
  supplier: AnalyticsSupplierRow;
  expandedSuppliers: Set<string>;
  expandedCategories: Set<string>;
  selectedRowKey: string | null;
  onToggleSupplier: (key: string) => void;
  onToggleCategory: (key: string) => void;
  onSelectRow: (key: string) => void;
  onSaveResalePrice: (
    supplierName: string,
    productName: string,
    field: "net" | "gross",
    value: number,
  ) => Promise<void>;
}) {
  const isOpen = expandedSuppliers.has(supplier.supplierKey);
  const isSelected = selectedRowKey === supplier.supplierKey;

  return (
    <>
      <tr
        onClick={() => onSelectRow(supplier.supplierKey)}
        className={`cursor-pointer border-t border-black/[0.06] transition hover:bg-brand/[0.03] ${
          isSelected ? "bg-brand/[0.06]" : ""
        }`}
      >
        <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5">
            <ExpandChip
              open={isOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSupplier(supplier.supplierKey);
              }}
            />
            {supplier.connected && supplier.relationshipId ? (
              <Link
                href={`/connect/relationship/${supplier.relationshipId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-brand-deep underline-offset-2 hover:underline"
              >
                {supplier.supplierName}
              </Link>
            ) : (
              <span>{supplier.supplierName}</span>
            )}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatEur0(supplier.revenue)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatEur2(supplier.wap)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatEur0(supplier.db1Total)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(supplier.marginPercent)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(supplier.qty)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(supplier.share)}</td>
      </tr>
      {isOpen &&
        supplier.categories.map((category) => (
          <CategoryRows
            key={category.categoryId}
            supplierKey={supplier.supplierKey}
            supplierName={supplier.supplierName}
            category={category}
            expandedCategories={expandedCategories}
            selectedRowKey={selectedRowKey}
            onToggleCategory={onToggleCategory}
            onSelectRow={onSelectRow}
            onSaveResalePrice={onSaveResalePrice}
          />
        ))}
    </>
  );
}

function CategoryRows({
  supplierKey,
  supplierName,
  category,
  expandedCategories,
  selectedRowKey,
  onToggleCategory,
  onSelectRow,
  onSaveResalePrice,
}: {
  supplierKey: string;
  supplierName: string;
  category: AnalyticsCategoryRow;
  expandedCategories: Set<string>;
  selectedRowKey: string | null;
  onToggleCategory: (key: string) => void;
  onSelectRow: (key: string) => void;
  onSaveResalePrice: (
    supplierName: string,
    productName: string,
    field: "net" | "gross",
    value: number,
  ) => Promise<void>;
}) {
  const categoryKey = `${supplierKey}::${category.categoryId}`;
  const isOpen = expandedCategories.has(categoryKey);
  const isSelected = selectedRowKey === category.categoryId;

  return (
    <>
      <tr
        onClick={() => onSelectRow(category.categoryId)}
        className={`cursor-pointer border-t border-black/[0.04] transition hover:bg-brand/[0.03] ${
          isSelected ? "bg-brand/[0.06]" : ""
        }`}
      >
        <td className="sticky left-0 z-10 bg-white px-3 py-2 pl-[16px] text-ink">
          <span className="inline-flex items-center gap-1.5">
            <ExpandChip
              open={isOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCategory(categoryKey);
              }}
            />
            {category.categoryName}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{formatEur0(category.revenue)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatEur2(category.wap)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{formatEur0(category.db1Total)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(category.marginPercent)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Blank />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{formatQty(category.qty)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(category.share)}</td>
      </tr>
      {isOpen &&
        category.products.map((product) => (
          <ProductRow
            key={product.productId ?? product.productName}
            supplierName={supplierName}
            product={product}
            selectedRowKey={selectedRowKey}
            onSelectRow={onSelectRow}
            onSaveResalePrice={onSaveResalePrice}
          />
        ))}
    </>
  );
}

function ProductRow({
  supplierName,
  product,
  selectedRowKey,
  onSelectRow,
  onSaveResalePrice,
}: {
  supplierName: string;
  product: AnalyticsProductRow;
  selectedRowKey: string | null;
  onSelectRow: (key: string) => void;
  onSaveResalePrice: (
    supplierName: string,
    productName: string,
    field: "net" | "gross",
    value: number,
  ) => Promise<void>;
}) {
  const rowKey = product.productId ?? product.productName;
  const isSelected = selectedRowKey === rowKey;

  return (
    <tr
      onClick={() => onSelectRow(rowKey)}
      className={`group cursor-pointer border-t border-black/[0.04] transition hover:bg-brand/[0.03] ${
        isSelected ? "bg-brand/[0.06]" : ""
      }`}
    >
      <td className="sticky left-0 z-10 bg-white px-3 py-2 pl-[42px] text-ink-muted">{product.productName}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEur0(product.revenue)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEur2(product.wap)}</td>
      <td className="px-3 py-2 text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
        <PencilEditCell
          value={product.net}
          formatValue={formatEur2InputValue}
          onSave={(value) => onSaveResalePrice(supplierName, product.productName, "net", value)}
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
        <PencilEditCell
          value={product.gross}
          formatValue={formatEur2InputValue}
          onSave={(value) => onSaveResalePrice(supplierName, product.productName, "gross", value)}
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEur0(product.db1Total)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPercent(product.marginPercent)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatEur2(product.db1PerUnit)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatQty(product.qty)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPercent(product.share)}</td>
    </tr>
  );
}

/** formatValue for PencilEditCell's idle-filled display — plain "12,34 €", no
 *  null-dash handling needed here since PencilEditCell only calls this when
 *  `value` is non-null. */
function formatEur2InputValue(v: number): string {
  return `${fmt2.format(v)} €`;
}

function ExpandChip({ open, onClick }: { open: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Collapse" : "Expand"}
      className="grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-xs text-ink-muted transition hover:bg-black/[0.06] hover:text-ink"
    >
      {open ? "−" : "+"}
    </button>
  );
}

function Th({
  children,
  numeric,
  sticky,
  column,
  highlighted,
  onColumnClick,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  sticky?: boolean;
  column?: TableColumnClick;
  highlighted?: boolean;
  onColumnClick?: (column: TableColumnClick) => void;
}) {
  const clickable = column != null && onColumnClick != null;
  return (
    <th
      onClick={clickable ? () => onColumnClick(column) : undefined}
      className={`whitespace-nowrap bg-brand/[0.03] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted/70 ${
        numeric ? "text-right" : "text-left"
      } ${sticky ? "sticky left-0 z-20" : ""} ${clickable ? "cursor-pointer select-none hover:text-brand-deep" : ""} ${
        highlighted ? "bg-brand/[0.12] text-brand-deep" : ""
      }`}
    >
      {children}
    </th>
  );
}
