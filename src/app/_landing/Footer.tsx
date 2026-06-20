import { Wordmark } from "@/shared/ui/Wordmark";

/**
 * Footer shell (§11). This plan (09-02) establishes ONLY the footer structure +
 * the B2B-only line (LAND-02) — it deliberately does NOT create the legal
 * <Link>s or the cookie-settings button. Those are owned by later plans to keep
 * file ownership clean:
 *   - 09-03 fills the legal-link slot below with <Link>s to /impressum,
 *     /datenschutz, /agb (the German legal pages).
 *   - 09-04 wires the "Cookie settings" re-open button into the cookie slot
 *     (dispatches the "hs-open-cookie-settings" event the banner listens for).
 *
 * The B2B line carries the verbatim `nicht an Verbraucher` substring (LAND-02),
 * reinforcing the dedicated B2BOnlyBand.
 */
export function Footer() {
  return (
    <footer className="border-t border-ink/10 px-6 py-12 text-sm text-ink-muted">
      <div className="mx-auto max-w-6xl">
        <Wordmark />

        {/* LEGAL-LINK SLOT — filled by 09-03 with <Link href="/impressum" />,
            <Link href="/datenschutz" />, <Link href="/agb" /> (≤2 clicks,
            LAND-03). Intentionally empty here — owned by 09-03. */}
        <nav
          aria-label="Legal"
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2"
        >
          {/* COOKIE-SETTINGS SLOT — wired by 09-04: a "Cookie settings" button
              that dispatches new CustomEvent("hs-open-cookie-settings") to
              re-open the consent banner. Intentionally absent here. */}
        </nav>

        {/* B2B-only line (LAND-02) — verbatim German substring, do not paraphrase. */}
        <p className="mt-6">
          Hello Sello ist eine B2B-Plattform — nicht an Verbraucher.
        </p>
      </div>
    </footer>
  );
}
