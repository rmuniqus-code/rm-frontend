import { NextRequest, NextResponse } from 'next/server'
import {
  verifyToken,
  extractUserFromClaims,
  decodePublishableKey,
  isPublishableKey,
  jwksUriFor,
} from '@ai-universe/auth-node'

export interface AuthUser {
  id: string
  email?: string
  name: string
  role: string
}

export class AuthError extends Error {}

// ─── Config resolution ─────────────────────────────────────────────────────────

interface ResolvedConfig {
  issuer: string
  clientId: string
  jwksUri: string
}

let resolvedConfig: ResolvedConfig | null = null

function getConfig(): ResolvedConfig {
  if (resolvedConfig) return resolvedConfig

  const pk = process.env.NEXT_PUBLIC_AIU_PUBLISHABLE_KEY ?? ''
  if (!isPublishableKey(pk)) {
    throw new AuthError(
      'Missing or invalid NEXT_PUBLIC_AIU_PUBLISHABLE_KEY. ' +
        'Set this env var to a valid aiu_pk_… publishable key.',
    )
  }

  const decoded = decodePublishableKey(pk)
  resolvedConfig = {
    issuer: decoded.issuer,
    clientId: decoded.clientId,
    jwksUri: jwksUriFor(decoded.issuer),
  }
  return resolvedConfig
}

// ─── requireAuth ───────────────────────────────────────────────────────────────

export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new AuthError('Missing bearer token')

  const cfg = getConfig()
  const payload = await verifyToken(token, {
    issuer: cfg.issuer,
    jwksUri: cfg.jwksUri,
  }).catch(() => {
    throw new AuthError('Invalid or expired token')
  })

  const platformUser = extractUserFromClaims(payload, cfg.clientId)

  return {
    id: platformUser.userId,
    email: platformUser.email || undefined,
    name: platformUser.name ?? platformUser.email ?? platformUser.userId,
    role: platformUser.role,
  }
}

// ─── Response helpers ──────────────────────────────────────────────────────────

export function unauthorized(msg = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 401 })
}

export function forbidden(msg = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 })
}

// ─── Route wrappers ────────────────────────────────────────────────────────────

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
