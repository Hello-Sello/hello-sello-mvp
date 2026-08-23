/**
 * T07 (HEL-61, PLAN-T07.md §6) — the client-arm test this ticket's last
 * criterion owes: "When the server refuses an admission, addToBasket shall
 * surface a user-facing refusal rather than an unhandled rejection."
 *
 * PLAN-T07 §6 (🔴 B3, round 2) measured that a component/render assertion
 * CANNOT be written against this runner: `vitest.config.ts` is
 * `environment: "node"`, `package.json` has no jsdom/happy-dom/testing-library,
 * and every existing card/drawer suite renders via `renderToStaticMarkup`
 * only (static HTML strings — no DOM, no click, no re-render to observe).
 * There is no `ShopView`/`BuyerShopView` test in the tree at all. That
 * assertion is NOT attempted here — it needs an e2e or jsdom-dependency
 * decision, named as a decision, not smuggled in as a unit test (L-018's
 * class: plan the test surface against the runner that exists).
 *
 * What IS writable and IS this runner's job, per PLAN-T07 §6: the
 * `42501 → typed error` MAPPING inside `addToBasket` itself — precedent
 * `src/modules/basket/actions.test.ts:23` (a mocked Supabase client, no DOM).
 * ADR-0005:659-660 — "addToBasket keeps its shape and gains one thing:
 * translating Postgres 42501 into the user-facing refusal, so AC 10's
 * 'no line appears' is legible rather than a raw database error."
 *
 * ⚠️ RED-FIRST (state of the tree when this file was written, before the
 * mapping shipped): `addToBasket` did
 * `if (error) throw error;` — it rethrows whatever Supabase returns
 * VERBATIM, raw Postgres message included. It never swallows (so the
 * "still rejects" test below already passes today — a regression guard, not
 * a red assertion) and it never distinguishes 42501 from any other failure
 * (so the "non-42501 passes through unchanged" test also already passes
 * today, for the same reason: everything passes through unchanged). Only
 * the MAPPING test is red today.
 *
 * Mocking style: `@/shared/db/client`'s `createClient()` is SYNCHRONOUS
 * (unlike `@/shared/db/server`, which `actions.test.ts` mocks as async) —
 * confirmed by reading `writes.ts` (`const supabase = createClient();`,
 * no `await`) and `client.ts` itself. The stub therefore returns a plain
 * object, not a resolved Promise, matching
 * `reads.getOwnCatalog.test.ts`'s "permissive chainable Supabase stub"
 * idiom (the only existing precedent for mocking this module).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/db/client", () => ({ createClient: vi.fn() }));

import { addToBasket, BasketAdmissionError } from "./writes";
import { createClient } from "@/shared/db/client";

// Bob — seeded, connected buyer (supabase/seed/seed.sql). The identity here
// is incidental to this suite (auth.getUser() is stubbed directly); reused
// for consistency with the SQL suite's persona.
const OWNER_ID = "22222222-2222-2222-2222-222222222222";

/** A minimal Supabase stub scoped to exactly what addToBasket touches:
 * `auth.getUser()` (via the module's own `ownerId()` helper) and
 * `.from("product_basket_line").upsert(...)`. `upsertError` is configurable
 * per test so the SAME shape addToBasket receives from PostgREST — a plain
 * `{ code, message }` object on the `.error` field — can be varied.
 */
function makeDb(upsertError: { code?: string; message: string } | null) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null }),
    },
    from: vi.fn().mockReturnValue({ upsert }),
    upsert,
  };
}

const ADMISSION_REFUSAL = {
  code: "42501",
  message: 'new row violates row-level security policy for table "product_basket_line"',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addToBasket — 42501 admission-refusal mapping (T07, PLAN-T07.md §6, ADR-0005:659-660)", () => {
  it("maps a 42501 admission refusal to a user-facing error — NOT the raw Postgres message", async () => {
    const db = makeDb(ADMISSION_REFUSAL);
    vi.mocked(createClient).mockReturnValue(db as never);

    const caught: unknown = await addToBasket("hidden-product-id", 1, null).catch((e: unknown) => e);

    // Assert the TYPE, not merely "not the raw message". A `.not.toBe(...)`
    // alone stays green if the mapping degrades to any other throw at all —
    // `throw new Error("boom")` would satisfy it. The contract is that the
    // caller receives a BasketAdmissionError.
    expect(caught).toBeInstanceOf(BasketAdmissionError);
    expect((caught as Error).message).not.toBe(ADMISSION_REFUSAL.message);
  });

  it("still rejects — never resolves silently — when the server refuses the admission (regression guard against a WR-06-style swallow)", async () => {
    const db = makeDb(ADMISSION_REFUSAL);
    vi.mocked(createClient).mockReturnValue(db as never);

    await expect(addToBasket("hidden-product-id", 1, null)).rejects.toBeTruthy();
  });

  it("does NOT rewrite a non-42501 failure — a network/other error passes through with its original message unchanged", async () => {
    const OTHER_ERROR = { code: "PGRST000", message: "fetch failed" };
    const db = makeDb(OTHER_ERROR);
    vi.mocked(createClient).mockReturnValue(db as never);

    const caught: unknown = await addToBasket("some-product-id", 1, null).catch((e: unknown) => e);

    expect((caught as Error).message).toBe(OTHER_ERROR.message);
  });

  it("a successful admission resolves with no error — control case, proves the mock and the happy path both still work", async () => {
    const db = makeDb(null);
    vi.mocked(createClient).mockReturnValue(db as never);

    await expect(addToBasket("admissible-product-id", 1, 1000)).resolves.toBeUndefined();
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_person_id: OWNER_ID, product_id: "admissible-product-id", pack_count: 1 }),
      { onConflict: "owner_person_id,product_id" },
    );
  });
});
