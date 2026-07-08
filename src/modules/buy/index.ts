/**
 * Public surface for the buy module (Buy surface, Phase 18/BUY-01).
 *
 * This barrel stays the ONLY public surface, mirroring `@/modules/allocate`'s
 * and `@/modules/deals`'s own barrel-of-barrels convention — consolidates
 * every buy sub-module (partners, analytics, csvImport, resalePriceActions,
 * plus the pure `lib/` helpers: openDeals, money, csvParse) now that all of
 * them are stable. Plan 18-13 (final composition) is the first point a single
 * shared barrel is actually needed, so it finishes it here.
 */
export type { BuyPartner, DealHistoryPartner, DealCardRow, RelationshipRow, CompanyRow } from "./partners";
export { dealHistoryPartners, mergePartners, getBuyPartners } from "./partners";

export type { BuyAnalytics, AnalyticsSupplierRow, AnalyticsCategoryRow, AnalyticsProductRow } from "./analytics";
export { getBuyAnalytics } from "./analytics";

export type { CsvImportResult } from "./csvImport";
export { importPurchaseHistoryCsv } from "./csvImport";

// `SaveBuyerResalePriceInput`/`Result` are typed here from `./lib/resalePriceRow`
// (NOT from `./resalePriceActions`) — that module is a `"use server"` file, and
// Turbopack's server-action codegen treats even a type-only re-export from a
// "use server" module as a runtime value it must resolve, which fails at
// request time. `buildResalePriceUpsertRow` (the sync pure builder living in
// the same lib file) is likewise NOT re-exported here for the same reason one
// step removed: Next.js requires every export of a `"use server"` file to be
// async, so the builder was moved out of `resalePriceActions.ts` entirely; it
// stays unit-tested directly against its own module (lib/resalePriceRow.test.ts).
export type { SaveBuyerResalePriceInput, SaveBuyerResalePriceResult } from "./lib/resalePriceRow";
export { saveBuyerResalePrice } from "./resalePriceActions";

export { isOpenDeal } from "./lib/openDeals";

export { weightedAveragePrice, db1Total, db1PerUnit, marginPercent } from "./lib/money";

export type { AnalyticsSourceLine, MergedAnalyticsLine } from "./lib/analyticsMerge";
export { mergeAnalyticsLines } from "./lib/analyticsMerge";

export type { CellError, PurchaseHistoryRow, ParseResult } from "./lib/csvParse";
export { UNIT_CODES, PURCHASE_HISTORY_COLUMNS, parseCsv, parseGermanNumber, parseDate, parsePurchaseHistoryCsv } from "./lib/csvParse";
