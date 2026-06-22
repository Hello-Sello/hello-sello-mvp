import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Server-ONLY service-role Supabase admin client (D-17).
 *
 * `import 'server-only'` is the guardrail: Next's bundler hard-fails the build if
 * this module is ever pulled into a client bundle, so the secret key can never
 * reach the browser (T-11-09). The key is `SUPABASE_SECRET_KEY` (sb_secret_…),
 * deliberately NOT `NEXT_PUBLIC_` — making it impossible to expose publicly.
 *
 * ⚠ This client BYPASSES row-level security and exposes `auth.admin.*`. Its blast
 * radius is intentionally tiny: only the team invite (`inviteUserByEmail`) and
 * member-removal (`admin.signOut`) server actions may import it. Do not reference
 * it from any component, loader, or general-purpose query path — use the
 * user-scoped client in `./server.ts` everywhere else, so RLS stays the authz
 * boundary by default.
 *
 * Uses `@supabase/supabase-js` (not `@supabase/ssr`): there is no user session or
 * cookie to read — this client acts as the service role, not as a signed-in user.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
