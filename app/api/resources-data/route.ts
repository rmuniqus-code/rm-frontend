import { NextRequest, NextResponse } from 'next/server'
import { query, getDb } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { normalizeSubFunction, isExcluded } from '@/lib/server/sub-function-normalize'
import { matchesDesignationFilter, type DesignationFilter } from '@/lib/designation-filter'

const SELECT_COLS = 'emp_code, employee_name, designation, department, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_client, project_type, engagement_manager, current_em_ep, raw_text, days_mask'
const SELECT_NO_MASK = 'emp_code, employee_name, designation, department, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_client, project_type, engagement_manager, current_em_ep, raw_text'

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
  const designationGroup = (sp.get('designationGroup') ?? 'all') as DesignationFilter

  let defaultFrom = addWeeks(mondayOf(today), -8)
  let defaultTo   = addWeeks(mondayOf(today), 20)

  if (!sp.get('from') || !sp.get('to')) {
    const [minRows, maxRows] = await Promise.all([
      query('SELECT week_start FROM forecast_allocations ORDER BY week_start ASC LIMIT 1'),
      query('SELECT week_start FROM forecast_allocations ORDER BY week_start DESC LIMIT 1'),
    ])
    if ((minRows as any[])[0]?.week_start) defaultFrom = (minRows as any[])[0].week_start
    if ((maxRows as any[])[0]?.week_start) defaultTo   = (maxRows as any[])[0].week_start
  }

  const fromISO = sp.get('from') ?? defaultFrom
  const toISO   = sp.get('to')   ?? defaultTo

  // Try fetching with days_mask; fall back if the column doesn't exist in the view yet
  let allRows: any[]
  let viewHasMask = true

  try {
    allRows = await query(
      `SELECT ${SELECT_COLS} FROM v_resource_allocation_grid
       WHERE week_start >= $1 AND week_start <= $2
       ORDER BY week_start ASC`,
      [fromISO, toISO],
    )
  } catch (err: any) {
    if (err?.message?.includes('days_mask') || err?.code === '42703') {
      viewHasMask = false
      allRows = await query(
        `SELECT ${SELECT_NO_MASK} FROM v_resource_allocation_grid
         WHERE week_start >= $1 AND week_start <= $2
         ORDER BY week_start ASC`,
        [fromISO, toISO],
      )
    } else {
      return NextResponse.json({ error: err?.message ?? 'Query failed' }, { status: 500 })
    }
  }

  if (allRows.length === 0) {
    return new NextResponse(JSON.stringify({ rows: [], fromISO, toISO }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  // When the view doesn't expose days_mask, fetch partial-week masks directly from
  // forecast_allocations (only rows with days_mask < 31 need patching; full weeks default to 31).
  let maskMap = new Map<string, number>()
  if (!viewHasMask) {
    const partialRows = await query(
      `SELECT fa.week_start, fa.days_mask, e.employee_id AS emp_code, p.name AS project_name
       FROM forecast_allocations fa
       INNER JOIN employees e ON e.id = fa.employee_id
       LEFT JOIN projects p ON p.id = fa.project_id
       WHERE fa.week_start >= $1 AND fa.week_start <= $2
         AND fa.days_mask > 0 AND fa.days_mask < 31`,
      [fromISO, toISO],
    )
    for (const r of partialRows as any[]) {
      if (r.emp_code) maskMap.set(`${r.emp_code}::${r.week_start}::${r.project_name ?? ''}`, r.days_mask as number)
    }
  }

  const [skillRows, empMetaRows] = await Promise.all([
    query('SELECT emp_code, primary_skill, secondary_skills FROM v_employee_skills'),
    query(
      `SELECT emp_code, region, department, sub_function, employee_status, designation
       FROM v_employee_details
       WHERE is_active = true`,
    ),
  ])

  const skillsMap: Record<string, { primary: string; secondary: string[] }> = {}
  for (const s of skillRows as any[]) {
    if (s.emp_code) {
      skillsMap[s.emp_code] = {
        primary: s.primary_skill ?? '',
        secondary: Array.isArray(s.secondary_skills) ? s.secondary_skills.filter(Boolean) : [],
      }
    }
  }

  const empRegionMap: Record<string, any> = {}
  for (const row of empMetaRows as any[]) {
    if (row.emp_code && !isExcluded(row.department, row.sub_function) && matchesDesignationFilter(row.designation, designationGroup)) {
      empRegionMap[row.emp_code] = {
        region: row.region ?? '',
        department: row.department ?? '',
        subFunction: normalizeSubFunction(row.sub_function ?? ''),
        employeeStatus: row.employee_status ?? '',
      }
    }
  }

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
