import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const PATCH = withAuth(async (request: NextRequest, user) => {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 })
  }

  const { roleId, permissionId } = await request.json() as { roleId: string; permissionId: string }
  if (!roleId || !permissionId) {
    return NextResponse.json({ error: 'roleId and permissionId are required' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  const { data: existing } = await sb.from('role_permissions').select('granted').eq('role_id', roleId).eq('permission_id', permissionId).maybeSingle()
  const newGranted = !(existing?.granted ?? false)

  const { data: updated, error } = await sb
    .from('role_permissions')
    .upsert({ role_id: roleId, permission_id: permissionId, granted: newGranted, updated_by: user.email ?? 'unknown', updated_at: new Date().toISOString() }, { onConflict: 'role_id,permission_id' })
    .select('role_id, permission_id, granted, updated_by, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permission: updated })
})
