/**
 * CSV exports of dashboard views.
 *
 * GET /api/exports/employees
 * GET /api/exports/allocations?from=&to=
 * GET /api/exports/utilization?period=Mar-2026
 *
 * Returns a CSV download. For very large allocation exports
 * (>100k rows), prefer streaming to disk via a background job.
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fail, withErrorHandling, parseISODate } from '@/lib/api-helpers'

type Ctx = { params: Promise<{ type: string }> }

const ALLOWED = new Set(['employees', 'allocations', 'utilization'])

export const GET = withErrorHandling(async (req: NextRequest, ctx: Ctx) => {
  const { type } = await ctx.params
  if (!ALLOWED.has(type)) return fail(400, `Unknown export type: ${type}`)

  const url = new URL(req.url)
  const sb = supabaseAdmin()
  let rows: Record<string, unknown>[] = []
  let filename = `${type}.csv`

  if (type === 'employees') {
    const { data, error } = await sb.from('v_employee_details').select('*')
    if (error) return fail(500, error.message)
    rows = data ?? []
  } else if (type === 'allocations') {
    const from = parseISODate(url.searchParams.get('from'))
    const to = parseISODate(url.searchParams.get('to'))
    if (!from || !to) return fail(400, 'from and to are required')

    const { data, error } = await sb
      .from('v_resource_allocation_grid')
      .select('*')
      .gte('week_start', from)
      .lte('week_start', to)
    if (error) return fail(500, error.message)
    rows = data ?? []
    filename = `allocations_${from}_to_${to}.csv`
  } else if (type === 'utilization') {
    const period = url.searchParams.get('period')
    let q = sb.from('v_compliance_overview').select('*')
    if (period) q = q.eq('period_month', period)
    const { data, error } = await q
    if (error) return fail(500, error.message)
    rows = data ?? []
    filename = period ? `utilization_${period}.csv` : `utilization.csv`
  }

  const csv = toCSV(rows)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})

// ─── CSV serializer (RFC 4180-compliant) ─────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ]
  return lines.join('\r\n')
}
