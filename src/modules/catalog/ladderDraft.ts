/**
 * The tier-ladder draft core (0021, T04 · ADR-0004 §5): the pure seam between
 * the card's raw-string tier rows and the numeric `PriceTier[]` the save path
 * writes. Three responsibilities, no React and no Supabase:
 *
 * - `draftFromTiers` / `tiersFromDraft` convert between the two shapes (blank
 *   rows dropped, sorted ascending by min at save).
 * - `validateLadder` is the UX mirror of the DB shape trigger: per-row invalid
 *   flags + a pinned message line, tolerant of blank not-yet-typed rows.
 * - `validateTiers` is the numeric server-side re-check `saveLadder` runs
 *   (first error string or null) — the client mirror can be bypassed, the DB
 *   trigger is the real enforcement; this is the friendly gate between them.
 *
 * Both validators share one rung check (`rungError`) so the descent/undercut
 * rules exist exactly once.
 */
import type { PriceTier } from "./pricing";

/** One editable tier row, raw input strings (smooth decimal typing — parsing
 *  happens only at validation/save, mirroring the card's other draft fields). */
export interface LadderRowDraft {
  min: string;
  price: string;
}

/** Per-row validity for the editor UI. `message` is the single line shown
 *  under an invalid row (ascending-min text is pinned to the prototype). */
export interface LadderValidation {
  rows: { minInvalid: boolean; priceInvalid: boolean; message: string | null }[];
  canSave: boolean;
}

/** Raw draft string → number, or null when blank/unparseable. EU comma
 *  decimals are tolerated ("4,5" → 4.5), matching the flush-time parseNum. */
export function draftNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;

/** An untouched row ({min:'',price:''}) — never invalid, dropped at save. */
const isBlank = (r: LadderRowDraft): boolean =>
  r.min.trim() === "" && r.price.trim() === "";

/**
 * The ONE rung check both validators share (ADR-0004 §5): min positive and
 * strictly above the previous rung; price positive, strictly below the base
 * (when a base exists) and strictly below the previous rung. First violation
 * wins; the ascending-min message is pinned (prototype :400).
 */
function rungError(
  min: number,
  price: number,
  prevMin: number | null,
  prevPrice: number | null,
  base: number | null,
): { field: "min" | "price"; message: string } | null {
  if (!positive(min)) {
    return { field: "min", message: "Must be a positive number of grams" };
  }
  if (prevMin !== null && min <= prevMin) {
    return { field: "min", message: `Must be higher than the tier above (${prevMin}g)` };
  }
  if (!positive(price)) {
    return { field: "price", message: "Must be a positive price" };
  }
  if (base !== null && price >= base) {
    return { field: "price", message: "Must be below the base price" };
  }
  if (prevPrice !== null && price >= prevPrice) {
    return { field: "price", message: "Must be below the tier above" };
  }
  return null;
}

/** Rungs → raw input strings, order preserved (the editor's initial rows). */
export function draftFromTiers(tiers: PriceTier[]): LadderRowDraft[] {
  return tiers.map((t) => ({ min: String(t.minGrams), price: String(t.pricePerGram) }));
}

/** Draft rows → the numeric ladder the save path writes: blank rows dropped,
 *  values numbered, sorted ascending by min. */
export function tiersFromDraft(rows: LadderRowDraft[]): PriceTier[] {
  return rows
    .filter((r) => !isBlank(r))
    .map((r) => ({
      minGrams: draftNumber(r.min) ?? NaN,
      pricePerGram: draftNumber(r.price) ?? NaN,
    }))
    .sort((a, b) => a.minGrams - b.minGrams);
}

/**
 * The per-row UX mirror of the DB trigger. Blank rows are clean (typing UX —
 * they are dropped at save) and skipped by the previous-row comparisons; a
 * half-typed row validates its empty field. An empty draft is saveable (a
 * ladder may be cleared). `base` null skips the base check (price-less flow).
 */
export function validateLadder(rows: LadderRowDraft[], base: number | null): LadderValidation {
  let prevMin: number | null = null;
  let prevPrice: number | null = null;
  const out = rows.map((r) => {
    if (isBlank(r)) return { minInvalid: false, priceInvalid: false, message: null };
    const min = draftNumber(r.min) ?? NaN;
    const price = draftNumber(r.price) ?? NaN;
    const err = rungError(min, price, prevMin, prevPrice, base);
    if (positive(min)) prevMin = min;
    if (positive(price)) prevPrice = price;
    return {
      minInvalid: err?.field === "min",
      priceInvalid: err?.field === "price",
      message: err?.message ?? null,
    };
  });
  return { rows: out, canSave: out.every((r) => !r.minInvalid && !r.priceInvalid) };
}

/** The numeric server-side re-check: the first rule violation as a message
 *  string, or null when the ladder is well-formed (empty is always valid). */
export function validateTiers(tiers: PriceTier[], base: number | null): string | null {
  let prevMin: number | null = null;
  let prevPrice: number | null = null;
  for (const t of tiers) {
    const err = rungError(t.minGrams, t.pricePerGram, prevMin, prevPrice, base);
    if (err) return err.message;
    prevMin = t.minGrams;
    prevPrice = t.pricePerGram;
  }
  return null;
}
