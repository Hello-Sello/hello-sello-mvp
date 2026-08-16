/**
 * Unit contract for the Allocate pure derivations (Task 1, 260707-0ob plan 2).
 * vitest, no Supabase, no React — mirrors src/modules/catalog/shopMap.test.ts's
 * house style (plain describe/it over pure functions).
 */
import { describe, it, expect } from "vitest";
import { statusOf, orderNumberOf, formatOrderDate, isKeyAccount } from "./status";

describe("statusOf — the 7-state order-status vocabulary (DEV-151)", () => {
  it("negotiation + offer → Sales offer", () => {
    expect(statusOf({ status: "negotiation", dealType: "offer", ticketStatus: null })).toEqual({
      code: "sales_offer",
      label: "Sales offer",
    });
  });

  it("negotiation + order → Purchase order", () => {
    expect(statusOf({ status: "negotiation", dealType: "order", ticketStatus: null })).toEqual({
      code: "purchase_order",
      label: "Purchase order",
    });
  });

  it("confirmed → Deal accepted", () => {
    expect(statusOf({ status: "confirmed", dealType: "order", ticketStatus: null })).toEqual({
      code: "accepted",
      label: "Deal accepted",
    });
  });

  it("done → Deal executed", () => {
    expect(statusOf({ status: "done", dealType: "offer", ticketStatus: null })).toEqual({
      code: "executed",
      label: "Deal executed",
    });
  });

  it("ticketStatus 'open' overrides the base status → Ticket created", () => {
    expect(statusOf({ status: "confirmed", dealType: "order", ticketStatus: "open" })).toEqual({
      code: "ticket",
      label: "Ticket created",
    });
  });

  it("ticketStatus 'closed' overrides the base status → Ticket closed", () => {
    expect(statusOf({ status: "done", dealType: "offer", ticketStatus: "closed" })).toEqual({
      code: "ticket_closed",
      label: "Ticket closed",
    });
  });

  it("cancelled — the documented edge case outside the 7-vocab", () => {
    expect(statusOf({ status: "cancelled", dealType: "order", ticketStatus: null })).toEqual({
      code: "cancelled",
      label: "Cancelled",
    });
  });

  it("unsent (private draft) → the neutral/excluded 8th code, never a real colour (D-16 / Open Q5)", () => {
    // drafts are not committed demand - statusOf must never give them one of
    // the 7 real colours, so an unsent card can never colour calendar/orders.
    expect(statusOf({ status: "unsent", dealType: "offer", ticketStatus: null })).toEqual({
      code: "cancelled",
      label: "Cancelled",
    });
    expect(statusOf({ status: "unsent", dealType: "order", ticketStatus: null })).toEqual({
      code: "cancelled",
      label: "Cancelled",
    });
  });
});

describe("orderNumberOf — HS-<seller>-<buyer>-<YYMMDD>-<seq3>", () => {
  it("a 3+-word name uses the first letter of the first 3 words", () => {
    // "Canadian Craft Cannabis GmbH" → strip trailing GmbH → 3 words → CCC
    expect(orderNumberOf("Canadian Craft Cannabis GmbH", "Auromed", "2026-05-12T00:00:00Z", 1)).toBe(
      "HS-CCC-AUR-260512-001",
    );
  });

  it("a 1-word name uses its first 3 alphabetic characters", () => {
    expect(orderNumberOf("Auromed", "Cantouring", "2026-05-12T00:00:00Z", 2)).toBe(
      "HS-AUR-CAN-260512-002",
    );
  });

  it("a legal-suffix-stripped 1-word-remaining name still resolves to 3 letters", () => {
    // "PharmaCore Int" → strip trailing "Int" → 1 word left → first 3 chars
    expect(orderNumberOf("GreenLeaf Cultivation GmbH", "PharmaCore Int", "2026-05-10T00:00:00Z", 5)).toBe(
      "HS-GRE-PHA-260510-005",
    );
  });

  it("pads a name with fewer than 3 letters total with 'X'", () => {
    expect(orderNumberOf("Ab", "Cd", "2026-01-01T00:00:00Z", 1)).toBe("HS-ABX-CDX-260101-001");
  });

  it("zero-pads the sequence to 3 digits", () => {
    expect(orderNumberOf("Auromed", "Cantouring", "2026-05-12T00:00:00Z", 42)).toBe(
      "HS-AUR-CAN-260512-042",
    );
  });
});

describe("formatOrderDate — DD-Mon-YY", () => {
  it("formats a May date", () => {
    expect(formatOrderDate("2026-05-12T00:00:00Z")).toBe("12-May-26");
  });

  it("formats a single-digit day/month with leading zeros", () => {
    expect(formatOrderDate("2026-01-08T00:00:00Z")).toBe("08-Jan-26");
  });

  it("formats a December date", () => {
    expect(formatOrderDate("2026-12-31T00:00:00Z")).toBe("31-Dec-26");
  });
});

describe("isKeyAccount — top-half classification, ties broken toward true", () => {
  const totals = { A: 100, B: 80, C: 50, D: 20 };

  it("the top half (at or above the median) is a Key Account", () => {
    expect(isKeyAccount("A", totals)).toBe(true);
    expect(isKeyAccount("B", totals)).toBe(true); // AT the threshold — tie broken toward true
  });

  it("the bottom half (below the median) is not a Key Account", () => {
    expect(isKeyAccount("C", totals)).toBe(false);
    expect(isKeyAccount("D", totals)).toBe(false);
  });

  it("an unknown buyer id defaults to a 0 total (not a Key Account, unless 0 is itself the threshold)", () => {
    expect(isKeyAccount("unknown-id", totals)).toBe(false);
  });

  it("an empty totals map has no Key Accounts", () => {
    expect(isKeyAccount("A", {})).toBe(false);
  });

  it("a sole buyer is always in the top half", () => {
    expect(isKeyAccount("A", { A: 10 })).toBe(true);
  });
});
