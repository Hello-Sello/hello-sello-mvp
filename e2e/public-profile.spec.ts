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

  // Saving the profile assigns a public_handle via ensureHandle().
  await page.goto('/account')
  await page.locator('label:has-text("Display name") input').fill(DISPLAY_NAME)
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
})

test('the /c/<handle> route mounts (unknown handle → 404)', async ({ page }) => {
  // Sanity that the route exists at all (passes regardless of the drift fix).
  const res = await page.goto('/c/no-such-handle-xyz-404')
  expect(res?.status()).toBe(404)
})
