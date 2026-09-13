import Link from "next/link";
import { CookieSettingsButton } from "./CookieSettingsButton";

/**
 * One-line footer for the one-screen landing. Carries only what must be on
 * every public page: the three German legal links (Impressum, Datenschutz,
 * AGB - reachable in one click, LAND-03), the cookie re-open control, and the
 * verbatim B2B-only line `nicht an Verbraucher` (LAND-02, keeps the BFSG
 * B2B exemption - do not paraphrase). The legal pages keep the full Footer.
 */
export function LandingFooterBar() {
  return (
    <footer className="border-t border-ink/10 px-6 py-3 text-xs text-ink-muted">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/impressum" className="transition hover:text-brand">
            Impressum
          </Link>
          <Link href="/datenschutz" className="transition hover:text-brand">
            Datenschutz
          </Link>
          <Link href="/agb" className="transition hover:text-brand">
            AGB
          </Link>
          <CookieSettingsButton />
        </nav>
        <p className="text-center">
          Hello Sello ist eine B2B-Plattform - nicht an Verbraucher. · © 2026 Hello Sello
        </p>
      </div>
    </footer>
  );
}
