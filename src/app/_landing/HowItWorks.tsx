import { Search, Handshake, FileCheck } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * How it works (§5). The three core surfaces as a 3-step flow
 * Discover → Connect → Deal, iterated over a STEPS array + a co-located `Step`
 * sub-component (the `Meta` idiom), with a flow-line of pills underneath. Section
 * id="how" is the scroll target for the nav + hero "See how it works" anchor.
 * Placeholder bodies — real copy later.
 */
const STEPS = [
  {
    icon: Search,
    title: "Discover",
    body: "[placeholder] Browse the directory of verified companies and find partners that fit what you buy or sell.",
  },
  {
    icon: Handshake,
    title: "Connect",
    body: "[placeholder] Request access, exchange pricing, and start a real conversation — safely, no cross-company leaks.",
  },
  {
    icon: FileCheck,
    title: "Deal",
    body: "[placeholder] Turn the conversation into a structured deal: quantities, prices, and terms, tracked to close.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps from stranger to deal"
      />

      <ol className="mt-12 grid gap-5 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delayMs={i * 90}>
            <Step step={i + 1} icon={s.icon} title={s.title} body={s.body} />
          </Reveal>
        ))}
      </ol>

      <Reveal delayMs={120}>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-ink-muted">
          {STEPS.map((s, i) => (
            <span key={s.title} className="flex items-center gap-3">
              <span className="glass rounded-full px-4 py-2">{s.title}</span>
              {i < STEPS.length - 1 && (
                <span className="text-brand" aria-hidden>
                  →
                </span>
              )}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Step({
  step,
  icon: Icon,
  title,
  body,
}: {
  step: number;
  icon: typeof Search;
  title: string;
  body: string;
}) {
  return (
    <li className="glass h-full rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-[0_8px_20px_-8px_rgba(227,11,93,0.6)]">
          <Icon size={20} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          Step {step}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </li>
  );
}
