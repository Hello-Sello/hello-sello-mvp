/**
 * Single source of truth for the local Supabase service-role credentials used by
 * E2E fixtures that mutate the DB directly (bypassing RLS).
 *
 * The secret key ROTATES whenever the local stack is recreated, so it is never
 * hardcoded — that was the cause of the "all auth specs fail" key-rot. The running
 * stack owns its keys; we derive from it, in order:
 *   1. SUPABASE_SECRET_KEY env var (CI / explicit override), else
 *   2. parse `supabase status -o env` from the running local stack, else
 *   3. throw a clear "is the stack up?" error instead of a cryptic 401.
 *
 * We use the new-format SECRET_KEY (`sb_secret_…`), NOT the legacy SERVICE_ROLE_KEY
 * JWT the stack also emits — the upgraded GoTrue rejects HS256-signed JWTs
 * ("signing method HS256 is invalid"), so only the sb_secret_ key authenticates.
 */
import { execSync } from 'node:child_process'

export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'

function resolveServiceKey(): string {
  const fromEnv = process.env.SUPABASE_SECRET_KEY
  if (fromEnv) return fromEnv
  try {
    const out = execSync('supabase status -o env', { encoding: 'utf8' })
    const match = out.match(/^SECRET_KEY="(.+)"$/m)
    if (match) return match[1]
  } catch {
    /* fall through to the explicit error below */
  }
  throw new Error(
    'E2E: cannot resolve the local Supabase secret key. ' +
      'Run `supabase start`, or set SUPABASE_SECRET_KEY. ' +
      'The key rotates per stack, so it is intentionally not hardcoded.',
  )
}

/** Service-role key for the running local stack — bypasses RLS in fixtures. */
export const LOCAL_SERVICE_KEY = resolveServiceKey()
