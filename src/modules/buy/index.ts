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

export type { SaveBuyerResalePriceInput, SaveBuyerResalePriceResult } from "./resalePriceActions";
export { buildResalePriceUpsertRow, saveBuyerResalePrice } from "./resalePriceActions";

export { isOpenDeal } from "./lib/openDeals";

export { weightedAveragePrice, db1Total, db1PerUnit, marginPercent } from "./lib/money";

export type { AnalyticsSourceLine, MergedAnalyticsLine } from "./lib/analyticsMerge";
export { mergeAnalyticsLines } from "./lib/analyticsMerge";

export type { CellError, PurchaseHistoryRow, ParseResult } from "./lib/csvParse";
export { UNIT_CODES, PURCHASE_HISTORY_COLUMNS, parseCsv, parseGermanNumber, parseDate, parsePurchaseHistoryCsv } from "./lib/csvParse";
