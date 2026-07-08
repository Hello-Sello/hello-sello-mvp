/**
 * Buy — the KPI strip (Phase 18, Plan 13, BUY-01). Four real cards: Purchases
 * this month (total + deal count), Open deals, Avg price €/g (+ delta vs
 * previous week), DB1 total. Purely presentational — `page.tsx` (the Server
 * Component composition layer) derives every number via `calendarKpis()`
 * (allocate), `isOpenDeal()` and the KPI card math (buy), exactly mirroring
 * how Sell's own page.tsx computes its "Status this month" KPIs inline
 * rather than duplicating that derivation here.
 */
export interface KpiCard {
  value: string;
  label: string;
  sublabel?: string;
}

export function KpiStrip({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          data-testid="kpi-card"
          className="glass min-w-[170px] flex-1 rounded-2xl px-4 py-3"
        >
          <div className="text-xl font-extrabold text-ink">{c.value}</div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted/70">{c.label}</div>
          {c.sublabel && <div className="mt-0.5 text-[11px] text-ink-muted">{c.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}
