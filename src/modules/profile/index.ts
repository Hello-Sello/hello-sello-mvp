import { createClient } from '@/shared/db/server'

// The person-identity module. The ONE place that reads/writes a person's profile
// columns, so onboarding, the account page, the bottom-left card, and the public
// page all go through the same door. Callers never see the column / links shape.

export type MyProfile = {
  id: string
  displayName: string
  title: string
  phone: string
  language: string
  linkedin: string
  avatarPath: string | null
  avatarUrl: string | null
  email: string
  publicHandle: string | null
  companyId: string | null
}

export type ProfileFields = {
  displayName: string
  title: string
  phone: string
  language: string
  linkedin: string
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Give the person a unique `public_handle` if they don't have one yet (the
 * migration backfilled existing rows, but new signups don't get one until they
 * first save a profile). Tries `slug`, then `slug-2`, `slug-3`… on collision —
 * the DB unique index is the source of truth.
 */
async function ensureHandle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  displayName: string,
): Promise<void> {
  const { data } = await supabase.from('person').select('public_handle').eq('id', userId).maybeSingle()
  if (data?.public_handle) return
  const base = slugify(displayName) || 'user'
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { error } = await supabase.from('person').update({ public_handle: candidate }).eq('id', userId)
    if (!error) return // success
    if (error.code !== '23505') return // not a uniqueness clash — give up quietly
  }
}

// `links` is a small open jsonb bag; today it only carries LinkedIn.
function linkedinFrom(links: unknown): string {
  if (links && typeof links === 'object' && 'linkedin' in links) {
    const v = (links as Record<string, unknown>).linkedin
    return typeof v === 'string' ? v : ''
  }
  return ''
}

/** The signed-in person's profile, shaped for the UI. null when signed out. */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('person')
    .select('id, display_name, first_name, last_name, title, phone, language, links, avatar_path, public_handle, company_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!data) return null

  const avatarUrl = data.avatar_path
    ? supabase.storage.from('avatars').getPublicUrl(data.avatar_path).data.publicUrl
    : null

  return {
    id: data.id,
    displayName: data.display_name ?? `${data.first_name} ${data.last_name}`,
    title: data.title ?? '',
    phone: data.phone ?? '',
    language: data.language ?? '',
    linkedin: linkedinFrom(data.links),
    avatarPath: data.avatar_path,
    avatarUrl,
    email: user.email ?? '',
    publicHandle: data.public_handle,
    companyId: data.company_id,
  }
}

/**
 * THE single writer for a person's own profile columns. RLS (`person_update`:
 * id = auth.uid()) is the security floor — this only ever touches the caller's
 * own row. Empty strings are stored as NULL so "unset" is unambiguous.
 */
export async function updateMyProfile(fields: ProfileFields): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const linkedin = fields.linkedin.trim()
  const { error } = await supabase
    .from('person')
    .update({
      display_name: fields.displayName.trim() || null,
      title: fields.title.trim() || null,
      phone: fields.phone.trim() || null,
      language: fields.language.trim() || null,
      links: linkedin ? { linkedin } : {},
    })
    .eq('id', user.id)
  if (error) return { error: error.message }

  await ensureHandle(supabase, user.id, fields.displayName)
  return {}
}

/**
 * Record the storage path of a freshly uploaded avatar. The upload itself is
 * client-direct to the public `avatars` bucket (dodges the Server-Action body
 * limit); the server only stores the pointer.
 */
export async function setMyAvatarPath(path: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('person').update({ avatar_path: path }).eq('id', user.id)
  return error ? { error: error.message } : {}
}

// ---- Public profile (the /c/<handle> page) ---------------------------------

export type PublicProfile = {
  handle: string
  displayName: string
  title: string
  avatarUrl: string | null
  phone: string
  linkedin: string
  email: string
  company: {
    name: string
    tagline: string
    about: string
    products: string
    country: string
    website: string
  } | null
}

/**
 * Read a profile by its public handle for the anonymous-facing page. Goes
 * through the `get_public_profile` SECURITY DEFINER RPC, which returns ONLY the
 * curated business-card fields — the person table itself stays closed to anon.
 */
// Row shape returned by the get_public_profile RPC. Typed here (not via the
// generated Database types) so the call stays typed without re-generating the
// whole types file; the shape is fixed by the migration that defines the function.
type PublicRow = {
  display_name: string | null
  title: string | null
  avatar_path: string | null
  phone: string | null
  links: unknown
  email: string | null
  company_name: string | null
  company_tagline: string | null
  company_about: string | null
  company_products: string | null
  company_country: string | null
  company_website: string | null
}

export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
  const supabase = await createClient()
  // Call as a method (keeps `this` bound); name/result cast so we don't need to
  // regenerate the whole Database types just for this one RPC.
  const res = (await supabase.rpc('get_public_profile' as never, { p_handle: handle } as never)) as unknown as {
    data: PublicRow[] | null
    error: { message: string } | null
  }
  const { data, error } = res
  if (error || !data || data.length === 0) return null
  const r = data[0]

  const avatarUrl = r.avatar_path
    ? supabase.storage.from('avatars').getPublicUrl(r.avatar_path).data.publicUrl
    : null

  return {
    handle,
    displayName: r.display_name ?? '',
    title: r.title ?? '',
    avatarUrl,
    phone: r.phone ?? '',
    linkedin: linkedinFrom(r.links),
    email: r.email ?? '',
    company: r.company_name
      ? {
          name: r.company_name,
          tagline: r.company_tagline ?? '',
          about: r.company_about ?? '',
          products: r.company_products ?? '',
          country: r.company_country ?? '',
          website: r.company_website ?? '',
        }
      : null,
  }
}

/** Build a vCard 3.0 (the format iOS + Android both read) for "Save contact". */
export function buildVCard(p: PublicProfile): string {
  const [first, ...rest] = p.displayName.split(' ')
  const last = rest.join(' ')
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last};${first};;;`,
    `FN:${p.displayName}`,
    p.title && `TITLE:${p.title}`,
    p.company && `ORG:${p.company.name}`,
    p.email && `EMAIL;TYPE=WORK:${p.email}`,
    p.phone && `TEL;TYPE=WORK,VOICE:${p.phone}`,
    p.company?.website && `URL:${p.company.website}`,
    p.linkedin && `X-SOCIALPROFILE;TYPE=linkedin:${p.linkedin}`,
    'END:VCARD',
  ].filter(Boolean)
  return lines.join('\r\n')
}
