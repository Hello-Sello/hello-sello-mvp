import { redirect } from 'next/navigation'
import { getMyProfile } from '@/modules/profile'
import { getCompanyProfile } from '@/modules/companies'
import { SettingsNav } from './SettingsNav'

/**
 * The persistent /settings shell (SET-01, D-01/D-02). A server component that
 * loads the caller's name + company for the sidebar header, then renders the
 * settings sidebar beside the active sub-route — one home, deep-linkable, every
 * setting one click away.
 *
 * The AUTH gate is the proxy's job (`/settings/*` is gated-by-default, no
 * allowlist entry — B7 lock); this redirect is only a defensive floor mirroring
 * account/page.tsx. The Organization group is rendered in the sidebar but its
 * subtree is Superadmin-gated in organization/layout.tsx (13-10).
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  const company = await getCompanyProfile()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-1 md:flex-row md:gap-6 md:py-2">
      <SettingsNav displayName={profile.displayName} companyName={company?.name ?? null} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
