import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'

const SHORT_MONTH_ORDER: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function periodToSortKey(p: string): number {
  const parts = p.split('-')
  if (/^\d{4}$/.test(parts[0])) return parseInt(parts[0]) * 12 + (parseInt(parts[1]) - 1)
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase()
  return parseInt(parts[1]) * 12 + (SHORT_MONTH_ORDER[cap] ?? 0)
}

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export const GET = withAuth(async (request: NextRequest) => {
  const sb = getSupabase()
  const requestedPeriod = request.nextUrl.searchParams.get('period')

  const { data: periodsRaw } = await sb.from('v_compliance_overview').select('period_month')
  const availablePeriods = [...new Set((periodsRaw ?? []).map((r: any) => r.period_month as string))]
    .sort((a, b) => periodToSortKey(b) - periodToSortKey(a))

  const currentPeriod = (requestedPeriod && availablePeriods.includes(requestedPeriod))
    ? requestedPeriod
    : availablePeriods[0] ?? null

  if (!currentPeriod) {
    return NextResponse.json({ period: null, availablePeriods: [], employees: [], weekRange: null })
  }

  const { data: rawRows, error } = await sb
    .from('timesheet_compliance')
    .select(`
      period_month, available_hours, chargeable_hours, non_chargeable_hours,
      compliance_pct, chargeability_pct,
      employees!inner(
        id, employee_id, name, email, employee_region, employee_status, date_of_joining,
        departments(name), sub_functions(name), designations(name),
        locations(name, regions(name))
      )
    `)
    .eq('period_month', currentPeriod)
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (rawRows ?? []).filter((r: any) => !isExcluded(r.employees?.departments?.name, r.employees?.sub_functions?.name))

  const weekStart = todayISO()
  const weekEnd   = addDays(weekStart, 6)

  const { data: allocRows } = await sb
    .from('forecast_allocations')
    .select('employee_id, allocation_pct, allocation_status, week_start, projects(name, project_type)')
    .gte('week_start', addDays(weekStart, -7))
    .lte('week_start', addDays(weekStart, 7))
    .neq('allocation_status', 'available')
    .neq('allocation_status', 'Available')
    .order('allocation_pct', { ascending: false })
    .limit(5000)

  type ProjectEntry = { name: string; allocPct: number; status: string; projectType: string }
  const allocMap = new Map<string, ProjectEntry[]>()
  for (const a of (allocRows ?? []) as any[]) {
    const empId = a.employee_id as string
    if (!empId || !a.projects?.name) continue
    if (!allocMap.has(empId)) allocMap.set(empId, [])
    const existing = allocMap.get(empId)!
    if (!existing.find(p => p.name === a.projects.name)) {
      existing.push({ name: a.projects.name, allocPct: Number(a.allocation_pct) || 0, status: a.allocation_status ?? '', projectType: a.projects.project_type ?? '' })
    }
  }

  const employees = rows.map((r: any) => {
    const internalId = r.employees?.id ?? ''
    const regionName = r.employees?.locations?.regions?.name ?? r.employees?.employee_region ?? ''
    return {
      empId: r.employees?.employee_id ?? '',
      internalId,
      name: r.employees?.name ?? '',
      email: r.employees?.email ?? '',
      department: r.employees?.departments?.name ?? '',
      subFunction: normalizeSubFunction(r.employees?.sub_functions?.name ?? ''),
      region: regionName,
      location: r.employees?.locations?.name ?? '',
      designation: r.employees?.designations?.name ?? '',
      employeeStatus: r.employees?.employee_status ?? '',
      dateOfJoining: r.employees?.date_of_joining ?? null,
      period: r.period_month ?? '',
      availableHours: Number(r.available_hours) || 0,
      chargeableHours: Number(r.chargeable_hours) || 0,
      nonChargeableHours: Number(r.non_chargeable_hours) || 0,
      chargeabilityPct: Number((Number(r.chargeability_pct) * 100).toFixed(1)),
      compliancePct: Number((Number(r.compliance_pct) * 100).toFixed(1)),
      currentProjects: allocMap.get(internalId) ?? [],
    }
  })

  return NextResponse.json({ period: currentPeriod, availablePeriods, employees, weekRange: { start: weekStart, end: weekEnd } })
})
