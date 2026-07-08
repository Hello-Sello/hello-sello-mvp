"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Radar, X } from "lucide-react";

/**
 * DealCalendar — the shared deal-timeline surface (deal-calendar.md).
 *
 * ONE side-agnostic component: **Sales calendar** on Sell (rows = Customers),
 * **Purchase calendar** on Buy (rows = Suppliers), flipped by the `side` prop.
 * A faithful React port of `prototypes/allocate-prototype/index.html`'s
 * calendar — the split-pane frozen-column freeze (a non-scrolling names column
 * beside a horizontally-scrolling day grid; NOT `position: sticky`, which was
 * measured drifting on scroll), a 3-month paged window with ‹ › nav defaulting
 * to the current month, a date-range filter, and pills coloured by deal
 * display stage.
 *
 * Self-contained by design: `@/modules/allocate` imports `@/modules/deals`, so
 * this file must NOT import back from allocate (circular) — it declares its own
 * prop types, and the Sell page (which may import both) computes the KPIs via
 * allocate's tested `calendarKpis` and passes them in.
 */

/** The deal display stages that key a pill's colour (mirrors allocate's
 *  `OrderStatusCode`; re-declared locally to keep this module standalone). */
export type DisplayStage =
  | "sales_offer"
  | "purchase_order"
  | "accepted"
  | "executed"
  | "update"
  | "ticket"
  | "ticket_closed"
  | "cancelled";

export interface CalendarDeal {
  dealCardId: string;
  counterparty: { id: string; name: string; code: string };
  /** ISO date the pill sits on (delivery ?? created). */
  date: string;
  amount: number | null;
  grams: number;
  displayStage: DisplayStage;
}

export interface DealCalendarKpis {
  totalValue: number;
  dealCount: number;
  weightedAvgPrice: number;
  activeCounterparties: number;
}

/** Solid pill fills per display stage (deal-calendar.md §2 colour encoding).
 *  Distinct from the Orders table's light *chip* styles — a pill is a filled
 *  bar, so it needs solid colours. */
const PILL_FILL: Record<DisplayStage, string> = {
  sales_offer: "bg-brand",
  purchase_order: "bg-brand",
  accepted: "bg-yellow-400",
  executed: "bg-success",
  update: "bg-amber-500",
  ticket: "bg-info",
  ticket_closed: "bg-emerald-800",
  cancelled: "bg-ink/30",
};

