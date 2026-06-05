import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const employeeId = sp.get('employeeId') ?? undefined
  const from = parseISODate(sp.get('from'))
  const to = parseISODate(sp.get('to'))

  if (employeeId) {
    if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
    const { data, error } = await supabaseAdmin().rpc('fn_employee_utilization', { p_employee_id: employeeId, p_from: from, p_to: to })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ employeeId, from, to, weeks: data })
  }

  if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })

  const location = sp.get('location') ?? undefined
  const grade = sp.get('grade') ?? undefined
  const department = sp.get('department') ?? undefined

  let query = supabaseAdmin()
    .from('v_resource_allocation_grid')
    .select('emp_code, employee_name, designation, department, location, week_start, allocation_pct, allocation_status, project_type, project_name')
    .gte('week_start', from).lte('week_start', to).eq('allocation_status', 'confirmed')

  if (location) query = query.eq('location', location)
  if (grade) query = query.eq('designation', grade)
  if (department) query = query.eq('department', department)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const NON_CHARGEABLE = new Set(['internal', 'non_chargeable', 'non-chargeable', 'training'])
  const isChargeable = (projectType: string | null | undefined, projectName: string | null | undefined) => {
    if (!projectName) return false
    const pt = (projectType ?? '').toLowerCase().trim()
    if (!pt) return true
    return !NON_CHARGEABLE.has(pt)
  }

  const empWeeklyUtil = new Map<string, { name: string; designation: string; weeks: Map<string, number> }>()
  for (const r of (rows ?? [])) {
    if (!isChargeable((r as any).project_type, (r as any).project_name)) continue
    const emp = r as any
    if (!empWeeklyUtil.has(emp.emp_code)) empWeeklyUtil.set(emp.emp_code, { name: emp.employee_name, designation: emp.designation, weeks: new Map() })
    const entry = empWeeklyUtil.get(emp.emp_code)!
    entry.weeks.set(emp.week_start, (entry.weeks.get(emp.week_start) ?? 0) + Number(emp.allocation_pct || 0))
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
