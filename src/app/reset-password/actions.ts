'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import type { AuthState } from '@/app/(auth)/actions'

// Set-new-password (ACCT-02 / D-07). Runs WITH the recovery session that
// /auth/confirm set when the user clicked the recovery link, so updateUser
// applies to that already-authenticated user. Same { error? } / redirect-on-
// success contract as signIn/signUp. On success we send the user back to /login
// with ?reset=ok so they re-authenticate with the new password.
export async function setNewPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  redirect('/login?reset=ok')
}
