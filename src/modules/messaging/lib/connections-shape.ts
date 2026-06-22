/**
 * Connections-shape - pure helpers for the new-chat picker (phase 04B / plan 01).
 *
 * These are the load-bearing RULES of the picker that must hold WITHOUT a
 * database, so they live here, separate from the Supabase read in
 * `../supabase/connections.ts`, and are unit-tested directly (mirrors the
 * deals/lib/recipient.ts + recipient.test.ts pattern, and rollout.ts's pure
 * style). No Supabase, no React, no I/O - pure functions only.
 *
 *   - canonicalPair               -> the DB `person_a_id < person_b_id` ordering (D-05)
 *   - isNewConnection             -> the 30-day "new connections" recency window (D-03)
 *   - relativeDayLabel            -> the "Today / N days ago" section labels (D-03)
 *   - countOpenDealsByRelationship-> the truthful open-deal badge count (D-06)
 */

const MS_PER_DAY = 86_400_000;

/**
 * Canonical participant order for a P2P thread. The DB enforces
 * `person_a_id < person_b_id` (CHECK chat_thread_p2p_canonical_order); default
 * string sort matches that lexicographic comparison. Re-authored here (the
 * messaging copy in rollout.ts is private) so it can be exported + unit-tested
 * and reused by `openOrCreateP2pThread`.
 */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Whole-day distance from `connectedAt` to `now` (floored, non-negative). A
 * connection in the future clamps to 0. Pure: callers pass `now` so the result
 * is deterministic and testable.
 */
function daysSince(connectedAt: string, now: Date | number): number {
  const then = new Date(connectedAt).getTime();
  const ref = typeof now === "number" ? now : now.getTime();
  const diff = ref - then;
  if (Number.isNaN(diff) || diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Is this connection inside the "New connections by date" window? True when
 * `connectedAt` is within `windowDays` whole days of `now`. Default window is 30
 * days (D-03 - tunable via the 3rd arg).
 */
export function isNewConnection(
  connectedAt: string,
  now: Date | number,
  windowDays = 30,
): boolean {
  return daysSince(connectedAt, now) <= windowDays;
}

/**
 * Relative day label for the "New connections by date" section: "Today" for a
 * same-day (< 1 day) connection, "1 day ago" (singular) / "N days ago" (plural)
 * for older ones. A tiny pure formatter - no date library (the repo has none;
 * see RESEARCH "Don't Hand-Roll"). Newest-first ordering is the caller's job.
 */
export function relativeDayLabel(iso: string, now: Date | number): string {
  const days = daysSince(iso, now);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/**
 * The deal statuses that count as "open" for the row badge (D-06). Mirrors the
 * deals module's `LIVE_STATUSES` (draft / confirmed / amended) - re-declared
 * locally (it is private to deals/reads.ts) so this module does not cross-import
 * a deals internal (RESEARCH Pitfall 3).
 */
const OPEN_DEAL_STATUSES = new Set<string>(["draft", "confirmed", "amended"]);

/**
 * Count OPEN deal cards per relationship. Given RLS-scoped `deal_card` rows
 * (each `{ relationship_id, status }`), returns a `Map<relationshipId, count>`
 * counting only rows whose status is open; relationships with zero open deals
 * are omitted from the map (no key). Pure - the caller does the DB fetch.
 */
export function countOpenDealsByRelationship(
  cards: ReadonlyArray<{ relationship_id: string; status: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (!OPEN_DEAL_STATUSES.has(c.status)) continue;
    counts.set(c.relationship_id, (counts.get(c.relationship_id) ?? 0) + 1);
  }
  return counts;
}
