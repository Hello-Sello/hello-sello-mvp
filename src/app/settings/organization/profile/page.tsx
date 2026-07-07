import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/shared/auth'
import { getCompanyProfile } from '@/modules/companies'
import { CompanyProfileForm } from './CompanyProfileForm'

/**
 * /settings/organization/profile — the re-homed company-profile edit (SET-01, D-04).
 *
 * Thin server route: load the caller's company, hand it to the reused BrandingEditForm
 * (via CompanyProfileForm) — the SAME form + `saveCompanyProfile` writer AccountClient's
 * Company tab uses (D-09: one form, one writer, no drift). `saveCompanyProfile` is already
 * Superadmin-gated (`has_permission('company.edit_profile')`); the org-layout gate is the
 * belt over it. Runs inside organization/layout.tsx, so a Member never reaches this route.
 */
export default async function OrganizationProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const company = await getCompanyProfile()

  return (
    <div className="flex flex-col gap-4">
      <header className="px-1">
        <h1 className="text-lg font-bold text-ink">Company profile</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your company details, shown on your public profile and to partners.
        </p>
      </header>

      <section className="glass-strong rounded-3xl p-6 md:p-7">
        {company ? (
          <CompanyProfileForm company={company} />
        ) : (
          <p className="text-sm text-ink-muted">
            You&apos;re not linked to a company yet. Finish onboarding to set one up.
          </p>
        )}
      </section>
    </div>
  )
}
