/**
 * Phase 10 — Email-change round-trip E2E (10-01 Wave-0 RED scaffold, ACCT-03).
 *
 * RED now: the account Settings email-change affordance, the `changeEmail`
 * (`updateUser({ email })`) action, and the pending-state UX are NOT built yet
 * (they land in 10-02 / 10-03). This spec is the contract those tasks turn GREEN.
 *
 * Flow under test (D-10/D-11/D-12, OWASP double-confirm = Supabase default):
 *   signed in → account Settings → submit a new email → updateUser({ email })
 *   → user.new_email pending (old address unchanged) → confirm link to the NEW address
 *   → /auth/confirm?type=email_change → auth.users.email flips to the new value.
 *
 * Verification of the flip: re-read the email row in Settings (canonical source is
 * auth.users.email via the SECURITY DEFINER view — no person dual-write, D-13).
 *
 * Mail seam: extractConfirmLink() reads the local Inbucket mailbox (10-01 Task 1 helper).
 * Seeded login: alice@greenleaf.test / password123 (e2e/fixtures/auth-gate-fixtures.ts).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { ALICE_EMAIL, ALICE_PASSWORD } from './fixtures/auth-gate-fixtures'
import { extractConfirmLink } from './fixtures/inbucket'

// Mutates Alice's auth email — serial so the change/restore pair never races.
test.describe.configure({ mode: 'serial' })

const NEW_EMAIL = 'alice-changed@greenleaf.test'

async function signIn(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  await context.clearCookies()
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
}

test('email-change round-trip: request → new_email pending → confirm → auth email flips', async ({
  page,
  context,
}) => {
  await signIn(page, context, ALICE_EMAIL, ALICE_PASSWORD)

  // 1. Open Settings and request the new email.
  await page.goto('/account')
  await page.getByRole('button', { name: /settings/i }).click()
  await page.locator('input[name="email"]').fill(NEW_EMAIL)
  await page.getByRole('button', { name: /change email|update email|save/i }).click()

  // 2. Pending state — the new address is shown (from user.new_email); the change is
  //    NOT yet effective on the sign-in address.
  await expect(page.getByText(new RegExp(NEW_EMAIL, 'i'))).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/confirmation sent|pending|check (your|both)/i)).toBeVisible({
    timeout: 10_000,
  })

  // 3. Confirm via the link mailed to the NEW address.
  const confirmUrl = await extractConfirmLink(NEW_EMAIL, { type: 'email_change' })
  expect(confirmUrl).toContain('type=email_change')
  await page.goto(confirmUrl)

  // 4. auth.users.email has flipped — the Settings email row now shows the new address.
  await page.goto('/account')
  await page.getByRole('button', { name: /settings/i }).click()
  await expect(page.getByText(new RegExp(NEW_EMAIL, 'i'))).toBeVisible({ timeout: 10_000 })

  // Restore the seeded email so the shared fixture is not left mutated.
  await page.locator('input[name="email"]').fill(ALICE_EMAIL)
  await page.getByRole('button', { name: /change email|update email|save/i }).click()
  const restoreUrl = await extractConfirmLink(ALICE_EMAIL, { type: 'email_change' })
  await page.goto(restoreUrl)
})
