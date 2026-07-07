// Public barrel for the catalog module's reusable Present components. Other
// surfaces (buyer view, present mode, the deal basket) import these through this
// boundary only — never a deep path into the module internals.
export { ProductCard } from "./ProductCard";
export type {
  ProductDraft, ProductFieldDraft, PendingBatchInsert, PendingBatchEdit, BatchRef,
} from "./ProductCard";
export { PackSizeSelector } from "./PackSizeSelector";
export { LocationGroup } from "./LocationGroup";
export { MediaManager } from "./MediaManager";
