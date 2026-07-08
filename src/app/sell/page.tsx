import { getMyShop } from "@/modules/catalog/shop";
import { getSellerOrders, getAllocationWorklist } from "@/modules/allocate";
import { SurfacePlaceholder } from "@/shared/ui/SurfacePlaceholder";
import { OrdersTable } from "./OrdersTable";
import { BatchesSection } from "./BatchesSection";
import { SalesCalendarStub } from "./SalesCalendarStub";
import { JumpStrip } from "./JumpStrip";
import { AllocateDealCardHost } from "./AllocateDealCardHost";

/**
 * Allocate (Sell surface, DEV-76/DEV-157/DEV-151) — the seller's one
 * scrolling ops page: Orders & offers, then Batches, then a Sales-calendar
 * stub, in that order (SELL.md's locked scroll order). Assembles Plan 2's
 * Orders section and Plan 3's Batches section, both fed by real seeded data.
 *
 * Mirrors `src/app/present/page.tsx`'s shape: an async Server Component that
 * fetches its reads in parallel via `Promise.all`, then hands them to client
 * components as props. Reuses `getMyShop()` for the product photo strip
 * rather than writing a second product-photo read (Present's already covers
 * it) — mapped down to the small shape `BatchesSection`/`ProductStrip` need.
 */
export default async function SellPage() {
  const [orders, worklist, shop] = await Promise.all([
    getSellerOrders(),
    getAllocationWorklist(),
    getMyShop(),
  ]);

  if (!shop) {
    return (
      <SurfacePlaceholder
        title="Allocate"
        blurb="Finish company onboarding to start allocating orders."
      />
    );
  }

  const products = shop.products.map((p) => ({
    id: p.id,
    name: p.name,
    cultivar: p.cultivar,
    coverImagePath: p.images[0]?.path ?? null,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Allocate</h1>
        <div className="mt-1">
          <JumpStrip />
        </div>
      </div>

      <section id="orders-section">
        <OrdersTable orders={orders} />
      </section>

      <section id="batches-section">
        <BatchesSection worklist={worklist} products={products} />
      </section>

      <section id="calendar-section">
        <SalesCalendarStub />
      </section>

      <AllocateDealCardHost />
    </div>
  );
}
