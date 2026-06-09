import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

// Supabase client for Client Components. @supabase/ssr makes this a singleton,
// so calling it repeatedly returns the same instance.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
