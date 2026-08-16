/**
 * RED-first unit contract for the tier-ladder draft core (0021, T04).
 *
 * `ladderDraft.ts` is the pure seam between the card's raw-string draft rows and
 * the numeric `PriceTier[]` the save path writes: `draftFromTiers`/`tiersFromDraft`
 * convert (blank rows dropped, sorted asc by min), `validateLadder` is the UX
 * mirror of the DB shape trigger (per-row flags + pinned messages, ADR-0004 §5),
 * and `validateTiers` is the numeric server-side re-check `saveLadder` runs
 * (amendment 3 — first error string or null).
 *
 * RED until `./ladderDraft` exists — the import fails to resolve. Do NOT create
 * the production module to satisfy a gate; this test drives its shape.
 */
import { describe, it, expect } from "vitest";
import {
  draftFromTiers,
  tiersFromDraft,
  validateLadder,
  validateTiers,
} from "./ladderDraft";
import type { LadderRowDraft } from "./ladderDraft";
import type { PriceTier } from "./pricing";

const rung = (minGrams: number, pricePerGram: number): PriceTier => ({
  minGrams,
  pricePerGram,
});
const row = (min: string, price: string): LadderRowDraft => ({ min, price });
const BLANK = row("", "");

describe("draftFromTiers / tiersFromDraft — the string↔numeric seam", () => {
  it("draftFromTiers maps rungs to raw input strings in order", () => {
    expect(draftFromTiers([rung(500, 8), rung(1000, 7)])).toEqual([
      { min: "500", price: "8" },
      { min: "1000", price: "7" },
    ]);
  });

  it("tiersFromDraft numbers the rows, drops blank rows, and sorts asc by min", () => {
    const rows = [row("1000", "7"), BLANK, row("500", "8")];
    expect(tiersFromDraft(rows)).toEqual([rung(500, 8), rung(1000, 7)]);
  });

  it("round-trips: tiersFromDraft(draftFromTiers(tiers)) is the tiers sorted asc", () => {
    const tiers = [rung(1000, 7), rung(500, 8)];
    expect(tiersFromDraft(draftFromTiers(tiers))).toEqual([
      rung(500, 8),
      rung(1000, 7),
    ]);
  });

  it("empty draft → empty tiers", () => {
    expect(tiersFromDraft([])).toEqual([]);
    expect(tiersFromDraft([BLANK])).toEqual([]);
  });
});

