/**
 * RED-first unit test for the recipient subtraction (phase 3b / plan 01,
 * BSKT-01). Mirrors the 3a pure-unit pattern in derive.test.ts: vitest, a pure
 * import of a helper that does not exist yet, no Supabase, no React.
 *
 * `otherOf` is the SINGLE owner of the "the recipient is the OTHER side" math.
 * The p2p recipient resolver (resolveP2pRecipient) calls it twice - once to pick
 * the recipient COMPANY out of the relationship pair, once to pick the recipient
 * PERSON out of the chat thread - so proving it here in isolation means the DB
 * read stays thin and the rule is tested without a database.
 */
import { describe, it, expect } from "vitest";
import { otherOf } from "./recipient";

describe("otherOf (BSKT-01 - the recipient is the OTHER side)", () => {
  it("returns b when the viewer is a", () => {
    expect(otherOf("me", "me", "them")).toBe("them");
  });

  it("returns a when the viewer is b", () => {
    expect(otherOf("me", "them", "me")).toBe("them");
  });

  it("returns null when the other side (b) is null and the viewer is a", () => {
    expect(otherOf("me", "me", null)).toBeNull();
  });

  it("returns null when a is null and the viewer is the b side", () => {
    // a is null, so `a === viewer` is false and we return a (null) - the
    // OTHER side does not exist.
    expect(otherOf("me", null, "me")).toBeNull();
  });
});
