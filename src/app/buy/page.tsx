import { getBuyerCalendarDeals, calendarKpis, type CalendarKpiInput } from "@/modules/allocate";
import { getBuyAnalytics, isOpenDeal } from "@/modules/buy";
import { DealCalendar } from "@/modules/deals";
import { KpiStrip, type KpiCard } from "./KpiStrip";
import { JumpStrip } from "./JumpStrip";
import { PartnersAnalyticsCard } from "./PartnersAnalyticsCard";
import { BuySellaStub } from "./BuySellaStub";
import { BuyDealCardHost } from "./BuyDealCardHost";

/**
 * Buy (Phase 18, BUY-01) — the buyer's one scrolling page: KPI strip, then
 * Deals timeline, then the merged Analytics + Sheet card, then a Buyer-Sella
 * "coming soon" stub, in that locked scroll order (18-CONTEXT.md). Mirrors
 * `src/app/sell/page.tsx`'s shape exactly (buyer-flipped): an async Server
 * Component fetching its reads in parallel via `Promise.all`, deriving KPIs
 * inline (the composition layer), then handing everything to client
 * components as props.
 *
 * Deliberately has no separate buyer-side "orders read" or Orders table
 * (unlike Sell) — `getBuyerCalendarDeals()` + `getBuyAnalytics()` alone cover
 * every KPI card; Buy's design contract has no Orders block, so building an
 * unused read here would be dead code (18-13-PLAN.md's objective).
 */

const euro = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function toKpiInput(d: { amount: number | null; grams: number; counterparty: { id: string } }): CalendarKpiInput {
  return { value: d.amount ?? 0, grams: d.grams, counterpartyId: d.counterparty.id };
}

/** Same calendar month (year + month), local time — mirrors Sell's own
 *  "Status this month" filter (src/app/sell/page.tsx). */
function sameMonth(d: Date, now: Date): boolean {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** ISO-8601 week number (Mon-based), matching DealCalendar's own `isoWeek`
 *  convention, so "previous week" means the same thing here as on the
 *  calendar itself. */
function isoWeekOf(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

/**
 * A fixed ISO-week boundary (Claude's Discretion, 18-CONTEXT.md /
 * 18-13-PLAN.md's `<interfaces>` block) rather than a rolling 7-day window —
 * simpler given the schema (no per-transaction date exists beyond the
 * calendar pill's own `date`), and matches DealCalendar's own week banding.
 * "Previous week" = the ISO week immediately before `now`'s ISO week.
 */
function inPreviousIsoWeek(d: Date, now: Date): boolean {
  const nowWeek = isoWeekOf(now);
  const prevRef = new Date(now);
  prevRef.setDate(prevRef.getDate() - 7);
  const prevWeek = isoWeekOf(prevRef);
  const dWeek = isoWeekOf(d);
  // guard against the rare case where "now - 7 days" and "now" land in the
  // same ISO week (shouldn't happen for a 7-day shift, kept for safety).
  if (prevWeek.year === nowWeek.year && prevWeek.week === nowWeek.week) return false;
  return dWeek.year === prevWeek.year && dWeek.week === prevWeek.week;
}

export default async function BuyPage() {
  const [calendarDeals, buyAnalytics] = await Promise.all([getBuyerCalendarDeals(), getBuyAnalytics()]);

  const now = new Date();
  const monthDeals = calendarDeals.filter((d) => sameMonth(new Date(d.date), now));
  const prevWeekDeals = calendarDeals.filter((d) => inPreviousIsoWeek(new Date(d.date), now));
  const monthKpis = calendarKpis(monthDeals.map(toKpiInput));
  const prevWeekKpis = calendarKpis(prevWeekDeals.map(toKpiInput));
  const openDealsCount = monthDeals.filter((d) => isOpenDeal(d.status)).length;
  const avgPriceDelta = monthKpis.weightedAvgPrice - prevWeekKpis.weightedAvgPrice;
  const db1TotalAcrossProducts = buyAnalytics.suppliers.reduce((sum, s) => sum + (s.db1Total ?? 0), 0);

  const kpiCards: KpiCard[] = [
    {
      value: `${euro.format(monthKpis.totalValue)} €`,
      label: "Purchases this month",
      sublabel: `${monthKpis.dealCount} deal${monthKpis.dealCount === 1 ? "" : "s"}`,
    },
    {
      value: String(openDealsCount),
      label: "Open deals",
      sublabel: `of ${monthKpis.dealCount} this month`,
    },
    {
      value: `${monthKpis.weightedAvgPrice.toFixed(2)} €/g`,
      label: "Avg price €/g",
      sublabel: `${avgPriceDelta >= 0 ? "+" : ""}${avgPriceDelta.toFixed(2)} €/g vs last week`,
    },
    {
      value: `${euro.format(db1TotalAcrossProducts)} €`,
      label: "DB1 total",
      sublabel: "across all listed products",
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Buy</h1>
        <div className="mt-1">
          <JumpStrip />
        </div>
      </div>

      <KpiStrip cards={kpiCards} />

      <section id="deals-section">
        <DealCalendar deals={calendarDeals} kpis={monthKpis} side="buyer" />
      </section>

      <section id="analytics-section">
        <PartnersAnalyticsCard data={buyAnalytics} />
      </section>

      <section id="sella-section">
        <BuySellaStub />
      </section>

      <BuyDealCardHost />
    </div>
  );
}
