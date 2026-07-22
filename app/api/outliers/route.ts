import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

function todayMonday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff); return d.toISOString().split('T')[0]
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + weeks * 7); return d.toISOString().split('T')[0]
}

function jan1ISO(): string { return `${new Date().getUTCFullYear()}-01-01` }

function resolveDateWindow(period: string | undefined, from: string | null | undefined, to: string | null | undefined) {
  if (from && to) return { from, to }
  const monday = todayMonday()
  switch ((period ?? '').toLowerCase()) {
    case 'weekly': return { from: monday, to: addWeeks(monday, 1) }
    case 'yearly': return { from: addWeeks(monday, -52), to: addWeeks(monday, 4) }
    default: return { from: monday, to: addWeeks(monday, 4) }
  }
}

function groupBy(outliers: any[], field: string) {
  const map = new Map<string, any>()
  for (const o of outliers) {
    const key = String(o[field] ?? 'Unknown')
    if (!map.has(key)) map.set(key, { count: 0, missed_timesheet: 0, low_utilization: 0, over_allocated: 0 })
    const g = map.get(key)!; g.count++
    if (o.outlier_type === 'missed_timesheet') g.missed_timesheet++
    else if (o.outlier_type.startsWith('low_utilization')) g.low_utilization++
    else if (o.outlier_type === 'over_allocated') g.over_allocated++
  }
  return [...map.entries()].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.count - a.count)
}

