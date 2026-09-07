import { ShieldCheck, Tag, Send } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * What you can do (§4). Capability cards — what a member can actually do here —
 * rendered via a co-located `ValueProp` sub-component (the `Meta` idiom). Glass
 * cards with a brand-tinted icon and a hover lift give the Aurora feel.
 *
 * The file and export keep the `ValueProps` name: renaming would reach
 * `page.tsx`'s import, which 0028 fences as untouched.
 */
const PROPS = [
  {
    icon: Tag,
    title: "Create offers and orders",
    body: "Build an offer or an order in the chat you are already having. No separate tool, no re-keying.",
  },
  {
    icon: Send,
    title: "Send to all your customers and suppliers",
    body: "Push a deal or an order out to your whole book at once, or to one partner at a time.",
  },
  {
    icon: ShieldCheck,
    title: "Verified partners only",
    body: "Every company is business-verified before it can trade, so you always know exactly who is on the other side of the deal.",
  },
];

export function ValueProps() {
  return (
    <section id="what-you-can-do" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <SectionHeading
        eyebrow="What you can do"
        title="What you can do on Hello Sello"
        sub="Buyers and sellers, one platform — connect and trade fast."
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
