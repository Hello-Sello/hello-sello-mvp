import type { CSSProperties } from "react";
import { Cpu, Globe, Lock, Server } from "lucide-react";
import { Reveal } from "./Reveal";

// The four claims. Each sentence is the PRD's verified grounding text, not the
// prototype's — variant C appended clauses ("end to end of our stack", "It never
// leaves the EU") that ADR 0010 D4 deliberately dropped.
const CLAIMS = [
  {
    icon: Globe,
    label: "GDPR",
    body: "Built to the EU General Data Protection Regulation.",
  },
  {
    icon: Lock,
    label: "Data encryption",
    body: "Encrypted in transit and at rest.",
  },
  {
    icon: Server,
    label: "Hosted in Germany",
    body: "Every record lives in a German data centre.",
  },
  {
    icon: Cpu,
    label: "EU AI models",
    body: "Sella runs on AI models served inside the EU.",
  },
];

// Twelve stars at an equal 30° spacing — the EU flag's circle, not a decorative
// scatter. Each star's own angle is the only thing that varies, so it rides in as
// an inline custom property the `dpb-` keyframes read back out.
const STAR_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

/**
 * How your data is protected (§7a, 0028). Four grounded compliance claims on a
 * dark card, behind a ring of twelve gold EU stars circling a lock.
 *
 * Server component by construction (ADR 0010 D2): a visitor with JavaScript
 * blocked must still read all four claims, so nothing here may become a client
 * island. The ring's motion is pure CSS — the `dpb-` block in globals.css, which
 * also owns the prefers-reduced-motion rule. That rule has to name the ring, the
 * stars AND the lock; naming the ring alone leaves twelve stars turning for a
 * visitor who asked for no motion.
 *
 * A contained `rounded-3xl` card, mirroring B2BOnlyBand's wrapper (ADR 0010 D3):
 * no block of content on this page touches the screen edges, and the locked
 * prototype's full-bleed treatment is superseded on exactly that point. On a page
 * that is white top to bottom, the emphasis is carried by dark, not by width.
 *
 * The heading is hand-rolled rather than reusing SectionHeading: that component
 * hard-codes light-page ink colours and wraps its own Reveal, which would nest
 * inside this one (ADR 0010 §2).
 */
export function DataProtection() {
  return (
    <section id="data-protection" className="scroll-mt-24 px-6 py-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="dpb-card overflow-hidden rounded-3xl px-8 py-14 text-center shadow-[0_30px_80px_-30px_rgba(26,10,46,0.6)]">
          <div className="dpb-ring" aria-hidden>
            {STAR_ANGLES.map((angle) => (
              <span
                key={angle}
                className="dpb-star"
                style={{ "--dpb-a": `${angle}deg` } as CSSProperties}
              >
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    fill="currentColor"
                    d="M12 2l2.6 6.9 7.4.4-5.7 4.7 1.9 7.2L12 17.3 5.8 21.2l1.9-7.2L2 9.3l7.4-.4z"
                  />
                </svg>
              </span>
            ))}
            <div className="dpb-core">
              <svg className="dpb-lock" viewBox="0 0 24 24" width="40" height="40">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  d="M7 10V7a5 5 0 0 1 10 0v3"
                />
                <rect x="4.5" y="10" width="15" height="11" rx="2.6" fill="currentColor" />
              </svg>
            </div>
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
            Security &amp; compliance
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            How your data is protected
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/75">
            German hosting, EU AI models, encrypted throughout.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CLAIMS.map(({ icon: Icon, label, body }) => (
              <div
                key={label}
                className="rounded-3xl border border-white/15 bg-white/5 px-5 py-6"
              >
                <Icon
                  className="mx-auto text-white/80"
                  size={26}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <h3 className="mt-4 text-base font-semibold text-white">{label}</h3>
                <p className="mt-1.5 text-sm text-white/70">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
