import { describe, it, expect } from "vitest";
import { toGrams } from "./pack";

describe("toGrams (Pack rule — grams computed only at Send)", () => {
  it("multiplies pack count by pack size", () => {
    expect(toGrams(3, 50)).toBe(150);
  });

  it("returns null when the pack size is unknown", () => {
    expect(toGrams(3, null)).toBeNull();
  });

  it("handles a single pack", () => {
    expect(toGrams(1, 1000)).toBe(1000);
  });
});