function deduplicateOutliers(outliers: any[]): any[] {
  const map = new Map<string, any>()
  for (const o of outliers) {
    const key = `${o.employee_code}:${o.outlier_type}`
    const existing = map.get(key)
    if (!existing) { map.set(key, o) } else {
      if (o.outlier_type === 'over_allocated') { if (o.metric_value > existing.metric_value) map.set(key, o) }
      else { if (o.metric_value < existing.metric_value) map.set(key, o) }
    }
  }
  return [...map.values()]
}

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const typeFilter = sp.get('type') ?? undefined
  const regionFilter = sp.get('region') ?? undefined
  const serviceLineFilter = sp.get('serviceLine') ?? sp.get('department') ?? undefined
  const period = sp.get('period') ?? undefined
  const explicitFrom = parseISODate(sp.get('from'))
  const explicitTo = parseISODate(sp.get('to'))
  const { from, to } = resolveDateWindow(period, explicitFrom, explicitTo)
  const thisMonday = todayMonday()
  const jan1 = jan1ISO()

  const [
    outlierRows,
    allocRows,
    locationRows,
    tsCompRows,
    empDetailsRows,
    tsAllRows,
    chargeThisWeekRows,
    utilByDesigRows,
  ] = await Promise.all([
    query('SELECT * FROM fn_outliers($1, $2)', [from, to]),
    query(
      `SELECT emp_code, project_name, allocation_pct, allocation_status, week_start
       FROM v_resource_allocation_grid
       WHERE week_start >= $1 AND week_start <= $2
         AND allocation_status = ANY($3)`,
      [from, to, ['confirmed', 'proposed']],
    ),
    query<{ name: string; region_name: string }>(
      `SELECT l.name, r.name AS region_name
       FROM locations l
       LEFT JOIN regions r ON r.id = l.region_id`,
    ),
    query(
      `SELECT tc.period_month, tc.compliance_pct, tc.total_hours,
              e.id AS emp_id, e.employee_id AS emp_employee_id, e.name AS emp_name,
              des.name AS emp_designation_name, dep.name AS emp_department_name, l.name AS emp_location_name
       FROM timesheet_compliance tc
       INNER JOIN employees e ON e.id = tc.employee_id
       LEFT JOIN designations des ON des.id = e.designation_id
       LEFT JOIN departments dep ON dep.id = e.department_id
       LEFT JOIN locations l ON l.id = e.location_id
       WHERE tc.compliance_pct = 0
       ORDER BY tc.period_month DESC`,
    ),
    query(
      `SELECT emp_code, region, sub_function
       FROM v_employee_details
       WHERE is_active = true`,
    ),
    query(
      `SELECT tc.period_month, tc.period_start, tc.available_hours, tc.chargeable_hours, tc.total_hours,
              e.employee_id AS emp_code
       FROM timesheet_compliance tc
       INNER JOIN employees e ON e.id = tc.employee_id
       WHERE tc.period_start >= $1
       ORDER BY tc.period_start DESC`,
      [jan1],
    ),
    query(
      `SELECT emp_code, allocation_pct, project_name, project_type
       FROM v_resource_allocation_grid
       WHERE week_start = $1 AND allocation_status = 'confirmed'`,
      [thisMonday],
    ),
    query(
      `SELECT emp_code, designation, allocation_pct, project_type, project_name, week_start
       FROM v_resource_allocation_grid
       WHERE week_start >= $1 AND week_start <= $2 AND allocation_status = 'confirmed'`,
      [from, to],
    ),
  ])

  const empRegionMap = new Map<string, string>()
  const empSubFuncMap = new Map<string, string>()
  for (const emp of empDetailsRows) {
    const r = emp as any
    if (r.emp_code && r.region) empRegionMap.set(r.emp_code, r.region)
    if (r.emp_code && r.sub_function) empSubFuncMap.set(r.emp_code, r.sub_function)
  }

  const locationRegionMap = new Map<string, string>()
  for (const loc of locationRows) {
    locationRegionMap.set(loc.name, loc.region_name ?? 'Unknown')
  }

  const latestTsPeriod = tsCompRows.reduce((max: string, r: any) => (r.period_month > max ? r.period_month : max), '')
  const strictTimesheetOutliers = tsCompRows
    .filter((r: any) => r.period_month === latestTsPeriod)
    .map((r: any) => {
      const loc = r.emp_location_name ?? ''
      return {
        employee_id: r.emp_id ?? '',
        employee_code: r.emp_employee_id ?? '',
        employee_name: r.emp_name ?? '',
        designation: r.emp_designation_name ?? '',
        department: r.emp_department_name ?? '',
        location: loc,
        outlier_type: 'missed_timesheet',
        metric_value: Number(r.total_hours ?? 0),
        threshold: 1.0,
        detail: `Total hours = ${r.total_hours ?? 0} for period ${r.period_month}`,
        week_start: null,
        region: empRegionMap.get(r.emp_employee_id ?? '') ?? locationRegionMap.get(loc) ?? 'Unknown',
        serviceLine: r.emp_department_name ?? 'Unknown',
        sub_function: empSubFuncMap.get(r.emp_employee_id ?? '') ?? null,
      }
    })

  let outliers: any[] = [
    ...strictTimesheetOutliers,
    ...(outlierRows as any[]).filter(o => o.outlier_type !== 'missed_timesheet'),
  ]

  for (const o of outliers) {
    if (o.outlier_type !== 'missed_timesheet') {
      o.region = empRegionMap.get(o.employee_code) ?? locationRegionMap.get(o.location) ?? 'Unknown'
      o.serviceLine = o.department ?? 'Unknown'
    }
    if (!o.sub_function) o.sub_function = empSubFuncMap.get(o.employee_code) ?? null
  }

  const empProjectMap = new Map<string, Map<string, any>>()
  for (const row of allocRows) {
    const r = row as any
    if (!empProjectMap.has(r.emp_code)) empProjectMap.set(r.emp_code, new Map())
    const projMap = empProjectMap.get(r.emp_code)!
    const existing = projMap.get(r.project_name) ?? { totalPct: 0, status: r.allocation_status, weeks: 0 }
    existing.totalPct += Number(r.allocation_pct) || 0; existing.weeks++
    projMap.set(r.project_name, existing)
  }

  for (const o of outliers) {
    const projMap = empProjectMap.get(o.employee_code)
    if (projMap) o.projects = [...projMap.entries()].map(([name, info]) => ({ name, allocation_pct: Math.round(info.totalPct / info.weeks), status: info.status })).sort((a: any, b: any) => b.allocation_pct - a.allocation_pct)
  }

  const NON_CHARGEABLE = new Set(['internal', 'non_chargeable', 'non-chargeable', 'training'])
  const isChargeable = (pt: any, pn: any) => { if (!pn) return false; const t = (pt ?? '').toLowerCase().trim(); if (!t) return true; return !NON_CHARGEABLE.has(t) }

  const weeklyChargeByEmp = new Map<string, number>()
  for (const r of chargeThisWeekRows as any[]) {
    if (!isChargeable(r.project_type, r.project_name)) continue
    weeklyChargeByEmp.set(r.emp_code, (weeklyChargeByEmp.get(r.emp_code) ?? 0) + Number(r.allocation_pct || 0))
  }

  // Aggregate per employee+period first (handles employees split across multiple service lines)
  const empPeriodAgg = new Map<string, { chargeable: number; available: number; totalHours: number }>()
  for (const r of tsAllRows as any[]) {
    const empCode = r.emp_code ?? ''; if (!empCode) continue
    const key = `${empCode}::${r.period_month}`
    const prev = empPeriodAgg.get(key) ?? { chargeable: 0, available: 0, totalHours: 0 }
    prev.chargeable  += Number(r.chargeable_hours) || 0
    prev.available   += Number(r.available_hours)  || 0
    prev.totalHours  += Number(r.total_hours)      || 0
    empPeriodAgg.set(key, prev)
  }
  const empYtdStats = new Map<string, { periods: { period: string; chargeability: number; missed: boolean }[] }>()
  for (const [key, agg] of empPeriodAgg.entries()) {
    const sepIdx = key.indexOf('::')
    const empCode = key.slice(0, sepIdx)
    const period = key.slice(sepIdx + 2)
    if (!empYtdStats.has(empCode)) empYtdStats.set(empCode, { periods: [] })
    const chargeability = agg.available > 0 ? agg.chargeable / agg.available : 0
    empYtdStats.get(empCode)!.periods.push({ period, chargeability, missed: agg.totalHours === 0 })
  }

  type PeerAgg = { empWeekly: Map<string, Map<string, number>> }
  const peerByDesig = new Map<string, PeerAgg>()
  for (const r of utilByDesigRows as any[]) {
    if (!isChargeable(r.project_type, r.project_name)) continue
    const desig = r.designation ?? 'Unknown'
    if (!peerByDesig.has(desig)) peerByDesig.set(desig, { empWeekly: new Map() })
    const agg = peerByDesig.get(desig)!
    if (!agg.empWeekly.has(r.emp_code)) agg.empWeekly.set(r.emp_code, new Map())
    const weeks = agg.empWeekly.get(r.emp_code)!
    weeks.set(r.week_start, (weeks.get(r.week_start) ?? 0) + Number(r.allocation_pct || 0))
  }
  const peerAvgByDesig = new Map<string, number>()
  for (const [desig, agg] of peerByDesig.entries()) {
    const perEmpAvg: number[] = []
    for (const weeks of agg.empWeekly.values()) { const vals = [...weeks.values()]; if (vals.length === 0) continue; perEmpAvg.push(vals.reduce((s, v) => s + v, 0) / vals.length) }
    if (perEmpAvg.length > 0) peerAvgByDesig.set(desig, Number((perEmpAvg.reduce((s, v) => s + v, 0) / perEmpAvg.length).toFixed(1)))
  }

  for (const o of outliers) {
    const stats = empYtdStats.get(o.employee_code)
    const periods = (stats?.periods ?? []).slice().sort((a, b) => (a.period < b.period ? 1 : -1))
    const mtd = periods[0]?.chargeability ?? null
    const ytd = periods.length > 0 ? Number(((periods.reduce((s, p) => s + p.chargeability, 0) / periods.length) * 100).toFixed(1)) : null
    const weekly = weeklyChargeByEmp.get(o.employee_code) ?? null
    o.chargeability = { weekly: weekly != null ? Number(Math.min(100, weekly).toFixed(1)) : null, mtd: mtd != null ? Number((mtd * 100).toFixed(1)) : null, ytd }
    o.missedTimesheet = { last4: periods.slice(0, 4).filter(p => p.missed).length, last8: periods.slice(0, 8).filter(p => p.missed).length }
    if (o.outlier_type === 'low_utilization_ad' || o.outlier_type === 'low_utilization_am') o.peerUtilization = peerAvgByDesig.get(o.designation) ?? null
  }

  if (typeFilter) { const types = typeFilter.split(',').map(t => t.trim()); outliers = outliers.filter(o => types.includes(o.outlier_type)) }
  if (regionFilter) outliers = outliers.filter(o => o.region === regionFilter)
  if (serviceLineFilter) outliers = outliers.filter(o => o.serviceLine === serviceLineFilter)

  const deduped = deduplicateOutliers(outliers)
  const summary = { total: deduped.length, missed_timesheet: deduped.filter(o => o.outlier_type === 'missed_timesheet').length, low_utilization_am: deduped.filter(o => o.outlier_type === 'low_utilization_am').length, low_utilization_ad: deduped.filter(o => o.outlier_type === 'low_utilization_ad').length, over_allocated: deduped.filter(o => o.outlier_type === 'over_allocated').length }

  return NextResponse.json({ summary, outliers: deduped, dateRange: { from, to }, period: (period ?? 'monthly').toLowerCase(), aggregations: { byRegion: groupBy(deduped, 'region'), byServiceLine: groupBy(deduped, 'serviceLine'), byDepartment: groupBy(deduped, 'department') } })
})
