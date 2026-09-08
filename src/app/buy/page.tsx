import { getBuyerOrders, OrdersTable } from "@/modules/allocate";
import { DealCardHost } from "@/shared/ui/DealCardHost";

/**
 * Buy (MVP cut) — just the Orders & offers table, the buyer's twin of Sell's
 * same section (BUY.md's full KPI-strip/calendar/analytics design is
 * deferred; this is the minimal "see what you've sent and received" slice).
 * Reuses `OrdersTable` as-is via `side="buyer"` rather than forking it —
 * same component Sell already ships, just fed `getBuyerOrders()` instead.
 */
export default async function BuyPage() {
  const orders = await getBuyerOrders();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold text-ink">Buy</h1>

      <OrdersTable orders={orders} side="buyer" />

      <DealCardHost />
    </div>
  );
}
