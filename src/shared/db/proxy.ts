import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database.types'

// The session-refresh proxy (deferred from F5). Runs on every matched request:
// refreshes the auth token and gates routes. Server Components can't write
// cookies, so this is the one place the rotated session cookie is persisted.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // Mirror the rotated cookies onto both the inbound request (so the rest
        // of this request sees the fresh session) and the response (so the
        // browser stores it). Same shape as shared/db/server.ts.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() validates the JWT signature against the project's published keys
  // and rotates the token if needed. It is the only session check safe to trust
  // server-side — getSession() trusts the cookie as-is and must not gate routes.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const path = request.nextUrl.pathname
  const isAuthRoute = path === '/login' || path === '/signup'
  // Public routes — viewable by anyone, signed in or not. `/c/<handle>` is the
  // public profile page opened by scanning the QR. The three auth-flow routes
  // are reached by signed-OUT users mid-flow and must not bounce to /login:
  //   /auth/callback — OAuth provider returns here before the session exists
  //   /auth/confirm  — the email-confirmation link lands here pre-session
  //   /verify-email  — with email confirmation ON there is no session on this
  //                    "check your inbox" screen post-signup (was implicitly
  //                    reachable only because confirmation was OFF).
  const isPublicRoute =
    // EXACT match on '/' — never path.startsWith('/'), which would match every
    // path and allowlist the entire app to signed-out users (V4 / T-09-02).
    path === '/' ||              // public landing (LAND-01)
    path === '/impressum' ||     // legal — Impressum (§5 DDG)
    path === '/datenschutz' ||   // legal — Datenschutzerklärung
    path === '/agb' ||           // legal — AGB
    path === '/sella' ||         // design preview — static dummy dashboard, no auth/backend
    path.startsWith('/c/') ||
    path === '/auth/callback' ||
    path === '/auth/confirm' ||
    path === '/verify-email' ||
    // Reached signed-OUT to request a recovery link (ACCT-02 / D-09). ONLY this
    // route is public; the set-password page stays GATED, because by the time a
    // user reaches it they hold a recovery session (set at /auth/confirm), so the
    // gate is already satisfied. Allowlisting the set-password page would let any
    // signed-out visitor open it (Pitfall 3).
    path === '/forgot-password'

  // Signed-out users may only reach the auth + public routes.
  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Signed-in users have no reason to see sign-in / sign-up.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
