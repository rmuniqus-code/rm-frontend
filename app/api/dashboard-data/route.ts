import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'
import { matchesDesignationFilter, type DesignationFilter } from '@/lib/designation-filter'

function todayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + weeks * 7); return d.toISOString().split('T')[0]
}

function jan1ISO(): string { return `${new Date().getUTCFullYear()}-01-01` }

const SHORT_MONTH_ORDER: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

function periodToSortKey(p: string): number {
  const parts = p.split('-')
  if (/^\d{4}$/.test(parts[0])) return parseInt(parts[0]) * 12 + (parseInt(parts[1]) - 1)
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase()
  return parseInt(parts[1]) * 12 + (SHORT_MONTH_ORDER[cap] ?? 0)
}

export const GET = withAuth(async (request: NextRequest) => {
  const requestedMonth = request.nextUrl.searchParams.get('month')
  const isAllPeriods = requestedMonth === '__all__'
  const designationGroup = (request.nextUrl.searchParams.get('designationGroup') ?? 'all') as DesignationFilter

  const now = new Date()
  const lookbackDate = new Date(now.getFullYear() - 1, now.getMonth())
  const oneYearAgoStr = `${lookbackDate.getFullYear()}-${String(lookbackDate.getMonth() + 1).padStart(2, '0')}`

  const overviewPromise = (!isAllPeriods && requestedMonth)
    ? queryOne<any>('SELECT * FROM v_compliance_overview WHERE period_month = $1', [requestedMonth])
    : queryOne<any>('SELECT * FROM v_compliance_overview ORDER BY period_month DESC LIMIT 1', [])

  const [
    _overview,
    _empCount,
    _exitedCount,
    _servingNoticeCount,
    _contractCount,
    _chargeRows,
    _empRows,
    _overAlloc,
    _projects,
    _benchCount,
    _zeroCompRaw,
    _subTeamRows,
    _tcYtdRows,
    _empChargeRaw,
    _currentAllocRaw,
    _regionChargeRows,
    _deptStatusRows,
  ] = await Promise.all([
    overviewPromise,
    queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM employees WHERE is_active = true', []),
    queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM employees WHERE is_active = false', []),
    queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM employees WHERE employee_status = $1', ['Serving notice period']),
    queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM employees WHERE employee_status = $1', ['Contract']),
    query<any>('SELECT * FROM v_chargeability_by_dept ORDER BY period_month DESC', []),
    query<any>('SELECT * FROM v_employee_details WHERE is_active = true ORDER BY name', []),
    query<any>('SELECT * FROM fn_over_allocated($1, $2)', [todayISO(), addWeeks(todayISO(), 4)]),
    query<any>('SELECT * FROM v_project_summary', []),
    queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM v_available_resources', []),
    query<any>(`
      SELECT tc.period_month, tc.compliance_pct, tc.total_hours,
        e.employee_id, e.name AS emp_name,
        d.name AS dept_name,
        sf.name AS sub_function_name,
        des.name AS designation_name,
        l.name AS location_name
      FROM timesheet_compliance tc
      INNER JOIN employees e ON e.id = tc.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN sub_functions sf ON sf.id = e.sub_function_id
      LEFT JOIN designations des ON des.id = e.designation_id
      LEFT JOIN locations l ON l.id = e.location_id
      WHERE tc.compliance_pct = 0
      ORDER BY tc.period_month DESC
    `, []),
    query<any>(
      'SELECT department, sub_team, period_month, headcount, avg_chargeability, avg_compliance, total_chargeable, total_available, total_hours_logged FROM v_chargeability_by_subteam ORDER BY period_month ASC',
      []
    ),
    query<any>('SELECT chargeable_hours, available_hours, period_start FROM timesheet_compliance WHERE period_start >= $1', [jan1ISO()]),
    query<any>(`
      SELECT tc.period_month, tc.chargeable_hours, tc.available_hours, tc.total_hours, tc.compliance_pct,
        e.employee_id
      FROM timesheet_compliance tc
      INNER JOIN employees e ON e.id = tc.employee_id
      WHERE tc.period_month >= $1
      ORDER BY tc.period_month DESC
      LIMIT 20000
    `, [`${new Date().getFullYear()}-01`]),
    query<any>(`
      SELECT fa.allocation_pct, fa.allocation_status,
        p.name AS project_name,
        e.employee_id
      FROM forecast_allocations fa
      INNER JOIN employees e ON e.id = fa.employee_id
      LEFT JOIN projects p ON p.id = fa.project_id
      WHERE fa.week_start >= $1 AND fa.week_start <= $2 AND fa.allocation_status != 'Available'
      ORDER BY fa.allocation_pct DESC
    `, [addWeeks(todayISO(), -1), addWeeks(todayISO(), 1)]),
    query<any>(
      'SELECT region, period_month, headcount, avg_chargeability, avg_compliance, total_chargeable, total_available, total_hours_logged FROM v_chargeability_by_region ORDER BY period_month DESC',
      []
    ),
    query<any>('SELECT department, sub_function, is_active, employee_status FROM v_employee_details', []),
  ])

  // Reshape raw pg rows into the nested shape expected by the aggregation logic below
  const zeroCompData = _zeroCompRaw.map((r: any) => ({
    period_month: r.period_month,
    compliance_pct: r.compliance_pct,
    total_hours: r.total_hours,
    employees: {
      employee_id: r.employee_id,
      name: r.emp_name,
      departments: { name: r.dept_name },
      sub_functions: { name: r.sub_function_name },
      designations: { name: r.designation_name },
      locations: { name: r.location_name },
    },
  }))

  const empChargeData = _empChargeRaw.map((r: any) => ({
    period_month: r.period_month,
    chargeable_hours: r.chargeable_hours,
    available_hours: r.available_hours,
    total_hours: r.total_hours,
    compliance_pct: r.compliance_pct,
    employees: { employee_id: r.employee_id },
  }))

  const currentAllocData = _currentAllocRaw.map((r: any) => ({
    allocation_pct: r.allocation_pct,
    allocation_status: r.allocation_status,
    projects: { name: r.project_name },
    employees: { employee_id: r.employee_id },
  }))

  const overview = _overview
  const totalEmployees = Number(_empCount?.count ?? 0)
  const exitedCount = Number(_exitedCount?.count ?? 0)
  const servingNoticeCount = Number(_servingNoticeCount?.count ?? 0)
  const contractCount = Number(_contractCount?.count ?? 0)
  const chargeRows = _chargeRows.filter((r: any) => !isExcluded(r.department))
  const empRows = _empRows.filter((r: any) =>
    !isExcluded(r.department, r.sub_function) &&
    matchesDesignationFilter(r.designation, designationGroup)
  )
  const overAlloc = _overAlloc
  const projects = _projects
  const benchCount = Number(_benchCount?.count ?? 0)

  const availablePeriods = [...new Set(chargeRows.map((r: any) => r.period_month as string))].sort((a, b) => periodToSortKey(b) - periodToSortKey(a))
  const currentPeriod = isAllPeriods ? null : ((requestedMonth && availablePeriods.includes(requestedMonth)) ? requestedMonth : availablePeriods[0])
  const previousPeriodIdx = availablePeriods.indexOf(currentPeriod ?? '') + 1
  const previousPeriod = isAllPeriods ? undefined : (previousPeriodIdx < availablePeriods.length ? availablePeriods[previousPeriodIdx] : undefined)

  const allZeroCompRows = zeroCompData.filter((r: any) =>
    !isExcluded(r.employees?.departments?.name, r.employees?.sub_functions?.name) &&
    matchesDesignationFilter(r.employees?.designations?.name, designationGroup)
  )
  const zeroCompRows = currentPeriod ? allZeroCompRows.filter((r: any) => r.period_month === currentPeriod) : allZeroCompRows
  const timesheetGapCount = zeroCompRows.length
  const timesheetGaps = zeroCompRows.map((r: any) => ({ name: r.employees?.name ?? '', empId: r.employees?.employee_id ?? '', department: r.employees?.departments?.name ?? '', subTeam: normalizeSubFunction(r.employees?.sub_functions?.name ?? ''), designation: r.employees?.designations?.name ?? '', location: r.employees?.locations?.name ?? '', compliancePct: 0, period: r.period_month ?? '', wc1: null, wc8: null }))

  type SubTeamCount = { subTeam: string; count: number }
  const gapDeptMap = new Map<string, { count: number; subTeams: Map<string, number> }>()
  for (const gap of timesheetGaps) {
    const dept = gap.department || 'Unknown'; const sub = gap.subTeam || ''
    if (!gapDeptMap.has(dept)) gapDeptMap.set(dept, { count: 0, subTeams: new Map() })
    const entry = gapDeptMap.get(dept)!; entry.count++
    if (sub) entry.subTeams.set(sub, (entry.subTeams.get(sub) ?? 0) + 1)
  }
  const timesheetGapsByTeam = [...gapDeptMap.entries()].map(([department, v]) => ({ department, count: v.count, subTeams: [...v.subTeams.entries()].map(([subTeam, count]) => ({ subTeam, count } as SubTeamCount)).sort((a, b) => b.count - a.count) })).sort((a, b) => b.count - a.count)

  const ytdRows = _tcYtdRows as Array<{ chargeable_hours: number; available_hours: number }>
  const ytdTotals = ytdRows.reduce((acc, r) => ({ charge: acc.charge + (Number(r.chargeable_hours) || 0), avail: acc.avail + (Number(r.available_hours) || 0) }), { charge: 0, avail: 0 })
  const utilizationYtd = ytdTotals.avail > 0 ? Number((ytdTotals.charge / ytdTotals.avail * 100).toFixed(1)) : 0

  // For "All Months" mode: aggregate KPI from all chargeRows
  const allPeriodsAgg = chargeRows.reduce((acc: any, r: any) => ({
    charge: acc.charge + (Number(r.total_chargeable) || 0),
    avail:  acc.avail  + (Number(r.total_available)  || 0),
    hours:  acc.hours  + (Number(r.total_hours_logged) || 0),
  }), { charge: 0, avail: 0, hours: 0 })

  const periodHeadcount = (overview as any)?.total_employees ?? totalEmployees
  const kpiUtilization = isAllPeriods
    ? (allPeriodsAgg.avail > 0 ? Number((allPeriodsAgg.charge / allPeriodsAgg.avail * 100).toFixed(1)) : 0)
    : (overview ? Number(Number((overview as any).avg_chargeability).toFixed(1)) : 0)
  const kpiCompliance = isAllPeriods
    ? (allPeriodsAgg.avail > 0 ? Number((allPeriodsAgg.hours / allPeriodsAgg.avail * 100).toFixed(1)) : 0)
    : (overview ? Number(Number((overview as any).avg_compliance).toFixed(1)) : 0)
  const kpi = { totalCapacity: totalEmployees, forecastedFte: periodHeadcount, utilization: kpiUtilization, utilizationYtd, avgCompliance: kpiCompliance, benchCount, timesheetGapCount, overAllocated: new Set(overAlloc.map((r: any) => r.employee_id ?? r.emp_code)).size, variance: Number((kpiUtilization - kpiCompliance).toFixed(1)), activeResources: periodHeadcount, servingNotice: servingNoticeCount, contract: contractCount, exited: exitedCount }

  const currentYearStr = String(new Date().getUTCFullYear())
  // YTD: accumulate hours across periods then compute ratio at the end
  type DeptAgg = { current: number; previous: number; headcount: number; ytdChargeHrs: number; ytdAvailHrs: number; ytdTotalHrs: number; ytdAvailForComp: number }
  const chargeByDept = new Map<string, DeptAgg>(); const compByDept = new Map<string, DeptAgg>()
  for (const r of chargeRows as any[]) {
    const dept = r.department
    if (!chargeByDept.has(dept)) chargeByDept.set(dept, { current: 0, previous: 0, headcount: 0, ytdChargeHrs: 0, ytdAvailHrs: 0, ytdTotalHrs: 0, ytdAvailForComp: 0 })
    if (!compByDept.has(dept)) compByDept.set(dept, { current: 0, previous: 0, headcount: 0, ytdChargeHrs: 0, ytdAvailHrs: 0, ytdTotalHrs: 0, ytdAvailForComp: 0 })
    const cur = !isAllPeriods && r.period_month === currentPeriod
    const prev = !isAllPeriods && r.period_month === previousPeriod
    if (cur) { chargeByDept.get(dept)!.current = Number(Number(r.avg_chargeability).toFixed(1)) || 0; chargeByDept.get(dept)!.headcount = Number(r.headcount) || 0; compByDept.get(dept)!.current = Number(Number(r.avg_compliance).toFixed(1)) || 0; compByDept.get(dept)!.headcount = Number(r.headcount) || 0 }
    if (prev) { chargeByDept.get(dept)!.previous = Number(Number(r.avg_chargeability).toFixed(1)) || 0; compByDept.get(dept)!.previous = Number(Number(r.avg_compliance).toFixed(1)) || 0 }
    // Accumulate YTD: all periods when isAllPeriods, else current year only
    if (isAllPeriods || String(r.period_month).includes(currentYearStr)) {
      chargeByDept.get(dept)!.ytdChargeHrs += Number(r.total_chargeable) || 0
      chargeByDept.get(dept)!.ytdAvailHrs  += Number(r.total_available) || 0
      compByDept.get(dept)!.ytdTotalHrs    += Number(r.total_hours_logged) || 0
      compByDept.get(dept)!.ytdAvailForComp += Number(r.total_available) || 0
      if (isAllPeriods) {
        // Use max headcount seen across all periods as the dept headcount
        const hc = Number(r.headcount) || 0
        if (hc > chargeByDept.get(dept)!.headcount) { chargeByDept.get(dept)!.headcount = hc; compByDept.get(dept)!.headcount = hc }
      }
    }
  }
  // For all-periods: set current = aggregate across all available periods
  if (isAllPeriods) {
    for (const [, agg] of chargeByDept.entries()) { agg.current = agg.ytdAvailHrs > 0 ? Number((agg.ytdChargeHrs / agg.ytdAvailHrs * 100).toFixed(1)) : 0 }
    for (const [, agg] of compByDept.entries())   { agg.current = agg.ytdAvailForComp > 0 ? Number((agg.ytdTotalHrs / agg.ytdAvailForComp * 100).toFixed(1)) : 0 }
  }
  const chargeability = [...chargeByDept.entries()].map(([department, { current, previous, headcount, ytdChargeHrs, ytdAvailHrs }]) => ({ department, headcount, current, previous, ytd: ytdAvailHrs > 0 ? Number((ytdChargeHrs / ytdAvailHrs * 100).toFixed(1)) : null }))
  const compliance = [...compByDept.entries()].map(([department, { current, previous, headcount, ytdTotalHrs, ytdAvailForComp }]) => ({ department, headcount, current, previous, ytd: ytdAvailForComp > 0 ? Number((ytdTotalHrs / ytdAvailForComp * 100).toFixed(1)) : null }))

  const hPct = (charge: number, avail: number) => avail > 0 ? Number((charge / avail * 100).toFixed(1)) : 0
  const cPct = (total: number, avail: number) => avail > 0 ? Number((total / avail * 100).toFixed(1)) : 0

  // Sub-team aggregation from v_chargeability_by_subteam (pre-aggregated view — reliable)
  type SubAgg = { department: string; subTeam: string; headcount: number; curChargeHrs: number; curAvailHrs: number; curTotalHrs: number; prevChargeHrs: number; prevAvailHrs: number; prevTotalHrs: number; trendMap: Map<string, { chargeHrs: number; availHrs: number; totalHrs: number }> }
  const subMap = new Map<string, SubAgg>()

  // Seed headcounts from active employees
  for (const emp of empRows as any[]) {
    const dept = emp.department ?? ''; const sub = normalizeSubFunction(emp.sub_function ?? '') || dept
    if (!dept || !sub) continue
    const key = `${dept}|${sub}`
    if (!subMap.has(key)) subMap.set(key, { department: dept, subTeam: sub, headcount: 0, curChargeHrs: 0, curAvailHrs: 0, curTotalHrs: 0, prevChargeHrs: 0, prevAvailHrs: 0, prevTotalHrs: 0, trendMap: new Map() })
    subMap.get(key)!.headcount++
  }

  // Accumulate hours from the pre-aggregated view (avoids per-row join issues)
  for (const r of _subTeamRows as any[]) {
    const dept = r.department ?? ''; const sub = normalizeSubFunction(r.sub_team ?? '') || dept
    if (!dept || !sub || isExcluded(dept, sub)) continue
    const key = `${dept}|${sub}`
    if (!subMap.has(key)) subMap.set(key, { department: dept, subTeam: sub, headcount: 0, curChargeHrs: 0, curAvailHrs: 0, curTotalHrs: 0, prevChargeHrs: 0, prevAvailHrs: 0, prevTotalHrs: 0, trendMap: new Map() })
    const entry = subMap.get(key)!
    const chargeHrs = Number(r.total_chargeable) || 0; const availHrs = Number(r.total_available) || 0; const totalHrs = Number(r.total_hours_logged) || 0
    if (isAllPeriods || r.period_month === currentPeriod) { entry.curChargeHrs += chargeHrs; entry.curAvailHrs += availHrs; entry.curTotalHrs += totalHrs }
    if (!isAllPeriods && r.period_month === previousPeriod) { entry.prevChargeHrs += chargeHrs; entry.prevAvailHrs += availHrs; entry.prevTotalHrs += totalHrs }
    if (!entry.trendMap.has(r.period_month)) entry.trendMap.set(r.period_month, { chargeHrs: 0, availHrs: 0, totalHrs: 0 })
    const te = entry.trendMap.get(r.period_month)!; te.chargeHrs += chargeHrs; te.availHrs += availHrs; te.totalHrs += totalHrs
  }

  const chargeabilityBySubTeam = [...subMap.values()].map(e => {
    let ytdCharge = 0, ytdAvail = 0
    for (const [period, te] of e.trendMap.entries()) { if (!String(period).includes(currentYearStr)) continue; ytdCharge += te.chargeHrs; ytdAvail += te.availHrs }
    return { department: e.department, subTeam: e.subTeam, headcount: e.headcount, current: hPct(e.curChargeHrs, e.curAvailHrs), previous: hPct(e.prevChargeHrs, e.prevAvailHrs), ytd: ytdAvail > 0 ? hPct(ytdCharge, ytdAvail) : null }
  }).sort((a, b) => a.department.localeCompare(b.department) || a.subTeam.localeCompare(b.subTeam))
  const complianceBySubTeam = [...subMap.values()].map(e => {
    let ytdTotal = 0, ytdAvail = 0
    for (const [period, te] of e.trendMap.entries()) { if (!String(period).includes(currentYearStr)) continue; ytdTotal += te.totalHrs; ytdAvail += te.availHrs }
    return { department: e.department, subTeam: e.subTeam, headcount: e.headcount, current: cPct(e.curTotalHrs, e.curAvailHrs), previous: cPct(e.prevTotalHrs, e.prevAvailHrs), ytd: ytdAvail > 0 ? cPct(ytdTotal, ytdAvail) : null }
  }).sort((a, b) => a.department.localeCompare(b.department) || a.subTeam.localeCompare(b.subTeam))

  const chargeabilityTrendBySubTeam = [...subMap.values()].map(e => ({ department: e.department, subTeam: e.subTeam, trend: [...e.trendMap.entries()].sort(([a], [b]) => periodToSortKey(a) - periodToSortKey(b)).map(([period, { chargeHrs, availHrs }]) => ({ period, value: hPct(chargeHrs, availHrs) })) }))
  const complianceTrendBySubTeam = [...subMap.values()].map(e => ({ department: e.department, subTeam: e.subTeam, trend: [...e.trendMap.entries()].sort(([a], [b]) => periodToSortKey(a) - periodToSortKey(b)).map(([period, { totalHrs, availHrs }]) => ({ period, value: cPct(totalHrs, availHrs) })) }))

  const deptChargeTrendMap = new Map<string, Map<string, { total: number; hc: number }>>(); const deptCompTrendMap = new Map<string, Map<string, { total: number; hc: number }>>()
  for (const r of chargeRows as any[]) {
    const dept = r.department; const period = r.period_month; if (!dept || !period) continue; const hc = Number(r.headcount) || 1
    if (!deptChargeTrendMap.has(dept)) deptChargeTrendMap.set(dept, new Map()); if (!deptCompTrendMap.has(dept)) deptCompTrendMap.set(dept, new Map())
    const cp = deptChargeTrendMap.get(dept)!; const xp = deptCompTrendMap.get(dept)!
    if (!cp.has(period)) cp.set(period, { total: 0, hc: 0 }); if (!xp.has(period)) xp.set(period, { total: 0, hc: 0 })
    cp.get(period)!.total += (Number(r.avg_chargeability) || 0) * hc; cp.get(period)!.hc += hc
    xp.get(period)!.total += (Number(r.avg_compliance) || 0) * hc; xp.get(period)!.hc += hc
  }
  const chargeabilityTrendByDept = [...deptChargeTrendMap.entries()].map(([department, pMap]) => ({ department, trend: [...pMap.entries()].sort(([a], [b]) => periodToSortKey(a) - periodToSortKey(b)).map(([period, { total, hc }]) => ({ period, value: hc > 0 ? Number((total / hc).toFixed(1)) : 0 })) }))
  const complianceTrendByDept = [...deptCompTrendMap.entries()].map(([department, pMap]) => ({ department, trend: [...pMap.entries()].sort(([a], [b]) => periodToSortKey(a) - periodToSortKey(b)).map(([period, { total, hc }]) => ({ period, value: hc > 0 ? Number((total / hc).toFixed(1)) : 0 })) }))

  const empChargeMap = new Map<string, { mtd: number | null; complianceMtd: number | null; ytdChargeHrs: number; ytdAvailHrs: number }>()
  for (const r of empChargeData as any[]) {
    const empCode = r.employees?.employee_id ?? ''; if (!empCode) continue
    if (!empChargeMap.has(empCode)) empChargeMap.set(empCode, { mtd: null, complianceMtd: null, ytdChargeHrs: 0, ytdAvailHrs: 0 })
    const entry = empChargeMap.get(empCode)!
    const chargeHrs = Number(r.chargeable_hours) || 0; const availHrs = Number(r.available_hours) || 0; const totalHrs = Number(r.total_hours) || 0
    if (r.period_month === currentPeriod && entry.mtd === null) entry.mtd = availHrs > 0 ? Number((chargeHrs / availHrs * 100).toFixed(1)) : 0
    if (r.period_month === currentPeriod && entry.complianceMtd === null) entry.complianceMtd = Number(r.compliance_pct) > 0 ? Number((Number(r.compliance_pct) * 100).toFixed(1)) : (availHrs > 0 ? Number((totalHrs / availHrs * 100).toFixed(1)) : 0)
    entry.ytdChargeHrs += chargeHrs; entry.ytdAvailHrs += availHrs
  }

  const currentProjectMap = new Map<string, string>(); const jipEmployees = new Set<string>()
  for (const r of currentAllocData as any[]) {
    const empCode = r.employees?.employee_id ?? ''; if (!empCode) continue
    const status = (r.allocation_status ?? '').toLowerCase(); if (status === 'jip') jipEmployees.add(empCode)
    if (!currentProjectMap.has(empCode)) { const projectName = r.projects?.name ?? r.allocation_status ?? ''; if (projectName) currentProjectMap.set(empCode, projectName) }
  }

  const employees = empRows.map((e: any) => {
    const empCode = e.emp_code ?? ''; const chargeEntry = empChargeMap.get(empCode); const isJip = jipEmployees.has(empCode)
    return { department: e.department ?? '', subFunction: normalizeSubFunction(e.sub_function ?? ''), empId: empCode, name: e.name ?? '', email: e.email ?? '', designation: e.designation ?? '', location: e.location ?? '', region: e.region ?? '', dateOfJoining: e.date_of_joining ?? '', employeeStatus: e.employee_status ?? '', status: e.is_active ? 'green' : 'red', chargeabilityMTD: isJip ? 0 : (chargeEntry?.mtd ?? null), complianceMTD: chargeEntry?.complianceMtd ?? null, chargeabilityYTD: chargeEntry && chargeEntry.ytdAvailHrs > 0 ? Number((chargeEntry.ytdChargeHrs / chargeEntry.ytdAvailHrs * 100).toFixed(1)) : null, currentProject: currentProjectMap.get(empCode) ?? null }
  })

  const locMap = new Map<string, any>()
  for (const emp of empRows as any[]) {
    const loc = emp.location ?? 'Unknown'
    if (!locMap.has(loc)) locMap.set(loc, { location: loc, region: emp.region ?? '', analyst: null, assocConsultant: null, consultant: null, asstManager: null, manager: null, assocDirector: null, total: 0 })
    const row = locMap.get(loc)!; row.total++; const desg = (emp.designation ?? '').toLowerCase()
    if (desg.includes('analyst')) row.analyst = (row.analyst ?? 0) + 1
    else if (desg.includes('associate consultant')) row.assocConsultant = (row.assocConsultant ?? 0) + 1
    else if (desg.includes('consultant')) row.consultant = (row.consultant ?? 0) + 1
    else if (desg.includes('assistant manager')) row.asstManager = (row.asstManager ?? 0) + 1
    else if (desg.includes('manager')) row.manager = (row.manager ?? 0) + 1
    else if (desg.includes('director')) row.assocDirector = (row.assocDirector ?? 0) + 1
  }
  const allocation = [...locMap.values()].sort((a: any, b: any) => a.location.localeCompare(b.location))

  const deptCap = new Map<string, number>(); for (const emp of empRows as any[]) deptCap.set(emp.department ?? 'Other', (deptCap.get(emp.department ?? 'Other') ?? 0) + 1)
  const capacityByServiceLine = [...deptCap.entries()].map(([serviceLine, capacity]) => ({ serviceLine, capacity, forecast: capacity, actual: capacity, subServiceLines: [] as string[] }))
  const locCap = new Map<string, number>(); for (const emp of empRows as any[]) locCap.set(emp.location ?? 'Other', (locCap.get(emp.location ?? 'Other') ?? 0) + 1)
  const capacityByLocation = [...locCap.entries()].map(([location, capacity]) => ({ location, capacity, forecast: capacity, actual: capacity }))

  const periodUtil = new Map<string, { charge: number; avail: number }>()
  for (const r of chargeRows as any[]) { const p = r.period_month; if (!periodUtil.has(p)) periodUtil.set(p, { charge: 0, avail: 0 }); const e = periodUtil.get(p)!; e.charge += Number(r.total_chargeable) || 0; e.avail += Number(r.total_available) || 0 }
  const utilizationTrend = [...periodUtil.entries()].sort(([a], [b]) => (a as string).localeCompare(b as string)).map(([week, { charge, avail }]) => { const avg = avail > 0 ? Math.round(charge / avail * 100 * 10) / 10 : 0; return { week, forecast: avg, actual: avg } })

  const overAllocList = overAlloc.map((r: any) => ({ id: r.employee_id ?? r.emp_code, empCode: r.emp_code, name: r.employee_name, weekStart: r.week_start, totalAllocation: r.total_allocation, projectCount: r.project_count }))
  const projectList = projects.map((p: any) => ({ id: p.project_id, name: p.project_name, client: p.client ?? '', projectType: p.project_type ?? '', status: p.status ?? 'active', teamSize: p.team_member_count ?? 0, firstWeek: p.first_week, lastWeek: p.last_week }))

  type RegionAgg = { curCharge: number; curAvail: number; curComp: number; curHC: number; prevCharge: number; prevAvail: number; prevComp: number; prevHC: number }
  const chargeByRegion = new Map<string, RegionAgg>()
  for (const r of _regionChargeRows as any[]) {
    const region = r.region ?? ''; if (!region) continue
    if (!chargeByRegion.has(region)) chargeByRegion.set(region, { curCharge: 0, curAvail: 0, curComp: 0, curHC: 0, prevCharge: 0, prevAvail: 0, prevComp: 0, prevHC: 0 })
    const agg = chargeByRegion.get(region)!; const hc = Number(r.headcount) || 0
    if (r.period_month === currentPeriod) { agg.curCharge += Number(r.total_chargeable) || 0; agg.curAvail += Number(r.total_available) || 0; agg.curComp += Number(r.total_hours_logged) || 0; agg.curHC += hc }
    if (r.period_month === previousPeriod) { agg.prevCharge += Number(r.total_chargeable) || 0; agg.prevAvail += Number(r.total_available) || 0; agg.prevComp += Number(r.total_hours_logged) || 0; agg.prevHC += hc }
  }
  const chargeabilityByRegion = [...chargeByRegion.entries()].map(([region, v]) => ({ region, current: hPct(v.curCharge, v.curAvail), headcount: v.curHC }))
  const complianceByRegion = [...chargeByRegion.entries()].map(([region, v]) => ({ region, current: cPct(v.curComp, v.curAvail), headcount: v.curHC }))

  type StatusCounts = { active: number; exited: number; servingNotice: number; contract: number }
  const deptStatusMap = new Map<string, StatusCounts>(); const subTeamStatusMap = new Map<string, StatusCounts>()
  function bumpStatus(map: Map<string, StatusCounts>, key: string, status: string, isActive: boolean) {
    if (!map.has(key)) map.set(key, { active: 0, exited: 0, servingNotice: 0, contract: 0 })
    const agg = map.get(key)!
    if (status === 'Serving notice period') agg.servingNotice++; else if (status === 'Contract') agg.contract++; else if (isActive) agg.active++; else agg.exited++
  }
  for (const r of _deptStatusRows as any[]) {
    const dept = r.department ?? ''; const sub = normalizeSubFunction(r.sub_function ?? '') || dept
    if (!dept || isExcluded(dept, r.sub_function)) continue
    const status: string = r.employee_status ?? ''; const isActive: boolean = r.is_active === true
    bumpStatus(deptStatusMap, dept, status, isActive); bumpStatus(subTeamStatusMap, `${dept}|${sub}`, status, isActive)
  }
  const deptStatusBreakdown = [...deptStatusMap.entries()].map(([department, counts]) => ({ department, ...counts, subTeams: [...subTeamStatusMap.entries()].filter(([k]) => k.startsWith(`${department}|`)).map(([k, c]) => ({ subTeam: k.slice(department.length + 1), ...c })).sort((a, b) => a.subTeam.localeCompare(b.subTeam)) })).sort((a, b) => a.department.localeCompare(b.department))

  return NextResponse.json({ kpi, chargeability, chargeabilityBySubTeam, compliance, complianceBySubTeam, employees, allocation, capacityByServiceLine, capacityByLocation, utilizationTrend, overAllocList, projectList, timesheetGaps, timesheetGapsByTeam, availablePeriods, currentPeriod: currentPeriod ?? null, chargeabilityByRegion, complianceByRegion, chargeabilityTrendByDept, chargeabilityTrendBySubTeam, complianceTrendByDept, complianceTrendBySubTeam, deptStatusBreakdown })
})
