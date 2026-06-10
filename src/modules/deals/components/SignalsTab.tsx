/**
 * Deal card back - Signals tab (3a, Phase 4).
 *
 * Advisory, per-side reads (seeded in 3a; Sella-written in 4d). The footer makes
 * the contract explicit: signals are advice, the FRONT facts are the agreed truth.
 */
import {
  TrendingUp,
  Clock,
  Repeat2,
  BadgePercent,
  PackageX,
  Truck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { PartySide, SignalView } from "../types";

const ICON: Record<string, LucideIcon> = {
  trend: TrendingUp,
  clock: Clock,
  repeat: Repeat2,
  price: BadgePercent,
  stock: PackageX,
  truck: Truck,
};

export function SignalsTab({ signals, side }: { signals: SignalView[]; side: PartySide | null }) {
  if (signals.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-[11px] text-ink/40">
        No signals yet - Sella adds them as the deal develops.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="px-1 pb-0.5 text-center text-[11px] text-brand-deep">
        Sella&apos;s read - {side ?? "your"} view
      </div>
      {signals.map((s) => {
        const Icon = ICON[s.icon] ?? Sparkles;
        return (
          <div key={s.id} className="rounded-xl bg-white px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon className="h-4 w-4 text-brand" />
              {s.title}
            </div>
            <div className="mt-0.5 text-xs text-ink/55">{s.detail}</div>
          </div>
        );
      })}
      <div className="px-1 pt-1 text-center text-[10px] text-ink/40">
        Signals are advisory - the facts on the front are the agreed truth.
      </div>
    </div>
  );
}
