/**
 * Sales calendar — explicit, honest placeholder (Sell/Allocate surface,
 * DEV-76/DEV-154). NOT the shared Buy-side calendar; renders no grid, pills,
 * or week/month/year toggle of any kind — that component belongs to Ayush
 * (DEV-154) and gets adopted here once he ships it. This section exists so
 * the locked scroll order (Orders → Batches → Sales calendar, SELL.md) is
 * complete without faking a calendar that isn't built yet.
 */
export function SalesCalendarStub() {
  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="text-[22px] font-extrabold text-ink">Sales calendar</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Coming soon — this section will adopt the shared calendar component once
        it ships on the Buy surface (DEV-154).
      </p>
    </section>
  );
}
