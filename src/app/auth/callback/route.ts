import { NextResponse } from 'next/server'
import { createClient } from '@/shared/db/server'

// OAuth code-exchange Route Handler. The provider (Google / Azure) sends the
// browser here with a `?code=` after consent; we trade it for a session, which
// `createClient()`'s cookie adapter persists (PKCE verifier lives in the same
// cookie jar). Must be a Route Handler — Server Components cannot write cookies.
//
// `next` is attacker-controllable (it rides in the URL the provider returns to),
// so it is constrained to a same-origin relative path before any redirect. The
// canonical Supabase snippet omits this guard; without it `?next=//evil.com`
// would 302 the freshly-authenticated user off-site (open redirect).
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Behind a proxy/CDN (Vercel) the real host is in x-forwarded-host, not
      // `origin`; use it in prod so the redirect keeps the user on the app
      // domain. Localhost/cloud testing uses `origin` directly.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (!isLocalEnv && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    // Surface WHY the exchange failed (e.g. "Error getting user email from
    // external provider" when an Azure token carries no email claim). GoTrue
    // logs this too, but logging it here keeps OAuth bounce-backs diagnosable
    // from our own server logs instead of only the Supabase dashboard.
    console.error('[auth/callback] code exchange failed:', error.message)
  } else {
    // Provider returned an error instead of a code (e.g. consent denied). Never
    // let the bounce-to-login be silent — log the provider's reason.
    const providerError =
      searchParams.get('error_description') ?? searchParams.get('error')
    if (providerError) console.error('[auth/callback] provider error:', providerError)
  }

  // No code, or exchange failed → bounce to login with an error marker.
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
