/**
 * RED-first unit contract for the single price-read owner (0021, T03).
 * Covers `mapTiers` (the view's jsonb → camelCase PriceTier[], the ONE
 * snake→camel boundary per pricing.ts's contract), `ladderErrorMessage`
 * (trigger text → human message), and the injected-client wrappers
 * `readCurrentPrices` / `lookupStandardPriceRow` / `savePriceLadder` against a
 * minimal supabase-shaped fake. vitest, no Supabase, no React.
 *
 * RED until pricelist.ts exists (the import fails to resolve). Do NOT create
 * the production module to satisfy an unrelated gate — this test drives its
 * shape.
 */
import { describe, it, expect } from "vitest";
import {
  ladderErrorMessage,
  lookupStandardPriceRow,
  mapTiers,
  readCurrentPrices,
  savePriceLadder,
} from "./pricelist";
import type { PriceDb, ProductPrice } from "./pricelist";
import type { PriceTier } from "./pricing";

type FakeResult = { data: unknown; error: unknown };

/**
 * Minimal fake of the PostgREST query builder: every chain link records its
 * arguments and returns the same builder, and the builder itself is thenable
 * (mirroring supabase-js), so `await db.from(t).select(c)` — with or without
 * further links — resolves the canned result.
 */
function makeFakeDb(result: FakeResult) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    in: [] as [string, unknown][],
    other: [] as { method: string; args: unknown[] }[],
  };
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.other.push({ method, args });
      return builder;
    };
  const builder: Record<string, unknown> = {
    from(table: string) {
      calls.from.push(table);
      return builder;
    },
    select(cols: string) {
      calls.select.push(cols);
      return builder;
    },
    in(col: string, ids: unknown) {
      calls.in.push([col, ids]);
      return builder;
    },
    // Tolerated extra links so the fake never dictates the exact chain shape.
    eq: record("eq"),
    is: record("is"),
    order: record("order"),
    limit: record("limit"),
    then(
      resolve?: (value: FakeResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return { db: builder as unknown as PriceDb, calls };
}

function makeFakeRpcDb(result: { error: { message: string } | null }) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const db = {
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: result.error });
    },
  } as unknown as PriceDb;
  return { db, rpcCalls };
}

describe("mapTiers — the view's jsonb narrowed to PriceTier[]", () => {
  it("maps snake_case rungs to camelCase, order preserved", () => {
    const json: unknown = [
      { min_grams: 500, price_per_gram: 8 },
      { min_grams: 1000, price_per_gram: 7 },
    ];
    const expected: PriceTier[] = [
      { minGrams: 500, pricePerGram: 8 },
      { minGrams: 1000, pricePerGram: 7 },
    ];
    expect(mapTiers(json)).toEqual(expected);
  });

  it("returns [] for null", () => {
    expect(mapTiers(null)).toEqual([]);
  });

  it("returns [] for a non-array (object, string, number)", () => {
    expect(mapTiers({ min_grams: 500, price_per_gram: 8 })).toEqual([]);
    expect(mapTiers("tiers")).toEqual([]);
    expect(mapTiers(42)).toEqual([]);
  });

  it("skips malformed entries, keeps well-formed ones", () => {
    const json: unknown = [
      { min_grams: 500, price_per_gram: 8 },
      { min_grams: 750 }, // missing price_per_gram
      { price_per_gram: 6 }, // missing min_grams
      { min_grams: "800", price_per_gram: "6" }, // string values
      null, // null entry
      { min_grams: 1000, price_per_gram: 7 },
    ];
    expect(mapTiers(json)).toEqual([
      { minGrams: 500, pricePerGram: 8 },
      { minGrams: 1000, pricePerGram: 7 },
    ]);
  });
});

describe("ladderErrorMessage — trigger text to human message", () => {
  it("strips the TIER_LADDER_SHAPE prefix, keeping the human part", () => {
    expect(
      ladderErrorMessage(
        "TIER_LADDER_SHAPE: every rung must undercut the base price",
      ),
    ).toBe("every rung must undercut the base price");
  });

  it("wraps raw Postgres text in a generic prefix, retaining the raw tail", () => {
    const raw = 'null value in column "min_grams" violates not-null constraint';
    const message = ladderErrorMessage(raw);
    expect(message).not.toBe(raw);
    expect(message).toContain("Price could not be saved");
    expect(message).toContain(raw);
  });
});

