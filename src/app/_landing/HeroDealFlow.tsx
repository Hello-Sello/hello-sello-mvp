"use client";

import { useEffect, useRef } from "react";
import { LENA_AVA_SVG, MARCO_AVA_SVG } from "./heroAvatars";

/**
 * Hero deal-flow animation (landing hero - product-visual slot).
 *
 * A decorative, reduced-motion-safe illustration of the product thesis:
 * a chat between two people (Lena at Greenleaf, Marco at StonePharm)
 * crystallises into a structured Deal Card across a "//" transform seam.
 * The Deal Card is the visual anchor. Sample content is ILLUSTRATIVE only
 * - no real customer data, logos, or metrics (D-06); the avatars are
 * illustrated portraits (DiceBear notionists, CC0), not photos of real
 * people.
 *
 * The static skeleton renders in JSX (SSR-safe, no hydration mismatch);
 * the timeline is driven imperatively in a mount effect scoped to this
 * component's root, with full cleanup on unmount. Styling lives in
 * globals.css under the `hdf-` scope (reuses the app brand + glass tokens).
 *
 * Motion follows premium-hero rules: short beats (enter ~280ms, cross-seam
 * flight ~460ms), custom easing curves, and exactly ONE spring - spent on
 * the seal. Deliberately NOT a heading and NOT a <header>: the landing E2E
 * guards require the hero's single <h1> and zero `header.glass-strong` to
 * stay intact (see e2e/landing.spec.ts). The animated stage is aria-hidden
 * with an sr-only caption so the illustrative names/prices never reach the
 * accessibility tree.
 */

type Person = { name: string; cls: "left" | "right"; ring: "gray" | "pink"; ava: string };

const PEOPLE = {
  lena: { name: "Lena", cls: "left", ring: "gray", ava: LENA_AVA_SVG },
  marco: { name: "Marco", cls: "right", ring: "pink", ava: MARCO_AVA_SVG },
} satisfies Record<string, Person>;

type Tok = { field: string; val: string };
type Msg = { p: keyof typeof PEOPLE; time: string; html: string; toks: Tok[]; seal?: boolean };

const MESSAGES: Msg[] = [
  {
    p: "lena",
    time: "09:24",
    html:
      'Need <span class="hdf-tok" data-tok="qty">500 boxes</span> of <span class="hdf-tok" data-tok="product">Paracetamol 500mg</span> — what’s your price?',
    toks: [
      { field: "product", val: "Paracetamol 500mg" },
      { field: "qty", val: "500 boxes" },
    ],
  },
  {
    p: "marco",
    time: "09:24",
    html: '<span class="hdf-tok" data-tok="price">€2.40</span> a box. I can hold the full 500 for you.',
    toks: [{ field: "price", val: "€2.40" }],
  },
  {
    p: "lena",
    time: "09:25",
    html: 'Can you deliver by <span class="hdf-tok" data-tok="delivery">Friday</span>?',
    toks: [{ field: "delivery", val: "Friday" }],
  },
  {
    p: "marco",
    time: "09:25",
    html: 'Friday works. <span class="hdf-tok" data-tok="payment">Net 30</span> on payment?',
    toks: [{ field: "payment", val: "Net 30" }],
  },
  { p: "lena", time: "09:26", html: "Deal — lock it in. 🤝", toks: [], seal: true },
];

const NUM = new Set(["qty", "price"]); // fields shown in tabular mono numerals
const FIELDS = ["product", "qty", "price", "delivery", "payment"] as const;

// motion budget - short beats, one spring (on the seal)
const TYPING = 560;
const MSG_GAP = 1750;
const FLY_DELAY = 460;
const FLY_STAGGER = 300;
const FLY_DUR = 460;
const HOLD = 3200;

