import { createClient } from '@/shared/db/server'
import { getCurrentCompanyId } from '@/shared/auth'
import type { Database } from '@/shared/db'

type CompanyUpdate = Database['public']['Tables']['company']['Update']

// The company-profile module. One door for reading/writing the caller's company
// details (the soft, editable fields). Name + country are set at onboarding and
// treated as identity here (read-only); the editable fields are the rest.

export type CompanyProfile = {
  id: string
  name: string
  country: string
  city: string
  address: string
  description: string
  primaryProducts: string
  website: string
  tagline: string
  logoPath: string | null
  verificationStatus: string
}

export type CompanyFields = {
  address: string
  description: string
  primaryProducts: string
  website: string
  tagline: string
  city: string        // D-02 — city for Discover "City, Country" location column
  logoPath: string    // D-07 — path string; bytes uploaded client-direct to shop-media
}

/** The caller's company profile, shaped for the UI. null when they have none. */
export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const companyId = await getCurrentCompanyId()
  if (!companyId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('company')
    .select('id, name, country, city, address, description, primary_products, website, tagline, logo_path, verification_status')
    .eq('id', companyId)
    .maybeSingle()
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    country: data.country ?? '',
    city: data.city ?? '',
    address: data.address ?? '',
    description: data.description ?? '',
    primaryProducts: data.primary_products ?? '',
    website: data.website ?? '',
    tagline: data.tagline ?? '',
    logoPath: data.logo_path,
    verificationStatus: data.verification_status,
  }
}

/**
 * THE single writer for the company's editable profile fields. Accepts a partial
 * set, so onboarding (a subset) and the account page (the full set) share one
 * writer without clobbering unsent fields. RLS gates the UPDATE to company members.
 */
export async function updateCompanyProfile(fields: Partial<CompanyFields>): Promise<{ error?: string }> {
  const companyId = await getCurrentCompanyId()
  if (!companyId) return { error: 'No company in session.' }

  // Build the patch from only the fields the caller actually provided.
  const cols: Record<keyof CompanyFields, string> = {
    address: 'address',
    description: 'description',
    primaryProducts: 'primary_products',
    website: 'website',
    tagline: 'tagline',
    city: 'city',           // D-02
    logoPath: 'logo_path',  // D-07 — single writer; bytes uploaded client-direct
  }
  const patch: CompanyUpdate = {}
  const view = patch as Record<string, string | null>
  for (const key of Object.keys(cols) as (keyof CompanyFields)[]) {
    const v = fields[key]
    if (v !== undefined) view[cols[key]] = v.trim() || null
  }
  if (Object.keys(patch).length === 0) return {}

  const supabase = await createClient()
  const { error } = await supabase.from('company').update(patch).eq('id', companyId)
  return error ? { error: error.message } : {}
}
