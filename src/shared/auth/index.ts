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

// Verification gate (AUTH-01, D-01). The single app-layer policy for whether a
// caller may access external (cross-company) surfaces.
//
// Returns { blocked: false, reason: null } when the company is 'verified'.
// Returns { blocked: true, reason: 'pending'|'rejected'|'revoked' } for non-verified
//   companies — the CALLER decides the redirect target based on reason.
// Returns { blocked: true, reason: null } when the caller has no company yet —
//   this is the D-03 no-company bounce; reason:null signals "send to /onboarding".
//
// Mirrors the home/page.tsx pattern: !company_id → /onboarding is already the
// explicit no-company bounce there; this accessor keeps the same contract so
// layout guards can cover it with a single await + reason-switch.
//
// Do NOT add this check to proxy.ts (B7 lock — proxy stays thin, no DB lookups).
export async function requireVerified(): Promise<{
  blocked: boolean
  reason: 'pending' | 'rejected' | 'revoked' | null
}> {
  const person = await getCurrentPerson()

  // No person row → unauthenticated; the proxy handles /login redirect before
  // this runs, so this is defensive. Treat as blocked/no-company.
  if (!person) return { blocked: true, reason: null }

  // No company yet (half-onboarded) — the D-03 no-company bounce.
  if (!person.company_id) return { blocked: true, reason: null }

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('company')
    .select('verification_status')
    .eq('id', person.company_id)
    .maybeSingle()

  const status = company?.verification_status

  if (status === 'verified') return { blocked: false, reason: null }
  if (status === 'pending') return { blocked: true, reason: 'pending' }
  if (status === 'rejected') return { blocked: true, reason: 'rejected' }
  if (status === 'revoked') return { blocked: true, reason: 'revoked' }

  // Unknown or missing status — fail safe (treat as blocked, bounce to onboarding).
  return { blocked: true, reason: null }
}
