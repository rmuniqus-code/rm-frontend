/**
 * Server-side Supabase client (service role).
 *
 * BYPASSES Row Level Security. Use ONLY in:
 *   - API routes (app/api/**)
 *   - Server actions
 *   - Background jobs / ingestion
 *
 * NEVER import this from a Client Component or pass the returned
 * client to the browser. The service role key has full DB access.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Check .env.local.'
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
