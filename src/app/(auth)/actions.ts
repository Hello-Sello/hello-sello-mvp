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

  // A fresh signup has no company yet -> route to onboarding, not the app.
  redirect('/onboarding')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
