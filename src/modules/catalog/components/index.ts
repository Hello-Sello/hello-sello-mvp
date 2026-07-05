// Public barrel for the catalog module's reusable Present components (D-REUSE-2/3).
// Other surfaces (buyer view, present mode, the Phase-17 deal basket) import these
// through this boundary only — never a deep path into the module internals.
// Still to come in later 07-plans: LocationGroup, MediaManager, InfoBox,
// PresentBanner, SaveBar.
export { ProductCard } from "./ProductCard";
export { PackSizeSelector } from "./PackSizeSelector";
