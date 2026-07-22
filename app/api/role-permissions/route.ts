import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async () => {
  try {
    const permissions = await query<Record<string, unknown>>(
      'SELECT role_id, permission_id, granted, updated_by, updated_at FROM role_permissions ORDER BY role_id',
      [],
    )
    return NextResponse.json({ permissions })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
