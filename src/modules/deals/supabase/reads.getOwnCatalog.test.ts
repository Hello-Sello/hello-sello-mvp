/**
 * RED-first unit contract for `getOwnCatalog` (0022, T06, PLAN-T06.md §6,
 * HEL-60). `getOwnCatalog` (`reads.ts:535`) is the create-form product picker
 * source, meant to be "the viewer's OWN catalogue" — but today it selects from
 * `product` with NO `company_id` filter and relies on RLS alone. Because
 * `product_public_select` is unscoped (any authenticated, verified caller may
 * read any company's `profile_visible` rows), the picker currently returns
 * EVERY company's visible products, not just the caller's own. T06 widens
 * `product_public_select` further (the connection override), which makes this
 * pre-existing leak strictly worse — PLAN-T06 §6 fixes it with an explicit
 * `.eq("company_id", companyId)`, resolved from the caller's own
 * `person.company_id` the same way the five sibling reads in this file resolve
 * it (never from an argument — that would make it forgeable), plus the
 * null-company guard those siblings all use (`if (!viewerCompanyId) return
 * [];` — `.eq("company_id", null)` is NOT "no rows").
 *
 * ⚠️ RED-FIRST: today's `getOwnCatalog` never calls `supabase.auth.getUser()`
 * or reads `person.company_id` at all — it goes straight from
 * `createClient()` to `.from("product")`. So the company-scoping assertion
 * below (no `.eq("company_id", …)` call exists yet) and the null-company
 * guard assertion (no guard exists yet, so an unscoped query WOULD fire) both
 * fail against today's code. Do NOT touch reads.ts to make this pass — the
 * builder does that.
 *
 * Mocking style: this module has no existing test file, so there is no direct
 * precedent for mocking `@/shared/db/client` (only `@/shared/db/server`, used
 * by the server-action layer — see manage.ladder.test.ts). The nearest
 * applicable precedent is manage.ladder.test.ts's "permissive chainable
 * Supabase stub" — adapted here to RECORD `.eq()` calls per table (not just
 * resolve a final value), because the whole point of this suite is which
 * column/value pair reached `.eq()`, not the row shape it returns. Sibling
 * module functions (`readCurrentPrices`) are mocked as a module boundary, the
 * same discipline `saveLadder`'s test uses for `./pricelist` — the assertions
 * here are about WHICH seam gets called with WHAT, never about SQL.
 *
 * `vi.mock` factories are hoisted above this file's own top-level `const`s, so
 * (per manage.ladder.test.ts's own pattern, matched exactly rather than
 * invented fresh) the factory creates its OWN `vi.fn()` inline — nothing from
 * outer scope is captured — and the mock is then reached the normal way, via
 * a plain `import` + `vi.mocked(...)` to configure/read it per test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/db/client", () => ({ createClient: vi.fn() }));
vi.mock("@/modules/catalog/index.client", () => ({ readCurrentPrices: vi.fn() }));

import { getOwnCatalog } from "./reads";
import { createClient } from "@/shared/db/client";
import { readCurrentPrices } from "@/modules/catalog/index.client";

const VIEWER_ID = "person-viewer-1";

/**
 * A recording Supabase stub, scoped to exactly what getOwnCatalog touches:
 * `auth.getUser()`, `person` (to resolve the viewer's own company), and
 * `product` (the catalogue read under test). Every chain method returns
 * `this` and records its call; the terminal `.then()`/`.single()` resolves
 * the table's configured result. `eqCalls` is keyed by table so the test can
 * assert exactly which `.eq(column, value)` pairs reached which query.
 */
function makeDb(opts: {
  userId?: string | null;
  companyId?: string | null | undefined; // undefined = no person row at all
  products?: Array<Record<string, unknown>>;
}) {
  const eqCalls: Record<string, [string, unknown][]> = { person: [], product: [] };
  const fromCalls: string[] = [];

  function chainFor(table: string, resolve: () => { data: unknown; error: null }) {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        (eqCalls[table] ??= []).push([col, val]);
        return chain;
      }),
      single: vi.fn(() => Promise.resolve(resolve())),
      then: (onResolve: (v: unknown) => void) => onResolve(resolve()),
    };
    return chain;
  }

  const db = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: opts.userId === undefined ? { id: VIEWER_ID } : opts.userId ? { id: opts.userId } : null },
        }),
      ),
    },
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "person") {
        return chainFor("person", () => ({
          data: opts.companyId === undefined ? null : { company_id: opts.companyId },
          error: null,
        }));
      }
      if (table === "product") {
        return chainFor("product", () => ({ data: opts.products ?? [], error: null }));
      }
      return chainFor(table, () => ({ data: [], error: null }));
    }),
    eqCalls,
    fromCalls,
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCurrentPrices).mockResolvedValue(new Map());
});

