import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { withPermission } from '@/lib/server/auth'

export const PATCH = withPermission('manage_roles', async (request: NextRequest, user) => {

  const { roleId, permissionId } = await request.json() as { roleId: string; permissionId: string }
  if (!roleId || !permissionId) {
    return NextResponse.json({ error: 'roleId and permissionId are required' }, { status: 400 })
  }

  try {
    const existing = await queryOne<{ granted: boolean }>(
      'SELECT granted FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
      [roleId, permissionId],
    )
    const newGranted = !(existing?.granted ?? false)

    const updated = await queryOne<Record<string, unknown>>(
      `INSERT INTO role_permissions (role_id, permission_id, granted, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (role_id, permission_id) DO UPDATE
         SET granted = EXCLUDED.granted,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at
       RETURNING role_id, permission_id, granted, updated_by, updated_at`,
      [roleId, permissionId, newGranted, user.email ?? 'unknown', new Date().toISOString()],
    )

    return NextResponse.json({ permission: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
