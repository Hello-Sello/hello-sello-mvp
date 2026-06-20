import { ArrowRight } from "lucide-react";

/**
 * Final CTA band (§10). Repeats the single primary "Request access" → /signup
 * CTA (D-02). No second funnel — the same anchor shape as the hero.
 */
export function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="glass-strong rounded-3xl px-8 py-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Ready when you are
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight text-ink">
          Join the verified B2B network.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-muted">
          Apply for access, get verified, and start dealing with trusted
          partners.
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href="/signup"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
          >
            Request access <ArrowRight size={17} />
          </a>
        </div>
      </div>
    </section>
  );
}
