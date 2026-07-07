/**
 * Public surface for the allocate module (Sell/Allocate surface, DEV-76).
 *
 * This barrel stays the ONLY public surface, exactly like deals/, messaging/,
 * and relationship/ — mirroring how `@/modules/deals` barrels its reads AND
 * its `"use server"` actions together. Plan 2 built the Orders read + status
 * derivation; Plan 3 built the Batches read/write side; this plan (4) is the
 * first point where both need a single shared barrel, so it finishes it here.
 */
export type { SellerOrderRow } from "./orders";
export { getSellerOrders } from "./orders";

export type { OrderStatus, OrderStatusCode, TicketStatus } from "./status";
export { statusOf, orderNumberOf, formatOrderDate, isKeyAccount } from "./status";

export type { AllocationRow } from "./batches";
export { getAllocationWorklist, computeBatchStock } from "./batches";

export {
  setLineAllocation,
  substituteLine,
  cancelSubstitution,
  confirmAllocations,
} from "./batchActions";
