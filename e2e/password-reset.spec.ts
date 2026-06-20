/**
 * Phase 10 — Password-reset round-trip E2E (10-01 Wave-0 RED scaffold, ACCT-02).
 *
 * RED now: `/forgot-password`, the `requestPasswordReset` action, the `/reset-password`
 * set-password page, and the proxy `/forgot-password` allowlist entry are NOT built yet
 * (they land in 10-02 / 10-03). This spec is the executable contract those tasks turn GREEN.
 *
 * Flow under test (D-06/D-07, RESEARCH § System Architecture):
 *   signed-out → /forgot-password → submit email → resetPasswordForEmail()
 *   → recovery mail (Inbucket locally) → /auth/confirm?type=recovery&next=/reset-password
 *   → session set → /reset-password → submit new password → sign in with the new password.
 *
 * Anti-enumeration (RESEARCH Pattern 1): the same neutral "if an account exists…" screen
 * renders whether or not the email exists — asserted for an unknown address.
 *
 * Mail seam: extractConfirmLink() reads the local Inbucket mailbox (10-01 Task 1 helper).
 * Seeded login: alice@greenleaf.test / password123 (e2e/fixtures/auth-gate-fixtures.ts).
 */
import { test, expect } from '@playwright/test'
import { ALICE_EMAIL, ALICE_PASSWORD } from './fixtures/auth-gate-fixtures'
import { extractConfirmLink } from './fixtures/inbucket'

// Round-trips mutate Alice's auth password — serial so a later test never races the reset.
test.describe.configure({ mode: 'serial' })

const NEW_PASSWORD = 'reset-pw-9281'

test('logged-out reset round-trip: forgot-password → recovery link → reset-password → sign in', async ({
  page,
  context,
}) => {
  await context.clearCookies()

  // 1. Request a reset for the seeded account.
  await page.goto('/forgot-password')
  await page.locator('input[name="email"]').fill(ALICE_EMAIL)
  await page.getByRole('button', { name: /send reset link/i }).click()

  // Neutral anti-enumeration confirmation screen.
  await expect(page.getByText(/if an account exists/i)).toBeVisible({ timeout: 10_000 })

  // 2. Pull the recovery confirm link from the local mailbox and "click" it.
  const confirmUrl = await extractConfirmLink(ALICE_EMAIL, { type: 'recovery' })
  expect(confirmUrl).toContain('type=recovery')
  expect(confirmUrl).toContain('next=/reset-password')
  await page.goto(confirmUrl)

  // 3. Land on /reset-password WITH a recovery session; set a new password.
  await page.waitForURL((url) => url.pathname === '/reset-password', { timeout: 15_000 })
  await page.locator('input[name="password"]').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: /set (new )?password|reset password/i }).click()

  // 4. Sign in with the NEW password succeeds.
  await context.clearCookies()
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(ALICE_EMAIL)
  await page.locator('input[name="password"]').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
  expect(page.url()).not.toContain('/login')

  // Restore the seeded password so the shared fixture is not left mutated.
  await page.goto('/forgot-password')
  await page.locator('input[name="email"]').fill(ALICE_EMAIL)
  await page.getByRole('button', { name: /send reset link/i }).click()
  // Wait for the action to complete (neutral screen) before polling the mailbox —
  // otherwise extractConfirmLink races the request and returns the previous,
  // already-consumed recovery email (which then fails verifyOtp with 403). Mirrors
  // the same wait the initial request does above.
  await expect(page.getByText(/if an account exists/i)).toBeVisible({ timeout: 10_000 })
  const restoreUrl = await extractConfirmLink(ALICE_EMAIL, { type: 'recovery' })
  await page.goto(restoreUrl)
  await page.waitForURL((url) => url.pathname === '/reset-password', { timeout: 15_000 })
  await page.locator('input[name="password"]').fill(ALICE_PASSWORD)
  await page.getByRole('button', { name: /set (new )?password|reset password/i }).click()
})

test('forgot-password shows the neutral screen for an unknown email (anti-enumeration)', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/forgot-password')
  await page.locator('input[name="email"]').fill('nobody-unknown@example.test')
  await page.getByRole('button', { name: /send reset link/i }).click()
  // Same neutral screen — never reveals that the address is not registered.
  await expect(page.getByText(/if an account exists/i)).toBeVisible({ timeout: 10_000 })
})
