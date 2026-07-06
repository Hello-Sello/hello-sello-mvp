/**
 * RED unit contract for the SET-03 lifecycle-email path (Phase 13, Plan 01 —
 * Wave-0, SET-03). Two INDEPENDENT contracts, one per describe block:
 *
 *  (a) PURE TEMPLATE — renderTemplate(event, vars) → { subject, html }, authored
 *      Deno-free in supabase/functions/_shared/email/templates.ts so BOTH the Deno
 *      edge function AND node/vitest can import it (mirrors _shared/sella/prompts.ts).
 *      Each rendered `html` carries EXACTLY ONE primary CTA anchor (D-17). Built in 13-05.
 *
 *  (b) DISPATCH DECISION — shouldDispatch(rpcResult): the single, pure rule
 *      "send the email ONLY after the state-change RPC returned ok, NEVER on error"
 *      (Pitfall 4: no email for a no-op / errored action). Centralised once so all 7
 *      event sites (approve/reject company, join.*, welcome, membership.removed) share
 *      it instead of repeating `if (error) return; after(() => invoke(...))`. Built in 13-11.
 *
 * ⚠️  RED-FIRST (Wave-0): the STATIC renderTemplate import fails to resolve today —
 *     the missing-module signal is the intended RED (like 10-01's <VerifiedBadge>), so
 *     the whole suite is RED now for module-not-found. shouldDispatch is imported
 *     LAZILY inside its own test so that, once 13-05 lands templates.ts, THIS file
 *     loads and the template block can go GREEN independently of 13-11 (the dispatch
 *     block stays RED until 13-11 exports shouldDispatch). Neither module is created
 *     here — that is 13-05 (templates) and 13-11 (dispatch wiring).
 *
 * Path note: from src/app/settings/, three `../` reach the worktree root, then into
 * supabase/functions/_shared/email/templates — the Deno-free pure module path (the
 * edge fn imports the same file via a Deno-relative path).
 */
import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../../../supabase/functions/_shared/email/templates'

type Rendered = { subject: string; html: string }

describe('SET-03 lifecycle email — pure template contract (13-05)', () => {
  it('verification.approved renders a non-empty subject and html', () => {
    const out: Rendered = renderTemplate('verification.approved', {})
    expect(out.subject).toMatch(/\S/)
    expect(out.html).toMatch(/\S/)
  })

  it('verification.approved html carries exactly ONE primary CTA anchor (D-17)', () => {
    const out: Rendered = renderTemplate('verification.approved', {})
    const anchors = out.html.match(/<a\s/gi) ?? []
    expect(anchors).toHaveLength(1)
  })
})

describe('SET-03 lifecycle email — dispatch decision contract (13-11)', () => {
  it('shouldDispatch is true after the RPC returns ok, false after an RPC error', async () => {
    // Lazy import: keeps this block from blocking file load before 13-11 exists, so
    // 13-05 can green the template block above independently. RED today
    // (@/shared/email/dispatch is absent) → GREEN when 13-11 exports shouldDispatch.
    const { shouldDispatch } = await import('@/shared/email/dispatch')
    expect(shouldDispatch({ error: null })).toBe(true)
    expect(shouldDispatch({ error: { message: 'rpc raised' } })).toBe(false)
  })
})
