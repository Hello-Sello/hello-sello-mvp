// Public boundary for the catalog module (modular-monolith rule, D-REUSE-3).
// Other surfaces import the shop read, the manage actions, and the reusable
// Present components through here — never a deep path into the module internals.
// import.ts / parse.ts / template.ts (CSV) are intentionally NOT exported — CSV
// ingestion is parked this phase (07-CONTEXT deferred).
// shop.ts re-exported as TYPES only: its runtime read (getMyShop) pulls
// next/headers, so a value re-export would drag server-only code into any client
// component that imports a UI component from this barrel. The server page imports
// getMyShop directly from "./shop"; client surfaces get the types + actions + UI.
export type * from "./shop";
export * from "./manage";
export * from "./components";
// locations.ts is pure (no next/headers, no server-only import) — safe to
// re-export its value helper (used by the client-side warehouse editor) through
// this barrel, unlike shop.ts's runtime read.
export { renumberLocations } from "./locations";
