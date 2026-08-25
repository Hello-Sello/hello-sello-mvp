/**
 * One owner for what a failed connection request/accept/decline tells the user.
 *
 * Both accept paths RAISE rather than returning a row count, and both raise
 * texts are fixed strings owned by their migrations (`20260823090000`,
 * `20260724100400`). Matching them here — in one place, off the wire format —
 * keeps the two surfaces that call accept (the Connect inbox and the Discover
 * requests list) from each inventing their own wording, and keeps a raw
 * Postgres string from ever reaching a pharmacy's screen.
 *
 * It also covers the SEND side. `inbox_insert` gained a receiver-liveness
 * predicate (HEL-75, `20260825130000`), so sending to a company that has
 * deactivated or been deleted now fails as a 42501 rather than a RAISE — a
 * refusal with no message of its own. Without a branch for it, `actions.ts`
 * would hand the raw `new row violates row-level security policy …` to a
 * pharmacy's screen, which is the T10 defect this module exists to prevent.
 *
 * The unrecognised case deliberately returns the generic message instead of the
 * server text: an unmatched raise is, by definition, one we have not reasoned
 * about, and a confident-sounding wrong explanation is worse than a vague right
 * one. Extend the matches when a new raise becomes reachable — never widen by
 * passing `.message` through.
 */

const GENERIC = "We couldn't complete that. Please try again.";

/** `… is <status> (not pending)` — both RPCs use this exact shape. */
const NOT_PENDING = / is (\w+) \(not pending\)/;

/**
 * A refused INSERT on the inbox table. `inbox_insert` carries three terms: two
 * pin the sender to the caller, one requires the receiver company to be live.
 * The sender terms are written by this server action from the session itself,
 * so they cannot fail for an ordinary user — a refusal an actual person can
 * reach is the receiver term. The wording therefore names the receiver, and
 * deliberately matches what the read side already shows: HEL-70 hides such a
 * company from Discover, so "no longer available" is the same story twice.
 */
const INBOX_RLS = /row-level security policy[\s\S]*pending_inbox_item/;

export function requestActionError(e: unknown): string {
  const text =
    typeof e === "string"
      ? e
      : typeof (e as { message?: unknown })?.message === "string"
        ? ((e as { message: string }).message)
        : "";

  if (/ is deleted\b/.test(text)) return "This request is no longer available.";

  if (INBOX_RLS.test(text)) return "This company is no longer available.";

  const status = NOT_PENDING.exec(text)?.[1];
  if (status === "accepted") return "This request has already been accepted.";
  if (status === "rejected") return "This request has already been declined.";

  return GENERIC;
}
