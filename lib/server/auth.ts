import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export interface AuthUser {
  id: string
  email?: string
  name: string
  role: string
}

let anonClient: ReturnType<typeof createClient> | null = null

function getAnonClient() {
  if (anonClient) return anonClient
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase URL or Anon Key env vars')
  anonClient = createClient(url, key, { auth: { persistSession: false } })
  return anonClient
}

export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new AuthError('Missing bearer token')

  const { data, error } = await getAnonClient().auth.getUser(token)
  if (error || !data.user) throw new AuthError('Invalid or expired token')

  const supaUser = data.user
  const name: string =
    supaUser.user_metadata?.name ??
    supaUser.user_metadata?.full_name ??
    (supaUser.email ? supaUser.email.split('@')[0] : null) ??
    supaUser.id

  return {
    id: supaUser.id,
    email: supaUser.email,
    name,
    role: supaUser.app_metadata?.role ?? 'employee',
  }
}

export class AuthError extends Error {}

export function unauthorized(msg = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 401 })
}

export function forbidden(msg = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 })
}

/**
 * Wrap a Next.js route handler with auth + error handling.
 * Returns 401 for auth failures, 500 for unexpected errors.
 */
export function withAuth(
  handler: (request: NextRequest, user: AuthUser, ctx?: unknown) => Promise<NextResponse>,
) {
  return async (request: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    try {
      const user = await requireAuth(request)
      return await handler(request, user, ctx)
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: 401 })
      }
      console.error('[api error]', e)
      const msg = e instanceof Error ? e.message : 'Internal server error'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}

/**
 * Wrap without requiring auth — still catches & formats errors.
 */
export function withHandler(
  handler: (request: NextRequest, ctx?: unknown) => Promise<NextResponse>,
) {
  return async (request: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    try {
      return await handler(request, ctx)
    } catch (e) {
      console.error('[api error]', e)
      const msg = e instanceof Error ? e.message : 'Internal server error'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}
