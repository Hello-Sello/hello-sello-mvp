/**
 * One authoritative reading of `assert_relationship_writable`'s outcome (HEL-86).
 *
 * ── THE PROBLEM THIS EXISTS TO SOLVE ──
 * Both Sella edge functions called the gate RPC and treated ANY error the same
 * way: skip the run, return HTTP 200. Failing closed is correct for the gate
 * itself, but it made two very different events indistinguishable —
 *
 *   "this relationship is suspended, working exactly as intended"
 *   "the RPC is not deployed in this environment and nothing works"
 *
 * — with no signal anywhere separating them. HEL-84's own migration batch is a
 * live example of how that happens: the gate shipped to local before cloud, so
 * for a window the cloud functions would have skipped EVERY run, silently, at
 * HTTP 200, looking exactly like a very quiet week.
 *
 * ── THE INTERFACE ──
 * Callers get one call and a discriminated union. They never see the RPC name,
 * the SQLSTATE, or the message text — this module owns all three, so a change
 * to the raise wording is a one-file change rather than a hunt through every
 * edge function.
 *
 * `classifyGateError` is deliberately PURE and free of any Deno- or
 * supabase-js-specific import, so it can be unit-tested by the repo's ordinary
 * vitest runner. Everything that needs a live client lives in the thin wrapper
 * below it.
 */

/** The subset of a PostgREST error this module actually reasons about. */
export interface GateRpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export type GateOutcome =
  /** The relationship is active (or there is nothing to gate). Proceed. */
  | { kind: "writable" }
  /**
   * The gate deliberately refused: the relationship exists and is not active.
   * This is the designed path — suspended/ended. Not an error.
   */
  | { kind: "refused"; status: string | null; message: string }
  /**
   * The gate deliberately raised "not found". These functions run as
   * `service_role`, so the party filter inside the RPC does not apply to them
   * and this genuinely means the row is absent or soft-deleted — a data
   * problem worth seeing, NOT an ordinary suspension.
   */
  | { kind: "missing"; message: string }
  /**
   * The RPC itself failed: not deployed, wrong signature, transport error.
   * Infrastructure. This is the case that used to hide.
   */
  | { kind: "unavailable"; code: string | null; message: string };

/** plpgsql's bare `raise exception` surfaces as SQLSTATE P0001. */
const RAISE_EXCEPTION = "P0001";
const GATE_PREFIX = "assert_relationship_writable:";

/**
 * Classify an error returned by `supabase.rpc("assert_relationship_writable")`.
 * Pass `null`/`undefined` for the success case.
 *
 * Discrimination is on BOTH the SQLSTATE and the message prefix, not either
 * alone. P0001 by itself is not enough — any `raise exception` anywhere in a
 * nested call would share it (the L-064 trap: a SQLSTATE is not a cause). The
 * prefix by itself is not enough either, since a transport error could echo
 * arbitrary text.
 */
export function classifyGateError(error: GateRpcError | null | undefined): GateOutcome {
  if (!error) return { kind: "writable" };

  const message = error.message ?? "";
  const code = error.code ?? null;
  const isOurRaise = code === RAISE_EXCEPTION && message.includes(GATE_PREFIX);

  if (!isOurRaise) {
    return { kind: "unavailable", code, message: message || "unknown RPC failure" };
  }

  if (message.includes("relationship not found")) {
    return { kind: "missing", message };
  }

  // 'assert_relationship_writable: relationship is <status> — no new writes'.
  // The em dash is the function's own; matching on the words around it rather
  // than the punctuation keeps this robust to an encoding round-trip.
  const status = /relationship is (\w+)/.exec(message)?.[1] ?? null;
  return { kind: "refused", status, message };
}

/**
 * Call the gate and classify the result in one step.
 *
 * NOTE the deliberate absence of a throw: every caller here fails closed and
 * returns 200 regardless of outcome, because these functions are invoked by
 * pg_cron/pgmq and a non-2xx would drive a retry loop against a condition that
 * will not change. The point of this module is that the three non-writable
 * outcomes are now DISTINGUISHABLE and loggable, not that they diverge in
 * control flow.
 */
export async function checkRelationshipWritable(
  // Structural type: anything with the supabase-js `.rpc()` shape. Avoids an
  // `npm:@supabase/supabase-js` import so this file stays vitest-loadable.
  client: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: GateRpcError | null }> },
  relationshipId: string | null,
): Promise<GateOutcome> {
  const { error } = await client.rpc("assert_relationship_writable", {
    p_relationship_id: relationshipId,
  });
  return classifyGateError(error);
}

/**
 * One line, structured, for the edge function log. `unavailable` is the only
 * outcome that indicates something is broken, so it is the only one logged at
 * error level — a suspended relationship must not page anyone.
 */
export function logGateOutcome(fnName: string, outcome: GateOutcome, context: Record<string, unknown>): void {
  if (outcome.kind === "writable") return;
  const line = JSON.stringify({ fn: fnName, gate: outcome.kind, ...context, detail: outcome });
  if (outcome.kind === "unavailable") {
    console.error(`[${fnName}] relationship gate UNAVAILABLE - this is infrastructure, not a suspension:`, line);
  } else {
    console.log(`[${fnName}] relationship gate ${outcome.kind}:`, line);
  }
}
