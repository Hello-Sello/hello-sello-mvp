import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { ProductFlipCard } from "./ProductFlipCard";
import { LENA_AVA_SVG, MARCO_AVA_SVG } from "./heroAvatars";

/**
 * The deal-room window (one-screen landing, right column): ONE dark product
 * window whose three columns are the three steps, Product card -> Chat ->
 * Contacts. "Three steps to great deals with everybody" is the window title
 * and the page's only <h2>; the three column titles are its only <h3>s, in
 * reading order (the e2e asserts the order, because the order IS the story).
 *
 * Server component, pure CSS motion on ONE 12s clock (`.lp-` in globals.css):
 * the live column brightens and its number fills raspberry while the title
 * bar's progress segment fills; the product card flips once while column 1 is
 * live, the chat bubbles land while column 2 is live, the contact checks pop
 * while column 3 is live. Reduced motion shows the window at rest, all content
 * visible.
 *
 * People, products, prices and companies are ILLUSTRATIVE only (D-06); the
 * avatars are illustrated portraits (DiceBear notionists, CC0). The column
 * bodies are aria-hidden behind the headings + captions.
 */

const CARD_SCALE = 0.52;

const MESSAGES = [
  { who: "lena", text: "Need 500 g Northern Lights. Your price?" },
  { who: "marco", text: "€7.20 per g. I can hold the full 500 g for you." },
  { who: "lena", text: "Deal, lock it in 🤝" },
] as const;

// Short names on purpose: a column is ~200px wide at 1366px.
const CONTACTS = [
  { initials: "GL", name: "Greenleaf", where: "Pharmacy, Berlin" },
  { initials: "SP", name: "StonePharm", where: "Wholesale, Hamburg" },
  { initials: "CC", name: "Canadian Craft", where: "Grower, Canada" },
  { initials: "AP", name: "Apoteca", where: "Pharmacy, München" },
];

export function StepsFlow() {
  return (
    <section id="three-steps" className="flex flex-col">
      <div className="lp-window rounded-[28px] p-2 text-white">
        {/* title bar: window dots, the title, the three-segment progress */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <i className="h-2 w-2 rounded-full bg-white/15" />
            <i className="h-2 w-2 rounded-full bg-white/15" />
            <i className="h-2 w-2 rounded-full bg-white/15" />
          </span>
          {/* On desktop the title is one no-wrap line: lg:w-0 + flex-1 make it
              grow to fill the bar while contributing NO min-content width, so it
              can never widen the window past the screen (it did: 411px on a
              390px viewport). Below lg it simply wraps. */}
          <h2 className="lp-display min-w-0 flex-1 text-center text-[13px] font-semibold leading-snug tracking-[-0.01em] text-white/85 sm:text-sm lg:w-0 lg:truncate">
            Three steps to great deals with everybody
          </h2>
          <span className="flex gap-1" aria-hidden>
            <i className="lp-seg" data-seg="1" />
            <i className="lp-seg" data-seg="2" />
            <i className="lp-seg" data-seg="3" />
          </span>
        </div>

        <div className="grid gap-2 rounded-[22px] bg-white/[0.035] p-2 ring-1 ring-white/[0.08] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
          <Column n={1} title="Product card" sub="This is how you see the product">
            <ProductFlipCard scale={CARD_SCALE} />
          </Column>
          <Column n={2} title="Chat" sub="Private chats, confidential deals">
            <ChatPreview />
          </Column>
          <Column n={3} title="Contacts" sub="Your entire network in one view">
            <ContactsPreview />
          </Column>
        </div>
      </div>

      <p className="mt-4 max-w-[64ch] text-sm leading-relaxed text-ink-muted">
        Emails, PDFs, Messages, Spreadsheets can be cancelled - the future is a
        great network of contacts that chat and trade in one view.
      </p>
    </section>
  );
}

function Column({
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
    <article className="lp-col relative flex flex-col rounded-2xl p-3" data-step={n}>
      <div className="flex items-center gap-2">
        <span className="lp-num grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold">
          {n}
        </span>
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-0.5 text-[11px] text-white/50">{sub}</p>
      <div className="mt-3 flex flex-1 items-center justify-center" aria-hidden>
        {children}
      </div>
    </article>
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
              className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white text-ink ring-1 ring-white/20 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: mine ? MARCO_AVA_SVG : LENA_AVA_SVG }}
            />
            <p
              className={`rounded-2xl px-3 py-1.5 text-xs leading-snug ${
                mine
                  ? "rounded-br-sm bg-brand text-white"
                  : "rounded-bl-sm bg-white/10 text-white ring-1 ring-white/10"
              }`}
            >
              {m.text}
            </p>
          </div>
        );
      })}
      <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-white/45">
        <Lock size={10} aria-hidden /> Encrypted, only the two of you
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
          className="lp-contact flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/[0.08]"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-bold text-white/90">
            {c.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{c.name}</span>
            <span className="block truncate text-[10px] text-white/50">{c.where}</span>
          </span>
          <span className="lp-check grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-white">
            <Check size={12} strokeWidth={3} />
          </span>
        </li>
      ))}
    </ul>
  );
}
