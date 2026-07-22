import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const POST = withAuth(async () => {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development mode' }, { status: 403 })
  }

  const errors: string[] = []

  const del = async (table: string) => {
    try {
      await query(`DELETE FROM ${table}`, [])
    } catch (e: any) {
      errors.push(`${table}: ${e.message}`)
    }
  }

  // Sequential batches preserve FK ordering (children before parents)
  await del('file_uploads')
  await Promise.all(['timesheet_compliance', 'forecast_allocations', 'utilization_snapshots', 'resource_requests', 'upload_logs', 'notifications', 'audit_log'].map(del))
  await Promise.all(['employees', 'projects'].map(del))
  await Promise.all(['sub_functions', 'designations', 'locations'].map(del))
  await Promise.all(['departments', 'regions'].map(del))

  if (errors.length > 0) return NextResponse.json({ success: false, errors }, { status: 207 })
  return NextResponse.json({ success: true, message: 'All tables cleared' })
})
