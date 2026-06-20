"use client";

import Link from "next/link";
import { Wordmark } from "@/shared/ui/Wordmark";

/**
 * Public landing nav (§1). Client component so the reserved language-toggle slot
 * and any later smooth-scroll polish can live here without pulling the page out
 * of server-rendering. Renders the Wordmark, a "Log in" link, the disabled
 * German language-toggle slot (D-09 — reserved, non-functional), and the single
 * primary "Request access" CTA → existing /signup (D-02).
 *
 * Do NOT gold-plate (D-15) — smooth-scroll / sticky polish is optional and
 * deliberately omitted here; Ayush owns the final UI.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" aria-label="Hello Sello home">
          <Wordmark />
        </Link>

        <div className="flex items-center gap-3">
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

          <a
            href="/signup"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
          >
            Request access
          </a>
        </div>
      </nav>
    </header>
  );
}
