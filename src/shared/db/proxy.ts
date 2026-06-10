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
  // NOTE: `/prototype` is a THROWAWAY public allowance for the QR-card design
  // prototype — exempt from BOTH gates (any visitor, signed-in or not, can view
  // it). Remove together with src/app/prototype when the design is chosen.
  const isPublicRoute = path.startsWith('/prototype')

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
