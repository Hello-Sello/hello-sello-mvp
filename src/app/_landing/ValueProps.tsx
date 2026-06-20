import { ShieldCheck, Lock, Workflow, BadgeCheck } from "lucide-react";

/**
 * Value props (§4). 3-4 buyer-outcome cards with placeholder copy, rendered via
 * a co-located `ValueProp` named sub-component (mirrors the `Meta` idiom from
 * /c/[handle]). Placeholder copy only — real positioning is a later content pass.
 */

const PROPS = [
  {
    icon: ShieldCheck,
    title: "Verified partners only",
    body: "[placeholder] Every company is business-verified before it can trade, so you know who you are dealing with.",
  },
  {
    icon: Lock,
    title: "No cross-company leaks",
    body: "[placeholder] Strict tenant isolation — your catalogue and deals stay private unless you choose to connect.",
  },
  {
    icon: Workflow,
    title: "One place, end to end",
    body: "[placeholder] Discover, connect, and close — the whole flow lives in a single workspace.",
  },
  {
    icon: BadgeCheck,
    title: "Documented deals",
    body: "[placeholder] Quantities, prices, and terms are tracked and frozen at deal time — an auditable record.",
  },
];

export function ValueProps() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand">
        Why Hello Sello
      </p>
      <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-ink">
        Built for safe B2B trade
      </h2>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PROPS.map((p) => (
          <ValueProp key={p.title} icon={p.icon} title={p.title} body={p.body} />
        ))}
      </div>
    </section>
  );
}

function ValueProp({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="glass rounded-3xl p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft/30 text-brand">
        <Icon size={20} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </div>
  );
}
