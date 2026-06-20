/**
 * Reusable local-mail link-extraction helper (Phase 10, Plan 01 — Wave-0 RED contract).
 *
 * Both auth round-trips (password-reset ACCT-02, email-change ACCT-03) need to read
 * the confirmation email Supabase mails during E2E and pull out the same-origin
 * `/auth/confirm?token_hash=…&type=…&next=…` link to "click". Locally, Supabase routes
 * all outbound mail to its bundled mail catcher (exposed on port 54324) instead of Resend.
 *
 * NOTE (10-04): recent Supabase CLI bundles **Mailpit** (not Inbucket) under the same
 * `supabase_inbucket_*` container name. Mailpit's REST API differs from Inbucket's, so
 * this helper talks to the Mailpit API (`/api/v1/search`, `/api/v1/message/<id>`). The
 * file name and the exported `extractConfirmLink` contract are kept so the two specs that
 * import it are unaffected; only the transport changed.
 *
 * The link is asserted same-origin by the caller before use (T-10-01/T-10-02). Local
 * stack only, never the cloud project.
 */

/** Local mail-catcher REST endpoint (Mailpit). */
export const INBUCKET_URL = 'http://127.0.0.1:54324'

/** Mailpit REST shapes (only the fields we read). */
interface MailpitSummary {
  ID: string
  Created: string
}
interface MailpitMessage {
  Text?: string
  HTML?: string
}

/** Matches the same-origin confirm link the recovery / email_change templates emit. */
const CONFIRM_LINK_RE = /https?:\/\/[^\s"'<>]*\/auth\/confirm\?[^\s"'<>]+/g

/** Newest-first list of messages addressed to `mailbox`. */
async function searchMailbox(mailbox: string): Promise<MailpitSummary[]> {
  const res = await fetch(
    `${INBUCKET_URL}/api/v1/search?query=${encodeURIComponent(`to:${mailbox}`)}`,
  )
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Mailpit: search failed (${res.status}) for ${mailbox}`)
  }
  const data = (await res.json()) as { messages?: MailpitSummary[] }
  // Mailpit returns newest-first already; keep that order.
  return data.messages ?? []
}

async function readMessage(id: string): Promise<MailpitMessage> {
  const res = await fetch(`${INBUCKET_URL}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit: message read failed (${res.status}) for ${id}`)
  return (await res.json()) as MailpitMessage
}

/** Pull every `/auth/confirm?…` link out of a message body (text + html). */
function confirmLinksIn(msg: MailpitMessage): string[] {
  const haystack = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`
  // Decode HTML-entity ampersands so URL parsing of the query string is reliable.
  return (haystack.match(CONFIRM_LINK_RE) ?? []).map((l) => l.replace(/&amp;/g, '&'))
}

/**
 * Poll the given mailbox and return the latest `/auth/confirm?token_hash=…&type=…&next=…`
 * link found. If `opts.type` is given, prefer the message whose confirm link carries
 * that `type` (e.g. `recovery` for reset, `email_change` for the address swap).
 *
 * @param mailbox  The recipient address (the part the catcher indexes by).
 * @param opts.type  Optional `type=` filter (`'recovery'` | `'email_change'` | …).
 * @returns the absolute, same-origin confirm URL.
 * @throws if no matching confirm link arrives within the poll window.
 */
export async function extractConfirmLink(
  mailbox: string,
  opts: { type?: string; timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const { type, timeoutMs = 15_000, intervalMs = 500 } = opts
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const summaries = await searchMailbox(mailbox)
    // Newest first — walk in arrival order so the freshest matching link wins.
    for (const summary of summaries) {
      const msg = await readMessage(summary.ID)
      const links = confirmLinksIn(msg)
      const match = type
        ? links.find((l) => new URL(l).searchParams.get('type') === type)
        : links[0]
      if (match) return match
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(
    `Mailpit: no /auth/confirm link${type ? ` (type=${type})` : ''} arrived for ${mailbox} within ${timeoutMs}ms`,
  )
}
