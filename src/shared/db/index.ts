// Public types for the db module. The clients themselves live in ./client
// (browser) and ./server (server) and are imported directly from there — they
// cannot share one barrel because server.ts imports next/headers (server-only).
import type { Database } from '@/types/database.types'

export type { Database }

// Shorthand for a table's Row type, e.g. Tables<'person'>.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
