/**
 * Browser-side Supabase client.
 *
 * Uses the public anon key. All queries through this client are
 * subject to Row Level Security (RLS) policies defined in
 * supabase/schema.sql section 13.
 *
 * For server-side ingestion that needs to bypass RLS, use
 * getSupabase() from lib/ingestion/ingest.ts which uses the
 * service role key (server-only).
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Add them to .env.local — see .env.example for the template.'
  )
}

export const supabase = createClient(url, anonKey)
