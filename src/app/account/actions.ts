'use server'

import { revalidatePath } from 'next/cache'
import { updateMyProfile, setMyAvatarPath, type ProfileFields } from '@/modules/profile'
import { updateCompanyProfile, getCompanyProfile, type CompanyFields } from '@/modules/companies'
import { createClient } from '@/shared/db/server'

// Thin server actions over the modules — the account UI calls these; the modules
// own the rules and storage shape.

export async function saveMyProfile(fields: ProfileFields) {
  const r = await updateMyProfile(fields)
  if (!r.error) revalidatePath('/account')
  return r
}

export async function saveCompanyProfile(fields: Partial<CompanyFields>) {
  const r = await updateCompanyProfile(fields)
  if (!r.error) {
    // Propagate branding edits to every surface that shows company logo / name / city.
    // Dynamic routes must pass 'page' type — literals must NOT (Pitfall 4: silent no-op).
    revalidatePath('/account')
    revalidatePath('/present')
    revalidatePath('/home')
    revalidatePath('/discover')
    revalidatePath('/discover/[id]', 'page')
    revalidatePath('/c/[handle]', 'page')
  }
  return r
}

export async function saveAvatar(path: string) {
  const r = await setMyAvatarPath(path)
  if (!r.error) revalidatePath('/account')
  return r
}

/**
 * Server reader for the TopBar — returns the logged-in company's name + logo URL.
 * Mirror of account-card.ts::getAccountCard; used by TopBar via the client-read
 * useEffect pattern (AppShell is "use client", so TopBar cannot be async-server).
 */
export async function getCompanyChrome(): Promise<{ name: string; logoUrl: string | null } | null> {
  const company = await getCompanyProfile()
  if (!company) return null

  let logoUrl: string | null = null
  if (company.logoPath) {
    const supabase = await createClient()
    logoUrl = supabase.storage.from('shop-media').getPublicUrl(company.logoPath).data.publicUrl
  }

  return { name: company.name, logoUrl }
}
