/**
 * Phase 12 — Path B (Join Existing Company) E2E spec.
 * Covers PATHB-01/02/03 across the three Path-B surfaces (UI-SPEC S1/S2/S3):
 *   S1 — onboarding fork → "Join an existing company" → search → confirm → request.
 *   S2 — a requester with a pending join_request lands on the "Request sent" screen.
 *   S3 — a Superadmin sees a "Pending requests" section on /team and approves/rejects.
 *
 * ⚠️  RED-FIRST (Wave-0): these tests are EXPECTED to FAIL today, by design — they
 * are the executable contract the later plans must turn GREEN. They use plain
 * naturally-failing `test()` blocks — never disabled/quarantined ones — matching
 * the codebase convention in e2e/admin-verification.spec.ts, so the failure is
 * honest and visible. What makes each fail today and which plan turns it GREEN:
 *   - "onboarding step0 join branch" — the start-step "Join an existing company"
 *     option is still a DISABLED <div> ("Coming soon", OnboardingStepper.tsx:452-458)
 *     and there is no search step. → GREEN in 12-03.
 *   - "join pending screen" — there is no S2 "Request sent" pending screen; a
 *     company-less person sees the create-company stepper. → GREEN in 12-03.
 *   - "team pending join approve" — /team has no "Pending requests" section and no
 *     approve/reject controls. → GREEN in 12-04.
 *
 * Cross-tenant isolation + atomic-approve CORRECTNESS is proven by the DB-probe
 * (supabase/tests/join_request_isolation_test.sql), not here — Assumption A5: the
 * local GoTrue `sb_secret_` admin-API caveat can partially block live-auth E2E, so
 * the security proof leans on the probe and these specs assert the UI flow + copy.
 *
 * Test titles MUST match the RESEARCH Test Map grep cases verbatim so the per-task
 * `npx playwright test -g "<case>"` commands resolve.
 *
 * Fixtures:
 *   - two-company.ts : loginAs(page, 'alice') — Alice is a GreenLeaf Superadmin
 *                      (founder→Superadmin backfill, Phase 11).
 *   - local-supabase : service-role client to seed a company-less requester +
 *                      a pending join_request for the S2/S3 contracts.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './fixtures/two-company'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from './fixtures/local-supabase'

// GreenLeaf — the company a requester asks to join, and where Alice is Superadmin.
const GREENLEAF_COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REQUESTER_PASSWORD = 'pathb-pw-7731'

function adminClient() {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Sign a freshly-created (company-less) requester in via the login form.
async function signInRequester(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(REQUESTER_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

// S1 (PATHB-01) — the onboarding start fork must offer BOTH options and the
// "Join an existing company" branch must be reachable (not a disabled "Coming
// soon" stub), landing on the "Find your company" search step.
test('onboarding step0 join branch', async ({ page, context }) => {
  await context.clearCookies()
  const admin = adminClient()
  const email = `pathb-fork+${Date.now()}@example.test`
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: REQUESTER_PASSWORD,
    email_confirm: true,
  })
  // company_id stays NULL → this user lands on /onboarding's start fork.
  expect(created.user?.id).toBeTruthy()

  await signInRequester(page, email)
  await page.goto('/onboarding')

  // Both fork options are present (verbatim UI-SPEC S1 copy).
  await expect(page.getByText('Create a new company')).toBeVisible()
  await expect(page.getByText('Join an existing company')).toBeVisible()

  // The Join option is an enabled control (today it is a disabled "Coming soon"
  // <div> — this click + the search heading is what FAILS until 12-03 lands).
  await page.getByRole('button', { name: /join an existing company/i }).click()
  await expect(page.getByRole('heading', { name: 'Find your company' })).toBeVisible()
})

// S2 (PATHB-03) — a company-less requester WITH a pending join_request lands on
// the "Request sent" pending screen (amber Pending badge + Withdraw + create-instead),
// NOT the create-company stepper.
test('join pending screen', async ({ page, context }) => {
  await context.clearCookies()
  const admin = adminClient()
  const email = `pathb-pending+${Date.now()}@example.test`
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: REQUESTER_PASSWORD,
    email_confirm: true,
  })
  const requesterId = created.user?.id
  expect(requesterId).toBeTruthy()

  // Seed a PENDING request from this company-less requester to GreenLeaf so
  // /onboarding must render the S2 pending screen (D-10 branch).
  await admin.from('join_request').insert({
    requester_person_id: requesterId,
    target_company_id: GREENLEAF_COMPANY_ID,
    status: 'pending',
    note: 'E2E pending fixture',
  })

  await signInRequester(page, email)
  await page.goto('/onboarding')

  // S2 contract (verbatim UI-SPEC copy) — NOT the create stepper.
  await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible()
  await expect(page.getByText('Pending')).toBeVisible()
  await expect(page.getByRole('button', { name: /withdraw request/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /create my own company instead/i })).toBeVisible()
})

// S3 (PATHB-02) — a Superadmin sees the "Pending requests" section on /team and
// Approve/Reject act on a queued request.
test('team pending join approve', async ({ page, context }) => {
  await context.clearCookies()
  const admin = adminClient()
  const email = `pathb-queue+${Date.now()}@example.test`
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: REQUESTER_PASSWORD,
    email_confirm: true,
  })
  const requesterId = created.user?.id
  expect(requesterId).toBeTruthy()

  // A pending request to Alice's company so the queue is non-empty.
  await admin.from('join_request').insert({
    requester_person_id: requesterId,
    target_company_id: GREENLEAF_COMPANY_ID,
    status: 'pending',
    note: 'E2E queue fixture',
  })

  // Alice is a GreenLeaf Superadmin (Phase 11 backfill).
  await loginAs(page, 'alice')
  await page.goto('/team')

  // S3 contract (verbatim UI-SPEC copy): the section exists with Approve/Reject.
  await expect(page.getByRole('heading', { name: 'Pending requests' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
})
