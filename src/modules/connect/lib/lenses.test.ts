import { describe, expect, it } from "vitest";
import { LENSES, lensCounts, matchesLens } from "./lenses";
import type { InboxItemView } from "../types";

/** A minimal InboxItemView — only the fields the lens predicates read. */
function item(over: Partial<InboxItemView>): InboxItemView {
  return {
    id: "i1",
    type: "connect",
    status: "pending",
    assigned_to: null,
    deal_card_id: null,
    dealCard: null,
    ...over,
  } as InboxItemView;
}

describe("deal_tickets lens (Lane A)", () => {
  it("matches only pending deal_card items", () => {
    expect(matchesLens(item({ type: "deal_card", deal_card_id: "d1" }), "deal_tickets", "me")).toBe(
      true,
    );
    // a connection request never shows under Deal tickets
    expect(matchesLens(item({ type: "connect" }), "deal_tickets", "me")).toBe(false);
    // a claimed/accepted ticket leaves the lens (it lives in History)
    expect(
      matchesLens(item({ type: "deal_card", status: "accepted" }), "deal_tickets", "me"),
    ).toBe(false);
  });

  it("is a registered lens with its own count", () => {
    expect(LENSES.some((l) => l.key === "deal_tickets")).toBe(true);
    const counts = lensCounts(
      [item({ type: "deal_card", deal_card_id: "d1" }), item({ type: "connect" })],
      "me",
    );
    expect(counts.deal_tickets).toBe(1);
  });

  it("leaves the connection lenses' behaviour untouched", () => {
    const connect = item({ type: "connect" });
    expect(matchesLens(connect, "unassigned", "me")).toBe(true);
    expect(matchesLens(connect, "all", "me")).toBe(true);
    expect(matchesLens(item({ type: "connect", status: "accepted" }), "history", "me")).toBe(true);
  });
});
