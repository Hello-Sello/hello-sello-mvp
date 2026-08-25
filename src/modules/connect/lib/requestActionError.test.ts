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
});
