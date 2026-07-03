import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'

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
  const sb = getSupabase()
  const requestedMonth = request.nextUrl.searchParams.get('month')

  const now = new Date()
  const lookbackDate = new Date(now.getFullYear() - 1, now.getMonth())
  const oneYearAgoStr = `${lookbackDate.getFullYear()}-${String(lookbackDate.getMonth() + 1).padStart(2, '0')}`

  const overviewQuery = requestedMonth
    ? sb.from('v_compliance_overview').select('*').eq('period_month', requestedMonth).maybeSingle()
    : sb.from('v_compliance_overview').select('*').order('period_month', { ascending: false }).limit(1).maybeSingle()

  const [overviewRes, employeeCountRes, exitedCountRes, servingNoticeCountRes, contractCountRes, chargeRes, empRes, overAllocRes, projectsRes, availRes, zeroCompRes, tcSubTeamRes, tcYtdRes, empChargeRes, currentAllocRes, regionChargeRes, deptStatusRes] = await Promise.all([
    overviewQuery,
    sb.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true),
    sb.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', false),
    sb.from('employees').select('*', { count: 'exact', head: true }).eq('employee_status', 'Serving notice period'),
    sb.from('employees').select('*', { count: 'exact', head: true }).eq('employee_status', 'Contract'),
    sb.from('v_chargeability_by_dept').select('*').order('period_month', { ascending: false }),
    sb.from('v_employee_details').select('*').eq('is_active', true).order('name'),
    sb.rpc('fn_over_allocated', { p_from: todayISO(), p_to: addWeeks(todayISO(), 4) }),
    sb.from('v_project_summary').select('*'),
    sb.from('v_available_resources').select('emp_code', { count: 'exact', head: true }),
    sb.from('timesheet_compliance').select('period_month, compliance_pct, total_hours, employees!inner(employee_id, name, designations(name), departments(name), locations(name), sub_functions(name))').eq('compliance_pct', 0).order('period_month', { ascending: false }),
    sb.from('timesheet_compliance').select('period_month, chargeable_hours, available_hours, total_hours, employees!inner(departments(name), sub_functions(name))').gte('period_month', oneYearAgoStr).order('period_month', { ascending: true }).limit(20000),
    sb.from('timesheet_compliance').select('chargeable_hours, available_hours, period_start').gte('period_start', jan1ISO()),
    sb.from('timesheet_compliance').select('period_month, chargeable_hours, available_hours, total_hours, employees!inner(employee_id)').gte('period_month', `${new Date().getFullYear()}-01`).order('period_month', { ascending: false }).limit(20000),
    sb.from('forecast_allocations').select('employee_id, allocation_pct, allocation_status, projects(name), employees!inner(employee_id)').gte('week_start', addWeeks(todayISO(), -1)).lte('week_start', addWeeks(todayISO(), 1)).neq('allocation_status', 'Available').order('allocation_pct', { ascending: false }),
    sb.from('v_chargeability_by_region').select('region, period_month, headcount, avg_chargeability, avg_compliance, total_chargeable, total_available, total_hours_logged').order('period_month', { ascending: false }),
    sb.from('v_employee_details').select('department, sub_function, is_active, employee_status'),
  ])

  const overview = overviewRes.data
  const totalEmployees = employeeCountRes.count ?? 0
  const exitedCount = exitedCountRes.count ?? 0
  const servingNoticeCount = servingNoticeCountRes.count
  const contractCount = contractCountRes.count
  const chargeRows = (chargeRes.data ?? []).filter((r: any) => !isExcluded(r.department))
  const empRows = (empRes.data ?? []).filter((r: any) => !isExcluded(r.department, r.sub_function, r.designation))
  const overAlloc = overAllocRes.data ?? []
  const projects = projectsRes.data ?? []
  const benchCount = availRes.count ?? 0

  const availablePeriods = [...new Set(chargeRows.map((r: any) => r.period_month as string))].sort((a, b) => periodToSortKey(b) - periodToSortKey(a))
  const currentPeriod = (requestedMonth && availablePeriods.includes(requestedMonth)) ? requestedMonth : availablePeriods[0]
  const previousPeriodIdx = availablePeriods.indexOf(currentPeriod ?? '') + 1
  const previousPeriod = previousPeriodIdx < availablePeriods.length ? availablePeriods[previousPeriodIdx] : undefined

  const allZeroCompRows = (zeroCompRes.data ?? []).filter((r: any) => !isExcluded(r.employees?.departments?.name, r.employees?.sub_functions?.name, r.employees?.designations?.name))
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

  const ytdRows = (tcYtdRes.data ?? []) as Array<{ chargeable_hours: number; available_hours: number }>
  const ytdTotals = ytdRows.reduce((acc, r) => ({ charge: acc.charge + (Number(r.chargeable_hours) || 0), avail: acc.avail + (Number(r.available_hours) || 0) }), { charge: 0, avail: 0 })
  const utilizationYtd = ytdTotals.avail > 0 ? Number((ytdTotals.charge / ytdTotals.avail * 100).toFixed(1)) : 0

  const kpi = { totalCapacity: totalEmployees, forecastedFte: (overview as any)?.total_employees ?? 0, utilization: overview ? Number(Number((overview as any).avg_chargeability).toFixed(1)) : 0, utilizationYtd, avgCompliance: overview ? Number(Number((overview as any).avg_compliance).toFixed(1)) : 0, benchCount, timesheetGapCount, overAllocated: new Set(overAlloc.map((r: any) => r.employee_id ?? r.emp_code)).size, variance: overview ? Number((Number((overview as any).avg_chargeability) - Number((overview as any).avg_compliance)).toFixed(1)) : 0, activeResources: totalEmployees, servingNotice: servingNoticeCount, contract: contractCount, exited: exitedCount }

  const currentYearStr = String(new Date().getUTCFullYear())
  // YTD: accumulate hours across periods then compute ratio at the end
  type DeptAgg = { current: number; previous: number; headcount: number; ytdChargeHrs: number; ytdAvailHrs: number; ytdTotalHrs: number; ytdAvailForComp: number }
  const chargeByDept = new Map<string, DeptAgg>(); const compByDept = new Map<string, DeptAgg>()
  for (const r of chargeRows as any[]) {
    const dept = r.department
    if (!chargeByDept.has(dept)) chargeByDept.set(dept, { current: 0, previous: 0, headcount: 0, ytdChargeHrs: 0, ytdAvailHrs: 0, ytdTotalHrs: 0, ytdAvailForComp: 0 })
    if (!compByDept.has(dept)) compByDept.set(dept, { current: 0, previous: 0, headcount: 0, ytdChargeHrs: 0, ytdAvailHrs: 0, ytdTotalHrs: 0, ytdAvailForComp: 0 })
    const cur = r.period_month === currentPeriod; const prev = r.period_month === previousPeriod
    if (cur) { chargeByDept.get(dept)!.current = Number(Number(r.avg_chargeability).toFixed(1)) || 0; chargeByDept.get(dept)!.headcount = Number(r.headcount) || 0; compByDept.get(dept)!.current = Number(Number(r.avg_compliance).toFixed(1)) || 0; compByDept.get(dept)!.headcount = Number(r.headcount) || 0 }
    if (prev) { chargeByDept.get(dept)!.previous = Number(Number(r.avg_chargeability).toFixed(1)) || 0; compByDept.get(dept)!.previous = Number(Number(r.avg_compliance).toFixed(1)) || 0 }
    if (String(r.period_month).includes(currentYearStr)) {
      chargeByDept.get(dept)!.ytdChargeHrs += Number(r.total_chargeable) || 0
      chargeByDept.get(dept)!.ytdAvailHrs  += Number(r.total_available) || 0
      compByDept.get(dept)!.ytdTotalHrs    += Number(r.total_hours_logged) || 0
      compByDept.get(dept)!.ytdAvailForComp += Number(r.total_available) || 0
    }
  }
  const chargeability = [...chargeByDept.entries()].map(([department, { current, previous, headcount, ytdChargeHrs, ytdAvailHrs }]) => ({ department, headcount, current, previous, ytd: ytdAvailHrs > 0 ? Number((ytdChargeHrs / ytdAvailHrs * 100).toFixed(1)) : null }))
  const compliance = [...compByDept.entries()].map(([department, { current, previous, headcount, ytdTotalHrs, ytdAvailForComp }]) => ({ department, headcount, current, previous, ytd: ytdAvailForComp > 0 ? Number((ytdTotalHrs / ytdAvailForComp * 100).toFixed(1)) : null }))

  // Sub-team aggregation — accumulate hours, never average percentages
  type SubAgg = { department: string; subTeam: string; headcount: number; curChargeHrs: number; curAvailHrs: number; curTotalHrs: number; prevChargeHrs: number; prevAvailHrs: number; prevTotalHrs: number; trendMap: Map<string, { chargeHrs: number; availHrs: number; totalHrs: number }> }
  const subMap = new Map<string, SubAgg>()
  for (const emp of empRows as any[]) {
    const dept = emp.department ?? ''; const sub = normalizeSubFunction(emp.sub_function ?? '') || dept
    if (!dept || !sub) continue
    const key = `${dept}|${sub}`
    if (!subMap.has(key)) subMap.set(key, { department: dept, subTeam: sub, headcount: 0, curChargeHrs: 0, curAvailHrs: 0, curTotalHrs: 0, prevChargeHrs: 0, prevAvailHrs: 0, prevTotalHrs: 0, trendMap: new Map() })
    subMap.get(key)!.headcount++
  }
  for (const r of (tcSubTeamRes.data ?? []) as any[]) {
    const dept = r.employees?.departments?.name ?? 'Unknown'; const sub = normalizeSubFunction(r.employees?.sub_functions?.name ?? '') || dept
    if (!sub || isExcluded(dept, sub)) continue
    const key = `${dept}|${sub}`; const entry = subMap.get(key); if (!entry) continue
    const chargeHrs = Number(r.chargeable_hours) || 0; const availHrs = Number(r.available_hours) || 0; const totalHrs = Number(r.total_hours) || 0
    if (r.period_month === currentPeriod) { entry.curChargeHrs += chargeHrs; entry.curAvailHrs += availHrs; entry.curTotalHrs += totalHrs }
    if (r.period_month === previousPeriod) { entry.prevChargeHrs += chargeHrs; entry.prevAvailHrs += availHrs; entry.prevTotalHrs += totalHrs }
    if (!entry.trendMap.has(r.period_month)) entry.trendMap.set(r.period_month, { chargeHrs: 0, availHrs: 0, totalHrs: 0 })
    const te = entry.trendMap.get(r.period_month)!; te.chargeHrs += chargeHrs; te.availHrs += availHrs; te.totalHrs += totalHrs
  }
  const hPct = (charge: number, avail: number) => avail > 0 ? Number((charge / avail * 100).toFixed(1)) : 0
  const cPct = (total: number, avail: number) => avail > 0 ? Number((total / avail * 100).toFixed(1)) : 0
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
  for (const r of (empChargeRes.data ?? []) as any[]) {
    const empCode = r.employees?.employee_id ?? ''; if (!empCode) continue
    if (!empChargeMap.has(empCode)) empChargeMap.set(empCode, { mtd: null, complianceMtd: null, ytdChargeHrs: 0, ytdAvailHrs: 0 })
    const entry = empChargeMap.get(empCode)!
    const chargeHrs = Number(r.chargeable_hours) || 0; const availHrs = Number(r.available_hours) || 0; const totalHrs = Number(r.total_hours) || 0
    if (r.period_month === currentPeriod && entry.mtd === null) entry.mtd = availHrs > 0 ? Number((chargeHrs / availHrs * 100).toFixed(1)) : 0
    if (r.period_month === currentPeriod && entry.complianceMtd === null) entry.complianceMtd = availHrs > 0 ? Number((totalHrs / availHrs * 100).toFixed(1)) : 0
    entry.ytdChargeHrs += chargeHrs; entry.ytdAvailHrs += availHrs
  }

  const currentProjectMap = new Map<string, string>(); const jipEmployees = new Set<string>()
  for (const r of (currentAllocRes.data ?? []) as any[]) {
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
  for (const r of (regionChargeRes.data ?? []) as any[]) {
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
  for (const r of (deptStatusRes.data ?? []) as any[]) {
    const dept = r.department ?? ''; const sub = normalizeSubFunction(r.sub_function ?? '') || dept
    if (!dept || isExcluded(dept, r.sub_function)) continue
    const status: string = r.employee_status ?? ''; const isActive: boolean = r.is_active === true
    bumpStatus(deptStatusMap, dept, status, isActive); bumpStatus(subTeamStatusMap, `${dept}|${sub}`, status, isActive)
  }
  const deptStatusBreakdown = [...deptStatusMap.entries()].map(([department, counts]) => ({ department, ...counts, subTeams: [...subTeamStatusMap.entries()].filter(([k]) => k.startsWith(`${department}|`)).map(([k, c]) => ({ subTeam: k.slice(department.length + 1), ...c })).sort((a, b) => a.subTeam.localeCompare(b.subTeam)) })).sort((a, b) => a.department.localeCompare(b.department))

  return NextResponse.json({ kpi, chargeability, chargeabilityBySubTeam, compliance, complianceBySubTeam, employees, allocation, capacityByServiceLine, capacityByLocation, utilizationTrend, overAllocList, projectList, timesheetGaps, timesheetGapsByTeam, availablePeriods, currentPeriod: currentPeriod ?? null, chargeabilityByRegion, complianceByRegion, chargeabilityTrendByDept, chargeabilityTrendBySubTeam, complianceTrendByDept, complianceTrendBySubTeam, deptStatusBreakdown })
})