describe("readCurrentPrices — view read keyed by productId", () => {
  const rows = [
    {
      id: "item-1",
      pricelist_id: "pl-1",
      product_id: "prod-1",
      price_per_gram: 10,
      currency: "EUR",
      updated_at: "2026-08-01T00:00:00Z",
      tiers: [
        { min_grams: 500, price_per_gram: 8 },
        { min_grams: 1000, price_per_gram: 7 },
      ],
    },
    {
      // View nullability: a row without a product id must be skipped.
      id: "item-2",
      pricelist_id: "pl-1",
      product_id: null,
      price_per_gram: 9,
      currency: "EUR",
      updated_at: "2026-08-01T00:00:00Z",
      tiers: [],
    },
    {
      // Null currency/updated_at coalesce; null tiers → [].
      id: "item-3",
      pricelist_id: "pl-1",
      product_id: "prod-3",
      price_per_gram: 12,
      currency: null,
      updated_at: null,
      tiers: null,
    },
  ];

  it("queries current_pricelist_item with the view's columns and the given ids", async () => {
    const { db, calls } = makeFakeDb({ data: rows, error: null });
    await readCurrentPrices(db, ["prod-1", "prod-2", "prod-3"]);

    expect(calls.from).toEqual(["current_pricelist_item"]);
    expect(
      calls.select[0].split(",").map((c) => c.trim()).sort(),
    ).toEqual(
      [
        "id",
        "pricelist_id",
        "product_id",
        "price_per_gram",
        "currency",
        "updated_at",
        "tiers",
      ].sort(),
    );
    expect(calls.in).toEqual([["product_id", ["prod-1", "prod-2", "prod-3"]]]);
  });

  it("maps rows into ProductPrice, skipping null product_id and coalescing nulls", async () => {
    const { db } = makeFakeDb({ data: rows, error: null });
    const prices = await readCurrentPrices(db, ["prod-1", "prod-2", "prod-3"]);

    expect([...prices.keys()].sort()).toEqual(["prod-1", "prod-3"]);

    const full: ProductPrice = {
      productId: "prod-1",
      itemId: "item-1",
      pricelistId: "pl-1",
      pricePerGram: 10,
      currency: "EUR",
      updatedAt: "2026-08-01T00:00:00Z",
      tiers: [
        { minGrams: 500, pricePerGram: 8 },
        { minGrams: 1000, pricePerGram: 7 },
      ],
    };
    expect(prices.get("prod-1")).toEqual(full);

    expect(prices.get("prod-3")).toEqual({
      productId: "prod-3",
      itemId: "item-3",
      pricelistId: "pl-1",
      pricePerGram: 12,
      currency: "EUR", // coalesced
      updatedAt: "", // coalesced
      tiers: [],
    });
  });

  it("omits the .in filter when productIds is not given", async () => {
    const { db, calls } = makeFakeDb({ data: rows, error: null });
    const prices = await readCurrentPrices(db);

    expect(calls.in).toEqual([]);
    expect(calls.from).toEqual(["current_pricelist_item"]);
    expect([...prices.keys()].sort()).toEqual(["prod-1", "prod-3"]);
  });
});

describe("lookupStandardPriceRow — canonical write-target pick via the view", () => {
  it("returns the view row's item id for the product", async () => {
    const { db, calls } = makeFakeDb({
      data: [
        {
          id: "item-9",
          pricelist_id: "pl-1",
          product_id: "prod-9",
          price_per_gram: 5,
          currency: "EUR",
          updated_at: "2026-08-01T00:00:00Z",
          tiers: [],
        },
      ],
      error: null,
    });
    await expect(lookupStandardPriceRow(db, "prod-9")).resolves.toBe("item-9");
    expect(calls.from).toEqual(["current_pricelist_item"]);
  });

  it("returns null when the view has no row for the product", async () => {
    const { db } = makeFakeDb({ data: [], error: null });
    await expect(lookupStandardPriceRow(db, "prod-9")).resolves.toBeNull();
  });
});

describe("savePriceLadder — save_price_ladder RPC wrapper", () => {
  const tiers: PriceTier[] = [
    { minGrams: 500, pricePerGram: 8 },
    { minGrams: 1000, pricePerGram: 7 },
  ];

  it("calls save_price_ladder with snake_case args and returns ok on success", async () => {
    const { db, rpcCalls } = makeFakeRpcDb({ error: null });
    const result = await savePriceLadder(db, "item-1", 10, tiers);

    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("save_price_ladder");
    expect(rpcCalls[0].args).toEqual({
      p_pricelist_item_id: "item-1",
      p_base: 10,
      p_tiers: [
        { min_grams: 500, price_per_gram: 8 },
        { min_grams: 1000, price_per_gram: 7 },
      ],
    });
  });

  it("maps a trigger rejection through ladderErrorMessage", async () => {
    const { db } = makeFakeRpcDb({
      error: { message: "TIER_LADDER_SHAPE: rungs must descend" },
    });
    await expect(savePriceLadder(db, "item-1", 10, tiers)).resolves.toEqual({
      error: "rungs must descend",
    });
  });
});
