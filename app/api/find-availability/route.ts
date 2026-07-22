import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'

function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

function mondayOf(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

function addWeeks(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return toLocalISO(d)
}

const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const today = new Date()
  const fromISO = sp.get('startDate') ?? mondayOf(today)
  const toISO = sp.get('endDate') ?? addWeeks(mondayOf(today), 4)
  const gradeFilter = sp.get('grade') ?? ''
  const serviceLineFilter = sp.get('serviceLine') ?? ''

  const empConditions: string[] = ['is_active = true']
  const empParams: unknown[] = []

  if (gradeFilter) {
    empParams.push(gradeFilter)
    empConditions.push(`designation = $${empParams.length}`)
  }
  if (serviceLineFilter) {
    empParams.push(serviceLineFilter)
    empConditions.push(`department = $${empParams.length}`)
  }

  const [empRows, skillRows, allocRows] = await Promise.all([
    query(
      `SELECT emp_code, name, designation, department, sub_function, location, region
       FROM v_employee_details
       WHERE ${empConditions.join(' AND ')}
       ORDER BY name`,
      empParams,
    ),
    query(
      `SELECT emp_code, primary_skill
       FROM v_employee_skills`,
    ),
    query(
      `SELECT emp_code, allocation_pct, week_start, allocation_status
       FROM v_resource_allocation_grid
       WHERE week_start >= $1 AND week_start <= $2
         AND allocation_status = ANY($3)`,
      [fromISO, toISO, BOOKED_STATUSES],
    ),
  ])

  const skillMap = new Map<string, string>()
  for (const s of skillRows as any[]) { if (s.emp_code && s.primary_skill) skillMap.set(s.emp_code, s.primary_skill) }

  const weekTotals = new Map<string, Map<string, number>>()
  for (const row of allocRows as any[]) {
    if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
    const wMap = weekTotals.get(row.emp_code)!
    wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
  }

  const avgPct = new Map<string, number>()
  for (const [empCode, wMap] of weekTotals.entries()) {
    const total = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
    avgPct.set(empCode, total / wMap.size)
  }

  const resources = (empRows as any[])
    .filter((e: any) => !isExcluded(e.department, e.sub_function, e.designation))
    .map((e: any) => ({
      id: e.emp_code, name: e.name, grade: e.designation ?? '',
      serviceLine: e.department ?? '', subServiceLine: normalizeSubFunction(e.sub_function ?? ''),
      location: e.location ?? '', region: e.region ?? '',
      primarySkill: skillMap.get(e.emp_code) ?? '',
      totalFte: Math.round((avgPct.get(e.emp_code) ?? 0)) / 100,
    }))
    .filter(r => r.totalFte < 1.0)
    .sort((a, b) => a.totalFte - b.totalFte)

  return NextResponse.json({ resources, fromISO, toISO })
})
