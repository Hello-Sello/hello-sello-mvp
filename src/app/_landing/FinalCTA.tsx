import { AuroraBackground } from "./AuroraBackground";
import { CTAButton } from "./CTAButton";
import { Reveal } from "./Reveal";

/**
 * Final CTA band (§10). Repeats the single primary "Request access" → /signup CTA
 * (D-02) inside a glass-strong card over a soft Aurora glow. No second funnel —
 * the same anchor shape as the hero.
 */
export function FinalCTA() {
  return (
    <section className="relative isolate overflow-hidden px-6 py-24">
      <AuroraBackground />
      <Reveal className="mx-auto max-w-3xl">
        <div className="glass-strong rounded-3xl px-8 py-16 text-center shadow-[0_30px_80px_-30px_rgba(118,0,45,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Ready when you are
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Join the verified B2B network
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-ink-muted">
            Apply for access, get verified, and start dealing with trusted
            partners.
          </p>
          <div className="mt-8 flex justify-center">
            <CTAButton size="lg" withArrow>
              Request access
            </CTAButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
