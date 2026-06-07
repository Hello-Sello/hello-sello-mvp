import { type NextRequest } from 'next/server'
import { updateSession } from '@/shared/db/proxy'

// Next 16 renamed middleware -> proxy. This runs the Supabase session refresh +
// route gate on every matched request. Keep it thin; the logic lives in
// shared/db/proxy.ts so it sits next to the other Supabase client builders.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Run on everything except static assets and image files — those never touch
  // the session, and skipping them keeps the refresh off the hot asset path.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
