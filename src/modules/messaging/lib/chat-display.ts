/**
 * Chat display helpers - pure formatting shared by the list + thread.
 *
 * A small, intentional re-implementation of connect's date formatter rather
 * than a cross-module import: each module owns its own display (bounded
 * contexts), so messaging never reaches into connect's internals.
 */

/** Compact relative time for a row: "just now", "5m", "3h", "2d", else "12 Jun". */
export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** One-line preview of a message body: whitespace-collapsed, ellipsised at `max`. */
export function previewOf(body: string, max = 48): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