describe("validateLadder — the per-row UX mirror of the DB trigger", () => {
  it("a valid descending ladder under the base is fully clean and saveable", () => {
    const v = validateLadder([row("500", "8"), row("1000", "7")], 10);
    expect(v.canSave).toBe(true);
    expect(v.rows).toHaveLength(2);
    for (const r of v.rows) {
      expect(r.minInvalid).toBe(false);
      expect(r.priceInvalid).toBe(false);
      expect(r.message).toBeNull();
    }
  });

  it("a min not above the previous row's min pins the exact message with the prev grams", () => {
    const v = validateLadder([row("500", "8"), row("400", "7")], 10);
    expect(v.rows[1].minInvalid).toBe(true);
    expect(v.rows[1].message).toBe("Must be higher than the tier above (500g)");
    expect(v.canSave).toBe(false);
  });

  it("an equal min is also 'not higher than the tier above'", () => {
    const v = validateLadder([row("500", "8"), row("500", "7")], 10);
    expect(v.rows[1].minInvalid).toBe(true);
    expect(v.rows[1].message).toBe("Must be higher than the tier above (500g)");
  });

  it("a price equal to the base is invalid: 'Must be below the base price'", () => {
    const v = validateLadder([row("500", "10")], 10);
    expect(v.rows[0].priceInvalid).toBe(true);
    expect(v.rows[0].message).toBe("Must be below the base price");
    expect(v.canSave).toBe(false);
  });

  it("a price above the base is invalid the same way", () => {
    const v = validateLadder([row("500", "11")], 10);
    expect(v.rows[0].priceInvalid).toBe(true);
    expect(v.rows[0].message).toBe("Must be below the base price");
  });

  it("a price not below the previous rung's price → 'Must be below the tier above'", () => {
    const v = validateLadder([row("500", "8"), row("1000", "8")], 10);
    expect(v.rows[1].priceInvalid).toBe(true);
    expect(v.rows[1].message).toBe("Must be below the tier above");
    expect(v.canSave).toBe(false);
  });

  it("a null base skips the base check (price-less flow) but keeps descent checks", () => {
    const ok = validateLadder([row("500", "8"), row("1000", "7")], null);
    expect(ok.canSave).toBe(true);
    const bad = validateLadder([row("500", "8"), row("1000", "9")], null);
    expect(bad.rows[1].priceInvalid).toBe(true);
  });

  it("a min that is not a positive number is invalid (zero, negative, non-numeric)", () => {
    for (const bad of ["0", "-5", "abc"]) {
      const v = validateLadder([row(bad, "8")], 10);
      expect(v.rows[0].minInvalid).toBe(true);
      expect(v.canSave).toBe(false);
    }
  });

  it("a price that is not a positive number is invalid (zero, negative, non-numeric)", () => {
    for (const bad of ["0", "-2", "abc"]) {
      const v = validateLadder([row("500", bad)], 10);
      expect(v.rows[0].priceInvalid).toBe(true);
      expect(v.canSave).toBe(false);
    }
  });

  it("an untyped blank row does not invalidate the draft (typing UX)", () => {
    const v = validateLadder([row("500", "8"), BLANK], 10);
    expect(v.rows[1].minInvalid).toBe(false);
    expect(v.rows[1].priceInvalid).toBe(false);
    expect(v.rows[1].message).toBeNull();
    expect(v.canSave).toBe(true);
  });

  it("a blank row between filled rows is skipped by the previous-row comparisons", () => {
    // 500/8 · blank · 1000/7 is a valid ladder — the blank is dropped at save,
    // so 1000 compares against 500 (and 7 against 8), not against the blank.
    const v = validateLadder([row("500", "8"), BLANK, row("1000", "7")], 10);
    expect(v.canSave).toBe(true);
  });

  it("a half-typed row is no longer blank and validates its empty field", () => {
    const v = validateLadder([row("500", "")], null);
    expect(v.rows[0].priceInvalid).toBe(true);
    expect(v.canSave).toBe(false);
  });

  it("an empty draft is saveable (a ladder may be cleared)", () => {
    const v = validateLadder([], 10);
    expect(v.rows).toEqual([]);
    expect(v.canSave).toBe(true);
  });
});

describe("validateTiers — the numeric server-side re-check (first error or null)", () => {
  it("a valid ladder under the base → null", () => {
    expect(validateTiers([rung(500, 8), rung(1000, 7)], 10)).toBeNull();
  });

  it("an empty ladder → null (clearing is always valid)", () => {
    expect(validateTiers([], 10)).toBeNull();
    expect(validateTiers([], null)).toBeNull();
  });

  it("out-of-order mins → an error string", () => {
    const err = validateTiers([rung(1000, 7), rung(500, 8)], 10);
    expect(typeof err).toBe("string");
    expect(err).toMatch(/\S/);
  });

  it("duplicate mins → an error string", () => {
    expect(typeof validateTiers([rung(500, 8), rung(500, 7)], 10)).toBe("string");
  });

  it("non-descending prices → an error string", () => {
    expect(typeof validateTiers([rung(500, 8), rung(1000, 8)], 10)).toBe("string");
  });

  it("a rung price at or above the base → an error string", () => {
    expect(typeof validateTiers([rung(500, 10)], 10)).toBe("string");
  });

  it("a null base skips the base check but keeps descent checks", () => {
    expect(validateTiers([rung(500, 8)], null)).toBeNull();
    expect(typeof validateTiers([rung(500, 8), rung(1000, 9)], null)).toBe(
      "string",
    );
  });
});