const LEGEND: Array<[DisplayStage, string]> = [
  ["sales_offer", "Offer / order"],
  ["accepted", "Accepted"],
  ["executed", "Executed"],
  ["update", "Update"],
  ["ticket", "Ticket open"],
  ["ticket_closed", "Ticket closed"],
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WINDOW_MONTHS = 3;
const DAY_COL_PX = 30;
const NAMES_COL_PX = 200;

interface YM {
  year: number;
  month: number;
} // month 0-11

const ymKey = (y: number, m: number) => y * 12 + m;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** ISO-8601 week number (Mon-based) for a date. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const euro = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + " M€" : Math.round(n / 1000) + ".000€";

function sideLabels(side: "seller" | "buyer") {
  return side === "seller"
    ? { title: "Sales calendar", column: "Customers", money: "Total sales", active: "Active customers" }
    : { title: "Purchase calendar", column: "Suppliers", money: "Total purchases", active: "Active suppliers" };
}

export function DealCalendar({
  deals,
  kpis,
  side,
}: {
  deals: CalendarDeal[];
  kpis: DealCalendarKpis;
  side: "seller" | "buyer";
}) {
  const labels = sideLabels(side);
  // "now" is captured once at mount (stable across renders) — it must not be a
  // fresh `new Date()` each render, or the memos below never settle.
  const [today] = useState(() => new Date());
  const todayKey = ymKey(today.getFullYear(), today.getMonth());

  // Each deal parsed to its {year, month, day} once.
  const parsed = useMemo(
    () =>
      deals.map((d) => {
        const dt = new Date(d.date);
        return { deal: d, year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
      }),
    [deals],
  );

  // The continuous month axis: earliest deal month .. latest, always including
  // the current month so "this month" and the default window are meaningful.
  const monthAxis = useMemo<YM[]>(() => {
    const keys = parsed.map((p) => ymKey(p.year, p.month));
    keys.push(todayKey);
    const min = Math.min(...keys);
    const max = Math.max(...keys);
    const axis: YM[] = [];
    for (let k = min; k <= max; k++) axis.push({ year: Math.floor(k / 12), month: k % 12 });
    return axis;
  }, [parsed, todayKey]);

  // Window start = index into monthAxis; default lands on the current month,
  // clamped so a full 3-month window fits.
  const defaultStart = Math.max(
    0,
    Math.min(monthAxis.length - WINDOW_MONTHS, monthAxis.findIndex((m) => ymKey(m.year, m.month) === todayKey)),
  );
  const [windowStart, setWindowStart] = useState(defaultStart < 0 ? 0 : defaultStart);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const windowMonths = monthAxis.slice(windowStart, windowStart + WINDOW_MONTHS);
  const inRange = (iso: string) => !range || (iso >= range.from && iso <= range.to);

  // Build the day columns for the visible window (real days per month).
  const columns = useMemo(() => {
    const cols: Array<{ year: number; month: number; day: number; isToday: boolean }> = [];
    for (const m of monthAxis.slice(windowStart, windowStart + WINDOW_MONTHS)) {
      const n = daysInMonth(m.year, m.month);
      for (let day = 1; day <= n; day++) {
        cols.push({
          year: m.year,
          month: m.month,
          day,
          isToday:
            m.year === today.getFullYear() && m.month === today.getMonth() && day === today.getDate(),
        });
      }
    }
    return cols;
  }, [windowStart, monthAxis, today]);

  const colIndex = useMemo(() => {
    const map = new Map<string, number>();
    columns.forEach((c, i) => map.set(`${c.year}-${c.month}-${c.day}`, i));
    return map;
  }, [columns]);

  // Rows = counterparties present in the data, sorted by their total value desc.
  const rows = useMemo(() => {
    const within = (iso: string) => !range || (iso >= range.from && iso <= range.to);
    const byId = new Map<string, { cp: CalendarDeal["counterparty"]; total: number }>();
    for (const p of parsed) {
      const cur = byId.get(p.deal.counterparty.id) ?? { cp: p.deal.counterparty, total: 0 };
      if (within(p.deal.date)) cur.total += p.deal.amount ?? 0;
      byId.set(p.deal.counterparty.id, cur);
    }
    return [...byId.values()].sort((a, b) => b.total - a.total);
  }, [parsed, range]);

  const applyRange = () => {
    if (!rangeFrom || !rangeTo) return;
    const from = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
    const to = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
    setRange({ from, to });
    // jump the window to the month the range starts in
    const fd = new Date(from);
    const idx = monthAxis.findIndex((m) => m.year === fd.getFullYear() && m.month === fd.getMonth());
    if (idx >= 0) setWindowStart(Math.max(0, Math.min(monthAxis.length - WINDOW_MONTHS, idx)));
  };
  const clearRange = () => {
    setRange(null);
    setRangeFrom("");
    setRangeTo("");
    setWindowStart(defaultStart < 0 ? 0 : defaultStart);
  };

  function openDeal(dealCardId: string) {
    window.dispatchEvent(new CustomEvent("hs:open-deal-room", { detail: { dealCardId } }));
  }

  const totalCols = columns.length;
  const gridTemplate = `repeat(${totalCols}, ${DAY_COL_PX}px)`;
  const canPrev = windowStart > 0;
  const canNext = windowStart + WINDOW_MONTHS < monthAxis.length;
  const windowLabel = windowMonths.length
    ? `${MONTH_NAMES[windowMonths[0].month].slice(0, 3)}–${MONTH_NAMES[windowMonths[windowMonths.length - 1].month].slice(0, 3)}`
    : "";

  // Week bands over the visible columns (consecutive same-ISO-week runs).
  const weekBands = useMemo(() => {
    const bands: Array<{ start: number; span: number; week: number }> = [];
    columns.forEach((c, i) => {
      const wk = isoWeek(new Date(c.year, c.month, c.day));
      const last = bands[bands.length - 1];
      if (last && last.week === wk) last.span += 1;
      else bands.push({ start: i, span: 1, week: wk });
    });
    return bands;
  }, [columns]);

  // Month bands over the visible columns.
  const monthBands = useMemo(() => {
    const bands: Array<{ start: number; span: number; ym: YM }> = [];
    columns.forEach((c, i) => {
      const last = bands[bands.length - 1];
      if (last && last.ym.year === c.year && last.ym.month === c.month) last.span += 1;
      else bands.push({ start: i, span: 1, ym: { year: c.year, month: c.month } });
    });
    return bands;
  }, [columns]);

  return (
    <section className="glass rounded-3xl p-5">
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-extrabold text-ink">{labels.title}</h2>
        <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/60 px-1.5 py-1">
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="rounded-md border border-ink/15 px-2 py-1 text-[11.5px] font-semibold text-ink"
          />
          <span className="text-[11px] text-ink-muted">–</span>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            className="rounded-md border border-ink/15 px-2 py-1 text-[11.5px] font-semibold text-ink"
          />
          <button
            onClick={applyRange}
            className="rounded-full bg-brand px-3 py-1 text-[11.5px] font-bold text-white"
          >
            View range
          </button>
          {range && (
            <button
              onClick={clearRange}
              aria-label="Clear range"
              className="grid h-6 w-6 place-items-center rounded-full bg-ink/5 text-ink-muted"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWindowStart((s) => Math.max(0, s - 1))}
            disabled={!canPrev}
            aria-label="Previous month"
            className="grid h-6 w-6 place-items-center rounded-full bg-ink/5 text-ink-muted disabled:opacity-35"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="px-1.5 text-[11.5px] font-bold text-ink-muted">{windowLabel}</span>
          <button
            onClick={() => setWindowStart((s) => Math.min(monthAxis.length - WINDOW_MONTHS, s + 1))}
            disabled={!canNext}
            aria-label="Next month"
            className="grid h-6 w-6 place-items-center rounded-full bg-ink/5 text-ink-muted disabled:opacity-35"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* KPI strip — "Status this month" */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand text-white">
            <Radar size={13} />
          </span>
          <b className="text-[13px] font-bold text-ink">Status this month</b>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [euro(kpis.totalValue), labels.money],
              [String(kpis.dealCount), "Deals"],
              [kpis.weightedAvgPrice.toFixed(2) + " €/g", "Weighted avg price"],
              [String(kpis.activeCounterparties), labels.active],
            ] as Array<[string, string]>
          ).map(([v, l]) => (
            <div key={l} className="rounded-xl border border-ink/10 bg-white px-3 py-1.5">
              <div className="text-sm font-extrabold text-ink">{v}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-ink-muted/70">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* split pane: frozen names column + scrolling day grid */}
      <div className="max-h-[560px] overflow-y-auto rounded-2xl border border-ink/10 bg-white">
        <div className="flex items-start">
          {/* frozen names column */}
          <div className="flex shrink-0 flex-col border-r border-ink/15" style={{ width: NAMES_COL_PX }}>
            <div className="sticky top-0 z-10 flex items-center border-b border-ink/15 bg-brand-soft/40 px-3 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-muted"
                 style={{ height: 82 }}>
              {labels.column}
            </div>
            {rows.map((r) => (
              <div key={r.cp.id} className="flex min-h-[44px] items-center gap-2.5 border-b border-ink/5 px-2 py-1.5">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-[10px] font-extrabold text-brand-deep">
                  {r.cp.code}
                </div>
                <div className="flex min-w-0 flex-col">
                  <b className="truncate text-[13px] font-semibold text-ink">{r.cp.name}</b>
                  <small className="whitespace-nowrap text-[10px] font-bold text-brand-deep">
                    {euro(r.total)} {range ? "in range" : "this month"}
                  </small>
                </div>
              </div>
            ))}
          </div>

          {/* scrolling day grid */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            {/* header: month band / week band / day numbers */}
            <div className="sticky top-0 z-10 bg-brand-soft/40">
              <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                {monthBands.map((b) => {
                  const cur = ymKey(b.ym.year, b.ym.month) === todayKey;
                  return (
                    <div key={`${b.ym.year}-${b.ym.month}`} className="px-1 py-1.5"
                         style={{ gridColumn: `${b.start + 1} / span ${b.span}` }}>
                      <span className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1 ${cur ? "bg-brand text-white" : "bg-ink/5"}`}>
                        <b className={`text-[13.5px] font-extrabold ${cur ? "text-white" : "text-ink-muted"}`}>
                          {MONTH_NAMES[b.ym.month]}
                        </b>
                        <small className={`text-[12px] font-semibold ${cur ? "text-white" : "text-ink-muted/70"}`}>
                          {b.ym.year}
                        </small>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="grid border-b border-ink/15" style={{ gridTemplateColumns: gridTemplate }}>
                {weekBands.map((b) => (
                  <div key={b.start} className="py-1.5 text-center text-[10.5px] font-bold uppercase tracking-wider text-ink-muted/60"
                       style={{ gridColumn: `${b.start + 1} / span ${b.span}` }}>
                    Week {b.week}
                  </div>
                ))}
              </div>
              <div className="grid border-b border-ink/15" style={{ gridTemplateColumns: gridTemplate }}>
                {columns.map((c, i) => (
                  <div key={i} className={`py-1 text-center text-[11px] ${c.isToday ? "font-extrabold text-brand" : "font-semibold text-ink-muted"}`}>
                    {c.day}
                  </div>
                ))}
              </div>
            </div>
            {/* pill rows */}
            {rows.map((r) => (
              <div key={r.cp.id} className="grid min-h-[44px] items-center border-b border-ink/5"
                   style={{ gridTemplateColumns: gridTemplate }}>
                {parsed
                  .filter((p) => p.deal.counterparty.id === r.cp.id && inRange(p.deal.date))
                  .map((p) => {
                    const idx = colIndex.get(`${p.year}-${p.month}-${p.day}`);
                    if (idx === undefined) return null;
                    return (
                      <button
                        key={p.deal.dealCardId}
                        onClick={() => openDeal(p.deal.dealCardId)}
                        title={`${p.deal.counterparty.name}${p.deal.amount != null ? " · " + euro(p.deal.amount) : ""}`}
                        className={`mx-0.5 grid h-[26px] place-items-center rounded-full shadow-sm transition hover:-translate-y-px ${PILL_FILL[p.deal.displayStage]}`}
                        style={{ gridColumn: `${idx + 1} / span 2` }}
                      >
                        <span className="h-[7px] w-[7px] rounded-full bg-white/95" />
                      </button>
                    );
                  })}
              </div>
            ))}
            {rows.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-ink-muted">No deals to show yet.</div>
            )}
          </div>
        </div>
        {/* legend */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-[10.5px] text-ink-muted/70">
          {LEGEND.map(([stage, label]) => (
            <span key={stage} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-4 rounded-full ${PILL_FILL[stage]}`} />
              {label}
            </span>
          ))}
          <span className="ml-auto">
            {range ? "showing your selected range — clear it to see the window" : "‹ › to page · click a pill → deal room"}
          </span>
        </div>
      </div>
    </section>
  );
}
