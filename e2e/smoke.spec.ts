import { test, expect } from '@playwright/test'

// Slice 0 smoke test — proves the harness runs and the app is reachable.
// Asserts the login page renders its email field + sign-in button.
test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})
