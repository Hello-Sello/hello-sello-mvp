import { ChevronDown } from "lucide-react";

/**
 * FAQ (§9). Native <details>/<summary> accordion (no client JS needed — keeps
 * the page server-rendered and avoids gold-plating, D-15). Placeholder Q&A; the
 * lucide chevron is decorative and rotates via the `group-open` marker.
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
    <section className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand">
        FAQ
      </p>
      <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-ink">
        Common questions
      </h2>

      <div className="mt-8 space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="group glass rounded-2xl px-5 py-4 [&_summary]:list-none"
          >
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-ink">
              {item.q}
              <ChevronDown
                size={18}
                className="text-brand transition group-open:rotate-180"
              />
            </summary>
            <p className="mt-2 text-sm text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