describe("getOwnCatalog — company scoping (T06, PLAN-T06.md §6)", () => {
  it("scopes the product query to the CALLER's own company_id — company A's read carries company A's id, not company B's", async () => {
    const dbA = makeDb({ companyId: "company-A", products: [] });
    vi.mocked(createClient).mockReturnValue(dbA as never);
    await getOwnCatalog();

    expect(dbA.eqCalls.product).toContainEqual(["company_id", "company-A"]);
    expect(dbA.eqCalls.product).not.toContainEqual(["company_id", "company-B"]);

    const dbB = makeDb({ companyId: "company-B", products: [] });
    vi.mocked(createClient).mockReturnValue(dbB as never);
    await getOwnCatalog();

    expect(dbB.eqCalls.product).toContainEqual(["company_id", "company-B"]);
    expect(dbB.eqCalls.product).not.toContainEqual(["company_id", "company-A"]);
  });

  it("resolves company_id from the caller's OWN person row, never from an argument — getOwnCatalog takes no parameters to forge", async () => {
    // getOwnCatalog() is called with no arguments anywhere in this suite; the
    // company id it scopes by can only have come from the person lookup this
    // asserts happened. If a future edit added a forgeable parameter, this
    // still passes only because the resolution path stays the session lookup.
    const db = makeDb({ companyId: "company-A", products: [] });
    vi.mocked(createClient).mockReturnValue(db as never);
    await getOwnCatalog();

    expect(db.fromCalls).toContain("person");
    expect(db.eqCalls.person).toContainEqual(["id", VIEWER_ID]);
  });

  it("a companyless caller (person.company_id is null) returns [] and NEVER issues the product query at all — .eq('company_id', null) is not 'no rows'", async () => {
    const db = makeDb({ companyId: null });
    vi.mocked(createClient).mockReturnValue(db as never);

    const result = await getOwnCatalog();

    expect(result).toEqual([]);
    // The strong assertion: no unscoped (or null-scoped) query ever reaches
    // `product` at all — not merely that it came back empty.
    expect(db.fromCalls).not.toContain("product");
  });

  it("happy path: maps the caller's own priced catalogue straight through, merging readCurrentPrices by product id", async () => {
    const db = makeDb({
      companyId: "company-A",
      products: [
        {
          id: "prod-1",
          name: "PROD-NAME",
          cultivar: "PROD-CULTIVAR",
          unit_code: "PROD-UNIT",
          pack_size_grams: "33",
          thc_percent: 11,
          cbd_percent: 22,
          local_code_pzn: "PROD-PZN",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(db as never);
    vi.mocked(readCurrentPrices).mockResolvedValue(
      new Map([
        [
          "prod-1",
          {
            productId: "prod-1",
            itemId: "item-1",
            pricelistId: "pl-1",
            pricePerGram: 6.5,
            currency: "EUR",
            updatedAt: "",
            tiers: [{ minGrams: 500, pricePerGram: 5 }],
          },
        ],
      ]),
    );

    const result = await getOwnCatalog();

    expect(result).toEqual([
      {
        id: "prod-1",
        name: "PROD-NAME",
        cultivar: "PROD-CULTIVAR",
        unit: "PROD-UNIT",
        packSizeGrams: 33,
        unitPrice: 6.5,
        currency: "EUR",
        thcPercent: 11,
        cbdPercent: 22,
        pzn: "PROD-PZN",
        tiers: [{ minGrams: 500, pricePerGram: 5 }],
      },
    ]);
    // readCurrentPrices must be wired to the SAME db instance + the fetched
    // product ids — this is the seam assertion, not a claim about SQL.
    expect(readCurrentPrices).toHaveBeenCalledWith(db, ["prod-1"]);
  });

  it("a product with no current price row degrades to unitPrice=null, currency='EUR', tiers=[] — never a throw", async () => {
    const db = makeDb({
      companyId: "company-A",
      products: [
        {
          id: "prod-no-price",
          name: "N",
          cultivar: null,
          unit_code: "g",
          pack_size_grams: null,
          thc_percent: null,
          cbd_percent: null,
          local_code_pzn: null,
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(db as never);
    vi.mocked(readCurrentPrices).mockResolvedValue(new Map());

    const result = await getOwnCatalog();

    expect(result[0].unitPrice).toBeNull();
    expect(result[0].currency).toBe("EUR");
    expect(result[0].tiers).toEqual([]);
  });
});
