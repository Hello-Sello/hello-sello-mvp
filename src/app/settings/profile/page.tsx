import { redirect } from 'next/navigation'
import { getMyProfile } from '@/modules/profile'
import { ProfileForm } from './ProfileForm'

// /settings/profile — the re-homed personal profile (was /account?tab=profile).
// Thin server route (mirrors account/page.tsx): load the profile in the module
// layer, hand it to the reused form. The /account → here 301 (next.config) lands
// on this route.
export default async function ProfileSettingsPage() {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  return <ProfileForm profile={profile} />
}
