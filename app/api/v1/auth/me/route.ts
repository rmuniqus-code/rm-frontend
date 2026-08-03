import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'
import { query } from '@/lib/server/db'

export const GET = withAuth(async (_request: NextRequest, user) => {
  const permissions = await query<{ permission_id: string }>(
    `SELECT permission_id FROM role_permissions WHERE role_id = $1 AND granted = true`,
    [user.role],
  )

  return NextResponse.json({
    userId: user.id,
    email: user.email ?? '',
    name: user.name,
    role: user.role,
    permissions: permissions.map(p => p.permission_id),
    orgId: 'uniqus',
  })
})
