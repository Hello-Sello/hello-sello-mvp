/**
 * Phase 11 — Team invite round-trip E2E (11-01 Wave-0 RED scaffold, RBAC-02 / SC2).
 *
 * The team page (`/team` or under /account — D-14), the `inviteMember` server action
 * (admin.inviteUserByEmail, D-06), the invite email template, and the auth-confirm
 * `type=invite` accept path are all built in plans 05/06. This spec is the executable
 * contract those plans must turn GREEN.
 *
 * Flow under test (D-06/D-07/D-08/D-09, RESEARCH §7):
 *   Superadmin signs in → /team → invite newcolleague@… as Member
 *   → row shows PENDING (invited, not yet accepted)
 *   → invite mail (Mailpit locally) → /auth/confirm?type=invite → set a password → sign in
 *   → the invitee is now an ACTIVE Member of the SAME company (person.company_id set, role Member).
 *   D-09: inviting an email that ALREADY has a Hello-Sello account surfaces a clean
 *         "already has a Hello-Sello account" message (the real join-existing flow is Phase 12).
 *
 * Fixtures:
 *   - two-company.ts  : loginAs(page, 'alice') — Alice (GreenLeaf) is a company Superadmin
 *                       once the founder→Superadmin backfill lands (RBAC-01, RESEARCH §5).
 *   - inbucket.ts     : extractConfirmLink(addr, { type: 'invite' }) reads the local mailbox.
 *   - local-supabase  : service-role client to read back the invitee's person row (active proof).
 *
 * ⚠️  RED-FIRST (Wave-0): EXPECTED to FAIL today — no /team page, no invite action,
 * no invite template, no `type=invite` accept wiring. That failure is the proof the
 * spec exercises the real surface. Goes GREEN as plans 05/06 land. Local stack only.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './fixtures/two-company'
import { extractConfirmLink } from './fixtures/inbucket'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from './fixtures/local-supabase'

// Alice's company (GreenLeaf) — the invitee must end up attached HERE.
const GREENLEAF_COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const INVITE_PASSWORD = 'invite-pw-7731'

function makeAdminClient() {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// The invite mutates auth.users (creates the invitee) — serial so the two cases
// never race on the shared mailbox / Alice session.
test.describe.configure({ mode: 'serial' })

test('invite a colleague → pending row → accept invite link → active Member of the same company', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  const invitee = `newcolleague+${Date.now()}@example.test`
  const admin = makeAdminClient()

  // Snapshot GreenLeaf's member count BEFORE the invite is accepted, so we can prove
  // the accepted invitee was added (count goes up by exactly one).
  const { count: beforeCount } = await admin
    .from('person')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', GREENLEAF_COMPANY_ID)

  // 1. Alice (a company Superadmin) opens the team page and invites a colleague as Member.
  await loginAs(page, 'alice')
  await page.goto('/team')
  await page.getByRole('button', { name: /invite( (a )?(member|colleague))?/i }).click()
  await page.locator('input[name="email"]').fill(invitee)
  // Role select defaults to Member (D-08) — leave the default; submit the invite.
  await page.getByRole('button', { name: /send invite|invite/i }).click()

  // 2. The invitee appears in the team list as PENDING (invited, not yet accepted — D-07).
  const pendingRow = page.getByRole('row', { name: new RegExp(invitee, 'i') })
  await expect(pendingRow).toContainText(/pending/i, { timeout: 10_000 })

  // 3. Pull the invite confirm link from the local mailbox and "click" it (D-06).
  const confirmUrl = await extractConfirmLink(invitee, { type: 'invite' })
  expect(confirmUrl).toContain('type=invite')
  await context.clearCookies()
  await page.goto(confirmUrl)

  // 4. The accept page lets the invitee set a password; submitting signs them in.
  await page.locator('input[name="password"]').fill(INVITE_PASSWORD)
  await page.getByRole('button', { name: /set (new )?password|accept|continue|sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/auth/confirm'), { timeout: 15_000 })

  // 5. The invitee is now an ACTIVE Member of Alice's company (server truth via admin
  //    client): GreenLeaf's member count went up by exactly one. The accepted invitee
  //    is linked to GreenLeaf (person.company_id set) by the signup-trigger metadata path.
  const { count: afterCount, error } = await admin
    .from('person')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', GREENLEAF_COMPANY_ID)
  expect(error).toBeNull()
  expect(afterCount, 'accepting the invite must add the invitee to GreenLeaf').toBe(
    (beforeCount ?? 0) + 1,
  )
})

test('inviting an email that already has a Hello-Sello account surfaces the D-09 message', async ({
  page,
  context,
}) => {
  await context.clearCookies()

  // Bob already has a Hello-Sello account (seeded). Inviting him must NOT silently
  // mis-handle — it surfaces a clean "already has a Hello-Sello account" message
  // (the real join-existing-company flow is deferred to Phase 12, D-09).
  await loginAs(page, 'alice')
  await page.goto('/team')
  await page.getByRole('button', { name: /invite( (a )?(member|colleague))?/i }).click()
  await page.locator('input[name="email"]').fill('bob@stonepharm.test')
  await page.getByRole('button', { name: /send invite|invite/i }).click()

  await expect(page.getByText(/already has a Hello-?Sello account/i)).toBeVisible({
    timeout: 10_000,
  })
})
