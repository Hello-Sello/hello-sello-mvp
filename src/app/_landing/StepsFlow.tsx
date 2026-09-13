import type { ReactNode } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { ProductFlipCard } from "./ProductFlipCard";
import { LENA_AVA_SVG, MARCO_AVA_SVG } from "./heroAvatars";

/**
 * The three-step story (one-screen landing, right column): Product card ->
 * Chat -> Contacts. "Three steps to great deals with everybody" is the page's
 * only <h2>; the three step titles are its only <h3>s, in reading order (the
 * e2e case asserts the order, because the order IS the story).
 *
 * Server component, pure CSS motion (`.lp-step`, `.lp-bubble`, `.lp-check` in
 * globals.css): one 12s loop lights the panels in turn, the chat bubbles land
 * while panel 2 is live, the contact checks pop while panel 3 is live. The
 * product card keeps its own flip loop (`.pcard`). Reduced motion shows every
 * panel at rest with all content visible.
 *
 * People, products, prices and companies are ILLUSTRATIVE only (D-06); the
 * avatars are illustrated portraits (DiceBear notionists, CC0), reused from
 * the previous hero. The stage is aria-hidden behind the headings + captions.
 */

const CARD_SCALE = 0.56;

const MESSAGES = [
  { who: "lena", text: "Need 500 g Northern Lights. Your price?" },
  { who: "marco", text: "€7.20 per g. I can hold the full 500 g for you." },
  { who: "lena", text: "Deal, lock it in 🤝" },
] as const;

// Short names on purpose: the panel is ~170px wide at 1366px, so a long
// company name would truncate mid-word.
const CONTACTS = [
  { initials: "GL", name: "Greenleaf", where: "Pharmacy · Berlin" },
  { initials: "SP", name: "StonePharm", where: "Wholesale · Hamburg" },
  { initials: "CC", name: "Canadian Craft", where: "Grower · Canada" },
  { initials: "AP", name: "Apoteca", where: "Pharmacy · München" },
];

export function StepsFlow() {
  return (
    <section id="three-steps" className="flex flex-col">
      <h2 className="text-center text-lg font-bold tracking-tight text-ink sm:text-xl">
        Three steps to great deals with everybody
      </h2>

      <div className="mt-4 grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Step n={1} title="Product card" sub="This is how you see the product">
          <ProductFlipCard scale={CARD_SCALE} />
        </Step>

        <Arrow />

        <Step n={2} title="Chat" sub="Private chats, confidential deals">
          <ChatPreview />
        </Step>

        <Arrow />

        <Step n={3} title="Contacts" sub="Your entire network in one view">
          <ContactsPreview />
        </Step>
      </div>

      <p className="mx-auto mt-4 max-w-xl text-center text-sm text-ink-muted">
        Emails, PDFs, Messages, Spreadsheets can be cancelled - the future is a
        great network of contacts that chat and trade in one view.
      </p>
    </section>
  );
}

function Step({
  n,
  title,
  sub,
  children,
}: {
  n: number;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <article className="lp-step glass flex flex-col rounded-3xl p-4" data-step={n}>
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
          {n}
        </span>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
      <div className="mt-3 flex flex-1 items-center justify-center" aria-hidden>
        {children}
      </div>
    </article>
  );
}

function Arrow() {
  return (
    <span
      className="flex items-center justify-center text-brand max-lg:rotate-90"
      aria-hidden
    >
      <ArrowRight size={22} strokeWidth={2.25} />
    </span>
  );
}

function ChatPreview() {
  return (
    <div className="flex w-full max-w-[250px] flex-col gap-2">
      {MESSAGES.map((m, i) => {
        const mine = m.who === "marco";
        return (
          <div
            key={i}
            className={`lp-bubble flex items-end gap-1.5 ${mine ? "flex-row-reverse self-end" : "self-start"}`}
          >
            <span
              className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-ink/10 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: mine ? MARCO_AVA_SVG : LENA_AVA_SVG }}
            />
            <p
              className={`rounded-2xl px-3 py-1.5 text-xs leading-snug ${
                mine
                  ? "rounded-br-sm bg-brand text-white"
                  : "rounded-bl-sm bg-white text-ink ring-1 ring-ink/10"
              }`}
            >
              {m.text}
            </p>
          </div>
        );
      })}
      <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-ink-muted">
        <Lock size={10} aria-hidden /> Encrypted · only the two of you
      </p>
    </div>
  );
}

function ContactsPreview() {
  return (
    <ul className="w-full max-w-[250px] space-y-1.5">
      {CONTACTS.map((c) => (
        <li
          key={c.name}
          className="lp-contact flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 ring-1 ring-ink/10"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
            {c.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-ink">{c.name}</span>
            <span className="block text-[10px] text-ink-muted">{c.where}</span>
          </span>
          <span className="lp-check grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-white">
            <Check size={12} strokeWidth={3} />
          </span>
        </li>
      ))}
    </ul>
  );
}
