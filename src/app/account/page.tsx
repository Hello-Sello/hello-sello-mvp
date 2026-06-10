import { redirect } from 'next/navigation'
import { getMyProfile } from '@/modules/profile'
import { getCompanyProfile } from '@/modules/companies'
import { AccountClient } from './AccountClient'

// Server route: load the caller's profile + company, hand them to the client UI.
// Thin by design — all logic lives in the modules.
export default async function AccountPage() {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  const company = await getCompanyProfile()
  return <AccountClient profile={profile} company={company} />
}
