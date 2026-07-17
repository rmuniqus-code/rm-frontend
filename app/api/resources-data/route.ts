import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'
import { matchesDesignationFilter, type DesignationFilter } from '@/lib/designation-filter'

const SELECT_COLS = 'emp_code,employee_name,designation,department,sub_function,location,week_start,allocation_pct,allocation_status,project_name,project_client,project_type,engagement_manager,current_em_ep,raw_text,days_mask'
const PAGE_SIZE = 1000

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return toLocalISO(d)
}

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const today = new Date()
  const sb = getSupabase()
  const designationGroup = (sp.get('designationGroup') ?? 'all') as DesignationFilter

  let defaultFrom = addWeeks(mondayOf(today), -8)
  let defaultTo   = addWeeks(mondayOf(today), 20)

  if (!sp.get('from') || !sp.get('to')) {
    const [{ data: minRow }, { data: maxRow }] = await Promise.all([
      sb.from('forecast_allocations').select('week_start').order('week_start', { ascending: true  }).limit(1),
      sb.from('forecast_allocations').select('week_start').order('week_start', { ascending: false }).limit(1),
    ])
    if ((minRow as any)?.[0]?.week_start) defaultFrom = (minRow as any)[0].week_start
    if ((maxRow as any)?.[0]?.week_start) defaultTo   = (maxRow as any)[0].week_start
  }

  const fromISO = sp.get('from') ?? defaultFrom
  const toISO   = sp.get('to')   ?? defaultTo

  const { count, error: countError } = await sb.from('v_resource_allocation_grid')
    .select('*', { count: 'exact', head: true })
    .gte('week_start', fromISO).lte('week_start', toISO)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  const totalRows = count ?? 0

  if (totalRows === 0) {
    return new NextResponse(JSON.stringify({ rows: [], fromISO, toISO }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  const pageCount = Math.ceil(totalRows / PAGE_SIZE)

  // Try selecting days_mask from view (requires migration 012). If the view doesn't have
  // that column yet, fall back to SELECT_COLS without it and patch masks separately.
  const SELECT_NO_MASK = SELECT_COLS.replace(',days_mask', '')
  const testPage = await sb.from('v_resource_allocation_grid').select(SELECT_COLS)
    .gte('week_start', fromISO).lte('week_start', toISO)
    .order('week_start', { ascending: true })
    .range(0, PAGE_SIZE - 1)

  const viewHasMask = !testPage.error

  const pages = viewHasMask
    ? [testPage, ...await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) =>
          sb.from('v_resource_allocation_grid').select(SELECT_COLS)
            .gte('week_start', fromISO).lte('week_start', toISO)
            .order('week_start', { ascending: true })
            .range((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1),
        ),
      )]
    : await Promise.all(
        Array.from({ length: pageCount }, (_, i) =>
          sb.from('v_resource_allocation_grid').select(SELECT_NO_MASK)
            .gte('week_start', fromISO).lte('week_start', toISO)
            .order('week_start', { ascending: true })
            .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
        ),
      )

  const firstError = pages.find(p => p.error)
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 })

  const allRows = pages.flatMap(p => (p.data ?? []) as any[])

  // When the view doesn't expose days_mask, fetch partial-week masks directly from
  // forecast_allocations (only rows with days_mask < 31 need patching; full weeks default to 31).
  let maskMap = new Map<string, number>()
  if (!viewHasMask) {
    const { data: partialRows } = await sb
      .from('forecast_allocations')
      .select('week_start, days_mask, employees!inner(employee_id), projects(name)')
      .gte('week_start', fromISO)
      .lte('week_start', toISO)
      .gt('days_mask', 0)
      .lt('days_mask', 31)
    for (const r of partialRows ?? []) {
      const empCode = (r as any).employees?.employee_id as string | undefined
      const projName = ((r as any).projects?.name ?? '') as string
      if (empCode) maskMap.set(`${empCode}::${r.week_start}::${projName}`, (r as any).days_mask as number)
    }
  }

  const [{ data: skillRows }, { data: empMetaRows }] = await Promise.all([
    sb.from('v_employee_skills').select('emp_code,primary_skill,secondary_skills'),
    sb.from('v_employee_details').select('emp_code,region,department,sub_function,employee_status,designation').eq('is_active', true),
  ])

  const skillsMap: Record<string, { primary: string; secondary: string[] }> = {}
  for (const s of skillRows ?? []) {
    if ((s as any).emp_code) {
      skillsMap[(s as any).emp_code] = { primary: (s as any).primary_skill ?? '', secondary: Array.isArray((s as any).secondary_skills) ? (s as any).secondary_skills.filter(Boolean) : [] }
    }
  }

  const empRegionMap: Record<string, any> = {}
  for (const row of empMetaRows ?? []) {
    const r = row as any
    if (r.emp_code && !isExcluded(r.department, r.sub_function) && matchesDesignationFilter(r.designation, designationGroup)) {
      empRegionMap[r.emp_code] = { region: r.region ?? '', department: r.department ?? '', subFunction: normalizeSubFunction(r.sub_function ?? ''), employeeStatus: r.employee_status ?? '' }
    }
  }

  // Only include rows for employees that passed the designation filter (empRegionMap already filtered)
  const allowedEmpCodes = new Set(Object.keys(empRegionMap))

  const normalizedRows = allRows
    .filter((r: any) => !isExcluded(r.department, r.sub_function) && (designationGroup === 'all' || allowedEmpCodes.has(r.emp_code)))
    .map((r: any) => {
      const base = { ...r, sub_function: normalizeSubFunction(r.sub_function) }
      if (!viewHasMask && maskMap.size > 0) {
        const key = `${r.emp_code}::${r.week_start}::${r.project_name ?? ''}`
        const mask = maskMap.get(key)
        if (mask !== undefined) base.days_mask = mask
      }
      return base
    })

  return new NextResponse(JSON.stringify({ rows: normalizedRows, skills: skillsMap, empMeta: empRegionMap, fromISO, toISO }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
})
