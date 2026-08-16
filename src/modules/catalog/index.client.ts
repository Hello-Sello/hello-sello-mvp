// Client-safe public door for catalog (two-door convention, ADR-0004 §4).
// The main index.ts re-exports "use server" manage actions; client modules
// (basket, deals) import pricing + the pricelist READ surface through THIS
// barrel. The write surface (savePriceLadder, lookupStandardPriceRow) stays
// module-internal — server actions import ./pricelist directly.
export * from "./pricing";
export {
  ladderErrorMessage,
  mapTiers,
  readCurrentPrices,
  type PriceDb,
  type ProductPrice,
} from "./pricelist";
