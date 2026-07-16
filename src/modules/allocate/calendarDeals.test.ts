/**
 * Unit contract for the calendarDeals narrowing filter (18-03 Task 2).
 * vitest, no Supabase, no React — same house style as calendar.test.ts.
 *
 * `getSellerCalendarDeals()`/`getBuyerCalendarDeals()` themselves are
 * Supabase-coupled (async, hit the DB) so they aren't unit-tested directly
 * here. What IS unit-tested is the pure `narrowByRole` predicate both
 * functions share — the exact filtering logic that decides which side of a
 * `deal_card` row the caller is on. This mirrors `orders.ts`'s T-260707-04
 * mitigation (seller-only narrowing after RLS returns both sides), proven
 * here for BOTH roles with hand-built fixtures (no live Supabase client).
 */
import { describe, it, expect } from "vitest";
import { sellerCompanyId, buyerCompanyId } from "@/modules/deals";
import { narrowByRole, type CardRoleFacts } from "./calendarDeals";

const COMPANY_A = "company-a"; // the caller, in every fixture row below
const COMPANY_B = "company-b"; // the counterparty

/** A minimal deal_card row — only the fields the role derivation reads. */
function card(partial: Partial<CardRoleFacts> & { relationship_id: string }): CardRoleFacts {
  return {
    relationship_id: partial.relationship_id,
    deal_type: partial.deal_type ?? "offer",
    initiating_company_id: partial.initiating_company_id ?? COMPANY_A,
  };
}

const relById = new Map([
  ["rel-1", { company_a_id: COMPANY_A, company_b_id: COMPANY_B }],
]);

describe("narrowByRole — the shared buyer/seller narrowing predicate", () => {
  it("buyerCompanyId role: keeps ONLY rows where the caller is the derived buyer", () => {
    const rows = [
      // caller (A) initiated an "offer" → caller is the SELLER → excluded from buyer narrowing
      card({ relationship_id: "rel-1", deal_type: "offer", initiating_company_id: COMPANY_A }),
      // company B initiated an "offer" → B is the seller → caller (A) is the BUYER → kept
      card({ relationship_id: "rel-1", deal_type: "offer", initiating_company_id: COMPANY_B }),
      // caller (A) initiated an "order" (buyer-initiated) → caller IS the buyer → kept
      card({ relationship_id: "rel-1", deal_type: "order", initiating_company_id: COMPANY_A }),
    ];
    const kept = narrowByRole(rows, relById, COMPANY_A, buyerCompanyId);
    expect(kept).toHaveLength(2);
    expect(kept).toEqual([rows[1], rows[2]]);
  });

  it("a caller-is-seller row is correctly EXCLUDED from buyer narrowing (mirror of T-260707-04)", () => {
    const sellerRow = card({ relationship_id: "rel-1", deal_type: "offer", initiating_company_id: COMPANY_A });
    const kept = narrowByRole([sellerRow], relById, COMPANY_A, buyerCompanyId);
    expect(kept).toHaveLength(0);
  });

  it("sellerCompanyId role: keeps ONLY rows where the caller is the derived seller (getSellerCalendarDeals's own logic)", () => {
    const rows = [
      card({ relationship_id: "rel-1", deal_type: "offer", initiating_company_id: COMPANY_A }), // caller is seller — kept
      card({ relationship_id: "rel-1", deal_type: "offer", initiating_company_id: COMPANY_B }), // caller is buyer — excluded
    ];
    const kept = narrowByRole(rows, relById, COMPANY_A, sellerCompanyId);
    expect(kept).toEqual([rows[0]]);
  });

  it("drops a row whose relationship_id has no matching relationship (defensive)", () => {
    const orphan = card({ relationship_id: "rel-missing" });
    const kept = narrowByRole([orphan], relById, COMPANY_A, buyerCompanyId);
    expect(kept).toHaveLength(0);
  });
});
