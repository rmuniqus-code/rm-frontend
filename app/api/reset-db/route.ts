import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const POST = withAuth(async () => {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development mode' }, { status: 403 })
  }

  const sb = supabaseAdmin()
  const del = (table: string) => sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const errors: string[] = []

  const batch = async (tables: string[]) => {
    const results = await Promise.all(tables.map(t => del(t)))
    for (let i = 0; i < tables.length; i++) {
      if (results[i].error) errors.push(`${tables[i]}: ${results[i].error!.message}`)
    }
  }

  await batch(['file_uploads'])
  await batch(['timesheet_compliance', 'forecast_allocations', 'utilization_snapshots', 'resource_requests', 'upload_logs', 'notifications', 'audit_log'])
  await batch(['employees', 'projects'])
  await batch(['sub_functions', 'designations', 'locations'])
  await batch(['departments', 'regions'])

  if (errors.length > 0) return NextResponse.json({ success: false, errors }, { status: 207 })
  return NextResponse.json({ success: true, message: 'All tables cleared' })
})
