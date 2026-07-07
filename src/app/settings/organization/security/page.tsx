import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import { getCurrentUser } from '@/shared/auth'
import { getCompanyProfile } from '@/modules/companies'
import { deactivateCompany, reactivateCompany } from '@/app/settings/security/actions'
import { CompanyDeactivatePanel } from './CompanyDeactivatePanel'

/**
 * /settings/organization/security — the thin Organization Security tab (SET-01 D-06 /
 * SET-02 D-12). Runs inside organization/layout.tsx's Superadmin gate. In v1 it hosts
 * exactly ONE control: the reversible company-deactivate (org-wide MFA / SSO are
 * deferred — no matrix). This is the composition root that wires the 13-08
 * `deactivateCompany` / `reactivateCompany` actions into the (dumb + fed) panel.
 *
 * Reads the live deactivation flag so the panel shows the deactivate confirm or the
 * reactivate control; the deactivate_company / reactivate_company RPCs re-assert
 * has_permission server-side (the real boundary — the page gate is the belt).
 */
export default async function OrganizationSecurityPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const company = await getCompanyProfile()
  // getCompanyProfile omits deactivated_at — read it directly. RLS scopes this to the
  // caller's own company row.
  let deactivated = false
  if (company) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('company')
      .select('deactivated_at')
      .eq('id', company.id)
      .maybeSingle()
    deactivated = Boolean(data?.deactivated_at)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="px-1">
        <h1 className="text-lg font-bold text-ink">Company security</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Organization-wide controls. Thin in v1 — MFA enforcement and SSO come later.
        </p>
      </header>

      <CompanyDeactivatePanel
        companyName={company?.name ?? null}
        deactivated={deactivated}
        onDeactivate={deactivateCompany}
        onReactivate={reactivateCompany}
      />
    </div>
  )
}
