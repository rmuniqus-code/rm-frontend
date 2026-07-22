import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'
import { matchesDesignationFilter, type DesignationFilter } from '@/lib/designation-filter'

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
  const requestedPeriod = request.nextUrl.searchParams.get('period')
  const designationGroup = (request.nextUrl.searchParams.get('designationGroup') ?? 'all') as DesignationFilter

  const periodsRaw = await query<{ period_month: string }>(
    'SELECT period_month FROM v_compliance_overview',
    []
  )
  const availablePeriods = [...new Set((periodsRaw ?? []).map((r: any) => r.period_month as string))]
    .sort((a, b) => periodToSortKey(b) - periodToSortKey(a))

  const currentPeriod = (requestedPeriod && availablePeriods.includes(requestedPeriod))
    ? requestedPeriod
    : availablePeriods[0] ?? null

  if (!currentPeriod) {
    return NextResponse.json({ period: null, availablePeriods: [], employees: [], weekRange: null })
  }

  const rawRowsFlat = await query<any>(`
    SELECT
      tc.period_month,
      tc.available_hours,
      tc.chargeable_hours,
      tc.non_chargeable_hours,
      tc.total_hours,
      tc.compliance_pct,
      tc.chargeability_pct,
      e.id               AS employee_internal_id,
      e.employee_id      AS emp_code,
      e.name             AS emp_name,
      e.email,
      e.employee_region,
      e.employee_status,
      e.date_of_joining,
      d.name             AS dept_name,
      sf.name            AS sub_function_name,
      des.name           AS designation_name,
      l.name             AS location_name,
      reg.name           AS region_name
    FROM timesheet_compliance tc
    INNER JOIN employees e  ON e.id  = tc.employee_id
    LEFT JOIN departments d ON d.id  = e.department_id
    LEFT JOIN sub_functions sf  ON sf.id  = e.sub_function_id
    LEFT JOIN designations des  ON des.id = e.designation_id
    LEFT JOIN locations l   ON l.id  = e.location_id
    LEFT JOIN regions reg   ON reg.id = l.region_id
    WHERE tc.period_month = $1
    LIMIT 5000
  `, [currentPeriod])

  if (!rawRowsFlat) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

  // Reshape flat rows to match the nested structure expected by filter/map below
  const rawRows = rawRowsFlat.map((r: any) => ({
    period_month: r.period_month,
    available_hours: r.available_hours,
    chargeable_hours: r.chargeable_hours,
    non_chargeable_hours: r.non_chargeable_hours,
    total_hours: r.total_hours,
    compliance_pct: r.compliance_pct,
    chargeability_pct: r.chargeability_pct,
    department_id: null,   // no direct FK on timesheet_compliance — always fall through to employee dept
    departments: null,
    employees: {
      id: r.employee_internal_id,
      employee_id: r.emp_code,
      name: r.emp_name,
      email: r.email,
      employee_region: r.employee_region,
      employee_status: r.employee_status,
      date_of_joining: r.date_of_joining,
      departments: { name: r.dept_name },
      sub_functions: { name: r.sub_function_name },
      designations: { name: r.designation_name },
      locations: {
        name: r.location_name,
        regions: { name: r.region_name },
      },
    },
  }))

  const rows = rawRows.filter((r: any) =>
    !isExcluded(r.employees?.departments?.name, r.employees?.sub_functions?.name) &&
    matchesDesignationFilter(r.employees?.designations?.name, designationGroup)
  )

  const weekStart = todayISO()
  const weekEnd   = addDays(weekStart, 6)

  const allocRowsFlat = await query<any>(`
    SELECT
      fa.employee_id,
      fa.allocation_pct,
      fa.allocation_status,
      fa.week_start,
      p.name         AS project_name,
      p.project_type
    FROM forecast_allocations fa
    LEFT JOIN projects p ON p.id = fa.project_id
    WHERE fa.week_start >= $1
      AND fa.week_start <= $2
      AND fa.allocation_status NOT IN ('available', 'Available')
    ORDER BY fa.allocation_pct DESC
    LIMIT 5000
  `, [addDays(weekStart, -7), addDays(weekStart, 7)])

  // Reshape: employee_id here is the UUID (matches employees.id used as internalId in the map below)
  const allocRows = (allocRowsFlat ?? []).map((a: any) => ({
    employee_id: a.employee_id,
    allocation_pct: a.allocation_pct,
    allocation_status: a.allocation_status,
    week_start: a.week_start,
    projects: a.project_name ? { name: a.project_name, project_type: a.project_type ?? '' } : null,
  }))

  type ProjectEntry = { name: string; allocPct: number; status: string; projectType: string }
  const allocMap = new Map<string, ProjectEntry[]>()
  for (const a of allocRows as any[]) {
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
      department: (r.department_id ? r.departments?.name : null) ?? r.employees?.departments?.name ?? '',
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
      chargeabilityPct: r.available_hours > 0 ? Number((r.chargeable_hours / r.available_hours * 100).toFixed(1)) : 0,
      compliancePct: r.available_hours > 0 ? Number((r.total_hours / r.available_hours * 100).toFixed(1)) : 0,
      currentProjects: allocMap.get(internalId) ?? [],
    }
  })

  return NextResponse.json({ period: currentPeriod, availablePeriods, employees, weekRange: { start: weekStart, end: weekEnd } })
})
