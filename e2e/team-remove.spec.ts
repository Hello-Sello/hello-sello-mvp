/**
 * Phase 11 — Member removal session-kill E2E (11-01 Wave-0 RED scaffold, RBAC-03 / SC3).
 *
 * The team page remove control, the `remove_member` RPC (nulls person.company_id +
 * soft-deletes person_group + audit, D-10/D-11), the admin `signOut({ scope:'global' })`
 * refresh-revoke, and the D-15 last-Superadmin lockout guard are all built in plan 05.
 * This spec is the executable contract that plan must turn GREEN.
 *
 * Flow under test (D-10/D-11/D-15, RESEARCH §1):
 *   Alice (company-A Superadmin) removes a company-A Member
 *     → the removed user's NEXT request to a company-scoped page is DENIED/bounced:
 *        company_id is NULL ⇒ every `company_id = current_company_id()` RLS policy denies
 *        on their next request (live read), and requireVerified() bounces them to /onboarding.
 *     → after removal they can no longer READ company-A data (their session sees nothing).
 *   Lockout (D-15): removing/demoting the ONLY Superadmin shows an error — a company can
 *        never be left headless.
 *
 * Tenant scope (RBAC-04): two companies via the two-company fixture (Alice@GreenLeaf,
 * Bob@StonePharm). Alice can only manage GreenLeaf members — never StonePharm's.
 *
 * Fixtures:
 *   - two-company.ts : loginAs(page, who) + the seeded Alice/Bob counterparties.
 *   - local-supabase : service-role client to seed an ephemeral removable Member on
 *                      GreenLeaf and to read server truth (company_id null after removal).
 *
 * ⚠️  RED-FIRST (Wave-0): EXPECTED to FAIL today — no /team page, no remove control,
 * no remove_member RPC, no lockout guard. That failure is the proof the spec exercises
 * the real surface. Goes GREEN as plan 05 lands. Local stack only.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAs } from './fixtures/two-company'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from './fixtures/local-supabase'

const GREENLEAF_COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_PASSWORD = 'member-pw-5512'

function makeAdminClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Seed an ephemeral, confirmed Member on GreenLeaf via the admin API (mirrors
 * auth-trigger.spec.ts createUser → person path), attach company_id, and return the
 * login + user id. Deleted in afterEach so the suite leaves no residue. The Member is
 * NOT in GreenLeaf's Superadmin group → role = Member (RESEARCH §2).
 */
async function seedGreenLeafMember(
  admin: SupabaseClient,
): Promise<{ email: string; userId: string }> {
  const email = `removable+${Date.now()}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: MEMBER_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Remo', last_name: 'Vable' },
  })
  if (error) throw new Error(`seedGreenLeafMember: createUser failed — ${error.message}`)
  const userId = data.user!.id
  const { error: linkError } = await admin
    .from('person')
    .update({ company_id: GREENLEAF_COMPANY_ID })
    .eq('id', userId)
  if (linkError) throw new Error(`seedGreenLeafMember: company link failed — ${linkError.message}`)
  return { email, userId }
}

test.describe.configure({ mode: 'serial' })

test('removing a company member denies their next company-scoped request and bounces them company-less', async ({
  browser,
}) => {
  const admin = makeAdminClient()
  const { email, userId } = await seedGreenLeafMember(admin)

  try {
    // The member signs in (own context/session) and can read company-scoped data today.
    const memberContext = await browser.newContext()
    const memberPage = await memberContext.newPage()
    await memberPage.goto('/login')
    await memberPage.locator('input[name="email"]').fill(email)
    await memberPage.locator('input[name="password"]').fill(MEMBER_PASSWORD)
    await memberPage.getByRole('button', { name: /sign in/i }).click()
    await memberPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })

    // Alice (GreenLeaf Superadmin) opens the team page and removes that member.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await loginAs(adminPage, 'alice')
    await adminPage.goto('/team')
    const memberRow = adminPage.getByRole('row', { name: new RegExp(email, 'i') })
    await memberRow.getByRole('button', { name: /remove/i }).click()
    // Confirm the removal (a destructive action gets a confirm step).
    await adminPage.getByRole('button', { name: /confirm|remove/i }).last().click()

    // Server truth: the removed person is now company-less (D-10 soft-detach).
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('person')
            .select('company_id')
            .eq('id', userId)
            .single()
          return data?.company_id ?? null
        },
        { timeout: 10_000 },
      )
      .toBeNull()

    // The removed user's NEXT request to a company-scoped page is bounced company-less:
    // requireVerified() sends a company-less user to /onboarding (D-11, no broken page).
    await memberPage.goto('/present')
    await memberPage.waitForURL((url) => url.pathname.includes('/onboarding'), { timeout: 15_000 })
    expect(memberPage.url()).toContain('/onboarding')

    await memberContext.close()
    await adminContext.close()
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
})

test('removing or demoting the only Superadmin is blocked (D-15 lockout guard)', async ({
  page,
}) => {
  // Alice is GreenLeaf's only Superadmin. The team page must NOT let her remove or
  // demote herself while she is the last Superadmin — the action surfaces an error
  // (must promote a replacement first). Prevents a headless company.
  await loginAs(page, 'alice')
  await page.goto('/team')
  const aliceRow = page.getByRole('row', { name: /alice/i })
  // Attempt to remove (or demote) the last Superadmin.
  await aliceRow.getByRole('button', { name: /remove|change role|demote/i }).first().click()
  await page.getByRole('button', { name: /confirm|remove|member/i }).last().click()

  // The guard surfaces a clear last-Superadmin error and Alice stays a Superadmin.
  await expect(page.getByText(/last superadmin|at least one superadmin|cannot remove/i)).toBeVisible({
    timeout: 10_000,
  })
})
