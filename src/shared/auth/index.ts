import { createClient } from '@/shared/db/server'
import type { Tables } from '@/shared/db'

// Who is signed in. getUser() revalidates the JWT with the auth server, which is
// safer on the server than getSession() (the latter trusts the cookie as-is).
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// The signed-in person's row. person.id === auth.uid(), and RLS lets a user read
// their own row, so this resolves the app-level identity behind the auth user.
export async function getCurrentPerson(): Promise<Tables<'person'> | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('person')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  return data
}

// THE single accessor for the caller's company. Returns null when the user has no
// company yet (the sign-in -> company-setup window); RLS fails safe on a null
// company_id, so a company-less user sees only their own rows. (Path-B invariant.)
export async function getCurrentCompanyId(): Promise<string | null> {
  const person = await getCurrentPerson()
  return person?.company_id ?? null
}
