import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
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
  let rows: Record<string, unknown>[] = []
  let filename = `${type}.csv`

  try {
    if (type === 'employees') {
      rows = await query<Record<string, unknown>>('SELECT * FROM v_employee_details', [])
    } else if (type === 'allocations') {
      const from = parseISODate(sp.get('from'))
      const to = parseISODate(sp.get('to'))
      if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
      rows = await query<Record<string, unknown>>(
        'SELECT * FROM v_resource_allocation_grid WHERE week_start BETWEEN $1 AND $2',
        [from, to]
      )
      filename = `allocations_${from}_to_${to}.csv`
    } else if (type === 'utilization') {
      const period = sp.get('period') ?? undefined
      if (period) {
        rows = await query<Record<string, unknown>>('SELECT * FROM v_compliance_overview WHERE period_month = $1', [period])
        filename = `utilization_${period}.csv`
      } else {
        rows = await query<Record<string, unknown>>('SELECT * FROM v_compliance_overview', [])
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const csv = toCSV(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
