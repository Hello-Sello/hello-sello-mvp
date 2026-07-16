import { Star, Quote } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * Social proof (§7). Premium testimonial cards + a metrics band.
 *
 * NOTE: the quotes, names, roles, and numbers here are ILLUSTRATIVE and
 * FICTIONAL (a stand-in until real social proof exists), consistent with the
 * dummy hero + trusted-by strip. Kept honest in code. Swap in real testimonials
 * and verified metrics when they land.
 */

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "A month of email ping-pong now happens in one afternoon. Every price and term sits inside the deal, signed and documented.",
    name: "Dr. Lena Hoffmann",
    role: "Head of Procurement, Greenleaf Pharma",
    initials: "LH",
  },
  {
    quote:
      "Our pharmacy partners onboard themselves and order right in the chat. No more chasing quotes across three inboxes.",
    name: "Marco Rossi",
    role: "Sales Director, StonePharm",
    initials: "MR",
  },
  {
    quote:
      "Neutral ground was the dealbreaker. Our data stays ours, and we still reach every partner in one place.",
    name: "Sofia Berg",
    role: "Operations Lead, NordPharma",
    initials: "SB",
  },
];

const METRICS = [
  { value: "€4.2M+", label: "in deals transacted" },
  { value: "1,200+", label: "verified companies" },
  { value: "3×", label: "faster from chat to signed deal" },
  { value: "100%", label: "of deals documented" },
];

export function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Loved on both sides of the deal"
        title="What dealmakers say"
        sub="Buyers and sellers, meeting on neutral ground and closing in one place."
      />

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <Reveal key={t.name} delayMs={i * 90}>
            <figure className="glass relative flex h-full flex-col gap-5 overflow-hidden rounded-3xl p-7 transition duration-200 hover:-translate-y-1 hover:shadow-[0_28px_70px_-30px_rgba(118,0,45,0.5)]">
              <Quote
                className="absolute -right-3 -top-3 text-brand/10"
                size={92}
                strokeWidth={1.5}
                aria-hidden
              />
              <div className="flex gap-1 text-brand">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} size={16} fill="currentColor" strokeWidth={0} aria-hidden />
                ))}
              </div>
              <blockquote className="relative text-[15px] leading-relaxed text-ink">
                {t.quote}
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand ring-1 ring-brand/15">
                  {t.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{t.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={120}>
        <dl className="glass mt-6 grid grid-cols-2 gap-y-8 rounded-3xl px-6 py-9 sm:grid-cols-4 sm:divide-x sm:divide-ink/10">
          {METRICS.map((m) => (
            <div key={m.label} className="px-4 text-center">
              <dt className="bg-gradient-to-br from-brand to-brand-deep bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                {m.value}
              </dt>
              <dd className="mt-2 text-sm text-ink-muted">{m.label}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
