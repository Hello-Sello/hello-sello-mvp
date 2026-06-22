import { ChevronDown } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

/**
 * FAQ (§9). Native <details>/<summary> accordion (no client JS — keeps the page
 * server-rendered), styled as glass cards. Section id="faq" is the nav scroll
 * target. Placeholder Q&A; the lucide chevron is decorative and rotates via the
 * `group-open` marker.
 */
const FAQS = [
  {
    q: "Who can join Hello Sello?",
    a: "[placeholder] Only verified companies (e.g. pharmacies and their partners). Apply for access and we verify your business before you onboard.",
  },
  {
    q: "How long does verification take?",
    a: "[placeholder] Typically a few business days. You will get an email the moment you are approved.",
  },
  {
    q: "Is my data visible to competitors?",
    a: "[placeholder] No. Strict tenant isolation means another company never sees your catalogue or deals unless you connect.",
  },
  {
    q: "What does it cost?",
    a: "[placeholder] Pricing details pending. Request access and we will walk you through it.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-20">
      <SectionHeading eyebrow="FAQ" title="Common questions" />

      <div className="mt-10 space-y-3">
        {FAQS.map((item, i) => (
          <Reveal key={item.q} delayMs={i * 70}>
            <details className="group glass rounded-2xl px-5 py-4 [&_summary]:list-none">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-ink">
                {item.q}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-brand transition group-open:rotate-180"
                />
              </summary>
              <p className="mt-2 text-sm text-ink-muted">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
