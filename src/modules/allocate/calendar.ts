/**
 * Deal Calendar — pure derivation helpers (no Supabase, no React →
 * unit-testable), same "derive, don't store" house style as `status.ts`.
 * See `docs/muskan-build/deal-calendar.md` for the design contract.
 */

/**
 * Which day a pill sits on: the delivery date when the deal has one, else the
 * created (birth) date — a fresh offer with no agreed delivery yet still shows
 * immediately. (deal-calendar.md §2.)
 */
export function calendarDay(deliveryDate: string | null, createdAt: string): string {
  return deliveryDate ?? createdAt;
}

/** One deal's contribution to the calendar KPIs. */
export interface CalendarKpiInput {
  value: number;
  grams: number;
  counterpartyId: string;
}

export interface CalendarKpis {
  totalValue: number;
  dealCount: number;
  /** Blended €/g = Σ value ÷ Σ grams (weights big deals more; deal-calendar.md §3). */
  weightedAvgPrice: number;
  activeCounterparties: number;
}

/**
 * The four "Status this month" figures for a set of deals (the caller passes
 * the month's deals; this only aggregates). deal-calendar.md §3.
 */
export function calendarKpis(deals: CalendarKpiInput[]): CalendarKpis {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const totalGrams = deals.reduce((sum, d) => sum + d.grams, 0);
  return {
    totalValue,
    dealCount: deals.length,
    weightedAvgPrice: totalGrams === 0 ? 0 : totalValue / totalGrams,
    activeCounterparties: new Set(deals.map((d) => d.counterpartyId)).size,
  };
}
