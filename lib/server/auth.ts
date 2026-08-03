import { NextRequest, NextResponse } from 'next/server'
import {
  verifyToken,
  extractUserFromClaims,
  decodePublishableKey,
  isPublishableKey,
  jwksUriFor,
} from '@ai-universe/auth-node'
import { query, queryOne } from '@/lib/server/db'

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

// ─── User provisioning ─────────────────────────────────────────────────────────

// Upsert user in app_users on every login; returns the DB-managed role.
export async function provisionUser(
  keycloakId: string,
  email: string | undefined,
  name: string,
): Promise<string> {
  const row = await queryOne<{ role: string }>(
    `INSERT INTO app_users (keycloak_id, email, name, role)
     VALUES ($1, $2, $3, 'viewer')
     ON CONFLICT (keycloak_id) DO UPDATE
       SET email = EXCLUDED.email,
           name  = EXCLUDED.name,
           updated_at = now()
     RETURNING role`,
    [keycloakId, email ?? null, name],
  )
  return row?.role ?? 'viewer'
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
  const name = platformUser.name ?? platformUser.email ?? platformUser.userId
  const role = await provisionUser(platformUser.userId, platformUser.email, name)

  return {
    id: platformUser.userId,
    email: platformUser.email || undefined,
    name,
    role,
  }
}

// ─── Permission check ──────────────────────────────────────────────────────────

export async function checkPermission(role: string, permissionId: string): Promise<boolean> {
  const row = await queryOne<{ granted: boolean }>(
    `SELECT granted FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
    [role, permissionId],
  )
  return row?.granted ?? false
}

// ─── Response helpers ──────────────────────────────────────────────────────────

export function unauthorized(msg = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 401 })
}

export function forbidden(msg = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 })
}

// ─── Route wrappers ────────────────────────────────────────────────────────────

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

// Wrap a route handler requiring a specific permission from the role_permissions table.
export function withPermission(
  permissionId: string,
  handler: (request: NextRequest, user: AuthUser, ctx?: unknown) => Promise<NextResponse>,
) {
  return withAuth(async (request, user, ctx) => {
    const granted = await checkPermission(user.role, permissionId)
    if (!granted) return forbidden('Insufficient permissions')
    return handler(request, user, ctx)
  })
}

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
