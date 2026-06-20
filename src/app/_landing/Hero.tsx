import { ArrowRight } from "lucide-react";
import { PlaceholderSlot } from "./PlaceholderSlot";

/**
 * Hero (§2). Holds the ONLY <h1> on the page (the outcome headline — SEO H1),
 * a subhead, the single primary "Request access" CTA → /signup (D-02, copying
 * the /c/[handle] anonymous-visitor anchor shape), and the product-visual slot.
 *
 * Placeholder copy (D-15 — interim Aurora look, restyle-friendly).
 */
export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">
        B2B marketplace · verified companies only
      </p>

      <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        From conversation to confirmed deal — between verified companies.
      </h1>

      <p className="mx-auto mt-5 max-w-2xl text-base text-ink-muted">
        Discover verified partners, connect safely with no cross-company leaks,
        and turn the conversation into a structured, documented deal — all in one
        place. Apply for access and get verified before you onboard.
      </p>

      <div className="mt-8 flex justify-center">
        <a
          href="/signup"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
        >
          Request access <ArrowRight size={17} />
        </a>
      </div>

      <div className="mt-14">
        <PlaceholderSlot
          label="Product visual"
          hint="Product screenshot or short walkthrough — swapped in once real assets exist."
          aspect="video"
        />
      </div>
    </section>
  );
}
