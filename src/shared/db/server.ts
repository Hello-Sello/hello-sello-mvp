import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

// Supabase client for Server Components / Route Handlers / Server Actions.
// Reads the user's session from cookies, so every query runs under that user's
// row-level security — the multi-tenant isolation guarantee lives in the DB.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll was called from a Server Component, which cannot write
            // cookies. Safe to ignore once the auth-refresh proxy (auth-screens
            // phase 1b) refreshes the session in middleware instead.
          }
        },
      },
    },
  )
}
