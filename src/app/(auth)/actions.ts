'use server'

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
  // first_name / last_name ride in user metadata; the handle_new_user trigger
  // reads them to fill the person row. company_id is left NULL (Path-B) and set
  // later at company setup (1c).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName, last_name: lastName } },
  })
  if (error) return { error: error.message }

  // Decided flow: signup -> email-verification screen -> onboarding. Email
  // confirmation is OFF in v0, so the user already has a session here; the
  // verify screen is a simulated step ("I've verified" just advances).
  redirect('/verify-email')
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
