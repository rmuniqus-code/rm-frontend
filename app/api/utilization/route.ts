import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const employeeId = sp.get('employeeId') ?? undefined
  const from = parseISODate(sp.get('from'))
  const to = parseISODate(sp.get('to'))

  if (employeeId) {
    if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
    try {
      const data = await query(`SELECT * FROM fn_employee_utilization($1, $2, $3)`, [employeeId, from, to])
      return NextResponse.json({ employeeId, from, to, weeks: data })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })

  const location = sp.get('location') ?? undefined
  const grade = sp.get('grade') ?? undefined
  const department = sp.get('department') ?? undefined

  const conditions: string[] = [
    `week_start >= $1`,
    `week_start <= $2`,
    `allocation_status = 'confirmed'`,
  ]
  const params: unknown[] = [from, to]
  let paramIdx = 3

  if (location) { conditions.push(`location = $${paramIdx++}`); params.push(location) }
  if (grade) { conditions.push(`designation = $${paramIdx++}`); params.push(grade) }
  if (department) { conditions.push(`department = $${paramIdx++}`); params.push(department) }

  const sql = `
    SELECT emp_code, employee_name, designation, department, location,
           week_start, allocation_pct, allocation_status, project_type, project_name
    FROM v_resource_allocation_grid
    WHERE ${conditions.join(' AND ')}
  `

  let rows: any[]
  try {
    rows = await query(sql, params)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const NON_CHARGEABLE = new Set(['internal', 'non_chargeable', 'non-chargeable', 'training'])
  const isChargeable = (projectType: string | null | undefined, projectName: string | null | undefined) => {
    if (!projectName) return false
    const pt = (projectType ?? '').toLowerCase().trim()
    if (!pt) return true
    return !NON_CHARGEABLE.has(pt)
  }

  const empWeeklyUtil = new Map<string, { name: string; designation: string; weeks: Map<string, number> }>()
  for (const r of rows) {
    if (!isChargeable(r.project_type, r.project_name)) continue
    if (!empWeeklyUtil.has(r.emp_code)) empWeeklyUtil.set(r.emp_code, { name: r.employee_name, designation: r.designation, weeks: new Map() })
    const entry = empWeeklyUtil.get(r.emp_code)!
    entry.weeks.set(r.week_start, (entry.weeks.get(r.week_start) ?? 0) + Number(r.allocation_pct || 0))
  }

  const employeeUtils = [...empWeeklyUtil.entries()].map(([empCode, emp]) => {
    const weekValues = [...emp.weeks.values()]
    const avg = weekValues.length > 0 ? weekValues.reduce((s, v) => s + v, 0) / weekValues.length : 0
    return { empCode, name: emp.name, designation: emp.designation, avgUtilization: Math.round(avg * 10) / 10 }
  })

  const overallAvg = employeeUtils.length > 0
    ? Math.round(employeeUtils.reduce((s, e) => s + e.avgUtilization, 0) / employeeUtils.length * 10) / 10 : 0

  const byDesignation = new Map<string, { total: number; count: number }>()
  for (const e of employeeUtils) {
    const desg = e.designation || 'Unknown'
    if (!byDesignation.has(desg)) byDesignation.set(desg, { total: 0, count: 0 })
    const d = byDesignation.get(desg)!
    d.total += e.avgUtilization; d.count++
  }
  const designationBreakdown = [...byDesignation.entries()].map(([designation, { total, count }]) => ({
    designation, avgUtilization: Math.round(total / count * 10) / 10, headcount: count,
  }))

  return NextResponse.json({
    from, to, filters: { location, grade, department },
    overallUtilization: overallAvg, totalEmployees: employeeUtils.length,
    designationBreakdown, employees: employeeUtils.sort((a, b) => a.avgUtilization - b.avgUtilization),
  })
})
