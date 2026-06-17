import { test, expect, type Page } from '@playwright/test'

// Phase 3 — Admin Verification Surface E2E spec
// Covers VERIF-01/02/03/05 (queue, approve, reject, route gate).
//
// ⚠️  RED-FIRST (Wave-0): these tests are EXPECTED to FAIL today — the
// /admin/verifications route does not exist yet and the RPCs (approve_company,
// reject_company, list_pending_verifications) have not been written. These tests
// go GREEN in 03-02/03-03 once the route tree and DB migration land.
// Do NOT attempt to make these pass here.
//
// Fixtures (seeded in supabase/seed/seed.sql by Phase 3 Wave-0):
//   HS reviewer  — hsteam@hello-sello.test  · UUID 9999…  · password123
//   Non-HS user  — alice@greenleaf.test     · UUID 1111…  · password123
//   Pending co   — PendingCo GmbH           · UUID cccc…  · verification_status='pending'
//
// Test titles MUST match VALIDATION.md grep cases verbatim so per-task
// `npx playwright test -g "<case>"` commands resolve.

const HS_EMAIL = 'hsteam@hello-sello.test'
const HS_PASSWORD = 'password123'

const NON_HS_EMAIL = 'alice@greenleaf.test'
const NON_HS_PASSWORD = 'password123'

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

// VERIF-01: queue lists pending companies oldest-first with licence badge
test('queue lists pending oldest-first', async ({ page }) => {
  await signIn(page, HS_EMAIL, HS_PASSWORD)
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

// VERIF-02: approve sets status to verified
test('approve sets verified', async ({ page }) => {
  await signIn(page, HS_EMAIL, HS_PASSWORD)
  await page.goto('/admin/verifications')

  // Click into the PendingCo GmbH detail/review view (D-01: row click → detail page)
  await page.getByText('PendingCo GmbH').click()

  // The detail page must load
  await expect(page.getByRole('heading', { name: /PendingCo GmbH/i })).toBeVisible()

  // Click the Approve button (D-09: one-click confirm)
  await page.getByRole('button', { name: /approve/i }).click()

  // Confirm dialog must appear (D-09)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: /confirm/i }).click()

  // On success: toast (D-10) + company leaves the pending list (revalidate)
  await expect(page.getByText(/approved/i)).toBeVisible()

  // Navigate back to queue — PendingCo must NO LONGER appear in the pending tab
  await page.goto('/admin/verifications')
  await expect(page.getByText('PendingCo GmbH')).not.toBeVisible()
})

// VERIF-03: reject records the reason in the audit log
test('reject records reason', async ({ page }) => {
  await signIn(page, HS_EMAIL, HS_PASSWORD)
  await page.goto('/admin/verifications')

  // Click into the PendingCo GmbH detail/review view
  await page.getByText('PendingCo GmbH').click()

  // The detail page must load
  await expect(page.getByRole('heading', { name: /PendingCo GmbH/i })).toBeVisible()

  // Click the Reject button to open the reason form (D-05)
  await page.getByRole('button', { name: /reject/i }).click()

  // Preset reason form must appear (D-05: preset reasons + optional free text)
  await expect(page.getByRole('form')).toBeVisible()

  // Select a preset reason (D-05: "Licence expired" is in the starting set)
  await page.getByLabel(/licence expired/i).check()

  // Add an optional note (D-05: optional free text)
  const noteField = page.getByPlaceholder(/additional note/i)
  if (await noteField.isVisible()) {
    await noteField.fill('The submitted licence has an expiry date in the past.')
  }

  // Submit the rejection
  await page.getByRole('button', { name: /submit rejection/i }).click()

  // On success: toast (D-10) + company leaves the pending list (D-10)
  await expect(page.getByText(/rejected/i)).toBeVisible()
  await page.goto('/admin/verifications')
  await expect(page.getByText('PendingCo GmbH')).not.toBeVisible()
})

// VERIF-05 (route gate): non-HS user is redirected away from /admin
test('non-hs user redirected from /admin', async ({ page }) => {
  await signIn(page, NON_HS_EMAIL, NON_HS_PASSWORD)

  // Navigate directly to the admin verifications route
  await page.goto('/admin/verifications')

  // The server-component guard (/admin/layout.tsx) must redirect non-HS users to /
  // Wait for the redirect to complete
  await page.waitForURL((url) => !url.pathname.startsWith('/admin'), { timeout: 10_000 })

  // Confirm we are NOT on any /admin route
  expect(page.url()).not.toContain('/admin')
})
