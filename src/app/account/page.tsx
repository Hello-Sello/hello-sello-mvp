import { redirect } from 'next/navigation'
import { getMyProfile } from '@/modules/profile'
import { getCompanyProfile } from '@/modules/companies'
import { createClient } from '@/shared/db/server'
import { AccountClient } from './AccountClient'

// Server route: load the caller's profile + company, hand them to the client UI.
// Thin by design — all logic lives in the modules.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  const company = await getCompanyProfile()

  // Pending email-change state (ACCT-03 / D-12): drive the "confirmation sent" UX off
  // `auth.users.new_email`, not a strict two-click assumption. With double-confirm,
  // `new_email` is set the moment a change is requested and clears once the new address
  // confirms (and `email` flips). The inequality guard avoids showing a stale-equal value.
  const { data: { user } } = await createClient().then((c) => c.auth.getUser())
  const pendingEmail = user?.new_email && user.email !== user.new_email ? user.new_email : null

  const { tab } = await searchParams
  const initialTab = tab === 'company' || tab === 'settings' ? tab : 'profile'
  return <AccountClient profile={profile} company={company} pendingEmail={pendingEmail} initialTab={initialTab} />
}