export function HeroDealFlow() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const msgsEl = root.querySelector<HTMLElement>("[data-msgs]");
    const seamEl = root.querySelector<HTMLElement>("[data-seam]");
    const stageEl = root.querySelector<HTMLElement>("[data-stage]");
    const totalEl = root.querySelector<HTMLElement>("[data-total]");
    const statusEl = root.querySelector<HTMLElement>("[data-status]");
    const footEl = root.querySelector<HTMLElement>("[data-foot]");
    const cardEl = root.querySelector<HTMLElement>("[data-card]");
    const ringEl = root.querySelector<HTMLElement>("[data-ring]");
    if (!msgsEl || !seamEl || !stageEl || !totalEl || !statusEl || !footEl || !cardEl || !ringEl) return;

    const fieldEl = (n: string) => root.querySelector<HTMLElement>(`[data-field="${n}"]`);

    let cancelled = false;
    const timers: number[] = [];
    const after = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const fillField = (name: string, val: string, instant?: boolean) => {
      const el = fieldEl(name);
      if (!el) return;
      el.classList.remove("hdf-empty");
      el.innerHTML = `<span class="hdf-filled">${val}</span>`;
      const span = el.querySelector<HTMLElement>(".hdf-filled");
      if (!span) return;
      if (instant) {
        span.style.opacity = "1";
        span.style.transform = "none";
        return;
      }
      requestAnimationFrame(() => span.classList.add("in"));
      const row = el.closest(".hdf-row");
      if (row) {
        row.classList.add("hit");
        after(650, () => row.classList.remove("hit"));
      }
    };

    const flyToken = (fromEl: HTMLElement | null, field: string, val: string) => {
      const target = fieldEl(field);
      if (reduced || !fromEl || !target) {
        fillField(field, val);
        return;
      }
      const s = stageEl.getBoundingClientRect();
      const a = fromEl.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const chip = document.createElement("div");
      chip.className = "hdf-flyer";
      chip.textContent = val;
      chip.style.left = `${a.left - s.left}px`;
      chip.style.top = `${a.top - s.top}px`;
      stageEl.appendChild(chip);
      after(FLY_DUR * 0.32, () => {
        seamEl.classList.add("pulse");
        after(620, () => seamEl.classList.remove("pulse"));
      });
      requestAnimationFrame(() => {
        const dx = b.left + b.width / 2 - (a.left + chip.offsetWidth / 2);
        const dy = b.top + b.height / 2 - (a.top + chip.offsetHeight / 2);
        chip.style.transform = `translate(${dx}px, ${dy}px) scale(0.9)`;
      });
      // the chip resolves INTO the value: it lands and the field fills together
      after(FLY_DUR - 40, () => {
        chip.style.opacity = "0";
        fillField(field, val);
      });
      after(FLY_DUR + 220, () => chip.remove());
    };

    const countUp = (to: number) => {
      if (reduced) {
        totalEl.textContent = `€${to.toLocaleString("en-US")}`;
        return;
      }
      totalEl.classList.add("glow");
      after(760, () => totalEl.classList.remove("glow"));
      const dur = 820;
      const t0 = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // decelerate into the final total
        totalEl.textContent = `€${Math.round(eased * to).toLocaleString("en-US")}`;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const makeLine = (m: Msg, typing: boolean) => {
      const person = PEOPLE[m.p];
      const el = document.createElement("div");
      el.className = `hdf-line ${person.cls}${typing ? " typing" : ""}`;
      const body = typing
        ? '<div class="hdf-typing-dots"><i></i><i></i><i></i></div>'
        : `${m.html}<span class="hdf-time">${m.time}</span>`;
      el.innerHTML =
        `<div class="hdf-ava ${person.ring}">${person.ava}</div>` +
        `<div class="hdf-bubwrap"><span class="hdf-name">${person.name}</span>` +
        `<div class="hdf-bubble">${body}</div></div>`;
      return el;
    };

    const reset = () => {
      msgsEl.innerHTML = "";
      FIELDS.forEach((f) => {
        const el = fieldEl(f);
        if (el) {
          el.className = `hdf-v${NUM.has(f) ? " num" : ""} hdf-empty`;
          el.innerHTML = "";
        }
      });
      totalEl.textContent = "€0";
      totalEl.classList.remove("glow");
      statusEl.textContent = "Draft";
      statusEl.classList.remove("sealed");
      footEl.classList.remove("show");
      cardEl.classList.remove("impact");
      ringEl.classList.remove("go");
      stageEl.querySelectorAll(".hdf-flyer").forEach((n) => n.remove());
    };

    const seal = () => {
      statusEl.textContent = "Sealed";
      statusEl.classList.add("sealed");
      cardEl.classList.add("impact");
      ringEl.classList.remove("go");
      // restart the ring animation cleanly on each loop
      void ringEl.offsetWidth;
      ringEl.classList.add("go");
      footEl.classList.add("show");
      after(520, () => cardEl.classList.remove("impact"));
    };

    const runStatic = () => {
      MESSAGES.forEach((m) => {
        const el = makeLine(m, false);
        el.classList.add("show");
        msgsEl.appendChild(el);
        m.toks.forEach((tk) => fillField(tk.field, tk.val, true));
      });
      totalEl.textContent = "€1,200";
      statusEl.textContent = "Sealed";
      statusEl.classList.add("sealed");
      footEl.classList.add("show");
    };

    const run = () => {
      if (cancelled) return;
      reset();
      if (reduced) {
        runStatic();
        return;
      }
      MESSAGES.forEach((m, i) => {
        after(i * MSG_GAP, () => {
          const typingEl = makeLine(m, true);
          msgsEl.appendChild(typingEl);
          requestAnimationFrame(() => typingEl.classList.add("show"));
          after(TYPING, () => {
            const realEl = makeLine(m, false);
            if (typingEl.parentNode === msgsEl) msgsEl.replaceChild(realEl, typingEl);
            else msgsEl.appendChild(realEl);
            requestAnimationFrame(() => realEl.classList.add("show"));
            m.toks.forEach((tk, j) => {
              after(FLY_DELAY + j * FLY_STAGGER, () => {
                const litEl = realEl.querySelector<HTMLElement>(`[data-tok="${tk.field}"]`);
                litEl?.classList.add("lit");
                flyToken(litEl, tk.field, tk.val);
              });
            });
            if (m.seal) {
              after(560, () => countUp(1200));
              after(1300, seal); // brief stillness, then the one spring
            }
          });
        });
      });
      after(MESSAGES.length * MSG_GAP + 2200 + HOLD, run);
    };

    run();

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      stageEl.querySelectorAll(".hdf-flyer").forEach((n) => n.remove());
    };
  }, []);

  return (
    <div className="hdf-frame" ref={rootRef}>
      <div className="hdf-chrome" aria-hidden="true">
        <span className="hdf-dot a" />
        <span className="hdf-dot b" />
        <span className="hdf-dot c" />
      </div>

      <span className="sr-only">
        Illustration: a chat between two companies turns into a structured, documented deal card.
      </span>

      <div className="hdf-stage" data-stage aria-hidden="true">
        <div className="hdf-col hdf-chat">
          <p className="hdf-zone">Conversation</p>
          <div className="hdf-msgs" data-msgs />
        </div>

        <div className="hdf-seam" data-seam>
          <div className="hdf-vline" />
          <div className="hdf-glow" />
          <div className="hdf-slash">{"//"}</div>
        </div>

        <div className="hdf-col hdf-cardwrap">
          <div className="hdf-card" data-card>
            <span className="hdf-ring" data-ring />
            <div className="hdf-cardhead">
              <span className="hdf-mark">Hello Sello</span>
              <span className="hdf-status" data-status>Draft</span>
            </div>
            <div className="hdf-parties">
              <span className="hdf-party">Greenleaf</span>
              <span className="hdf-swap">⇄</span>
              <span className="hdf-party">StonePharm</span>
            </div>
            <div className="hdf-rows">
              <div className="hdf-row"><span className="hdf-k">Product</span><span className="hdf-v hdf-empty" data-field="product" /></div>
              <div className="hdf-row"><span className="hdf-k">Quantity</span><span className="hdf-v num hdf-empty" data-field="qty" /></div>
              <div className="hdf-row"><span className="hdf-k">Unit price</span><span className="hdf-v num hdf-empty" data-field="price" /></div>
              <div className="hdf-row"><span className="hdf-k">Delivery</span><span className="hdf-v hdf-empty" data-field="delivery" /></div>
              <div className="hdf-row"><span className="hdf-k">Payment</span><span className="hdf-v hdf-empty" data-field="payment" /></div>
              <div className="hdf-row total"><span className="hdf-k">Total</span><span className="hdf-v" data-total>&euro;0</span></div>
            </div>
            <div className="hdf-foot" data-foot>Sealed 09:26 · 1 document attached</div>
          </div>
        </div>
      </div>
    </div>
  );
}
