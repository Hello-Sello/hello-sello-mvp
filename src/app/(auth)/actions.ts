'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'

// Returned to the form via useActionState. `error` is the message to show inline;
// success never returns (the action redirects, which throws NEXT_REDIRECT).
export type AuthState = { error?: string }

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  redirect('/')
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const firstName = String(formData.get('first_name') ?? '').trim()
  const lastName = String(formData.get('last_name') ?? '').trim()
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  // origin builds the same-origin confirm link Supabase puts in the email; the
  // env fallback covers contexts where the origin header is absent (e.g. some
  // server-render paths).
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  // first_name / last_name ride in user metadata; the handle_new_user trigger
  // reads them to fill the person row. company_id is left NULL (Path-B) and set
  // later at company setup (1c). emailRedirectTo points the confirmation link
  // at our /auth/confirm handler (then onward to onboarding).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: `${origin}/auth/confirm?next=/onboarding`,
    },
  })
  if (error) return { error: error.message }

  // Decided flow: signup -> email-verification screen -> onboarding. Email
  // confirmation is now ON, so signUp returns NO session — do not assume one.
  // Pass the email via the URL so the verify ("check your inbox") screen can
  // show it; the user advances by clicking the confirmation link.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`)
}

// One provider-agnostic OAuth entry for both buttons: Google = 'google',
// Outlook = 'azure' (CONTEXT lock — do NOT split into two actions). signInWithOAuth
// returns the provider's authorize URL; we server-redirect the browser to it.
// redirectTo MUST be the app's own /auth/callback (NOT the Supabase project URL,
// which is what's registered in the provider consoles).
export async function signInWithProvider(
  provider: 'google' | 'azure',
): Promise<void> {
  const supabase = await createClient()
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback?next=/onboarding` },
  })
  if (error) redirect('/login?error=oauth')
  if (data.url) redirect(data.url)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  // scope: 'local' clears this browser's session cookies without a server-side
  // revoke round-trip. The button must always log the user out locally, even if
  // the remote revoke would fail (expired/invalid session), so we don't gate the
  // redirect on a network call that can error.
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
