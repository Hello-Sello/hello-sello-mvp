import { Search, Handshake, FileCheck } from "lucide-react";

/**
 * How it works (§5). The three core surfaces as a 3-step flow
 * Discover → Connect → Deal, iterated over a STEPS array + a co-located `Step`
 * sub-component (the `Meta` idiom). Placeholder bodies — real copy later.
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
    <section className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand">
        How it works
      </p>
      <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-ink">
        Three steps, one flow
      </h2>

      <ol className="mt-10 grid gap-5 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Step key={s.title} step={i + 1} icon={s.icon} title={s.title} body={s.body} />
        ))}
      </ol>
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
    <li className="glass rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft/30 text-brand">
          <Icon size={20} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Step {step}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </li>
  );
}
