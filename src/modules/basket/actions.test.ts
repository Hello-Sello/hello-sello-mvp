/**
 * WR-06 (Wave 3c) — createBasketDraft must be retry-safe.
 *
 * Once the draft is BORN (createDeal), the products live on the draft card and
 * the draft is the source of truth. If clearing the old basket lines then fails,
 * throwing makes the user retry the whole flow and mint a DUPLICATE draft. So the
 * post-birth line delete is LOG-AND-CONTINUE: on a delete error, log and return
 * the born result rather than throwing.
 *
 * This test drives that rule: the product_basket_line delete is mocked to fail,
 * and createBasketDraft must still RESOLVE with the born card id, having called
 * createDeal exactly once (the failed cleanup triggers no second birth).
 */
import { describe, it, expect, vi } from "vitest";
import type { BasketGroup } from "./types";

// The two deals seams: createDeal births the private draft, sendDeal delivers
// it immediately after (2026-08-25: createBasketDraft now does both in one
// call). Both mocked to "succeed" so we can assert createDeal ran exactly
// once (no retry) regardless of the unrelated basket-cleanup failure below.
vi.mock("@/modules/deals", () => ({
  createDeal: vi.fn().mockResolvedValue({ dealCardId: "card-1" }),
  sendDeal: vi.fn().mockResolvedValue({ threadId: "thread-1" }),
}));

// A Supabase client whose product_basket_line delete FAILS — the exact failure
// WR-06 must swallow (createClient is async, so mockResolvedValue).
vi.mock("@/shared/db/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
      }),
    }),
  }),
}));

import { createBasketDraft } from "./actions";
import { createDeal } from "@/modules/deals";

// Minimal group: createBasketDraft reads only group.lines (mapped) and
// group.isOwnCompany. Empty lines exercises the born-then-delete-fails path.
const group = { isOwnCompany: false, lines: [] } as unknown as BasketGroup;

describe("createBasketDraft (WR-06 retry-safety)", () => {
  it("returns the born card even when clearing the basket lines fails (no throw, no duplicate birth)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      createBasketDraft(group, {
        relationshipId: "rel-1",
        counterpartyPersonId: null,
        note: null,
      }),
    ).resolves.toMatchObject({ dealCardId: "card-1" });

    // The draft was born exactly once — the failed cleanup did NOT retry the birth.
    expect(createDeal).toHaveBeenCalledTimes(1);

    errSpy.mockRestore();
  });
});
