/**
 * Utilization metrics.
 *
 * GET /api/utilization?employeeId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Per-week allocation breakdown for one employee.
 *
 * GET /api/utilization?from=YYYY-MM-DD&to=YYYY-MM-DD&location=Mumbai&grade=Manager
 *   Aggregate utilization across all matching employees (dynamic dashboard).
 *
 * Backed by fn_employee_utilization (Postgres RPC) for single employee,
 * or v_resource_allocation_grid for aggregate calculations.
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseISODate } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const employeeId = url.searchParams.get('employeeId')
  const from = parseISODate(url.searchParams.get('from'))
  const to = parseISODate(url.searchParams.get('to'))

  // ── Single employee mode ────────────────────────────
  if (employeeId) {
    if (!from || !to) return fail(400, 'from and to (YYYY-MM-DD) are required')

    const { data, error } = await supabaseAdmin().rpc('fn_employee_utilization', {
      p_employee_id: employeeId,
      p_from: from,
      p_to: to,
    })

    if (error) return fail(500, error.message)
    return ok({ employeeId, from, to, weeks: data })
  }

  // ── Aggregate mode (dynamic utilization by filters) ──
  if (!from || !to) return fail(400, 'from and to (YYYY-MM-DD) are required')

  const location = url.searchParams.get('location')
  const grade = url.searchParams.get('grade')
  const department = url.searchParams.get('department')

  // Query allocation grid view with filters
  let query = supabaseAdmin()
    .from('v_resource_allocation_grid')
    .select('emp_code, employee_name, designation, department, location, week_start, allocation_pct, allocation_status')
    .gte('week_start', from)
    .lte('week_start', to)
    .in('allocation_status', ['confirmed', 'proposed'])

  if (location) query = query.eq('location', location)
  if (grade) query = query.eq('designation', grade)
  if (department) query = query.eq('department', department)

  const { data: rows, error } = await query
  if (error) return fail(500, error.message)

  // Aggregate: avg utilization per employee, then overall average
  const empWeeklyUtil = new Map<string, { name: string; designation: string; weeks: Map<string, number> }>()

  for (const r of (rows ?? [])) {
    if (!empWeeklyUtil.has(r.emp_code)) {
      empWeeklyUtil.set(r.emp_code, {
        name: r.employee_name,
        designation: r.designation,
        weeks: new Map(),
      })
    }
    const emp = empWeeklyUtil.get(r.emp_code)!
    const current = emp.weeks.get(r.week_start) ?? 0
    emp.weeks.set(r.week_start, current + Number(r.allocation_pct || 0))
  }

  // Per-employee average utilization
  const employeeUtils = [...empWeeklyUtil.entries()].map(([empCode, emp]) => {
    const weekValues = [...emp.weeks.values()]
    const avg = weekValues.length > 0
      ? weekValues.reduce((s, v) => s + v, 0) / weekValues.length
      : 0
    return { empCode, name: emp.name, designation: emp.designation, avgUtilization: Math.round(avg * 10) / 10 }
  })

  // Overall average
  const overallAvg = employeeUtils.length > 0
    ? Math.round(employeeUtils.reduce((s, e) => s + e.avgUtilization, 0) / employeeUtils.length * 10) / 10
    : 0

  // By designation breakdown
  const byDesignation = new Map<string, { total: number; count: number }>()
  for (const e of employeeUtils) {
    const desg = e.designation || 'Unknown'
    if (!byDesignation.has(desg)) byDesignation.set(desg, { total: 0, count: 0 })
    const d = byDesignation.get(desg)!
    d.total += e.avgUtilization
    d.count++
  }
  const designationBreakdown = [...byDesignation.entries()].map(([designation, { total, count }]) => ({
    designation,
    avgUtilization: Math.round(total / count * 10) / 10,
    headcount: count,
  }))

  return ok({
    from, to,
    filters: { location, grade, department },
    overallUtilization: overallAvg,
    totalEmployees: employeeUtils.length,
    designationBreakdown,
    employees: employeeUtils.sort((a, b) => a.avgUtilization - b.avgUtilization), // lowest first
  })
})
