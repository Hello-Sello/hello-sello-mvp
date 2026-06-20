/**
 * Reusable Inbucket link-extraction helper (Phase 10, Plan 01 — Wave-0 RED contract).
 *
 * Both auth round-trips (password-reset ACCT-02, email-change ACCT-03) need to read
 * the confirmation email Supabase mails during E2E and pull out the same-origin
 * `/auth/confirm?token_hash=…&type=…&next=…` link to "click". Locally, Supabase routes
 * all outbound mail to **Inbucket** (the local mail catcher) instead of Resend, exposed
 * over a REST API at `http://127.0.0.1:54324/api/v1/mailbox/<addr>`.
 *
 * This helper polls that mailbox, reads the latest matching message, and returns the
 * absolute confirm URL. It mirrors the local-stack-constants + simple-fetch style of
 * `e2e/fixtures/auth-gate-fixtures.ts` (service-role admin) — local stack only, never
 * the cloud project (T-10-01/T-10-02: the link is asserted same-origin before return).
 *
 * Alternative (faster, no mailbox poll): mint the link directly with the `sb_secret_`
 * admin client's `auth.admin.generateLink({ type, email })` API (mirrors the
 * service-role admin pattern in `local-supabase.ts`). This helper takes the Inbucket
 * path because it exercises the real template→link shape the human dashboard checkpoint
 * verifies (10-VALIDATION § Manual-Only).
 */

/** Local Inbucket REST endpoint — the stack maps SMTP into this mailbox API. */
export const INBUCKET_URL = 'http://127.0.0.1:54324'

/** Inbucket REST shapes (only the fields we read). */
interface InbucketMessageHeader {
  id: string
  date: string
}
interface InbucketMessage {
  body: { text?: string; html?: string }
}

/** Matches the same-origin confirm link the recovery / email_change templates emit. */
const CONFIRM_LINK_RE = /https?:\/\/[^\s"'<>]*\/auth\/confirm\?[^\s"'<>]+/g

async function listMailbox(mailbox: string): Promise<InbucketMessageHeader[]> {
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`)
  if (!res.ok) {
    if (res.status === 404) return [] // mailbox not created until first mail arrives
    throw new Error(`Inbucket: mailbox list failed (${res.status}) for ${mailbox}`)
  }
  return (await res.json()) as InbucketMessageHeader[]
}

async function readMessage(mailbox: string, id: string): Promise<InbucketMessage> {
  const res = await fetch(
    `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${id}`,
  )
  if (!res.ok) throw new Error(`Inbucket: message read failed (${res.status}) for ${id}`)
  return (await res.json()) as InbucketMessage
}

/** Pull every `/auth/confirm?…` link out of a message body (text + html). */
function confirmLinksIn(msg: InbucketMessage): string[] {
  const haystack = `${msg.body.text ?? ''}\n${msg.body.html ?? ''}`
  return haystack.match(CONFIRM_LINK_RE) ?? []
}

/**
 * Poll the given mailbox and return the latest `/auth/confirm?token_hash=…&type=…&next=…`
 * link found. If `opts.type` is given, prefer the message whose confirm link carries
 * that `type` (e.g. `recovery` for reset, `email_change` for the address swap).
 *
 * @param mailbox  The recipient address (the part Inbucket indexes by).
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
    const headers = await listMailbox(mailbox)
    // Newest first — Inbucket returns oldest→newest, so walk in reverse.
    for (const header of [...headers].reverse()) {
      const msg = await readMessage(mailbox, header.id)
      const links = confirmLinksIn(msg)
      const match = type
        ? links.find((l) => new URL(l).searchParams.get('type') === type)
        : links[0]
      if (match) return match
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(
    `Inbucket: no /auth/confirm link${type ? ` (type=${type})` : ''} arrived for ${mailbox} within ${timeoutMs}ms`,
  )
}
