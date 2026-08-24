/**
 * One owner for what a failed connection accept/decline tells the user.
 *
 * Both accept paths RAISE rather than returning a row count, and both raise
 * texts are fixed strings owned by their migrations (`20260823090000`,
 * `20260724100400`). Matching them here — in one place, off the wire format —
 * keeps the two surfaces that call accept (the Connect inbox and the Discover
 * requests list) from each inventing their own wording, and keeps a raw
 * Postgres string from ever reaching a pharmacy's screen.
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

export function requestActionError(e: unknown): string {
  const text =
    typeof e === "string"
      ? e
      : typeof (e as { message?: unknown })?.message === "string"
        ? ((e as { message: string }).message)
        : "";

  if (/ is deleted\b/.test(text)) return "This request is no longer available.";

  const status = NOT_PENDING.exec(text)?.[1];
  if (status === "accepted") return "This request has already been accepted.";
  if (status === "rejected") return "This request has already been declined.";

  return GENERIC;
}
