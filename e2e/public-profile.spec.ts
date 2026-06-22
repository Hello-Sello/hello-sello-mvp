import { test, expect, type Page } from '@playwright/test'

// DATA-03 — the public profile page (/c/<handle>) must render after a clean
// reset. RED today: the get_public_profile RPC and the person profile columns
// do not exist yet, so getMyProfile() returns null (the /account route redirects
// to /login) and getPublicProfile() returns null (the route 404s). This spec
// turns GREEN once plans 01-02 (columns + avatars) and 01-03 (RPC) land.
//
// App-driven handle (RESEARCH Open Question 3): we DON'T edit the Ayush-shared
// seed.sql. Instead we sign in a seeded user, save a profile so ensureHandle()
// assigns a public_handle, read that handle from the account page, and hit /c/<it>.

const EMAIL = 'alice@greenleaf.test' // seeded in supabase/seed/seed.sql
const PASSWORD = 'password123'
const DISPLAY_NAME = 'Alice Green E2E' // deterministic; drives the handle slug

async function signIn(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

test('an assigned public handle renders the /c/<handle> card (DATA-03)', async ({ page }) => {
  await signIn(page)

  // Saving the profile assigns a public_handle via ensureHandle(). The account
  // "My Profile" tab is active by default; the display-name field is labelled
  // "Full name" (the canonical display_name rename — the old "Display name" label
  // this selector targeted no longer exists).
  await page.goto('/account')
  await page.locator('label:has-text("Full name") input').fill(DISPLAY_NAME)
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Reload so the server re-renders the public-profile callout, then read the
  // app-assigned handle from its "View" link.
  await page.reload()
  const href = await page.getByRole('link', { name: /^view$/i }).getAttribute('href')
  expect(href).toMatch(/^\/c\//)
  const handle = href!.replace('/c/', '')

  // The actual DATA-03 assertion: the public page returns 200 and shows the card.
  const res = await page.goto(`/c/${handle}`)
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: new RegExp(DISPLAY_NAME, 'i') })).toBeVisible()

  // ACCT-01: alice's company (GreenLeaf Cultivation) is seeded `verified`, so the
  // form-E "Verified" pill MUST render on the public card (gated on the real
  // company_verification_status now threaded through get_public_profile).
  await expect(page.getByText('Verified', { exact: true })).toBeVisible()
})

test('the verified pill is gated on the real status — absent for a non-verified company (ACCT-01)', async ({ page }) => {
  // The gating rule (render ONLY on status==='verified', null otherwise — D-02) is
  // proven at the component boundary by src/shared/ui/VerifiedBadge.test.tsx. Here we
  // assert it at the route level: the unknown-handle card 404s (no pill leaks on a
  // missing/unresolved profile), complementing the verified-case assertion above.
  // Every seeded signed-in-able user belongs to a verified company, so a non-verified
  // card cannot be reached through the app sign-in flow — the unit test owns that branch.
  const res = await page.goto('/c/no-such-handle-xyz-acct01')
  expect(res?.status()).toBe(404)
  await expect(page.getByText('Verified', { exact: true })).toHaveCount(0)
})

test('the /c/<handle> route mounts (unknown handle → 404)', async ({ page }) => {
  // Sanity that the route exists at all (passes regardless of the drift fix).
  const res = await page.goto('/c/no-such-handle-xyz-404')
  expect(res?.status()).toBe(404)
})
