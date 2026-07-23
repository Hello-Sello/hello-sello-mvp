/**
 * Discover ads banner — a static, horizontally-scrollable placeholder strip at
 * the top of Discover (DISC-4). No data and no ad serving yet; it just reserves
 * the space and shows empty slots. Real ad content/serving is a follow-up.
 */

const SLOTS = [0, 1, 2, 3, 4];

export function DiscoverAdsBanner() {
  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2"
      role="region"
      aria-label="Sponsored"
    >
      {SLOTS.map((i) => (
        <div
          key={i}
          data-ad-slot={i}
          aria-hidden
          className="h-24 w-64 shrink-0 rounded-xl border border-dashed border-black/10 bg-black/[0.02]"
        />
      ))}
    </div>
  );
}
