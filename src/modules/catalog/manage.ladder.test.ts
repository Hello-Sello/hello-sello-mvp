/**
 * RED-first action contract for `saveLadder` (0021, T04 — manage.ts).
 *
 * The ONE server door for a product's base + tier ladder: auth via the session
 * company, numeric `validateTiers` re-check (defense in depth — the client
 * mirror can be bypassed), row resolution via `lookupStandardPriceRow` (creating
 * the standard row through the shared create-branch when absent, then
 * RE-looking-up — amendment 5), and the atomic write via `savePriceLadder`.
 * Clearing a ladder on an unpriced product is a `{ ok: true }` no-op
 * (amendment 4) — never fail a Save for clearing nothing.
 *
 * vi.mock pattern per basket/actions.test.ts: the module seams (`db/server`,
 * `auth`, `./pricelist`, `next/cache`) are mocked; the assertions are about
 * WHICH seam gets called with WHAT — never about SQL.
 *
 * RED state: `saveLadder` is not exported from ./manage yet — the named import
 * fails to resolve. Do NOT add the export just to satisfy a gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PriceTier } from "./pricing";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/db/server", () => ({ createClient: vi.fn() }));
vi.mock("@/shared/auth", () => ({ getCurrentCompanyId: vi.fn() }));
vi.mock("./pricelist", () => ({
  lookupStandardPriceRow: vi.fn(),
  savePriceLadder: vi.fn(),
  readCurrentPrices: vi.fn(),
  // Passthrough — message mapping is pricelist.ts's contract, not under test.
  ladderErrorMessage: vi.fn((raw: string) => raw),
}));

import { saveLadder } from "./manage";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { lookupStandardPriceRow, readCurrentPrices, savePriceLadder } from "./pricelist";
import type { ProductPrice } from "./pricelist";

/**
 * A permissive chainable Supabase stub: every method returns the chain, and
 * awaiting any point of it resolves a per-table result — the product ownership
 * probe answers with `company_id` (foreign tenants are makeDb's parameter),
 * everything else with `{ data: [{ id: "pl-1" }], error: null }`, enough for
 * the create-branch's pricelist pick + pricelist_item insert without modelling
 * the SQL (the seam assertions carry the contract).
 */
function makeDb(productCompanyId = "company-1") {
  const results: Record<string, unknown> = {
    product: { data: { company_id: productCompanyId }, error: null },
  };
  const fallback = { data: [{ id: "pl-1" }], error: null };
  return {
    from: vi.fn((table: string) => {
      const result = results[table] ?? fallback;
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) => resolve(result);
            }
            return () => chain;
          },
        },
      );
      return chain;
    }),
  };
}

const db = makeDb();

/** A ProductPrice map entry as readCurrentPrices resolves it (live-base seam). */
const priceRow = (productId: string, itemId: string, pricePerGram: number | null): ProductPrice => ({
  productId,
  itemId,
  pricelistId: "pl-1",
  pricePerGram,
  currency: "EUR",
  updatedAt: "",
  tiers: [],
});

const TIERS: PriceTier[] = [
  { minGrams: 500, pricePerGram: 5 },
  { minGrams: 1000, pricePerGram: 4.5 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(db as never);
  vi.mocked(getCurrentCompanyId).mockResolvedValue("company-1");
  vi.mocked(lookupStandardPriceRow).mockResolvedValue("item-1");
  vi.mocked(readCurrentPrices).mockResolvedValue(new Map());
  vi.mocked(savePriceLadder).mockResolvedValue({ ok: true });
});

