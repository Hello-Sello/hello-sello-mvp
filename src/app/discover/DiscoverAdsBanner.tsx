/**
 * Discover ads banner — the full-width "leaderboard" at the top of Discover
 * (DISC-4, Variant D). v0 carries one hard-coded sponsored creative; there is no
 * ad serving yet. The box takes the creative's own aspect ratio instead of a
 * fixed height, so the ad's text and logo are never cropped on narrow screens.
 *
 * Discover is verified companies only (./layout.tsx). That gate is what keeps
 * this ad inside professional circles, as § 10(1) HWG requires for prescription
 * medicines such as medical cannabis — don't reuse it on a public surface.
 */
import Image from "next/image";

// The creative's real pixel size — next/image reserves layout space from these.
const AD_W = 2562;
const AD_H = 252;

export function DiscoverAdsBanner() {
  return (
    <div
      role="region"
      aria-label="Sponsored"
      className="glass-strong relative overflow-hidden rounded-[20px]"
    >
      <Image
        src="/ads/grape-cookies-banner.png"
        alt="Superseed Grape Cookies — 28% THC, 4.98% terpenes. Small batch, limited edition craft cannabis."
        width={AD_W}
        height={AD_H}
        sizes="(min-width: 1152px) 1104px, 100vw"
        className="block h-auto w-full"
        preload
      />
      <span className="absolute left-3 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white/90 backdrop-blur-sm">
        Sponsored
      </span>
    </div>
  );
}
