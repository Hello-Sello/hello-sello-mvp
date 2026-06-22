import Image from "next/image";

// The PNG's true pixel size. These must match the asset's real aspect ratio
// (1900×1136 ≈ 1.67:1) — Next.js uses them only to reserve layout space and
// avoid distortion. The *rendered* size is set with the CSS class / style below.
// (The old props lied — 120×40 claimed 3:1 — so Tailwind preflight's
// `height:auto` honored the real ratio and inflated the logo to ~72px tall.)
const LOGO_W = 1900;
const LOGO_H = 1136;

/**
 * The Hello Sello brand mark. Renders the real PNG logo asset.
 *
 * `stacked` — the rail slot (`<Wordmark stacked />` in IconRail) sizes the logo
 * to `size` px wide (default 44; the collapsible one-rail nav passes 30 when
 * collapsed) so it fits the narrow panel. Width drives the size and height stays
 * auto, so the true aspect ratio is preserved at any `size`. The inline variant
 * renders 40 px tall for headers / auth / onboarding cards.
 */
export function Wordmark({
  stacked = false,
  size = 44,
}: {
  stacked?: boolean;
  size?: number;
}) {
  return (
    <Image
      src="/hello-sello-logo.png"
      alt="Hello Sello"
      width={LOGO_W}
      height={LOGO_H}
      className={stacked ? "object-contain" : "h-10 w-auto object-contain"}
      style={stacked ? { width: size, height: "auto" } : undefined}
      priority
    />
  );
}
