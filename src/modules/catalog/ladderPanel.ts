/**
 * Pure row model for the buyer "See all prices" panel (Variant B, ADR-0004 §5).
 * The panel's highlight delegates to `resolveTierPrice`, so the applied row can
 * never disagree with what the basket will actually charge — the card renders
 * these rows verbatim and adds no price logic of its own.
 */
import { resolveTierPrice } from "./pricing";
import type { PriceTier } from "./pricing";

/** One panel row: the base price first, then the rungs ascending. */
export interface LadderPanelRow {
  label: string; // "Base price" | "from {min}g"
  pricePerGram: number;
  savingPercent: number; // 0 for the base row
  minGrams: number | null; // null = base row
  isApplied: boolean; // the current quantity resolves to this row
}

/**
 * Base row first, rungs ascending by minGrams. A null/zero base or an empty
 * ladder yields `[]` — no panel (never a rung price without a base).
 * `isApplied` marks exactly one row: the rung `currentGrams` reaches, else base.
 */
export function ladderRows(
  basePricePerGram: number | null,
  tiers: PriceTier[],
  currentGrams: number | null,
): LadderPanelRow[] {
  if (basePricePerGram == null || basePricePerGram === 0 || tiers.length === 0) {
    return [];
  }
  const { appliedMin } = resolveTierPrice(basePricePerGram, tiers, currentGrams, "g");
  const rungs = [...tiers].sort((a, b) => a.minGrams - b.minGrams);
  return [
    {
      label: "Base price",
      pricePerGram: basePricePerGram,
      savingPercent: 0,
      minGrams: null,
      isApplied: appliedMin === null,
    },
    ...rungs.map((t) => ({
      label: `from ${t.minGrams}g`,
      pricePerGram: t.pricePerGram,
      savingPercent: Math.round((1 - t.pricePerGram / basePricePerGram) * 100),
      minGrams: t.minGrams,
      isApplied: appliedMin === t.minGrams,
    })),
  ];
}
