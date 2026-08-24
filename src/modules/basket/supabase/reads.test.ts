/**
 * T15 — which basket-read failures are legitimately EMPTY, and which are errors.
 *
 * The defect this suite pins: `BasketProvider` used to `.catch(() => setView(EMPTY))`,
 * so EVERY failure of this read presented as an empty basket — identical to being
 * signed out, with nothing logged and nothing shown. The fix moves the judgment
 * here, into the only place that knows WHICH call failed: benign causes return an
 * empty basket, everything else throws, and the provider treats any throw as an
 * error state.
 *
 * Mocking style follows `writes.test.ts`: `@/shared/db/client`'s `createClient()`
 * is SYNCHRONOUS, so the stub returns a plain object, not a resolved promise.
 *
 * NOT tested here (L-018 — plan the test surface against the runner that exists):
 * the provider's state transition. `vitest.config.ts` is `environment: "node"`
 * with no jsdom, so there is no DOM and no second render to observe. The drawer's
 * rendered error is covered in `components/BasketDrawer.test.tsx` instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/db/client", () => ({ createClient: vi.fn() }));

import { getMyBasket } from "./reads";
import { createClient } from "@/shared/db/client";

const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const EMPTY = { groups: [], totalLineCount: 0 };

type Result = { data: unknown; error: unknown };

/** Stub scoped to exactly what getMyBasket touches, each stage overridable so a
 * single failure can be injected while every other stage stays healthy. */
function makeDb(stages: { auth?: Result; person?: Result; rpc?: Result } = {}) {
  const auth = stages.auth ?? { data: { user: { id: OWNER_ID } }, error: null };
  const person = stages.person ?? { data: { company_id: "co-1" }, error: null };
  const rpc = stages.rpc ?? { data: [], error: null };

  return {
    auth: { getUser: vi.fn().mockResolvedValue(auth) },
    from: vi.fn((table: string) =>
      table === "person"
        ? { select: () => ({ eq: () => ({ single: () => Promise.resolve(person) }) }) }
        : { select: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) },
    ),
    rpc: vi.fn().mockResolvedValue(rpc),
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("getMyBasket — benign failures are an empty basket, the rest are errors", () => {
  it("an expired or invalid session resolves to an empty basket, and does NOT throw", async () => {
    // Supabase returns the error alongside a null user when the JWT is bad.
    vi.mocked(createClient).mockReturnValue(
      makeDb({ auth: { data: { user: null }, error: { message: "invalid JWT" } } }) as never,
    );

    await expect(getMyBasket()).resolves.toEqual(EMPTY);
  });

  it("an account with no person row yet (PGRST116) resolves to an empty basket, and does NOT throw", async () => {
    // `.single()` on zero rows — a signed-up account still mid-onboarding.
    vi.mocked(createClient).mockReturnValue(
      makeDb({
        person: { data: null, error: { code: "PGRST116", message: "no rows returned" } },
      }) as never,
    );

    await expect(getMyBasket()).resolves.toEqual(EMPTY);
  });

  it("an RPC failure REJECTS — it is not an empty basket", async () => {
    // The half of the contract the fix must not break while widening the other
    // half: a permission or schema-cache failure has to reach the provider.
    vi.mocked(createClient).mockReturnValue(
      makeDb({
        rpc: { data: null, error: { code: "42501", message: "permission denied" } },
      }) as never,
    );

    await expect(getMyBasket()).rejects.toMatchObject({ code: "42501" });
  });
});
