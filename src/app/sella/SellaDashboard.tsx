import { Playfair_Display } from "next/font/google";
import {
  Sun, Plus, Mic, ArrowUp, Search, FileText, TrendingUp, Package, Check,
} from "lucide-react";
import { Wordmark } from "@/shared/ui/Wordmark";

/**
 * The Sella dashboard — the seller home. A greeting, a "this month" stat card, a
 * "today" to-do card, and the Sella chat launcher with quick actions. All
 * content is ILLUSTRATIVE dummy data — no backend, no data calls.
 *
 *  - `DashboardContent` is the inner block, rendered INSIDE the app shell at
 *    /home (so the sidebar + top bar + navigation all stay). No own chrome.
 *  - `SellaDashboard` wraps it full-screen with its own top bar + pink wash for
 *    the standalone /sella preview route.
 */

const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// the beautiful pink — used only by the full-screen preview; in-app it sits on
// the app's own pink glass background.
const PINK_BG = `
  radial-gradient(58rem 42rem at 50% -6%, rgba(255,216,233,0.95), transparent 62%),
  radial-gradient(48rem 40rem at 6% 10%, rgba(255,183,213,0.55), transparent 58%),
  radial-gradient(48rem 40rem at 100% 2%, rgba(255,166,203,0.5), transparent 55%),
  radial-gradient(72rem 60rem at 50% 118%, rgba(227,11,93,0.12), transparent 60%),
  linear-gradient(165deg, #fdeef5 0%, #fbd8e8 100%)
`;

const TODOS = [
  { label: "Confirm Bedrocan 22/1 order · MediPharm", done: true },
  { label: "Send COA to Apotheke Nord", done: false },
  { label: "Review price update from Cantourage", done: false },
  { label: "Reply to Demecan sample request", done: false },
];

const BARS = [26, 20, 30, 24, 38, 34, 46];

const CHIPS = [
  { icon: Search, label: "Find live availability" },
  { icon: FileText, label: "Draft order confirmation" },
  { icon: TrendingUp, label: "Market prices" },
  { icon: Package, label: "My open orders" },
];

function WeatherLine() {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-muted">
      <span className="flex items-center gap-1.5">
        <Sun size={16} className="text-amber-400" /> 24° · Clear · Berlin
      </span>
      <span className="text-ink/20">·</span>
      <span>Wednesday 8 July</span>
      <span className="text-ink/20">·</span>
      <span className="font-semibold text-ink">14:35</span>
    </div>
  );
}

export function DashboardContent({ showWeather = true }: { showWeather?: boolean }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-2 py-4">
      {showWeather && (
        <div className="mb-2 flex justify-end">
          <WeatherLine />
        </div>
      )}

      {/* greeting */}
      <div className="pb-8 text-center">
        <h1 className={`${serif.className} text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl`}>
          <span className="mr-2 font-bold not-italic text-brand">{"//"}</span>
          Good afternoon, <span className="italic">Alice</span>
        </h1>
        <p className="mt-3 text-ink-muted">GreenLeaf Cultivation · Wednesday 8 July</p>
      </div>

      {/* two cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* THIS MONTH */}
        <section className="glass rounded-[26px] p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">This month</span>
            <span className="rounded-full bg-brand-soft/40 px-3 py-1 text-xs font-bold text-brand-deep">+18% vs June</span>
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-5xl font-extrabold tracking-tight text-ink">12</span>
            <span className="text-sm text-ink-muted">deals closed</span>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-xl font-bold tabular-nums text-ink">€48,200</span>
            <span className="text-sm text-ink-muted">total volume</span>
          </div>

          <div className="mt-5 flex items-end gap-2.5">
            {BARS.map((h, i) => (
              <span key={i} className="w-9 rounded-full bg-ink/[0.08]" style={{ height: h }} />
            ))}
            <span className="ml-1 h-11 w-11 shrink-0 rounded-full bg-brand shadow-[0_10px_24px_-8px_rgba(227,11,93,0.7)]" />
          </div>

          <div className="mt-5 border-t border-ink/[0.08] pt-3 text-sm text-ink-muted">
            4 in negotiation · 2 awaiting confirmation
          </div>
        </section>

        {/* TODAY */}
        <section className="glass rounded-[26px] p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">Today</span>
            <span className="text-xs text-ink-muted">1 of 4 done</span>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
            <div className="h-full w-1/4 rounded-full bg-brand" />
          </div>

          <ul className="mt-2">
            {TODOS.map((t) => (
              <li key={t.label} className="flex items-center gap-3 border-b border-ink/[0.08] py-2.5 last:border-0">
                {t.done ? (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full border-2 border-ink/20" />
                )}
                <span className={`text-[15px] ${t.done ? "text-ink-muted line-through" : "text-ink"}`}>
                  {t.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Sella chat launcher */}
      <div className="glass mt-5 rounded-[26px] p-5">
        <p className="px-2 pt-1 text-lg text-ink/40">How can I help you?</p>
        <div className="mt-8 flex items-center justify-between">
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-ink shadow-sm">
            <Plus size={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-sm font-semibold text-ink shadow-sm">
              <span className="font-bold text-brand">{"//"}</span> Sella
            </span>
            <button className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-ink shadow-sm">
              <Mic size={17} />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white shadow-[0_10px_24px_-8px_rgba(227,11,93,0.7)]">
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* quick actions */}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {CHIPS.map((c) => (
          <span key={c.label} className="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-ink">
            <c.icon size={15} className="text-ink-muted" /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Full-screen standalone preview (/sella): own top bar + pink wash.
export function SellaDashboard() {
  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: PINK_BG }}>
      <header className="flex shrink-0 items-center justify-between px-8 py-4">
        <Wordmark />
        <WeatherLine />
      </header>
      <main className="flex flex-1 flex-col justify-center overflow-hidden">
        <DashboardContent showWeather={false} />
      </main>
    </div>
  );
}
