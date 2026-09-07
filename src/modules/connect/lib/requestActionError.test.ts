/**
 * T10 — a failed accept/decline must say something true, not nothing.
 *
 * `accept_connection_request` and `accept_person_connection` both RAISE when the
 * request is no longer pending — reachable from a second tab or a stale Discover
 * list. Neither call site caught, so the failure degraded to a silent no-op plus
 * an unhandled rejection (DEV-83's exact shape).
 *
 * This is the ONE owner of what those failures say. The raise texts it matches
 * are fixed strings in the migrations:
 *   20260823090000 — 'accept_connection_request: request % is % (not pending)'
 *                    'accept_connection_request: request % is deleted'
 *   20260724100400 — 'accept_person_connection: % is % (not pending)'
 * Anything it does not recognise gets the generic message rather than a guess —
 * a raw Postgres string is never shown.
 */
import { describe, it, expect } from "vitest";
import { requestActionError } from "./requestActionError";

describe("requestActionError", () => {
  it("an already-accepted request says so, not a raw database string", () => {
    const e = { message: "accept_connection_request: request abc is accepted (not pending)" };
    expect(requestActionError(e)).toBe("This request has already been accepted.");
  });

  it("an already-declined request says declined", () => {
    const e = { message: "accept_person_connection: abc is rejected (not pending)" };
    expect(requestActionError(e)).toBe("This request has already been declined.");
  });

  it("a deleted request says it is gone", () => {
    const e = { message: "accept_connection_request: request abc is deleted" };
    expect(requestActionError(e)).toBe("This request is no longer available.");
  });

  // ---- HEL-75: the SEND side. `inbox_insert` now carries a receiver-liveness
  // term, so this is a refusal an ordinary person can actually reach.
  it("a request refused because the company is gone names the company, not RLS", () => {
    const e = {
      message:
        'new row violates row-level security policy for table "pending_inbox_item"',
    };
    expect(requestActionError(e)).toBe("This company is no longer available.");
  });

  it("the RLS branch still matches when PostgREST wraps the text over lines", () => {
    // The pattern spans newlines on purpose: the wire text is not always one line.
    const e = {
      message:
        'new row violates row-level security policy\nfor table "pending_inbox_item"',
    };
    expect(requestActionError(e)).toBe("This company is no longer available.");
  });

  it("an RLS refusal on a DIFFERENT table does not borrow this sentence", () => {
    // Guards against widening the match to any 42501 anywhere — a company that
    // is perfectly fine must never be reported as gone.
    const e = {
      message: 'new row violates row-level security policy for table "chat_message"',
    };
    expect(requestActionError(e)).toBe("We couldn't complete that. Please try again.");
  });

  it("anything unrecognised gets the generic message — never the raw text", () => {
    const e = { message: 'permission denied for function "accept_connection_request"' };
    expect(requestActionError(e)).toBe("We couldn't complete that. Please try again.");
  });

  it("accepts a bare string too — the person path returns { error: message }", () => {
    expect(requestActionError("accept_person_connection: abc is accepted (not pending)")).toBe(
      "This request has already been accepted.",
    );
  });

  // ---- HEL-84 (0026-relationship-write-gate): assert_relationship_writable's
  // two raise texts, reachable through this door via createPairInboxItem/
  // requestProductPricing now that inbox_insert carries its own
  // relationship-write-gate term (PLAN-HEL-84.md §3/§7).
  it("a suspended relationship's raise says so in plain language, not the raw function name", () => {
    const e = {
      message: "assert_relationship_writable: relationship is suspended — no new writes",
    };
    expect(requestActionError(e)).toBe(
      "This relationship is suspended — new messages and requests aren't allowed until it's reactivated.",
    );
  });

  it("an ended relationship's raise matches the same branch — one status-agnostic message covers both", () => {
    // The raise format is `relationship is % — no new writes`, substituting the
    // actual status — 'ended' must match the same branch as 'suspended', not
    // fall through to the generic message for lack of an exact-string match.
    const e = {
      message: "assert_relationship_writable: relationship is ended — no new writes",
    };
    expect(requestActionError(e)).toBe(
      "This relationship is suspended — new messages and requests aren't allowed until it's reactivated.",
    );
  });

  it("the relationship-status branch still matches when PostgREST wraps the text over lines", () => {
    const e = {
      message: "assert_relationship_writable: relationship is suspended\n— no new writes",
    };
    expect(requestActionError(e)).toBe(
      "This relationship is suspended — new messages and requests aren't allowed until it's reactivated.",
    );
  });

  it("assert_relationship_writable's not-found raise reuses INBOX_RLS's wording — the same 'can't tell existence from access' shape", () => {
    const e = { message: "assert_relationship_writable: relationship not found" };
    expect(requestActionError(e)).toBe("This company is no longer available.");
  });

  it("a DIFFERENT function's superficially similar 'relationship...not...found' raise does not borrow this sentence", () => {
    // suspend_relationship's own raise (20260825170000_relationship_admin_
    // suspend_end.sql:124) — an HS-team authorization/state error, not
    // assert_relationship_writable's probe-safe "not found" refusal. Guards
    // against a regex widened past the exact new raise shape.
    const e = { message: "relationship not active or not found" };
    expect(requestActionError(e)).toBe("We couldn't complete that. Please try again.");
  });
});
