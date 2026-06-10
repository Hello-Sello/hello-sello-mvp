/**
 * Deal card - SEEDED signals (3a, Phase 4 placeholder).
 *
 * The Signals tab on the card back shows advisory, per-side reads. In 3a these
 * are SEEDED (static) content; Deal-Sella writes the real ones in 4d (SR-3).
 * Per-side: the viewer only ever sees their own side's signals - mirrors the
 * private-field privacy, but signals are advisory, not the agreed truth.
 *
 * `icon` is a stable key mapped to a lucide icon in SignalsTab.
 */
import type { PartySide, SignalView } from "../types";

const SEED: Record<PartySide, Omit<SignalView, "id" | "side">[]> = {
  seller: [
    {
      icon: "trend",
      title: "Margin healthy",
      detail: "17% on this deal - above your 14% average with pharmacies.",
    },
    {
      icon: "clock",
      title: "2 products near expiry",
      detail: "Amnesia Haze + Gelato within 60 days. Prioritise dispatch.",
    },
    {
      icon: "repeat",
      title: "Repeat buyer",
      detail: "4th deal with StonePharm. They reorder ~every 5 weeks.",
    },
  ],
  buyer: [
    {
      icon: "price",
      title: "Priced 8% below your last order",
      detail: "Northern Lights down from €4.55/g.",
    },
    {
      icon: "stock",
      title: "1 item low in stock",
      detail: "OG Kush - confirm soon to hold your volume.",
    },
    {
      icon: "truck",
      title: "Reliable delivery",
      detail: "GreenLeaf delivered on time on 96% of past orders.",
    },
  ],
};

/** Seeded advisory signals for one side. Replaced by Sella-written signals in 4d. */
export function seededSignals(side: PartySide): SignalView[] {
  return SEED[side].map((s, i) => ({ id: `seeded-${side}-${i}`, side, ...s }));
}
