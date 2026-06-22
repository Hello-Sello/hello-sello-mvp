import { ShieldCheck, Lock, Workflow, BadgeCheck } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * Value props (§4). Buyer-outcome cards rendered via a co-located `ValueProp`
 * sub-component (the `Meta` idiom). Glass cards with a gradient icon tile and a
 * hover lift give the Aurora feel; copy is interim placeholder (real positioning
 * is a later content pass).
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
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Why Hello Sello"
        title="Built for safe B2B trade"
        sub="Replace scattered chats, mail and spreadsheets with one clear flow between companies you can trust."
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PROPS.map((p, i) => (
          <Reveal key={p.title} delayMs={i * 80}>
            <ValueProp icon={p.icon} title={p.title} body={p.body} />
          </Reveal>
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
    <div className="glass h-full rounded-3xl p-6 transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgba(118,0,45,0.45)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-[0_8px_20px_-8px_rgba(227,11,93,0.6)]">
        <Icon size={20} />
      </span>
      <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </div>
  );
}
