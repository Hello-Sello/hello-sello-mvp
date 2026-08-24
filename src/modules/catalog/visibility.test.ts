/**
 * `buyerVisibilityGaps` — the seller-facing "why can't buyers see this?" rule
 * (G5 F-03).
 *
 * These cases are written against `get_discoverable_shop`'s WHERE clause
 * (`20260822100000`) term by term, because that clause is the authority and this
 * module only explains it. If a case here ever has to change to stay green, the
 * question is whether SQL moved — not whether the expectation was too strict.
 *
 * The date-window cases matter most: `visibility_start` / `visibility_end` are
 * settable ONLY through the CSV import template and are shown back by no screen
 * at all, so this file is the only place their effect is asserted anywhere in
 * the repo.
 */
import { describe, it, expect } from "vitest";
import { buyerVisibilityGaps, buyerVisibilityLabel } from "./visibility";

const TODAY = new Date(2026, 7, 24); // 2026-08-24, local — see `isoDate`

const filedAndVisible = {
  profile_visible: true,
  location: "Berlin",
  visibility_start: null,
  visibility_end: null,
};

describe("buyerVisibilityGaps", () => {
  it("a visible, filed, in-window product has no gaps", () => {
    expect(buyerVisibilityGaps(filedAndVisible, TODAY)).toEqual([]);
  });

  it("profile_visible=false → hidden", () => {
    expect(buyerVisibilityGaps({ ...filedAndVisible, profile_visible: false }, TODAY)).toEqual([
      "hidden",
    ]);
  });

  it("profile_visible ABSENT is not hidden — a buyer-facing mapper never carries it", () => {
    // The `=== false` guard, restated at the rule instead of at one call site.
    // `!p.profile_visible` here would report every buyer-shaped row as hidden.
    expect(buyerVisibilityGaps({ location: "Berlin" }, TODAY)).toEqual([]);
  });

  it("location null → unfiled", () => {
    expect(buyerVisibilityGaps({ ...filedAndVisible, location: null }, TODAY)).toEqual(["unfiled"]);
  });

  it("location whitespace-only → unfiled (SQL's NOT NULL would pass it; a shelf name would not)", () => {
    expect(buyerVisibilityGaps({ ...filedAndVisible, location: "   " }, TODAY)).toEqual(["unfiled"]);
  });

  it("reports EVERY applicable reason, not the first", () => {
    // A product that is both hidden and unfiled stays invisible after
    // un-hiding. A badge that then moved the goalposts would read as its own
    // bug, so both come back at once.
    expect(
      buyerVisibilityGaps({ ...filedAndVisible, profile_visible: false, location: null }, TODAY),
    ).toEqual(["hidden", "unfiled"]);
  });

  describe("the date window", () => {
    it("start in the future → outside_dates", () => {
      expect(
        buyerVisibilityGaps({ ...filedAndVisible, visibility_start: "2026-08-25" }, TODAY),
      ).toEqual(["outside_dates"]);
    });

    it("start TODAY is in window — SQL is `<= current_date`, not `<`", () => {
      expect(
        buyerVisibilityGaps({ ...filedAndVisible, visibility_start: "2026-08-24" }, TODAY),
      ).toEqual([]);
    });

    it("end in the past → outside_dates", () => {
      expect(
        buyerVisibilityGaps({ ...filedAndVisible, visibility_end: "2026-08-23" }, TODAY),
      ).toEqual(["outside_dates"]);
    });

    it("end TODAY is in window — SQL is `>= current_date`, not `>`", () => {
      expect(
        buyerVisibilityGaps({ ...filedAndVisible, visibility_end: "2026-08-24" }, TODAY),
      ).toEqual([]);
    });

    it("both ends open is in window", () => {
      expect(
        buyerVisibilityGaps(
          { ...filedAndVisible, visibility_start: null, visibility_end: null },
          TODAY,
        ),
      ).toEqual([]);
    });

    it("a window wrong at BOTH ends reports outside_dates once, not twice", () => {
      expect(
        buyerVisibilityGaps(
          { ...filedAndVisible, visibility_start: "2026-09-01", visibility_end: "2026-08-01" },
          TODAY,
        ),
      ).toEqual(["outside_dates"]);
    });

    it("late local evening does not report tomorrow's window (the UTC trap)", () => {
      // 23:30 local on the 24th. `toISOString()` would say 2026-08-25 anywhere
      // east of Greenwich, flipping a start-tomorrow product visible a day
      // early. `isoDate` reads local calendar parts, so it must not.
      const lateEvening = new Date(2026, 7, 24, 23, 30);
      expect(
        buyerVisibilityGaps({ ...filedAndVisible, visibility_start: "2026-08-25" }, lateEvening),
      ).toEqual(["outside_dates"]);
    });
  });
});

describe("buyerVisibilityLabel", () => {
  it("joins reasons with a middot", () => {
    expect(buyerVisibilityLabel(["hidden", "unfiled"])).toBe("hidden · no location");
  });

  it("returns an empty string for no gaps, so callers cannot render a stray separator", () => {
    expect(buyerVisibilityLabel([])).toBe("");
  });
});
