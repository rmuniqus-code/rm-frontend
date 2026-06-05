import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async () => {
  const { data, error } = await supabaseAdmin()
    .from('role_permissions')
    .select('role_id, permission_id, granted, updated_by, updated_at')
    .order('role_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permissions: data ?? [] })
})
