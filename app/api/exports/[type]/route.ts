import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

const ALLOWED = new Set(['employees', 'allocations', 'utilization'])

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n')
}

export const GET = withAuth(async (request: NextRequest, _user, ctx: any) => {
  const { type } = await ctx.params
  if (!ALLOWED.has(type)) return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 })

  const sp = request.nextUrl.searchParams
  const sb = supabaseAdmin()
  let rows: Record<string, unknown>[] = []
  let filename = `${type}.csv`

  if (type === 'employees') {
    const { data, error } = await sb.from('v_employee_details').select('*')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = data ?? []
  } else if (type === 'allocations') {
    const from = parseISODate(sp.get('from'))
    const to = parseISODate(sp.get('to'))
    if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    const { data, error } = await sb.from('v_resource_allocation_grid').select('*').gte('week_start', from).lte('week_start', to)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = data ?? []
    filename = `allocations_${from}_to_${to}.csv`
  } else if (type === 'utilization') {
    const period = sp.get('period') ?? undefined
    let q = sb.from('v_compliance_overview').select('*')
    if (period) q = q.eq('period_month', period)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = data ?? []
    filename = period ? `utilization_${period}.csv` : `utilization.csv`
  }

  const csv = toCSV(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
