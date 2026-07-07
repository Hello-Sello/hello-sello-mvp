/**
 * Pure video-link host allowlist for the Present card back (D-08, T-07-07).
 *
 * A seller pastes an embed link (Loom / YouTube / Vimeo) which the 07-04 card
 * later renders into an `<iframe src>`. That URL is untrusted input crossing into
 * the DOM, so a server action MUST validate it before persisting a `video_link`
 * row — otherwise a pasted `javascript:`/`data:` URL or an arbitrary host becomes
 * an XSS vector. Only https URLs on a fixed set of embed hosts pass.
 *
 * Host match is by registrable domain: the URL host must equal one of the base
 * domains OR be a subdomain of it (`player.vimeo.com`, `www.youtube.com`). A
 * look-alike like `youtube.com.evil.com` is a subdomain of `evil.com`, so it
 * fails — the check is anchored on the suffix boundary, not a substring.
 */

/** Base embed domains. A host passes if it equals one of these or ends with
 *  `.<domain>` (its subdomains). */
const ALLOWED_VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "loom.com"] as const;

function hostIsAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_VIDEO_HOSTS.some((base) => h === base || h.endsWith(`.${base}`));
}

/** True iff `raw` is an https URL on an allowlisted embed host. Rejects non-https
 *  schemes (including `javascript:`/`data:`), foreign hosts, and malformed URLs. */
export function isAllowedVideoUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return hostIsAllowed(url.hostname);
}

/** Return the trimmed URL if it passes the allowlist, else null — the value a
 *  server action persists (or rejects) for a `video_link` media row. */
export function normalizeVideoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  return isAllowedVideoUrl(trimmed) ? trimmed : null;
}
