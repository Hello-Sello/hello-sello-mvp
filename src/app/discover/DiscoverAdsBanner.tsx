/**
 * Discover ads banner — a full-width "leaderboard" placeholder at the top of
 * Discover (DISC-4, Variant D). It holds the space and shape of a real sponsored
 * banner (glass panel, ~112px tall, "Sponsored" tag) but carries no ad content:
 * v0 ships one honest empty slot until real ad serving exists — no fake creatives.
 */
import { Megaphone } from "lucide-react";

export function DiscoverAdsBanner() {
  return (
    <div
      role="region"
      aria-label="Sponsored"
      className="glass-strong relative flex h-28 items-center justify-center overflow-hidden rounded-[20px]"
    >
      <span className="absolute right-3 top-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted/60">
        Sponsored
      </span>
      <div className="flex flex-col items-center gap-1.5 text-center text-ink-muted">
        <Megaphone size={20} className="text-ink-muted/50" />
        <span className="text-sm font-semibold">Your ad could be here</span>
      </div>
    </div>
  );
}
