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
 *
 * HEL-84 (0026-relationship-write-gate) added a third door this file covers:
 * `inbox_insert` now also calls `assert_relationship_writable`, whose two
 * raise texts (`relationship is % — no new writes` / `relationship not
 * found`) are reachable through this same server action once the target
 * company's relationship to the sender is suspended/ended. This covers the
 * connect/pricing door only — the chat door (`postMessage`/`postDealMessage`
 * in `store.ts`) has no equivalent mapping yet; a suspended-relationship chat
 * refusal still surfaces the raw raise text there. Declared gap, not silently
 * missed (PLAN-HEL-84.md §7).
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

/**
 * `assert_relationship_writable`'s status raise (HEL-84,
 * `<ts>_assert_relationship_writable.sql`): `relationship is <status> — no
 * new writes`. Status-agnostic on purpose — the function raises the same
 * shape for 'suspended' and 'ended' alike, so one branch covers both rather
 * than pattern-matching a specific status word. `[\s\S]*` spans PostgREST's
 * occasional line wrap between the status and the dash.
 */
const RELATIONSHIP_NOT_WRITABLE = /relationship is \w+[\s\S]*no new writes/;

/**
 * `assert_relationship_writable`'s not-found raise: the SAME "can't tell
 * existence from access" shape INBOX_RLS already covers above — reuses that
 * wording rather than inventing new copy for the identical situation.
 */
const RELATIONSHIP_NOT_FOUND = /relationship not found\b/;

export function requestActionError(e: unknown): string {
  const text =
    typeof e === "string"
      ? e
      : typeof (e as { message?: unknown })?.message === "string"
        ? ((e as { message: string }).message)
        : "";

  if (/ is deleted\b/.test(text)) return "This request is no longer available.";

  if (INBOX_RLS.test(text)) return "This company is no longer available.";

  if (RELATIONSHIP_NOT_WRITABLE.test(text)) {
    return "This relationship is suspended — new messages and requests aren't allowed until it's reactivated.";
  }

  if (RELATIONSHIP_NOT_FOUND.test(text)) return "This company is no longer available.";

  const status = NOT_PENDING.exec(text)?.[1];
  if (status === "accepted") return "This request has already been accepted.";
  if (status === "rejected") return "This request has already been declined.";

  return GENERIC;
}
