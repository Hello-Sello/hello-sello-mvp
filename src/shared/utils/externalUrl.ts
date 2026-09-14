/**
 * The http(s) URL for a web address someone typed, or null when it isn't one.
 *
 * People type `www.example.com` far more often than `https://www.example.com`,
 * and an href without a scheme resolves RELATIVE to our own page — the link
 * lands on hello-sello…/www.example.com. A bare domain (optionally with a path)
 * is upgraded to https; anything else — `javascript:`, `mailto:`, free text —
 * is refused, so a non-null result is always safe to put in an href.
 */
export function externalUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (/^https?:\/\/\S+$/i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) return `https://${url}`;
  return null;
}
