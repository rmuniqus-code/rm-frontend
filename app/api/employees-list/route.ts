import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth, AuthUser } from '@/lib/server/auth'
import { isExcluded } from '@/lib/server/sub-function-normalize'

const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withAuth(async (req: NextRequest, _user: AuthUser) => {
  const sp = req.nextUrl.searchParams
  const startDate = sp.get('startDate')
  const endDate = sp.get('endDate')

  const [empRows, allocRows] = await Promise.all([
    query(
      `SELECT emp_code, name, designation, department, sub_function, location, region
       FROM v_employee_details
       WHERE is_active = true
       ORDER BY name
       LIMIT 2000`,
    ),
    startDate && endDate
      ? query(
          `SELECT emp_code, allocation_pct, week_start
           FROM v_resource_allocation_grid
           WHERE week_start >= $1 AND week_start <= $2
             AND allocation_status = ANY($3)`,
          [startDate, endDate, BOOKED_STATUSES],
        )
      : Promise.resolve([]),
  ])

  // Sum allocation per employee per week, then average across weeks
  const avgPct = new Map<string, number>()
  if (startDate && endDate) {
    const weekTotals = new Map<string, Map<string, number>>()
    for (const row of allocRows as any[]) {
      if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
      const wMap = weekTotals.get(row.emp_code)!
      wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
    }
    for (const [empCode, wMap] of weekTotals.entries()) {
      const total = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
      avgPct.set(empCode, total / wMap.size)
    }
  }

  const employees = (empRows as any[])
    .filter((r: any) => !isExcluded(r.department, r.sub_function, r.designation))
    .map((r: any) => {
      const bookedPct = avgPct.get(r.emp_code) ?? 0
      const availabilityPct = startDate && endDate
        ? Math.max(0, Math.round(100 - bookedPct))
        : null
      return {
        emp_code: r.emp_code,
        name: r.name,
        designation: r.designation,
        department: r.department,
        sub_function: r.sub_function,
        location: r.location,
        region: r.region,
        availabilityPct,
      }
    })

  return NextResponse.json(employees)
})
