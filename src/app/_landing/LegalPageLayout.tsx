import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { LandingNav } from "./LandingNav";
import { Footer } from "./Footer";
import { Reveal } from "./Reveal";

/**
 * Shared shell for the three German legal pages (/impressum, /datenschutz,
 * /agb). One layout, so the public chrome (LandingNav + Footer), the
 * pending-review notice, the page title, and the glass article container are
 * defined ONCE and every legal page renders identically through it — a content
 * swap per page, not three divergent shells (mirrors the reusable-primitive
 * approach the landing already uses).
 *
 * The pages stay server components: this layout pulls in the "use client"
 * LandingNav as a child, which keeps the page itself static so each can keep its
 * own `export const metadata` (robots: noindex while the copy is placeholder).
 *
 * The pending-review notice carries the verbatim German string
 * `Platzhalter — rechtlich noch nicht geprüft …` (D-11 / LAND-04) — unmistakable,
 * recolored to danger tokens, at the top of the article so no reader mistakes the
 * placeholder copy for vetted legal text.
 */
export function LegalPageLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <LandingNav />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Reveal>
          <article className="glass rounded-3xl p-8 sm:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {title}
            </h1>

            {/* PENDING-REVIEW NOTICE (D-11 / LAND-04) — verbatim German, danger
                tokens. Do not paraphrase: e2e asserts `rechtlich noch nicht
                geprüft` is visible on every legal page. */}
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                Platzhalter — rechtlich noch nicht geprüft. Finaler Text folgt von
                Anwalt/eRecht24 vor Launch.
              </p>
            </div>

            {/* Long-form legal prose. `max-w-prose` keeps a readable measure;
                the per-page scaffold supplies headings + placeholders only. */}
            <div className="mt-8 max-w-prose space-y-6 text-sm leading-relaxed text-ink-muted">
              {children}
            </div>
          </article>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
