import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'
import { matchesDesignationFilter, type DesignationFilter } from '@/lib/designation-filter'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonths(yyyyMM: string, n: number): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  return `${MONTH_LABELS[parseInt(m) - 1]} '${y.slice(2)}`
}

function normalizeMonth(s: string): string {
  if (/^\d{4}-\d{2}$/.test(s)) return s
  const SHORT: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
  const parts = s.split('-')
  if (parts.length >= 2) { const mon = SHORT[parts[0].toLowerCase().slice(0, 3)] ?? '01'; return `${parts[1]}-${mon}` }
  return s
}

export const GET = withAuth(async (request: NextRequest) => {
  const designationGroup = (request.nextUrl.searchParams.get('designationGroup') ?? 'all') as DesignationFilter
  const sb = supabaseAdmin()
  const today = todayISO()
  const currentMonth = today.slice(0, 7)
  const month2 = addMonths(currentMonth, 1)
  const month3 = addMonths(currentMonth, 2)
  const forecastEnd = `${month3}-31`
  const twelveMonthsAgo = addMonths(currentMonth, -12)

  const [empRes, currentAllocRes, futureAllocRes, deptChargeRes, projectAllocRes, locChargeRes] = await Promise.all([
    sb.from('v_employee_details').select('emp_code, name, designation, department, sub_function, location, region').eq('is_active', true),
    sb.from('v_resource_allocation_grid').select('emp_code, department, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_type').gte('week_start', `${currentMonth}-01`).lt('week_start', `${month2}-01`),
    sb.from('v_resource_allocation_grid').select('emp_code, employee_name, designation, department, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_type').gte('week_start', `${month2}-01`).lte('week_start', forecastEnd),
    sb.from('v_chargeability_by_dept').select('department, period_month, avg_chargeability, headcount').gte('period_month', twelveMonthsAgo).order('period_month', { ascending: true }),
    sb.from('forecast_allocations').select('allocation_pct, allocation_status, projects!inner(name, code, sub_team, status), employees!inner(employee_id)').gte('week_start', `${month2}-01`).lte('week_start', forecastEnd).not('project_id', 'is', null),
    sb.from('timesheet_compliance').select('chargeability_pct, period_month, employees!inner(locations(name))').gte('period_month', addMonths(currentMonth, -3)).order('period_month', { ascending: false }),
  ])

  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 })

  const employees = (empRes.data ?? []).filter((e: any) =>
    !isExcluded(e.department, e.sub_function) && matchesDesignationFilter(e.designation, designationGroup)
  ).map((e: any) => ({
    empCode: String(e.emp_code ?? ''), name: String(e.name ?? ''), designation: String(e.designation ?? ''),
    department: String(e.department ?? ''), subFunction: normalizeSubFunction(e.sub_function ?? ''),
    location: String(e.location ?? ''), region: String(e.region ?? ''),
  }))

  const currentAllocs = (currentAllocRes.data ?? []).filter((r: any) => !isExcluded(r.department, r.sub_function))
  const futureAllocs = (futureAllocRes.data ?? []).filter((r: any) => !isExcluded(r.department, r.sub_function))
  const deptHistory = (deptChargeRes.data ?? []).filter((r: any) => !isExcluded(r.department))

  const CLIENT_STATUSES = new Set(['confirmed', 'proposed'])
  const empUtil = new Map<string, { total: number; n: number }>()
  for (const r of currentAllocs) {
    if (!CLIENT_STATUSES.has(r.allocation_status) || !r.project_name) continue
    const code = String(r.emp_code)
    if (!empUtil.has(code)) empUtil.set(code, { total: 0, n: 0 })
    const u = empUtil.get(code)!; u.total += Number(r.allocation_pct) || 0; u.n++
  }
  const empForecastPct = new Map<string, number>()
  for (const [code, u] of empUtil) empForecastPct.set(code, u.n > 0 ? u.total / u.n : 0)

  const slData = new Map<string, { subSLs: Set<string>; capacity: number; forecastFte: number }>()
  for (const e of employees) {
    const sl = e.department || 'Unknown'
    if (!slData.has(sl)) slData.set(sl, { subSLs: new Set(), capacity: 0, forecastFte: 0 })
    const d = slData.get(sl)!; d.capacity++
    if (e.subFunction) d.subSLs.add(e.subFunction)
    d.forecastFte += (empForecastPct.get(e.empCode) ?? 0) / 100
  }

  const latestActuals = new Map<string, number>()
  for (const r of deptHistory) {
    const dept = String(r.department ?? '')
    const fte = (Number(r.headcount) || 0) * (Number(r.avg_chargeability) || 0) / 100
    latestActuals.set(dept, fte)
  }

  const fteByServiceLine = [...slData.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sl, d]) => {
    const forecast = Math.round(d.forecastFte * 10) / 10
    const actuals = latestActuals.has(sl) ? Math.round(latestActuals.get(sl)! * 10) / 10 : null
    return { serviceLine: sl, subServiceLines: [...d.subSLs].sort().join(', '), capacity: d.capacity, forecast, actuals, variance: actuals !== null ? Math.round((forecast - actuals) * 10) / 10 : null, utilization: d.capacity > 0 ? Math.round(forecast / d.capacity * 1000) / 10 : 0 }
  })

  const locData = new Map<string, { capacity: number; forecastFte: number }>()
  for (const e of employees) {
    const loc = e.location || 'Unknown'
    if (!locData.has(loc)) locData.set(loc, { capacity: 0, forecastFte: 0 })
    const d = locData.get(loc)!; d.capacity++; d.forecastFte += (empForecastPct.get(e.empCode) ?? 0) / 100
  }
  const fteByLocation = [...locData.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([location, d]) => ({
    location, capacity: d.capacity, forecast: Math.round(d.forecastFte * 10) / 10,
    utilization: d.capacity > 0 ? Math.round(d.forecastFte / d.capacity * 1000) / 10 : 0,
  }))

  const monthlyActualsMap = new Map<string, { total: number; n: number }>()
  for (const r of deptHistory) {
    const month = normalizeMonth(String(r.period_month ?? ''))
    if (!month) continue
    if (!monthlyActualsMap.has(month)) monthlyActualsMap.set(month, { total: 0, n: 0 })
    const m = monthlyActualsMap.get(month)!; m.total += Number(r.avg_chargeability) || 0; m.n++
  }

  const totalForecastPct = [...empForecastPct.values()].reduce((s, p) => s + p, 0)
  const avgForecastUtil = employees.length > 0 ? totalForecastPct / employees.length : 0
  const monthlyTrend: { month: string; label: string; actual?: number; forecast?: number }[] = []
  for (const [month, m] of [...monthlyActualsMap.entries()].sort()) {
    monthlyTrend.push({ month, label: monthLabel(month), actual: m.n > 0 ? Math.round(m.total / m.n * 10) / 10 : undefined })
  }
  for (const fm of [currentMonth, month2, month3]) {
    const fcast = Math.round(avgForecastUtil * 10) / 10
    const existing = monthlyTrend.find(t => t.month === fm)
    if (existing) { existing.forecast = fcast } else { monthlyTrend.push({ month: fm, label: monthLabel(fm), forecast: fcast }) }
  }
  monthlyTrend.sort((a, b) => a.month.localeCompare(b.month))

  const empRegion = new Map<string, string>()
  for (const e of employees) empRegion.set(e.empCode, e.region)

  type ProjectEntry = { name: string | null; pct: number; status: string }
  type WeekData = { totalPct: number; projects: ProjectEntry[] }
  type WeeklyRow = { empCode: string; name: string; designation: string; serviceLine: string; subServiceLine: string; location: string; region: string; weeks: Record<string, WeekData> }

  const weeklyMap = new Map<string, WeeklyRow>()
  for (const r of futureAllocs) {
    const code = String(r.emp_code); const week = String(r.week_start); const pct = Number(r.allocation_pct) || 0
    if (!weeklyMap.has(code)) weeklyMap.set(code, { empCode: code, name: String((r as any).employee_name ?? code), designation: String((r as any).designation ?? ''), serviceLine: String((r as any).department ?? ''), subServiceLine: normalizeSubFunction((r as any).sub_function ?? ''), location: String((r as any).location ?? ''), region: empRegion.get(code) ?? '', weeks: {} })
    const row = weeklyMap.get(code)!
    if (!row.weeks[week]) row.weeks[week] = { totalPct: 0, projects: [] }
    row.weeks[week].totalPct += pct
    row.weeks[week].projects.push({ name: (r as any).project_name ?? null, pct, status: String(r.allocation_status) })
  }
  // Add bench employees (no future allocations) so region/location filters work on all headcount
  for (const e of employees) {
    if (!weeklyMap.has(e.empCode)) {
      weeklyMap.set(e.empCode, { empCode: e.empCode, name: e.name, designation: e.designation, serviceLine: e.department, subServiceLine: e.subFunction, location: e.location, region: e.region, weeks: {} })
    }
  }
  const weeklyForecastRows = [...weeklyMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  const gradeMap = new Map<string, number>()
  for (const e of employees) { const g = e.designation || 'Unknown'; gradeMap.set(g, (gradeMap.get(g) ?? 0) + 1) }
  const byGrade = [...gradeMap.entries()].sort((a, b) => b[1] - a[1]).map(([grade, count]) => ({ grade, count }))

  const projectFteMap = new Map<string, any>()
  for (const r of (projectAllocRes.data ?? []) as any[]) {
    const proj = r.projects; if (!proj?.name) continue
    const key = proj.name as string
    if (!projectFteMap.has(key)) projectFteMap.set(key, { name: proj.name, code: String(proj.code ?? ''), serviceLine: String(proj.sub_team ?? ''), status: String(proj.status ?? ''), activePct: 0, pipelinePct: 0, n: 0 })
    const p = projectFteMap.get(key)!; const pct = Number(r.allocation_pct) || 0
    if (r.allocation_status === 'confirmed') p.activePct += pct
    if (r.allocation_status === 'proposed') p.pipelinePct += pct
    p.n++
  }
  const projectFte = [...projectFteMap.values()].map(p => ({ projectName: p.name, projectCode: p.code, serviceLine: p.serviceLine, status: p.status, activeFte: Math.round(p.activePct / 100 * 10) / 10, pipelineFte: Math.round(p.pipelinePct / 100 * 10) / 10 })).sort((a, b) => (b.activeFte + b.pipelineFte) - (a.activeFte + a.pipelineFte))

  const locActualsMap = new Map<string, { total: number; n: number; period: string }>()
  for (const r of (locChargeRes.data ?? []) as any[]) {
    const loc = r.employees?.locations?.name as string | undefined; if (!loc) continue
    const period = String(r.period_month ?? ''); const existing = locActualsMap.get(loc)
    if (!existing || existing.period === period) {
      if (!existing) locActualsMap.set(loc, { total: 0, n: 0, period })
      const m = locActualsMap.get(loc)!
      if (m.period === period) { m.total += Number(r.chargeability_pct) || 0; m.n++ }
    }
  }

  const fteByLocationWithActuals = fteByLocation.map(row => {
    const a = locActualsMap.get(row.location)
    const actualUtil = a && a.n > 0 ? a.total / a.n : null
    const actuals = actualUtil !== null ? Math.round(row.capacity * actualUtil * 10) / 10 : null
    return { ...row, actuals, actualUtil: actualUtil !== null ? Math.round(actualUtil * 1000) / 10 : null }
  })

  return NextResponse.json({ fteByServiceLine, fteByLocation: fteByLocationWithActuals, monthlyTrend, weeklyForecastRows, byGrade, projectFte })
})
