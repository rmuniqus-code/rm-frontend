import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { withPermission } from '@/lib/server/auth'

const VALID_ROLES = new Set(['admin', 'rm', 'slh', 'employee', 'viewer'])

export const PUT = withPermission('manage_users', async (request: NextRequest, _user, ctx) => {
  const userId = (ctx as { params: { userId: string } })?.params?.userId
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const body = await request.json().catch(() => ({})) as { role?: string }
  const role = body.role
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` }, { status: 400 })
  }

  const updated = await queryOne<{ id: string; role: string }>(
    `UPDATE app_users SET role = $1, updated_at = now() WHERE id = $2 RETURNING id::text, role`,
    [role, userId],
  )

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({ success: true, userId: updated.id, role: updated.role })
})
