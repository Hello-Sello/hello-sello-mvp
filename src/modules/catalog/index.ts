// Public boundary for the catalog module (modular-monolith rule, D-REUSE-3).
// Other surfaces import the shop read, the manage actions, and the reusable
// Present components through here — never a deep path into the module internals.
// import.ts / parse.ts / template.ts (CSV) are intentionally NOT exported — CSV
// ingestion is parked this phase (07-CONTEXT deferred).
export * from "./shop";
export * from "./manage";
export * from "./components";
