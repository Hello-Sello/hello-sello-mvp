"use client";

import { useState } from "react";
import { ProductStrip, type ProductStripItem } from "./ProductStrip";
import { AllocationTable } from "./AllocationTable";
import type { AllocationRow } from "@/modules/allocate";

/**
 * The Batches section's small stateful wrapper (Sell/Allocate surface,
 * DEV-76) — holds `selectedProductId`, the ONE piece of shared client state
 * between Plan 3's `ProductStrip` (sets it) and `AllocationTable` (filters by
 * it). Belongs at the page-composition layer, not inside either component.
 */
export function BatchesSection({
  worklist,
  products,
}: {
  worklist: AllocationRow[];
  products: ProductStripItem[];
}) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ProductStrip products={products} selectedId={selectedProductId} onSelect={setSelectedProductId} />
      <AllocationTable worklist={worklist} selectedProductId={selectedProductId} />
    </div>
  );
}
