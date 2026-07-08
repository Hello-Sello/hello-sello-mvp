import { AuroraBackground } from "./AuroraBackground";
import { CTAButton } from "./CTAButton";
import { HeroDealFlow } from "./HeroDealFlow";
import { Reveal } from "./Reveal";

/**
 * Hero (§2). Holds the ONLY <h1> on the page (the outcome headline — SEO H1 + the
 * E2E heading contract), a subhead, the single primary "Request access" CTA →
 * /signup (D-02), a secondary in-page "See how it works" ghost link (navigation,
 * not a second funnel), and the framed product-visual slot. The Aurora backdrop
 * gives the page its signature dreamy depth (decorative, reduced-motion safe).
 *
 * Copy is interim placeholder framing (D-15) — restyle/refill friendly.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <AuroraBackground />

      <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center sm:pt-28">
        <Reveal>
          <p className="inline-block rounded-full border border-brand/15 bg-surface/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand backdrop-blur">
            Chat. Deal. Done.
          </p>
        </Reveal>

        <Reveal delayMs={60}>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            <span className="bg-gradient-to-r from-brand to-brand-deep bg-clip-text text-transparent">
              AI FOR DEALMAKERS
            </span>
          </h1>
        </Reveal>

        <Reveal delayMs={120}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted">
            Discover verified partners, connect safely with no cross-company
            leaks, and turn the conversation into a structured, documented deal,
            all in one place.
          </p>
        </Reveal>

        <Reveal delayMs={180}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <CTAButton size="lg" withArrow>
              Request access
            </CTAButton>
            <CTAButton href="#how" variant="ghost" size="lg">
              See how it works
            </CTAButton>
          </div>
          <p className="mt-5 text-sm text-ink-muted">
            Apply → get verified → onboard. Reviewed within a few business days.
          </p>
        </Reveal>

        <Reveal delayMs={120} className="mt-16">
          <HeroDealFlow />
        </Reveal>
      </div>
    </section>
  );
}
