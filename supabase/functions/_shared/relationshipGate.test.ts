/**
 * HEL-86 — the gate classifier must tell a deliberate refusal from a broken RPC.
 *
 * The whole ticket is that these two used to be indistinguishable, so the cases
 * that matter most here are the NEGATIVE ones: an error that is NOT our raise
 * must never be read as a refusal, because that is precisely how a
 * not-yet-deployed migration disguised itself as a quiet week.
 *
 * Pure module, no Deno and no supabase-js import, so the ordinary vitest runner
 * loads it (vitest.config.ts's include gained a `supabase/functions` glob for
 * exactly this file).
 */
import { describe, it, expect, vi } from "vitest";
import {
  classifyGateError,
  checkRelationshipWritable,
  logGateOutcome,
} from "./relationshipGate";

const raise = (message: string) => ({ code: "P0001", message });

describe("classifyGateError", () => {
  it("reads no error as writable", () => {
    expect(classifyGateError(null)).toEqual({ kind: "writable" });
    expect(classifyGateError(undefined)).toEqual({ kind: "writable" });
  });

  it("reads a suspended relationship as a deliberate refusal, and recovers the status", () => {
    const out = classifyGateError(
      raise("assert_relationship_writable: relationship is suspended — no new writes"),
    );
    expect(out.kind).toBe("refused");
    expect(out).toMatchObject({ status: "suspended" });
  });

  it("recovers 'ended' as well, so the log says which state refused", () => {
    expect(
      classifyGateError(raise("assert_relationship_writable: relationship is ended — no new writes")),
    ).toMatchObject({ kind: "refused", status: "ended" });
  });

  it("separates 'not found' from an ordinary suspension", () => {
    // service_role skips the RPC's party filter, so this really means the row
    // is absent or soft-deleted — a data problem, not a working gate.
    expect(
      classifyGateError(raise("assert_relationship_writable: relationship not found")),
    ).toMatchObject({ kind: "missing" });
  });

  describe("the cases HEL-86 exists for — these must NOT read as a refusal", () => {
    it("treats an undeployed function as unavailable, not as a refusal", () => {
      const out = classifyGateError({
        code: "PGRST202",
        message: "Could not find the function public.assert_relationship_writable",
      });
      expect(out.kind).toBe("unavailable");
    });

    it("treats a missing-function SQLSTATE as unavailable", () => {
      expect(
        classifyGateError({ code: "42883", message: "function does not exist" }),
      ).toMatchObject({ kind: "unavailable" });
    });

    it("treats a transport error with no code as unavailable", () => {
      expect(
        classifyGateError({ message: "TypeError: Failed to fetch" }),
      ).toMatchObject({ kind: "unavailable" });
    });

    it("does not accept P0001 alone — a SQLSTATE is not a cause (L-064)", () => {
      // Some OTHER function's raise, surfacing through a nested call. Sharing
      // an exception class with our gate must not be enough to be read as one.
      const out = classifyGateError(raise("send_deal: relationship is suspended — no new writes"));
      expect(out.kind).toBe("unavailable");
    });

    it("does not accept the message prefix alone, without P0001", () => {
      const out = classifyGateError({
        code: "08006",
        message: "connection failure while calling assert_relationship_writable: retry",
      });
      expect(out.kind).toBe("unavailable");
    });
  });

  it("still classifies a refusal whose status word is unexpected", () => {
    // A new status code added to the vocabulary must degrade to `refused` with
    // a null status, never silently to `unavailable`.
    expect(
      classifyGateError(raise("assert_relationship_writable: relationship is — no new writes")),
    ).toMatchObject({ kind: "refused", status: null });
  });
});

describe("checkRelationshipWritable", () => {
  it("passes the relationship id through and classifies the result", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const out = await checkRelationshipWritable({ rpc }, "rel-1");
    expect(rpc).toHaveBeenCalledWith("assert_relationship_writable", { p_relationship_id: "rel-1" });
    expect(out).toEqual({ kind: "writable" });
  });

  it("forwards a null relationship id — the RPC's own NULL passthrough owns that rule", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await checkRelationshipWritable({ rpc }, null);
    expect(rpc).toHaveBeenCalledWith("assert_relationship_writable", { p_relationship_id: null });
  });

  it("surfaces an undeployed RPC as unavailable rather than a skip", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect(await checkRelationshipWritable({ rpc }, "rel-1")).toMatchObject({ kind: "unavailable" });
  });
});

describe("logGateOutcome", () => {
  it("says nothing on the happy path", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logGateOutcome("sella-detect", { kind: "writable" }, {});
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    log.mockRestore();
    err.mockRestore();
  });

  it("logs a suspension at log level — a suspended relationship must not page anyone", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logGateOutcome("sella-detect", { kind: "refused", status: "suspended", message: "m" }, { thread_id: "t1" });
    expect(log).toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    log.mockRestore();
    err.mockRestore();
  });

  it("logs an unavailable gate at ERROR level — the one outcome that means something is broken", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logGateOutcome("sella-summarize", { kind: "unavailable", code: "PGRST202", message: "m" }, { deal_card_id: "c1" });
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0]?.[1] ?? "")).toContain("PGRST202");
    err.mockRestore();
  });
});
