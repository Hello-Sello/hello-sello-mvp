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
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  // origin builds the same-origin confirm link Supabase puts in the email; the
  // env fallback covers contexts where the origin header is absent (e.g. some
  // server-render paths).
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  // full_name rides in user metadata; the handle_new_user trigger reads it to set
  // the canonical display_name (and derive first/last for the vCard). company_id is
  // left NULL (Path-B) and set later at company setup (1c). emailRedirectTo points
  // the confirmation link at our /auth/confirm handler (then onward to onboarding).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
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

// Re-send the signup confirmation email (DEV-129). Mirrors signUp's emailRedirectTo
// exactly so the resent link lands on the same /auth/confirm → onboarding flow. The
// card's cooldown + GoTrue's send rate limits guard against spamming; on failure the
// message is returned for inline display.
export async function resendConfirmation(email: string): Promise<AuthState> {
  const supabase = await createClient()
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
  })
  return error ? { error: error.message } : {}
}

// Forgot-password result. `sent` flips true once the request completes so the page
// can swap in the neutral confirmation — it is true on EVERY outcome (anti-enumeration),
// so it never signals whether the address is registered.
export type ResetRequestState = { sent?: boolean }

// Forgot-password entry (ACCT-02 / D-07). Mails a recovery link that lands on the
// existing /auth/confirm handler (verifyOtp type=recovery) and forwards to
// /reset-password, where the set-password form runs with the recovery session.
//
// ANTI-ENUMERATION (T-10-04a): the action ALWAYS returns { sent: true } — never an
// error — so the page shows the same neutral "if an account exists, we sent a link"
// screen whether or not the address is registered. Any GoTrue error is logged
// server-side ONLY.
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get('email') ?? '')

  const supabase = await createClient()
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  // redirectTo mirrors signUp's emailRedirectTo shape: same-origin /auth/confirm,
  // then onward to /reset-password. The recovery email template (supabase/templates/
  // recovery.html) builds the link as ?token_hash=…&type=recovery&next=/reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  })
  if (error) {
    // Server-side only — do NOT leak whether the address exists.
    console.error('[requestPasswordReset]', error.message)
  }
  // Always the neutral screen, regardless of outcome.
  return { sent: true }
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
    options: {
      redirectTo: `${origin}/auth/callback?next=/onboarding`,
      // Azure/Outlook returns NO email claim under the default `openid` scope, so
      // exchangeCodeForSession fails with "Error getting user email from external
      // provider" and /auth/callback bounces the user back to /login. Explicitly
      // request email (+ profile for the display name). Google returns email under
      // its default scope, so it needs nothing extra. NOTE: personal Microsoft
      // accounts may still need the `email` optional claim added to the ID token in
      // the Azure app registration — the scope alone isn't always enough there.
      ...(provider === 'azure' ? { scopes: 'email profile' } : {}),
    },
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
