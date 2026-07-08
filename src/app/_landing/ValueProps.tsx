import { ShieldCheck, Lock, Workflow, BadgeCheck } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * Value props (§4). Buyer-outcome cards rendered via a co-located `ValueProp`
 * sub-component (the `Meta` idiom). Glass cards with a gradient icon tile and a
 * hover lift give the Aurora feel.
 */
const PROPS = [
  {
    icon: ShieldCheck,
    title: "Verified partners only",
    body: "Every company is business-verified before it can trade, so you always know exactly who is on the other side of the deal.",
  },
  {
    icon: Lock,
    title: "No cross-company leaks",
    body: "Strict company isolation keeps your catalogue, pricing, and deals private. Nothing is shared until you choose to connect.",
  },
  {
    icon: Workflow,
    title: "One place, end to end",
    body: "Chat, sell, buy, and negotiate in a single space, instead of jumping between mail, chat, PDFs, and your ERP.",
  },
  {
    icon: BadgeCheck,
    title: "Documented deals",
    body: "AI turns every conversation into a structured deal. Quantities, prices, and terms are captured and frozen at deal time.",
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
      <Icon className="text-brand" size={28} strokeWidth={1.75} aria-hidden />
      <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </div>
  );
}
