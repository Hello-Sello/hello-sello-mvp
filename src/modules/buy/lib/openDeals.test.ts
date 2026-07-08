/**
 * Unit contract for `isOpenDeal()` (18-03 Task 1). vitest, no Supabase, no
 * React — mirrors `src/modules/allocate/status.test.ts`'s house style
 * (plain describe/it over a pure function).
 *
 * Table-driven over all 8 `DealCardStatus` codes so a future 9th code added
 * to `deal_card_status` without a matching entry here fails loudly (the test
 * body enumerates the codes it expects to exist, not just the ones under
 * test individually).
 */
import { describe, it, expect } from "vitest";
import type { DealCardStatus } from "@/modules/deals";
import { isOpenDeal } from "./openDeals";

describe("isOpenDeal — mirrors deal_card_status.is_terminal exactly", () => {
  const cases: Array<[DealCardStatus, boolean]> = [
    ["draft", true],
    ["confirmed", true],
    ["amended", true],
    ["ticket_created", true],
    ["ticket_closed", true],
    ["done", false],
    ["withdrawn", false],
    ["cancelled", false],
  ];

  it.each(cases)("isOpenDeal(%s) → %s", (status, expected) => {
    expect(isOpenDeal(status)).toBe(expected);
  });

  it("covers all 8 DealCardStatus codes — no code left unasserted", () => {
    expect(cases).toHaveLength(8);
  });
});
