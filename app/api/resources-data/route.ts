import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'

const SELECT_COLS = 'emp_code,employee_name,designation,department,sub_function,location,week_start,allocation_pct,allocation_status,project_name,project_client,project_type,engagement_manager,current_em_ep,raw_text'
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
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300' },
    })
  }

  const pageCount = Math.ceil(totalRows / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      sb.from('v_resource_allocation_grid').select(SELECT_COLS)
        .gte('week_start', fromISO).lte('week_start', toISO)
        .order('week_start', { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  )

  const firstError = pages.find(p => p.error)
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 })

  const allRows = pages.flatMap(p => p.data ?? [])

  const [{ data: skillRows }, { data: empMetaRows }] = await Promise.all([
    sb.from('v_employee_skills').select('emp_code,primary_skill,secondary_skills'),
    sb.from('v_employee_details').select('emp_code,region,department,sub_function,employee_status').eq('is_active', true),
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
    if (r.emp_code && !isExcluded(r.department, r.sub_function)) {
      empRegionMap[r.emp_code] = { region: r.region ?? '', department: r.department ?? '', subFunction: normalizeSubFunction(r.sub_function ?? ''), employeeStatus: r.employee_status ?? '' }
    }
  }

  const normalizedRows = allRows
    .filter((r: any) => !isExcluded(r.department, r.sub_function))
    .map((r: any) => ({ ...r, sub_function: normalizeSubFunction(r.sub_function) }))

  return new NextResponse(JSON.stringify({ rows: normalizedRows, skills: skillsMap, empMeta: empRegionMap, fromISO, toISO }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300' },
  })
})
