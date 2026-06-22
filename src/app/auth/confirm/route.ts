import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/shared/db/server'

// Email-confirmation Route Handler. The confirm-signup email links here with a
// `?token_hash` + `?type`; `verifyOtp` validates the single-use OTP and sets the
// session cookies. Must be a Route Handler so the cookie write lands.
//
// `next` is attacker-controllable (it sits in the email link / URL), so it is
// constrained to a same-origin relative path before any redirect — same
// open-redirect guard as /auth/callback. Supabase enforces OTP single-use +
// expiry, so replay is handled by the verify call itself.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = safeNext(searchParams.get('next'))

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // Missing token/type, or verification failed → bounce to login with a marker.
  return NextResponse.redirect(`${origin}/login?error=confirm`)
}
