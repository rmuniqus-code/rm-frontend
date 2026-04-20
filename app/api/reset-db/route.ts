import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development mode' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Delete in FK-dependency order using parallel batches.
  // Each batch can run in parallel; next batch starts only after the previous finishes.
  //
  // Group 1: leaf/fact tables (reference employees & projects but nothing references them)
  // Group 2: employees & projects (reference dimension tables)
  // Group 3: sub_functions, designations, locations  (sub_functions refs departments; locations refs regions)
  // Group 4: departments & regions (all referencing rows already gone)

  const del = (table: string) =>
    sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const errors: string[] = []

  const batch = async (tables: string[]) => {
    const results = await Promise.all(tables.map(t => del(t)))
    for (let i = 0; i < tables.length; i++) {
      if (results[i].error) errors.push(`${tables[i]}: ${results[i].error!.message}`)
    }
  }

  // Group 0: file_uploads refs upload_logs — must go first
  await batch(['file_uploads'])
  // Group 1: leaf/fact tables that reference employees/projects/upload_logs
  await batch(['timesheet_compliance', 'forecast_allocations', 'utilization_snapshots', 'resource_requests', 'upload_logs', 'notifications', 'audit_log'])
  // Group 2: core entity tables
  await batch(['employees', 'projects'])
  // Group 3: dimension tables with inter-refs
  await batch(['sub_functions', 'designations', 'locations'])
  // Group 4: root dimension tables
  await batch(['departments', 'regions'])

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 207 })
  }

  return NextResponse.json({ success: true, message: 'All tables cleared' })
}

