/**
 * HEL-84 §12 addendum — the four fail-soft announcement call sites.
 *
 * `announceDealEvent` (the client-side helper that used a direct
 * `chat_message` insert) and `resolveActorName` are deleted by §12.3; every
 * caller instead calls the new `announce_deal_event` SECURITY DEFINER RPC
 * (§12.2) directly, wrapped in the SAME fail-soft contract the old shared
 * helper used to own: a failed announcement logs and returns — it NEVER
 * blocks the parent decline/sign/propose/negotiate action, which has already
 * committed by the time the announcement runs (`actions.ts`'s own docstring,
 * ":651-655").
 *
 * Mocking pattern per `src/modules/basket/actions.test.ts:28` /
 * `src/modules/catalog/manage.ladder.test.ts:23` (both established seams in
 * this repo): `@/shared/db/server` and `@/shared/audit` are mocked wholesale
 * (this file's own two imports, per §12.5); `@/shared/auth` is mocked too,
 * since `proposeDealChange` reads `getCurrentCompanyId()`. `makeSupabase`
 * below is a Proxy-based chainable double (same shape as manage.ladder.
 * test.ts's own `makeDb`): any `.from(table)...` chain, awaited at ANY
 * depth, resolves the canned `{ data, error }` configured for that table —
 * the assertions are about WHICH seam gets called with WHAT, never about SQL.
 *
 * RED STATE: today `announceDealEvent` still does its own
 * `.from("chat_thread").select(...)` / `.from("chat_message").insert(...)`
 * round-trip — it never calls `supabase.rpc("announce_deal_event", ...)` at
 * all. Every assertion below that expects that RPC call therefore fails
 * against the current code: not because the assertion is wrong, but because
 * the call site hasn't been rewired yet (§12.3 hasn't landed). That gap IS
 * the reproduction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/db/server", () => ({ createClient: vi.fn() }));
vi.mock("@/shared/auth", () => ({ getCurrentCompanyId: vi.fn() }));
vi.mock("@/shared/audit", () => ({ writeAudit: vi.fn() }));

import {
  declineDeal,
  signDeal,
  requestNegotiation,
  proposeDealChange,
} from "./actions";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { writeAudit } from "@/shared/audit";

/**
 * A permissive chainable Supabase stub (manage.ladder.test.ts's own `makeDb`
 * pattern): `.from(table)` returns a Proxy where every method call returns
 * the chain itself, and awaiting ANY point of it resolves the canned
 * `{ data, error }` configured for that table (falling back to
 * `{ data: null, error: null }` for an unlisted table — enough for a lookup
 * this test doesn't care about, like the old `resolveActorName`'s `person`
 * read, to resolve without crashing).
 *
 * `rpc(name, args)` is recorded by a real `vi.fn` so call-site assertions can
 * inspect BOTH the RPC name and its exact argument shape — the two things
 * §12.3 pins per call site.
 */
function makeSupabase(opts: {
  userId?: string;
  tables?: Record<string, { data: unknown; error: unknown }>;
  rpc?: Record<string, { data: unknown; error: unknown }>;
}) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(opts.rpc?.[name] ?? { data: null, error: null }),
  );
  const from = vi.fn((table: string) => {
    const result = opts.tables?.[table] ?? { data: null, error: null };
    const chain: unknown = new Proxy(
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
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: opts.userId ?? "person-1" } } }),
    },
    from,
    rpc,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("announce_deal_event fail-soft wrapping (HEL-84 §12.3)", () => {
  it("declineDeal: a failed announce_deal_event call logs and does NOT block the decline", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeSupabase({
      tables: {
        deal_card: { data: { status: "negotiation", relationship_id: "rel-1" }, error: null },
        deal_pending_change: { data: null, error: null },
      },
      rpc: {
        decline_deal: { data: null, error: null },
        announce_deal_event: { data: null, error: { message: "boom" } },
      },
    });
    vi.mocked(createClient).mockResolvedValue(db as never);

    await expect(declineDeal({ dealCardId: "card-1" })).resolves.toBeUndefined();

    expect(db.rpc).toHaveBeenCalledWith(
      "announce_deal_event",
      expect.objectContaining({ p_deal_card_id: "card-1", p_type: "deal_cancelled" }),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/announc/i), expect.anything());
    // the decline itself still committed and was still audited — the failed
    // announcement never blocked the parent action.
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deal.declined", contentId: "card-1" }),
    );

    errSpy.mockRestore();
  });

  it("signDeal: a failed announce_deal_event call logs and does NOT block the sign", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeSupabase({
      tables: {
        deal_card: { data: { relationship_id: "rel-1" }, error: null },
      },
      rpc: {
        sign_deal: { data: null, error: null },
        announce_deal_event: { data: null, error: { message: "boom" } },
      },
    });
    vi.mocked(createClient).mockResolvedValue(db as never);

    await expect(signDeal({ dealCardId: "card-1" })).resolves.toEqual({ cardStatus: "confirmed" });

    expect(db.rpc).toHaveBeenCalledWith(
      "announce_deal_event",
      expect.objectContaining({ p_deal_card_id: "card-1", p_type: "deal_signed" }),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/announc/i), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deal.confirmed", contentId: "card-1" }),
    );

    errSpy.mockRestore();
  });

  it("requestNegotiation: a failed announce_deal_event call logs and does NOT throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeSupabase({
      tables: {
        deal_card: { data: { relationship_id: "rel-1" }, error: null },
      },
      rpc: {
        announce_deal_event: { data: null, error: { message: "boom" } },
      },
    });
    vi.mocked(createClient).mockResolvedValue(db as never);

    await expect(requestNegotiation({ dealCardId: "card-1" })).resolves.toBeUndefined();

    expect(db.rpc).toHaveBeenCalledWith(
      "announce_deal_event",
      expect.objectContaining({ p_deal_card_id: "card-1", p_type: "deal_negotiation_requested" }),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/announc/i), expect.anything());

    errSpy.mockRestore();
  });

  it("proposeDealChange: a failed announce_deal_event call logs and does NOT block the propose", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getCurrentCompanyId).mockResolvedValue("company-1");
    const db = makeSupabase({
      tables: {
        deal_card: {
          data: {
            initiating_company_id: "company-1",
            deal_type: "offer",
            relationship_id: "rel-1",
            status: "negotiation",
          },
          error: null,
        },
        relationship: { data: { company_a_id: "company-1", company_b_id: "company-2" }, error: null },
      },
      rpc: {
        propose_deal_change: { data: "pending-1", error: null },
        announce_deal_event: { data: null, error: { message: "boom" } },
      },
    });
    vi.mocked(createClient).mockResolvedValue(db as never);

    await expect(
      proposeDealChange({ dealCardId: "card-1", lines: [], reason: "price update" }),
    ).resolves.toEqual({ pendingId: "pending-1" });

    // §12.3: the body argument is DROPPED for this call site — the RPC
    // composes it server-side now (the proposer's name is no longer resolved
    // client-side either).
    expect(db.rpc).toHaveBeenCalledWith(
      "announce_deal_event",
      expect.objectContaining({ p_deal_card_id: "card-1", p_type: "deal_change_proposed" }),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/announc/i), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deal.change_proposed", contentId: "card-1" }),
    );

    errSpy.mockRestore();
  });
});
