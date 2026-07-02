// Pure vCard builder — no DB/server deps, so it's unit-testable and safe to import
// from both server components (profile QR, "Save contact" route) without pulling in
// the createClient/next-headers chain that lives in the profile module's index.

/** The minimal fields a vCard needs. PublicProfile is structurally compatible, so
 *  callers can pass it directly; the account card assembles this shape in-memory
 *  from the profile + company it already fetched (no extra RPC). */
export type VCardInput = {
  displayName: string
  title?: string | null
  email?: string | null
  phone?: string | null
  linkedin?: string | null
  company?: { name: string; website?: string | null } | null
}

// Escape the characters that are structural in vCard 3.0 TEXT values (RFC 2426 §5):
// backslash first (so we don't double-escape the ones we add), then newline, comma
// and semicolon. Without this a name/company like "Müller; Sohn" or "Acme, Inc."
// corrupts the parsed contact on scan.
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    // Collapse every line-break form (CRLF, lone CR, lone LF) to an escaped \n so
    // a Windows-pasted value never leaves a raw CR sitting inside a CRLF-delimited line.
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/** Build a vCard 3.0 (the format iOS + Android both read) for "Save contact" and the
 *  profile QR. Empty fields are omitted; every value is escaped so separators inside
 *  names, titles or company names never break the parsed contact. */
export function buildVCard(p: VCardInput): string {
  const [first, ...rest] = p.displayName.split(' ')
  const last = rest.join(' ')
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    // The ; between last/first and the trailing ;;; are STRUCTURAL separators of
    // the N field — only the values are escaped, never these.
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(p.displayName)}`,
    p.title && `TITLE:${esc(p.title)}`,
    p.company?.name && `ORG:${esc(p.company.name)}`,
    p.email && `EMAIL;TYPE=WORK:${esc(p.email)}`,
    p.phone && `TEL;TYPE=WORK,VOICE:${esc(p.phone)}`,
    p.company?.website && `URL:${esc(p.company.website)}`,
    p.linkedin && `X-SOCIALPROFILE;TYPE=linkedin:${esc(p.linkedin)}`,
    'END:VCARD',
  ].filter(Boolean)
  return lines.join('\r\n')
}
