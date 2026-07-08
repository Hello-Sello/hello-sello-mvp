import Link from "next/link";
import { Wordmark } from "@/shared/ui/Wordmark";
import { CookieSettingsButton } from "./CookieSettingsButton";

/**
 * Footer (§11). This plan (09-02) establishes the footer STRUCTURE + the
 * B2B-only line (LAND-02). It deliberately does NOT create the legal <Link>s or
 * the cookie-settings button — those are owned by later plans, so the slots below
 * stay intentionally empty here to keep file ownership clean:
 *   - 09-03 fills the LEGAL-LINK SLOT with <Link>s to /impressum, /datenschutz,
 *     /agb (≤2 clicks, LAND-03).
 *   - 09-04 wires the COOKIE-SETTINGS SLOT (a button dispatching
 *     "hs-open-cookie-settings" to re-open the consent banner).
 *
 * The B2B line carries the verbatim `nicht an Verbraucher` substring (LAND-02),
 * reinforcing the dedicated B2BOnlyBand.
 */
export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-surface/40 px-6 py-14 text-sm text-ink-muted backdrop-blur">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-3 text-sm text-ink-muted">
            The verified B2B marketplace for dealmakers. Discover, connect, and
            close in one place.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            Product
          </h3>
          {/* Absolute anchors (/#how, /#faq) — the footer also renders on the
              legal pages, which don't have those section ids. */}
          <nav className="mt-3 flex flex-col gap-2">
            <a href="/#how" className="transition hover:text-brand">
              How it works
            </a>
            <a href="/#faq" className="transition hover:text-brand">
              FAQ
            </a>
            <a href="/signup" className="transition hover:text-brand">
              Request access
            </a>
          </nav>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            Legal
          </h3>
          {/* LEGAL-LINK SLOT — filled by 09-03: direct <Link>s to the three
              German legal pages (≤2 clicks, LAND-03). */}
          <nav
            aria-label="Legal"
            className="mt-3 flex flex-col gap-2"
          >
            <Link href="/impressum" className="transition hover:text-brand">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition hover:text-brand">
              Datenschutz
            </Link>
            <Link href="/agb" className="transition hover:text-brand">
              AGB
            </Link>
            {/* COOKIE-SETTINGS SLOT (09-04): re-opens the consent banner via
                CustomEvent("hs-open-cookie-settings"). */}
            <CookieSettingsButton />
          </nav>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
            Contact
          </h3>
          <nav className="mt-3 flex flex-col gap-2">
            <a
              href="mailto:hello@hello-sello.com"
              className="transition hover:text-brand"
            >
              hello@hello-sello.com
            </a>
          </nav>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-ink/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        {/* B2B-only line (LAND-02) — verbatim German substring, do not paraphrase. */}
        <p>Hello Sello ist eine B2B-Plattform - nicht an Verbraucher.</p>
        <p>© 2026 Hello Sello</p>
      </div>
    </footer>
  );
}
