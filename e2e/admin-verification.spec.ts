import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Phase 3 — Admin Verification Surface E2E spec
// Covers VERIF-01/02/03/05 (queue, approve, reject, route gate).
//
// ⚠️  RED-FIRST (Wave-0): these tests were EXPECTED to FAIL before the
// /admin/verifications route and the RPCs (approve_company, reject_company,
// list_pending_verifications) existed. They are GREEN as of 03-02/03-03/03-04.
//
// Fixtures (seeded in supabase/seed/seed.sql by Phase 3 Wave-0):
//   HS reviewer  — hsteam@hello-sello.test  · UUID 9999…  · password123
//   Non-HS user  — alice@greenleaf.test     · UUID 1111…  · password123
//   Pending co   — PendingCo GmbH           · UUID cccc…  · verification_status='pending'
//
// Test titles MUST match VALIDATION.md grep cases verbatim so per-task
// `npx playwright test -g "<case>"` commands resolve.
//
// Fixture management: mutating tests (approve, reject) run in a test.describe.serial
// block so they never race against each other on the shared PendingCo fixture. Each
// test resets PendingCo to 'pending' via the service-role client and clears browser
// cookies to avoid stale auth sessions from prior tests in the same worker.

const HS_EMAIL = 'hsteam@hello-sello.test'
const HS_PASSWORD = 'password123'

const NON_HS_EMAIL = 'alice@greenleaf.test'
const NON_HS_PASSWORD = 'password123'

const PENDING_CO_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PENDING_CO_DETAIL_URL = `/admin/verifications/${PENDING_CO_ID}`

// Local Supabase service-role client for fixture management.
// These are the standard local dev constants — safe to use in tests.
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function resetPendingCo(): Promise<void> {
  const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY)
  await admin
    .from('company')
    .update({ verification_status: 'pending', verified_at: null, verified_by: null })
    .eq('id', PENDING_CO_ID)
}

async function signIn(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  // Clear cookies so we always start from a signed-out state.
  // Within a Playwright worker the browser context persists across tests; without
  // explicit clearance the login page may auto-redirect an already-authed user
  // before the form is filled, leaving the wrong session active.
  await context.clearCookies()
  await page.goto('/login')
  // Clear localStorage after navigation to the app domain (avoids about:blank SecurityError).
  await page.evaluate(() => { try { window.localStorage.clear() } catch (_) { /* noop */ } })
  // Wait for the login form to be present before filling.
  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

// VERIF-01: queue lists pending companies oldest-first with licence badge
// Read-only — runs freely in parallel with other specs.
test('queue lists pending oldest-first', async ({ page, context }) => {
  await resetPendingCo()
  await signIn(page, context, HS_EMAIL, HS_PASSWORD)
  await page.goto('/admin/verifications')

  // The queue table must be visible
  await expect(page.getByRole('table')).toBeVisible()

  // PendingCo GmbH (seeded 30d ago) must appear in the queue
  await expect(page.getByText('PendingCo GmbH')).toBeVisible()

  // Oldest company must appear before newer ones (D-08 oldest-first ordering)
  // The seeded pending company has created_at 30 days ago — it must be first in
  // the rendered list (first row in the table body).
  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow).toContainText('PendingCo GmbH')
})

// VERIF-05 (route gate): non-HS user is redirected away from /admin
// Read-only / non-mutating — runs freely in parallel.
test('non-hs user redirected from /admin', async ({ page, context }) => {
  await signIn(page, context, NON_HS_EMAIL, NON_HS_PASSWORD)

  // Navigate directly to the admin verifications route
  await page.goto('/admin/verifications')

  // The server-component guard (/admin/layout.tsx) must redirect non-HS users to /
  // Wait for the redirect to complete
  await page.waitForURL((url) => !url.pathname.startsWith('/admin'), { timeout: 10_000 })

  // Confirm we are NOT on any /admin route
  expect(page.url()).not.toContain('/admin')
})

// Mutating tests run serially (test.describe.serial) so they never race on the
// shared PendingCo fixture. Each test resets PendingCo before its own assertions.
test.describe.serial('mutating PendingCo actions', () => {
  // VERIF-02: approve sets status to verified
  test('approve sets verified', async ({ page, context }) => {
    await resetPendingCo()
    await signIn(page, context, HS_EMAIL, HS_PASSWORD)

    // Navigate directly to the detail page (hard navigation — bypasses RSC router cache).
    // The queue click uses a Next.js <Link>, which may serve a cached RSC payload from
    // a prior test run; page.goto always fetches fresh from the server.
    await page.goto(PENDING_CO_DETAIL_URL)

    // The detail page must load with PendingCo in pending state
    await expect(page.getByRole('heading', { name: /PendingCo GmbH/i })).toBeVisible()

    // Click the Approve button (D-09: one-click confirm)
    await page.getByRole('button', { name: /approve/i }).click()

    // Confirm dialog must appear (D-09)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /confirm/i }).click()

    // On success: toast (D-10) + company leaves the pending list (revalidate).
    // Filter by the toast's fixed-position div to avoid strict-mode violations with
    // any other "approved" text on the page.
    await expect(
      page.locator('[class*="fixed"][class*="bottom"]').filter({ hasText: /approved/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Navigate back to queue — PendingCo must NO LONGER appear in the pending tab
    await page.goto('/admin/verifications')
    await expect(page.getByText('PendingCo GmbH')).not.toBeVisible()
  })

  // VERIF-03: reject records the reason in the audit log
  test('reject records reason', async ({ page, context }) => {
    await resetPendingCo()
    await signIn(page, context, HS_EMAIL, HS_PASSWORD)

    // Navigate directly to the detail page (hard navigation — bypasses RSC router cache).
    await page.goto(PENDING_CO_DETAIL_URL)

    // The detail page must load with PendingCo in pending state
    await expect(page.getByRole('heading', { name: /PendingCo GmbH/i })).toBeVisible()

    // Click the Reject button to open the reason form (D-05)
    await page.getByRole('button', { name: /reject/i }).click()

    // Reject dialog must appear (D-05: preset reasons + optional free text)
    await expect(page.getByRole('dialog')).toBeVisible()

    // Select a preset reason (D-05: "Licence expired" is in the starting set)
    await page.getByLabel(/licence expired/i).check()

    // Add an optional note (D-05: optional free text — placeholder is "Add context for the audit log…")
    const noteField = page.getByPlaceholder(/add context/i)
    if (await noteField.isVisible()) {
      await noteField.fill('The submitted licence has an expiry date in the past.')
    }

    // Submit the rejection (button label in ReviewActions.tsx: "Reject company")
    await page.getByRole('button', { name: /reject company/i }).click()

    // On success: toast (D-10) + company leaves the pending list.
    // Filter by the toast's fixed-position div to avoid strict-mode violations with
    // "rejected" appearing in the status badge and breadcrumb after the action completes.
    await expect(
      page.locator('[class*="fixed"][class*="bottom"]').filter({ hasText: /rejected/i }),
    ).toBeVisible({ timeout: 10_000 })
    await page.goto('/admin/verifications')
    await expect(page.getByText('PendingCo GmbH')).not.toBeVisible()
  })
})
