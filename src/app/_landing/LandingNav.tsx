"use client";

import Link from "next/link";
import { Wordmark } from "@/shared/ui/Wordmark";
import { CTAButton } from "./CTAButton";

/**
 * Public landing nav (§1). Client component so the reserved German
 * language-toggle slot (D-09 — non-functional this phase) can live here without
 * pulling the page out of server-rendering. Renders the Wordmark, in-page nav
 * anchors, "Log in", the disabled language slot, and the single primary "Request
 * access" CTA → /signup (D-02, via the shared CTAButton).
 *
 * IMPORTANT: this header must NOT carry the `glass-strong` class — the signed-in
 * TopBar uses `header.glass-strong`, and the "no app chrome" E2E guard counts
 * `header.glass-strong === 0` on the public page. A translucent `bg-surface/70`
 * blur gives the sticky-glass look without that class.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" aria-label="Hello Sello home">
          <Wordmark />
        </Link>

        {/* Absolute anchors (/#how, /#faq) so they also resolve from the legal
            pages, which reuse this nav but don't have those section ids. */}
        <div className="ml-2 hidden items-center gap-6 md:flex">
          <a
            href="/#how"
            className="text-sm font-medium text-ink-muted transition hover:text-brand"
          >
            How it works
          </a>
          <a
            href="/#faq"
            className="text-sm font-medium text-ink-muted transition hover:text-brand"
          >
            FAQ
          </a>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* TODO(i18n): German toggle mounts here. D-09 — reserved slot,
              non-functional this phase; English copy ships now. A content swap,
              not a route restructure. */}
          <button
            type="button"
            disabled
            aria-label="Language (German coming soon)"
            className="rounded-full border border-ink/20 px-2.5 py-1 text-xs text-ink-muted"
          >
            EN ▾
          </button>

          <Link
            href="/login"
            className="hidden text-sm font-semibold text-ink transition hover:text-brand sm:inline"
          >
            Log in
          </Link>

          <CTAButton>Request access</CTAButton>
        </div>
      </nav>
    </header>
  );
}