describe("saveLadder (T04 server action)", () => {
  it("no company in session → { error }, and the ladder write never runs", async () => {
    vi.mocked(getCurrentCompanyId).mockResolvedValue(null);

    const res = await saveLadder("prod-1", 6, TIERS);
    expect(res).toHaveProperty("error");
    expect(savePriceLadder).not.toHaveBeenCalled();
  });

  it("clearing a ladder on an unpriced product is a { ok: true } no-op", async () => {
    vi.mocked(lookupStandardPriceRow).mockResolvedValue(null);

    const res = await saveLadder("prod-1", null, []);
    expect(res).toEqual({ ok: true });
    expect(savePriceLadder).not.toHaveBeenCalled();
  });

  it("tiers with no base and no price row → 'Set a base price first.'", async () => {
    vi.mocked(lookupStandardPriceRow).mockResolvedValue(null);

    const res = await saveLadder("prod-1", null, TIERS);
    expect(res).toEqual({ error: "Set a base price first." });
    expect(savePriceLadder).not.toHaveBeenCalled();
  });

  it("no price row + a base → creates the standard row, RE-looks-up, then saves the ladder", async () => {
    vi.mocked(lookupStandardPriceRow)
      .mockResolvedValueOnce(null) // first lookup: no live row
      .mockResolvedValueOnce("item-9"); // re-lookup after the create-branch

    const res = await saveLadder("prod-1", 6, TIERS);
    expect(res).toEqual({ ok: true });
    // The create-branch inserted the row (never .insert().select on it — the
    // re-lookup is the id source, amendment 5)...
    expect(db.from).toHaveBeenCalledWith("pricelist_item");
    expect(lookupStandardPriceRow).toHaveBeenCalledTimes(2);
    // ...and the ladder write targets the RE-looked-up id.
    expect(savePriceLadder).toHaveBeenCalledWith(db, "item-9", 6, TIERS);
  });

  it("happy path: passes (client, itemId, base, tiers) to savePriceLadder exactly", async () => {
    vi.mocked(lookupStandardPriceRow).mockResolvedValue("item-7");

    const res = await saveLadder("prod-1", 6, TIERS);
    expect(res).toEqual({ ok: true });
    expect(savePriceLadder).toHaveBeenCalledTimes(1);
    expect(savePriceLadder).toHaveBeenCalledWith(db, "item-7", 6, TIERS);
  });

  it("a blank base on a PRICED product resolves the row's live base — a clear still commits", async () => {
    // The seller cleared/never touched the price field (base null) but the
    // product HAS a price row: the row's own base is fetched and the ladder
    // write proceeds with it, so clearing every rung is never silently dropped.
    vi.mocked(lookupStandardPriceRow).mockResolvedValue("item-3");
    vi.mocked(readCurrentPrices).mockResolvedValue(
      new Map([["prod-1", priceRow("prod-1", "item-3", 6)]]),
    );

    const res = await saveLadder("prod-1", null, []);
    expect(res).toEqual({ ok: true });
    expect(savePriceLadder).toHaveBeenCalledWith(db, "item-3", 6, []);
  });

  it("a product owned by ANOTHER company is rejected before any price-row insert", async () => {
    // The create branch must verify the caller owns the product — RLS gates
    // only the pricelist side, so without this check a caller could attach a
    // price row (under their own pricelist) to a foreign tenant's product.
    const foreignDb = makeDb("company-2");
    vi.mocked(createClient).mockResolvedValue(foreignDb as never);
    vi.mocked(lookupStandardPriceRow).mockResolvedValue(null);

    const res = await saveLadder("prod-1", 6, TIERS);
    expect(res).toEqual({ error: "Product not found." });
    expect(foreignDb.from).not.toHaveBeenCalledWith("pricelist_item");
    expect(savePriceLadder).not.toHaveBeenCalled();
  });

  it("an out-of-order payload is rejected server-side WITHOUT calling the RPC", async () => {
    const outOfOrder: PriceTier[] = [
      { minGrams: 1000, pricePerGram: 4.5 },
      { minGrams: 500, pricePerGram: 5 },
    ];

    const res = await saveLadder("prod-1", 6, outOfOrder);
    expect(res).toHaveProperty("error");
    expect(savePriceLadder).not.toHaveBeenCalled();
  });
});
