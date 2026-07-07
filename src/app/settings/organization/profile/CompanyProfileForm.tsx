'use client'

import { VerifiedBadge } from '@/shared/ui/VerifiedBadge'
import { BrandingEditForm } from '@/app/present/BrandingEditForm'
import type { CompanyProfile } from '@/modules/companies'

/**
 * Re-homes AccountClient's `CompanyForm` shape (VerifiedBadge + BrandingEditForm) onto the
 * /settings/organization/profile route — moved, not rebuilt (D-04). BrandingEditForm is a
 * client component whose required `onDirty` prop is a function, so it can't be mounted
 * straight from the server page; this thin client boundary supplies it. On a standalone
 * route there's no tab/back navigation to guard, so `onDirty` is a no-op — BrandingEditForm
 * owns its own Save button + "Saved" feedback (the explicit save affordance).
 */
export function CompanyProfileForm({ company }: { company: CompanyProfile }) {
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <VerifiedBadge status={company.verificationStatus} variant="pill" />
      </div>
      <BrandingEditForm company={company} onDirty={() => {}} />
    </>
  )
}
